import Link from 'next/link'
import { Empty } from '@/components/ui'
import { requireRole } from '@/lib/server/auth'
import StageTabs from '@/components/admin/setup/StageTabs'
import { pickStage, programStages } from '@/components/admin/setup/server'
import type { BonusRule, Criterion } from '@/lib/types'
import CriteriaManager from './CriteriaManager'
import BonusRules from './BonusRules'

export const dynamic = 'force-dynamic'

// A-04 평가항목 관리 (+ 루브릭·과락·동점 우선순위) / 가점·감점 규칙
export default async function CriteriaPage({ params, searchParams }: { params: { id: string }; searchParams: { stage?: string } }) {
  const { supabase } = await requireRole('admin')
  const stages = await programStages(supabase, params.id)
  const stage = pickStage(stages, searchParams.stage)
  const base = `/a/p/${params.id}/criteria`
  if (!stage) return <Empty>단계가 없습니다. <Link className="font-semibold text-primary" href={`/a/p/${params.id}/stages`}>단계 관리</Link>에서 먼저 단계를 추가해 주세요.</Empty>

  const { data: asg } = await supabase.from('assignments').select('id').eq('stage_id', stage.id)
  const asgIds = (asg ?? []).map(a => a.id)
  const [{ data: criteria }, { data: rules }, { count: scoreCount }, { data: claims }] = await Promise.all([
    supabase.from('criteria').select('*').eq('stage_id', stage.id).order('order_no').order('created_at'),
    supabase.from('bonus_rules').select('*').eq('stage_id', stage.id).order('created_at'),
    asgIds.length
      ? supabase.from('scores').select('id', { count: 'exact', head: true }).in('assignment_id', asgIds).not('score', 'is', null)
      : Promise.resolve({ count: 0 }),
    supabase.from('entry_bonuses').select('rule_id, approved_at, rejected, bonus_rules!inner(stage_id)').eq('bonus_rules.stage_id', stage.id),
  ])
  const claimCount: Record<string, number> = {}
  for (const c of claims ?? []) claimCount[c.rule_id] = (claimCount[c.rule_id] ?? 0) + 1

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">평가항목 관리</h1>
      <StageTabs stages={stages} current={stage} basePath={base} />
      <div className="grid gap-6">
        <CriteriaManager stage={stage} criteria={(criteria ?? []) as Criterion[]} scoreCount={scoreCount ?? 0}
          otherStages={stages.filter(s => s.id !== stage.id).map(s => ({ id: s.id, name: `${s.order_no}. ${s.name}` }))} />
        <BonusRules stage={stage} rules={(rules ?? []) as BonusRule[]} claimCount={claimCount} />
      </div>
    </>
  )
}
