import AppShell from '@/components/AppShell'
import { requireRole } from '@/lib/server/auth'
import { AREA, NAV } from '@/lib/nav'

export const dynamic = 'force-dynamic'

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const { profile, user } = await requireRole('company')
  return <AppShell area={AREA.company} nav={NAV.company} userName={profile.name || user.email || ''}>{children}</AppShell>
}
