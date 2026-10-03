import { requireRole } from '@/lib/server/auth'
import { programStages } from '@/components/admin/setup/server'
import StagesManager, { type StageStats } from './StagesManager'

export const dynamic = 'force-dynamic'

// A-03 단계 관리: 단계 추가, 접수·평가 기간, 4-1 설정값, 상태 변경
export default async function StagesPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireRole('admin')
  const stages = await programStages(supabase, params.id)
  const ids = stages.map(s => s.id)
  const [{ data: entries }, { data: asg }, { data: crit }, { count: companyCount }] = await Promise.all([
    ids.length ? supabase.from('stage_entries').select('stage_id').in('stage_id', ids) : Promise.resolve({ data: [] as { stage_id: string }[] }),
    ids.length ? supabase.from('assignments').select('stage_id').in('stage_id', ids).eq('conflict', false) : Promise.resolve({ data: [] as { stage_id: string }[] }),
    ids.length ? supabase.from('criteria').select('stage_id, max_score').in('stage_id', ids) : Promise.resolve({ data: [] as { stage_id: string; max_score: number }[] }),
    supabase.from('companies').select('id', { count: 'exact', head: true }).eq('program_id', params.id),
  ])
  const stats: Record<string, StageStats> = {}
  for (const s of stages) stats[s.id] = { entries: 0, assignments: 0, criteria: 0, maxTotal: 0 }
  for (const e of entries ?? []) stats[e.stage_id].entries++
  for (const a of asg ?? []) stats[a.stage_id].assignments++
  for (const c of crit ?? []) { stats[c.stage_id].criteria++; stats[c.stage_id].maxTotal += Number(c.max_score) }

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">단계 관리</h1>
      <p className="mb-6 text-muted">
        준비 → 접수중 → 평가중 → 확정 → 결과공개. 일정이 설정되면 5분마다 자동 전환(준비→접수중→평가중)되며, 언제든 수동으로 앞당기거나 되돌릴 수 있습니다.
      </p>
      <StagesManager programId={params.id} stages={stages} stats={stats} companyCount={companyCount ?? 0} />
    </>
  )
}
