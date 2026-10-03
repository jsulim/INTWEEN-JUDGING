import Link from 'next/link'
import { Empty } from '@/components/ui'
import { requireRole } from '@/lib/server/auth'
import StageTabs from '@/components/admin/setup/StageTabs'
import { pickStage, profilesByUser, programStages } from '@/components/admin/setup/server'
import type { Assignment, Company, Judge, StageEntry } from '@/lib/types'
import AssignmentMatrix from './AssignmentMatrix'

export const dynamic = 'force-dynamic'

// A-07 배정 관리: 전원 배정 / 개별 배정 / 이해충돌 제외
export default async function AssignmentsPage({ params, searchParams }: { params: { id: string }; searchParams: { stage?: string } }) {
  const { supabase } = await requireRole('admin')
  const stages = await programStages(supabase, params.id)
  const stage = pickStage(stages, searchParams.stage)
  if (!stage) return <Empty>단계가 없습니다. <Link className="font-semibold text-primary" href={`/a/p/${params.id}/stages`}>단계 관리</Link>에서 먼저 단계를 추가해 주세요.</Empty>

  const [{ data: entries }, { data: judgeRows }, { data: asg }] = await Promise.all([
    supabase.from('stage_entries').select('*, companies(*)').eq('stage_id', stage.id),
    supabase.from('judges').select('*').eq('program_id', params.id).order('created_at'),
    supabase.from('assignments').select('*').eq('stage_id', stage.id),
  ])
  const assignments = (asg ?? []) as (Assignment & { conflict_reported_at: string | null })[]
  const judges = (judgeRows ?? []) as Judge[]
  const profs = await profilesByUser(supabase, judges.map(j => j.user_id))
  const ids = assignments.map(a => a.id)
  const { data: scored } = ids.length
    ? await supabase.from('scores').select('assignment_id').in('assignment_id', ids).not('score', 'is', null)
    : { data: [] as { assignment_id: string }[] }
  const scoreCount: Record<string, number> = {}
  for (const s of scored ?? []) scoreCount[s.assignment_id] = (scoreCount[s.assignment_id] ?? 0) + 1

  const ents = ((entries ?? []) as (StageEntry & { companies: Company })[])
    .sort((a, b) => (a.companies.blind_code ?? '').localeCompare(b.companies.blind_code ?? ''))

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">배정 관리</h1>
      <StageTabs stages={stages} current={stage} basePath={`/a/p/${params.id}/assignments`} />
      <AssignmentMatrix
        stage={stage}
        companies={ents.map(e => ({ id: e.company_id, name: e.companies.name, blind_code: e.companies.blind_code, field: e.companies.field, eligibility: e.eligibility }))}
        judges={judges.map(j => ({ id: j.id, name: profs.get(j.user_id)?.name || profs.get(j.user_id)?.email || '(이름 없음)', is_chair: j.is_chair, expertise: j.expertise }))}
        assignments={assignments}
        scoreCount={scoreCount}
      />
    </>
  )
}
