import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { EVENT_HOSTS } from '@/lib/events/hosts'

const PROTECTED = ['/c', '/j', '/a', '/me', '/invite', '/mfa', '/home']

// 대회 전용 하위 도메인(예: uljin-ideathon.sasurae.kr)
//  · /            → 해당 대회 소개 페이지(/<slug>)를 보여준다
//  · 로그인·심사 등 나머지 화면 → 플랫폼 본체 주소(NEXT_PUBLIC_SITE_URL)로 보낸다 (로그인은 본체 한 곳에서만)
function eventHost(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0] ?? ''
  const slug = EVENT_HOSTS[host]
  if (!slug) return null
  const url = request.nextUrl.clone()
  const path = url.pathname
  if (path === '/') {
    url.pathname = `/${slug}`
    return NextResponse.rewrite(url)
  }
  if (path === `/${slug}` || path.startsWith(`/events/${slug}/`)) return NextResponse.next()
  const app = process.env.NEXT_PUBLIC_SITE_URL
  if (app && new URL(app).host !== host) return NextResponse.redirect(new URL(path + url.search, app))
  return null
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
