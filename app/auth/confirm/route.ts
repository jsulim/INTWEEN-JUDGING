import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabaseServer } from '@/lib/supabase/server'

// 초대·비밀번호 재설정 메일 링크 처리.
// Supabase 메일 템플릿 링크: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/invite
export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/home'
  const supabase = supabaseServer()
  let ok = false
  if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  const dest = url.clone()
  dest.search = ''
  dest.pathname = ok && next.startsWith('/') ? next : '/login'
  if (!ok) dest.search = '?error=link'
  return NextResponse.redirect(dest)
}
