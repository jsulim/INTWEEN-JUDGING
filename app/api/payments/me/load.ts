import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/server'
import { decrypt } from '@/lib/server/crypto'
import { maskAccount, maskRrn } from '@/lib/mask'
import type { JudgePayment } from '@/lib/types'

// J-08 본인 수당 지급 정보 (마스킹). 복호화는 서버에서 본인 데이터 마스킹 표시용으로만 한다.
export interface MyPayment {
  judge_id: string
  program_id: string
  program_title: string
  payment_per_session: number
  saved: null | {
    bank_name: string | null
    holder: string | null
    account_masked: string | null
    rrn_masked: string | null
    consent_at: string | null
    sessions: number
    amount: number
    tax: number
    paid_at: string | null
  }
}

function safeMask(enc: string | null, mask: (s: string) => string) {
  if (!enc) return null
  try {
    return mask(decrypt(enc))
  } catch {
    return '********'
  }
}

export async function loadMyPayments(userId: string): Promise<MyPayment[]> {
  const admin = supabaseAdmin()
  const { data: judges } = await admin.from('judges')
    .select('id, program_id, programs(title, payment_per_session)').eq('user_id', userId)
  const list = (judges ?? []) as unknown as { id: string; program_id: string; programs: { title: string; payment_per_session: number } | null }[]
  if (!list.length) return []
  const { data: pays } = await admin.from('judge_payments').select('*').in('judge_id', list.map(j => j.id))
  const byJudge = new Map(((pays ?? []) as JudgePayment[]).map(p => [p.judge_id, p]))
  return list.map(j => {
    const p = byJudge.get(j.id)
    return {
      judge_id: j.id,
      program_id: j.program_id,
      program_title: j.programs?.title ?? '',
      payment_per_session: j.programs?.payment_per_session ?? 0,
      saved: p ? {
        bank_name: p.bank_name,
        holder: p.holder,
        account_masked: safeMask(p.bank_enc, maskAccount),
        rrn_masked: safeMask(p.rrn_enc, maskRrn),
        consent_at: p.consent_at,
        sessions: p.sessions,
        amount: p.amount,
        tax: p.tax,
        paid_at: p.paid_at,
      } : null,
    }
  })
}
