import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { evalState, lockReason, naturalCompare, type EvalState } from '@/components/judge/progress'
import type { BlindCompanyRow, Criterion, EvaluationSubmission, Judge, Program, Review, Score, Stage } from '@/lib/types'

// 심사위원 화면 공용 데이터 로드. 모두 로그인 사용자 클라이언트(RLS) — 본인 배정·본인 점수만 보인다.

type PageResult = { data: unknown[] | null; error: { message: string } | null }

/** PostgREST max-rows(기본 1000)를 넘는 결과를 페이지 단위로 모두 가져온다 */
export async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<PageResult>, size = 1000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await make(from, from + size - 1)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < size) break
  }
  return out
}

export const num = (v: unknown) => (v == null || v === '' ? null : Number(v))

function normCriterion(c: Criterion): Criterion {
  return {
    ...c,
    max_score: Number(c.max_score),
    min_pass_score: num(c.min_pass_score),
    rubric: Array.isArray(c.rubric) ? c.rubric.map(b => ({ ...b, min: Number(b.min), max: Number(b.max) })) : [],
  }
}

export interface StageRow extends BlindCompanyRow {
  state: EvalState
  total: number | null
}

export interface JudgeStageData {
  stage: Stage
  program: Program
  judge: Judge
  rows: StageRow[] // 배정 기업 (자연 정렬)
  criteria: Criterion[]
  scores: Map<string, Score[]> // assignment_id → scores
  reviews: Map<string, Review>
  evalSub: EvaluationSubmission | null
  evalSubmitted: boolean
  maxTotal: number
  counts: { total: number; done: number; draft: number; none: number; conflict: number }
}

export async function loadJudgeStage(supabase: SupabaseClient, userId: string, stageId: string): Promise<JudgeStageData | null> {
  const { data: stage } = await supabase.from('stages').select('*').eq('id', stageId).maybeSingle()
  if (!stage) return null
  const [{ data: program }, { data: judge }] = await Promise.all([
    supabase.from('programs').select('*').eq('id', stage.program_id).maybeSingle(),
    supabase.from('judges').select('*').eq('program_id', stage.program_id).eq('user_id', userId).maybeSingle(),
  ])
  if (!program || !judge) return null

  const [{ data: blind }, { data: criteria }, scores, reviews, { data: evalSub }] = await Promise.all([
    supabase.from('v_companies_blind').select('*').eq('stage_id', stageId).eq('judge_id', judge.id),
    supabase.from('criteria').select('*').eq('stage_id', stageId).order('order_no'),
    fetchAll<Score & { assignments?: unknown }>((f, t) =>
      supabase.from('scores').select('id, assignment_id, criterion_id, score, comment, updated_at, assignments!inner(stage_id)')
        .eq('assignments.stage_id', stageId).order('id').range(f, t)),
    fetchAll<Review & { assignments?: unknown }>((f, t) =>
      supabase.from('reviews').select('id, assignment_id, overall_comment, qna_memo, status, assignments!inner(stage_id)')
        .eq('assignments.stage_id', stageId).order('id').range(f, t)),
    supabase.from('evaluation_submissions').select('*').eq('stage_id', stageId).eq('judge_id', judge.id).maybeSingle(),
  ])
  if (!blind || blind.length === 0) return null

  const crit = ((criteria ?? []) as Criterion[]).map(normCriterion)
  const scoreMap = new Map<string, Score[]>()
  for (const s of scores) {
    const { assignments: _a, ...row } = s
    const list = scoreMap.get(row.assignment_id) ?? []
    list.push({ ...row, score: num(row.score) })
    scoreMap.set(row.assignment_id, list)
  }
  const reviewMap = new Map<string, Review>()
  for (const r of reviews) {
    const { assignments: _a, ...row } = r
    reviewMap.set(row.assignment_id, row)
  }

  const counts = { total: 0, done: 0, draft: 0, none: 0, conflict: 0 }
  const rows: StageRow[] = ((blind ?? []) as BlindCompanyRow[])
    .map(b => {
      const sc = scoreMap.get(b.assignment_id) ?? []
      const state = evalState(crit, sc, reviewMap.get(b.assignment_id), b.conflict)
      counts[state]++
      if (state !== 'conflict') counts.total++
      const total = sc.some(s => s.score != null) ? sc.reduce((a, s) => a + (s.score ?? 0), 0) : null
      return { ...b, state, total }
    })
    .sort((a, b) => naturalCompare(a.blind_code ?? a.display_name, b.blind_code ?? b.display_name))

  const es = (evalSub as EvaluationSubmission | null) ?? null
  return {
    stage: stage as Stage,
    program: program as Program,
    judge: judge as Judge,
    rows,
    criteria: crit,
    scores: scoreMap,
    reviews: reviewMap,
    evalSub: es,
    evalSubmitted: es?.status === 'submitted',
    maxTotal: crit.reduce((a, c) => a + c.max_score, 0),
    counts,
  }
}

export function rowLock(d: JudgeStageData, row: { conflict: boolean }) {
  return lockReason({ stageStatus: d.stage.status, evalSubmitted: d.evalSubmitted, conflict: row.conflict })
}
