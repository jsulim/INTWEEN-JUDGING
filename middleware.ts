import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { EVENT_HOSTS } from '@/lib/events/hosts'

const PROTECTED = ['/c', '/j', '/a', '/me', '/invite', '/mfa', '/home']

// 대회 전용 하위 도메인(예: uljin-ideathon.sasurae.kr)
//  · /  → 해당 대회 소개 페이지(/<slug>)
//  · 그 밖의 경로(로그인·심사·관리자) → 같은 주소에서 플랫폼을 그대로 쓴다 (심사위원이 대회 주소 하나만 기억하면 되도록)
function eventHost(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0] ?? ''
  const slug = EVENT_HOSTS[host]
  if (!slug || request.nextUrl.pathname !== '/') return null
  const url = request.nextUrl.clone()
  url.pathname = `/${slug}`
  return NextResponse.rewrite(url)
}

export async function middleware(request: NextRequest) {
  const event = eventHost(request)
  if (event) return event
  const { response, user } = await updateSession(request)
  const path = request.nextUrl.pathname
  const isProtected = PROTECTED.some(p => path === p || path.startsWith(p + '/'))
  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(path)}`
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|pdf.worker.min.mjs|api/cron|api/webhooks).*)'],
}
