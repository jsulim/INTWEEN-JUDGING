'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import AuthFrame from '@/components/AuthFrame'
import { Alert, Button, Field, Input } from '@/components/ui'
import { passwordProblem } from '@/lib/password'

// P-02 초대 수락·비밀번호 설정 (초대 링크 → /auth/confirm → 이 화면)
export default function InvitePage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(pw, pw2)
    if (problem) return setError(problem)
    setBusy(true)
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw })
    if (error) {
      setBusy(false)
      return setError('비밀번호를 설정하지 못했습니다. 링크를 다시 요청해 주세요.')
    }
    router.replace('/home')
    router.refresh()
  }

  return (
    <AuthFrame title="비밀번호 설정" subtitle={email ? `${email} 계정의 비밀번호를 설정합니다.` : '초대받은 계정의 비밀번호를 설정합니다.'}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="새 비밀번호" hint="8자 이상, 영문·숫자 포함"><Input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} required /></Field>
        <Field label="비밀번호 확인"><Input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} required /></Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>설정하고 시작하기</Button>
      </form>
    </AuthFrame>
  )
}
