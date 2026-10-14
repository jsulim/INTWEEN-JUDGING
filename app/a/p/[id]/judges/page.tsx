import { requireRole } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { profilesByUser } from '@/components/admin/setup/server'
import type { Consent, ConsentTemplate, Judge, JudgePoolEntry, JudgeRequest, PoolShare } from '@/lib/types'
import JudgesManager, { type JudgeView } from './JudgesManager'
import JudgeRequests from './JudgeRequests'
import PoolShares from './PoolShares'

export const dynamic = 'force-dynamic'

// A-06 심사위원 관리: 등록·초대, 서명 현황, 서명본 PDF, 이해충돌 신고
export default async function JudgesPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireRole('admin')
  const [{ data: judgeRows }, { data: templates }, { data: pool }, { data: program }, { data: requests }, { data: shares }] = await Promise.all([
    supabase.from('judges').select('*').eq('program_id', params.id).order('created_at'),
    supabase.from('consent_templates').select('*').eq('program_id', params.id).eq('is_active', true).order('kind'),
    supabase.from('judge_pool').select('*').order('name'),
    supabase.from('programs').select('title, judge_signup_open').eq('id', params.id).maybeSingle(),
    supabase.from('judge_requests').select('*').eq('program_id', params.id).order('created_at', { ascending: false }),
    supabase.from('pool_shares').select('*').eq('program_id', params.id).order('created_at', { ascending: false }),
  ])
  const { data: members } = await supabase.from('pool_members').select('pool_id').eq('program_id', params.id)
  const memberIds = new Set((members ?? []).map(m => m.pool_id as string))
  // 공유 링크별 기관 선정(별표) 목록
  const shareIds = ((shares ?? []) as PoolShare[]).map(s => s.id)
  const { data: pickRows } = shareIds.length
    ? await supabase.from('pool_share_picks').select('share_id, pool_id, category').in('share_id', shareIds).order('created_at')
    : { data: [] }
  const poolById = new Map(((pool ?? []) as JudgePoolEntry[]).map(p => [p.id, p]))
  const picks: Record<string, { name: string; affiliation: string | null; category: string | null }[]> = {}
  for (const r of (pickRows ?? []) as { share_id: string; pool_id: string; category: string | null }[]) {
    const p = poolById.get(r.pool_id)
    if (p) (picks[r.share_id] ??= []).push({ name: p.name, affiliation: p.affiliation, category: r.category || p.category })
  }
  for (const l of Object.values(picks)) l.sort((x, y) => (x.category ?? '99').localeCompare(y.category ?? '99'))
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
      <div className="mb-5 grid gap-5">
        <PoolShares programId={params.id} programTitle={program?.title ?? ''} shares={(shares ?? []) as PoolShare[]} picks={picks}
          poolCount={((pool ?? []) as JudgePoolEntry[]).filter(p => memberIds.has(p.id) && p.shareable !== false && p.resume_path).length} />
        <JudgeRequests programId={params.id} open={!!program?.judge_signup_open} requests={(requests ?? []) as JudgeRequest[]} />
      </div>
      <JudgesManager programId={params.id} judges={rows} templates={(templates ?? []) as ConsentTemplate[]} pool={(pool ?? []) as JudgePoolEntry[]} />
    </>
  )
}
