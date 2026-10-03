'use client'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { Alert, Badge, Button, Empty, Input, Select, cn } from '@/components/ui'
import { EligibilityBadge } from '@/components/StatusBadges'
import { Feedback, must, useRun } from '@/components/admin/setup/client'
import { ELIGIBILITY, fmtDate, fmtScore, fromLocalInput, toLocalInput } from '@/lib/format'
import type { ApplicationField, BonusRule, Company, Eligibility, EligibilityCheck, EntryBonus, EntryResult, Stage, Submission } from '@/lib/types'

export type EntryView = {
  entry: { id: string; eligibility: Eligibility; result: EntryResult }
  company: Company
  answers: Record<string, unknown>
  submissions: Submission[]
  checks: EligibilityCheck[]
  bonuses: EntryBonus[]
}

const RESULT_LABEL = { pass: '충족', fail: '미충족', supplement: '보완 요청' } as const
const RESULT_TONE = { pass: 'accent', fail: 'danger', supplement: 'highlight' } as const

const fileUrl = (path: string) => `/api/admin/files/url?path=${encodeURIComponent(path)}`

function AnswerValue({ v }: { v: unknown }) {
  if (v == null || v === '') return <span className="text-muted">-</span>
  if (typeof v === 'boolean') return v ? <Badge tone="accent">예</Badge> : <Badge>아니오</Badge>
  if (Array.isArray(v)) return <>{v.map(String).join(', ')}</>
  if (typeof v === 'object') {
    const o = v as { path?: string; name?: string; file_name?: string; value?: unknown }
    if (o.path) return <a className="font-semibold text-primary hover:underline" href={fileUrl(o.path)} target="_blank" rel="noopener">{o.name ?? o.file_name ?? '첨부 파일'}</a>
    if ('value' in o) return <AnswerValue v={o.value} />
    return <>{JSON.stringify(v)}</>
  }
  return <span className="whitespace-pre-line">{String(v)}</span>
}

type CheckDraft = { item: string; result: 'pass' | 'fail' | 'supplement'; due_at: string; note: string }
const weekLater = () => toLocalInput(new Date(Date.now() + 7 * 86_400_000).toISOString()).slice(0, 10) + 'T18:00'

function EntryCard({ row, stage, fields, rules, adminId }: { row: EntryView; stage: Stage; fields: ApplicationField[]; rules: BonusRule[]; adminId: string }) {
  const { busy, error, notice, run } = useRun()
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<CheckDraft[]>([])
  const [decision, setDecision] = useState<'' | Eligibility>('')
  const { entry, company } = row
  const locked = stage.status === 'locked' || stage.status === 'published'
  const req = stage.required_files
  const have = new Map(row.submissions.map(s => [s.file_type, s]))
  const missingReq = req.filter(f => f.required && !have.has(f.type))
  const eligFields = fields.filter(f => f.is_eligibility)
  const otherFields = fields.filter(f => !f.is_eligibility)
  const pendingBonus = row.bonuses.filter(b => !b.approved_at && !b.rejected).length
  const openSupp = row.checks.filter(c => c.result === 'supplement' && !c.resolved_at)
  const ruleMap = new Map(rules.map(r => [r.id, r]))

  const addDraft = (item = '', result: CheckDraft['result'] = 'pass') =>
    setDrafts(d => [...d, { item, result, due_at: result === 'supplement' ? weekLater() : '', note: '' }])
  const setDraft = (i: number, p: Partial<CheckDraft>) =>
    setDrafts(d => d.map((x, k) => (k === i ? { ...x, ...p, ...(p.result === 'supplement' && !x.due_at ? { due_at: weekLater() } : {}) } : x)))

  function seed() {
    const items: CheckDraft[] = [
      ...eligFields.map(f => ({ item: f.label, result: 'pass' as const, due_at: '', note: '' })),
      ...req.filter(f => f.required).map(f => have.has(f.type)
        ? { item: `필수서류: ${f.label}`, result: 'pass' as const, due_at: '', note: '' }
        : { item: `필수서류: ${f.label}`, result: 'supplement' as const, due_at: weekLater(), note: '미제출' }),
    ]
    setDrafts(items.length ? items : [{ item: '신청 자격', result: 'pass', due_at: '', note: '' }])
  }

  const auto: Eligibility | null = drafts.length
    ? drafts.some(d => d.result === 'fail') ? 'ineligible' : drafts.some(d => d.result === 'supplement') ? 'supplement' : 'eligible'
    : null
  const finalDecision = decision || auto

  async function submit() {
    if (drafts.some(d => !d.item.trim())) return alert('검토 항목명을 입력해 주세요.')
    if (drafts.some(d => d.result === 'supplement' && !d.due_at)) return alert('보완 요청 항목에는 기한을 지정해 주세요.')
    if (!finalDecision) return alert('검토 항목을 추가하거나 판정을 선택해 주세요.')
    const msg = finalDecision === 'supplement' ? '보완 요청 알림이 기업에 발송됩니다.'
      : finalDecision === 'ineligible' ? '부적격 처리하면 심사 대상(배정·집계)에서 제외됩니다.' : ''
    if (!confirm(`${company.name}: ${ELIGIBILITY[finalDecision]}(으)로 판정합니다.${msg ? `\n${msg}` : ''}`)) return
    const ok = await run(async () => {
      await api(`/api/eligibility/${entry.id}`, {
        method: 'PATCH',
        body: {
          checks: drafts.map(d => ({ item: d.item.trim(), result: d.result, due_at: d.result === 'supplement' ? fromLocalInput(d.due_at) : null, note: d.note.trim() || null })),
          eligibility: finalDecision,
        },
      })
    }, { success: `${ELIGIBILITY[finalDecision]} 처리됨` })
    if (ok) { setDrafts([]); setDecision('') }
  }

  async function bonusAction(b: EntryBonus, action: 'approve' | 'reject' | 'reset') {
    const r = ruleMap.get(b.rule_id)
    if (action === 'reject' && !confirm(`'${r?.name}' 증빙을 반려합니다. 이 가점은 반영되지 않습니다.`)) return
    const patch = action === 'approve' ? { approved_by: adminId, approved_at: new Date().toISOString(), rejected: false }
      : action === 'reject' ? { approved_by: null, approved_at: null, rejected: true }
      : { approved_by: null, approved_at: null, rejected: false }
    await run(async () => { must(await supabaseBrowser().from('entry_bonuses').update(patch).eq('id', b.id)) })
  }

  return (
    <li className={cn('rounded-lg border bg-card', entry.eligibility === 'supplement' ? 'border-highlight/60' : 'border-line')}>
      <button className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(o => !o)}>
        <span className="tabular w-12 text-sm text-muted">{company.blind_code}</span>
        <span className="min-w-[140px] flex-1 font-semibold">{company.name}<span className="ml-2 text-xs font-normal text-muted">{company.ceo ?? ''}{company.biz_no ? ` · ${company.biz_no}` : ''}</span></span>
        {!company.application_submitted_at && fields.length > 0 && <Badge>신청서 미제출</Badge>}
        {req.length > 0 && (missingReq.length ? <Badge tone="highlight">필수서류 {req.filter(f => f.required).length - missingReq.length}/{req.filter(f => f.required).length}</Badge> : <Badge tone="accent">서류 완비</Badge>)}
        {pendingBonus > 0 && <Badge tone="highlight">가점 증빙 {pendingBonus}</Badge>}
        {openSupp.length > 0 && <span className="text-xs text-[#8a5a00]">보완 기한 {fmtDate(openSupp.map(c => c.due_at).filter(Boolean).sort()[0] ?? null)}</span>}
        <EligibilityBadge value={entry.eligibility} />
        <span className="text-muted">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="grid gap-5 border-t border-line p-4 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            <section>
              <h3 className="mb-2 text-sm font-bold">자격요건 응답</h3>
              {eligFields.length === 0 ? <p className="text-sm text-muted">자격요건 항목이 없습니다. (설정·신청서에서 지정)</p> : (
                <dl className="grid gap-1.5 text-sm">
                  {eligFields.map(f => (
                    <div key={f.id} className="grid grid-cols-[minmax(120px,40%)_1fr] gap-2">
                      <dt className="text-muted">{f.label}{f.required && <span className="text-danger">*</span>}</dt>
                      <dd><AnswerValue v={row.answers[f.id]} /></dd>
                    </div>
                  ))}
                </dl>
              )}
              {otherFields.length > 0 && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-muted">기타 신청 항목 ({otherFields.length})</summary>
                  <dl className="mt-2 grid gap-1.5">
                    {otherFields.map(f => (
                      <div key={f.id} className="grid grid-cols-[minmax(120px,40%)_1fr] gap-2">
                        <dt className="text-muted">{f.label}</dt><dd><AnswerValue v={row.answers[f.id]} /></dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-bold">필수서류</h3>
              {req.length === 0 ? <p className="text-sm text-muted">이 단계에는 제출 파일이 없습니다.</p> : (
                <ul className="grid gap-1 text-sm">
                  {req.map(f => {
                    const s = have.get(f.type)
                    return (
                      <li key={f.type} className="flex items-center gap-2">
                        {s ? <Badge tone="accent">제출</Badge> : <Badge tone={f.required ? 'highlight' : 'neutral'}>미제출</Badge>}
                        <span>{f.label}{!f.required && <span className="text-muted"> (선택)</span>}</span>
                        {s && <a className="truncate text-xs font-semibold text-primary hover:underline" href={fileUrl(s.pdf_path ?? s.storage_path)} target="_blank" rel="noopener">{s.file_name} · v{s.version}</a>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {rules.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-bold">가점·감점 증빙</h3>
                {row.bonuses.length === 0 ? <p className="text-sm text-muted">신청 없음</p> : (
                  <ul className="grid gap-2 text-sm">
                    {row.bonuses.map(b => {
                      const r = ruleMap.get(b.rule_id)
                      return (
                        <li key={b.id} className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{r?.name}</span>
                          <span className="tabular">{Number(r?.points) > 0 ? '+' : ''}{fmtScore(Number(r?.points))}</span>
                          {b.evidence_path ? <a className="text-xs font-semibold text-primary hover:underline" href={fileUrl(b.evidence_path)} target="_blank" rel="noopener">증빙 보기</a>
                            : r?.evidence_required ? <span className="text-xs text-[#8a5a00]">증빙 없음</span> : null}
                          {b.approved_at ? <Badge tone="accent">승인 {fmtDate(b.approved_at, false)}</Badge> : b.rejected ? <Badge tone="danger">반려</Badge> : <Badge tone="highlight">승인 대기</Badge>}
                          {!locked && (
                            <span className="ml-auto flex gap-1">
                              {!b.approved_at && <Button size="sm" variant="secondary" disabled={busy || (!!r?.evidence_required && !b.evidence_path)} onClick={() => bonusAction(b, 'approve')}>승인</Button>}
                              {!b.rejected && <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => bonusAction(b, 'reject')}>반려</Button>}
                              {(b.approved_at || b.rejected) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => bonusAction(b, 'reset')}>되돌리기</Button>}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )}
          </div>

          <div className="grid content-start gap-4">
            <section>
              <h3 className="mb-2 text-sm font-bold">검토 이력</h3>
              {row.checks.length === 0 ? <p className="text-sm text-muted">검토 기록이 없습니다.</p> : (
                <ul className="grid gap-1.5 text-sm">
                  {row.checks.map(c => (
                    <li key={c.id} className="flex flex-wrap items-start gap-2">
                      <Badge tone={RESULT_TONE[c.result]}>{RESULT_LABEL[c.result]}</Badge>
                      <span className="font-semibold">{c.item}</span>
                      {c.note && <span className="text-muted">— {c.note}</span>}
                      {c.result === 'supplement' && (c.resolved_at
                        ? <span className="text-xs text-accent">보완 제출 {fmtDate(c.resolved_at)}</span>
                        : <span className="text-xs text-[#8a5a00]">기한 {fmtDate(c.due_at)}</span>)}
                      <span className="ml-auto text-xs text-muted">{fmtDate((c as EligibilityCheck & { created_at?: string }).created_at ?? null)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-md border border-line bg-bg p-3">
              <Feedback error={error} notice={notice} />
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold">새 검토</h3>
                <div className="flex gap-1">
                  {drafts.length === 0 && <Button size="sm" variant="secondary" onClick={seed}>체크리스트 불러오기</Button>}
                  <Button size="sm" variant="ghost" onClick={() => addDraft()}>+ 항목</Button>
                </div>
              </div>
              {drafts.length > 0 && (
                <ul className="mb-3 grid gap-2">
                  {drafts.map((d, i) => (
                    <li key={i} className="grid gap-1.5 rounded border border-line bg-card p-2">
                      <div className="flex gap-1.5">
                        <Input className="h-8 flex-1 text-sm" value={d.item} onChange={e => setDraft(i, { item: e.target.value })} placeholder="검토 항목" />
                        <Select className="h-8 w-28 text-sm" value={d.result} onChange={e => setDraft(i, { result: e.target.value as CheckDraft['result'] })}>
                          <option value="pass">충족</option><option value="supplement">보완 요청</option><option value="fail">미충족</option>
                        </Select>
                        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDrafts(x => x.filter((_, k) => k !== i))}>×</Button>
                      </div>
                      <div className="flex gap-1.5">
                        <Input className="h-8 flex-1 text-sm" value={d.note} onChange={e => setDraft(i, { note: e.target.value })} placeholder="메모 (기업에 표시)" />
                        {d.result === 'supplement' && <Input className="h-8 w-48 text-sm" type="datetime-local" value={d.due_at} onChange={e => setDraft(i, { due_at: e.target.value })} aria-label="보완 기한" />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Select className="h-9 w-auto text-sm" value={decision} onChange={e => setDecision(e.target.value as Eligibility | '')}>
                  <option value="">판정: 자동{auto ? ` (${ELIGIBILITY[auto]})` : ''}</option>
                  <option value="eligible">적격</option>
                  <option value="supplement">보완 요청</option>
                  <option value="ineligible">부적격</option>
                  <option value="pending">검토 전으로</option>
                </Select>
                <Button size="sm" onClick={submit} disabled={busy || (!drafts.length && !decision)}>판정 저장</Button>
              </div>
            </section>
          </div>
        </div>
      )}
    </li>
  )
}

export default function EligibilityReview({ stage, rows, fields, rules, adminId }:
  { stage: Stage; rows: EntryView[]; fields: ApplicationField[]; rules: BonusRule[]; adminId: string }) {
  const [filter, setFilter] = useState<'all' | Eligibility | 'bonus'>('all')
  const count = (e: Eligibility) => rows.filter(r => r.entry.eligibility === e).length
  const bonusPending = rows.filter(r => r.bonuses.some(b => !b.approved_at && !b.rejected)).length
  const list = filter === 'all' ? rows
    : filter === 'bonus' ? rows.filter(r => r.bonuses.some(b => !b.approved_at && !b.rejected))
    : rows.filter(r => r.entry.eligibility === filter)

  if (!rows.length) return <Empty>이 단계의 참가 기업이 없습니다.</Empty>
  return (
    <div className="grid gap-4">
      {stage.status === 'evaluating' && <Alert tone="highlight">평가가 진행 중입니다. 부적격 처리 시 해당 기업은 집계·순위에서 제외됩니다.</Alert>}
      <div className="flex flex-wrap gap-1">
        {([['all', '전체', rows.length], ['pending', '검토 전', count('pending')], ['supplement', '보완 요청', count('supplement')],
          ['eligible', '적격', count('eligible')], ['ineligible', '부적격', count('ineligible')], ['bonus', '가점 승인 대기', bonusPending]] as const).map(([k, label, n]) => (
          <Button key={k} size="sm" variant={filter === k ? 'secondary' : 'ghost'} onClick={() => setFilter(k)}>
            {label} <span className={cn('tabular text-xs', k === 'bonus' && n > 0 ? 'text-[#8a5a00]' : 'text-muted')}>{n}</span>
          </Button>
        ))}
      </div>
      {list.length === 0 ? <Empty>해당하는 기업이 없습니다.</Empty> : (
        <ul className="grid gap-2">{list.map(r => <EntryCard key={r.entry.id} row={r} stage={stage} fields={fields} rules={rules} adminId={adminId} />)}</ul>
      )}
    </div>
  )
}
