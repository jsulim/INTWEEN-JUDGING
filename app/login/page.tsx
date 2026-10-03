'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Alert, Button, Field, Input } from '@/components/ui'
import AuthFrame from '@/components/AuthFrame'

// P-01 로그인: 이메일+비밀번호, 역할에 따라 각 홈으로 리다이렉트
function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reason = params.get('reason')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const supabase = supabaseBrowser()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setBusy(false)
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      return
    }
    await supabase.rpc('log_event', { p_action: 'login', p_meta: { ua: navigator.userAgent } })
    const next = params.get('next')
    router.replace(next && next.startsWith('/') ? next : '/home')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {reason === 'idle' && <Alert tone="highlight">30분 동안 동작이 없어 자동 로그아웃되었습니다.</Alert>}
      {params.get('error') === 'no_profile' && <Alert tone="danger">계정 권한 정보가 없습니다. 운영 사무국에 문의해 주세요.</Alert>}
      {params.get('error') === 'link' && <Alert tone="danger">링크가 만료되었거나 올바르지 않습니다.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="이메일"><Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
      <Field label="비밀번호"><Input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
      <Button type="submit" className="w-full" size="lg" disabled={busy}>{busy ? '확인 중…' : '로그인'}</Button>
      <div className="text-center text-sm">
        <Link href="/reset-password" className="text-muted hover:text-fg">비밀번호를 잊으셨나요?</Link>
      </div>
    </form>
  )
}

export default function LoginPage() {
  return (
    <AuthFrame title="로그인" subtitle="초대 메일로 받은 계정으로 로그인하세요.">
      <Suspense><LoginForm /></Suspense>
    </AuthFrame>
  )
}
