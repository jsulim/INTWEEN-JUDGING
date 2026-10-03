'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Badge, Button, Card, Field, Input, Table } from '@/components/ui'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import type { MyPayment } from '@/app/api/payments/me/load'

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

const CONSENT_TEXT = `[수당 지급을 위한 개인정보 수집·이용 동의 (별도 동의)]
· 수집 항목: 은행명, 계좌번호, 예금주, 주민등록번호
· 이용 목적: 심사 수당 지급 및 소득세 원천징수·지급명세서 제출
· 근거: 소득세법 제145조, 제164조 등 (주민등록번호 처리 근거)
· 보유 기간: 프로그램 종료 후 관계 법령에 따른 보존 기간까지, 이후 지체 없이 파기
· 동의를 거부할 수 있으며, 거부 시 수당 지급이 제한될 수 있습니다.`

export default function PaymentForm({ item }: { item: MyPayment }) {
  const router = useRouter()
  const s = item.saved
  const [form, setForm] = useState({ bank_name: s?.bank_name ?? '', holder: s?.holder ?? '', account: '', rrn: '' })
  const [consent, setConsent] = useState(!!s?.consent_at)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!consent) return setMsg({ tone: 'danger', text: '개인정보 수집·이용에 동의해야 저장할 수 있습니다.' })
    setBusy(true)
    setMsg(null)
    try {
      await api('/api/payments/me', {
        body: {
          judge_id: item.judge_id,
          consent: true,
          bank_name: form.bank_name,
          holder: form.holder,
          account: form.account || undefined,
          rrn: form.rrn || undefined,
        },
      })
      setForm(f => ({ ...f, account: '', rrn: '' }))
      setMsg({ tone: 'accent', text: '저장됨' })
      router.refresh()
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : '저장하지 못했습니다.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={item.program_title}
      actions={s?.paid_at ? <Badge tone="accent">지급 완료</Badge> : s ? <Badge tone="primary">입력 완료</Badge> : <Badge tone="highlight">미입력</Badge>}>
      <form onSubmit={save} className="grid gap-5" autoComplete="off">
        <div>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-bg px-4 py-3 font-sans text-sm">{CONSENT_TEXT}</pre>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={!!s?.consent_at}
              className="h-4 w-4 accent-[rgb(var(--primary))]" />
            위 내용에 동의합니다 (필수)
            {s?.consent_at && <span className="tabular font-normal text-muted">· {fmtDate(s.consent_at)} 동의</span>}
          </label>
        </div>

        <fieldset disabled={!consent} className="grid gap-4 disabled:opacity-50 sm:grid-cols-2">
          <Field label="은행" required><Input value={form.bank_name} onChange={set('bank_name')} placeholder="예: 국민은행" required /></Field>
          <Field label="예금주" required><Input value={form.holder} onChange={set('holder')} required /></Field>
          <Field label="계좌번호" required={!s?.account_masked}
            hint={s?.account_masked ? <>등록됨 <span className="tabular">{s.account_masked}</span> · 변경할 때만 입력</> : '숫자만 입력'}>
            <Input value={form.account} onChange={set('account')} inputMode="numeric" placeholder={s?.account_masked ?? ''} required={!s?.account_masked} />
          </Field>
          <Field label="주민등록번호" required={!s?.rrn_masked}
            hint={s?.rrn_masked ? <>등록됨 <span className="tabular">{s.rrn_masked}</span> · 변경할 때만 입력</> : '원천징수 신고용 · 13자리'}>
            <Input type="password" value={form.rrn} onChange={set('rrn')} inputMode="numeric" maxLength={14}
              placeholder={s?.rrn_masked ?? '000000-0000000'} required={!s?.rrn_masked} />
          </Field>
        </fieldset>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="flex justify-end"><Button type="submit" disabled={busy || !consent}>{busy ? '저장 중…' : '저장'}</Button></div>
      </form>

      <div className="mt-6">
        <h3 className="mb-2 font-bold">지급 내역</h3>
        {!s || (s.amount === 0 && !s.paid_at) ? (
          <p className="text-sm text-muted">산정된 수당이 없습니다.{item.payment_per_session > 0 && ` (1회 ${won(item.payment_per_session)})`}</p>
        ) : (
          <Table>
            <thead><tr><th className="text-right">회차</th><th className="text-right">지급액</th><th className="text-right">원천징수</th><th className="text-right">실지급액</th><th>지급일</th></tr></thead>
            <tbody>
              <tr>
                <td className="tabular text-right">{s.sessions}</td>
                <td className="tabular text-right">{won(s.amount)}</td>
                <td className="tabular text-right">{won(s.tax)}</td>
                <td className="tabular text-right font-bold">{won(s.amount - s.tax)}</td>
                <td className="tabular">{s.paid_at ? fmtDate(s.paid_at, false) : <Badge tone="highlight">지급 예정</Badge>}</td>
              </tr>
            </tbody>
          </Table>
        )}
      </div>
    </Card>
  )
}
