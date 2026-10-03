'use client'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { Badge, Button, Card, Empty, Field, Input, Select, Table } from '@/components/ui'
import { Check, Feedback, must, useRun } from '@/components/admin/setup/client'
import { CONSENT_KINDS } from '@/components/admin/setup/consent-defaults'
import { fmtDate } from '@/lib/format'
import type { Consent, ConsentTemplate, Judge, JudgePoolEntry } from '@/lib/types'

export type JudgeView = Judge & {
  name: string; email: string | null; phone: string | null; joined: boolean | null
  consents: Consent[]
  conflicts: { company: string; stage: string; reason: string | null; reported_at: string | null }[]
}

const EMPTY = { name: '', email: '', affiliation: '', expertise: '', is_chair: false, pool_id: '' }

function JudgeRow({ j, programId, templates }: { j: JudgeView; programId: string; templates: ConsentTemplate[] }) {
  const { busy, error, notice, run, setNotice } = useRun()
  const [edit, setEdit] = useState(false)
  const [d, setD] = useState({ affiliation: j.affiliation ?? '', expertise: j.expertise ?? '' })
  const required = templates.filter(t => t.required)
  const signedAll = required.every(t => j.consents.some(c => c.template_id === t.id))
  const declared = j.consents.filter(c => c.conflict_declared)

  async function toggleChair() {
    const next = !j.is_chair
    if (next && !confirm(`${j.name}님을 심사위원장으로 지정합니다. 기존 위원장은 해제됩니다.`)) return
    await run(async () => {
      const sb = supabaseBrowser()
      if (next) must(await sb.from('judges').update({ is_chair: false }).eq('program_id', programId).eq('is_chair', true).neq('id', j.id))
      must(await sb.from('judges').update({ is_chair: next }).eq('id', j.id))
    })
  }
  async function save() {
    const ok = await run(async () => {
      must(await supabaseBrowser().from('judges').update({ affiliation: d.affiliation.trim() || null, expertise: d.expertise.trim() || null }).eq('id', j.id))
    })
    if (ok) setEdit(false)
  }
  async function reinvite() {
    await run(async () => {
      const r = await api<{ message: string }>('/api/invite', { body: { role: 'judge', program_id: programId, judge_id: j.id } })
      setNotice(r.message)
    })
  }
  async function remove() {
    if (!confirm(`${j.name}님을 이 프로그램에서 제외합니다.\n배정·점수·심사평·서명 기록이 모두 삭제됩니다. 되돌릴 수 없습니다.`)) return
    await run(async () => { must(await supabaseBrowser().from('judges').delete().eq('id', j.id)) })
  }

  return (
    <tr className={!signedAll ? 'bg-highlight/5' : undefined}>
      <td>
        <div className="font-semibold">{j.name || '(이름 없음)'}{j.is_chair && <Badge tone="primary" className="ml-1">위원장</Badge>}</div>
        <div className="text-xs text-muted">{j.email}{j.phone ? ` · ${j.phone}` : ''}</div>
        {(error || notice) && <div className={`text-xs ${error ? 'text-danger' : 'text-accent'}`}>{error || notice}</div>}
      </td>
      <td>
        {edit ? (
          <div className="grid gap-1">
            <Input className="h-8 text-sm" value={d.affiliation} onChange={e => setD({ ...d, affiliation: e.target.value })} placeholder="소속" />
            <Input className="h-8 text-sm" value={d.expertise} onChange={e => setD({ ...d, expertise: e.target.value })} placeholder="전문분야" />
          </div>
        ) : (
          <>
            <div>{j.affiliation ?? '-'}</div>
            {j.expertise && <div className="text-xs text-muted">{j.expertise}</div>}
          </>
        )}
      </td>
      <td>{j.joined == null ? <span className="text-xs text-muted">-</span> : j.joined ? <Badge tone="accent">가입 완료</Badge> : <Badge tone="highlight">초대됨</Badge>}</td>
      {templates.map(t => {
        const c = j.consents.find(x => x.template_id === t.id)
        return (
          <td key={t.id}>
            {c ? (
              <div className="flex items-center gap-1.5">
                <Badge tone="accent">서명</Badge>
                <a href={`/api/admin/consents/${c.id}/url`} target="_blank" rel="noopener" className="text-xs font-semibold text-primary hover:underline">PDF</a>
                <div className="hidden text-[11px] text-muted xl:block">{fmtDate(c.signed_at)}</div>
              </div>
            ) : <Badge tone={t.required ? 'highlight' : 'neutral'}>미서명</Badge>}
          </td>
        )
      })}
      <td className="max-w-[240px] text-xs">
        {declared.length === 0 && j.conflicts.length === 0 && <span className="text-muted">없음</span>}
        {declared.map(c => <div key={c.id} className="text-[#8a5a00]">확인서: 이해관계 있음{c.conflict_note ? ` — ${c.conflict_note}` : ''}</div>)}
        {j.conflicts.map((c, i) => (
          <div key={i} className="text-[#8a5a00]">{c.stage} · {c.company}{c.reason ? ` (${c.reason})` : ''}{c.reported_at ? ' · 본인 신고' : ' · 관리자 제외'}</div>
        ))}
      </td>
      <td>
        <div className="flex justify-end gap-1 whitespace-nowrap">
          {edit ? (
            <>
              <Button size="sm" onClick={save} disabled={busy}>저장</Button>
              <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>취소</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={toggleChair} disabled={busy}>{j.is_chair ? '위원장 해제' : '위원장 지정'}</Button>
              {!j.joined && <Button size="sm" variant="ghost" onClick={reinvite} disabled={busy}>재발송</Button>}
              <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>수정</Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={remove} disabled={busy}>삭제</Button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function JudgesManager({ programId, judges, templates, pool }:
  { programId: string; judges: JudgeView[]; templates: ConsentTemplate[]; pool: JudgePoolEntry[] }) {
  const { busy, error, notice, run, setNotice } = useRun()
  const [open, setOpen] = useState(judges.length === 0)
  const [f, setF] = useState(EMPTY)
  const emails = new Set(judges.map(j => j.email?.toLowerCase()))
  const poolOptions = pool.filter(p => !p.email || !emails.has(p.email.toLowerCase()))

  function pickPool(id: string) {
    const p = pool.find(x => x.id === id)
    if (!p) return setF({ ...f, pool_id: '' })
    setF({ ...f, pool_id: id, name: p.name, email: p.email ?? '', affiliation: p.affiliation ?? '', expertise: p.expertise.join(', ') })
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const ok = await run(async () => {
      const r = await api<{ message: string }>('/api/invite', {
        body: {
          role: 'judge', program_id: programId, name: f.name.trim(), email: f.email.trim(),
          affiliation: f.affiliation.trim() || null, expertise: f.expertise.trim() || null, is_chair: f.is_chair, pool_id: f.pool_id || null,
        },
      })
      setNotice(`${f.name}: ${r.message}`)
    })
    if (ok) setF(EMPTY)
  }

  const signedCount = judges.filter(j => templates.filter(t => t.required).every(t => j.consents.some(c => c.template_id === t.id))).length

  return (
    <div className="grid gap-5">
      <Feedback error={error} notice={notice} />
      <Card title="심사위원 등록·초대" actions={<Button size="sm" variant="ghost" onClick={() => setOpen(o => !o)}>{open ? '닫기' : '열기'}</Button>}>
        {open ? (
          <form onSubmit={add} className="grid gap-3 md:grid-cols-3">
            {pool.length > 0 && (
              <div className="md:col-span-3">
                <Field label="심사위원 풀에서 불러오기" hint="전문분야·참여 이력은 심사위원 풀(A-16)에서 관리">
                  <Select value={f.pool_id} onChange={e => pickPool(e.target.value)}>
                    <option value="">직접 입력</option>
                    {poolOptions.map(p => <option key={p.id} value={p.id}>{p.name}{p.affiliation ? ` · ${p.affiliation}` : ''}{p.expertise.length ? ` · ${p.expertise.join(', ')}` : ''}</option>)}
                  </Select>
                </Field>
              </div>
            )}
            <Field label="이름" required><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></Field>
            <Field label="이메일" required><Input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required /></Field>
            <Field label="소속"><Input value={f.affiliation} onChange={e => setF({ ...f, affiliation: e.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="전문분야"><Input value={f.expertise} onChange={e => setF({ ...f, expertise: e.target.value })} placeholder="예: AI, 바이오, 투자" /></Field></div>
            <div className="flex items-end pb-2"><Check label="심사위원장" hint="종합의견·확정 확인 서명" checked={f.is_chair} onChange={v => setF({ ...f, is_chair: v })} /></div>
            <div className="md:col-span-3"><Button type="submit" disabled={busy || !f.name.trim() || !f.email.trim()}>등록하고 초대 메일 발송</Button></div>
          </form>
        ) : <p className="text-sm text-muted">이미 가입한 심사위원은 기존 계정으로 연결되고 안내만 발송됩니다.</p>}
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>전체 <b className="tabular text-fg">{judges.length}</b>명</span>
        <span>필수 동의서 서명 완료 <b className="tabular text-accent">{signedCount}</b>명</span>
        {templates.length === 0 && <Badge tone="highlight">활성 동의서 양식 없음</Badge>}
      </div>

      {judges.length === 0 ? <Empty>등록된 심사위원이 없습니다.</Empty> : (
        <Table>
          <thead>
            <tr>
              <th>심사위원</th><th>소속·전문분야</th><th>가입</th>
              {templates.map(t => <th key={t.id}>{CONSENT_KINDS[t.kind] ?? t.title} <span className="font-normal">v{t.version}{t.required ? '' : ' (선택)'}</span></th>)}
              <th>이해충돌</th>
              <th className="text-right">작업</th>
            </tr>
          </thead>
          <tbody>{judges.map(j => <JudgeRow key={j.id} j={j} programId={programId} templates={templates} />)}</tbody>
        </Table>
      )}
    </div>
  )
}
