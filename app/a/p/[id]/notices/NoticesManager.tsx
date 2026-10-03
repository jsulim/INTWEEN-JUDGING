'use client'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Badge, Button, Card, Empty, Field, Input, Select, Textarea } from '@/components/ui'
import { Feedback, must, useRun } from '@/components/admin/setup/client'
import { fmtDate } from '@/lib/format'
import type { Notice, Role } from '@/lib/types'

const TARGET: Record<string, string> = { all: '전체', company: '참가 기업', judge: '심사위원' }
type Draft = { title: string; body: string; target: 'all' | 'company' | 'judge' }
const toDraft = (n?: Notice): Draft => ({ title: n?.title ?? '', body: n?.body ?? '', target: (n?.target_role as Draft['target']) ?? 'all' })
const toRow = (d: Draft) => ({ title: d.title.trim(), body: d.body.trim(), target_role: d.target === 'all' ? null : (d.target as Role) })

function NoticeForm({ d, setD }: { d: Draft; setD: (d: Draft) => void }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <Field label="제목" required><Input value={d.title} onChange={e => setD({ ...d, title: e.target.value })} /></Field>
        <Field label="대상">
          <Select value={d.target} onChange={e => setD({ ...d, target: e.target.value as Draft['target'] })}>
            <option value="all">전체</option><option value="company">참가 기업</option><option value="judge">심사위원</option>
          </Select>
        </Field>
      </div>
      <Field label="내용"><Textarea className="min-h-[160px]" value={d.body} onChange={e => setD({ ...d, body: e.target.value })} /></Field>
    </div>
  )
}

function NoticeItem({ n }: { n: Notice }) {
  const { busy, error, run } = useRun()
  const [edit, setEdit] = useState(false)
  const [d, setD] = useState(toDraft(n))
  async function save() {
    if (!d.title.trim()) return alert('제목을 입력해 주세요.')
    const ok = await run(async () => { must(await supabaseBrowser().from('notices').update(toRow(d)).eq('id', n.id)) })
    if (ok) setEdit(false)
  }
  async function remove() {
    if (!confirm(`'${n.title}' 공지를 삭제합니다.`)) return
    await run(async () => { must(await supabaseBrowser().from('notices').delete().eq('id', n.id)) })
  }
  return (
    <Card title={edit ? '공지 수정' : <span className="flex items-center gap-2">{n.title}<Badge tone={n.target_role ? 'primary' : 'neutral'}>{TARGET[n.target_role ?? 'all']}</Badge></span>}
      actions={edit ? <>
        <Button size="sm" onClick={save} disabled={busy}>저장</Button>
        <Button size="sm" variant="ghost" onClick={() => { setEdit(false); setD(toDraft(n)) }}>취소</Button>
      </> : <>
        <span className="text-xs text-muted">{fmtDate(n.created_at)}</span>
        <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>수정</Button>
        <Button size="sm" variant="ghost" className="text-danger" onClick={remove} disabled={busy}>삭제</Button>
      </>}>
      <Feedback error={error} />
      {edit ? <NoticeForm d={d} setD={setD} /> : <div className="whitespace-pre-line text-sm leading-relaxed">{n.body || <span className="text-muted">(내용 없음)</span>}</div>}
    </Card>
  )
}

export default function NoticesManager({ programId, notices }: { programId: string; notices: Notice[] }) {
  const { busy, error, notice, run } = useRun()
  const [d, setD] = useState(toDraft())
  const [filter, setFilter] = useState<'all-list' | Draft['target']>('all-list')

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!d.title.trim()) return
    const ok = await run(async () => { must(await supabaseBrowser().from('notices').insert({ ...toRow(d), program_id: programId })) }, { success: '공지를 등록했습니다.' })
    if (ok) setD(toDraft())
  }

  const list = filter === 'all-list' ? notices : notices.filter(n => (n.target_role ?? 'all') === filter)
  return (
    <div className="grid gap-5">
      <Card title="새 공지">
        <Feedback error={error} notice={notice} />
        <form onSubmit={add} className="grid gap-3">
          <NoticeForm d={d} setD={setD} />
          <div><Button type="submit" disabled={busy || !d.title.trim()}>등록</Button></div>
        </form>
      </Card>
      <div className="flex gap-1">
        {(['all-list', 'all', 'company', 'judge'] as const).map(k => (
          <Button key={k} size="sm" variant={filter === k ? 'secondary' : 'ghost'} onClick={() => setFilter(k)}>
            {k === 'all-list' ? '모두' : `${TARGET[k]} 대상`}
          </Button>
        ))}
      </div>
      {list.length === 0 ? <Empty>공지가 없습니다.</Empty> : list.map(n => <NoticeItem key={n.id} n={n} />)}
    </div>
  )
}
