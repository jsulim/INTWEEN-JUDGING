import { redirect } from 'next/navigation'
import { getSession, HOME } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'

// 로그인 후 profiles.role 에 따라 /c, /j, /a 홈으로 보낸다
export default async function Home() {
  const { user, profile } = await getSession()
  if (!user) redirect('/login')
  if (!profile) {
    // 심사위원 가입 신청만 하고 아직 승인 전이면 신청 상태 화면으로
    const { data: req } = await supabaseAdmin().from('judge_requests').select('program_id')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1)
    if (req?.[0]) redirect(`/join/${req[0].program_id}/apply`)
    redirect('/login?error=no_profile')
  }
  redirect(HOME[profile.role])
}
