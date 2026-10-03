import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { emitEvent } from '@/lib/server/n8n'
import { supabaseAdmin } from '@/lib/supabase/server'
import { BUCKET, MAX_FILE_BYTES, MIME, convertPptxToPdf, downloadBytes, uploadBytes } from '@/lib/server/storage'
import { SIZE_ERROR, submitWindow } from '@/components/company/rules'
import { acceptOf, myEntryByStage, safeFileName, slotOf } from '@/app/c/_lib/server'
import type { Submission } from '@/lib/types'

// 업로드 완료 통보 → 제출 기록(버전 보관) + PPTX→PDF 변환 + 제출 확인 메일(n8n)
export const maxDuration = 120

const Body = z.object({
  kind: z.literal('submission'),
  stage_id: z.guid(),
  file_type: z.string().min(1).max(50),
  path: z.string().min(1).max(500),
  file_name: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
})

export const POST = handle(async (req: Request) => {
  const { supabase, user } = await requireApi('company')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const body = parsed.data
  const admin = supabaseAdmin()

  const entry = await myEntryByStage(supabase, body.stage_id)
  const slot = slotOf(entry, body.file_type)

  // 경로가 이 기업·단계·항목의 규칙과 일치하는지 ({program}/{stage}/{company}/{type}_v{n}.{ext})
  const prefix = `${entry.program_id}/${entry.stage_id}/${entry.company_id}/${slot.type}_v`
  const m = body.path.startsWith(prefix) ? body.path.slice(prefix.length).match(/^(\d+)\.([a-z0-9]+)$/) : null
  if (!m) throw new ApiError(400, '잘못된 파일 경로입니다.')
  const version = Number(m[1])
  const ext = m[2]
  if (!acceptOf(slot).includes(ext)) throw new ApiError(400, '허용되지 않는 파일 형식입니다.')

  // 이미 기록된 경로면 그대로 반환 (중복 호출)
  const { data: dup } = await admin.from('submissions').select('*').eq('storage_path', body.path).maybeSingle()
  if (dup) return NextResponse.json(dup)
  const { data: newer } = await admin.from('submissions').select('id')
    .eq('entry_id', entry.entry_id).eq('file_type', slot.type).gte('version', version).limit(1)
  if (newer?.length) throw new ApiError(409, '더 최신 버전이 이미 제출되어 있습니다. 새로 고침 후 다시 업로드해 주세요.')

  // 업로드된 객체 확인
  const dir = body.path.slice(0, body.path.lastIndexOf('/'))
  const base = body.path.slice(body.path.lastIndexOf('/') + 1)
  const { data: objects, error: listError } = await admin.storage.from(BUCKET).list(dir, { search: base, limit: 20 })
  if (listError) throw listError
  const obj = objects?.find(o => o.name === base)
  if (!obj) throw new ApiError(400, '업로드된 파일을 찾을 수 없습니다. 다시 업로드해 주세요.')
  const realSize = Number((obj.metadata as { size?: number } | null)?.size ?? body.size)
  if (realSize > MAX_FILE_BYTES) {
    await admin.storage.from(BUCKET).remove([body.path])
    throw new ApiError(400, SIZE_ERROR)
  }

  // 기간 재확인 (Q2). 업로드가 마감 전에 끝났다면 완료 통보가 조금 늦어도 인정한다.
  const uploadedAt = obj.created_at ? new Date(obj.created_at) : new Date()
  const now = new Date()
  const win = submitWindow(entry, uploadedAt < now ? uploadedAt : now)
  if (!win.open) {
    await admin.storage.from(BUCKET).remove([body.path])
    throw new ApiError(403, win.reason!)
  }

  // 이전 버전 is_current 해제 → 새 버전 기록 (이전 파일은 보관)
  const { data: prev } = await admin.from('submissions').select('id')
    .eq('entry_id', entry.entry_id).eq('file_type', slot.type).eq('is_current', true)
  const prevIds = (prev ?? []).map(p => p.id as string)
  if (prevIds.length) {
    const { error } = await admin.from('submissions').update({ is_current: false }).in('id', prevIds)
    if (error) throw error
  }
  const { data: inserted, error: insertError } = await admin.from('submissions').insert({
    entry_id: entry.entry_id,
    file_type: slot.type,
    storage_path: body.path,
    file_name: safeFileName(body.file_name),
    file_size: realSize,
    version,
    is_current: true,
  }).select('*').single()
  if (insertError || !inserted) {
    if (prevIds.length) await admin.from('submissions').update({ is_current: true }).in('id', prevIds)
    throw new ApiError(500, '제출 기록을 저장하지 못했습니다. 다시 시도해 주세요.')
  }
  let row = inserted as Submission

  // PPTX → PDF 변환본 (뷰어 호환, 8-4). 실패해도 제출은 유지
  if (ext === 'pptx') {
    try {
      const pdf = await convertPptxToPdf(await downloadBytes(body.path), row.file_name)
      if (pdf) {
        const pdfPath = body.path.replace(/\.pptx$/, '.pdf')
        await uploadBytes(pdfPath, pdf, MIME.pdf)
        const { data: updated } = await admin.from('submissions').update({ pdf_path: pdfPath }).eq('id', row.id).select('*').single()
        if (updated) row = updated as Submission
      }
    } catch (e) {
      console.error('[pptx→pdf]', row.id, e)
    }
  }

  await supabase.rpc('log_event', {
    p_action: 'submission.upload', p_table: 'submissions', p_row: row.id,
    p_meta: { stage_id: entry.stage_id, file_type: slot.type, version, file_name: row.file_name },
  })

  // 제출 확인 메일 (n8n)
  const [{ data: company }, { data: program }, { data: current }] = await Promise.all([
    admin.from('companies').select('name, contact_email').eq('id', entry.company_id).single(),
    admin.from('programs').select('title').eq('id', entry.program_id).single(),
    admin.from('submissions').select('file_type, file_name, version, created_at').eq('entry_id', entry.entry_id).eq('is_current', true),
  ])
  const files = entry.required_files.map(f => {
    const s = (current ?? []).find(c => c.file_type === f.type)
    return { type: f.type, label: f.label, required: f.required, submitted: !!s, file_name: s?.file_name ?? null, version: s?.version ?? null, submitted_at: s?.created_at ?? null }
  })
  await emitEvent('submission.completed', {
    company_id: entry.company_id,
    company_name: company?.name ?? '',
    email: company?.contact_email || user.email,
    program_id: entry.program_id,
    program_title: program?.title ?? '',
    stage_id: entry.stage_id,
    stage_name: entry.stage_name,
    submit_end: entry.submit_end,
    file: { type: slot.type, label: slot.label, file_name: row.file_name, version, submitted_at: row.created_at },
    files,
    all_required_submitted: files.every(f => !f.required || f.submitted),
  })

  return NextResponse.json(row)
})
