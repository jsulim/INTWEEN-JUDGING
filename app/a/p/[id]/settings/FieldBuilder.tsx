'use client'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Alert, Badge, Button, Card, Field, Input, Select } from '@/components/ui'
import { Check, Feedback, must, useRun } from '@/components/admin/setup/client'
import { moveRow } from '@/components/admin/setup/reorder'
import type { ApplicationField, FieldType } from '@/lib/types'

const TYPES: Record<FieldType, string> = {
  text: '단답형', textarea: '장문형', number: '숫자', select: '선택(드롭다운)', file: '파일 첨부', check: '체크(예/아니오)',
}

type Draft = { label: string; help: string; type: FieldType; options: string; required: boolean; is_eligibility: boolean }
const toDraft = (f?: ApplicationField): Draft => ({
  label: f?.label ?? '', help: f?.help ?? '', type: f?.type ?? 'text',
  options: (f?.options ?? []).join('\n'), required: f?.required ?? false, is_eligibility: f?.is_eligibility ?? false,
})
const toRow = (d: Draft) => ({
  label: d.label.trim(),
  help: d.help.trim() || null,
  type: d.type,
  options: d.type === 'select' ? d.options.split('\n').map(s => s.trim()).filter(Boolean) : [],
  required: d.required,
  is_eligibility: d.is_eligibility,
})

function FieldForm({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
      <Field label="항목명" required><Input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="예: 최근 연도 매출액(백만원)" /></Field>
      <Field label="유형">
        <Select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as FieldType })}>
          {(Object.keys(TYPES) as FieldType[]).map(t => <option key={t} value={t}>{TYPES[t]}</option>)}
        </Select>
      </Field>
      <div className="md:col-span-2"><Field label="도움말"><Input value={draft.help} onChange={e => setDraft({ ...draft, help: e.target.value })} placeholder="작성 안내 문구 (선택)" /></Field></div>
      {draft.type === 'select' && (
        <div className="md:col-span-2">
          <Field label="선택지" hint="한 줄에 하나씩">
            <textarea className="min-h-[88px] w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              value={draft.options} onChange={e => setDraft({ ...draft, options: e.target.value })} placeholder={'1년 미만\n1~3년\n3~7년\n7년 이상'} />
          </Field>
        </div>
      )}
      <div className="flex flex-wrap gap-6 md:col-span-2">
        <Check label="필수 입력" checked={draft.required} onChange={v => setDraft({ ...draft, required: v })} />
        <Check label="자격요건 항목" hint="0차 적격 검토(A-12)에서 우선 표시" checked={draft.is_eligibility} onChange={v => setDraft({ ...draft, is_eligibility: v })} />
      </div>
    </div>
  )
}

function FieldRow({ f, index, total, onMove }: { f: ApplicationField; index: number; total: number; onMove: (i: number, d: -1 | 1) => void }) {
  const { busy, error, run } = useRun()
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState(toDraft(f))

  async function save() {
    if (!draft.label.trim()) return
    const ok = await run(async () => { must(await supabaseBrowser().from('application_fields').update(toRow(draft)).eq('id', f.id)) })
    if (ok) setEdit(false)
  }
  async function remove() {
    if (!confirm(`'${f.label}' 항목을 삭제합니다. 이미 제출된 기업 응답도 함께 삭제됩니다.`)) return
    await run(async () => { must(await supabaseBrowser().from('application_fields').delete().eq('id', f.id)) })
  }

  return (
    <li className="rounded-md border border-line p-3">
      <Feedback error={error} />
      <div className="flex items-start gap-3">
        <div className="flex flex-col">
          <button className="px-1 text-muted hover:text-fg disabled:opacity-30" disabled={index === 0 || busy} onClick={() => onMove(index, -1)} aria-label="위로">▲</button>
          <button className="px-1 text-muted hover:text-fg disabled:opacity-30" disabled={index === total - 1 || busy} onClick={() => onMove(index, 1)} aria-label="아래로">▼</button>
        </div>
        <div className="min-w-0 flex-1">
          {edit ? <FieldForm draft={draft} setDraft={setDraft} /> : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular text-xs text-muted">{index + 1}</span>
                <span className="font-semibold">{f.label}</span>
                {f.required && <span className="text-danger">*</span>}
                <Badge>{TYPES[f.type]}</Badge>
                {f.is_eligibility && <Badge tone="primary">자격요건</Badge>}
              </div>
              {f.help && <p className="mt-0.5 text-sm text-muted">{f.help}</p>}
              {f.type === 'select' && f.options.length > 0 && <p className="mt-1 text-xs text-muted">선택지: {f.options.join(' · ')}</p>}
            </>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {edit ? (
            <>
              <Button size="sm" onClick={save} disabled={busy || !draft.label.trim()}>저장</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEdit(false); setDraft(toDraft(f)) }}>취소</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>수정</Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={remove} disabled={busy}>삭제</Button>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

export default function FieldBuilder({ programId, fields, submittedCount }: { programId: string; fields: ApplicationField[]; submittedCount: number }) {
  const { busy, error, notice, run } = useRun()
  const [draft, setDraft] = useState(toDraft())
  const [adding, setAdding] = useState(fields.length === 0)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const ok = await run(async () => {
      must(await supabaseBrowser().from('application_fields').insert({
        ...toRow(draft), program_id: programId, order_no: (fields.at(-1)?.order_no ?? 0) + 1,
      }))
    }, { success: '항목을 추가했습니다.' })
    if (ok) setDraft(toDraft())
  }

  const move = (i: number, d: -1 | 1) => run(() => moveRow(supabaseBrowser(), 'application_fields', fields, i, d))

  return (
    <Card title={<>신청서 항목 <span className="ml-1 text-sm font-normal text-muted">{fields.length}개</span></>}
      actions={!adding && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>항목 추가</Button>}>
      <Feedback error={error} notice={notice} />
      {submittedCount > 0 && <div className="mb-3"><Alert tone="highlight">신청서를 제출한 기업이 {submittedCount}곳 있습니다. 항목을 바꾸면 기존 응답과 맞지 않을 수 있습니다.</Alert></div>}
      {fields.length === 0 ? <p className="mb-4 text-sm text-muted">신청 항목이 없습니다. 매출, 업력, 인원 등 프로그램별 항목을 정의하세요.</p> : (
        <ul className="mb-4 grid gap-2">
          {fields.map((f, i) => <FieldRow key={f.id} f={f} index={i} total={fields.length} onMove={move} />)}
        </ul>
      )}
      {adding && (
        <form onSubmit={add} className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-4">
          <div className="mb-3 font-semibold">새 항목</div>
          <FieldForm draft={draft} setDraft={setDraft} />
          <div className="mt-3 flex gap-2">
            <Button type="submit" disabled={busy || !draft.label.trim()}>추가</Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>닫기</Button>
          </div>
        </form>
      )}
    </Card>
  )
}
