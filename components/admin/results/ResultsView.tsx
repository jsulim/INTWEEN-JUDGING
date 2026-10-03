'use client'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { fmtDate, fmtScore } from '@/lib/format'
import type { CompanyResult } from '@/lib/scoring'
import type { EntryResult, Stage } from '@/lib/types'
import { Alert, Badge, Button, Card, Input, LinkButton, Stat, Table, Textarea, cn } from '@/components/ui'
import { ResultBadge, StageStatusBadge } from '@/components/StatusBadges'
import { ConfirmDialog, DownloadLink, Toggle, callApi } from './ui'

export interface ResultsViewProps {
  programId: string
  stage: Stage
  criteria: { id: string; name: string; max_score: number; min_pass_score: number | null }[]
  results: CompanyResult[]
  companies: Record<string, { name: string; blind_code: string | null; result: EntryResult; in_next: boolean }>
  judges: { id: string; name: string; affiliation: string | null; is_chair: boolean }[]
  assignments: { id: string; judge_id: string; company_id: string; conflict: boolean; conflict_reason: string | null }[]
  scores: { assignment_id: string; criterion_id: string; score: number | null; comment: string | null }[]
  reviews: { assignment_id: string; overall_comment: string | null; qna_memo: string | null }[]
  source: 'live' | 'snapshot'
  lockedAt: string | null
  progress: { judge_id: string; name: string; assigned: number; done: number; conflicts: number;
    submission: { status: 'submitted' | 'reopened'; submitted_at: string; reopened_at: string | null; reopen_reason: string | null } | null }[]
  chair: { name: string; opinion: string | null; confirmed_at: string | null } | null
  nextStage: { id: string; name: string } | null
  unapprovedBonusCount: number
}

type Msg = { tone: 'accent' | 'danger' | 'highlight'; text: string } | null

export default function ResultsView(p: ResultsViewProps) {
  const router = useRouter()
  const { stage, criteria, results, companies, judges, assignments } = p
  const locked = stage.status === 'locked' || stage.status === 'published'
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)

  // ── 실시간 반영 (미확정 단계): 점수·배정 변경 시 재조회
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const [liveAt, setLiveAt] = useState<Date | null>(null)
  useEffect(() => {
    if (p.source !== 'live') return
    const sb = supabaseBrowser()
    const refresh = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => { router.refresh(); setLiveAt(new Date()) }, 800)
    }
    const ids = new Set(assignments.map(a => a.id))
    const ch = sb.channel(`results:${stage.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, payload => {
        const row = (payload.new ?? payload.old) as { assignment_id?: string }
        if (!row?.assignment_id || ids.has(row.assignment_id)) refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `stage_id=eq.${stage.id}` }, refresh)
      .subscribe()
    return () => { clearTimeout(timer.current); sb.removeChannel(ch) }
  }, [p.source, stage.id, assignments, router])

  // ── 집계 방식
  async function setOption(key: 'normalize' | 'trim_extremes', value: boolean) {
    setBusy(true)
    const { error } = await supabaseBrowser().from('stages').update({ [key]: value }).eq('id', stage.id)
    setBusy(false)
    if (error) return setMsg({ tone: 'danger', text: '집계 방식을 변경하지 못했습니다.' })
    setMsg({ tone: 'accent', text: '집계 방식 변경됨 — 순위를 다시 계산했습니다.' })
    router.refresh()
  }

  // ── 확정
  const [lockOpen, setLockOpen] = useState(false)
  const [lockWarnings, setLockWarnings] = useState<string[] | null>(null)
  async function lock(force: boolean) {
    setBusy(true)
    const r = await callApi<{ warnings?: string[] }>(`/api/stages/${stage.id}/lock`, 'POST', { force })
    setBusy(false)
    if (r.status === 409 && r.data.warnings) return setLockWarnings(r.data.warnings)
    if (!r.ok) { setLockOpen(false); return setMsg({ tone: 'danger', text: r.data.error ?? '확정하지 못했습니다.' }) }
    setLockOpen(false); setLockWarnings(null)
    setMsg({ tone: 'accent', text: '순위 확정됨 — 결과 스냅샷을 저장했습니다.' })
    router.refresh()
  }

  // ── 결과 공개
  const [pubOpen, setPubOpen] = useState(false)
  async function publish() {
    setBusy(true)
    try {
      await api(`/api/stages/${stage.id}/status`, { method: 'PATCH', body: { status: 'published' } })
      setMsg({ tone: 'accent', text: '결과 공개됨' })
      router.refresh()
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : '결과를 공개하지 못했습니다.' })
    } finally { setBusy(false); setPubOpen(false) }
  }

  // ── 통과자 선정·이관
  const initialPass = useMemo(() => new Set(results.filter(r => companies[r.company_id]?.result === 'pass').map(r => r.company_id)), [results, companies])
  const [selected, setSelected] = useState<Set<string>>(initialPass)
  const [topN, setTopN] = useState('')
  const [advOpen, setAdvOpen] = useState(false)
  const toggleSel = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  function pickTop() {
    const n = Number(topN)
    if (!n || n < 1) return
    setSelected(new Set(results.filter(r => r.rank != null && r.rank <= n && !r.cutoff).map(r => r.company_id)))
  }
  async function advance() {
    setBusy(true)
    try {
      const r = await api<{ pass: number; fail: number; created: number; next_stage: { name: string } | null }>(
        `/api/stages/${stage.id}/advance`, { body: { company_ids: [...selected] } })
      setMsg({ tone: 'accent', text: r.next_stage
        ? `통과 ${r.pass}개 · 탈락 ${r.fail}개 — ${r.next_stage.name} 단계에 ${r.created}개 기업 이관`
        : `통과 ${r.pass}개 · 탈락 ${r.fail}개 — 마지막 단계라 이관 없이 결과만 저장했습니다.` })
      router.refresh()
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : '이관하지 못했습니다.' })
    } finally { setBusy(false); setAdvOpen(false) }
  }

  // ── 재오픈
  const [reopen, setReopen] = useState<{ judge_id: string; name: string } | null>(null)
  const [reason, setReason] = useState('')
  async function doReopen() {
    if (!reopen) return
    setBusy(true)
    try {
      await api('/api/eval/reopen', { body: { judge_id: reopen.judge_id, stage_id: stage.id, reason } })
      setMsg({ tone: 'accent', text: `${reopen.name} 평가 재오픈됨` })
      setReopen(null); setReason('')
      router.refresh()
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : '재오픈하지 못했습니다.' })
    } finally { setBusy(false) }
  }

  // ── 파생 값
  const crit = new Map(criteria.map(c => [c.id, c]))
  const asgOf = (companyId: string, judgeId: string) => assignments.find(a => a.company_id === companyId && a.judge_id === judgeId)
  const scoreOf = (assignmentId: string, criterionId: string) => p.scores.find(s => s.assignment_id === assignmentId && s.criterion_id === criterionId)
  const reviewOf = new Map(p.reviews.map(r => [r.assignment_id, r]))
  const doneCompanies = results.filter(r => !r.in_progress && r.judge_count > 0).length
  const submittedJudges = p.progress.filter(x => x.submission?.status === 'submitted').length
  const bonusPending = results.reduce((a, r) => a + (r.bonus_pending ? 1 : 0), 0)
  const label = (id: string) => companies[id]?.name ?? '(삭제된 기업)'

  return (
    <div className="grid gap-6">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      {/* 상태·작업 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-card px-5 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StageStatusBadge status={stage.status} />
          {p.source === 'snapshot'
            ? <Badge tone="accent">확정 스냅샷 · {fmtDate(p.lockedAt)}</Badge>
            : <Badge tone="primary"><span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />실시간 집계{liveAt ? ` · ${fmtDate(liveAt)} 갱신` : ''}</Badge>}
          {stage.published_at && <span className="text-muted">공개 {fmtDate(stage.published_at)}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadLink href={`/api/export/${stage.id}?type=excel`}>결과표 엑셀</DownloadLink>
          <LinkButton href={`/a/p/${p.programId}/export?stage=${stage.id}`} variant="ghost" size="sm">내보내기</LinkButton>
          {!locked && <Button size="sm" onClick={() => { setLockWarnings(null); setLockOpen(true) }} disabled={busy || stage.status !== 'evaluating'}
            title={stage.status !== 'evaluating' ? '평가중 단계만 확정할 수 있습니다' : undefined}>순위 확정(잠금)</Button>}
          {stage.status === 'locked' && <Button size="sm" variant="secondary" onClick={() => setPubOpen(true)} disabled={busy}>결과 공개</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="심사 대상 기업" value={results.length} hint={`과락 ${results.filter(r => r.cutoff).length}개`} />
        <Stat label="집계 완료 기업" value={`${doneCompanies}/${results.length}`} tone={doneCompanies === results.length ? 'accent' : 'highlight'}
          hint={doneCompanies < results.length ? '미평가 심사위원 있음 → 집계 중' : '모든 평가 완료'} />
        <Stat label="최종 제출 심사위원" value={`${submittedJudges}/${p.progress.length}`} tone={submittedJudges === p.progress.length && p.progress.length > 0 ? 'accent' : 'highlight'} />
        <Stat label="미승인 가점" value={`${p.unapprovedBonusCount}건`} tone={p.unapprovedBonusCount ? 'highlight' : undefined} hint={p.unapprovedBonusCount ? '확정 시 0점 처리' : '승인분만 반영'} />
      </div>

      {/* 집계 방식 */}
      <Card title="집계 방식" actions={locked ? <Badge>확정 후 변경 불가</Badge> : null}>
        <div className="grid gap-4 md:grid-cols-3">
          <Toggle checked={stage.normalize} disabled={locked || busy} onChange={v => setOption('normalize', v)} label="점수 정규화"
            hint="심사위원별 50 + 10·(점수−평균)/표준편차. 평가 기업 5개 미만 심사위원은 원점수 사용" />
          <Toggle checked={stage.trim_extremes} disabled={locked || busy} onChange={v => setOption('trim_extremes', v)} label="최고·최저 제외"
            hint="심사위원 5명 이상인 기업만 최고·최저 1개씩 제외 후 평균" />
          <div className="text-sm text-muted">
            <div>가점·감점 상한 <b className="tabular text-fg">±{Number(stage.bonus_cap)}</b>점 (승인분만)</div>
            <div>편차 경고 기준 <b className="tabular text-fg">{Number(stage.deviation_alert)}</b>점</div>
            <div>동점: 우선 항목 평균 → 공동 순위</div>
          </div>
        </div>
      </Card>

      {/* 순위 */}
      <Card title="최종 순위" actions={locked ? <span className="text-sm text-muted">체크한 기업 = 통과</span> : null}>
        {results.length === 0 ? <p className="text-muted">심사 대상 기업이 없습니다.</p> : (
          <Table>
            <thead>
              <tr>
                {locked && <th className="w-8"><input type="checkbox" aria-label="전체 선택"
                  checked={selected.size > 0 && selected.size === results.filter(r => !r.cutoff).length}
                  onChange={e => setSelected(e.target.checked ? new Set(results.filter(r => !r.cutoff).map(r => r.company_id)) : new Set())} /></th>}
                <th>순위</th><th>코드</th><th>기업</th><th className="text-right">평가</th>
                <th className="text-right">원점수</th>{stage.normalize && <th className="text-right">정규화</th>}
                <th className="text-right">가감점</th><th className="text-right">최종 점수</th><th>상태</th><th>결과</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => {
                const c = companies[r.company_id]
                const top = r.rank === 1
                return (
                  <tr key={r.company_id} className={cn(top && 'bg-highlight/10', r.cutoff && 'text-muted')}>
                    {locked && <td><input type="checkbox" checked={selected.has(r.company_id)} onChange={() => toggleSel(r.company_id)} aria-label={`${label(r.company_id)} 통과`} /></td>}
                    <td className="tabular font-bold">
                      {r.rank == null ? '-' : top ? <span className="text-[#b07a00]">1위</span> : r.rank}{r.tied && <span className="ml-1 text-xs font-normal text-muted">공동</span>}
                    </td>
                    <td className="tabular text-muted">{c?.blind_code ?? ''}</td>
                    <td className="font-semibold">{label(r.company_id)}</td>
                    <td className="tabular text-right">{r.done_count}/{r.judge_count}</td>
                    <td className="tabular text-right">{fmtScore(r.raw, 3)}</td>
                    {stage.normalize && <td className="tabular text-right">{fmtScore(r.normalized, 3)}</td>}
                    <td className="tabular text-right">
                      {r.bonus ? (r.bonus > 0 ? `+${fmtScore(r.bonus)}` : fmtScore(r.bonus)) : '0'}
                      {r.bonus_pending ? <div className="text-xs text-[#8a5a00]">미승인 {fmtScore(r.bonus_pending)}</div> : null}
                    </td>
                    <td className={cn('tabular text-right text-base font-bold', top && 'text-[#b07a00]')}>{fmtScore(r.final, 3)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {r.cutoff && <Badge tone="danger" >과락 · {r.cutoff_criteria.map(id => crit.get(id)?.name).join(', ')}</Badge>}
                        {r.in_progress && <Badge tone="highlight">집계 중</Badge>}
                        {r.deviation_alert && <Badge tone="highlight">편차 {fmtScore(r.deviation)}</Badge>}
                        {top && <Badge tone="highlight">1위</Badge>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <ResultBadge value={c?.result ?? 'pending'} />
                      {c?.in_next && <Badge tone="primary" className="ml-1">이관됨</Badge>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
        {bonusPending > 0 && <p className="mt-2 text-xs text-muted">미승인 가점은 0점으로 계산됩니다(Q14). 적격 검토 화면에서 증빙을 승인하세요.</p>}
      </Card>

      {/* 통과자 선정 */}
      {locked && (
        <Card title="통과자 선정 → 다음 단계 이관">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-28"><label className="mb-1 block text-sm font-semibold">상위</label>
              <Input type="number" min={1} value={topN} onChange={e => setTopN(e.target.value)} placeholder="N" /></div>
            <Button variant="outline" onClick={pickTop} disabled={!topN}>상위 {topN || 'N'}개 선택</Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>선택 해제</Button>
            <div className="ml-auto text-sm text-muted">선택 <b className="tabular text-fg">{selected.size}</b>개 · 탈락 <b className="tabular text-fg">{results.length - selected.size}</b>개</div>
            <Button onClick={() => setAdvOpen(true)} disabled={busy}>{p.nextStage ? `통과 확정 → ${p.nextStage.name} 이관` : '통과 확정 (최종 단계)'}</Button>
          </div>
          <p className="mt-2 text-xs text-muted">과락 기업은 상위 N 선택에서 제외됩니다. 이관 시 통과 기업에 제출 안내 메일이 발송됩니다(n8n).</p>
        </Card>
      )}

      {/* 점수 매트릭스 */}
      <Card title="기업 × 심사위원 점수" actions={<span className="text-xs text-muted">심사위원 합계{stage.normalize ? ' · 괄호 = 정규화' : ''}</span>}>
        {judges.length === 0 ? <p className="text-muted">배정된 심사위원이 없습니다.</p> : (
          <Table>
            <thead>
              <tr>
                <th>기업</th>
                {judges.map(j => <th key={j.id} className="text-right">{j.name}{j.is_chair && <span className="ml-1 text-xs text-primary">위원장</span>}</th>)}
                <th className="text-right">평균</th><th className="text-right">편차</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => {
                const totals = new Map(r.judge_totals.map(t => [t.judge_id, t]))
                return (
                  <tr key={r.company_id}>
                    <td className="whitespace-nowrap font-semibold">{label(r.company_id)}</td>
                    {judges.map(j => {
                      const a = asgOf(r.company_id, j.id)
                      const t = totals.get(j.id)
                      if (!a) return <td key={j.id} className="text-right text-muted/50">·</td>
                      if (a.conflict) return <td key={j.id} className="text-right" title={a.conflict_reason ?? '이해충돌'}><Badge tone="danger">충돌</Badge></td>
                      if (t?.total == null) return <td key={j.id} className="text-right"><span className="text-xs text-[#8a5a00]">미완료</span></td>
                      return (
                        <td key={j.id} className="tabular text-right">
                          {fmtScore(t.total)}
                          {stage.normalize && <div className="text-xs text-muted">{t.normalization_applied ? `(${fmtScore(t.normalized)})` : '(미적용)'}</div>}
                        </td>
                      )
                    })}
                    <td className="tabular text-right font-semibold">{fmtScore(r.raw, 3)}</td>
                    <td className={cn('tabular text-right', r.deviation_alert && 'font-bold text-[#b07a00]')}>{fmtScore(r.deviation)}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/* 항목별 평균 */}
      <Card title="항목별 평균">
        {criteria.length === 0 ? <p className="text-muted">평가항목이 없습니다.</p> : (
          <Table>
            <thead>
              <tr>
                <th>기업</th>
                {criteria.map(c => (
                  <th key={c.id} className="text-right">{c.name}<div className="text-xs font-normal">배점 {fmtScore(c.max_score)}{c.min_pass_score != null && ` · 과락 <${fmtScore(c.min_pass_score)}`}</div></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.company_id}>
                  <td className="whitespace-nowrap font-semibold">{label(r.company_id)}</td>
                  {criteria.map(c => {
                    const v = r.criterion_avgs[c.id]
                    const fail = r.cutoff_criteria.includes(c.id)
                    return <td key={c.id} className={cn('tabular text-right', fail && 'font-bold text-danger')}>{fmtScore(v, 2)}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* 심사위원 제출 현황 */}
      <Card title="심사위원 평가표 제출">
        {p.progress.length === 0 ? <p className="text-muted">배정된 심사위원이 없습니다.</p> : (
          <Table>
            <thead><tr><th>심사위원</th><th className="text-right">완료/배정</th><th>최종 제출</th><th>재오픈 이력</th><th /></tr></thead>
            <tbody>
              {p.progress.map(x => (
                <tr key={x.judge_id}>
                  <td className="font-semibold">{x.name}{x.conflicts > 0 && <span className="ml-2 text-xs text-muted">이해충돌 제외 {x.conflicts}</span>}</td>
                  <td className={cn('tabular text-right', x.done < x.assigned && 'text-[#8a5a00]')}>{x.done}/{x.assigned}</td>
                  <td>
                    {x.submission?.status === 'submitted' ? <Badge tone="accent">제출 완료 · {fmtDate(x.submission.submitted_at)}</Badge>
                      : x.submission?.status === 'reopened' ? <Badge tone="highlight">재오픈됨</Badge>
                        : <Badge>미제출</Badge>}
                  </td>
                  <td className="text-xs text-muted">{x.submission?.reopened_at ? `${fmtDate(x.submission.reopened_at)} · ${x.submission.reopen_reason ?? ''}` : '-'}</td>
                  <td className="text-right">
                    {x.submission?.status === 'submitted' && !locked && (
                      <Button size="sm" variant="outline" onClick={() => { setReason(''); setReopen({ judge_id: x.judge_id, name: x.name }) }}>재오픈</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {p.chair && (
        <Card title={`심사위원장 종합 의견 — ${p.chair.name}`} actions={p.chair.confirmed_at ? <Badge tone="accent">확인 서명 {fmtDate(p.chair.confirmed_at)}</Badge> : <Badge tone="highlight">확인 전</Badge>}>
          {p.chair.opinion ? <p className="whitespace-pre-wrap">{p.chair.opinion}</p> : <p className="text-muted">작성된 종합 의견이 없습니다.</p>}
        </Card>
      )}

      {/* 심사평 */}
      <Card title="심사평 전체" actions={<DownloadLink href={`/api/export/${stage.id}?type=reviews`}>심사평 PDF</DownloadLink>}>
        <div className="grid gap-2">
          {results.map(r => {
            const mine = assignments.filter(a => a.company_id === r.company_id && !a.conflict)
            return (
              <details key={r.company_id} className="rounded-md border border-line">
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-2.5 font-semibold">
                  <span className="tabular w-8 text-muted">{r.rank ?? '-'}</span>{label(r.company_id)}
                  <span className="tabular ml-auto text-sm font-normal text-muted">최종 {fmtScore(r.final, 3)} · 심사위원 {mine.length}명</span>
                </summary>
                <div className="grid gap-4 border-t border-line px-4 py-3">
                  {mine.length === 0 && <p className="text-sm text-muted">배정된 심사위원이 없습니다.</p>}
                  {mine.map(a => {
                    const j = judges.find(j => j.id === a.judge_id)
                    const rv = reviewOf.get(a.id)
                    const total = r.judge_totals.find(t => t.judge_id === a.judge_id)?.total
                    return (
                      <div key={a.id}>
                        <div className="mb-1 flex items-center gap-2 text-sm font-bold">{j?.name ?? '심사위원'}<span className="tabular font-normal text-muted">합계 {fmtScore(total ?? null)}</span></div>
                        <div className="grid gap-1 text-sm">
                          {criteria.map(c => {
                            const s = scoreOf(a.id, c.id)
                            return (
                              <Fragment key={c.id}>
                                <div className="grid grid-cols-[140px_60px_1fr] gap-2">
                                  <span className="text-muted">{c.name}</span>
                                  <span className="tabular text-right">{s?.score == null ? '-' : fmtScore(s.score)}</span>
                                  <span className="whitespace-pre-wrap">{s?.comment || <span className="text-muted">-</span>}</span>
                                </div>
                              </Fragment>
                            )
                          })}
                          {rv?.overall_comment && <div className="mt-1 rounded-md bg-bg px-3 py-2"><b className="mr-2">종합</b><span className="whitespace-pre-wrap">{rv.overall_comment}</span></div>}
                          {rv?.qna_memo && <div className="rounded-md bg-bg px-3 py-2"><b className="mr-2">질의응답</b><span className="whitespace-pre-wrap">{rv.qna_memo}</span></div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </details>
            )
          })}
        </div>
      </Card>

      {/* 다이얼로그 */}
      <ConfirmDialog open={lockOpen} title={lockWarnings ? '확정 전 확인 필요' : '순위를 확정할까요?'} busy={busy}
        confirmLabel={lockWarnings ? '경고를 확인했고 확정합니다' : '확정'} tone={lockWarnings ? 'danger' : 'primary'}
        onClose={() => { setLockOpen(false); setLockWarnings(null) }} onConfirm={() => lock(!!lockWarnings)}>
        {lockWarnings ? (
          <>
            <ul className="grid gap-1.5">{lockWarnings.map(w => <li key={w} className="rounded-md bg-highlight/15 px-3 py-2 text-[#8a5a00]">{w}</li>)}</ul>
            <p className="text-muted">그대로 확정하면 현재 집계 결과가 스냅샷으로 저장됩니다.</p>
          </>
        ) : (
          <p>확정하면 심사위원 점수·심사평 수정이 잠기고, 현재 집계 결과({results.length}개 기업)가 stage_results 스냅샷으로 저장됩니다. 확정 해제는 단계 관리에서 사유와 함께 가능합니다.</p>
        )}
      </ConfirmDialog>

      <ConfirmDialog open={pubOpen} title="결과를 공개할까요?" busy={busy} confirmLabel="결과 공개" onClose={() => setPubOpen(false)} onConfirm={publish}>
        <p>참가 기업이 결과 확인 화면에서 통과/탈락을 볼 수 있습니다.{stage.score_visible ? ' 점수도 공개됩니다.' : ' 점수는 비공개입니다.'} 이의신청 기간 {stage.appeal_days}일이 시작됩니다.</p>
        {results.every(r => companies[r.company_id]?.result === 'pending') && <Alert tone="highlight">아직 통과자를 선정하지 않았습니다. 모든 기업이 &lsquo;심사 중&rsquo;으로 표시됩니다.</Alert>}
      </ConfirmDialog>

      <ConfirmDialog open={advOpen} title="통과자를 확정할까요?" busy={busy} confirmLabel="확정" onClose={() => setAdvOpen(false)} onConfirm={advance}>
        <p>통과 <b className="tabular">{selected.size}</b>개, 탈락 <b className="tabular">{results.length - selected.size}</b>개로 저장합니다.
          {p.nextStage ? ` 통과 기업은 '${p.nextStage.name}' 단계 참가 기업으로 등록되고 제출 안내 메일이 발송됩니다.` : ' 다음 단계가 없어 이관은 하지 않습니다.'}</p>
        <div className="max-h-48 overflow-y-auto rounded-md border border-line px-3 py-2">
          {results.filter(r => selected.has(r.company_id)).map(r => (
            <div key={r.company_id} className="flex justify-between text-sm"><span>{label(r.company_id)}</span><span className="tabular text-muted">{r.rank ?? '-'}위 · {fmtScore(r.final, 3)}</span></div>
          ))}
          {selected.size === 0 && <span className="text-muted">선택한 기업이 없습니다 — 전원 탈락 처리됩니다.</span>}
        </div>
      </ConfirmDialog>

      <ConfirmDialog open={!!reopen} title={`${reopen?.name ?? ''} 평가 재오픈`} busy={busy} confirmLabel="재오픈" tone="danger"
        disabled={reason.trim().length < 2} onClose={() => setReopen(null)} onConfirm={doReopen}>
        <p>최종 제출을 취소하고 심사위원이 점수·심사평을 다시 수정할 수 있게 합니다. 사유는 감사로그에 남습니다.</p>
        <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="재오픈 사유 (필수)" autoFocus />
      </ConfirmDialog>
    </div>
  )
}
