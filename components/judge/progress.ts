// 심사위원 평가 진행 상태 판정 (J-02·J-03·J-05·J-07, /api/eval/submit 공용) — 순수 함수
import type { Criterion, StageStatus } from '@/lib/types'

export type EvalState = 'none' | 'draft' | 'done' | 'conflict'

export const EVAL_STATE_LABEL: Record<EvalState, string> = {
  none: '미평가',
  draft: '임시저장',
  done: '완료',
  conflict: '제외(이해충돌)',
}

type C = Pick<Criterion, 'id' | 'name' | 'comment_required'>
type S = { criterion_id: string; score: number | string | null; comment: string | null }
type R = { overall_comment: string | null; qna_memo?: string | null } | null | undefined

const filled = (v: string | null | undefined) => !!v && v.trim().length > 0

/** 미완료 항목 이름 목록 (점수 미입력 또는 필수 심사평 누락) */
export function missingItems(criteria: C[], scores: S[]): string[] {
  const by = new Map(scores.map(s => [s.criterion_id, s]))
  const out: string[] = []
  for (const c of criteria) {
    const s = by.get(c.id)
    if (!s || s.score == null || s.score === '') out.push(`${c.name} 점수`)
    else if (c.comment_required && !filled(s.comment)) out.push(`${c.name} 심사평`)
  }
  return out
}

/** 완료 = 모든 항목 점수 입력 + 필수 심사평 입력. 일부라도 입력했으면 임시저장 */
export function evalState(criteria: C[], scores: S[], review: R, conflict: boolean): EvalState {
  if (conflict) return 'conflict'
  if (criteria.length > 0 && missingItems(criteria, scores).length === 0) return 'done'
  const touched = scores.some(s => (s.score != null && s.score !== '') || filled(s.comment))
    || filled(review?.overall_comment) || filled(review?.qna_memo)
  return touched ? 'draft' : 'none'
}

/** 점수 입력이 잠기는 이유 (null = 입력 가능). 확정 이후에는 '확정됨' (Q7) */
export function lockReason(p: { stageStatus: StageStatus; evalSubmitted: boolean; conflict: boolean }): string | null {
  if (p.conflict) return '이해충돌 제외'
  if (p.stageStatus === 'locked' || p.stageStatus === 'published') return '확정됨'
  if (p.evalSubmitted) return '최종 제출됨'
  if (p.stageStatus !== 'evaluating') return '평가 기간 아님'
  return null
}

export function totalOf(scores: S[]) {
  let sum = 0
  for (const s of scores) if (s.score != null && s.score !== '') sum += Number(s.score)
  return sum
}

/** 블라인드 코드 등 자연 정렬 (A-2 < A-10) */
export const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'ko', { numeric: true })
