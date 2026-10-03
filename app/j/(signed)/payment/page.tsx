import { Empty, PageHeader } from '@/components/ui'
import { requireRole } from '@/lib/server/auth'
import { loadMyPayments } from '@/app/api/payments/me/load'
import PaymentForm from './PaymentForm'

export const dynamic = 'force-dynamic'

// J-08 수당 지급 정보 (2차): 계좌·주민등록번호 입력(별도 동의, 암호화 저장), 지급 내역 확인
export default async function PaymentPage() {
  const { user } = await requireRole('judge')
  const items = await loadMyPayments(user.id)
  return (
    <>
      <PageHeader title="수당 지급 정보" description="입력한 계좌·주민등록번호는 암호화해 저장하며, 화면에는 일부만 표시합니다." />
      {items.length === 0 ? <Empty>배정된 프로그램이 없습니다.</Empty> : (
        <div className="grid max-w-3xl gap-6">
          {items.map(it => <PaymentForm key={it.judge_id} item={it} />)}
        </div>
      )}
    </>
  )
}
