import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { BUCKET, extOf, signedUploadUrl } from '@/lib/server/storage'
import { loadMyPayments } from '../load'

// J-08 정산 증빙 (신분증·통장 사본) 업로드: 서명 URL 발급(ticket) → 브라우저가 비공개 버킷에 직접 업로드 → 기록(attach)
// 경로: payments/{judge_id}/{kind}_{시각}.{ext} — 열람은 정산 권한자만 (/api/payments/:id/doc)
export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = ['pdf', 'png', 'jpg', 'jpeg']
const KIND = { id_card: 'id_card_path', bank_copy: 'bank_copy_path' } as const
const LABEL = { id_card: '신분증 사본', bank_copy: '통장 사본' } as const

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ticket'), judge_id: z.string().min(1), kind: z.enum(['id_card', 'bank_copy']), file_name: z.string().min(1).max(255), size: z.number().int().positive() }),
  z.object({ action: z.literal('attach'), consent: z.literal(true), judge_id: z.string().min(1), kind: z.enum(['id_card', 'bank_copy']), path: z.string().min(1).max(500) }),
])

export const POST = handle(async (req: Request) => {
  const { user } = await requireApi('judge')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const b = parsed.data
  const admin = supabaseAdmin()
  const { data: judge } = await admin.from('judges').select('id, program_id').eq('id', b.judge_id).eq('user_id', user.id).maybeSingle()
  if (!judge) throw new ApiError(403, '본인 심사위원 정보가 아닙니다.')
  const dir = `payments/${judge.id}/`

  if (b.action === 'ticket') {
    const ext = extOf(b.file_name)
    if (!ACCEPT.includes(ext)) throw new ApiError(400, `${LABEL[b.kind]}은(는) PDF·PNG·JPG 파일만 올릴 수 있습니다.`)
    if (b.size > MAX_BYTES) throw new ApiError(400, '파일은 10MB 이하로 올려 주세요.')
    const path = `${dir}${b.kind}_${Date.now()}.${ext}`
    const signed = await signedUploadUrl(path)
    return NextResponse.json({ path: signed.path ?? path, token: signed.token })
  }

  // attach: 본인 폴더의 실제 업로드된 파일만 기록
  if (!b.path.startsWith(`${dir}${b.kind}_`) || b.path.includes('..')) throw new ApiError(400, '잘못된 파일 경로입니다.')
  const name = b.path.slice(dir.length)
  const { data: objs } = await admin.storage.from(BUCKET).list(`payments/${judge.id}`, { search: name, limit: 5 })
  if (!(objs ?? []).some(o => o.name === name)) throw new ApiError(400, '업로드된 파일을 찾을 수 없습니다. 다시 올려 주세요.')

  const col = KIND[b.kind]
  const { data: existing } = await admin.from('judge_payments').select(`id, consent_at, ${col}`).eq('judge_id', judge.id).maybeSingle()
  const prev = (existing as Record<string, string | null> | null)?.[col] ?? null
  const { error } = await admin.from('judge_payments').upsert({
    judge_id: judge.id, program_id: judge.program_id, [col]: b.path,
    consent_at: (existing as { consent_at: string | null } | null)?.consent_at ?? new Date().toISOString(),
  }, { onConflict: 'judge_id', defaultToNull: false })
  if (error) throw new Error(error.message)
  // 바꾼 경우 이전 파일 삭제 (사본은 하나만 보관)
  if (prev && prev !== b.path) await admin.storage.from(BUCKET).remove([prev]).then(() => null, () => null)
  return NextResponse.json({ ok: true, items: await loadMyPayments(user.id) })
})
