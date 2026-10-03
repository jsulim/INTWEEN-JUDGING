import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/server/auth'

// J-01 게이트: 동의서 미서명 시 J-02 이하 접근 차단 → /j/consent (Q3)
// (DB에서도 has_signed_all 로 파일 열람·점수 쓰기를 막는다)
export default async function SignedGate({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireRole('judge')
  const { data: judges } = await supabase.from('judges').select('id').eq('user_id', user.id)
  for (const j of judges ?? []) {
    const { data: ok } = await supabase.rpc('has_signed_all', { p_judge_id: j.id })
    if (!ok) redirect('/j/consent')
  }
  return <>{children}</>
}
