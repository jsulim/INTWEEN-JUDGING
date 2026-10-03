import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeStageResults, normalizeJudge, trimmedMean, type ScoringCriterion } from '../lib/scoring.ts'

const criteria: ScoringCriterion[] = [
  { id: 'tech', name: '기술성', order_no: 1, max_score: 30, min_pass_score: 12, tie_priority: 1 },
  { id: 'biz', name: '사업성', order_no: 2, max_score: 70, min_pass_score: null, tie_priority: null },
]
const opts = { normalize: false, trim_extremes: false, bonus_cap: 5, deviation_alert: 20 }

function build(rows: [judge: string, company: string, tech: number | null, biz: number | null][]) {
  const assignments = rows.map(([j, c], i) => ({ id: `a${i}`, judge_id: j, company_id: c, conflict: false }))
  const scores = rows.flatMap(([, , t, b], i) => [
    { assignment_id: `a${i}`, criterion_id: 'tech', score: t },
    { assignment_id: `a${i}`, criterion_id: 'biz', score: b },
  ])
  return { assignments, scores }
}

test('기업 점수 = 심사위원 합계의 평균, 순위 내림차순', () => {
  const { assignments, scores } = build([
    ['j1', 'A', 25, 60], ['j2', 'A', 27, 58],
    ['j1', 'B', 20, 50], ['j2', 'B', 22, 52],
  ])
  const r = computeStageResults({ companyIds: ['A', 'B'], criteria, assignments, scores, options: opts })
  assert.equal(r[0].company_id, 'A')
  assert.equal(r[0].final, 85)
  assert.equal(r[0].rank, 1)
  assert.equal(r[1].final, 72)
  assert.equal(r[1].rank, 2)
})

test('Q11 총점 1위지만 과락 항목 → 과락 표시, 순위 제외', () => {
  const { assignments, scores } = build([
    ['j1', 'A', 10, 70], ['j2', 'A', 11, 70], // 기술성 평균 10.5 < 12
    ['j1', 'B', 20, 50], ['j2', 'B', 20, 50],
  ])
  const r = computeStageResults({ companyIds: ['A', 'B'], criteria, assignments, scores, options: opts })
  const a = r.find(x => x.company_id === 'A')!
  assert.equal(a.cutoff, true)
  assert.deepEqual(a.cutoff_criteria, ['tech'])
  assert.equal(a.rank, null)
  assert.equal(r.find(x => x.company_id === 'B')!.rank, 1)
})

test('Q8 동점 → 우선 항목 높은 순, 그래도 같으면 공동 순위', () => {
  const { assignments, scores } = build([
    ['j1', 'A', 20, 60], // 80, 기술 20
    ['j1', 'B', 25, 55], // 80, 기술 25 → B 우선
    ['j1', 'C', 25, 55], // 80, 기술 25 → B와 공동
    ['j1', 'D', 15, 50],
  ])
  const r = computeStageResults({ companyIds: ['A', 'B', 'C', 'D'], criteria, assignments, scores, options: opts })
  const rank = Object.fromEntries(r.map(x => [x.company_id, x.rank]))
  assert.equal(rank.B, 1)
  assert.equal(rank.C, 1)
  assert.equal(rank.A, 3)
  assert.equal(rank.D, 4)
  assert.equal(r.find(x => x.company_id === 'B')!.tied, true)
})

test('미평가 심사위원 → 집계 중, 완료분만 평균', () => {
  const { assignments, scores } = build([['j1', 'A', 20, 60], ['j2', 'A', 20, null]])
  const [a] = computeStageResults({ companyIds: ['A'], criteria, assignments, scores, options: opts })
  assert.equal(a.in_progress, true)
  assert.equal(a.done_count, 1)
  assert.equal(a.final, 80)
})

test('이해충돌 배정은 집계에서 제외', () => {
  const { assignments, scores } = build([['j1', 'A', 20, 60], ['j2', 'A', 0, 0]])
  assignments[1].conflict = true
  const [a] = computeStageResults({ companyIds: ['A'], criteria, assignments, scores, options: opts })
  assert.equal(a.judge_count, 1)
  assert.equal(a.final, 80)
})

test('Q14 가점: 승인분만 반영, 상한 ±5', () => {
  const { assignments, scores } = build([['j1', 'A', 20, 60], ['j1', 'B', 20, 60]])
  const r = computeStageResults({
    companyIds: ['A', 'B'], criteria, assignments, scores, options: opts,
    bonuses: [
      { company_id: 'A', points: 3, approved: true },
      { company_id: 'A', points: 4, approved: true },
      { company_id: 'B', points: 3, approved: false },
    ],
  })
  const a = r.find(x => x.company_id === 'A')!
  const b = r.find(x => x.company_id === 'B')!
  assert.equal(a.bonus, 5)
  assert.equal(a.final, 85)
  assert.equal(b.bonus, 0)
  assert.equal(b.bonus_pending, 3)
  assert.equal(b.final, 80)
})

test('최고·최저 제외: 심사위원 5명 이상일 때만', () => {
  assert.equal(trimmedMean([10, 20, 30, 40, 100], true), 30)
  assert.equal(trimmedMean([10, 20, 30, 40], true), 25)
  assert.equal(trimmedMean([10, 20, 30, 40, 100], false), 40)
})

test('정규화: 50 + 10·z, 표본 5개 미만이면 미적용', () => {
  assert.equal(normalizeJudge([1, 2, 3, 4]), null)
  const f = normalizeJudge([60, 70, 80, 90, 100])!
  assert.equal(f(80), 50)
  assert.ok(Math.abs(f(100) - (50 + 10 * 20 / Math.sqrt(200))) < 1e-9)
})

test('정규화 사용 시 후한·박한 심사위원 성향 보정', () => {
  const companies = ['A', 'B', 'C', 'D', 'E']
  // j1은 박하게, j2는 후하게 같은 순서로 평가
  const rows: [string, string, number, number][] = []
  companies.forEach((c, i) => {
    rows.push(['j1', c, 10 + i, 30 + i * 5])
    rows.push(['j2', c, 25 + i, 60 + i * 2])
  })
  const { assignments, scores } = build(rows)
  const r = computeStageResults({ companyIds: companies, criteria: criteria.map(c => ({ ...c, min_pass_score: null })),
    assignments, scores, options: { ...opts, normalize: true } })
  assert.deepEqual(r.map(x => x.company_id), ['E', 'D', 'C', 'B', 'A'])
  assert.ok(r.every(x => x.normalized != null && x.raw != null))
  assert.equal(r.find(x => x.company_id === 'C')!.normalized, 50)
})

test('점수 편차 경고: 심사위원 간 20점 이상', () => {
  const { assignments, scores } = build([['j1', 'A', 10, 40], ['j2', 'A', 25, 50]])
  const [a] = computeStageResults({ companyIds: ['A'], criteria, assignments, scores, options: opts })
  assert.equal(a.deviation, 25)
  assert.equal(a.deviation_alert, true)
})
