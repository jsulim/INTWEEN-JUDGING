import { Empty, PageHeader } from '@/components/ui'
import { StageTabs } from '@/components/admin/results/ui'
import ResultsView, { type ResultsViewProps } from '@/components/admin/results/ResultsView'
import { requireRole } from '@/lib/server/auth'
import { loadJudgeProgress, loadStageReport } from '@/lib/server/export'
import type { Stage } from '@/lib/types'

export const dynamic = 'force-dynamic'

// A-08 평가 결과: 점수 매트릭스·항목별 평균·순위(loadStageResults 단일 산정, Q10)·심사평·집계 방식·확정·이관
export default async function ResultsPage({ params, searchParams }: { params: { id: string }; searchParams: { stage?: string } }) {
  const { supabase } = await requireRole('admin')
  const { data: stageRows } = await supabase.from('stages').select('*').eq('program_id', params.id).order('order_no')
  const stages = (stageRows ?? []) as Stage[]
  const base = `/a/p/${params.id}/results`
  if (!stages.length) {
    return (<><PageHeader title="평가 결과" /><Empty>등록된 단계가 없습니다.</Empty></>)
  }
  const current = stages.find(s => s.id === searchParams.stage)
    ?? stages.find(s => s.status === 'evaluating') ?? stages.find(s => s.status === 'locked') ?? stages[0]

  const report = await loadStageReport(supabase, current.id)
  const progress = await loadJudgeProgress(supabase, report)
  const chairJudge = report.judges.find(j => j.is_chair) ?? null
  const { data: chairReview } = chairJudge
    ? await supabase.from('chair_reviews').select('opinion, confirmed_at, judge_id').eq('stage_id', current.id).maybeSingle()
    : { data: null }
  const next = stages.find(s => s.order_no > current.order_no) ?? null
  const { data: allEntries } = await supabase.from('stage_entries').select('company_id, result, eligibility').eq('stage_id', current.id)
  const entryOf = new Map((allEntries ?? []).map(e => [e.company_id, e]))
  const nextEntryIds = next
    ? new Set(((await supabase.from('stage_entries').select('company_id').eq('stage_id', next.id)).data ?? []).map(e => e.company_id))
    : new Set<string>()

  const props: ResultsViewProps = {
    programId: params.id,
    stage: report.stage,
    criteria: report.criteria.map(c => ({ id: c.id, name: c.name, max_score: Number(c.max_score), min_pass_score: c.min_pass_score == null ? null : Number(c.min_pass_score) })),
    results: report.results,
    companies: Object.fromEntries([...report.companies.entries()].map(([id, c]) => [id, {
      name: c.name, blind_code: c.blind_code, result: entryOf.get(id)?.result ?? 'pending', in_next: nextEntryIds.has(id),
    }])),
    judges: report.stageJudges.map(j => ({ id: j.id, name: j.name, affiliation: j.affiliation, is_chair: j.is_chair })),
    assignments: report.assignments.map(a => ({ id: a.id, judge_id: a.judge_id, company_id: a.company_id, conflict: a.conflict, conflict_reason: a.conflict_reason })),
    scores: report.scores.map(s => ({ assignment_id: s.assignment_id, criterion_id: s.criterion_id, score: s.score == null ? null : Number(s.score), comment: s.comment })),
    reviews: report.reviews.map(r => ({ assignment_id: r.assignment_id, overall_comment: r.overall_comment, qna_memo: r.qna_memo })),
    source: report.source,
    lockedAt: report.lockedAt,
    progress: progress.map(p => ({
      judge_id: p.judge.id, name: p.judge.name, assigned: p.assigned, done: p.done, conflicts: p.conflicts,
      submission: p.submission ? { status: p.submission.status, submitted_at: p.submission.submitted_at, reopened_at: p.submission.reopened_at, reopen_reason: p.submission.reopen_reason } : null,
    })),
    chair: chairJudge ? { name: chairJudge.name, opinion: chairReview?.opinion ?? null, confirmed_at: chairReview?.confirmed_at ?? null } : null,
    nextStage: next ? { id: next.id, name: next.name } : null,
    unapprovedBonusCount: report.unapprovedBonusCount,
  }

  return (
    <>
      <PageHeader title="평가 결과" description="기업×심사위원 점수, 항목별 평균, 최종 순위. 대시보드·확정·내보내기와 같은 산정 결과입니다." />
      <StageTabs stages={stages} current={current.id} base={base} />
      <ResultsView key={current.id} {...props} />
    </>
  )
}
