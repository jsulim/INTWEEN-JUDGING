import { requireRole } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { currentFiles, programStages, requiredTypes } from '@/components/admin/setup/server'
import type { Company, StageEntry } from '@/lib/types'
import CompaniesManager, { type CompanyView, type InviteState } from './CompaniesManager'

export const dynamic = 'force-dynamic'

/** 초대 상태: auth 사용자 확인(서비스 롤, 읽기 전용) */
async function inviteStates(userIds: string[]): Promise<Map<string, InviteState>> {
  const out = new Map<string, InviteState>()
  if (!userIds.length) return out
  try {
    const admin = supabaseAdmin()
    await Promise.all(userIds.map(async id => {
      const { data } = await admin.auth.admin.getUserById(id)
      const u = data?.user
      out.set(id, !u ? 'none' : u.last_sign_in_at || u.email_confirmed_at ? 'joined' : 'invited')
    }))
  } catch {
    userIds.forEach(id => out.set(id, 'invited'))
  }
  return out
}

// A-05 기업 관리: 엑셀 일괄 등록, 초대 메일 발송, 제출 현황, 파일 일괄 다운로드
export default async function CompaniesPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireRole('admin')
  const stages = await programStages(supabase, params.id)
  const [{ data: companies }, { data: entries }] = await Promise.all([
    supabase.from('companies').select('*').eq('program_id', params.id).order('blind_code'),
    stages.length ? supabase.from('stage_entries').select('*').in('stage_id', stages.map(s => s.id)) : Promise.resolve({ data: [] }),
  ])
  const list = (companies ?? []) as Company[]
  const ents = (entries ?? []) as StageEntry[]
  const files = await currentFiles(supabase, ents.map(e => e.id))
  const invites = await inviteStates(list.map(c => c.owner_user_id).filter(Boolean) as string[])

  const rows: CompanyView[] = list.map(c => ({
    ...c,
    invite: c.owner_user_id ? invites.get(c.owner_user_id) ?? 'invited' : 'none',
    stages: Object.fromEntries(stages.map(s => {
      const e = ents.find(x => x.stage_id === s.id && x.company_id === c.id)
      if (!e) return [s.id, null]
      const req = requiredTypes(s)
      const have = files.get(e.id) ?? new Set<string>()
      return [s.id, { entry_id: e.id, eligibility: e.eligibility, result: e.result, done: req.filter(t => have.has(t)).length, required: req.length, files: have.size }]
    })),
  }))

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">기업 관리</h1>
      <p className="mb-6 text-muted">등록된 기업은 첫 단계의 참가 대상이 됩니다. 다음 단계 참가는 평가 결과(A-08)의 이관으로 생성됩니다.</p>
      <CompaniesManager programId={params.id} stages={stages} companies={rows} />
    </>
  )
}
