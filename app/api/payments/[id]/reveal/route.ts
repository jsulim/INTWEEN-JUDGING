import { NextResponse } from 'next/server'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { decrypt } from '@/lib/server/crypto'
import type { JudgePayment } from '@/lib/types'

export const runtime = 'nodejs'

// POST /api/payments/:id/reveal — 정산 권한자(profiles.can_pay)만 계좌·주민등록번호 복호화 + 열람 로그 (Q17)
export const POST = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  const { supabase, profile } = await requireApi('admin')
  if (!profile.can_pay) throw new ApiError(403, '정산 권한자만 개인정보를 열람할 수 있습니다.')

  const { data } = await supabase.from('judge_payments').select('*').eq('id', params.id).maybeSingle()
  if (!data) throw new ApiError(404, '정산 정보를 찾을 수 없습니다.')
  const p = data as JudgePayment

  let account: string | null = null
  let rrn: string | null = null
  try {
    account = p.bank_enc ? decrypt(p.bank_enc) : null
    rrn = p.rrn_enc ? decrypt(p.rrn_enc) : null
  } catch {
    throw new ApiError(500, '복호화에 실패했습니다. 암호화 키 설정을 확인해 주세요.')
  }

  await supabase.rpc('log_event', {
    p_action: 'view', p_table: 'judge_payments', p_row: p.id,
    p_meta: { judge_id: p.judge_id, program_id: p.program_id, fields: ['bank', 'rrn'] },
  })
  return NextResponse.json({ bank_name: p.bank_name, holder: p.holder, account, rrn })
})
