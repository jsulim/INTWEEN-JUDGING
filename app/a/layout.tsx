import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { mfaRequired, requireRole } from '@/lib/server/auth'
import { AREA, NAV } from '@/lib/nav'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile, user } = await requireRole('admin')
  // 관리자 2단계 인증(OTP) 강제
  if (mfaRequired()) {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (data?.currentLevel !== 'aal2') redirect('/mfa')
  }
  return <AppShell wide area={AREA.admin} nav={NAV.admin} userName={profile.name || user.email || ''}>{children}</AppShell>
}
