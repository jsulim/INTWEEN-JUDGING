'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { cn } from '@/components/ui'

export interface NavItem { href: string; label: string; exact?: boolean }

const IDLE_MS = 30 * 60 * 1000 // 30분 무동작 시 자동 로그아웃 (4-1 보안)

export function useLogout() {
  const router = useRouter()
  return async (reason?: string) => {
    await supabaseBrowser().auth.signOut()
    router.replace(reason ? `/login?reason=${reason}` : '/login')
    router.refresh()
  }
}

function IdleLogout() {
  const logout = useLogout()
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    const reset = () => {
      clearTimeout(timer.current)
      try { localStorage.setItem('intween:lastActive', String(Date.now())) } catch {}
      timer.current = setTimeout(() => logout('idle'), IDLE_MS)
    }
    // 다른 탭에서의 활동도 반영
    const onStorage = (e: StorageEvent) => { if (e.key === 'intween:lastActive') reset() }
    const events = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    window.addEventListener('storage', onStorage)
    reset()
    return () => {
      clearTimeout(timer.current)
      events.forEach(e => window.removeEventListener(e, reset))
      window.removeEventListener('storage', onStorage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export default function AppShell({ area, nav, userName, children, wide }:
  { area: string; nav: NavItem[]; userName: string; children: ReactNode; wide?: boolean }) {
  const pathname = usePathname()
  const logout = useLogout()
  const [open, setOpen] = useState(false)
  const active = (n: NavItem) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + '/'))
  return (
    <div className="min-h-screen">
      <IdleLogout />
      <header className="sticky top-0 z-30 bg-primary text-primary-fg print:hidden">
        <div className={cn('mx-auto flex h-14 items-center gap-4 px-4', wide ? 'max-w-[1600px]' : 'max-w-7xl')}>
          <Link href="/home" className="flex shrink-0 items-center gap-2">
            <span className="text-lg font-black tracking-tight">INTWEEN</span>
            <span className="hidden text-sm text-white/70 sm:inline">심사 관리 · {area}</span>
          </Link>
          <nav className="hidden flex-1 gap-1 overflow-x-auto md:flex">
            {nav.map(n => (
              <Link key={n.href} href={n.href}
                className={cn('rounded-md px-3 py-1.5 text-sm font-semibold whitespace-nowrap', active(n) ? 'bg-white/20' : 'text-white/75 hover:bg-white/10')}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Link href="/me" className="hidden text-white/80 hover:text-white sm:inline">{userName}</Link>
            <button onClick={() => logout()} className="rounded-md px-2 py-1 text-white/70 hover:bg-white/10">로그아웃</button>
            <button onClick={() => setOpen(o => !o)} className="rounded-md px-2 py-1 md:hidden" aria-label="메뉴">☰</button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-white/10 px-4 py-2 md:hidden">
            {nav.map(n => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                className={cn('block rounded-md px-3 py-2 text-sm font-semibold', active(n) ? 'bg-white/20' : 'text-white/80')}>
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className={cn('mx-auto px-4 py-6', wide ? 'max-w-[1600px]' : 'max-w-7xl')}>{children}</main>
    </div>
  )
}
