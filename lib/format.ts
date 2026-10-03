import type { StageStatus, Eligibility, EntryResult, SlotStatus, AppealStatus } from '@/lib/types'

const TZ = 'Asia/Seoul'

export function fmtDate(v: string | Date | null | undefined, withTime = true) {
  if (!v) return '-'
  const d = typeof v === 'string' ? new Date(v) : v
  return d.toLocaleString('ko-KR', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  })
}

/** D-day 라벨: '마감 2일 전', '오늘 마감', '마감' */
export function dday(deadline: string | null | undefined, now = new Date()) {
  if (!deadline) return null
  const ms = new Date(deadline).getTime() - now.getTime()
  if (ms < 0) return { label: '마감', days: -1, urgent: false, closed: true }
  const days = Math.floor(ms / 86_400_000)
  return { label: days === 0 ? '오늘 마감' : `마감 ${days}일 전`, days, urgent: days <= 2, closed: false }
}

/** datetime-local input 값 ↔ ISO (KST 기준) */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000)
  return d.toISOString().slice(0, 16)
}
export function fromLocalInput(v: string) {
  return v ? new Date(v + ':00+09:00').toISOString() : null
}

export const STAGE_STATUS: Record<StageStatus, string> = {
  ready: '준비',
  submitting: '접수중',
  evaluating: '평가중',
  locked: '확정',
  published: '결과공개',
}
export const STAGE_FLOW: StageStatus[] = ['ready', 'submitting', 'evaluating', 'locked', 'published']

export const ELIGIBILITY: Record<Eligibility, string> = {
  pending: '검토 전', eligible: '적격', supplement: '보완 요청', ineligible: '부적격',
}
export const RESULT: Record<EntryResult, string> = { pending: '심사 중', pass: '통과', fail: '탈락' }
export const SLOT_STATUS: Record<SlotStatus, string> = {
  waiting: '대기', presenting: '발표 중', qna: '질의응답', done: '완료', absent: '불참',
}
export const APPEAL_STATUS: Record<AppealStatus, string> = {
  received: '접수', reviewing: '검토 중', accepted: '인용', rejected: '기각',
}

export const fmtScore = (n: number | null | undefined, digits = 2) =>
  n == null ? '-' : Number(n).toFixed(digits).replace(/\.?0+$/, '')
