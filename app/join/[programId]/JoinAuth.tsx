'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Alert, Button, Field, Input } from '@/components/ui'

// 심사위원 가입 1단계: Google 또는 이메일로 계정 만들기·로그인 → 신청서(/join/<id>/apply)
export default function JoinAuth({ programId }: { programId: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const next = `/join/${programId}/apply`
  const callback = () => `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`

  async function google() {
    setError(null)
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback() } })
    if (error) setError('Google 로그인을 시작하지 못했습니다. 이메일로 가입해 주세요.')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const sb = supabaseBrowser()
    if (mode === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      setBusy(false)
      if (error) return setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      router.replace(next)
      return
    }
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: callback() } })
    setBusy(false)
    if (error) {
      return setError(/registered|exists/i.test(error.message)
        ? '이미 가입된 이메일입니다. 「로그인」을 눌러 주세요.'
        : error.message.includes('Password') ? '비밀번호는 8자 이상으로 정해 주세요.'
        : /rate limit|too many/i.test(error.message) ? '가입 요청이 많아 잠시 막혔습니다. 1시간쯤 뒤에 다시 시도하거나 운영사무국에 문의해 주세요.'
        : '가입하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    }
    if (data.session) router.replace(next)
    else setSent(true) // 이메일 확인을 켜 둔 경우: 메일 링크 → 신청서
  }

  if (sent) {
    return <Alert tone="accent">{email} 로 확인 메일을 보냈습니다. 메일의 링크를 누르면 신청서 화면으로 이어집니다.</Alert>
  }

  return (
    <div className="grid gap-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="button" variant="outline" size="lg" className="w-full gap-2" onClick={google}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Google 계정으로 계속
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />또는 이메일로<span className="h-px flex-1 bg-line" /></div>
      <form onSubmit={submit} className="grid gap-3">
        <Field label="이메일"><Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="비밀번호" hint={mode === 'signup' ? '8자 이상' : undefined}>
          <Input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined}
            required value={password} onChange={e => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {busy ? '확인 중…' : mode === 'signup' ? '가입하고 계속' : '로그인하고 계속'}
        </Button>
      </form>
      <button type="button" className="text-center text-sm text-muted hover:text-fg" onClick={() => { setMode(m => (m === 'signup' ? 'login' : 'signup')); setError(null) }}>
        {mode === 'signup' ? '이미 계정이 있으신가요? 로그인' : '처음이신가요? 이메일로 가입'}
      </button>
    </div>
  )
}
