'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Alert, Button, Field, Input } from '@/components/ui'

export function SignOutLink({ to }: { to: string }) {
  const router = useRouter()
  return (
    <button type="button" className="text-sm text-muted hover:text-fg"
      onClick={async () => { await supabaseBrowser().auth.signOut(); router.replace(to); router.refresh() }}>
      다른 계정으로 신청하기 (로그아웃)
    </button>
  )
}

export default function ApplyForm({ programId, initial }: {
  programId: string
  initial: { name: string; phone: string; org: string; expertise: string }
}) {
  const router = useRouter()
  const [f, setF] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/api/join', { body: { program_id: programId, ...f } })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '신청하지 못했습니다.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="이름" required><Input required maxLength={50} value={f.name} onChange={set('name')} /></Field>
      <Field label="연락처" required hint="현장 안내용"><Input required type="tel" placeholder="010-0000-0000" value={f.phone} onChange={set('phone')} /></Field>
      <Field label="소속·직위"><Input maxLength={100} value={f.org} onChange={set('org')} placeholder="예: OO대학교 교수" /></Field>
      <Field label="전문 분야"><Input maxLength={200} value={f.expertise} onChange={set('expertise')} placeholder="예: 식품, 관광, 창업 투자" /></Field>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? '신청 중…' : '심사위원 신청'}</Button>
    </form>
  )
}
