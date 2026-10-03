import { Empty, PageHeader } from '@/components/ui'
import { StageTabs } from '@/components/admin/results/ui'
import PresentationsManager from '@/components/admin/results/PresentationsManager'
import { requireRole } from '@/lib/server/auth'
import type { Company, PresentationSlot, Stage, StageEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'

// A-13 발표 진행 관리: 순서 편성·랜덤 추첨·현재 발표 기업 전환·타이머·화상 링크 배포
export default async function PresentationsPage({ params, searchParams }: { params: { id: string }; searchParams: { stage?: string } }) {
  const { supabase } = await requireRole('admin')
  const { data: stageRows } = await supabase.from('stages').select('*').eq('program_id', params.id).order('order_no')
  const stages = (stageRows ?? []) as Stage[]
  if (!stages.length) return (<><PageHeader title="발표 진행 관리" /><Empty>등록된 단계가 없습니다.</Empty></>)
  const current = stages.find(s => s.id === searchParams.stage) ?? stages.find(s => s.is_presentation) ?? stages[0]

  const [{ data: slots }, { data: ents }] = await Promise.all([
    supabase.from('presentation_slots').select('*, companies(id, name, blind_code)').eq('stage_id', current.id).order('order_no'),
    supabase.from('stage_entries').select('*, companies(id, name, blind_code)').eq('stage_id', current.id),
  ])
  const slotRows = (slots ?? []) as (PresentationSlot & { companies: Pick<Company, 'id' | 'name' | 'blind_code'> })[]
  const entries = ((ents ?? []) as (StageEntry & { companies: Pick<Company, 'id' | 'name' | 'blind_code'> })[]).filter(e => e.eligibility !== 'ineligible')
  const slotted = new Set(slotRows.map(s => s.company_id))

  return (
    <>
      <PageHeader title="발표 진행 관리" description="발표 순서를 편성하고 현재 발표 기업을 전환합니다. 심사위원 현장 모드 화면이 자동으로 따라옵니다." />
      <StageTabs stages={stages} current={current.id} base={`/a/p/${params.id}/presentations`} />
      <PresentationsManager
        key={current.id}
        stage={{ id: current.id, name: current.name, is_presentation: current.is_presentation, status: current.status }}
        slots={slotRows.map(s => ({ ...s, company_name: s.companies?.name ?? '', blind_code: s.companies?.blind_code ?? null }))}
        unslotted={entries.filter(e => !slotted.has(e.company_id)).map(e => ({ company_id: e.company_id, name: e.companies.name }))}
      />
    </>
  )
}
