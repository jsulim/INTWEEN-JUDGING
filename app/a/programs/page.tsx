import { PageHeader } from '@/components/ui'
import { requireRole } from '@/lib/server/auth'
import type { Program } from '@/lib/types'
import ProgramsManager, { type ProgramRow } from './ProgramsManager'

export const dynamic = 'force-dynamic'

// A-02 프로그램 관리: 생성·복제(템플릿 재사용)·상태 변경·삭제(준비 중)
export default async function ProgramsPage() {
  const { supabase } = await requireRole('admin')
  const { data } = await supabase.from('programs')
    .select('*, stages(id, status), companies(count), judges(count)')
    .order('created_at', { ascending: false })
  const rows: ProgramRow[] = ((data ?? []) as (Program & {
    stages: { id: string; status: string }[]; companies: { count: number }[]; judges: { count: number }[]
  })[]).map(p => ({
    ...p,
    stageCount: p.stages.length,
    companyCount: p.companies[0]?.count ?? 0,
    judgeCount: p.judges[0]?.count ?? 0,
  }))
  return (
    <>
      <PageHeader title="프로그램 관리" description="해커톤·기업심사 프로그램을 만들고, 이전 프로그램을 복제해 단계·평가항목·동의서를 재사용합니다." />
      <ProgramsManager programs={rows} />
    </>
  )
}
