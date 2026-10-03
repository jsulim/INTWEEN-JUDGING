'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Badge, Button, Card, Empty, Field, Input, Select, Table, Textarea } from '@/components/ui'
import { Check, Feedback, must, useRun } from '@/components/admin/setup/client'
import { DEFAULT_CONSENTS } from '@/components/admin/setup/consent-defaults'
import { fmtDate } from '@/lib/format'
import type { Program } from '@/lib/types'

export type ProgramRow = Program & { stageCount: number; companyCount: number; judgeCount: number }

const STATUS: Record<Program['status'], string> = { draft: '준비', active: '운영', closed: '종료', archived: '보관' }
const STATUS_TONE = { draft: 'neutral', active: 'accent', closed: 'primary', archived: 'neutral' } as const
const TYPE: Record<Program['type'], string> = { hackathon: '해커톤', screening: '기업심사' }

const EMPTY = { title: '', type: 'screening' as Program['type'], description: '', retention_years: '3', payment_per_session: '0', defaults: true }

export default function ProgramsManager({ programs }: { programs: ProgramRow[] }) {
  const router = useRouter()
  const sb = supabaseBrowser()
  const { busy, error, notice, run } = useRun()
  const [open, setOpen] = useState(programs.length === 0)
  const [form, setForm] = useState(EMPTY)
  const [filter, setFilter] = useState<'all' | Program['status']>('all')

  async function create(e: React.FormEvent) {
    e.preventDefault()
    let newId = ''
    const ok = await run(async () => {
      const p = must(await sb.from('programs').insert({
        title: form.title.trim(),
        type: form.type,
        description: form.description.trim() || null,
        retention_years: Number(form.retention_years) || 3,
        payment_per_session: Number(form.payment_per_session) || 0,
      }).select('id').single()) as { id: string }
      newId = p.id
      if (form.defaults) {
        must(await sb.from('consent_templates').insert(DEFAULT_CONSENTS.map(t => ({ ...t, program_id: p.id })), { defaultToNull: false }))
      }
    }, { success: '프로그램을 만들었습니다.' })
    if (ok) {
      setForm(EMPTY)
      setOpen(false)
      router.push(`/a/p/${newId}/stages`)
    }
  }

  async function setStatus(p: ProgramRow, status: Program['status']) {
    if (status === 'closed' && !confirm(`'${p.title}'을(를) 종료합니다. 종료일부터 개인정보 보유기간(${p.retention_years}년)이 기산됩니다.`)) return
    await run(async () => {
      must(await sb.from('programs').update({
        status, ...(status === 'closed' && !p.closed_at ? { closed_at: new Date().toISOString() } : {}),
      }).eq('id', p.id))
    }, { success: `상태를 '${STATUS[status]}'(으)로 변경했습니다.` })
  }

  async function clone(p: ProgramRow) {
    const title = prompt('복제할 프로그램 이름', `${p.title} (복제)`)
    if (!title?.trim()) return
    let id = ''
    const ok = await run(async () => {
      id = must(await sb.rpc('clone_program', { p_src: p.id, p_title: title.trim() })) as string
    })
    if (ok && id) router.push(`/a/p/${id}/stages`)
  }

  async function remove(p: ProgramRow) {
    if (p.status !== 'draft') return
    if (!confirm(`'${p.title}'을(를) 삭제합니다. 단계·평가항목·기업·심사위원 등 모든 데이터가 함께 삭제되며 되돌릴 수 없습니다.`)) return
    await run(async () => { must(await sb.from('programs').delete().eq('id', p.id)) }, { success: '삭제했습니다.' })
  }

  const list = filter === 'all' ? programs : programs.filter(p => p.status === filter)

  return (
    <div className="grid gap-6">
      <Feedback error={error} notice={notice} />
      <Card title="새 프로그램" actions={<Button size="sm" variant="ghost" onClick={() => setOpen(o => !o)}>{open ? '닫기' : '열기'}</Button>}>
        {open ? (
          <form onSubmit={create} className="grid gap-4 md:grid-cols-2">
            <Field label="프로그램명" required><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="2026 INTWEEN 오픈이노베이션 해커톤" /></Field>
            <Field label="유형" required>
              <Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as Program['type'] })}>
                <option value="screening">기업심사 (지원사업 심사)</option>
                <option value="hackathon">해커톤</option>
              </Select>
            </Field>
            <div className="md:col-span-2"><Field label="설명"><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field></div>
            <Field label="개인정보 보유기간 (년)" hint="프로그램 종료일 기준. 발주처 공고 기준을 따릅니다.">
              <Input type="number" min={1} max={20} value={form.retention_years} onChange={e => setForm({ ...form, retention_years: e.target.value })} />
            </Field>
            <Field label="심사 1회 수당 (원)">
              <Input type="number" min={0} step={10000} value={form.payment_per_session} onChange={e => setForm({ ...form, payment_per_session: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Check label="기본 동의서 양식 생성" hint="개인정보 수집·이용 동의, 보안서약, 이해충돌 확인 (동의서 양식 탭에서 수정)"
                checked={form.defaults} onChange={v => setForm({ ...form, defaults: v })} />
            </div>
            <div className="md:col-span-2"><Button type="submit" disabled={busy || !form.title.trim()}>만들기</Button></div>
          </form>
        ) : <p className="text-sm text-muted">이전 프로그램을 템플릿으로 쓰려면 목록에서 &apos;복제&apos;를 누르세요. 단계·평가항목·가점 규칙·신청 항목·동의서가 복사되고 일정·참가자는 제외됩니다.</p>}
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap gap-1">
          {(['all', 'active', 'draft', 'closed', 'archived'] as const).map(s => (
            <Button key={s} size="sm" variant={filter === s ? 'secondary' : 'ghost'} onClick={() => setFilter(s)}>
              {s === 'all' ? '전체' : STATUS[s]} <span className="text-xs text-muted">{s === 'all' ? programs.length : programs.filter(p => p.status === s).length}</span>
            </Button>
          ))}
        </div>
        {list.length === 0 ? <Empty>프로그램이 없습니다.</Empty> : (
          <Table>
            <thead>
              <tr><th>프로그램</th><th>유형</th><th>상태</th><th className="text-right">단계</th><th className="text-right">기업</th><th className="text-right">심사위원</th><th>생성일</th><th className="text-right">작업</th></tr>
            </thead>
            <tbody>
              {list.map(p => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/a/p/${p.id}`} className="font-semibold hover:text-primary">{p.title}</Link>
                    {p.cloned_from && <span className="ml-2 text-xs text-muted">복제본</span>}
                    {p.description && <div className="line-clamp-1 max-w-md text-xs text-muted">{p.description}</div>}
                  </td>
                  <td>{TYPE[p.type]}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[p.status]}>{STATUS[p.status]}</Badge>
                      <select aria-label="상태 변경" className="rounded border border-line bg-card px-1 py-0.5 text-xs" value={p.status} disabled={busy}
                        onChange={e => setStatus(p, e.target.value as Program['status'])}>
                        {(Object.keys(STATUS) as Program['status'][]).map(s => <option key={s} value={s}>{STATUS[s]}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="tabular text-right">{p.stageCount}</td>
                  <td className="tabular text-right">{p.companyCount}</td>
                  <td className="tabular text-right">{p.judgeCount}</td>
                  <td className="whitespace-nowrap text-muted">{fmtDate(p.created_at, false)}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Link href={`/a/p/${p.id}/settings`} className="rounded px-2 py-1 text-xs font-semibold hover:bg-fg/5">설정</Link>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => clone(p)}>복제</Button>
                      {p.status === 'draft' && <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => remove(p)}>삭제</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  )
}
