'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { Badge, Button, Card, Empty, Field, Input, Select, Table, buttonClass, cn } from '@/components/ui'
import { EligibilityBadge, ResultBadge } from '@/components/StatusBadges'
import { Check, Feedback, errMsg, must, useRun } from '@/components/admin/setup/client'
import { BUCKET_NAME, MAX_UPLOAD_BYTES, SIZE_ERROR } from '@/components/company/rules'
import type { Company, Eligibility, EntryResult, Stage } from '@/lib/types'

export type InviteState = 'none' | 'invited' | 'joined'
export type StageCell = { entry_id: string; eligibility: Eligibility; result: EntryResult; done: number; required: number; files: number } | null
export type CompanyView = Company & { invite: InviteState; stages: Record<string, StageCell> }

type BulkResult = { row: number; name: string; email: string; status: 'invited' | 'created' | 'exists' | 'error'; message: string }

const INVITE: Record<InviteState, { label: string; tone: 'neutral' | 'highlight' | 'accent' }> = {
  none: { label: '미초대', tone: 'neutral' },
  invited: { label: '초대됨', tone: 'highlight' },
  joined: { label: '가입 완료', tone: 'accent' },
}

const EMPTY = { name: '', biz_no: '', ceo: '', field: '', email: '', send: true }

function templateHref() {
  const csv = '﻿기업명,사업자번호,대표자,분야,이메일\n(예시)인트윈랩,123-45-67890,홍길동,AI·데이터,ceo@example.com\n'
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
/** 파일명으로 제출 칸 찾기 (예: '팀01_사업계획서(전).pdf' → 사업계획서(전)). 긴 이름부터 비교해 '사업계획서'가 '(전)'을 가로채지 않게 한다 */
function slotForName(slots: Stage['required_files'], name: string) {
  const n = norm(name)
  return [...slots].sort((a, b) => b.label.length - a.label.length).find(f => n.includes(norm(f.label)) || n.includes(norm(f.type))) ?? null
}

/** 운영팀 대리 업로드: 참가팀이 메일로 보낸 자료를 검수 후 대신 올린다 (버전 보관, 접수 기간 무관)
 *  칸을 눌러 고르거나, 칸에 파일을 끌어다 놓는다. 여러 파일을 상자에 한꺼번에 놓으면 파일명으로 칸을 찾아 올린다. */
export function AdminUpload({ stage, entryId, companyName }: { stage: Stage; entryId: string; companyName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null) // 끌어다 놓는 중인 칸 ('*' = 상자 전체)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  if (!stage.required_files.length || stage.status === 'locked' || stage.status === 'published') return null

  async function upload(fileType: string, label: string, file: File): Promise<string | null> {
    const slot = stage.required_files.find(f => f.type === fileType)
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (slot && !slot.accept.includes(ext as 'pdf')) return `${label}은(는) ${slot.accept.map(a => a.toUpperCase()).join('·')} 파일만 올릴 수 있습니다.`
    if (file.size > MAX_UPLOAD_BYTES) return SIZE_ERROR
    setBusy(fileType)
    try {
      const base = { entry_id: entryId, file_type: fileType, file_name: file.name, size: file.size }
      const t = await api<{ path: string; token: string; contentType: string }>('/api/admin/submissions', { body: { action: 'ticket', ...base } })
      const { error } = await supabaseBrowser().storage.from(BUCKET_NAME)
        .uploadToSignedUrl(t.path, t.token, new Blob([file], { type: t.contentType }), { contentType: t.contentType })
      if (error) throw new Error('파일을 업로드하지 못했습니다. 네트워크 상태를 확인해 주세요.')
      await api('/api/admin/submissions', { body: { action: 'complete', path: t.path, ...base } })
      return null
    } catch (e) {
      return errMsg(e)
    } finally { setBusy(null) }
  }

  // 여러 파일을 순서대로 올리고 결과를 한 줄로 알린다
  async function uploadMany(items: { slot: Stage['required_files'][number]; file: File }[], unmatched: string[] = []) {
    setMsg(null)
    const ok: string[] = []
    const fail: string[] = []
    for (const { slot, file } of items) {
      const err = await upload(slot.type, slot.label, file)
      if (err) fail.push(`${slot.label}: ${err}`)
      else ok.push(slot.label)
    }
    if (unmatched.length) fail.push(`칸을 찾지 못함: ${unmatched.join(', ')} (파일명에 '${stage.required_files.map(f => f.label).join("' / '")}'가 들어가야 합니다)`)
    setMsg({ ok: fail.length === 0, text: [ok.length ? `${ok.join(', ')} 업로드 완료` : '', ...fail].filter(Boolean).join(' · ') })
    if (ok.length) router.refresh()
  }

  function dropOnSlot(e: React.DragEvent, f: Stage['required_files'][number]) {
    e.preventDefault()
    e.stopPropagation()
    setOver(null)
    const file = e.dataTransfer.files?.[0]
    if (file && !busy) void uploadMany([{ slot: f, file }])
  }
  function dropOnBox(e: React.DragEvent) {
    e.preventDefault()
    setOver(null)
    if (busy) return
    const files = Array.from(e.dataTransfer.files ?? [])
    if (!files.length) return
    // 칸이 하나뿐이면 첫 파일을 그 칸에, 아니면 파일명으로 칸을 찾는다
    if (stage.required_files.length === 1) return void uploadMany([{ slot: stage.required_files[0], file: files[0] }])
    const items: { slot: Stage['required_files'][number]; file: File }[] = []
    const unmatched: string[] = []
    for (const file of files) {
      const slot = slotForName(stage.required_files, file.name)
      if (slot && !items.some(x => x.slot.type === slot.type)) items.push({ slot, file })
      else unmatched.push(file.name)
    }
    void uploadMany(items, unmatched)
  }
  const dragProps = (key: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (over !== key) setOver(key) },
    onDragLeave: (e: React.DragEvent) => { e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(o => (o === key ? null : o)) },
  })

  return (
    <div className="mt-1">
      <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setOpen(o => !o)}>
        {open ? '닫기' : '대리 업로드'}
      </button>
      {open && (
        <div {...dragProps('*')} onDrop={dropOnBox}
          className={cn('mt-1 grid gap-1.5 rounded-md border border-line bg-bg p-2 transition-colors', over === '*' && 'border-dashed border-primary bg-primary/5')}>
          {stage.required_files.map(f => (
            <label key={f.type} {...dragProps(f.type)} onDrop={e => dropOnSlot(e, f)}
              className={cn(buttonClass('outline', 'sm'), 'cursor-pointer justify-start', busy && 'pointer-events-none opacity-50',
                over === f.type && 'border-2 border-dashed border-primary bg-primary/10')}>
              {busy === f.type ? '업로드 중…' : over === f.type ? `여기에 놓으면 ${f.label}로 올라갑니다` : `${f.label} (${f.accept.map(a => a.toUpperCase()).join('/')})`}
              <input type="file" className="hidden" accept={f.accept.map(a => `.${a}`).join(',')} disabled={!!busy}
                aria-label={`${companyName} ${f.label} 업로드`}
                onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void uploadMany([{ slot: f, file }]) }} />
            </label>
          ))}
          <p className="text-[11px] leading-snug text-muted">
            칸을 누르거나 <b>파일을 칸 위로 끌어다 놓으세요.</b>
            {stage.required_files.length > 1 && <> 여러 파일을 이 상자에 한꺼번에 놓으면 파일명(예: &lsquo;{stage.required_files[1].label}&rsquo;)으로 칸을 찾아 올립니다.</>}
            {' '}PDF 권장 (심사위원 뷰어 호환). 다시 올리면 새 버전으로 교체되고 이전 파일은 보관됩니다.
          </p>
          {msg && <p className={cn('text-xs', msg.ok ? 'text-accent' : 'text-danger')}>{msg.text}</p>}
        </div>
      )}
    </div>
  )
}

function CompanyRow({ c, stages, onInvite, busyAll }: { c: CompanyView; stages: Stage[]; onInvite: (c: CompanyView) => Promise<void>; busyAll: boolean }) {
  const { busy, error, run } = useRun()
  const [edit, setEdit] = useState(false)
  const [d, setD] = useState({ name: c.name, biz_no: c.biz_no ?? '', ceo: c.ceo ?? '', field: c.field ?? '', contact_email: c.contact_email ?? '' })

  async function save() {
    if (!d.name.trim()) return alert('기업명을 입력해 주세요.')
    const ok = await run(async () => {
      must(await supabaseBrowser().from('companies').update({
        name: d.name.trim(), biz_no: d.biz_no.trim() || null, ceo: d.ceo.trim() || null,
        field: d.field.trim() || null, contact_email: d.contact_email.trim().toLowerCase() || null,
      }).eq('id', c.id))
    })
    if (ok) setEdit(false)
  }
  async function remove() {
    if (!confirm(`'${c.name}'을(를) 삭제합니다.\n제출 파일 기록·배정·점수·신청서 응답이 모두 삭제되며 되돌릴 수 없습니다.`)) return
    await run(async () => { must(await supabaseBrowser().from('companies').delete().eq('id', c.id)) })
  }

  const inv = INVITE[c.invite]
  return (
    <tr>
      <td className="tabular font-semibold text-muted">{c.blind_code}</td>
      {edit ? (
        <>
          <td><Input className="h-8 text-sm" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /><Input className="mt-1 h-8 text-sm" value={d.field} onChange={e => setD({ ...d, field: e.target.value })} placeholder="분야" /></td>
          <td><Input className="h-8 text-sm" value={d.ceo} onChange={e => setD({ ...d, ceo: e.target.value })} /></td>
          <td><Input className="h-8 text-sm" value={d.biz_no} onChange={e => setD({ ...d, biz_no: e.target.value })} /></td>
          <td><Input className="h-8 text-sm" value={d.contact_email} onChange={e => setD({ ...d, contact_email: e.target.value })} /></td>
        </>
      ) : (
        <>
          <td>
            <div className="font-semibold">{c.name}</div>
            {c.field && <div className="text-xs text-muted">{c.field}</div>}
            {error && <div className="text-xs text-danger">{error}</div>}
          </td>
          <td>{c.ceo ?? '-'}</td>
          <td className="tabular whitespace-nowrap">{c.biz_no ?? '-'}</td>
          <td className="max-w-[200px] truncate text-xs">{c.contact_email ?? <span className="text-muted">-</span>}</td>
        </>
      )}
      <td><Badge tone={inv.tone}>{inv.label}</Badge>{c.application_submitted_at && <div className="mt-1"><Badge tone="primary">신청서 제출</Badge></div>}</td>
      {stages.map(s => {
        const cell = c.stages[s.id]
        if (!cell) return <td key={s.id} className="text-xs text-muted">-</td>
        const complete = cell.required ? cell.done >= cell.required : cell.files > 0
        return (
          <td key={s.id}>
            <div className="flex flex-wrap items-center gap-1">
              {cell.required > 0 || cell.files > 0
                ? <Badge tone={complete ? 'accent' : cell.done > 0 ? 'highlight' : 'neutral'}>{complete ? '제출 완료' : '미제출'} {cell.required > 0 && <span className="tabular ml-1">{cell.done}/{cell.required}</span>}</Badge>
                : <span className="text-xs text-muted">파일 없음</span>}
              {cell.eligibility !== 'pending' && <EligibilityBadge value={cell.eligibility} />}
              {(s.status === 'published' || cell.result !== 'pending') && <ResultBadge value={cell.result} />}
            </div>
            <AdminUpload stage={s} entryId={cell.entry_id} companyName={c.name} />
          </td>
        )
      })}
      <td>
        <div className="flex justify-end gap-1 whitespace-nowrap">
          {edit ? (
            <>
              <Button size="sm" onClick={save} disabled={busy}>저장</Button>
              <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>취소</Button>
            </>
          ) : (
            <>
              {c.invite !== 'joined' && (
                <Button size="sm" variant={c.invite === 'none' ? 'secondary' : 'ghost'} disabled={busy || busyAll || !c.contact_email}
                  title={c.contact_email ? '' : '이메일을 먼저 입력하세요'} onClick={() => run(() => onInvite(c))}>
                  {c.invite === 'none' ? '초대' : '재발송'}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>수정</Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={remove} disabled={busy}>삭제</Button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function CompaniesManager({ programId, stages, companies }: { programId: string; stages: Stage[]; companies: CompanyView[] }) {
  const router = useRouter()
  const { busy, error, notice, run, setError, setNotice } = useRun()
  const [panel, setPanel] = useState<'none' | 'add' | 'bulk'>(companies.length === 0 ? 'bulk' : 'none')
  const [form, setForm] = useState(EMPTY)
  const [q, setQ] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [bulkSend, setBulkSend] = useState(true)
  const [bulk, setBulk] = useState<{ summary: Record<string, number>; results: BulkResult[] } | null>(null)
  const [zipStage, setZipStage] = useState(stages[0]?.id ?? '')

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return companies
    return companies.filter(c => [c.name, c.ceo, c.biz_no, c.field, c.contact_email, c.blind_code].some(v => v?.toLowerCase().includes(k)))
  }, [companies, q])

  const invite = async (c: CompanyView) => {
    const r = await api<{ message: string }>('/api/invite', { body: { role: 'company', program_id: programId, company_id: c.id, send: true } })
    setNotice(`${c.name}: ${r.message}`)
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const ok = await run(async () => {
      const r = await api<{ message: string }>('/api/invite', {
        body: {
          role: 'company', program_id: programId, send: form.send && !!form.email.trim(), email: form.email.trim() || null,
          company: { name: form.name.trim(), biz_no: form.biz_no.trim() || null, ceo: form.ceo.trim() || null, field: form.field.trim() || null },
        },
      })
      setNotice(`${form.name}: ${r.message}`)
    })
    if (ok) setForm(EMPTY)
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    if (bulkSend && !confirm('파일의 이메일 주소로 초대 메일을 발송합니다. 계속할까요?')) return
    await run(async () => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('program_id', programId)
      fd.append('send', String(bulkSend))
      const res = await fetch('/api/invite/bulk', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `업로드 실패 (${res.status})`)
      setBulk(data)
    })
  }

  async function inviteAll() {
    const targets = companies.filter(c => c.invite === 'none' && c.contact_email)
    if (!targets.length) return alert('초대할 기업이 없습니다. (이메일이 있는 미초대 기업)')
    if (!confirm(`미초대 기업 ${targets.length}곳에 초대 메일을 발송합니다.`)) return
    setError(null)
    let ok = 0
    const fails: string[] = []
    for (const c of targets) {
      try {
        await api('/api/invite', { body: { role: 'company', program_id: programId, company_id: c.id, send: true } })
        ok++
      } catch (e) {
        fails.push(`${c.name}: ${errMsg(e)}`)
      }
    }
    if (fails.length) setError(`발송 실패 ${fails.length}건 — ${fails.join(' / ')}`)
    setNotice(`초대 메일 ${ok}건 발송`)
    router.refresh()
  }

  const uninvited = companies.filter(c => c.invite === 'none' && c.contact_email).length

  return (
    <div className="grid gap-5">
      <Feedback error={error} notice={notice} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={panel === 'add' ? 'secondary' : 'outline'} onClick={() => setPanel(panel === 'add' ? 'none' : 'add')}>+ 기업 추가</Button>
        <Button variant={panel === 'bulk' ? 'secondary' : 'outline'} onClick={() => setPanel(panel === 'bulk' ? 'none' : 'bulk')}>엑셀 일괄 등록</Button>
        <Button variant="outline" disabled={!uninvited || busy} onClick={inviteAll}>미초대 일괄 초대 {uninvited > 0 && <span className="tabular">({uninvited})</span>}</Button>
        <div className="ml-auto flex items-center gap-2">
          {stages.length > 0 && (
            <>
              <Select className="h-10 w-auto text-sm" value={zipStage} onChange={e => setZipStage(e.target.value)} aria-label="다운로드 단계">
                {stages.map(s => <option key={s.id} value={s.id}>{s.order_no}. {s.name}</option>)}
              </Select>
              <a className={buttonClass('outline')} href={zipStage ? `/api/admin/stages/${zipStage}/files-zip` : undefined} download>파일 일괄 다운로드</a>
            </>
          )}
        </div>
      </div>

      {panel === 'add' && (
        <Card title="기업 추가">
          <form onSubmit={add} className="grid gap-3 md:grid-cols-3">
            <Field label="기업명" required><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="사업자번호"><Input value={form.biz_no} onChange={e => setForm({ ...form, biz_no: e.target.value })} placeholder="000-00-00000" /></Field>
            <Field label="대표자"><Input value={form.ceo} onChange={e => setForm({ ...form, ceo: e.target.value })} /></Field>
            <Field label="분야"><Input value={form.field} onChange={e => setForm({ ...form, field: e.target.value })} /></Field>
            <Field label="담당자 이메일" hint="로그인 계정으로 사용됩니다."><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
            <div className="flex items-end pb-2"><Check label="초대 메일 즉시 발송" checked={form.send} onChange={v => setForm({ ...form, send: v })} disabled={!form.email.trim()} /></div>
            <div className="md:col-span-3"><Button type="submit" disabled={busy || !form.name.trim()}>등록</Button></div>
          </form>
        </Card>
      )}

      {panel === 'bulk' && (
        <Card title="엑셀 일괄 등록" actions={<a className="text-sm font-semibold text-primary hover:underline" href={templateHref()} download="기업_일괄등록_양식.csv">양식 내려받기 (CSV)</a>}>
          <p className="mb-3 text-sm text-muted">
            첫 행은 헤더: <b>기업명, 사업자번호, 대표자, 분야, 이메일</b>. .xlsx 또는 .csv (최대 500행). 같은 사업자번호·이메일의 기업은 중복 등록되지 않습니다.
          </p>
          <form onSubmit={upload} className="flex flex-wrap items-center gap-3">
            <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setBulk(null) }} className="text-sm" />
            <Check label="초대 메일 발송" checked={bulkSend} onChange={setBulkSend} />
            <Button type="submit" disabled={!file || busy}>{busy ? '처리 중…' : '업로드'}</Button>
          </form>
          {bulk && (
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap gap-2 text-sm">
                <Badge>전체 {bulk.summary.total}</Badge>
                <Badge tone="accent">초대 {bulk.summary.invited}</Badge>
                <Badge tone="primary">등록 {bulk.summary.created}</Badge>
                <Badge>기존 {bulk.summary.exists}</Badge>
                {bulk.summary.error > 0 && <Badge tone="danger">오류 {bulk.summary.error}</Badge>}
              </div>
              <Table>
                <thead><tr><th>행</th><th>기업명</th><th>이메일</th><th>결과</th></tr></thead>
                <tbody>
                  {bulk.results.map(r => (
                    <tr key={r.row} className={cn(r.status === 'error' && 'bg-danger/5')}>
                      <td className="tabular">{r.row}</td><td>{r.name || '-'}</td><td className="text-xs">{r.email || '-'}</td>
                      <td className={r.status === 'error' ? 'text-danger' : ''}>{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted">전체 <b className="tabular text-fg">{companies.length}</b>개사 · 가입 완료 {companies.filter(c => c.invite === 'joined').length}</div>
        <Input className="h-9 max-w-xs text-sm" value={q} onChange={e => setQ(e.target.value)} placeholder="기업명·대표자·사업자번호 검색" />
      </div>

      {companies.length === 0 ? <Empty>등록된 기업이 없습니다. 엑셀로 일괄 등록하거나 개별 추가하세요.</Empty> : (
        <Table>
          <thead>
            <tr>
              <th>코드</th><th>기업명</th><th>대표자</th><th>사업자번호</th><th>이메일</th><th>초대</th>
              {stages.map(s => <th key={s.id}>{s.order_no}. {s.name}</th>)}
              <th className="text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => <CompanyRow key={c.id} c={c} stages={stages} onInvite={invite} busyAll={busy} />)}
          </tbody>
        </Table>
      )}
    </div>
  )
}
