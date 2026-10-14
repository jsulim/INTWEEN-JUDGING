import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { JudgePoolEntry, PoolShare } from '@/lib/types'

// 기관 검토용 공유 링크 확인 (서비스 롤). 끈 링크·만료된 링크는 null.
export async function loadShare(token: string): Promise<PoolShare | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  const { data } = await supabaseAdmin().from('pool_shares').select('*').eq('token', token).maybeSingle()
  const s = data as PoolShare | null
  if (!s || s.revoked_at) return null
  if (s.expires_at && new Date(s.expires_at) < new Date()) return null
  return s
}

/** 공유 대상 심사위원 (연락처 등 내부 정보는 빼고 반환) */
export async function shareEntries(s: PoolShare) {
  let q = supabaseAdmin().from('judge_pool').select('id, name, affiliation, position, category, expertise, career, resume_path, docs, source, profile')
    .eq('shareable', true).order('category').order('name')
  if (s.categories?.length) q = q.in('category', s.categories)
  // 대회 링크면 그 대회 후보만
  if (s.program_id) {
    const { data: m } = await supabaseAdmin().from('pool_members').select('pool_id').eq('program_id', s.program_id)
    const ids = (m ?? []).map(x => x.pool_id as string)
    if (!ids.length) return []
    q = q.in('id', ids)
  }
  const { data } = await q
  return ((data ?? []) as Pick<JudgePoolEntry, 'id' | 'name' | 'affiliation' | 'position' | 'category' | 'expertise' | 'career' | 'resume_path' | 'docs' | 'source' | 'profile'>[])
}
