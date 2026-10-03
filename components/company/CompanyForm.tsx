'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Alert, Button, Card, Field, Input } from '@/components/ui'
import type { Company } from '@/lib/types'

type Member = { name: string; role: string }

function formatBizNo(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function CompanyForm({ company, programTitle }: { company: Company; programTitle: string | null }) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: company.name,
    biz_no: company.biz_no ?? '',
    ceo: company.ceo ?? '',
    field: company.field ?? '',
    contact_email: company.contact_email ?? '',
  })
  const [members, setMembers] = useState<Member[]>(
    (company.members ?? []).map(m => ({ name: m?.name ?? '', role: m?.role ?? '' })),
  )
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: k === 'biz_no' ? formatBizNo(e.target.value) : e.target.value }))

  function setMember(i: number, patch: Partial<Member>) {
    setMembers(ms => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!form.name.trim()) return setMsg({ tone: 'danger', text: '기업명을 입력해 주세요.' })
    if (form.biz_no && form.biz_no.replace(/\D/g, '').length !== 10) {
      return setMsg({ tone: 'danger', text: '사업자등록번호 10자리를 입력해 주세요.' })
    }
    if (form.contact_email && !EMAIL_RE.test(form.contact_email.trim())) {
      return setMsg({ tone: 'danger', text: '이메일 형식이 올바르지 않습니다.' })
    }
    setBusy(true)
    const payload = {
      name: form.name.trim(),
      biz_no: form.biz_no || null,
      ceo: form.ceo.trim() || null,
      field: form.field.trim() || null,
      contact_email: form.contact_email.trim() || null,
      members: members
        .map(m => ({ name: m.name.trim(), role: m.role.trim() }))
        .filter(m => m.name)
        .map(m => (m.role ? { name: m.name, role: m.role } : { name: m.name })) as Company['members'],
    }
    const { error } = await supabaseBrowser().from('companies').update(payload).eq('id', company.id)
    setBusy(false)
    if (error) {
      setMsg({ tone: 'danger', text: error.code === '42501' ? '수정할 수 없는 항목이 포함되어 있습니다.' : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' })
      return
    }
    setMembers(payload.members.map(m => ({ name: m.name, role: m.role ?? '' })))
    setMsg({ tone: 'accent', text: '저장됨' })
    router.refresh()
  }

  return (
    <Card title={programTitle ? `${programTitle}` : '기본 정보'}>
      <form onSubmit={save} className="grid gap-5">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="기업명" required><Input value={form.name} onChange={set('name')} required maxLength={100} /></Field>
          <Field label="사업자등록번호" hint="숫자 10자리">
            <Input value={form.biz_no} onChange={set('biz_no')} inputMode="numeric" placeholder="000-00-00000" className="tabular" />
          </Field>
          <Field label="대표자"><Input value={form.ceo} onChange={set('ceo')} maxLength={50} /></Field>
          <Field label="분야" hint="예: AI·데이터, 헬스케어, 제조"><Input value={form.field} onChange={set('field')} maxLength={100} /></Field>
          <div className="sm:col-span-2">
            <Field label="담당자 이메일" hint="제출 확인·보완 요청 안내가 이 주소로 발송됩니다.">
              <Input type="email" value={form.contact_email} onChange={set('contact_email')} placeholder="contact@company.com" />
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">팀원 <span className="tabular font-normal text-muted">{members.filter(m => m.name.trim()).length}명</span></span>
            <Button type="button" size="sm" variant="outline" onClick={() => setMembers(ms => [...ms, { name: '', role: '' }])}>+ 팀원 추가</Button>
          </div>
          {members.length ? (
            <ul className="grid gap-2">
              {members.map((m, i) => (
                <li key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input value={m.name} onChange={e => setMember(i, { name: e.target.value })} placeholder="이름" aria-label={`팀원 ${i + 1} 이름`} maxLength={50} />
                  <Input value={m.role} onChange={e => setMember(i, { role: e.target.value })} placeholder="역할 (예: CTO)" aria-label={`팀원 ${i + 1} 역할`} maxLength={50} />
                  <Button type="button" variant="ghost" onClick={() => setMembers(ms => ms.filter((_, j) => j !== i))} aria-label={`팀원 ${i + 1} 삭제`}>삭제</Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-sm text-muted">등록된 팀원이 없습니다.</p>
          )}
        </div>

        <div>
          <Button type="submit" disabled={busy}>{busy ? '저장 중…' : '저장'}</Button>
        </div>
      </form>
    </Card>
  )
}
