'use client'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { SLOT_STATUS } from '@/lib/format'
import { Alert, Badge, cn } from '@/components/ui'
import ScoringPanel from '@/components/judge/ScoringPanel'
import type { Criterion, PresentationSlot, StageStatus } from '@/lib/types'

export interface LiveCompany {
  company_id: string
  assignment_id: string
  name: string
  field: string | null
  conflict: boolean
  lock: string | null
  scores: { criterion_id: string; score: number | null; comment: string | null }[]
  review: { overall_comment: string | null; qna_memo: string | null } | null
}

const POLL_MS = 10_000 // Realtime 끊김 대비 폴링

function useNow(ms = 500) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const mmss = (sec: number) => {
  const s = Math.abs(Math.trunc(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function Timer({ slot }: { slot: PresentationSlot }) {
  const now = useNow()
  const phase = slot.status === 'qna' ? 'qna' : 'present'
  const limit = (phase === 'qna' ? slot.qna_min : slot.present_min) * 60
  if (!slot.phase_started_at) {
    return <div className="text-sm text-muted">{phase === 'qna' ? '질의응답' : '발표'} {mmss(limit)} · 시작 대기</div>
  }
  const elapsed = (now - new Date(slot.phase_started_at).getTime()) / 1000
  const remain = limit - elapsed
  const over = remain < 0
  const warn = !over && remain <= 60
  return (
    <div className="flex items-end gap-3">
      <div className={cn('tabular text-5xl font-black leading-none sm:text-6xl', over ? 'text-danger' : warn ? 'text-[#b07a00]' : 'text-fg')}>
        {over ? '+' : ''}{mmss(remain)}
      </div>
      <div className="pb-1 text-sm">
        <div className="font-semibold">{phase === 'qna' ? '질의응답' : '발표'} {over ? '시간 초과' : '남은 시간'}</div>
        <div className="tabular text-muted">제한 {mmss(limit)}</div>
      </div>
    </div>
  )
}

export default function LiveBoard({ stage, programTitle, criteria, companies, initialSlots, canReportConflict }: {
  stage: { id: string; name: string; status: StageStatus }
  programTitle: string
  criteria: Criterion[]
  companies: LiveCompany[]
  initialSlots: PresentationSlot[]
  canReportConflict: boolean
}) {
  const [slots, setSlots] = useState(initialSlots)
  const [connected, setConnected] = useState(false)
  const byCompany = useMemo(() => new Map(companies.map(c => [c.company_id, c])), [companies])
  const current = slots.find(s => s.status === 'presenting' || s.status === 'qna') ?? null
  const [selected, setSelected] = useState<string | null>(current?.company_id ?? slots.find(s => s.status === 'waiting')?.company_id ?? null)
  const [visited, setVisited] = useState<string[]>(selected ? [selected] : [])

  // Realtime: presentation_slots 변경 구독 → 현재 발표 기업 자동 전환 (Q15: 3초 이내)
  useEffect(() => {
    const sb = supabaseBrowser()
    const upsertSlot = (row: PresentationSlot) =>
      setSlots(prev => [...prev.filter(s => s.id !== row.id), row].sort((a, b) => a.order_no - b.order_no))
    const channel = sb.channel(`live-slots-${stage.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presentation_slots', filter: `stage_id=eq.${stage.id}` }, payload => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id
          setSlots(prev => prev.filter(s => s.id !== id))
        } else {
          upsertSlot(payload.new as PresentationSlot)
        }
      })
      .subscribe(status => setConnected(status === 'SUBSCRIBED'))
    const poll = async () => {
      const { data } = await sb.from('presentation_slots').select('*').eq('stage_id', stage.id).order('order_no')
      if (data) setSlots(data as PresentationSlot[])
    }
    const t = setInterval(poll, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') void poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
      void sb.removeChannel(channel)
    }
  }, [stage.id])

  // 현재 발표 기업이 바뀌면 화면을 전환한다. 이전 기업 입력은 이미 저장되고 패널도 유지된다.
  const currentId = current?.company_id ?? null
  const lastCurrent = useRef(currentId)
  useEffect(() => {
    if (currentId && currentId !== lastCurrent.current) select(currentId)
    lastCurrent.current = currentId
  }, [currentId]) // eslint-disable-line react-hooks/exhaustive-deps

  function select(companyId: string) {
    setSelected(companyId)
    setVisited(v => (v.includes(companyId) ? v : [...v, companyId]))
  }

  const selSlot = slots.find(s => s.company_id === selected) ?? null
  const selCompany = selected ? byCompany.get(selected) : undefined
  const nameOf = (companyId: string) => byCompany.get(companyId)?.name ?? '미배정 기업'

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/j/s/${stage.id}`} className="text-sm text-muted hover:text-fg">← 기업 목록</Link>
          <h1 className="text-xl font-bold">{stage.name} · 발표 현장</h1>
          <p className="text-sm text-muted">{programTitle}</p>
        </div>
        <Badge tone={connected ? 'accent' : 'neutral'}>{connected ? '실시간 연결됨' : '연결 중 · 10초마다 갱신'}</Badge>
      </div>

      {slots.length === 0 && <Alert>발표 순서가 아직 편성되지 않았습니다.</Alert>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* 발표 순서 */}
        <aside className="grid content-start gap-2">
          {current ? (
            <div className="rounded-lg border-2 border-primary bg-card p-4">
              <div className="mb-1 flex items-center gap-2 text-sm">
                <Badge tone="primary">{SLOT_STATUS[current.status]}</Badge>
                <span className="tabular text-muted">{current.order_no}번</span>
              </div>
              <div className="mb-3 text-2xl font-bold">{nameOf(current.company_id)}</div>
              <Timer slot={current} />
              {current.meeting_url && (
                <a href={current.meeting_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">화상 발표 링크 열기</a>
              )}
            </div>
          ) : slots.length > 0 && (
            <div className="rounded-lg border border-line bg-card p-4 text-sm text-muted">진행 중인 발표가 없습니다.</div>
          )}
          <ol className="grid gap-1.5">
            {slots.map(s => {
              const c = byCompany.get(s.company_id)
              const live = s.id === current?.id
              const isSel = s.company_id === selected
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => select(s.company_id)} disabled={!c}
                    className={cn('flex min-h-[56px] w-full items-center gap-3 rounded-lg border px-4 py-2 text-left transition-colors disabled:opacity-50',
                      isSel ? 'border-primary bg-primary/10' : 'border-line bg-card hover:bg-bg', live && !isSel && 'border-primary/60')}>
                    <span className="tabular w-7 text-lg font-bold text-muted">{s.order_no}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{nameOf(s.company_id)}</span>
                      {s.start_at && <span className="tabular text-xs text-muted">{new Date(s.start_at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })}</span>}
                    </span>
                    <Badge tone={live ? 'primary' : s.status === 'done' ? 'accent' : 'neutral'}>{SLOT_STATUS[s.status]}</Badge>
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>

        {/* 채점 (방문한 기업 패널은 숨겨 둔 채 유지 → 전환해도 입력 상태 보존) */}
        <section className="min-w-0 rounded-lg border border-line bg-bg">
          {selected && selected !== currentId && current && (
            <button type="button" onClick={() => select(current.company_id)}
              className="flex h-12 w-full items-center justify-center bg-primary text-sm font-semibold text-primary-fg">
              현재 발표 기업({nameOf(current.company_id)})으로 이동
            </button>
          )}
          {!selected && <div className="p-8 text-center text-muted">발표 순서에서 기업을 선택하세요.</div>}
          {selected && !selCompany && <div className="p-8 text-center text-muted">배정되지 않은 기업입니다.</div>}
          {selCompany?.conflict && <div className="p-8 text-center text-muted">이해충돌로 평가에서 제외된 기업입니다.</div>}
          {selSlot && selCompany && !selCompany.conflict && (
            <div className="border-b border-line bg-card px-4 py-3">
              <div className="text-lg font-bold">{selCompany.name}</div>
              {selCompany.field && <div className="text-sm text-muted">{selCompany.field}</div>}
            </div>
          )}
          {visited.map(id => {
            const c = byCompany.get(id)
            if (!c || c.conflict) return null
            return (
              <div key={c.assignment_id} hidden={id !== selected}>
                <ScoringPanel
                  assignmentId={c.assignment_id}
                  companyName={c.name}
                  criteria={criteria}
                  initialScores={c.scores}
                  initialReview={c.review}
                  lock={c.lock}
                  canReportConflict={canReportConflict}
                  showQnaMemo
                  size="lg"
                />
              </div>
            )
          })}
        </section>
      </div>
    </div>
  )
}
