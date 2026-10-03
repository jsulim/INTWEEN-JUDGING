import { requireRole } from '@/lib/server/auth'
import type { ConsentTemplate } from '@/lib/types'
import ConsentTemplates from './ConsentTemplates'

export const dynamic = 'force-dynamic'

// A-10 동의서 양식 관리: 문구 편집(새 버전 → 재서명), 필수 여부, 버전 이력
export default async function ConsentsPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireRole('admin')
  const [{ data: templates }, { count: judgeCount }] = await Promise.all([
    supabase.from('consent_templates').select('*').eq('program_id', params.id).order('kind').order('version', { ascending: false }),
    supabase.from('judges').select('id', { count: 'exact', head: true }).eq('program_id', params.id),
  ])
  const list = (templates ?? []) as ConsentTemplate[]
  const ids = list.map(t => t.id)
  const { data: signed } = ids.length ? await supabase.from('consents').select('template_id').in('template_id', ids) : { data: [] as { template_id: string }[] }
  const signedCount: Record<string, number> = {}
  for (const s of signed ?? []) signedCount[s.template_id] = (signedCount[s.template_id] ?? 0) + 1

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">동의서 양식 관리</h1>
      <p className="mb-6 text-muted">문구를 수정하면 새 버전이 등록되고 이전 버전은 비활성화됩니다. 심사위원은 새 버전에 다시 서명해야 자료 열람·평가를 계속할 수 있습니다.</p>
      <ConsentTemplates programId={params.id} templates={list} signedCount={signedCount} judgeCount={judgeCount ?? 0} />
    </>
  )
}
