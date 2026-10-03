import AppShell from '@/components/AppShell'
import { PageHeader } from '@/components/ui'
import { requireRole } from '@/lib/server/auth'
import { AREA, NAV } from '@/lib/nav'
import ProfileForm from './ProfileForm'

// P-04 내 정보: 이름·연락처·소속 수정
export default async function MePage() {
  const { profile, user } = await requireRole(['admin', 'company', 'judge'])
  return (
    <AppShell area={AREA[profile.role]} nav={NAV[profile.role]} userName={profile.name || user.email || ''}>
      <PageHeader title="내 정보" />
      <ProfileForm profile={profile} email={user.email ?? ''} />
    </AppShell>
  )
}
