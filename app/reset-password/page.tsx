'use client'
import { useState } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase/client'
import AuthFrame from '@/components/AuthFrame'
import { Alert, Button, Field, Input } from '@/components/ui'

// P-03 비밀번호 재설정: 메일 링크 발송
export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password/update`,
    })
    // 계정 존재 여부를 노출하지 않도록 결과와 무관하게 같은 안내
    setSent(true)
    setBusy(false)
  }

  return (
    <AuthFrame title="비밀번호 재설정" subtitle="가입한 이메일로 재설정 링크를 보내드립니다.">
      {sent ? (
        <div className="space-y-4">
          <Alert tone="accent">메일을 발송했습니다. 메일함의 링크를 눌러 새 비밀번호를 설정하세요.</Alert>
          <Link href="/login" className="block text-center text-sm text-muted">로그인으로 돌아가기</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="이메일"><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>재설정 링크 받기</Button>
          <Link href="/login" className="block text-center text-sm text-muted">로그인으로 돌아가기</Link>
        </form>
      )}
    </AuthFrame>
  )
}
