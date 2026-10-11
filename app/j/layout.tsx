import AppShell from '@/components/AppShell'
import { requireRole } from '@/lib/server/auth'
import { AREA, NAV } from '@/lib/nav'

export const dynamic = 'force-dynamic'

export default async function JudgeLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile, user } = await requireRole('judge')
  // 수당 정산을 쓰는 프로그램에 속한 심사위원에게만 '수당 지급 정보' 메뉴를 보인다
  const { data: paid } = await supabase.from('judges').select('id, programs!inner(payments_enabled)')
    .eq('user_id', user.id).eq('programs.payments_enabled', true).limit(1)
  const nav = paid?.length ? NAV.judge : NAV.judge.filter(n => n.href !== '/j/payment')
  return <AppShell wide area={AREA.judge} nav={nav} userName={profile.name || user.email || ''}>{children}</AppShell>
}
