'use client'
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Alert, Button, Card, Input, Label, Select, Textarea, cn } from '@/components/ui'
import { fmtDate } from '@/lib/format'
import { uploadFile } from './upload'
import { EVIDENCE_ACCEPT, EVIDENCE_EXT, MAX_UPLOAD_BYTES, SIZE_ERROR, extOfName, myFileHref } from './rules'
import type { ApplicationField } from '@/lib/types'

type FileValue = { path: string; name: string }
type Value = string | number | boolean | FileValue | null

function isFileValue(v: unknown): v is FileValue {
  return !!v && typeof v === 'object' && typeof (v as FileValue).path === 'string'
}

function toValue(field: ApplicationField, raw: unknown): Value {
  if (raw == null) return null
  switch (field.type) {
    case 'check': return raw === true || raw === 'true'
    case 'number': return typeof raw === 'number' ? raw : raw === '' ? null : Number(raw)
    case 'file': return isFileValue(raw) ? { path: raw.path, name: raw.name ?? '첨부 파일' } : null
    default: return typeof raw === 'string' ? raw : String(raw)
  }
}

function isEmpty(field: ApplicationField, v: Value) {
  if (field.type === 'check') return v !== true
  if (field.type === 'file') return !isFileValue(v)
  if (field.type === 'number') return v == null || v === '' || Number.isNaN(v as number)
  return v == null || String(v).trim() === ''
}

export default function ApplicationForm({ companyId, fields, initial, canEdit, submittedAt }: {
  companyId: string
  fields: ApplicationField[]
  initial: Record<string, unknown>
  canEdit: boolean
  submittedAt: string | null
}) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, Value>>(() =>
    Object.fromEntries(fields.map(f => [f.id, toValue(f, initial[f.id])])))
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null)
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null)

  const eligibility = useMemo(() => fields.filter(f => f.is_eligibility), [fields])
  const general = useMemo(() => fields.filter(f => !f.is_eligibility), [fields])

  function setValue(id: string, v: Value) {
    setValues(s => ({ ...s, [id]: v }))
    setDirty(true)
    if (missing.has(id)) setMissing(m => { const n = new Set(m); n.delete(id); return n })
  }

  function rowsFor(ids: string[]) {
    return ids.map(id => {
      const f = fields.find(x => x.id === id)!
      let v = values[id]
      if (f.type === 'number' && (v === '' || (typeof v === 'number' && Number.isNaN(v)))) v = null
      if (typeof v === 'string') v = v.trim() === '' ? null : v
      return { company_id: companyId, field_id: id, value: v }
    })
  }

  async function persist(ids = fields.map(f => f.id)) {
    if (!ids.length) return null
    const { error } = await supabaseBrowser().from('application_answers')
      .upsert(rowsFor(ids), { onConflict: 'company_id,field_id', defaultToNull: false })
    if (error) return error.code === '42501' ? '신청서 수정 기간이 아닙니다.' : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    return null
  }

  async function save() {
    setMsg(null)
    setBusy('save')
    const err = await persist()
    setBusy(null)
    if (err) return setMsg({ tone: 'danger', text: err })
    setDirty(false)
    setMsg({ tone: 'accent', text: '임시 저장됨' })
    router.refresh()
  }

  async function submit() {
    setMsg(null)
    const miss = fields.filter(f => f.required && isEmpty(f, values[f.id]))
    if (miss.length) {
      setMissing(new Set(miss.map(f => f.id)))
      setMsg({ tone: 'danger', text: `필수 항목을 입력해 주세요: ${miss.map(f => f.label).join(', ')}` })
      return
    }
    const bad = fields.filter(f => f.type === 'number' && values[f.id] != null && Number.isNaN(Number(values[f.id])))
    if (bad.length) return setMsg({ tone: 'danger', text: `숫자 형식이 올바르지 않습니다: ${bad.map(f => f.label).join(', ')}` })
    if (!window.confirm(submittedAt ? '수정한 내용으로 신청서를 다시 제출할까요?' : '신청서를 제출할까요? 접수 마감 전까지는 수정 후 다시 제출할 수 있습니다.')) return
    setBusy('submit')
    const err = await persist()
    if (err) {
      setBusy(null)
      return setMsg({ tone: 'danger', text: err })
    }
    const { error } = await supabaseBrowser().from('companies')
      .update({ application_submitted_at: new Date().toISOString() }).eq('id', companyId)
    setBusy(null)
    if (error) return setMsg({ tone: 'danger', text: '신청서를 제출하지 못했습니다. 잠시 후 다시 시도해 주세요.' })
    setDirty(false)
    setMsg({ tone: 'accent', text: '신청서 제출 완료' })
    router.refresh()
  }

  // 첨부 항목은 업로드 즉시 저장해 파일이 유실되지 않게 한다
  async function saveFile(field: ApplicationField, v: FileValue | null) {
    setValues(s => ({ ...s, [field.id]: v }))
    const { error } = await supabaseBrowser().from('application_answers')
      .upsert([{ company_id: companyId, field_id: field.id, value: v }], { onConflict: 'company_id,field_id', defaultToNull: false })
    if (error) throw new Error(error.code === '42501' ? '신청서 수정 기간이 아닙니다.' : '첨부 파일을 저장하지 못했습니다.')
    if (missing.has(field.id)) setMissing(m => { const n = new Set(m); n.delete(field.id); return n })
    router.refresh()
  }

  if (!fields.length) {
    return <Card title="신청 항목"><p className="text-sm text-muted">등록된 신청 항목이 없습니다.</p></Card>
  }

  const render = (f: ApplicationField) => (
    <FieldInput key={f.id} field={f} value={values[f.id] ?? null} disabled={!canEdit || !!busy} invalid={missing.has(f.id)}
      onChange={v => setValue(f.id, v)} onFile={v => saveFile(f, v)} />
  )

  return (
    <div className="grid gap-5">
      {eligibility.length > 0 && (
        <Card title="자격요건 자가 체크">
          <p className="mb-4 text-sm text-muted">해당하는 항목에 표시해 주세요. 사실과 다를 경우 심사 대상에서 제외될 수 있습니다.</p>
          <div className="grid gap-4">{eligibility.map(render)}</div>
        </Card>
      )}
      {general.length > 0 && (
        <Card title="신청 항목">
          <div className="grid gap-5">{general.map(render)}</div>
        </Card>
      )}

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      {canEdit && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="button" variant="outline" onClick={save} disabled={!!busy}>{busy === 'save' ? '저장 중…' : '임시 저장'}</Button>
          <Button type="button" onClick={submit} disabled={!!busy}>
            {busy === 'submit' ? '제출 중…' : submittedAt ? '다시 제출' : '신청서 제출'}
          </Button>
          {dirty && <span className="text-xs text-muted">저장되지 않은 변경 사항이 있습니다.</span>}
          {!dirty && submittedAt && <span className="tabular text-xs text-muted">제출 {fmtDate(submittedAt)}</span>}
        </div>
      )}
    </div>
  )
}

function FieldInput({ field, value, disabled, invalid, onChange, onFile }: {
  field: ApplicationField
  value: Value
  disabled: boolean
  invalid: boolean
  onChange: (v: Value) => void
  onFile: (v: FileValue | null) => Promise<void>
}) {
  const id = `f-${field.id}`
  const invalidCls = invalid ? 'border-danger focus:border-danger focus:ring-danger/20' : undefined
  const help = field.help ? <p className="mt-1 text-xs text-muted">{field.help}</p> : null

  if (field.type === 'check') {
    return (
      <div>
        <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3', invalid ? 'border-danger' : 'border-line', disabled && 'cursor-default')}>
          <input id={id} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--primary))]" checked={value === true}
            disabled={disabled} onChange={e => onChange(e.target.checked)} />
          <span className="text-sm">
            <span className="font-medium">{field.label}</span>{field.required && <span className="ml-0.5 text-danger">*</span>}
            {field.help && <span className="mt-0.5 block text-xs text-muted">{field.help}</span>}
          </span>
        </label>
      </div>
    )
  }

  return (
    <div>
      <Label htmlFor={id} required={field.required}>{field.label}</Label>
      {field.type === 'text' && (
        <Input id={id} value={(value as string) ?? ''} disabled={disabled} className={invalidCls} onChange={e => onChange(e.target.value)} maxLength={500} />
      )}
      {field.type === 'textarea' && (
        <Textarea id={id} value={(value as string) ?? ''} disabled={disabled} className={cn('min-h-[140px]', invalidCls)} onChange={e => onChange(e.target.value)} maxLength={10000} />
      )}
      {field.type === 'number' && (
        <Input id={id} type="number" inputMode="decimal" value={value == null || Number.isNaN(value as number) ? '' : String(value)} disabled={disabled}
          className={cn('max-w-xs', invalidCls)} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} />
      )}
      {field.type === 'select' && (
        <Select id={id} value={(value as string) ?? ''} disabled={disabled} className={cn('max-w-md', invalidCls)} onChange={e => onChange(e.target.value || null)}>
          <option value="">선택</option>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
          {typeof value === 'string' && value && !field.options.includes(value) && <option value={value}>{value}</option>}
        </Select>
      )}
      {field.type === 'file' && (
        <FileInput fieldId={field.id} value={isFileValue(value) ? value : null} disabled={disabled} invalid={invalid} onFile={onFile} />
      )}
      {help}
    </div>
  )
}

function FileInput({ fieldId, value, disabled, invalid, onFile }: {
  fieldId: string
  value: FileValue | null
  disabled: boolean
  invalid: boolean
  onFile: (v: FileValue | null) => Promise<void>
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    setErr(null)
    if (!(EVIDENCE_EXT as readonly string[]).includes(extOfName(file.name))) {
      setErr(`${EVIDENCE_EXT.map(e => e.toUpperCase()).join('·')} 파일만 업로드할 수 있습니다.`)
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) return setErr(SIZE_ERROR)
    setBusy(true)
    try {
      const t = await uploadFile(file, 'application', { field_id: fieldId })
      await onFile({ path: t.path, name: file.name })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '업로드하지 못했습니다.')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  async function remove() {
    if (!window.confirm('첨부 파일을 삭제할까요?')) return
    setBusy(true)
    try { await onFile(null) } catch (e) { setErr(e instanceof Error ? e.message : '삭제하지 못했습니다.') } finally { setBusy(false) }
  }

  return (
    <div className={cn('rounded-md border px-3 py-3', invalid ? 'border-danger' : 'border-line')}>
      <input ref={ref} type="file" className="sr-only" accept={EVIDENCE_ACCEPT} onChange={e => pick(e.target.files?.[0])} disabled={disabled || busy} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {value ? (
          <a href={myFileHref({ path: value.path })} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all font-semibold text-primary hover:underline">{value.name}</a>
        ) : (
          <span className="text-muted">첨부된 파일이 없습니다.</span>
        )}
        {!disabled && (
          <span className="flex gap-2">
            {value && <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={busy}>삭제</Button>}
            <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()} disabled={busy}>
              {busy ? '업로드 중…' : value ? '파일 교체' : '파일 선택'}
            </Button>
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">PDF·PPTX·PNG·JPG·ZIP, 최대 50MB</p>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  )
}
