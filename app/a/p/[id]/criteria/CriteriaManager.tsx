'use client'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea } from '@/components/ui'
import { Check, Feedback, must, num, useRun } from '@/components/admin/setup/client'
import { moveRow } from '@/components/admin/setup/reorder'
import { fmtScore } from '@/lib/format'
import type { Criterion, RubricBand, Stage } from '@/lib/types'

type Draft = {
  name: string; description: string; max_score: string; comment_required: boolean
  min_pass_score: string; tie_priority: string; rubric: { min: string; max: string; label: string }[]
}

const toDraft = (c?: Criterion): Draft => ({
  name: c?.name ?? '',
  description: c?.description ?? '',
  max_score: c ? String(Number(c.max_score)) : '',
  comment_required: c?.comment_required ?? false,
  min_pass_score: c?.min_pass_score == null ? '' : String(Number(c.min_pass_score)),
  tie_priority: c?.tie_priority == null ? '' : String(c.tie_priority),
  rubric: (c?.rubric ?? []).map(b => ({ min: String(b.min), max: String(b.max), label: b.label })),
})

function validate(d: Draft): string | null {
  if (!d.name.trim()) return '항목명을 입력해 주세요.'
  const max = num(d.max_score)
  if (max == null || max <= 0) return '배점은 0보다 커야 합니다.'
  const minPass = num(d.min_pass_score)
  if (minPass != null && (minPass < 0 || minPass > max)) return '과락 기준은 0 이상, 배점 이하여야 합니다.'
  for (const b of d.rubric) {
    const lo = num(b.min), hi = num(b.max)
    if (lo == null || hi == null || !b.label.trim()) return '루브릭 구간의 최소·최대 점수와 설명을 모두 입력해 주세요.'
    if (lo > hi || hi > max || lo < 0) return `루브릭 구간(${b.min}~${b.max})이 배점 범위를 벗어납니다.`
  }
  return null
}

const toRow = (d: Draft) => ({
  name: d.name.trim(),
  description: d.description.trim() || null,
  max_score: num(d.max_score)!,
  comment_required: d.comment_required,
  min_pass_score: num(d.min_pass_score),
  tie_priority: num(d.tie_priority),
  rubric: d.rubric
    .map<RubricBand>(b => ({ min: Number(b.min), max: Number(b.max), label: b.label.trim() }))
    .sort((a, b) => b.max - a.max),
})

function RubricEditor({ bands, max, onChange, disabled }:
  { bands: Draft['rubric']; max: number | null; onChange: (b: Draft['rubric']) => void; disabled?: boolean }) {
  const set = (i: number, patch: Partial<Draft['rubric'][number]>) => onChange(bands.map((b, k) => (k === i ? { ...b, ...patch } : b)))
  function presetBands() {
    if (!max) return
    const m = max
    const r = (x: number) => String(Math.round(x * 10) / 10)
    onChange([
      { min: r(m * 0.8), max: r(m), label: '매우 우수' },
      { min: r(m * 0.6), max: r(m * 0.8 - 0.1), label: '우수' },
      { min: r(m * 0.4), max: r(m * 0.6 - 0.1), label: '보통' },
      { min: '0', max: r(m * 0.4 - 0.1), label: '미흡' },
    ])
  }
  return (
    <div className="grid gap-2">
      {bands.map((b, i) => (
        <div key={i} className="grid grid-cols-[70px_auto_70px_1fr_auto] items-center gap-2">
          <Input className="h-9 text-sm" type="number" step="0.1" value={b.min} disabled={disabled} onChange={e => set(i, { min: e.target.value })} aria-label="최소" />
          <span className="text-muted">~</span>
          <Input className="h-9 text-sm" type="number" step="0.1" value={b.max} disabled={disabled} onChange={e => set(i, { max: e.target.value })} aria-label="최대" />
          <Input className="h-9 text-sm" value={b.label} disabled={disabled} onChange={e => set(i, { label: e.target.value })} placeholder="예: 독자 기술 검증됨" aria-label="설명" />
          <Button type="button" size="sm" variant="ghost" className="text-danger" disabled={disabled} onClick={() => onChange(bands.filter((_, k) => k !== i))}>삭제</Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange([...bands, { min: '', max: '', label: '' }])}>+ 구간</Button>
        {bands.length === 0 && <Button type="button" size="sm" variant="ghost" disabled={disabled || !max} onClick={presetBands}>4단계 기본 구간</Button>}
      </div>
    </div>
  )
}

function CriterionForm({ draft, setDraft, disabled }: { draft: Draft; setDraft: (d: Draft) => void; disabled?: boolean }) {
  const max = num(draft.max_score)
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-[2fr_110px_150px_120px]">
        <Field label="항목명" required><Input value={draft.name} disabled={disabled} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="예: 기술성" /></Field>
        <Field label="배점" required><Input type="number" min={0.5} step={0.5} value={draft.max_score} disabled={disabled} onChange={e => setDraft({ ...draft, max_score: e.target.value })} /></Field>
        <Field label="과락 기준 (최저점)" hint={max ? (
          <button type="button" className="text-primary hover:underline disabled:opacity-50" disabled={disabled}
            onClick={() => setDraft({ ...draft, min_pass_score: String(Math.round(max * 0.4 * 10) / 10) })}>배점의 40% = {fmtScore(max * 0.4)}점 적용</button>
        ) : '비우면 과락 없음'}>
          <Input type="number" min={0} step={0.5} value={draft.min_pass_score} disabled={disabled} onChange={e => setDraft({ ...draft, min_pass_score: e.target.value })} placeholder="없음" />
        </Field>
        <Field label="동점 우선순위" hint="1이 최우선">
          <Input type="number" min={1} value={draft.tie_priority} disabled={disabled} onChange={e => setDraft({ ...draft, tie_priority: e.target.value })} placeholder="-" />
        </Field>
      </div>
      <Field label="설명"><Textarea className="min-h-[60px]" value={draft.description} disabled={disabled} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="평가 관점·세부 기준" /></Field>
      <Check label="심사평 필수" hint="이 항목에 점수를 줄 때 항목별 심사평을 반드시 입력" checked={draft.comment_required} disabled={disabled}
        onChange={v => setDraft({ ...draft, comment_required: v })} />
      <div>
        <div className="mb-1 text-sm font-semibold">평가 루브릭 <span className="font-normal text-muted">— 점수 구간별 설명 (심사위원 평가표 옆에 표시)</span></div>
        <RubricEditor bands={draft.rubric} max={max} disabled={disabled} onChange={r => setDraft({ ...draft, rubric: r })} />
      </div>
    </div>
  )
}

function CriterionRow({ c, index, total, stage, scoreCount, onMove }:
  { c: Criterion; index: number; total: number; stage: Stage; scoreCount: number; onMove: (i: number, d: -1 | 1) => void }) {
  const { busy, error, run } = useRun()
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState(toDraft(c))
  const locked = stage.status === 'locked' || stage.status === 'published'
  const evaluating = stage.status === 'evaluating'

  async function save() {
    const v = validate(draft)
    if (v) return alert(v)
    if (evaluating && !confirm(`평가가 시작된 단계입니다.\n'${c.name}' 항목을 수정하면 이미 입력된 점수(${scoreCount}건)와 기준이 달라질 수 있습니다.\n계속하시겠습니까?`)) return
    const ok = await run(async () => { must(await supabaseBrowser().from('criteria').update(toRow(draft)).eq('id', c.id)) })
    if (ok) setEdit(false)
  }
  async function remove() {
    const msg = scoreCount > 0
      ? `'${c.name}' 항목을 삭제합니다.\n이 항목에 입력된 심사위원 점수·심사평도 모두 삭제됩니다. 되돌릴 수 없습니다.`
      : `'${c.name}' 항목을 삭제합니다.`
    if (!confirm(msg)) return
    await run(async () => { must(await supabaseBrowser().from('criteria').delete().eq('id', c.id)) })
  }

  return (
    <li className="rounded-md border border-line p-4">
      <Feedback error={error} />
      <div className="flex items-start gap-3">
        <div className="flex flex-col">
          <button className="px-1 text-muted hover:text-fg disabled:opacity-30" disabled={locked || index === 0 || busy} onClick={() => onMove(index, -1)} aria-label="위로">▲</button>
          <button className="px-1 text-muted hover:text-fg disabled:opacity-30" disabled={locked || index === total - 1 || busy} onClick={() => onMove(index, 1)} aria-label="아래로">▼</button>
        </div>
        <div className="min-w-0 flex-1">
          {edit ? <CriterionForm draft={draft} setDraft={setDraft} /> : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular text-sm text-muted">{index + 1}</span>
                <span className="font-semibold">{c.name}</span>
                <span className="tabular font-bold text-primary">{fmtScore(Number(c.max_score))}점</span>
                {c.min_pass_score != null && <Badge tone="danger">과락 {fmtScore(Number(c.min_pass_score))}점 미만</Badge>}
                {c.tie_priority != null && <Badge>동점 우선 {c.tie_priority}</Badge>}
                {c.comment_required && <Badge tone="primary">심사평 필수</Badge>}
              </div>
              {c.description && <p className="mt-1 whitespace-pre-line text-sm text-muted">{c.description}</p>}
              {c.rubric.length > 0 && (
                <ul className="mt-2 grid gap-0.5 text-xs">
                  {c.rubric.map((b, i) => (
                    <li key={i}><span className="tabular inline-block w-20 font-semibold">{fmtScore(b.min)}~{fmtScore(b.max)}점</span>{b.label}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        {!locked && (
          <div className="flex shrink-0 gap-1">
            {edit ? (
              <>
                <Button size="sm" onClick={save} disabled={busy}>저장</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEdit(false); setDraft(toDraft(c)) }}>취소</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>수정</Button>
                <Button size="sm" variant="ghost" className="text-danger" onClick={remove} disabled={busy}>삭제</Button>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

export default function CriteriaManager({ stage, criteria, scoreCount, otherStages }:
  { stage: Stage; criteria: Criterion[]; scoreCount: number; otherStages: { id: string; name: string }[] }) {
  const { busy, error, notice, run } = useRun()
  const [draft, setDraft] = useState(toDraft())
  const [adding, setAdding] = useState(criteria.length === 0)
  const [copyFrom, setCopyFrom] = useState('')
  const locked = stage.status === 'locked' || stage.status === 'published'
  const evaluating = stage.status === 'evaluating'
  const total = criteria.reduce((a, c) => a + Number(c.max_score), 0)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const v = validate(draft)
    if (v) return alert(v)
    if (evaluating && !confirm('평가가 시작된 단계에 항목을 추가하면 심사위원의 기존 평가가 미완료 상태로 바뀝니다. 계속하시겠습니까?')) return
    const ok = await run(async () => {
      must(await supabaseBrowser().from('criteria').insert({ ...toRow(draft), stage_id: stage.id, order_no: (criteria.at(-1)?.order_no ?? 0) + 1 }))
    }, { success: '항목을 추가했습니다.' })
    if (ok) setDraft(toDraft())
  }

  async function copy() {
    if (!copyFrom) return
    if (!confirm('선택한 단계의 평가항목을 이 단계 끝에 복사합니다.')) return
    await run(async () => {
      const sb = supabaseBrowser()
      const src = must(await sb.from('criteria').select('*').eq('stage_id', copyFrom).order('order_no')) as Criterion[]
      if (!src.length) throw new Error('복사할 항목이 없습니다.')
      const start = criteria.at(-1)?.order_no ?? 0
      must(await sb.from('criteria').insert(src.map((c, i) => ({
        stage_id: stage.id, order_no: start + i + 1, name: c.name, description: c.description, max_score: c.max_score,
        comment_required: c.comment_required, min_pass_score: c.min_pass_score, rubric: c.rubric, tie_priority: c.tie_priority,
      })), { defaultToNull: false }))
    }, { success: '복사했습니다.' })
  }

  const move = (i: number, d: -1 | 1) => run(() => moveRow(supabaseBrowser(), 'criteria', criteria, i, d))

  return (
    <Card title={<span className="flex items-center gap-3">평가항목
      <span className="tabular text-sm font-normal">합계 <b className={total === 100 ? 'text-accent' : 'text-[#8a5a00]'}>{fmtScore(total)}</b>점</span>
      {criteria.length > 0 && total !== 100 && <Badge tone="highlight">권장 100점</Badge>}
    </span>}
      actions={!locked && !adding && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>항목 추가</Button>}>
      <Feedback error={error} notice={notice} />
      {evaluating && (
        <div className="mb-4"><Alert tone="highlight">
          평가가 시작된 단계입니다. 항목·배점을 수정하면 이미 입력된 점수({scoreCount}건)와 기준이 달라질 수 있어 공정성 시비가 생길 수 있습니다. 수정 내용은 감사로그에 기록됩니다.
        </Alert></div>
      )}
      {locked && <div className="mb-4"><Alert>확정된 단계입니다. 평가항목을 수정할 수 없습니다. (확정 해제 후 수정)</Alert></div>}

      {criteria.length === 0 ? (
        <div className="mb-4 text-sm text-muted">
          평가항목이 없습니다.
          {otherStages.length > 0 && !locked && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select className="h-9 w-auto text-sm" value={copyFrom} onChange={e => setCopyFrom(e.target.value)}>
                <option value="">다른 단계에서 복사…</option>
                {otherStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Button size="sm" variant="outline" disabled={!copyFrom || busy} onClick={copy}>복사</Button>
            </div>
          )}
        </div>
      ) : (
        <ul className="mb-4 grid gap-2">
          {criteria.map((c, i) => <CriterionRow key={c.id} c={c} index={i} total={criteria.length} stage={stage} scoreCount={scoreCount} onMove={move} />)}
        </ul>
      )}

      {adding && !locked && (
        <form onSubmit={add} className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-4">
          <div className="mb-3 font-semibold">새 평가항목</div>
          <CriterionForm draft={draft} setDraft={setDraft} />
          <div className="mt-3 flex gap-2">
            <Button type="submit" disabled={busy}>추가</Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>닫기</Button>
          </div>
        </form>
      )}
    </Card>
  )
}
