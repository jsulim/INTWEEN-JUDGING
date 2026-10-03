'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { Badge, Button, Card, Empty, Field, Input, Select, Table, buttonClass, cn } from '@/components/ui'
import { EligibilityBadge, ResultBadge } from '@/components/StatusBadges'
import { Check, Feedback, errMsg, must, useRun } from '@/components/admin/setup/client'
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
