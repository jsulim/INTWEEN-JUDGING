import { PageHeader } from '@/components/ui'
import AppealsManager, { type AppealRow } from '@/components/admin/results/AppealsManager'
import { requireRole } from '@/lib/server/auth'
import { signedViewUrl } from '@/lib/server/storage'
import type { Appeal, Company, Stage, StageEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'

type Row = Appeal & { decided_by: string | null } & {
  stage_entries: Pick<StageEntry, 'id' | 'stage_id' | 'company_id' | 'result'> & {
    companies: Pick<Company, 'name' | 'blind_code' | 'contact_email'>
    stages: Pick<Stage, 'id' | 'name' | 'program_id' | 'order_no' | 'published_at' | 'appeal_days'>
  }
}

// A-14 이의신청 처리: 접수 목록, 검토 의견, 재심 여부, 결정·회신
export default async function AppealsPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireRole('admin')
  const { data } = await supabase.from('appeals')
    .select('*, stage_entries!inner(id, stage_id, company_id, result, companies(name, blind_code, contact_email), stages!inner(id, name, program_id, order_no, published_at, appeal_days))')
    .eq('stage_entries.stages.program_id', params.id)
    .order('created_at', { ascending: false })
  const rows = (data ?? []) as Row[]

  const deciders = [...new Set(rows.map(r => r.decided_by).filter(Boolean))] as string[]
  const { data: profs } = deciders.length ? await supabase.from('profiles').select('user_id, name').in('user_id', deciders) : { data: [] as { user_id: string; name: string }[] }
  const pm = new Map((profs ?? []).map(p => [p.user_id, p.name]))

  const appeals: AppealRow[] = await Promise.all(rows.map(async r => ({
    id: r.id,
    reason: r.reason,
    status: r.status,
    review_note: r.review_note,
    rereview: r.rereview,
    response: r.response,
    created_at: r.created_at,
    decided_at: r.decided_at,
    decided_by_name: r.decided_by ? pm.get(r.decided_by) ?? null : null,
    attachment_url: r.attachment_path ? await signedViewUrl(r.attachment_path).catch(() => null) : null,
    attachment_name: r.attachment_path ? r.attachment_path.split('/').pop() ?? '첨부' : null,
    company: r.stage_entries.companies?.name ?? '',
    blind_code: r.stage_entries.companies?.blind_code ?? null,
    stage: r.stage_entries.stages.name,
    stage_id: r.stage_entries.stages.id,
    result: r.stage_entries.result,
  })))

  return (
    <>
      <PageHeader title="이의신청 처리" description="결과 공개 후 기간 내 기업당 1회 접수됩니다. 검토 의견은 내부용이며, 회신만 기업에 표시됩니다." />
      <AppealsManager programId={params.id} appeals={appeals} />
    </>
  )
}
