import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Card, Empty, PageHeader, Table } from '@/components/ui'
import { StageStatusBadge } from '@/components/StatusBadges'
import { EvalStateBadge } from '@/components/judge/EvalStateBadge'
import { requireRole } from '@/lib/server/auth'
import { fmtDate, fmtScore } from '@/lib/format'
import type { StageResult } from '@/lib/types'
import { loadJudgeStage } from '@/app/j/_lib/data'
import ChairForm from './ChairForm'

export const dynamic = 'force-dynamic'

// J-05 내 평가 요약: 본인이 매긴 점수 일람 (타 심사위원 점수는 RLS 로 조회 불가)
// 심사위원장(2차): 확정 이후 순위(stage_results, RLS chair_read) + 종합의견·확인 서명
export default async function SummaryPage({ params }: { params: { stageId: string } }) {
  const { supabase, user } = await requireRole('judge')
  const d = await loadJudgeStage(supabase, user.id, params.stageId)
  if (!d) notFound()
  const base = `/j/s/${d.stage.id}`
  const evaluated = d.rows.filter(r => r.state !== 'conflict')
  const doneTotals = evaluated.filter(r => r.state === 'done').map(r => r.total ?? 0)
  const avg = doneTotals.length ? doneTotals.reduce((a, b) => a + b, 0) / doneTotals.length : null

  const showChair = d.judge.is_chair && (d.stage.status === 'locked' || d.stage.status === 'published')
  let ranking: StageResult[] = []
  let chair: { opinion: string | null; confirmed_at: string | null } | null = null
  if (showChair) {
    const [{ data: res }, { data: cr }] = await Promise.all([
      supabase.from('stage_results').select('*').eq('stage_id', d.stage.id).order('rank', { ascending: true, nullsFirst: false }),
      supabase.from('chair_reviews').select('opinion, confirmed_at').eq('stage_id', d.stage.id).maybeSingle(),
    ])
    ranking = (res ?? []) as StageResult[]
    chair = cr ?? null
  }
  const nameOf = new Map(d.rows.map(r => [r.company_id, r.display_name]))

  return (
    <>
      <PageHeader back={{ href: base, label: '기업 목록' }}
        title={<span className="flex items-center gap-2">내 평가 요약<StageStatusBadge status={d.stage.status} /></span>}
        description={`${d.program.title} · ${d.stage.name} · 본인 점수만 표시됩니다.`} />

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        <span>완료 <span className="tabular font-semibold text-fg">{d.counts.done}/{d.counts.total}</span></span>
        <span>내 평균 <span className="tabular font-semibold text-fg">{fmtScore(avg)}</span> / {fmtScore(d.maxTotal)}</span>
        {d.evalSub?.status === 'submitted' && <span>최종 제출 <span className="tabular text-fg">{fmtDate(d.evalSub.submitted_at)}</span></span>}
      </div>

      {d.rows.length === 0 ? <Empty>배정된 기업이 없습니다.</Empty> : (
        <Table>
          <thead>
            <tr>
              <th>기업</th>
              {d.criteria.map(c => <th key={c.id} className="text-right">{c.name}<span className="tabular ml-1 font-normal">({fmtScore(c.max_score)})</span></th>)}
              <th className="text-right">합계</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map(r => {
              const sc = new Map((d.scores.get(r.assignment_id) ?? []).map(s => [s.criterion_id, s.score]))
              const excluded = r.state === 'conflict'
              return (
                <tr key={r.company_id} className={excluded ? 'text-muted' : undefined}>
                  <td className="font-semibold">
                    {excluded ? r.display_name : <Link href={`${base}/c/${r.company_id}`} className="hover:text-primary">{r.display_name}</Link>}
                  </td>
                  {d.criteria.map(c => <td key={c.id} className="tabular text-right">{excluded ? '-' : fmtScore(sc.get(c.id))}</td>)}
                  <td className="tabular text-right font-bold">{excluded ? '-' : fmtScore(r.total)}</td>
                  <td><EvalStateBadge state={r.state} /></td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}

      {showChair && (
        <div className="mt-8 grid gap-6">
          <Card title={<span className="flex items-center gap-2">확정 순위<Badge tone="primary">심사위원장</Badge></span>}>
            {ranking.length === 0 ? <p className="text-sm text-muted">확정된 순위가 없습니다.</p> : (
              <Table>
                <thead><tr><th className="w-16">순위</th><th>기업</th><th className="text-right">최종 점수</th><th className="text-right">심사위원</th><th>비고</th></tr></thead>
                <tbody>
                  {ranking.map(r => (
                    <tr key={r.id}>
                      <td className="tabular font-bold">{r.rank ?? '-'}</td>
                      <td className="font-semibold">{nameOf.get(r.company_id) ?? '-'}</td>
                      <td className="tabular text-right">{fmtScore(r.avg_score, 3)}</td>
                      <td className="tabular text-right">{r.judge_count}</td>
                      <td>{r.cutoff && <Badge tone="danger">과락</Badge>}{r.rank === 1 && <Badge tone="highlight">1위</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card title="위원장 종합의견">
            <ChairForm stageId={d.stage.id} judgeId={d.judge.id} initialOpinion={chair?.opinion ?? ''} confirmedAt={chair?.confirmed_at ?? null} />
          </Card>
        </div>
      )}
    </>
  )
}
