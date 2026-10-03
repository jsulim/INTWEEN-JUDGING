import { requireRole } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { profilesByUser } from '@/components/admin/setup/server'
import type { Consent, ConsentTemplate, Judge, JudgePoolEntry } from '@/lib/types'
import JudgesManager, { type JudgeView } from './JudgesManager'

export const dynamic = 'force-dynamic'

// A-06 심사위원 관리: 등록·초대, 서명 현황, 서명본 PDF, 이해충돌 신고
export default async function JudgesPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireRole('admin')
  const [{ data: judgeRows }, { data: templates }, { data: pool }] = await Promise.all([
    supabase.from('judges').select('*').eq('program_id', params.id).order('created_at'),
    supabase.from('consent_templates').select('*').eq('program_id', params.id).eq('is_active', true).order('kind'),
    supabase.from('judge_pool').select('*').order('name'),
  ])
  const judges = (judgeRows ?? []) as Judge[]
  const judgeIds = judges.map(j => j.id)
  const [profs, { data: consents }, { data: conflicts }] = await Promise.all([
    profilesByUser(supabase, judges.map(j => j.user_id)),
    judgeIds.length ? supabase.from('consents').select('*').in('judge_id', judgeIds) : Promise.resolve({ data: [] }),
    judgeIds.length
      ? supabase.from('assignments').select('judge_id, conflict_reason, conflict_reported_at, companies(name), stages(name)').in('judge_id', judgeIds).eq('conflict', true)
      : Promise.resolve({ data: [] }),
  ])

  // 초대 상태 (서비스 롤 읽기)
  const joined = new Map<string, boolean>()
  try {
    const admin = supabaseAdmin()
    await Promise.all(judges.map(async j => {
      const { data } = await admin.auth.admin.getUserById(j.user_id)
      joined.set(j.user_id, !!(data?.user?.last_sign_in_at || data?.user?.email_confirmed_at))
    }))
  } catch { /* 서비스 롤 미설정 시 표시 생략 */ }

  const cons = (consents ?? []) as Consent[]
  const conf = (conflicts ?? []) as unknown as { judge_id: string; conflict_reason: string | null; conflict_reported_at: string | null; companies: { name: string } | null; stages: { name: string } | null }[]
  const rows: JudgeView[] = judges.map(j => {
    const p = profs.get(j.user_id)
    return {
      ...j,
      name: p?.name ?? '',
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      joined: joined.get(j.user_id) ?? null,
      consents: cons.filter(c => c.judge_id === j.id),
      conflicts: conf.filter(c => c.judge_id === j.id).map(c => ({
        company: c.companies?.name ?? '', stage: c.stages?.name ?? '', reason: c.conflict_reason, reported_at: c.conflict_reported_at,
      })),
    }
  })

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">심사위원 관리</h1>
      <p className="mb-6 text-muted">심사위원은 활성 동의서(필수)를 모두 서명해야 자료 열람·평가가 가능합니다. 양식 버전이 바뀌면 재서명이 필요합니다.</p>
      <JudgesManager programId={params.id} judges={rows} templates={(templates ?? []) as ConsentTemplate[]} pool={(pool ?? []) as JudgePoolEntry[]} />
    </>
  )
}
