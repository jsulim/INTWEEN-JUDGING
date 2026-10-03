'use client'
import Link from 'next/link'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { Alert, Badge, Button, Card, Empty, Field, Input, cn } from '@/components/ui'
import { StageStatusBadge } from '@/components/StatusBadges'
import { Check, Feedback, must, num, useRun } from '@/components/admin/setup/client'
import { STAGE_FLOW, STAGE_STATUS, fmtDate, fromLocalInput, toLocalInput } from '@/lib/format'
import type { RequiredFile, Stage, StageStatus } from '@/lib/types'

export type StageStats = { entries: number; assignments: number; criteria: number; maxTotal: number }

type Draft = {
  name: string; order_no: string
  submit_start: string; submit_end: string; eval_start: string; eval_end: string
  required_files: RequiredFile[]
  score_visible: boolean; blind_mode: boolean; normalize: boolean; trim_extremes: boolean; is_presentation: boolean
  bonus_cap: string; appeal_days: string; deviation_alert: string
}

const PRESET_FILES: RequiredFile[] = [
  { type: 'plan', label: '사업계획서', accept: ['pdf'], required: true },
  { type: 'deck', label: '발표자료', accept: ['pdf', 'pptx'], required: true },
]

function toDraft(s: Stage | null, nextOrder: number): Draft {
  return {
    name: s?.name ?? (nextOrder === 1 ? '1차 서류심사' : `${nextOrder}차 발표심사`),
    order_no: String(s?.order_no ?? nextOrder),
    submit_start: toLocalInput(s?.submit_start), submit_end: toLocalInput(s?.submit_end),
    eval_start: toLocalInput(s?.eval_start), eval_end: toLocalInput(s?.eval_end),
    required_files: s?.required_files ?? (nextOrder === 1 ? [PRESET_FILES[0]] : [PRESET_FILES[1]]),
    score_visible: s?.score_visible ?? false,
    blind_mode: s?.blind_mode ?? nextOrder === 1,
    normalize: s?.normalize ?? false,
    trim_extremes: s?.trim_extremes ?? false,
    is_presentation: s?.is_presentation ?? nextOrder > 1,
    bonus_cap: String(s?.bonus_cap ?? 5),
    appeal_days: String(s?.appeal_days ?? 3),
    deviation_alert: String(s?.deviation_alert ?? 20),
  }
}

function validate(d: Draft): string | null {
  if (!d.name.trim()) return '단계명을 입력해 주세요.'
  if (!Number.isInteger(Number(d.order_no)) || Number(d.order_no) < 1) return '순서는 1 이상의 정수여야 합니다.'
  if (d.submit_start && d.submit_end && d.submit_start > d.submit_end) return '접수 시작이 접수 마감보다 늦습니다.'
  if (d.eval_start && d.eval_end && d.eval_start > d.eval_end) return '평가 시작이 평가 마감보다 늦습니다.'
  const types = d.required_files.map(f => f.type.trim())
  if (types.some(t => !/^[a-z0-9_]+$/.test(t))) return '파일 코드는 영문 소문자·숫자·_ 만 사용할 수 있습니다. (예: plan, deck)'
  if (new Set(types).size !== types.length) return '파일 코드가 중복됩니다.'
  if (d.required_files.some(f => !f.label.trim() || f.accept.length === 0)) return '제출 파일의 이름과 허용 형식을 지정해 주세요.'
  return null
}

function toRow(d: Draft) {
  return {
    name: d.name.trim(),
    order_no: Number(d.order_no),
    submit_start: fromLocalInput(d.submit_start), submit_end: fromLocalInput(d.submit_end),
    eval_start: fromLocalInput(d.eval_start), eval_end: fromLocalInput(d.eval_end),
    required_files: d.required_files.map(f => ({ ...f, type: f.type.trim(), label: f.label.trim() })),
    score_visible: d.score_visible, blind_mode: d.blind_mode, normalize: d.normalize,
    trim_extremes: d.trim_extremes, is_presentation: d.is_presentation,
    bonus_cap: num(d.bonus_cap) ?? 5, appeal_days: num(d.appeal_days) ?? 3, deviation_alert: num(d.deviation_alert) ?? 20,
  }
}

function FilesEditor({ files, onChange, disabled }: { files: RequiredFile[]; onChange: (f: RequiredFile[]) => void; disabled?: boolean }) {
  const set = (i: number, patch: Partial<RequiredFile>) => onChange(files.map((f, k) => (k === i ? { ...f, ...patch } : f)))
  const toggleAccept = (i: number, ext: 'pdf' | 'pptx') => {
    const cur = files[i].accept
    set(i, { accept: cur.includes(ext) ? cur.filter(x => x !== ext) : [...cur, ext] })
  }
  return (
    <div className="grid gap-2">
      {files.length === 0 && <p className="text-sm text-muted">제출 파일 없음 (신청서만 받거나 발표만 진행하는 단계)</p>}
      {files.map((f, i) => (
        <div key={i} className="grid items-center gap-2 rounded-md border border-line p-2 sm:grid-cols-[110px_1fr_auto_auto_auto]">
          <Input className="h-9 text-sm" value={f.type} disabled={disabled} onChange={e => set(i, { type: e.target.value.toLowerCase() })} placeholder="코드 (plan)" aria-label="파일 코드" />
          <Input className="h-9 text-sm" value={f.label} disabled={disabled} onChange={e => set(i, { label: e.target.value })} placeholder="표시 이름 (사업계획서)" aria-label="표시 이름" />
          <div className="flex gap-3 text-sm">
            {(['pdf', 'pptx'] as const).map(ext => (
              <label key={ext} className="flex items-center gap-1">
                <input type="checkbox" disabled={disabled} checked={f.accept.includes(ext)} onChange={() => toggleAccept(i, ext)} />{ext.toUpperCase()}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" disabled={disabled} checked={f.required} onChange={e => set(i, { required: e.target.checked })} />필수</label>
          <Button type="button" size="sm" variant="ghost" className="text-danger" disabled={disabled} onClick={() => onChange(files.filter((_, k) => k !== i))}>삭제</Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange([...files, { type: '', label: '', accept: ['pdf'], required: true }])}>+ 파일 슬롯</Button>
        {PRESET_FILES.filter(p => !files.some(f => f.type === p.type)).map(p => (
          <Button key={p.type} type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange([...files, p])}>+ {p.label}</Button>
        ))}
      </div>
    </div>
  )
}

function StageForm({ draft, setDraft, locked }: { draft: Draft; setDraft: (d: Draft) => void; locked?: boolean }) {
  const s = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value })
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
        <Field label="단계명" required><Input value={draft.name} onChange={s('name')} /></Field>
        <Field label="순서" required><Input type="number" min={1} value={draft.order_no} onChange={s('order_no')} /></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="접수 시작 (KST)"><Input type="datetime-local" value={draft.submit_start} onChange={s('submit_start')} /></Field>
          <Field label="접수 마감"><Input type="datetime-local" value={draft.submit_end} onChange={s('submit_end')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="평가 시작 (KST)"><Input type="datetime-local" value={draft.eval_start} onChange={s('eval_start')} /></Field>
          <Field label="평가 마감"><Input type="datetime-local" value={draft.eval_end} onChange={s('eval_end')} /></Field>
        </div>
      </div>
      <div>
        <div className="mb-1 text-sm font-semibold">제출 파일 슬롯</div>
        <FilesEditor files={draft.required_files} onChange={f => setDraft({ ...draft, required_files: f })} disabled={locked} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Check label="블라인드 심사" checked={draft.blind_mode} onChange={v => setDraft({ ...draft, blind_mode: v })}
          hint="심사위원 화면·파일명에서 기업명·대표자명을 코드(A-03)로 마스킹. 기업 업로드 화면에 '식별 정보 제외' 안내가 표시됩니다." />
        <Check label="발표심사 단계" checked={draft.is_presentation} onChange={v => setDraft({ ...draft, is_presentation: v })}
          hint="발표 순서 추첨·타이머·현장 모드(A-13, J-06) 사용" />
        <Check label="점수 정규화" checked={draft.normalize} onChange={v => setDraft({ ...draft, normalize: v })}
          hint="심사위원별 성향 보정(50+10·z). 1인 평가 기업 5개 미만이면 미적용, 원점수 병기" />
        <Check label="최고·최저 점수 제외" checked={draft.trim_extremes} onChange={v => setDraft({ ...draft, trim_extremes: v })}
          hint="심사위원 5명 이상일 때 최고·최저 1개씩 제외 후 평균" />
        <Check label="결과 공개 시 점수 공개" checked={draft.score_visible} onChange={v => setDraft({ ...draft, score_visible: v })}
          hint="끄면 기업에는 통과/탈락만 표시" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="가점·감점 상한 (±점)"><Input type="number" min={0} step={0.5} value={draft.bonus_cap} onChange={s('bonus_cap')} /></Field>
        <Field label="이의신청 기간 (일)" hint="결과 공개 후"><Input type="number" min={0} value={draft.appeal_days} onChange={s('appeal_days')} /></Field>
        <Field label="점수 편차 경고 기준 (점)" hint="동일 기업 심사위원 간 총점 차"><Input type="number" min={0} step={1} value={draft.deviation_alert} onChange={s('deviation_alert')} /></Field>
      </div>
    </div>
  )
}

function StatusControl({ stage, stats }: { stage: Stage; stats: StageStats }) {
  const { busy, error, notice, run } = useRun()
  const cur = STAGE_FLOW.indexOf(stage.status)

  async function go(target: StageStatus) {
    if (target === stage.status) return
    const to = STAGE_FLOW.indexOf(target)
    const back = to < cur
    const unlocking = back && (stage.status === 'locked' || stage.status === 'published')
    const label = `${STAGE_STATUS[stage.status]} → ${STAGE_STATUS[target]}`

    // 확정(잠금) 전진: /lock (점수 스냅샷)
    if (target === 'locked' && !back) {
      if (stage.status !== 'evaluating' && !confirm('평가중 단계가 아닙니다. 그래도 확정하시겠습니까?')) return
      if (!confirm(`${label}\n점수를 확정합니다. 확정 후 심사위원은 점수를 수정할 수 없습니다.`)) return
      await run(async () => {
        // 경고가 있으면 /lock 이 409 { warnings } 를 돌려준다 → 확인 후 force 로 재요청
        const res = await fetch(`/api/stages/${stage.id}/lock`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
        const data = (await res.json().catch(() => ({}))) as { warnings?: string[]; error?: string }
        if (res.status === 409 && data.warnings?.length) {
          if (!confirm(`확인 필요:\n- ${data.warnings.join('\n- ')}\n\n그래도 확정하시겠습니까?`)) throw new Error('확정을 취소했습니다.')
          await api(`/api/stages/${stage.id}/lock`, { body: { force: true } })
        } else if (!res.ok) throw new Error(data.error || `확정 실패 (${res.status})`)
      }, { success: '확정했습니다.' })
      return
    }

    let reason = ''
    if (unlocking) {
      reason = prompt(`${label}\n확정 해제 사유를 입력하세요. (감사로그에 기록됩니다)`)?.trim() ?? ''
      if (!reason) return
      if (!confirm(`확정을 해제합니다.\n${target === 'evaluating' ? '심사위원이 다시 점수를 수정할 수 있게 됩니다.\n' : ''}사유: ${reason}`)) return
    } else {
      const warn: string[] = []
      if (target === 'submitting' && stage.required_files.length === 0) warn.push('제출 파일 슬롯이 없습니다.')
      if (target === 'evaluating' && stats.criteria === 0) warn.push('평가항목이 없습니다.')
      if (target === 'evaluating' && stats.assignments === 0) warn.push('배정된 심사위원이 없습니다.')
      if (target === 'evaluating' && !back) warn.push('심사위원에게 평가 시작 알림이 발송됩니다.')
      if (target === 'published') warn.push('참가 기업에 통과/탈락 결과가 공개되고 알림이 발송됩니다.')
      if (back) warn.push('이전 상태로 되돌립니다.')
      if (!confirm(`${label}\n${warn.map(w => `· ${w}`).join('\n')}`)) return
    }
    await run(async () => {
      await api(`/api/stages/${stage.id}/status`, { method: 'PATCH', body: { status: target, reason: reason || undefined } })
    }, { success: `상태 변경: ${label}` })
  }

  return (
    <div>
      <Feedback error={error} notice={notice} />
      <div className="flex flex-wrap items-center gap-1">
        {STAGE_FLOW.map((st, i) => (
          <div key={st} className="flex items-center">
            <button disabled={busy} onClick={() => go(st)}
              className={cn('rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50',
                st === stage.status ? 'border-primary bg-primary text-primary-fg'
                  : i < cur ? 'border-line bg-bg text-muted hover:border-primary/50'
                  : 'border-line bg-card hover:border-primary hover:text-primary')}
              title={st === stage.status ? '현재 상태' : i < cur ? '되돌리기' : '앞당기기'}>
              {STAGE_STATUS[st]}
            </button>
            {i < STAGE_FLOW.length - 1 && <span className="px-1 text-muted">→</span>}
          </div>
        ))}
      </div>
      {stage.published_at && <p className="mt-1 text-xs text-muted">결과 공개 {fmtDate(stage.published_at)}</p>}
    </div>
  )
}

function StageCard({ programId, stage, stats }: { programId: string; stage: Stage; stats: StageStats }) {
  const { busy, error, notice, run } = useRun()
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState(() => toDraft(stage, stage.order_no))
  const locked = stage.status === 'locked' || stage.status === 'published'

  async function save() {
    const v = validate(draft)
    if (v) return alert(v)
    if (stage.status === 'evaluating' && !confirm('평가가 진행 중인 단계입니다. 설정을 바꾸면 집계 결과가 달라질 수 있습니다. 저장할까요?')) return
    const ok = await run(async () => { must(await supabaseBrowser().from('stages').update(toRow(draft)).eq('id', stage.id)) }, { success: '저장됨' })
    if (ok) setEdit(false)
  }
  async function remove() {
    if (stage.status !== 'ready') return alert('준비 상태의 단계만 삭제할 수 있습니다.')
    if (!confirm(`'${stage.name}' 단계를 삭제합니다.${stats.entries ? `\n참가 기업 ${stats.entries}곳의 단계 참가 정보·제출물·배정·평가항목이 함께 삭제됩니다.` : ''}`)) return
    await run(async () => { must(await supabaseBrowser().from('stages').delete().eq('id', stage.id)) })
  }

  const base = `/a/p/${programId}`
  return (
    <Card title={<span className="flex items-center gap-2"><span className="tabular text-muted">{stage.order_no}.</span>{stage.name}<StageStatusBadge status={stage.status} /></span>}
      actions={edit ? (
        <>
          <Button size="sm" onClick={save} disabled={busy}>저장</Button>
          <Button size="sm" variant="ghost" onClick={() => { setEdit(false); setDraft(toDraft(stage, stage.order_no)) }}>취소</Button>
        </>
      ) : (
        <>
          <Button size="sm" variant="outline" onClick={() => setEdit(true)}>설정 수정</Button>
          {stage.status === 'ready' && <Button size="sm" variant="ghost" className="text-danger" onClick={remove} disabled={busy}>삭제</Button>}
        </>
      )}>
      <Feedback error={error} notice={notice} />
      {edit ? (
        <>
          {locked && <div className="mb-3"><Alert tone="highlight">확정된 단계입니다. 일정·옵션 변경은 결과 해석에 영향을 줄 수 있습니다.</Alert></div>}
          <StageForm draft={draft} setDraft={setDraft} />
        </>
      ) : (
        <div className="grid gap-4">
          <StatusControl stage={stage} stats={stats} />
          <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><span className="text-muted">접수</span> {fmtDate(stage.submit_start)} ~ {fmtDate(stage.submit_end)}</div>
            <div><span className="text-muted">평가</span> {fmtDate(stage.eval_start)} ~ {fmtDate(stage.eval_end)}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stage.required_files.length === 0 ? <Badge>제출 파일 없음</Badge> : stage.required_files.map(f => (
              <Badge key={f.type} tone="primary">{f.label} · {f.accept.map(a => a.toUpperCase()).join('/')}{f.required ? '' : ' (선택)'}</Badge>
            ))}
            {stage.blind_mode && <Badge>블라인드</Badge>}
            {stage.is_presentation && <Badge>발표심사</Badge>}
            {stage.normalize && <Badge>정규화</Badge>}
            {stage.trim_extremes && <Badge>최고·최저 제외</Badge>}
            {stage.score_visible && <Badge>점수 공개</Badge>}
            <Badge>가점 상한 ±{Number(stage.bonus_cap)}</Badge>
            <Badge>이의신청 {stage.appeal_days}일</Badge>
            <Badge>편차 경고 {Number(stage.deviation_alert)}점</Badge>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-line pt-3 text-sm">
            <Link className="hover:text-primary" href={`${base}/companies`}>참가 기업 <b className="tabular">{stats.entries}</b></Link>
            <Link className={cn('hover:text-primary', stats.criteria === 0 && 'text-[#8a5a00]')} href={`${base}/criteria?stage=${stage.id}`}>
              평가항목 <b className="tabular">{stats.criteria}</b>{stats.criteria > 0 && <span className="text-muted"> ({stats.maxTotal}점)</span>}
            </Link>
            <Link className={cn('hover:text-primary', stats.assignments === 0 && 'text-[#8a5a00]')} href={`${base}/assignments?stage=${stage.id}`}>배정 <b className="tabular">{stats.assignments}</b></Link>
          </div>
        </div>
      )}
    </Card>
  )
}

export default function StagesManager({ programId, stages, stats, companyCount }:
  { programId: string; stages: Stage[]; stats: Record<string, StageStats>; companyCount: number }) {
  const nextOrder = (stages.at(-1)?.order_no ?? 0) + 1
  const [adding, setAdding] = useState(stages.length === 0)
  const [draft, setDraft] = useState(() => toDraft(null, nextOrder))
  const { busy, error, notice, run } = useRun()

  async function add() {
    const v = validate(draft)
    if (v) return alert(v)
    const ok = await run(async () => {
      const sb = supabaseBrowser()
      const created = must(await sb.from('stages').insert({ ...toRow(draft), program_id: programId }).select('id, order_no').single()) as { id: string; order_no: number }
      // 첫 단계(가장 낮은 순서)가 새로 생기면 기존 기업을 참가 대상으로 등록
      const isFirst = stages.every(s => s.order_no > created.order_no)
      if (isFirst && companyCount > 0) {
        const companies = must(await sb.from('companies').select('id').eq('program_id', programId)) as { id: string }[]
        if (companies.length) {
          must(await sb.from('stage_entries').upsert(companies.map(c => ({ stage_id: created.id, company_id: c.id })),
            { onConflict: 'stage_id,company_id', ignoreDuplicates: true, defaultToNull: false }))
        }
      }
    }, { success: '단계를 추가했습니다.' })
    if (ok) {
      setAdding(false)
      setDraft(toDraft(null, nextOrder + 1))
    }
  }

  return (
    <div className="grid gap-4">
      <Feedback error={error} notice={notice} />
      {stages.length === 0 && !adding && <Empty>단계가 없습니다.</Empty>}
      {stages.map(s => <StageCard key={s.id} programId={programId} stage={s} stats={stats[s.id]} />)}
      {adding ? (
        <Card title="새 단계" actions={<>
          <Button size="sm" onClick={add} disabled={busy}>추가</Button>
          {stages.length > 0 && <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>취소</Button>}
        </>}>
          {stages.length === 0 && companyCount > 0 && <div className="mb-3"><Alert>등록된 기업 {companyCount}곳이 이 단계의 참가 대상으로 자동 등록됩니다.</Alert></div>}
          <StageForm draft={draft} setDraft={setDraft} />
        </Card>
      ) : (
        <div><Button variant="secondary" onClick={() => { setDraft(toDraft(null, nextOrder)); setAdding(true) }}>+ 단계 추가</Button></div>
      )}
    </div>
  )
}
