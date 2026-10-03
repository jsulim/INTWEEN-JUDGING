import { PageHeader } from '@/components/ui'
import PaymentsManager, { type PaymentRow } from '@/components/admin/results/PaymentsManager'
import { requireRole } from '@/lib/server/auth'
import { loadJudgeDirectory } from '@/lib/server/export'
import type { JudgePayment, Program } from '@/lib/types'

export const dynamic = 'force-dynamic'

// A-15 심사위원 정산: 수당 산정·원천징수·지급 처리. 계좌·주민번호는 정산 권한자만 복호화(열람 로그) — Q17
export default async function PaymentsPage({ params }: { params: { id: string } }) {
  const { supabase, profile } = await requireRole('admin')
  const [{ data: prog }, judges, { data: pays }] = await Promise.all([
    supabase.from('programs').select('*').eq('id', params.id).single(),
    loadJudgeDirectory(supabase, params.id),
    supabase.from('judge_payments').select('*').eq('program_id', params.id),
  ])
  const program = prog as Program
  const payOf = new Map(((pays ?? []) as JudgePayment[]).map(p => [p.judge_id, p]))

  const rows: PaymentRow[] = judges.map(j => {
    const p = payOf.get(j.id)
    return {
      judge_id: j.id, name: j.name, affiliation: j.affiliation, email: j.email,
      payment: p ? {
        id: p.id, bank_name: p.bank_name, holder: p.holder, has_account: !!p.bank_enc, has_rrn: !!p.rrn_enc,
        consent_at: p.consent_at, sessions: p.sessions, amount: p.amount, tax: p.tax, paid_at: p.paid_at,
      } : null,
    }
  })

  return (
    <>
      <PageHeader title="심사위원 정산" description="심사위원이 수당 지급 정보(J-08)를 입력하면 목록에 표시됩니다. 금액 산정·지급 처리는 정산 권한자만 할 수 있습니다." />
      <PaymentsManager programId={params.id} perSession={program.payment_per_session} canPay={profile.can_pay} rows={rows} />
    </>
  )
}
