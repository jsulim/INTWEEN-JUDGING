import Link from 'next/link'
import { Empty } from '@/components/ui'
import { requireRole } from '@/lib/server/auth'
import StageTabs from '@/components/admin/setup/StageTabs'
import { pickStage, programStages } from '@/components/admin/setup/server'
import type { ApplicationField, BonusRule, Company, EligibilityCheck, EntryBonus, StageEntry, Submission } from '@/lib/types'
import EligibilityReview, { type EntryView } from './EligibilityReview'

export const dynamic = 'force-dynamic'

// A-12 적격 검토(0차): 자격요건·필수서류 체크, 보완 요청(기한), 부적격 처리, 가점 증빙 승인
export default async function EligibilityPage({ params, searchParams }: { params: { id: string }; searchParams: { stage?: string } }) {
  const { supabase, user } = await requireRole('admin')
  const stages = await programStages(supabase, params.id)
  const stage = pickStage(stages, searchParams.stage ?? stages[0]?.id)
  if (!stage) return <Empty>단계가 없습니다. <Link className="font-semibold text-primary" href={`/a/p/${params.id}/stages`}>단계 관리</Link>에서 먼저 단계를 추가해 주세요.</Empty>

  const [{ data: entries }, { data: fields }, { data: rules }] = await Promise.all([
    supabase.from('stage_entries').select('*, companies(*)').eq('stage_id', stage.id),
    supabase.from('application_fields').select('*').eq('program_id', params.id).order('order_no'),
    supabase.from('bonus_rules').select('*').eq('stage_id', stage.id),
  ])
  const ents = ((entries ?? []) as (StageEntry & { companies: Company })[])
    .sort((a, b) => (a.companies.blind_code ?? '').localeCompare(b.companies.blind_code ?? ''))
  const entryIds = ents.map(e => e.id)
  const companyIds = ents.map(e => e.company_id)
  const empty = { data: [] }
  const [{ data: answers }, { data: subs }, { data: checks }, { data: bonuses }] = await Promise.all([
    companyIds.length ? supabase.from('application_answers').select('company_id, field_id, value').in('company_id', companyIds) : Promise.resolve(empty),
    entryIds.length ? supabase.from('submissions').select('*').eq('is_current', true).in('entry_id', entryIds) : Promise.resolve(empty),
    entryIds.length ? supabase.from('eligibility_checks').select('*').in('entry_id', entryIds).order('created_at', { ascending: false }) : Promise.resolve(empty),
    entryIds.length ? supabase.from('entry_bonuses').select('*').in('entry_id', entryIds) : Promise.resolve(empty),
  ])
  const ans = (answers ?? []) as { company_id: string; field_id: string; value: unknown }[]
  const rows: EntryView[] = ents.map(e => ({
    entry: { id: e.id, eligibility: e.eligibility, result: e.result },
    company: e.companies,
    answers: Object.fromEntries(ans.filter(a => a.company_id === e.company_id).map(a => [a.field_id, a.value])),
    submissions: ((subs ?? []) as Submission[]).filter(s => s.entry_id === e.id),
    checks: ((checks ?? []) as EligibilityCheck[]).filter(c => c.entry_id === e.id),
    bonuses: ((bonuses ?? []) as EntryBonus[]).filter(b => b.entry_id === e.id),
  }))

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">적격 검토</h1>
      <StageTabs stages={stages} current={stage} basePath={`/a/p/${params.id}/eligibility`} />
      <EligibilityReview stage={stage} rows={rows} fields={(fields ?? []) as ApplicationField[]} rules={(rules ?? []) as BonusRule[]} adminId={user.id} />
    </>
  )
}
