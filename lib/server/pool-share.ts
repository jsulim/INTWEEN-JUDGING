import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/server'
import { allCategories } from '@/lib/pool'
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
  // 대회 링크면 그 대회 후보만
  let ids: string[] | null = null
  if (s.program_id) {
    const { data: m } = await supabaseAdmin().from('pool_members').select('pool_id').eq('program_id', s.program_id)
    ids = (m ?? []).map(x => x.pool_id as string)
    if (!ids.length) return []
  }
  const query = (cols: string) => {
    const q = supabaseAdmin().from('judge_pool').select(cols).eq('shareable', true).order('category').order('name')
    return ids ? q.in('id', ids) : q
  }
  const COLS = 'id, name, affiliation, position, category, expertise, career, resume_path, docs, source, profile'
  let { data, error } = await query(`${COLS}, extra_categories`)
  if (error) ({ data } = await query(COLS)) // 추가 분야 컬럼 마이그레이션 전
  return ((data ?? []) as unknown as Pick<JudgePoolEntry, 'id' | 'name' | 'affiliation' | 'position' | 'category' | 'extra_categories' | 'expertise' | 'career' | 'resume_path' | 'docs' | 'source' | 'profile'>[])
    .filter(e => !s.categories?.length || allCategories(e).some(c => s.categories!.includes(c)))
}

/** 이 링크에서 별표로 고른 심사위원 id (테이블이 아직 없으면 빈 목록) */
export async function sharePicks(shareId: string): Promise<string[]> {
  const { data } = await supabaseAdmin().from('pool_share_picks').select('pool_id').eq('share_id', shareId).order('created_at')
  return (data ?? []).map(x => x.pool_id as string)
}
