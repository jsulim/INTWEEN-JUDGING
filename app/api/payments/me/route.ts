import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { encrypt } from '@/lib/server/crypto'
import { loadMyPayments } from './load'

// J-08 수당 지급 정보 (4-1 정산, 2차): 별도 동의 + 계좌·주민등록번호 AES-256-GCM 암호화 저장
// 입력은 서버에서만 (judge_payments 에 심사위원 쓰기 정책 없음 → 본인 확인 후 서비스 롤로 저장)
export const GET = handle(async () => {
  const { user } = await requireApi('judge')
  return NextResponse.json({ items: await loadMyPayments(user.id) })
})

const digits = (s: string) => s.replace(/\D/g, '')
const Body = z.object({
  judge_id: z.string().min(1),
  consent: z.literal(true, { message: '수당 지급을 위한 개인정보 수집·이용에 동의해야 합니다.' }),
  bank_name: z.string().trim().min(1, '은행을 입력하세요.').max(40),
  holder: z.string().trim().min(1, '예금주를 입력하세요.').max(40),
  account: z.string().trim().max(40).optional(), // 비워 두면 기존 값 유지
  rrn: z.string().trim().max(20).optional(),
})

function validRrn(d: string) {
  if (!/^\d{13}$/.test(d)) return false
  const mm = Number(d.slice(2, 4))
  const dd = Number(d.slice(4, 6))
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && /[1-8]/.test(d[6])
}

export const POST = handle(async (req: Request) => {
  const { user } = await requireApi('judge')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '요청 형식이 올바르지 않습니다.')
  const b = parsed.data
  const admin = supabaseAdmin()

  const { data: judge } = await admin.from('judges').select('id, program_id').eq('id', b.judge_id).eq('user_id', user.id).maybeSingle()
  if (!judge) throw new ApiError(403, '본인 심사위원 정보가 아닙니다.')
  const { data: existing } = await admin.from('judge_payments').select('id, bank_enc, rrn_enc, consent_at').eq('judge_id', judge.id).maybeSingle()

  const acc = b.account ? b.account.replace(/[\s-]/g, '') : ''
  const rrn = b.rrn ? digits(b.rrn) : ''
  if (acc && !/^\d{6,20}$/.test(acc)) throw new ApiError(400, '계좌번호는 숫자 6~20자리로 입력하세요.')
  if (rrn && !validRrn(rrn)) throw new ApiError(400, '주민등록번호 13자리를 정확히 입력하세요.')
  if (!acc && !existing?.bank_enc) throw new ApiError(400, '계좌번호를 입력하세요.')
  if (!rrn && !existing?.rrn_enc) throw new ApiError(400, '주민등록번호를 입력하세요.')

  const row: Record<string, unknown> = {
    judge_id: judge.id,
    program_id: judge.program_id,
    bank_name: b.bank_name,
    holder: b.holder,
    consent_at: existing?.consent_at ?? new Date().toISOString(),
  }
  if (acc) row.bank_enc = encrypt(acc)
  if (rrn) row.rrn_enc = encrypt(`${rrn.slice(0, 6)}-${rrn.slice(6)}`)

  const { error } = await admin.from('judge_payments').upsert(row, { onConflict: 'judge_id', defaultToNull: false })
  if (error) throw new Error(error.message)
  return NextResponse.json({ ok: true, items: await loadMyPayments(user.id) })
})
