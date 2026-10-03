import Link from 'next/link'
import { Alert, Badge, Card, Empty, LinkButton, Progress, Stat, Table, cn } from '@/components/ui'
import { DDayBadge, EligibilityBadge } from '@/components/StatusBadges'
import { requireRole } from '@/lib/server/auth'
import { fmtDate, fmtScore } from '@/lib/format'
import StageTabs from '@/components/admin/setup/StageTabs'
import LiveRefresh from '@/components/admin/setup/LiveRefresh'
import { pct, pickStage, profilesByUser, programStages, stageOverview } from '@/components/admin/setup/server'
import type { EvaluationSubmission, Judge } from '@/lib/types'

export const dynamic = 'force-dynamic'

// A-01 프로그램 대시보드: 제출률, 심사위원별 진행률, 기업별 실시간 순위, 점수 편차 경고
export default async function ProgramDashboard({ params, searchParams }: { params: { id: string }; searchParams: { stage?: string } }) {
  const { supabase } = await requireRole('admin')
  const stages = await programStages(supabase, params.id)
  const stage = pickStage(stages, searchParams.stage)
  const base = `/a/p/${params.id}`

  if (!stage) {
    return <Empty>단계가 없습니다. <Link href={`${base}/stages`} className="font-semibold text-primary">단계 관리</Link>에서 1차 단계를 추가해 주세요.</Empty>
  }

  const ov = await stageOverview(supabase, stage.id)
  const [{ data: judgeRows }, { data: evalSubs }] = await Promise.all([
    supabase.from('judges').select('*').eq('program_id', params.id),
    supabase.from('evaluation_submissions').select('*').eq('stage_id', stage.id),
  ])
  const judges = (judgeRows ?? []) as Judge[]
  const profs = await profilesByUser(supabase, judges.map(j => j.user_id))
  const subByJudge = new Map(((evalSubs ?? []) as EvaluationSubmission[]).map(s => [s.judge_id, s]))
  const judgeRowsView = judges
    .map(j => ({ j, name: profs.get(j.user_id)?.name || profs.get(j.user_id)?.email || '(이름 없음)', p: ov.judgeProgress.get(j.id) ?? { assigned: 0, done: 0 }, sub: subByJudge.get(j.id) }))
    .filter(r => r.p.assigned > 0)
    .sort((a, b) => pct(a.p.done, a.p.assigned) - pct(b.p.done, b.p.assigned))

  const showNorm = ov.stage.normalize
  const topScore = ov.results.find(r => r.rank === 1)
  const cutoffCount = ov.results.filter(r => r.cutoff).length
  const maxTotal = ov.criteria.reduce((a, c) => a + Number(c.max_score), 0)
  const renderedAt = new Date().toISOString()

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">대시보드</h1>
        <LiveRefresh stageId={stage.id} alertIds={ov.alerts.map(a => a.company_id)} renderedAt={renderedAt} />
      </div>
      <StageTabs stages={stages} current={stage} basePath={base} />

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>접수 {fmtDate(stage.submit_start)} ~ {fmtDate(stage.submit_end)}</span>
        {stage.status === 'submitting' && <DDayBadge deadline={stage.submit_end} />}
        <span>·</span>
        <span>평가 {fmtDate(stage.eval_start)} ~ {fmtDate(stage.eval_end)}</span>
        {stage.status === 'evaluating' && <DDayBadge deadline={stage.eval_end} />}
        {stage.blind_mode && <Badge>블라인드</Badge>}
        {stage.normalize && <Badge>정규화</Badge>}
        {stage.trim_extremes && <Badge>최고·최저 제외</Badge>}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="제출률" value={`${pct(ov.submittedCount, ov.entryCount)}%`}
          hint={`${ov.submittedCount} / ${ov.entryCount}개사 · 필수 파일 ${ov.requiredCount}종`} />
        <Stat label="평가 진행률" value={`${pct(ov.done, ov.assigned)}%`} tone={ov.assigned && ov.done === ov.assigned ? 'accent' : undefined}
          hint={`${ov.done} / ${ov.assigned}건 완료`} />
        <Stat label="현재 1위" value={topScore ? fmtScore(topScore.final) : '-'} tone={topScore ? 'highlight' : undefined}
          hint={topScore ? ov.companies.get(topScore.company_id)?.name : '집계 전'} />
        <Stat label="점수 편차 경고" value={ov.alerts.length} tone={ov.alerts.length ? 'highlight' : undefined}
          hint={`기준 ${fmtScore(Number(stage.deviation_alert))}점 이상 차이${cutoffCount ? ` · 과락 ${cutoffCount}` : ''}`} />
      </div>

      {ov.criteria.length === 0 && (
        <div className="mb-4"><Alert tone="highlight">평가항목이 없습니다. <Link className="font-semibold underline" href={`${base}/criteria?stage=${stage.id}`}>평가항목 관리</Link>에서 추가해 주세요.</Alert></div>
      )}
      {ov.unapprovedBonusCount > 0 && (
        <div className="mb-4"><Alert tone="highlight">미승인 가점 증빙 {ov.unapprovedBonusCount}건 — 승인 전에는 0점 처리됩니다. <Link className="font-semibold underline" href={`${base}/eligibility?stage=${stage.id}`}>적격 검토</Link></Alert></div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card title="기업별 실시간 순위" actions={<>
          <span className="text-xs text-muted">총점 {fmtScore(maxTotal)}점 만점</span>
          <LinkButton href={`${base}/results?stage=${stage.id}`} size="sm" variant="outline">평가 결과</LinkButton>
        </>} className="min-w-0">
          {ov.results.length === 0 ? (
            <p className="text-sm text-muted">이 단계의 참가 기업이 없습니다.</p>
          ) : (
            <Table className="border-0">
              <thead>
                <tr>
                  <th className="w-14">순위</th>
                  <th>기업</th>
                  <th>평가</th>
                  <th className="text-right">원점수</th>
                  {showNorm && <th className="text-right">정규화</th>}
                  <th className="text-right">가감점</th>
                  <th className="text-right">최종</th>
                  <th className="text-right">편차</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {ov.results.map(r => {
                  const c = ov.companies.get(r.company_id)
                  const entry = ov.entries.find(e => e.company_id === r.company_id)
                  return (
                    <tr key={r.company_id} className={cn(r.deviation_alert && 'bg-highlight/10', r.rank === 1 && 'font-semibold')}>
                      <td className="tabular">
                        {r.rank == null ? <span className="text-muted">-</span>
                          : r.rank === 1 ? <Badge tone="highlight">1위</Badge>
                          : <span>{r.rank}{r.tied && <span className="text-xs text-muted"> (공동)</span>}</span>}
                      </td>
                      <td>
                        <div>{c?.name}</div>
                        <div className="text-xs text-muted">{c?.blind_code}{c?.field ? ` · ${c.field}` : ''}</div>
                      </td>
                      <td className="tabular whitespace-nowrap text-xs text-muted">{r.done_count}/{r.judge_count}명</td>
                      <td className="tabular text-right">{fmtScore(r.raw)}</td>
                      {showNorm && <td className="tabular text-right">{fmtScore(r.normalized)}</td>}
                      <td className="tabular text-right">
                        {r.bonus ? (r.bonus > 0 ? `+${fmtScore(r.bonus)}` : fmtScore(r.bonus)) : '-'}
                        {r.bonus_pending ? <div className="text-xs text-muted">미승인 {fmtScore(r.bonus_pending)}</div> : null}
                      </td>
                      <td className="tabular text-right font-bold">{fmtScore(r.final)}</td>
                      <td className={cn('tabular text-right', r.deviation_alert && 'font-bold text-[#8a5a00]')}>{fmtScore(r.deviation)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {r.judge_count === 0 && <Badge>미배정</Badge>}
                          {r.in_progress && r.judge_count > 0 && <Badge tone="highlight">집계 중</Badge>}
                          {r.cutoff && <Badge tone="danger">과락</Badge>}
                          {r.deviation_alert && <Badge tone="highlight">편차 경고</Badge>}
                          {entry && entry.eligibility !== 'eligible' && entry.eligibility !== 'pending' && <EligibilityBadge value={entry.eligibility} />}
                          {!r.in_progress && r.judge_count > 0 && !r.cutoff && <Badge tone="accent">집계 완료</Badge>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
          {ov.alerts.length > 0 && (
            <p className="mt-3 text-xs text-muted">
              노란 행: 동일 기업에 대한 심사위원 간 총점 차이가 {fmtScore(Number(stage.deviation_alert))}점 이상입니다. 경고 발생 시 운영 채널로 알림이 전송됩니다.
            </p>
          )}
        </Card>

        <div className="grid content-start gap-6">
          <Card title="심사위원별 진행률" actions={<LinkButton href={`${base}/assignments?stage=${stage.id}`} size="sm" variant="outline">배정</LinkButton>}>
            {judgeRowsView.length === 0 ? (
              <p className="text-sm text-muted">배정된 심사위원이 없습니다.</p>
            ) : (
              <ul className="grid gap-3">
                {judgeRowsView.map(({ j, name, p, sub }) => (
                  <li key={j.id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold">{name}{j.is_chair && <span className="ml-1 text-xs text-primary">위원장</span>}</span>
                      {sub?.status === 'submitted' ? <Badge tone="accent">최종 제출</Badge>
                        : sub?.status === 'reopened' ? <Badge tone="highlight">재오픈</Badge>
                        : p.done < p.assigned ? <Badge tone="highlight">미완료 {p.assigned - p.done}</Badge>
                        : <Badge tone="accent">평가 완료</Badge>}
                    </div>
                    <Progress value={p.done} max={p.assigned} tone={p.done < p.assigned ? 'highlight' : 'accent'} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="제출 현황" actions={<LinkButton href={`${base}/companies`} size="sm" variant="outline">기업</LinkButton>}>
            <Progress value={ov.submittedCount} max={ov.entryCount} />
            {ov.entryCount > ov.submittedCount && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-muted">미제출 ({ov.entryCount - ov.submittedCount})</div>
                <div className="flex flex-wrap gap-1">
                  {ov.entries.filter(e => !ov.submittedEntryIds.has(e.id)).slice(0, 30).map(e => (
                    <Badge key={e.id}>{e.companies.name}</Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
