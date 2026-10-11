import { test } from 'node:test'
import assert from 'node:assert/strict'
import { belowPass, computeStageResults, type ScoringCriterion } from '../lib/scoring.ts'
import { evalState, missingItems } from '../components/judge/progress.ts'

// 울진 본선 규칙: 합격선 60점, 동점 시 사업성 → 연관성 → 창업역량, 종합 심사평 필수
const criteria: ScoringCriterion[] = [
  { id: 'fit', name: '적정성', order_no: 1, max_score: 25, min_pass_score: null, tie_priority: null },
  { id: 'rel', name: '연관성', order_no: 2, max_score: 25, min_pass_score: null, tie_priority: 2 },
  { id: 'biz', name: '사업성', order_no: 3, max_score: 25, min_pass_score: null, tie_priority: 1 },
  { id: 'cap', name: '창업역량', order_no: 4, max_score: 25, min_pass_score: null, tie_priority: 3 },
]
const opts = { normalize: false, trim_extremes: false, bonus_cap: 0 }

test('합격선: 미만만 미달, 미설정·미집계는 false', () => {
  assert.equal(belowPass(59.999, 60), true)
  assert.equal(belowPass(60, 60), false)
  assert.equal(belowPass(60, '60' as unknown as number), false)
  assert.equal(belowPass(10, null), false)
  assert.equal(belowPass(null, 60), false)
})

test('동점: 사업성 → 연관성 순으로 가른다', () => {
  // A·B 모두 총점 70. 사업성 같음(20), 연관성 A 15 > B 10
  const rows: [string, number[]][] = [['A', [15, 15, 20, 20]], ['B', [20, 10, 20, 20]]]
  const assignments = rows.map(([c], i) => ({ id: `a${i}`, judge_id: 'j1', company_id: c, conflict: false }))
  const scores = rows.flatMap(([, v], i) => criteria.map((c, k) => ({ assignment_id: `a${i}`, criterion_id: c.id, score: v[k] })))
  const [first, second] = computeStageResults({ companyIds: ['A', 'B'], criteria, assignments, scores, options: opts })
  assert.equal(first.company_id, 'A')
  assert.equal(first.rank, 1)
  assert.equal(second.rank, 2)
  assert.equal(first.tied, false)
})

test('종합 심사평 필수: 비어 있으면 미완료', () => {
  const crit = criteria.map(c => ({ ...c, comment_required: false }))
  const sc = crit.map(c => ({ criterion_id: c.id, score: 20, comment: null }))
  assert.deepEqual(missingItems(crit, sc, { required: true, comment: '  ' }), ['종합 심사평'])
  assert.deepEqual(missingItems(crit, sc, { required: false, comment: null }), [])
  assert.equal(evalState(crit, sc, { overall_comment: null }, false, true), 'draft')
  assert.equal(evalState(crit, sc, { overall_comment: '우수' }, false, true), 'done')
  assert.equal(evalState(crit, sc, null, false), 'done')
})
