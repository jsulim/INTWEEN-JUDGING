import 'server-only'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import type { Profile, Role } from '@/lib/types'

export const HOME: Record<Role, string> = { company: '/c', judge: '/j', admin: '/a' }

/** 현재 로그인 사용자와 프로필 (없으면 null) */
export async function getSession() {
  const supabase = supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null as Profile | null }
  const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle()
  return { supabase, user, profile: (profile as Profile | null) ?? null }
}

/** 페이지·레이아웃용: 역할이 맞지 않으면 로그인 또는 본인 홈으로 보낸다 */
export async function requireRole(role: Role | Role[]) {
  const s = await getSession()
  if (!s.user) redirect('/login')
  if (!s.profile) redirect('/login?error=no_profile')
  const roles = Array.isArray(role) ? role : [role]
  if (!roles.includes(s.profile.role)) redirect(HOME[s.profile.role])
  return { supabase: s.supabase, user: s.user, profile: s.profile }
}

export function mfaRequired() {
  return process.env.REQUIRE_ADMIN_MFA !== 'false'
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Route Handler용: 권한 없으면 ApiError 를 던진다. handle() 로 감싸 응답으로 변환 */
export async function requireApi(role: Role | Role[]) {
  const s = await getSession()
  if (!s.user || !s.profile) throw new ApiError(401, '로그인이 필요합니다.')
  const roles = Array.isArray(role) ? role : [role]
  if (!roles.includes(s.profile.role)) throw new ApiError(403, '권한이 없습니다.')
  if (s.profile.role === 'admin' && mfaRequired()) {
    const { data } = await s.supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (data?.currentLevel !== 'aal2') throw new ApiError(403, '관리자 2단계 인증이 필요합니다.')
  }
  return { supabase: s.supabase, user: s.user, profile: s.profile }
}

/** Route Handler 공통 에러 처리 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args)
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status })
      console.error(e)
      return NextResponse.json({ error: e instanceof Error ? e.message : '서버 오류' }, { status: 500 })
    }
  }
}

export function clientIp(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
}
