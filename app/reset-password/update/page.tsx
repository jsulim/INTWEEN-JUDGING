'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import AuthFrame from '@/components/AuthFrame'
import { Alert, Button, Field, Input } from '@/components/ui'
import { passwordProblem } from '@/lib/password'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(pw, pw2)
    if (problem) return setError(problem)
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw })
    if (error) return setError('링크가 만료되었습니다. 재설정 메일을 다시 요청해 주세요.')
    router.replace('/home')
  }

  return (
    <AuthFrame title="새 비밀번호 설정">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="새 비밀번호" hint="8자 이상, 영문·숫자 포함"><Input type="password" value={pw} onChange={e => setPw(e.target.value)} required /></Field>
        <Field label="비밀번호 확인"><Input type="password" value={pw2} onChange={e => setPw2(e.target.value)} required /></Field>
        <Button type="submit" size="lg" className="w-full">변경</Button>
      </form>
    </AuthFrame>
  )
}
