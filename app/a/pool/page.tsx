import { PageHeader } from '@/components/ui'
import PoolManager, { type PoolRow } from '@/components/admin/results/PoolManager'
import { requireRole } from '@/lib/server/auth'
import type { Judge, JudgePoolEntry, Program } from '@/lib/types'

export const dynamic = 'force-dynamic'

// A-16 심사위원 풀: 전문분야·참여 이력, 다음 프로그램 섭외·배정에 재사용
export default async function PoolPage() {
  const { supabase } = await requireRole('admin')
  const [{ data: pool }, { data: judges }, { data: programs }] = await Promise.all([
    supabase.from('judge_pool').select('*').order('name'),
    supabase.from('judges').select('*'),
    supabase.from('programs').select('id, title, status, created_at').order('created_at', { ascending: false }),
  ])
  const js = (judges ?? []) as Judge[]
  const progs = (programs ?? []) as Pick<Program, 'id' | 'title' | 'status' | 'created_at'>[]
  const pm = new Map(progs.map(p => [p.id, p]))
  const userIds = [...new Set(js.map(j => j.user_id))]
  const { data: profs } = userIds.length ? await supabase.from('profiles').select('user_id, email').in('user_id', userIds) : { data: [] as { user_id: string; email: string | null }[] }
  const emailOf = new Map((profs ?? []).map(p => [p.user_id, (p.email ?? '').toLowerCase()]))

  // 참여 이력: judges 행 중 user_id 또는 이메일이 일치하는 것 (프로그램 간)
  const rows: PoolRow[] = ((pool ?? []) as JudgePoolEntry[]).map(e => {
    const email = (e.email ?? '').toLowerCase()
    const mine = js.filter(j => (e.user_id && j.user_id === e.user_id) || (email && emailOf.get(j.user_id) === email))
    const history = mine.map(j => {
      const p = pm.get(j.program_id)
      return { program_id: j.program_id, title: p?.title ?? '(삭제된 프로그램)', year: new Date(p?.created_at ?? Date.now()).getFullYear(), chair: j.is_chair }
    }).sort((a, b) => b.year - a.year || a.title.localeCompare(b.title, 'ko'))
    return { ...e, expertise: e.expertise ?? [], history: e.history ?? [], computed: history }
  })

  return (
    <>
      <PageHeader title="심사위원 풀" description="전문분야로 검색하고 다음 프로그램에 바로 배정(초대)합니다. 참여 이력은 프로그램별 심사위원 등록 기록에서 자동으로 만듭니다." />
      <PoolManager rows={rows} programs={progs.filter(p => p.status !== 'archived').map(p => ({ id: p.id, title: p.title, status: p.status }))} />
    </>
  )
}
