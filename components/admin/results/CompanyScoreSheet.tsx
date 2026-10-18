'use client'
import { forwardRef } from 'react'
import { fmtScore } from '@/lib/format'
import { belowPass, type CompanyResult } from '@/lib/scoring'
import { Badge, Button, Card, Select, Table, cn } from '@/components/ui'
import CriteriaHead from '@/components/CriteriaHead'

type Criterion = { id: string; name: string; max_score: number; group_name?: string | null }
type Judge = { id: string; name: string; is_chair: boolean }
type Asg = { id: string; judge_id: string; company_id: string; conflict: boolean }
type Score = { assignment_id: string; criterion_id: string; score: number | null }
type Progress = { judge_id: string; submission: { status: 'submitted' | 'reopened' } | null }

// 기업별 점수표: 한 기업을 골라 심사위원별 항목 점수·합계와 평균·최종 점수·순위를 한 화면에서 본다
const CompanyScoreSheet = forwardRef<HTMLDivElement, {
  companyId: string | null
  onSelect: (id: string) => void
  results: CompanyResult[]
  criteria: Criterion[]
  judges: Judge[]
  assignments: Asg[]
  scores: Score[]
  overall: Map<string, string | null>
  progress: Progress[]
  label: (id: string) => string
  passScore: number | null
  normalize: boolean
  onEdit?: (a: Asg, judgeName: string) => void
}>(function CompanyScoreSheet(p, ref) {
  const idx = Math.max(0, p.results.findIndex(r => r.company_id === p.companyId))
  const r = p.results[idx]
  const maxTotal = p.criteria.reduce((a, c) => a + Number(c.max_score), 0)

  return (
    <div ref={ref} className="scroll-mt-4">
      <Card title="기업별 점수표" actions={r && (
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={idx === 0} onClick={() => p.onSelect(p.results[idx - 1].company_id)}>←</Button>
          <Select className="h-9 w-auto max-w-[220px] text-sm" value={r.company_id} onChange={e => p.onSelect(e.target.value)} aria-label="기업 선택">
            {p.results.map(x => <option key={x.company_id} value={x.company_id}>{x.rank != null ? `${x.rank}위 · ` : ''}{p.label(x.company_id)}</option>)}
          </Select>
          <Button size="sm" variant="outline" disabled={idx >= p.results.length - 1} onClick={() => p.onSelect(p.results[idx + 1].company_id)}>→</Button>
        </div>
      )}>
        {!r ? <p className="text-muted">심사 대상 기업이 없습니다.</p> : (() => {
          const rows = p.assignments.filter(a => a.company_id === r.company_id)
          const totals = new Map(r.judge_totals.map(t => [t.judge_id, t.total]))
          const scoreOf = (aid: string, cid: string) => p.scores.find(s => s.assignment_id === aid && s.criterion_id === cid)?.score ?? null
          const submitted = new Set(p.progress.filter(x => x.submission?.status === 'submitted').map(x => x.judge_id))
          return (
            <div className="grid gap-4">
              {/* 요약 */}
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                <div>
                  <div className="text-xl font-black">{p.label(r.company_id)}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {r.rank != null && <Badge tone={r.rank === 1 ? 'highlight' : 'primary'}>{r.rank}위{r.tied ? ' (공동)' : ''}</Badge>}
                    {belowPass(r.final, p.passScore) ? <Badge tone="danger">합격선 미달</Badge>
                      : p.passScore != null && r.final != null && <Badge tone="accent">합격선 {p.passScore}점 이상</Badge>}
                    {r.in_progress && <Badge tone="highlight">집계 중</Badge>}
                    {r.deviation_alert && <Badge tone="highlight">편차 {fmtScore(r.deviation)}</Badge>}
                  </div>
                </div>
                <Stat label="평가 완료" value={`${r.done_count}/${r.judge_count}명`} />
                <Stat label="심사위원 평균" value={fmtScore(r.raw, 2)} />
                {r.bonus ? <Stat label="가감점" value={r.bonus > 0 ? `+${fmtScore(r.bonus)}` : fmtScore(r.bonus)} /> : null}
                <Stat label={`최종 점수 (${fmtScore(maxTotal)}점 만점)`} value={fmtScore(r.final, 2)} big />
              </div>

              {/* 심사위원 × 항목 */}
              <Table>
                <CriteriaHead criteria={p.criteria} align="text-right"
                  lead={n => <th rowSpan={n}>심사위원</th>}
                  cell={c => <th key={c.id} className="text-right">{c.name}<span className="tabular ml-1 font-normal">({fmtScore(c.max_score)})</span></th>}
                  tail={n => <><th rowSpan={n} className="text-right">합계</th><th rowSpan={n}>제출</th><th rowSpan={n}>종합 심사평</th></>} />
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={p.criteria.length + 4} className="text-center text-muted">배정된 심사위원이 없습니다.</td></tr>}
                  {rows.map(a => {
                    const j = p.judges.find(x => x.id === a.judge_id)
                    const name = j?.name ?? '심사위원'
                    if (a.conflict) return (
                      <tr key={a.id} className="text-muted">
                        <td className="font-semibold">{name}</td>
                        <td colSpan={p.criteria.length + 3}><Badge tone="danger">이해충돌 제외</Badge></td>
                      </tr>
                    )
                    const total = totals.get(a.judge_id)
                    return (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap font-semibold">{name}{j?.is_chair && <span className="ml-1 text-xs text-primary">위원장</span>}</td>
                        {p.criteria.map(c => <td key={c.id} className="tabular text-right">{fmtScore(scoreOf(a.id, c.id))}</td>)}
                        <td className="tabular text-right font-bold">
                          {total == null ? <span className="text-xs font-normal text-[#8a5a00]">미완료</span>
                            : p.onEdit ? <button type="button" onClick={() => p.onEdit!(a, name)} title="점수 수정"
                              className="rounded px-1 underline decoration-dotted underline-offset-4 hover:bg-primary/10">{fmtScore(total)}</button>
                            : fmtScore(total)}
                        </td>
                        <td>{submitted.has(a.judge_id) ? <Badge tone="accent">제출</Badge> : <Badge>미제출</Badge>}</td>
                        <td className="max-w-[260px] text-sm text-muted"><span className="line-clamp-2">{p.overall.get(a.id) || '-'}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line bg-bg font-semibold">
                    <td>평균</td>
                    {p.criteria.map(c => <td key={c.id} className={cn('tabular text-right', r.cutoff_criteria.includes(c.id) && 'text-danger')}>{fmtScore(r.criterion_avgs[c.id], 2)}</td>)}
                    <td className="tabular text-right">{fmtScore(r.raw, 2)}{p.normalize && r.normalized != null && <div className="text-xs font-normal text-muted">정규화 {fmtScore(r.normalized, 2)}</div>}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </Table>
            </div>
          )
        })()}
      </Card>
    </div>
  )
})

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={cn('tabular font-bold', big ? 'text-3xl text-primary' : 'text-lg')}>{value}</div>
    </div>
  )
}

export default CompanyScoreSheet
