import AppShell from '@/components/AppShell'
import { requireRole } from '@/lib/server/auth'
import { AREA, NAV } from '@/lib/nav'

export const dynamic = 'force-dynamic'

export default async function JudgeLayout({ children }: { children: React.ReactNode }) {
  const { profile, user } = await requireRole('judge')
  return <AppShell wide area={AREA.judge} nav={NAV.judge} userName={profile.name || user.email || ''}>{children}</AppShell>
}
