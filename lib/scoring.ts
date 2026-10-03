// 최종 점수 산정 (개발 가이드 4-1 '최종 점수 산정 순서', 8-1)
//   1) 과락 판정 → 2) 심사위원 점수 집계(원점수/정규화, 최고·최저 제외) → 3) 가점·감점(승인분, 상한) → 4) 동점 처리 후 순위
// 대시보드(A-01)·평가 결과(A-08)·확정(lock)·내보내기가 모두 이 함수 하나를 쓴다 → Q10 결과 일치.
// 순수 함수: DB·네트워크 의존 없음 (tests/scoring.test.ts)

export interface ScoringCriterion {
  id: string
  name: string
  order_no: number
  max_score: number
  min_pass_score: number | null
  tie_priority: number | null
}

export interface ScoringAssignment {
  id: string
  judge_id: string
  company_id: string
  conflict: boolean
}

export interface ScoringScore {
  assignment_id: string
  criterion_id: string
  score: number | null
}

export interface ScoringBonus {
  company_id: string
  points: number
  approved: boolean // 미승인 가점은 0점 처리 (Q14)
}

export interface ScoringOptions {
  normalize: boolean
  trim_extremes: boolean
  bonus_cap: number
  deviation_alert?: number
}

export interface JudgeTotal {
  judge_id: string
  total: number | null // 미완료면 null
  normalized: number | null
  normalization_applied: boolean
}

export interface CompanyResult {
  company_id: string
  judge_count: number
  done_count: number
  in_progress: boolean // 미평가 심사위원 있음 → '집계 중' 배지
  raw: number | null // 원점수 평균
  normalized: number | null // 정규화 점수 평균 (옵션 사용 시)
  aggregate: number | null // 집계 기준 점수 (정규화 사용 시 normalized, 아니면 raw)
  bonus: number // 상한 적용 후
  bonus_pending: number // 미승인 가점 합계 (참고 표시)
  final: number | null
  cutoff: boolean
  cutoff_criteria: string[]
  criterion_avgs: Record<string, number | null>
  judge_totals: JudgeTotal[]
  deviation: number | null // 심사위원 간 최고-최저 차
  deviation_alert: boolean
  rank: number | null // 과락·미평가 기업은 null
  tied: boolean
}

export const NORMALIZE_MIN_SAMPLES = 5
export const TRIM_MIN_JUDGES = 5

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** 심사위원 j의 점수를 50 + 10·(s − 평균)/표준편차 로 변환. 평가 기업 5개 미만이면 미적용 */
export function normalizeJudge(totals: number[]): ((s: number) => number) | null {
  if (totals.length < NORMALIZE_MIN_SAMPLES) return null
  const m = mean(totals)
  const sd = Math.sqrt(mean(totals.map(t => (t - m) ** 2)))
  if (sd === 0) return () => 50
  return s => 50 + (10 * (s - m)) / sd
}

/** 최고·최저 1개씩 제외 후 평균 (n ≥ 5 일 때만) */
export function trimmedMean(xs: number[], trim: boolean): number | null {
  if (xs.length === 0) return null
  if (!trim || xs.length < TRIM_MIN_JUDGES) return mean(xs)
  const sorted = [...xs].sort((a, b) => a - b)
  return mean(sorted.slice(1, -1))
}

export function computeStageResults(input: {
  companyIds: string[]
  criteria: ScoringCriterion[]
  assignments: ScoringAssignment[]
  scores: ScoringScore[]
  bonuses?: ScoringBonus[]
  options: ScoringOptions
}): CompanyResult[] {
  const { companyIds, criteria, options } = input
  const assignments = input.assignments.filter(a => !a.conflict)
  const scoreMap = new Map<string, Map<string, number | null>>()
  for (const s of input.scores) {
    if (!scoreMap.has(s.assignment_id)) scoreMap.set(s.assignment_id, new Map())
    scoreMap.get(s.assignment_id)!.set(s.criterion_id, s.score == null ? null : Number(s.score))
  }

  // 배정별 합계 (모든 항목 입력 시에만 완료)
  const totalOf = (assignmentId: string): number | null => {
    const m = scoreMap.get(assignmentId)
    if (!m || criteria.length === 0) return null
    let sum = 0
    for (const c of criteria) {
      const v = m.get(c.id)
      if (v == null) return null
      sum += v
    }
    return sum
  }
  const totals = new Map(assignments.map(a => [a.id, totalOf(a.id)]))

  // 정규화 함수 (심사위원별, 완료 평가 기준)
  const normalizers = new Map<string, ((s: number) => number) | null>()
  if (options.normalize) {
    const byJudge = new Map<string, number[]>()
    for (const a of assignments) {
      const t = totals.get(a.id)
      if (t == null) continue
      if (!byJudge.has(a.judge_id)) byJudge.set(a.judge_id, [])
      byJudge.get(a.judge_id)!.push(t)
    }
    for (const [j, ts] of byJudge) normalizers.set(j, normalizeJudge(ts))
  }

  const bonusBy = new Map<string, { approved: number; pending: number }>()
  for (const b of input.bonuses ?? []) {
    const cur = bonusBy.get(b.company_id) ?? { approved: 0, pending: 0 }
    if (b.approved) cur.approved += Number(b.points)
    else cur.pending += Number(b.points)
    bonusBy.set(b.company_id, cur)
  }

  const results: CompanyResult[] = companyIds.map(companyId => {
    const mine = assignments.filter(a => a.company_id === companyId)
    const judgeTotals: JudgeTotal[] = mine.map(a => {
      const total = totals.get(a.id) ?? null
      const norm = options.normalize ? normalizers.get(a.judge_id) ?? null : null
      return {
        judge_id: a.judge_id,
        total,
        normalized: total != null && norm ? round(norm(total)) : null,
        normalization_applied: !!norm,
      }
    })
    const done = judgeTotals.filter(j => j.total != null)
    const doneAssignments = mine.filter(a => totals.get(a.id) != null)

    // 항목별 평균 (완료 평가 기준)
    const criterionAvgs: Record<string, number | null> = {}
    for (const c of criteria) {
      const vals = doneAssignments.map(a => scoreMap.get(a.id)!.get(c.id)!).filter(v => v != null) as number[]
      criterionAvgs[c.id] = vals.length ? round(mean(vals)) : null
    }

    // 1) 과락: 항목 평균이 최저점 미달
    const cutoffCriteria = criteria
      .filter(c => c.min_pass_score != null && criterionAvgs[c.id] != null && criterionAvgs[c.id]! < c.min_pass_score)
      .map(c => c.id)

    // 2) 집계
    const raw = trimmedMean(done.map(j => j.total!), options.trim_extremes)
    const normalized = options.normalize
      ? trimmedMean(done.map(j => (j.normalization_applied ? j.normalized! : j.total!)), options.trim_extremes)
      : null
    const aggregate = options.normalize ? normalized : raw

    // 3) 가점·감점 (승인분만, ±상한)
    const b = bonusBy.get(companyId) ?? { approved: 0, pending: 0 }
    const cap = Math.abs(Number(options.bonus_cap ?? 0))
    const bonus = Math.max(-cap, Math.min(cap, b.approved))

    const doneTotals = done.map(j => j.total!)
    const deviation = doneTotals.length >= 2 ? round(Math.max(...doneTotals) - Math.min(...doneTotals)) : null

    return {
      company_id: companyId,
      judge_count: mine.length,
      done_count: done.length,
      in_progress: done.length < mine.length,
      raw: raw == null ? null : round(raw),
      normalized: normalized == null ? null : round(normalized),
      aggregate: aggregate == null ? null : round(aggregate),
      bonus: round(bonus, 2),
      bonus_pending: round(b.pending, 2),
      final: aggregate == null ? null : round(aggregate + bonus),
      cutoff: cutoffCriteria.length > 0,
      cutoff_criteria: cutoffCriteria,
      criterion_avgs: criterionAvgs,
      judge_totals: judgeTotals,
      deviation,
      deviation_alert: deviation != null && options.deviation_alert != null && deviation >= options.deviation_alert,
      rank: null,
      tied: false,
    }
  })

  // 4) 순위: 최종 점수 내림차순 → 우선 항목 평균 → 그래도 같으면 공동 순위
  const tieCriteria = criteria
    .filter(c => c.tie_priority != null)
    .sort((a, b) => a.tie_priority! - b.tie_priority!)
  const compare = (x: CompanyResult, y: CompanyResult) => {
    if (x.final! !== y.final!) return y.final! - x.final!
    for (const c of tieCriteria) {
      const dx = x.criterion_avgs[c.id] ?? -Infinity
      const dy = y.criterion_avgs[c.id] ?? -Infinity
      if (dx !== dy) return dy - dx
    }
    return 0
  }
  const rankable = results.filter(r => !r.cutoff && r.final != null).sort(compare)
  rankable.forEach((r, i) => {
    const prev = rankable[i - 1]
    if (prev && compare(prev, r) === 0) {
      r.rank = prev.rank
      r.tied = prev.tied = true
    } else {
      r.rank = i + 1
    }
  })

  return results.sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank
    if (a.rank != null) return -1
    if (b.rank != null) return 1
    return (b.final ?? -Infinity) - (a.final ?? -Infinity)
  })
}
