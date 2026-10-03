'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import type { JudgePoolEntry } from '@/lib/types'
import { Alert, Badge, Button, Empty, Field, Input, Select, Table, Textarea, cn } from '@/components/ui'
import { ConfirmDialog } from './ui'

type Hist = { program_id: string; title: string; year: number; chair?: boolean }
export type PoolRow = JudgePoolEntry & { computed: Hist[] }
type Form = { name: string; email: string; phone: string; affiliation: string; expertise: string; career: string; note: string }

const empty: Form = { name: '', email: '', phone: '', affiliation: '', expertise: '', career: '', note: '' }
const tagsOf = (s: string) => [...new Set(s.split(/[,#\n]/).map(t => t.trim()).filter(Boolean))]
const PROGRAM_STATUS: Record<string, string> = { draft: '준비', active: '진행', closed: '종료', archived: '보관' }

export default function PoolManager({ rows, programs }: { rows: PoolRow[]; programs: { id: string; title: string; status: string }[] }) {
  const router = useRouter()
  const sb = supabaseBrowser()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<{ id: string | null; form: Form } | null>(null)
  const [del, setDel] = useState<PoolRow | null>(null)
  const [assign, setAssign] = useState<{ row: PoolRow; program_id: string; is_chair: boolean } | null>(null)

  const allTags = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) for (const t of r.expertise) m.set(t, (m.get(t) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
  }, [rows])

  const list = rows.filter(r => {
    if (tag && !r.expertise.includes(tag)) return false
    const s = q.trim().toLowerCase()
    if (!s) return true
    return [r.name, r.email, r.affiliation, r.career, r.note, ...r.expertise].some(v => (v ?? '').toLowerCase().includes(s))
  })

  const strip = (h: Hist[]) => h.map(({ program_id, title, year }) => ({ program_id, title, year }))
  const stale = rows.filter(r => JSON.stringify(strip(r.history ?? [])) !== JSON.stringify(strip(r.computed)))

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    try { await fn(); setMsg({ tone: 'accent', text: ok }); router.refresh() }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof Error ? e.message : '처리하지 못했습니다.' }) }
    finally { setBusy(false) }
  }

  const save = () => run(async () => {
    const f = edit!.form
    if (!f.name.trim()) throw new Error('이름을 입력해 주세요.')
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) throw new Error('이메일 형식을 확인해 주세요.')
    const row = {
      name: f.name.trim(), email: f.email.trim() || null, phone: f.phone.trim() || null, affiliation: f.affiliation.trim() || null,
      expertise: tagsOf(f.expertise), career: f.career.trim() || null, note: f.note.trim() || null,
    }
    const { error } = edit!.id ? await sb.from('judge_pool').update(row).eq('id', edit!.id) : await sb.from('judge_pool').insert(row)
    if (error) throw new Error(error.code === '23505' ? '이미 등록된 사용자입니다.' : '저장하지 못했습니다.')
    setEdit(null)
  }, edit?.id ? '수정됨' : '풀에 등록됨')

  const remove = () => run(async () => {
    const { error } = await sb.from('judge_pool').delete().eq('id', del!.id)
    if (error) throw new Error('삭제하지 못했습니다.')
    setDel(null)
  }, '삭제됨')

  const syncHistory = () => run(async () => {
    for (const r of stale) {
      const patch: Record<string, unknown> = { history: strip(r.computed) }
      const { error } = await sb.from('judge_pool').update(patch).eq('id', r.id)
      if (error) throw new Error('이력을 갱신하지 못했습니다.')
    }
  }, `참여 이력 ${stale.length}건 갱신됨`)

  const doAssign = () => run(async () => {
    const a = assign!
    if (!a.row.email) throw new Error('이메일이 없어 초대할 수 없습니다. 먼저 이메일을 입력해 주세요.')
    await api('/api/invite', {
      body: {
        role: 'judge', program_id: a.program_id, email: a.row.email, name: a.row.name, affiliation: a.row.affiliation,
        expertise: a.row.expertise.join(', '), is_chair: a.is_chair, pool_id: a.row.id,
      },
    })
    setAssign(null)
  }, `${assign?.row.name} 배정·초대 메일 발송됨`)

  const openEdit = (r?: PoolRow) => setEdit(r
    ? { id: r.id, form: { name: r.name, email: r.email ?? '', phone: r.phone ?? '', affiliation: r.affiliation ?? '', expertise: r.expertise.join(', '), career: r.career ?? '', note: r.note ?? '' } }
    : { id: null, form: empty })

  return (
    <div className="grid gap-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" value={q} onChange={e => setQ(e.target.value)} placeholder="이름·소속·전문분야 검색" />
        <div className="ml-auto flex gap-2">
          {stale.length > 0 && <Button variant="outline" onClick={syncHistory} disabled={busy}>참여 이력 갱신 ({stale.length})</Button>}
          <Button onClick={() => openEdit()}>심사위원 등록</Button>
        </div>
      </div>
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setTag(null)} className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', !tag ? 'border-primary bg-primary/10 text-primary' : 'border-line bg-card text-muted')}>전체</button>
          {allTags.map(([t, n]) => (
            <button key={t} onClick={() => setTag(tag === t ? null : t)}
              className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', tag === t ? 'border-primary bg-primary/10 text-primary' : 'border-line bg-card text-muted hover:text-fg')}>
              {t} <span className="tabular">{n}</span>
            </button>
          ))}
        </div>
      )}

      {!list.length ? <Empty>{rows.length ? '조건에 맞는 심사위원이 없습니다.' : '등록된 심사위원이 없습니다.'}</Empty> : (
        <Table>
          <thead><tr><th>이름</th><th>소속</th><th>전문분야</th><th>경력</th><th>참여 이력</th><th>연락처</th><th /></tr></thead>
          <tbody>
            {list.map(r => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap font-semibold">{r.name}{r.user_id && <span className="ml-1 text-xs font-normal text-accent">계정</span>}</td>
                <td>{r.affiliation ?? '-'}</td>
                <td><div className="flex max-w-[240px] flex-wrap gap-1">{r.expertise.map(t => <Badge key={t} tone="primary">{t}</Badge>)}</div></td>
                <td className="max-w-[240px] whitespace-pre-wrap text-sm text-muted">{r.career ?? ''}{r.note && <div className="mt-1 text-xs">메모: {r.note}</div>}</td>
                <td className="text-sm">
                  {r.computed.length ? (
                    <ul className="grid gap-0.5">
                      {r.computed.slice(0, 4).map(h => <li key={h.program_id}><span className="tabular text-muted">{h.year}</span> {h.title}{h.chair && <span className="ml-1 text-xs text-primary">위원장</span>}</li>)}
                      {r.computed.length > 4 && <li className="text-xs text-muted">외 {r.computed.length - 4}건</li>}
                    </ul>
                  ) : <span className="text-muted">없음</span>}
                </td>
                <td className="whitespace-nowrap text-sm"><div>{r.email ?? '-'}</div><div className="text-muted">{r.phone ?? ''}</div></td>
                <td className="whitespace-nowrap text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="secondary" disabled={!r.email || !programs.length}
                      title={!r.email ? '이메일이 필요합니다' : undefined}
                      onClick={() => setAssign({ row: r, program_id: programs.find(p => !r.computed.some(h => h.program_id === p.id))?.id ?? '', is_chair: false })}>프로그램에 배정</Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>수정</Button>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDel(r)}>삭제</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <ConfirmDialog open={!!edit} title={edit?.id ? '심사위원 정보 수정' : '심사위원 풀 등록'} busy={busy} confirmLabel="저장" onClose={() => setEdit(null)} onConfirm={save}
        disabled={!edit?.form.name.trim()}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            {([['name', '이름', true], ['email', '이메일', false], ['phone', '연락처', false], ['affiliation', '소속', false]] as const).map(([k, l, req]) => (
              <Field key={k} label={l} required={req}><Input value={edit.form[k]} onChange={e => setEdit({ ...edit, form: { ...edit.form, [k]: e.target.value } })} /></Field>
            ))}
            <div className="sm:col-span-2"><Field label="전문분야" hint="쉼표로 구분 (예: AI, 바이오, 투자)">
              <Input value={edit.form.expertise} onChange={e => setEdit({ ...edit, form: { ...edit.form, expertise: e.target.value } })} /></Field></div>
            <div className="sm:col-span-2"><Field label="경력"><Textarea value={edit.form.career} onChange={e => setEdit({ ...edit, form: { ...edit.form, career: e.target.value } })} /></Field></div>
            <div className="sm:col-span-2"><Field label="메모"><Input value={edit.form.note} onChange={e => setEdit({ ...edit, form: { ...edit.form, note: e.target.value } })} /></Field></div>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog open={!!assign} title={`${assign?.row.name ?? ''} 프로그램에 배정`} busy={busy} confirmLabel="배정·초대" onClose={() => setAssign(null)} onConfirm={doAssign}
        disabled={!assign?.program_id}>
        {assign && (
          <>
            <Field label="프로그램" required>
              <Select value={assign.program_id} onChange={e => setAssign({ ...assign, program_id: e.target.value })}>
                <option value="">선택</option>
                {programs.map(p => {
                  const already = assign.row.computed.some(h => h.program_id === p.id)
                  return <option key={p.id} value={p.id} disabled={already}>{p.title} ({PROGRAM_STATUS[p.status] ?? p.status}){already ? ' · 참여 중' : ''}</option>
                })}
              </Select>
            </Field>
            <label className="flex items-center gap-2"><input type="checkbox" checked={assign.is_chair} onChange={e => setAssign({ ...assign, is_chair: e.target.checked })} /> 심사위원장으로 지정</label>
            <p className="text-muted">{assign.row.email}로 초대 메일이 발송되고 해당 프로그램 심사위원으로 등록됩니다.</p>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog open={!!del} title="풀에서 삭제할까요?" busy={busy} confirmLabel="삭제" tone="danger" onClose={() => setDel(null)} onConfirm={remove}>
        <p>{del?.name} 정보가 풀에서 삭제됩니다. 이미 배정된 프로그램의 심사위원 등록은 유지됩니다.</p>
      </ConfirmDialog>
    </div>
  )
}
