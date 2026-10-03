'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { SLOT_STATUS, fmtDate, fromLocalInput, toLocalInput } from '@/lib/format'
import type { PresentationSlot, SlotStatus, StageStatus } from '@/lib/types'
import { Alert, Badge, Button, Card, Field, Input, Table, cn } from '@/components/ui'
import { ConfirmDialog } from './ui'

type Slot = PresentationSlot & { company_name: string; blind_code: string | null }
type Msg = { tone: 'accent' | 'danger' | 'highlight'; text: string } | null

const STATUS_TONE: Record<SlotStatus, 'neutral' | 'primary' | 'accent' | 'highlight' | 'danger'> = {
  waiting: 'neutral', presenting: 'primary', qna: 'highlight', done: 'accent', absent: 'danger',
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

const mmss = (sec: number) => {
  const s = Math.abs(Math.round(sec))
  return `${sec < 0 ? '+' : ''}${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function PresentationsManager({ stage, slots, unslotted }: {
  stage: { id: string; name: string; is_presentation: boolean; status: StageStatus }
  slots: Slot[]
  unslotted: { company_id: string; name: string }[]
}) {
  const router = useRouter()
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const now = useNow()
  const sb = supabaseBrowser()

  // 다른 관리자·탭의 변경 반영
  useEffect(() => {
    const ch = sb.channel(`slots:${stage.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presentation_slots', filter: `stage_id=eq.${stage.id}` }, () => router.refresh())
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [sb, stage.id, router])

  // 편집 초안
  type Draft = { start_at: string; present_min: string; qna_min: string; meeting_url: string }
  const toDraft = (s: Slot): Draft => ({ start_at: toLocalInput(s.start_at), present_min: String(s.present_min), qna_min: String(s.qna_min), meeting_url: s.meeting_url ?? '' })
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(slots.map(s => [s.id, toDraft(s)])))
  useEffect(() => { setDrafts(Object.fromEntries(slots.map(s => [s.id, toDraft(s)]))) }, [slots])
  const dirty = (s: Slot) => JSON.stringify(drafts[s.id]) !== JSON.stringify(toDraft(s))

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true)
    try { await fn(); if (ok) setMsg({ tone: 'accent', text: ok }); router.refresh() }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof Error ? e.message : '처리하지 못했습니다.' }) }
    finally { setBusy(false) }
  }

  const createSlots = () => run(async () => {
    const start = slots.reduce((m, s) => Math.max(m, s.order_no), 0)
    const { error } = await sb.from('presentation_slots').insert(
      unslotted.map((u, i) => ({ stage_id: stage.id, company_id: u.company_id, order_no: start + i + 1 })), { defaultToNull: false })
    if (error) throw new Error('슬롯을 만들지 못했습니다.')
  }, `${unslotted.length}개 기업을 발표 순서에 추가했습니다.`)

  const move = (i: number, dir: -1 | 1) => run(async () => {
    const a = slots[i], b = slots[i + dir]
    if (!a || !b) return
    const r1 = await sb.from('presentation_slots').update({ order_no: b.order_no }).eq('id', a.id)
    const r2 = await sb.from('presentation_slots').update({ order_no: a.order_no }).eq('id', b.id)
    if (r1.error || r2.error) throw new Error('순서를 바꾸지 못했습니다.')
  })

  const remove = (s: Slot) => run(async () => {
    const { error } = await sb.from('presentation_slots').delete().eq('id', s.id)
    if (error) throw new Error('삭제하지 못했습니다.')
  }, `${s.company_name} 슬롯 삭제됨`)

  const saveRow = (s: Slot) => run(async () => {
    const d = drafts[s.id]
    const url = d.meeting_url.trim()
    if (url && !/^https?:\/\//i.test(url)) throw new Error('화상 링크는 http(s):// 로 시작해야 합니다.')
    const { error } = await sb.from('presentation_slots').update({
      start_at: fromLocalInput(d.start_at), present_min: Math.max(1, Number(d.present_min) || 10), qna_min: Math.max(0, Number(d.qna_min) || 0),
      meeting_url: url || null,
    }).eq('id', s.id)
    if (error) throw new Error('저장하지 못했습니다.')
  }, '저장됨')

  // 시작 시각 일괄 배정
  const [bulk, setBulk] = useState({ start: '', gap: '2', url: '' })
  const applyBulk = () => run(async () => {
    if (!bulk.start) throw new Error('첫 발표 시작 시각을 입력해 주세요.')
    let t = new Date(fromLocalInput(bulk.start)!).getTime()
    for (const s of slots) {
      if (s.status === 'absent') continue
      const d = drafts[s.id]
      const patch: Record<string, unknown> = { start_at: new Date(t).toISOString() }
      if (bulk.url.trim()) patch.meeting_url = bulk.url.trim()
      const { error } = await sb.from('presentation_slots').update(patch).eq('id', s.id)
      if (error) throw new Error('시작 시각을 저장하지 못했습니다.')
      t += ((Number(d.present_min) || s.present_min) + (Number(d.qna_min) || s.qna_min) + (Number(bulk.gap) || 0)) * 60_000
    }
  }, '시작 시각을 순서대로 배정했습니다.')

  const [drawOpen, setDrawOpen] = useState(false)
  const draw = () => run(async () => {
    const r = await api<{ seed: string }>(`/api/presentations/${stage.id}/draw`, { method: 'POST', body: {} })
    setDrawOpen(false)
    setMsg({ tone: 'accent', text: `추첨 완료 · 시드 ${r.seed} (감사로그에 순서와 함께 기록됨)` })
  })
  const notify = () => run(async () => {
    const r = await api<{ sent: number }>(`/api/presentations/${stage.id}/notify`, { method: 'POST', body: {} })
    setMsg({ tone: 'accent', text: `발표 일정·화상 링크 ${r.sent}건 배포 요청됨 (n8n)` })
  })

  const setState = (s: Slot, status: SlotStatus) => run(async () => {
    await api(`/api/presentations/${s.id}/state`, { method: 'PATCH', body: { status } })
  })

  const current = slots.find(s => s.status === 'presenting' || s.status === 'qna') ?? null
  const nextWaiting = useMemo(() => {
    const after = current ? slots.filter(s => s.order_no > current.order_no) : slots
    return after.find(s => s.status === 'waiting') ?? slots.find(s => s.status === 'waiting') ?? null
  }, [slots, current])
  const counts = slots.reduce((m, s) => ({ ...m, [s.status]: (m[s.status] ?? 0) + 1 }), {} as Record<string, number>)
  const anyStarted = slots.some(s => s.status !== 'waiting')
  const drawSeed = slots.find(s => s.draw_seed)?.draw_seed

  // 타이머
  let remain: number | null = null
  let phaseLen = 0
  if (current?.phase_started_at) {
    phaseLen = (current.status === 'presenting' ? current.present_min : current.qna_min) * 60
    remain = phaseLen - (now - new Date(current.phase_started_at).getTime()) / 1000
  }

  return (
    <div className="grid gap-6">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {!stage.is_presentation && <Alert tone="highlight">이 단계는 발표심사 단계로 설정되어 있지 않습니다. 필요하면 그대로 사용할 수 있습니다.</Alert>}

      {/* 현재 발표 */}
      <section className={cn('rounded-lg border p-5', current ? 'border-primary bg-primary/5' : 'border-line bg-card')}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="min-w-[220px] flex-1">
            <div className="text-sm text-muted">현재 발표</div>
            {current ? (
              <>
                <div className="mt-1 flex items-center gap-2 text-2xl font-bold"><span className="tabular text-muted">{current.order_no}.</span>{current.company_name}</div>
                <div className="mt-1 flex items-center gap-2"><Badge tone={STATUS_TONE[current.status]}>{SLOT_STATUS[current.status]}</Badge>
                  {current.meeting_url && <a href={current.meeting_url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">화상 링크 열기</a>}</div>
              </>
            ) : <div className="mt-1 text-xl font-semibold text-muted">진행 중인 발표 없음</div>}
          </div>
          {current && remain != null && (
            <div className="text-center">
              <div className="text-sm text-muted">{current.status === 'presenting' ? '발표' : '질의응답'} 남은 시간</div>
              <div className={cn('tabular text-5xl font-black', remain < 0 ? 'text-danger' : remain <= 60 ? 'text-[#b07a00]' : 'text-fg')}>{mmss(remain)}</div>
              <div className="mx-auto mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-fg/10">
                <div className={cn('h-full', remain < 0 ? 'bg-danger' : 'bg-accent')} style={{ width: `${Math.min(100, Math.max(0, ((phaseLen - remain) / (phaseLen || 1)) * 100))}%` }} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {current?.status === 'presenting' && <Button onClick={() => setState(current, 'qna')} disabled={busy}>질의응답 시작</Button>}
            {current && <Button variant="outline" onClick={() => setState(current, 'done')} disabled={busy}>완료</Button>}
            {nextWaiting && <Button variant={current ? 'secondary' : 'primary'} onClick={() => setState(nextWaiting, 'presenting')} disabled={busy}>
              {current ? '다음' : '첫'} 기업 발표 시작 · {nextWaiting.company_name}</Button>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          {(['waiting', 'presenting', 'qna', 'done', 'absent'] as SlotStatus[]).map(k => <span key={k} className="tabular">{SLOT_STATUS[k]} {counts[k] ?? 0}</span>)}
          {drawSeed && <span>추첨 시드 <code>{drawSeed}</code></span>}
        </div>
      </section>

      {/* 편성 도구 */}
      <Card title="순서 편성" actions={
        <div className="flex flex-wrap gap-2">
          {unslotted.length > 0 && <Button size="sm" variant="outline" onClick={createSlots} disabled={busy}>참가 기업 {unslotted.length}개 추가</Button>}
          <Button size="sm" variant="outline" onClick={() => setDrawOpen(true)} disabled={busy || anyStarted || (!slots.length && !unslotted.length)}
            title={anyStarted ? '발표가 시작되어 추첨할 수 없습니다' : undefined}>랜덤 추첨</Button>
          <Button size="sm" onClick={notify} disabled={busy || !slots.length}>일정·화상 링크 배포</Button>
        </div>
      }>
        <div className="grid gap-3 md:grid-cols-[1fr_120px_1.4fr_auto] md:items-end">
          <Field label="첫 발표 시작"><Input type="datetime-local" value={bulk.start} onChange={e => setBulk({ ...bulk, start: e.target.value })} /></Field>
          <Field label="기업 간 간격(분)"><Input type="number" min={0} value={bulk.gap} onChange={e => setBulk({ ...bulk, gap: e.target.value })} /></Field>
          <Field label="공통 화상 링크 (선택)" hint="Zoom·Meet 등. 비우면 기업별 링크 유지"><Input value={bulk.url} onChange={e => setBulk({ ...bulk, url: e.target.value })} placeholder="https://" /></Field>
          <Button variant="outline" onClick={applyBulk} disabled={busy || !slots.length}>시작 시각 일괄 배정</Button>
        </div>
      </Card>

      {!slots.length ? (
        <div className="rounded-lg border border-dashed border-line bg-card p-10 text-center text-muted">
          편성된 발표 순서가 없습니다. {unslotted.length ? '참가 기업을 추가하거나 랜덤 추첨을 실행하세요.' : '이 단계에 참가 기업이 없습니다.'}
        </div>
      ) : (
        <Table>
          <thead>
            <tr><th>순서</th><th>기업</th><th>시작 시각</th><th>발표(분)</th><th>질의(분)</th><th>화상 링크</th><th>상태</th><th className="text-right">진행</th><th /></tr>
          </thead>
          <tbody>
            {slots.map((s, i) => {
              const d = drafts[s.id] ?? toDraft(s)
              const set = (patch: Partial<Draft>) => setDrafts(x => ({ ...x, [s.id]: { ...d, ...patch } }))
              const live = s.status === 'presenting' || s.status === 'qna'
              return (
                <tr key={s.id} className={cn(live && 'bg-primary/5', s.status === 'done' && 'text-muted')}>
                  <td className="whitespace-nowrap">
                    <span className="tabular mr-1 font-bold">{s.order_no}</span>
                    <button className="px-1 text-muted hover:text-fg disabled:opacity-30" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label="위로">▲</button>
                    <button className="px-1 text-muted hover:text-fg disabled:opacity-30" onClick={() => move(i, 1)} disabled={busy || i === slots.length - 1} aria-label="아래로">▼</button>
                  </td>
                  <td className="font-semibold">{s.company_name}{s.blind_code && <span className="ml-1 text-xs font-normal text-muted">{s.blind_code}</span>}</td>
                  <td><Input type="datetime-local" className="h-8 w-[200px] text-sm" value={d.start_at} onChange={e => set({ start_at: e.target.value })} /></td>
                  <td><Input type="number" min={1} className="h-8 w-16 text-sm" value={d.present_min} onChange={e => set({ present_min: e.target.value })} /></td>
                  <td><Input type="number" min={0} className="h-8 w-16 text-sm" value={d.qna_min} onChange={e => set({ qna_min: e.target.value })} /></td>
                  <td><Input className="h-8 min-w-[180px] text-sm" value={d.meeting_url} onChange={e => set({ meeting_url: e.target.value })} placeholder="https://" /></td>
                  <td className="whitespace-nowrap">
                    <Badge tone={STATUS_TONE[s.status]}>{SLOT_STATUS[s.status]}</Badge>
                    {live && s.phase_started_at && <div className="tabular mt-0.5 text-xs text-muted">{fmtDate(s.phase_started_at)}~</div>}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      {s.status !== 'presenting' && s.status !== 'qna' && <Button size="sm" variant="secondary" onClick={() => setState(s, 'presenting')} disabled={busy}>발표</Button>}
                      {s.status === 'presenting' && <Button size="sm" variant="secondary" onClick={() => setState(s, 'qna')} disabled={busy}>질의</Button>}
                      {live && <Button size="sm" variant="outline" onClick={() => setState(s, 'done')} disabled={busy}>완료</Button>}
                      {s.status === 'waiting' && <Button size="sm" variant="ghost" onClick={() => setState(s, 'absent')} disabled={busy}>불참</Button>}
                      {(s.status === 'done' || s.status === 'absent') && <Button size="sm" variant="ghost" onClick={() => setState(s, 'waiting')} disabled={busy}>대기로</Button>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {dirty(s) ? <Button size="sm" onClick={() => saveRow(s)} disabled={busy}>저장</Button>
                      : s.status === 'waiting' && <button className="text-xs text-muted hover:text-danger" onClick={() => remove(s)} disabled={busy}>삭제</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}

      <ConfirmDialog open={drawOpen} title="발표 순서를 랜덤 추첨할까요?" busy={busy} confirmLabel="추첨" onClose={() => setDrawOpen(false)} onConfirm={draw}>
        <p>서버에서 무작위 시드를 만들고 그 시드로 순서를 섞습니다. 같은 시드로 언제든 같은 결과를 재현할 수 있으며, 시드와 결과는 감사로그에 남습니다.</p>
        <p className="text-muted">현재 편성된 순서는 덮어씁니다. 추첨 후 발표 기업에 일정 안내가 발송됩니다(n8n).</p>
        {!slots.length && <p className="text-muted">편성된 슬롯이 없어 참가 기업 {unslotted.length}개로 새로 만듭니다.</p>}
      </ConfirmDialog>
    </div>
  )
}
