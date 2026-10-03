'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { APPEAL_STATUS, fmtDate } from '@/lib/format'
import type { AppealStatus, EntryResult } from '@/lib/types'
import { Alert, Badge, Button, Empty, Field, Select, Textarea, cn } from '@/components/ui'
import { ResultBadge } from '@/components/StatusBadges'
import { ConfirmDialog } from './ui'

export interface AppealRow {
  id: string
  reason: string
  status: AppealStatus
  review_note: string | null
  rereview: boolean | null
  response: string | null
  created_at: string
  decided_at: string | null
  decided_by_name: string | null
  attachment_url: string | null
  attachment_name: string | null
  company: string
  blind_code: string | null
  stage: string
  stage_id: string
  result: EntryResult
}

const TONE: Record<AppealStatus, 'neutral' | 'primary' | 'accent' | 'danger' | 'highlight'> = {
  received: 'highlight', reviewing: 'primary', accepted: 'accent', rejected: 'danger',
}

export default function AppealsManager({ programId, appeals }: { programId: string; appeals: AppealRow[] }) {
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const list = appeals.filter(a => filter === 'all' || a.status === 'received' || a.status === 'reviewing')
  const open = appeals.filter(a => a.status === 'received' || a.status === 'reviewing').length
  if (!appeals.length) return <Empty>접수된 이의신청이 없습니다.</Empty>
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2 text-sm">
        {(['open', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('rounded-md border px-3 py-1.5 font-semibold', filter === f ? 'border-primary bg-primary/10 text-primary' : 'border-line bg-card text-muted')}>
            {f === 'open' ? `미처리 ${open}` : `전체 ${appeals.length}`}
          </button>
        ))}
      </div>
      {list.length === 0 && <Empty>미처리 이의신청이 없습니다.</Empty>}
      {list.map(a => <AppealCard key={a.id} programId={programId} a={a} />)}
    </div>
  )
}

function AppealCard({ programId, a }: { programId: string; a: AppealRow }) {
  const router = useRouter()
  const decided = a.status === 'accepted' || a.status === 'rejected'
  const [form, setForm] = useState({ review_note: a.review_note ?? '', rereview: a.rereview, response: a.response ?? '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null)
  const [decide, setDecide] = useState<'accepted' | 'rejected' | null>(null)

  async function save(status?: AppealStatus) {
    setBusy(true)
    try {
      await api(`/api/appeals/${a.id}`, { method: 'PATCH', body: { ...form, ...(status ? { status } : {}) } })
      setMsg({ tone: 'accent', text: status === 'accepted' || status === 'rejected' ? `${APPEAL_STATUS[status]} 결정 · 회신 저장됨` : '저장됨' })
      setDecide(null)
      router.refresh()
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : '저장하지 못했습니다.' })
    } finally { setBusy(false) }
  }

  return (
    <section className="rounded-lg border border-line bg-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <Badge tone={TONE[a.status]}>{APPEAL_STATUS[a.status]}</Badge>
        <span className="font-bold">{a.company}</span>
        {a.blind_code && <span className="tabular text-xs text-muted">{a.blind_code}</span>}
        <span className="text-sm text-muted">{a.stage}</span>
        <ResultBadge value={a.result} />
        <span className="ml-auto text-xs text-muted">접수 {fmtDate(a.created_at)}</span>
      </header>
      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="grid content-start gap-3">
          <div>
            <div className="mb-1 text-sm font-semibold">신청 사유</div>
            <p className="whitespace-pre-wrap rounded-md bg-bg px-3 py-2 text-sm">{a.reason}</p>
          </div>
          <div className="text-sm">
            <span className="font-semibold">첨부 </span>
            {a.attachment_url ? <a href={a.attachment_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{a.attachment_name}</a>
              : a.attachment_name ? <span className="text-muted">{a.attachment_name} (링크 생성 실패)</span> : <span className="text-muted">없음</span>}
            <span className="ml-2 text-xs text-muted">링크 10분 유효</span>
          </div>
          <Link href={`/a/p/${programId}/results?stage=${a.stage_id}`} className="text-sm text-primary hover:underline">이 단계 평가 결과 보기 →</Link>
          {decided && <div className="text-xs text-muted">결정 {fmtDate(a.decided_at)}{a.decided_by_name ? ` · ${a.decided_by_name}` : ''}</div>}
        </div>
        <div className="grid content-start gap-3">
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <Field label="검토 의견 (내부)">
            <Textarea value={form.review_note} onChange={e => setForm({ ...form, review_note: e.target.value })} placeholder="사실관계 확인, 점수 재검토 결과 등" />
          </Field>
          <Field label="재심 여부">
            <Select value={form.rereview == null ? '' : form.rereview ? 'y' : 'n'}
              onChange={e => setForm({ ...form, rereview: e.target.value === '' ? null : e.target.value === 'y' })}>
              <option value="">미정</option><option value="y">재심 실시</option><option value="n">재심 불요</option>
            </Select>
          </Field>
          <Field label="기업 회신" hint="결정 시 필수. 기업의 이의신청 화면에 표시됩니다.">
            <Textarea value={form.response} onChange={e => setForm({ ...form, response: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => save(decided ? undefined : 'reviewing')} disabled={busy}>{decided ? '저장' : '검토 중으로 저장'}</Button>
            <Button onClick={() => setDecide('accepted')} disabled={busy || !form.response.trim()}>인용</Button>
            <Button variant="danger" onClick={() => setDecide('rejected')} disabled={busy || !form.response.trim()}>기각</Button>
            {decided && <Button variant="ghost" onClick={() => save('reviewing')} disabled={busy}>결정 취소</Button>}
          </div>
        </div>
      </div>
      <ConfirmDialog open={!!decide} busy={busy} tone={decide === 'rejected' ? 'danger' : 'primary'}
        title={`${a.company} 이의신청을 ${decide ? APPEAL_STATUS[decide] : ''}할까요?`} confirmLabel={decide ? `${APPEAL_STATUS[decide]} 결정` : '확인'}
        onClose={() => setDecide(null)} onConfirm={() => decide && save(decide)}>
        <p>결정과 회신 내용이 기업에 공개되고 처리 이력에 남습니다.</p>
        {decide === 'accepted' && form.rereview && <Alert tone="highlight">재심을 실시하면 단계 확정 해제 후 평가 재오픈이 필요할 수 있습니다.</Alert>}
        <div className="whitespace-pre-wrap rounded-md bg-bg px-3 py-2">{form.response}</div>
      </ConfirmDialog>
    </section>
  )
}
