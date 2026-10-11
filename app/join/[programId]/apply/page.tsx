import { redirect } from 'next/navigation'
import AuthFrame from '@/components/AuthFrame'
import { Alert, LinkButton } from '@/components/ui'
import { getSession } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { JudgeRequest } from '@/lib/types'
import ApplyForm, { SignOutLink } from './ApplyForm'

export const dynamic = 'force-dynamic'

// 심사위원 가입 2단계: 신청서 → 승인 대기. 승인되면 /j 로 이동할 수 있다.
export default async function ApplyPage({ params }: { params: { programId: string } }) {
  const { user, profile } = await getSession()
  if (!user) redirect(`/join/${params.programId}`)
  const admin = supabaseAdmin()
  const [{ data: program }, { data: judge }, { data: req }] = await Promise.all([
    admin.from('programs').select('id, title, judge_signup_open').eq('id', params.programId).maybeSingle(),
    admin.from('judges').select('id').eq('program_id', params.programId).eq('user_id', user.id).maybeSingle(),
    admin.from('judge_requests').select('*').eq('program_id', params.programId).eq('user_id', user.id).maybeSingle(),
  ])
  if (!program) redirect('/login')
  if (judge && profile?.role === 'judge') redirect('/j')
  const r = req as JudgeRequest | null
  const back = `/join/${program.id}`
  const title = '심사위원 신청'

  if (profile && profile.role !== 'judge') {
    return (
      <AuthFrame title={title}>
        <div className="grid gap-4">
          <Alert tone="highlight">이 계정({user.email})은 이미 관리자 또는 참가 기업 계정입니다. 심사위원 신청은 다른 계정으로 해 주세요.</Alert>
          <SignOutLink to={back} />
        </div>
      </AuthFrame>
    )
  }
  if (r?.status === 'pending') {
    return (
      <AuthFrame title="승인 대기 중" subtitle={program.title}>
        <div className="grid gap-4">
          <Alert tone="accent">{r.name} 님의 심사위원 신청이 접수되었습니다. 운영사무국이 승인하면 이 계정({user.email})으로 로그인해 심사에 참여할 수 있습니다.</Alert>
          <LinkButton href={`/join/${program.id}/apply`} variant="outline">승인 여부 다시 확인</LinkButton>
          <SignOutLink to={back} />
        </div>
      </AuthFrame>
    )
  }
  if (!program.judge_signup_open) {
    return (
      <AuthFrame title={title}><Alert tone="highlight">지금은 심사위원 신청을 받지 않습니다. 운영사무국에 문의해 주세요.</Alert></AuthFrame>
    )
  }
  return (
    <AuthFrame title={title} subtitle={`${program.title} · ${user.email}`}>
      <div className="grid gap-4">
        {r?.status === 'rejected' && <Alert tone="highlight">이전 신청이 반려되었습니다. 내용을 확인해 다시 신청하거나 운영사무국에 문의해 주세요.</Alert>}
        <ApplyForm programId={program.id} initial={{
          name: r?.name ?? profile?.name ?? (user.user_metadata?.full_name as string | undefined) ?? '',
          phone: r?.phone ?? profile?.phone ?? '', org: r?.org ?? profile?.org ?? '', expertise: r?.expertise ?? '',
        }} />
        <SignOutLink to={back} />
      </div>
    </AuthFrame>
  )
}
