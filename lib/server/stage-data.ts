import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeStageResults, type CompanyResult } from '@/lib/scoring'
import type { Assignment, Company, Criterion, Stage, StageEntry } from '@/lib/types'

/**
 * 단계 집계용 데이터 로드 + 최종 점수 산정. 관리자 클라이언트(RLS: 관리자 전체)로 호출한다.
 * A-01 대시보드, A-08 결과, /lock, /export 가 모두 이 함수를 써서 숫자가 일치한다(Q10).
 */
export async function loadStageResults(supabase: SupabaseClient, stageId: string) {
  const { data: stage, error } = await supabase.from('stages').select('*').eq('id', stageId).single()
  if (error || !stage) throw new Error('단계를 찾을 수 없습니다.')
  const [{ data: criteria }, { data: entries }, { data: assignments }, { data: rules }] = await Promise.all([
    supabase.from('criteria').select('*').eq('stage_id', stageId).order('order_no'),
    supabase.from('stage_entries').select('*, companies(*)').eq('stage_id', stageId),
    supabase.from('assignments').select('*').eq('stage_id', stageId),
    supabase.from('bonus_rules').select('*').eq('stage_id', stageId),
  ])
  const assignmentIds = (assignments ?? []).map(a => a.id)
  const entryIds = (entries ?? []).map(e => e.id)
  const [{ data: scores }, { data: entryBonuses }] = await Promise.all([
    assignmentIds.length
      ? supabase.from('scores').select('assignment_id, criterion_id, score, comment').in('assignment_id', assignmentIds)
      : Promise.resolve({ data: [] as { assignment_id: string; criterion_id: string; score: number | null; comment: string | null }[] }),
    entryIds.length
      ? supabase.from('entry_bonuses').select('*').in('entry_id', entryIds)
      : Promise.resolve({ data: [] as { entry_id: string; rule_id: string; approved_at: string | null; rejected: boolean }[] }),
  ])

  // 부적격 처리된 기업은 심사 대상에서 제외
  const activeEntries = ((entries ?? []) as (StageEntry & { companies: Company })[]).filter(e => e.eligibility !== 'ineligible')
  const companyOfEntry = new Map(activeEntries.map(e => [e.id, e.company_id]))
  const ruleMap = new Map((rules ?? []).map(r => [r.id, r]))
  const bonuses = (entryBonuses ?? [])
    .filter(b => companyOfEntry.has(b.entry_id) && !b.rejected && ruleMap.has(b.rule_id))
    .map(b => ({ company_id: companyOfEntry.get(b.entry_id)!, points: Number(ruleMap.get(b.rule_id)!.points), approved: !!b.approved_at }))

  const s = stage as Stage
  const results: CompanyResult[] = computeStageResults({
    companyIds: activeEntries.map(e => e.company_id),
    criteria: (criteria ?? []).map(c => ({ ...c, max_score: Number(c.max_score), min_pass_score: c.min_pass_score == null ? null : Number(c.min_pass_score) })),
    assignments: (assignments ?? []) as Assignment[],
    scores: (scores ?? []).map(x => ({ ...x, score: x.score == null ? null : Number(x.score) })),
    bonuses,
    options: { normalize: s.normalize, trim_extremes: s.trim_extremes, bonus_cap: Number(s.bonus_cap), deviation_alert: Number(s.deviation_alert) },
  })

  return {
    stage: s,
    criteria: (criteria ?? []) as Criterion[],
    entries: activeEntries,
    companies: new Map(activeEntries.map(e => [e.company_id, e.companies])),
    assignments: (assignments ?? []) as Assignment[],
    scores: scores ?? [],
    results,
    unapprovedBonusCount: bonuses.filter(b => !b.approved).length,
  }
}
