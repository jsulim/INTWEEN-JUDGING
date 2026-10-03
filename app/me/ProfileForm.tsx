'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Alert, Button, Card, Field, Input } from '@/components/ui'
import { passwordProblem } from '@/lib/password'
import type { Profile } from '@/lib/types'

export default function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
  const router = useRouter()
  const [form, setForm] = useState({ name: profile.name, phone: profile.phone ?? '', org: profile.org ?? '' })
  const [msg, setMsg] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null)
  const [pw, setPw] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabaseBrowser().from('profiles').update(form).eq('id', profile.id)
    setMsg(error ? { tone: 'danger', text: '저장하지 못했습니다.' } : { tone: 'accent', text: '저장됨' })
    router.refresh()
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault()
    const p = passwordProblem(pw)
    if (p) return setMsg({ tone: 'danger', text: p })
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw })
    setMsg(error ? { tone: 'danger', text: '비밀번호를 변경하지 못했습니다.' } : { tone: 'accent', text: '비밀번호 변경됨' })
    setPw('')
  }

  return (
    <div className="grid max-w-3xl gap-6">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card title="기본 정보">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="이메일"><Input value={email} disabled /></Field>
          <Field label="이름" required><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="연락처"><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" /></Field>
          <Field label="소속"><Input value={form.org} onChange={e => setForm({ ...form, org: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Button type="submit">저장</Button></div>
        </form>
      </Card>
      <Card title="비밀번호 변경">
        <form onSubmit={changePw} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1"><Field label="새 비밀번호" hint="8자 이상, 영문·숫자 포함"><Input type="password" value={pw} onChange={e => setPw(e.target.value)} /></Field></div>
          <Button type="submit" variant="outline">변경</Button>
        </form>
      </Card>
    </div>
  )
}
