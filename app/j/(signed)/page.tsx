import { Badge, Card, Empty, LinkButton, PageHeader, Progress, Stat } from '@/components/ui'
import { DDayBadge, StageStatusBadge } from '@/components/StatusBadges'
import { requireRole } from '@/lib/server/auth'
import { dday, fmtDate } from '@/lib/format'
import { fetchAll, loadJudgeStage, type JudgeStageData } from '@/app/j/_lib/data'

export const dynamic = 'force-dynamic'

function EvalSubBadge({ d }: { d: JudgeStageData }) {
  if (d.evalSub?.status === 'submitted') return <Badge tone="accent">최종 제출 완료</Badge>
  if (d.evalSub?.status === 'reopened') return <Badge tone="highlight">재오픈됨</Badge>
  return <Badge>최종 미제출</Badge>
}

// J-02 대시보드: 배정 프로그램·단계, 평가 진행률(완료/전체), 마감 D-day
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

  const programs = new Map<string, JudgeStageData[]>()
  for (const d of stages) programs.set(d.program.id, [...(programs.get(d.program.id) ?? []), d])

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
          <div className="grid gap-8">
            {[...programs.values()].map(list => (
              <section key={list[0].program.id}>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-bold">{list[0].program.title}</h2>
                  {list[0].judge.is_chair && <Badge tone="primary">심사위원장</Badge>}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {list.map(d => {
                    const base = `/j/s/${d.stage.id}`
                    const evaluating = d.stage.status === 'evaluating'
                    return (
                      <Card key={d.stage.id}
                        title={<span className="flex items-center gap-2">{d.stage.name}<StageStatusBadge status={d.stage.status} /></span>}
                        actions={evaluating ? <DDayBadge deadline={d.stage.eval_end} /> : undefined}>
                        <div className="grid gap-4">
                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                            <span>평가 기간 <span className="tabular text-fg">{fmtDate(d.stage.eval_start)} ~ {fmtDate(d.stage.eval_end)}</span></span>
                            {d.stage.blind_mode && <span>블라인드</span>}
                          </div>
                          <div>
                            <div className="mb-1 flex items-center justify-between text-sm">
                              <span className="font-semibold">평가 진행률</span>
                              <span className="flex gap-2 text-xs text-muted">
                                {d.counts.draft > 0 && <span>임시저장 {d.counts.draft}</span>}
                                {d.counts.none > 0 && <span className="text-[#8a5a00]">미평가 {d.counts.none}</span>}
                                {d.counts.conflict > 0 && <span>제외 {d.counts.conflict}</span>}
                              </span>
                            </div>
                            <Progress value={d.counts.done} max={d.counts.total} />
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <EvalSubBadge d={d} />
                            <div className="flex flex-wrap gap-2">
                              {d.stage.is_presentation && evaluating && <LinkButton href={`${base}/live`} variant="secondary" size="sm">현장 모드</LinkButton>}
                              <LinkButton href={`${base}/summary`} variant="outline" size="sm">내 평가 요약</LinkButton>
                              {evaluating && d.evalSub?.status !== 'submitted' && (
                                <LinkButton href={`${base}/submit`} variant="outline" size="sm">최종 제출</LinkButton>
                              )}
                              <LinkButton href={base} size="sm">기업 목록</LinkButton>
                            </div>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  )
}
