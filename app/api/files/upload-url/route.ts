import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { BUCKET, MAX_FILE_BYTES, MIME, extOf, signedUploadUrl, submissionPath } from '@/lib/server/storage'
import { EVIDENCE_EXT, SIZE_ERROR, appealWindow, submitWindow } from '@/components/company/rules'
import { acceptOf, myEntryById, myEntryByStage, slotOf } from '@/app/c/_lib/server'
import type { ApplicationField } from '@/lib/types'

// 기업 업로드용 서명 URL 발급 (9장 /api/files/upload-url). 단계 상태·기간·형식·용량·소유를 검증한다.
const base = { file_name: z.string().min(1).max(255), size: z.number().int().nonnegative() }
const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('submission'), stage_id: z.guid(), file_type: z.string().min(1).max(50), ...base }),
  z.object({ kind: z.literal('application'), field_id: z.guid(), ...base }),
  z.object({ kind: z.literal('bonus'), entry_id: z.guid(), rule_id: z.guid().optional(), ...base }),
  z.object({ kind: z.literal('appeal'), entry_id: z.guid(), ...base }),
])

function checkSize(size: number) {
  if (size > MAX_FILE_BYTES) throw new ApiError(400, SIZE_ERROR)
  if (size === 0) throw new ApiError(400, '빈 파일은 업로드할 수 없습니다.')
}

function checkEvidenceExt(ext: string) {
  if (!(EVIDENCE_EXT as readonly string[]).includes(ext)) {
    throw new ApiError(400, `${EVIDENCE_EXT.map(e => e.toUpperCase()).join('·')} 파일만 업로드할 수 있습니다.`)
  }
}

async function ticket(path: string, ext: string, extra: Record<string, unknown> = {}) {
  const signed = await signedUploadUrl(path)
  return NextResponse.json({ path: signed.path ?? path, token: signed.token, signedUrl: signed.signedUrl, contentType: MIME[ext], ...extra })
}

export const POST = handle(async (req: Request) => {
  const { supabase } = await requireApi('company')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const body = parsed.data
  checkSize(body.size)
  const ext = extOf(body.file_name)
  const ts = Date.now()

  if (body.kind === 'submission') {
    const entry = await myEntryByStage(supabase, body.stage_id)
    const win = submitWindow(entry)
    if (!win.open) throw new ApiError(403, win.reason!)
    const slot = slotOf(entry, body.file_type)
    const accept = acceptOf(slot)
    if (!accept.includes(ext)) {
      throw new ApiError(400, `${slot.label}은(는) ${accept.map(a => a.toUpperCase()).join('·')} 파일만 제출할 수 있습니다.`)
    }
    // 다음 버전 = max(기록된 버전, 완료 통보 없이 남은 업로드 객체의 버전) + 1
    const admin = supabaseAdmin()
    const dir = `${entry.program_id}/${entry.stage_id}/${entry.company_id}`
    const [{ data: last }, { data: objects }] = await Promise.all([
      admin.from('submissions').select('version').eq('entry_id', entry.entry_id).eq('file_type', slot.type)
        .order('version', { ascending: false }).limit(1),
      admin.storage.from(BUCKET).list(dir, { search: `${slot.type}_v`, limit: 1000 }),
    ])
    const prefix = `${slot.type}_v`
    const storedMax = Math.max(0, ...(objects ?? [])
      .filter(o => o.name.startsWith(prefix))
      .map(o => Number(o.name.slice(prefix.length).match(/^(\d+)\./)?.[1] ?? 0)))
    const version = Math.max((last?.[0]?.version as number | undefined) ?? 0, storedMax) + 1
    const path = submissionPath({ programId: entry.program_id, stageId: entry.stage_id, companyId: entry.company_id, fileType: slot.type, version, ext })
    return ticket(path, ext, { version })
  }

  checkEvidenceExt(ext)

  if (body.kind === 'application') {
    const { data: field } = await supabase.from('application_fields').select('*').eq('id', body.field_id).maybeSingle()
    const f = field as ApplicationField | null
    if (!f || f.type !== 'file') throw new ApiError(404, '첨부 항목을 찾을 수 없습니다.')
    const { data: company } = await supabase.from('companies').select('id').eq('program_id', f.program_id).limit(1)
    const companyId = company?.[0]?.id as string | undefined
    if (!companyId) throw new ApiError(403, '권한이 없습니다.')
    const { data: canEdit } = await supabase.rpc('company_can_edit_application', { p_company_id: companyId })
    if (!canEdit) throw new ApiError(403, '신청서 수정 기간이 아닙니다.')
    return ticket(`${f.program_id}/application/${companyId}/${f.id}_${ts}.${ext}`, ext)
  }

  const entry = await myEntryById(supabase, body.entry_id)

  if (body.kind === 'bonus') {
    if (entry.stage_status === 'locked' || entry.stage_status === 'published') {
      throw new ApiError(403, '확정된 단계에는 가점 증빙을 제출할 수 없습니다.')
    }
    if (body.rule_id) {
      const { data: rule } = await supabase.from('bonus_rules').select('id').eq('id', body.rule_id).eq('stage_id', entry.stage_id).maybeSingle()
      if (!rule) throw new ApiError(404, '가점 항목을 찾을 수 없습니다.')
    }
    return ticket(`${entry.program_id}/bonus/${entry.entry_id}/${body.rule_id ?? 'evidence'}_${ts}.${ext}`, ext)
  }

  // appeal
  const win = appealWindow(entry)
  if (!win.open) throw new ApiError(403, win.reason!)
  const { data: existing } = await supabase.from('appeals').select('id').eq('entry_id', entry.entry_id).limit(1)
  if (existing?.length) throw new ApiError(409, '이미 이의신청을 접수했습니다. 단계별 1회만 신청할 수 있습니다.')
  return ticket(`${entry.program_id}/appeals/${entry.entry_id}/${ts}.${ext}`, ext)
})
