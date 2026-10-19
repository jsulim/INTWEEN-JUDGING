import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { ResultShare } from '@/lib/types'

// 기관 담당자용 결과 열람 링크 확인 (서비스 롤). 끈 링크·만료된 링크는 null.
export async function loadResultShare(token: string): Promise<ResultShare | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  const { data } = await supabaseAdmin().from('result_shares').select('*').eq('token', token).maybeSingle()
  const s = data as ResultShare | null
  if (!s || s.revoked_at) return null
  if (s.expires_at && new Date(s.expires_at) < new Date()) return null
  return s
}
