import { Empty, PageHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/server/auth'
import { dday } from '@/lib/format'
import { fetchAll, loadJudgeStage, type JudgeStageData } from '@/app/j/_lib/data'
import StageBoard from '@/app/j/_lib/StageBoard'

export const dynamic = 'force-dynamic'

// J-02 대시보드: 요약 숫자 + 단계별 배정 기업 목록 (단계 카드를 거치지 않고 바로 평가로 들어간다)
export default async function JudgeDashboard() {
  const { supabase, user, profile } = await requireRole('judge')
  const asg = await fetchAll<{ stage_id: string }>((f, t) =>
    supabase.from('assignments').select('stage_id').order('id').range(f, t))
  const stageIds = [...new Set(asg.map(a => a.stage_id))]
  const stages = (await Promise.all(stageIds.map(id => loadJudgeStage(supabase, user.id, id))))
    .filter((d): d is JudgeStageData => !!d)
    .sort((a, b) => a.program.title.localeCompare(b.program.title, 'ko') || a.stage.order_no - b.stage.order_no)

  const active = stages.filter(d => d.stage.status === 'evaluating')
  const totals = active.reduce((a, d) => ({ done: a.done + d.counts.done, total: a.total + d.counts.total }), { done: 0, total: 0 })
  const urgent = active.filter(d => dday(d.stage.eval_end)?.urgent && d.counts.done < d.counts.total).length

  return (
    <>
      <PageHeader title="대시보드" description={`${profile.name || user.email}님에게 배정된 심사입니다.`} />
      {stages.length === 0 ? (
        <Empty>배정된 심사가 없습니다.</Empty>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Stat label="평가중 단계" value={active.length} />
            <Stat label="평가 완료" value={`${totals.done}/${totals.total}`} tone={totals.total > 0 && totals.done === totals.total ? 'accent' : undefined}
              hint="평가중 단계 기준, 이해충돌 제외" />
            <Stat label="마감 임박" value={urgent} tone={urgent ? 'highlight' : undefined} hint="마감 2일 이내 · 미완료" />
          </div>
          {/* 단계 카드 없이 기업 목록을 바로 보여준다 */}
          <div className="grid gap-10">
            {stages.map(d => <section key={d.stage.id}><StageBoard d={d} variant="section" /></section>)}
          </div>
        </>
      )}
    </>
  )
}
