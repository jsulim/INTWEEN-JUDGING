import { redirect } from 'next/navigation'
import AuthFrame from '@/components/AuthFrame'
import { Alert } from '@/components/ui'
import { getSession } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import JoinAuth from './JoinAuth'

export const dynamic = 'force-dynamic'

// 심사위원 가입 링크 /join/<program_id> — 관리자가 '가입 신청 받기'를 켠 프로그램만 접수한다
export default async function JoinPage({ params }: { params: { programId: string } }) {
  const { data: program } = await supabaseAdmin().from('programs').select('id, title, judge_signup_open')
    .eq('id', params.programId).maybeSingle()
  if (!program?.judge_signup_open) {
    return (
      <AuthFrame title="심사위원 신청">
        <Alert tone="highlight">지금은 심사위원 신청을 받지 않습니다. 운영사무국에 문의해 주세요.</Alert>
      </AuthFrame>
    )
  }
  const { user } = await getSession()
  if (user) redirect(`/join/${program.id}/apply`)
  return (
    <AuthFrame title="심사위원 신청" subtitle={`${program.title} 심사위원으로 참여하시려면 계정을 만든 뒤 신청해 주세요. 운영사무국이 승인하면 이용할 수 있습니다.`}>
      <JoinAuth programId={program.id} />
    </AuthFrame>
  )
}
