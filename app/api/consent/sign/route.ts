import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, clientIp, handle, requireApi } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { buildConsentPdf } from '@/lib/server/pdf'
import { parsePngDataUrl } from '@/lib/server/pdf-eval'
import { sha256 } from '@/lib/server/crypto'
import { BUCKET, uploadBytes } from '@/lib/server/storage'
import { CONSENT_CONFLICT_REASON } from '@/lib/consent-conflict'
import type { ConsentTemplate, Judge } from '@/lib/types'

// J-01 동의서 서명 (8-3): 서명 PNG → 문구+서명+서명시각+IP PDF → SHA-256 → Storage + consents
const Body = z.object({
  template_id: z.string().min(1),
  judge_id: z.string().min(1),
  signature: z.string().min(1),
  conflict_declared: z.boolean().nullish(),
  conflict_note: z.string().max(2000).nullish(),
  conflict_company_ids: z.array(z.string().uuid()).max(200).nullish(),
})

export const POST = handle(async (req: Request) => {
  const { user, profile } = await requireApi('judge')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const b = parsed.data
  const admin = supabaseAdmin()

  // 조회는 한 번에 (서명 저장 대기 시간 단축)
  const [{ data: judge }, { data: tpl }, { data: existing }] = await Promise.all([
    admin.from('judges').select('*, programs(title)').eq('id', b.judge_id).eq('user_id', user.id).maybeSingle(),
    admin.from('consent_templates').select('*').eq('id', b.template_id).maybeSingle(),
    admin.from('consents').select('id').eq('judge_id', b.judge_id).eq('template_id', b.template_id).maybeSingle(),
  ])
  if (!judge) throw new ApiError(403, '본인 심사위원 정보가 아닙니다.')
  const t = tpl as ConsentTemplate | null
  const j = judge as Judge
  if (!t || t.program_id !== j.program_id) throw new ApiError(404, '동의서 양식을 찾을 수 없습니다.')
  if (!t.is_active) throw new ApiError(409, '개정된 양식이 있습니다. 새로고침 후 다시 서명하세요.')

  if (existing) throw new ApiError(409, '이미 서명한 동의서입니다.')

  const png = parsePngDataUrl(b.signature)
  if (!png) throw new ApiError(400, '서명 이미지가 올바르지 않습니다.')

  const isConflict = t.kind === 'conflict'
  let conflictDeclared: boolean | null = null
  let conflictNote: string | null = null
  let conflictCompanies: { id: string; name: string }[] = []
  if (isConflict) {
    if (b.conflict_declared == null) throw new ApiError(400, '이해관계 여부를 선택하세요.')
    conflictDeclared = b.conflict_declared
    conflictNote = b.conflict_declared ? (b.conflict_note ?? '').trim() : null
    if (conflictDeclared) {
      const ids = [...new Set(b.conflict_company_ids ?? [])]
      if (!ids.length) throw new ApiError(400, '이해관계가 있는 기업을 고르세요.')
      const { data: cs } = await admin.from('companies').select('id, name').eq('program_id', j.program_id).in('id', ids)
      if ((cs ?? []).length !== ids.length) throw new ApiError(400, '이 프로그램에 등록된 기업만 고를 수 있습니다.')
      conflictCompanies = (cs ?? []) as { id: string; name: string }[]
    }
  }
  const pdfNote = conflictCompanies.length
    ? `해당 기업: ${conflictCompanies.map(c => c.name).join(', ')}${conflictNote ? `
${conflictNote}` : ''}`
    : conflictNote

  const program = (judge as { programs: { title: string } | null }).programs
  const signedAt = new Date().toISOString()
  const ip = clientIp(req)
  const userAgent = req.headers.get('user-agent')
  const pdf = await buildConsentPdf({
    programTitle: program?.title ?? '',
    templateTitle: t.title,
    version: t.version,
    body: t.body,
    judgeName: profile.name || user.email || '',
    signedAt,
    ip,
    userAgent,
    signaturePng: png,
    conflictDeclared,
    conflictNote: pdfNote,
  })
  const docHash = sha256(pdf)
  const base = `consents/${j.id}/${t.id}_v${t.version}`

  // 행을 먼저 만든다: unique(judge_id, template_id) 가 동시 요청에서도 서명본 덮어쓰기를 막는다
  const { data: row, error } = await admin.from('consents').insert({
    judge_id: j.id,
    template_id: t.id,
    signature_path: `${base}.png`,
    signed_pdf_path: `${base}.pdf`,
    signed_at: signedAt,
    ip,
    user_agent: userAgent,
    doc_hash: docHash,
    conflict_declared: conflictDeclared,
    conflict_note: conflictNote,
    ...(conflictCompanies.length ? { conflict_company_ids: conflictCompanies.map(c => c.id) } : {}),
  }).select('id').single()
  if (error) {
    if (error.code === '23505') throw new ApiError(409, '이미 서명한 동의서입니다.')
    if (/conflict_company_ids/.test(error.message)) throw new ApiError(503, '이해관계 기업 선택 기능의 DB 설정이 아직 적용되지 않았습니다. 운영사무국에 문의해 주세요.')
    throw new Error(error.message)
  }

  try {
    await Promise.all([uploadBytes(`${base}.png`, png, 'image/png'), uploadBytes(`${base}.pdf`, pdf, 'application/pdf')])
  } catch (e) {
    await admin.from('consents').delete().eq('id', row.id)
    await admin.storage.from(BUCKET).remove([`${base}.png`, `${base}.pdf`])
    throw e
  }

  // 이미 배정된 해당 기업은 바로 제외 (나중에 배정되는 것은 DB 트리거가 제외)
  if (conflictCompanies.length) {
    await admin.from('assignments')
      .update({ conflict: true, conflict_reason: `${CONSENT_CONFLICT_REASON}${conflictNote ? `: ${conflictNote}` : ''}`, conflict_reported_at: signedAt })
      .eq('judge_id', j.id).eq('conflict', false).in('company_id', conflictCompanies.map(c => c.id))
  }

  return NextResponse.json({ ok: true, id: row.id, signed_at: signedAt, doc_hash: docHash })
})
