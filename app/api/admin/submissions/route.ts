import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { BUCKET, MAX_FILE_BYTES, MIME, convertPptxToPdf, downloadBytes, extOf, signedUploadUrl, submissionPath, uploadBytes } from '@/lib/server/storage'
import { SIZE_ERROR } from '@/components/company/rules'
import { acceptOf, safeFileName } from '@/app/c/_lib/server'
import type { RequiredFile, Submission } from '@/lib/types'

// 운영팀 대리 업로드 (A-05). 참가팀이 메일로 보낸 자료를 운영팀이 검수 후 대신 올린다.
//  · action=ticket   → 서명 업로드 URL 발급 (기업 업로드와 같은 경로·버전 규칙)
//  · action=complete → 제출 기록(이전 버전 보관) + PPTX→PDF 변환 + 감사로그
// 기업 업로드와 달리 접수 기간 제한을 두지 않는다 (마감 후 운영팀이 정리해 올리는 경우).
export const maxDuration = 120

const base = { entry_id: z.guid(), file_type: z.string().min(1).max(50), file_name: z.string().min(1).max(255), size: z.number().int().nonnegative() }
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ticket'), ...base }),
  z.object({ action: z.literal('complete'), path: z.string().min(1).max(500), ...base }),
])

type Entry = { id: string; stage_id: string; company_id: string; stages: { program_id: string; status: string; required_files: RequiredFile[] } | null }

export const POST = handle(async (req: Request) => {
  const { supabase } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const body = parsed.data
  const admin = supabaseAdmin()

  const { data } = await supabase.from('stage_entries')
    .select('id, stage_id, company_id, stages(program_id, status, required_files)').eq('id', body.entry_id).maybeSingle()
  const entry = data as unknown as Entry | null
  if (!entry?.stages) throw new ApiError(404, '참가 기록을 찾을 수 없습니다.')
  if (entry.stages.status === 'locked' || entry.stages.status === 'published') throw new ApiError(409, '확정된 단계에는 업로드할 수 없습니다.')
  const slot = (entry.stages.required_files ?? []).find(f => f.type === body.file_type)
  if (!slot) throw new ApiError(400, '제출 항목을 찾을 수 없습니다.')
  if (body.size > MAX_FILE_BYTES) throw new ApiError(400, SIZE_ERROR)
  if (body.size === 0) throw new ApiError(400, '빈 파일은 업로드할 수 없습니다.')
  const programId = entry.stages.program_id
  const dir = `${programId}/${entry.stage_id}/${entry.company_id}`
  const prefix = `${slot.type}_v`

  if (body.action === 'ticket') {
    const ext = extOf(body.file_name)
    const accept = acceptOf(slot)
    if (!accept.includes(ext)) throw new ApiError(400, `${slot.label}은(는) ${accept.map(a => a.toUpperCase()).join('·')} 파일만 올릴 수 있습니다.`)
    const [{ data: last }, { data: objects }] = await Promise.all([
      admin.from('submissions').select('version').eq('entry_id', entry.id).eq('file_type', slot.type).order('version', { ascending: false }).limit(1),
      admin.storage.from(BUCKET).list(dir, { search: prefix, limit: 1000 }),
    ])
    const storedMax = Math.max(0, ...(objects ?? []).filter(o => o.name.startsWith(prefix))
      .map(o => Number(o.name.slice(prefix.length).match(/^(\d+)\./)?.[1] ?? 0)))
    const version = Math.max((last?.[0]?.version as number | undefined) ?? 0, storedMax) + 1
    const path = submissionPath({ programId, stageId: entry.stage_id, companyId: entry.company_id, fileType: slot.type, version, ext })
    const signed = await signedUploadUrl(path)
    return NextResponse.json({ path: signed.path ?? path, token: signed.token, signedUrl: signed.signedUrl, contentType: MIME[ext], version })
  }

  // complete
  const m = body.path.startsWith(`${dir}/${prefix}`) ? body.path.slice(`${dir}/${prefix}`.length).match(/^(\d+)\.([a-z0-9]+)$/) : null
  if (!m) throw new ApiError(400, '잘못된 파일 경로입니다.')
  const version = Number(m[1])
  const ext = m[2]
  const { data: dup } = await admin.from('submissions').select('*').eq('storage_path', body.path).maybeSingle()
  if (dup) return NextResponse.json(dup)

  const fileBase = body.path.slice(body.path.lastIndexOf('/') + 1)
  const { data: objects, error: listError } = await admin.storage.from(BUCKET).list(dir, { search: fileBase, limit: 20 })
  if (listError) throw listError
  const obj = objects?.find(o => o.name === fileBase)
  if (!obj) throw new ApiError(400, '업로드된 파일을 찾을 수 없습니다. 다시 업로드해 주세요.')
  const realSize = Number((obj.metadata as { size?: number } | null)?.size ?? body.size)
  if (realSize > MAX_FILE_BYTES) {
    await admin.storage.from(BUCKET).remove([body.path])
    throw new ApiError(400, SIZE_ERROR)
  }

  const { data: prev } = await admin.from('submissions').select('id').eq('entry_id', entry.id).eq('file_type', slot.type).eq('is_current', true)
  const prevIds = (prev ?? []).map(p => p.id as string)
  if (prevIds.length) {
    const { error } = await admin.from('submissions').update({ is_current: false }).in('id', prevIds)
    if (error) throw error
  }
  const { data: inserted, error: insertError } = await admin.from('submissions').insert({
    entry_id: entry.id, file_type: slot.type, storage_path: body.path,
    file_name: safeFileName(body.file_name), file_size: realSize, version, is_current: true,
  }).select('*').single()
  if (insertError || !inserted) {
    if (prevIds.length) await admin.from('submissions').update({ is_current: true }).in('id', prevIds)
    throw new ApiError(500, '제출 기록을 저장하지 못했습니다. 다시 시도해 주세요.')
  }
  let row = inserted as Submission

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
    p_action: 'submission.admin_upload', p_table: 'submissions', p_row: row.id,
    p_meta: { stage_id: entry.stage_id, company_id: entry.company_id, file_type: slot.type, version, file_name: row.file_name },
  })
  return NextResponse.json(row)
})
