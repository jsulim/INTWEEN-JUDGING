'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { fmtScore } from '@/lib/format'
import { Alert, Badge, Button, Textarea, cn } from '@/components/ui'
import type { Criterion } from '@/lib/types'
import { Dialog } from './Dialog'
import { missingItems } from './progress'

// J-04 평가표 (J-06 현장 모드에서도 재사용)
//  · 항목별 점수(배점 내, Q6) + 루브릭(4-1) + 항목별·종합 심사평 (+ 질의응답 메모)
//  · 1초 디바운스 자동 저장 (8-2) → scores / reviews upsert (RLS: 평가중·미확정·미제출만 쓰기)
//  · 저장 상태 상시 표시: 저장 중 / 자동 저장됨 / 저장 실패 - 재시도
//  · 네트워크 장애 대비(Q9): 미전송 입력을 localStorage 에 보관 → online 이벤트·재접속 시 재전송

type Pending = {
  scores: Record<string, { score: number | null; comment: string | null }>
  review: { overall_comment?: string | null; qna_memo?: string | null }
}
type Status = 'idle' | 'saving' | 'saved' | 'error'
type Vals = Record<string, { score: string; comment: string }>

const emptyPending = (): Pending => ({ scores: {}, review: {} })
const isEmpty = (p: Pending) => Object.keys(p.scores).length === 0 && Object.keys(p.review).length === 0
const storageKey = (assignmentId: string) => `intween:eval:${assignmentId}`
const SCORE_RE = /^\d{0,4}(\.\d{0,2})?$/

function readStore(key: string): Pending | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const p = JSON.parse(raw) as Pending
    return p && typeof p === 'object' && p.scores && p.review ? p : null
  } catch {
    return null
  }
}

function errorText(e: unknown): string {
  const err = e as { code?: string; message?: string }
  if (err?.code === '42501' || /row-level security/i.test(err?.message ?? '')) return '확정 또는 제출되어 저장할 수 없습니다.'
  if (err?.code === '23514' || /score_exceeds_max/.test(err?.message ?? '')) return '배점을 초과한 점수가 있습니다.'
  if (e instanceof TypeError || /fetch|network/i.test(err?.message ?? '')) return '네트워크 연결을 확인하세요.'
  return err?.message || '저장하지 못했습니다.'
}

const toNum = (s: string) => (s.trim() === '' || s.trim() === '.' ? null : Number(s))
const clock = (d: Date) => d.toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' })

export interface ScoringPanelProps {
  assignmentId: string
  companyName: string
  criteria: Criterion[]
  initialScores: { criterion_id: string; score: number | null; comment: string | null }[]
  initialReview: { overall_comment: string | null; qna_memo: string | null } | null
  /** 입력 잠금 사유 (null = 입력 가능) */
  lock: string | null
  /** '이해관계 있음' 신고 버튼 노출 */
  canReportConflict?: boolean
  showQnaMemo?: boolean
  size?: 'md' | 'lg'
}

export default function ScoringPanel(props: ScoringPanelProps) {
  const { assignmentId, criteria, lock, size = 'md' } = props
  const router = useRouter()
  const key = storageKey(assignmentId)
  const big = size === 'lg'

  const [vals, setVals] = useState<Vals>(() => {
    const v: Vals = {}
    for (const c of criteria) {
      const s = props.initialScores.find(x => x.criterion_id === c.id)
      v[c.id] = { score: s?.score == null ? '' : String(Number(s.score)), comment: s?.comment ?? '' }
    }
    return v
  })
  const [overall, setOverall] = useState(props.initialReview?.overall_comment ?? '')
  const [qna, setQna] = useState(props.initialReview?.qna_memo ?? '')
  const [status, setStatus] = useState<Status>('idle')
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [online, setOnline] = useState(true)
  const [warn, setWarn] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)

  const valsRef = useRef(vals)
  const pendingRef = useRef<Pending>(emptyPending())
  const inflight = useRef(false)
  const again = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const lockRef = useRef(lock)
  lockRef.current = lock
  const lastRefresh = useRef(0)
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>()

  const persist = useCallback(() => {
    try {
      if (isEmpty(pendingRef.current)) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify({ ...pendingRef.current, at: Date.now() }))
    } catch { /* 저장 공간 없음 — 메모리 보관으로 계속 */ }
  }, [key])

  // 저장 성공 후 서버 컴포넌트(목록 상태 등) 갱신 — 최대 5초에 한 번
  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current)
    const wait = Math.max(0, 5000 - (Date.now() - lastRefresh.current))
    refreshTimer.current = setTimeout(() => { lastRefresh.current = Date.now(); router.refresh() }, wait)
  }, [router])

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    if (lockRef.current) return
    if (inflight.current) { again.current = true; return }
    const snap = pendingRef.current
    if (isEmpty(snap)) return
    pendingRef.current = emptyPending()
    const restore = () => {
      const cur = pendingRef.current // 전송 중 들어온 새 입력이 우선
      pendingRef.current = { scores: { ...snap.scores, ...cur.scores }, review: { ...snap.review, ...cur.review } }
      persist()
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      restore()
      setStatus('error')
      setErrMsg('오프라인 상태입니다. 연결되면 자동으로 다시 보냅니다.')
      return
    }
    inflight.current = true
    setStatus('saving')
    try {
      const sb = supabaseBrowser()
      const rows = Object.entries(snap.scores).map(([criterion_id, v]) => ({ assignment_id: assignmentId, criterion_id, score: v.score, comment: v.comment }))
      if (rows.length) {
        const { error } = await sb.from('scores').upsert(rows, { onConflict: 'assignment_id,criterion_id', defaultToNull: false })
        if (error) throw error
      }
      if (Object.keys(snap.review).length) {
        const { error } = await sb.from('reviews').upsert({ assignment_id: assignmentId, ...snap.review }, { onConflict: 'assignment_id', defaultToNull: false })
        if (error) throw error
      }
      persist()
      setErrMsg(null)
      setSavedAt(new Date())
      setStatus(isEmpty(pendingRef.current) ? 'saved' : 'saving')
      scheduleRefresh()
    } catch (e) {
      restore()
      setStatus('error')
      setErrMsg(errorText(e))
    } finally {
      inflight.current = false
      if (again.current) {
        again.current = false
        void flush()
      }
    }
  }, [assignmentId, persist, scheduleRefresh])

  const queue = useCallback(() => {
    persist()
    setStatus('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 1000)
  }, [persist, flush])

  // 최초 진입: 이전에 보내지 못한 입력 복원 → 재전송
  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    const stored = readStore(key)
    if (stored && !isEmpty(stored)) {
      if (lockRef.current) {
        try { localStorage.removeItem(key) } catch {}
        setNotice('보내지 못한 입력이 있었으나 현재 수정할 수 없는 상태라 반영하지 않았습니다.')
      } else {
        const next = { ...valsRef.current }
        const known: Pending['scores'] = {}
        for (const [cid, v] of Object.entries(stored.scores)) {
          if (!next[cid]) continue // 삭제된 평가항목은 버린다
          known[cid] = v
          next[cid] = { score: v.score == null ? '' : String(v.score), comment: v.comment ?? '' }
        }
        pendingRef.current = { scores: known, review: stored.review }
        valsRef.current = next
        setVals(next)
        if (stored.review.overall_comment !== undefined) setOverall(stored.review.overall_comment ?? '')
        if (stored.review.qna_memo !== undefined) setQna(stored.review.qna_memo ?? '')
        setNotice('보내지 못한 입력을 복원해 다시 저장합니다.')
        void flush()
      }
    }
    const onOnline = () => { setOnline(true); void flush() }
    const onOffline = () => setOnline(false)
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isEmpty(pendingRef.current) || inflight.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('beforeunload', onBeforeUnload)
      clearTimeout(refreshTimer.current)
      void flush() // 다른 기업으로 이동해도 남은 입력은 보낸다 (localStorage 에도 남아 있음)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // 실패 시 온라인이면 10초마다 자동 재시도
  useEffect(() => {
    if (status !== 'error' || !online || lock) return
    const t = setTimeout(() => void flush(), 10_000)
    return () => clearTimeout(t)
  }, [status, online, lock, flush])

  function setCriterion(c: Criterion, patch: Partial<{ score: string; comment: string }>) {
    const cur = valsRef.current[c.id] ?? { score: '', comment: '' }
    const nextV = { ...cur, ...patch }
    valsRef.current = { ...valsRef.current, [c.id]: nextV }
    setVals(valsRef.current)
    pendingRef.current.scores[c.id] = { score: toNum(nextV.score), comment: nextV.comment.trim() ? nextV.comment : null }
    queue()
  }

  function onScore(c: Criterion, raw: string) {
    const v = raw.replace(',', '.').replace(/\s/g, '')
    const block = (msg: string) => setWarn(w => ({ ...w, [c.id]: msg }))
    if (v !== '' && !SCORE_RE.test(v)) return block(v.startsWith('-') ? '0점 이상만 입력할 수 있습니다.' : '숫자만 입력할 수 있습니다 (소수 둘째 자리까지).')
    const n = toNum(v)
    if (n != null && n > c.max_score) return block(`배점(${fmtScore(c.max_score)}점)을 넘을 수 없습니다.`)
    if (n != null && n < 0) return block('0점 이상만 입력할 수 있습니다.')
    setWarn(w => { const { [c.id]: _x, ...rest } = w; return rest })
    setCriterion(c, { score: v })
  }

  function onReview(field: 'overall_comment' | 'qna_memo', v: string) {
    if (field === 'overall_comment') setOverall(v)
    else setQna(v)
    pendingRef.current.review[field] = v.trim() ? v : null
    queue()
  }

  const current = useMemo(() => criteria.map(c => ({
    criterion_id: c.id, score: toNum(vals[c.id]?.score ?? ''), comment: vals[c.id]?.comment ?? null,
  })), [criteria, vals])
  const missing = missingItems(criteria, current)
  const total = current.reduce((a, s) => a + (s.score ?? 0), 0)
  const maxTotal = criteria.reduce((a, c) => a + c.max_score, 0)
  const readOnly = !!lock

  // 이해충돌 신고 (4-1 상시 신고) → 배정 자동 제외
  const [conflictOpen, setConflictOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportErr, setReportErr] = useState<string | null>(null)
  async function report() {
    if (!reason.trim()) return setReportErr('사유를 입력하세요.')
    setReporting(true)
    setReportErr(null)
    const { error } = await supabaseBrowser().rpc('report_conflict', { p_assignment_id: assignmentId, p_reason: reason.trim() })
    setReporting(false)
    if (error) return setReportErr('신고하지 못했습니다. 다시 시도하세요.')
    pendingRef.current = emptyPending()
    try { localStorage.removeItem(key) } catch {}
    setConflictOpen(false)
    router.refresh()
  }

  const inputH = big ? 'h-14 text-2xl' : 'h-11 text-lg'

  return (
    <div className="flex flex-col">
      {/* 상단: 합계·저장 상태 */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-card px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-muted">합계</span>
          <span className={cn('tabular font-bold', big ? 'text-3xl' : 'text-2xl')}>{fmtScore(total)}</span>
          <span className="tabular text-sm text-muted">/ {fmtScore(maxTotal)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && (missing.length === 0
            ? <Badge tone="accent">완료</Badge>
            : <Badge tone="highlight">미입력 {missing.length}</Badge>)}
          <SaveState lock={lock} status={status} online={online} savedAt={savedAt} errMsg={errMsg} onRetry={() => void flush()} />
        </div>
      </div>

      <div className="grid gap-4 p-4">
        {notice && <Alert tone="primary">{notice}</Alert>}
        {status === 'error' && errMsg && !readOnly && <Alert tone="danger">{errMsg} 입력값은 이 기기에 임시 보관됩니다.</Alert>}
        {readOnly && lock === '확정됨' && <Alert tone="accent">순위가 확정되어 점수를 수정할 수 없습니다.</Alert>}
        {readOnly && lock === '최종 제출됨' && <Alert tone="accent">최종 제출한 평가입니다. 수정하려면 관리자 재오픈이 필요합니다.</Alert>}
        {readOnly && lock === '평가 기간 아님' && <Alert>평가 기간에만 입력할 수 있습니다.</Alert>}
        {criteria.length === 0 && <Alert tone="highlight">평가항목이 아직 설정되지 않았습니다.</Alert>}

        {criteria.map((c, i) => {
          const v = vals[c.id] ?? { score: '', comment: '' }
          const n = toNum(v.score)
          const bands = [...(c.rubric ?? [])].sort((a, b) => b.max - a.max)
          const commentMissing = c.comment_required && !v.comment.trim()
          return (
            <section key={c.id} className="rounded-lg border border-line bg-card">
              <div className="flex items-start justify-between gap-3 px-4 pt-3">
                <div className="min-w-0">
                  <div className="font-bold"><span className="tabular mr-1 text-muted">{i + 1}.</span>{c.name}</div>
                  {c.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{c.description}</p>}
                </div>
                <span className="tabular shrink-0 text-sm text-muted">배점 {fmtScore(c.max_score)}</span>
              </div>
              <div className={cn('grid gap-3 px-4 py-3', bands.length > 0 && 'sm:grid-cols-[minmax(0,9rem)_1fr]')}>
                <div>
                  <label className="sr-only" htmlFor={`score-${assignmentId}-${c.id}`}>{c.name} 점수</label>
                  <div className="flex items-center gap-2">
                    <input id={`score-${assignmentId}-${c.id}`} value={v.score} disabled={readOnly}
                      inputMode="decimal" autoComplete="off" placeholder="-"
                      onChange={e => onScore(c, e.target.value)}
                      onBlur={() => setWarn(w => { const { [c.id]: _x, ...rest } = w; return rest })}
                      aria-invalid={!!warn[c.id]}
                      className={cn('tabular w-full rounded-md border bg-card px-3 text-right font-bold outline-none focus:ring-2 disabled:bg-bg disabled:text-fg/70',
                        inputH, warn[c.id] ? 'border-danger focus:ring-danger/20' : 'border-line focus:border-primary focus:ring-primary/20')} />
                    <span className="tabular shrink-0 text-sm text-muted">/ {fmtScore(c.max_score)}</span>
                  </div>
                  {warn[c.id] && <p className="mt-1 text-xs text-danger" role="alert">{warn[c.id]}</p>}
                </div>
                {bands.length > 0 && (
                  <ul className="grid gap-1 text-sm" aria-label="평가 루브릭">
                    {bands.map((b, k) => {
                      const on = n != null && n >= b.min && n <= b.max
                      return (
                        <li key={k} className={cn('flex gap-2 rounded px-2 py-1', on ? 'bg-primary/10 text-primary' : 'text-muted')}>
                          <span className="tabular w-16 shrink-0 font-semibold">{fmtScore(b.min)}–{fmtScore(b.max)}</span>
                          <span className={on ? 'font-semibold' : ''}>{b.label}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <div className="px-4 pb-4">
                <Textarea value={v.comment} disabled={readOnly} onChange={e => setCriterion(c, { comment: e.target.value })}
                  placeholder={c.comment_required ? '심사평 (필수)' : '심사평 (선택)'}
                  className={cn('min-h-[64px] text-sm', commentMissing && !readOnly && n != null && 'border-highlight')} />
                {c.comment_required && <p className={cn('mt-1 text-xs', commentMissing ? 'text-[#8a5a00]' : 'text-muted')}>심사평 필수 항목</p>}
              </div>
            </section>
          )
        })}

        <section className="rounded-lg border border-line bg-card p-4">
          <div className="mb-2 font-bold">종합 심사평</div>
          <Textarea value={overall} disabled={readOnly} onChange={e => onReview('overall_comment', e.target.value)}
            placeholder="기업에 대한 종합 의견" className="min-h-[110px] text-sm" />
        </section>

        {props.showQnaMemo && (
          <section className="rounded-lg border border-line bg-card p-4">
            <div className="mb-2 font-bold">질의응답 메모</div>
            <Textarea value={qna} disabled={readOnly} onChange={e => onReview('qna_memo', e.target.value)}
              placeholder="질문과 답변 요지" className={cn('text-sm', big ? 'min-h-[160px]' : 'min-h-[110px]')} />
          </section>
        )}

        {props.canReportConflict && !readOnly && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="text-muted" onClick={() => { setReason(''); setReportErr(null); setConflictOpen(true) }}>
              이해관계 있음 신고
            </Button>
          </div>
        )}
      </div>

      <Dialog open={conflictOpen} title="이해관계 있음 신고" onClose={() => setConflictOpen(false)}
        footer={<>
          <Button variant="outline" onClick={() => setConflictOpen(false)}>취소</Button>
          <Button variant="danger" onClick={report} disabled={reporting}>{reporting ? '처리 중…' : '신고하고 제외'}</Button>
        </>}>
        <div className="grid gap-3 text-sm">
          <p><b>{props.companyName}</b> 평가에서 제외됩니다. 입력한 점수는 집계에 반영되지 않으며 되돌리려면 관리자에게 요청해야 합니다.</p>
          <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="이해관계 내용 (예: 최근 3년 내 자문 계약)" maxLength={1000} />
          {reportErr && <p className="text-danger">{reportErr}</p>}
        </div>
      </Dialog>
    </div>
  )
}

function SaveState({ lock, status, online, savedAt, errMsg, onRetry }:
  { lock: string | null; status: Status; online: boolean; savedAt: Date | null; errMsg: string | null; onRetry: () => void }) {
  if (lock) return <Badge tone={lock === '확정됨' || lock === '최종 제출됨' ? 'accent' : 'neutral'}>{lock}</Badge>
  return (
    <span className="flex items-center gap-2" aria-live="polite">
      {!online && <Badge tone="highlight">오프라인 · 입력 임시 보관 중</Badge>}
      {status === 'saving' && <span className="text-sm text-muted">저장 중…</span>}
      {status === 'saved' && <span className="text-sm text-accent">자동 저장됨{savedAt && <span className="tabular ml-1 text-xs text-muted">{clock(savedAt)}</span>}</span>}
      {status === 'idle' && <span className="text-sm text-muted">자동 저장</span>}
      {status === 'error' && (
        <button type="button" onClick={onRetry} title={errMsg ?? undefined}
          className="rounded-md bg-danger/10 px-2.5 py-1 text-sm font-semibold text-danger hover:bg-danger/15">
          저장 실패 - 재시도
        </button>
      )}
    </span>
  )
}
