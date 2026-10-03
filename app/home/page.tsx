import { redirect } from 'next/navigation'
import { getSession, HOME } from '@/lib/server/auth'

// 로그인 후 profiles.role 에 따라 /c, /j, /a 홈으로 보낸다
export default async function Home() {
  const { user, profile } = await getSession()
  if (!user) redirect('/login')
  if (!profile) redirect('/login?error=no_profile')
  redirect(HOME[profile.role])
}
