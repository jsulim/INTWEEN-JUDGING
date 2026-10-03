'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import { Alert, Badge, Button, Input, Stat, Table, cn } from '@/components/ui'
import { ConfirmDialog, DownloadLink } from './ui'
import { TAX_RULE_TEXT, calcPayment, won } from './payroll'

export interface PaymentRow {
  judge_id: string
  name: string
  affiliation: string | null
  email: string | null
  payment: {
    id: string; bank_name: string | null; holder: string | null; has_account: boolean; has_rrn: boolean
    consent_at: string | null; sessions: number; amount: number; tax: number; paid_at: string | null
  } | null
}

const MASK_RRN = '******-*******'
const MASK_ACC = '••••••••••'
const REVEAL_MS = 30_000

export default function PaymentsManager({ programId, perSession, canPay, rows }: { programId: string; perSession: number; canPay: boolean; rows: PaymentRow[] }) {
  const router = useRouter()
  const sb = supabaseBrowser()
  const [msg, setMsg] = useState<{ tone: 'accent' | 'danger' | 'highlight'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [sessions, setSessions] = useState<Record<string, string>>(() => Object.fromEntries(rows.filter(r => r.payment).map(r => [r.payment!.id, String(r.payment!.sessions)])))
  useEffect(() => { setSessions(Object.fromEntries(rows.filter(r => r.payment).map(r => [r.payment!.id, String(r.payment!.sessions)]))) }, [rows])
  const [revealed, setRevealed] = useState<Record<string, { account: string | null; rrn: string | null; until: number }>>({})
  const [paying, setPaying] = useState<PaymentRow | null>(null)

  // 30초 후 자동 가림
  useEffect(() => {
    const ids = Object.keys(revealed)
    if (!ids.length) return
    const t = setInterval(() => {
      const now = Date.now()
      setRevealed(r => Object.fromEntries(Object.entries(r).filter(([, v]) => v.until > now)))
    }, 1000)
    return () => clearInterval(t)
  }, [revealed])

  async function update(id: string, patch: Record<string, unknown>) {
    const { data, error } = await sb.from('judge_payments').update(patch).eq('id', id).select('id')
    if (error || !data?.length) throw new Error('저장하지 못했습니다. 정산 권한을 확인해 주세요.')
  }

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    try { await fn(); setMsg({ tone: 'accent', text: ok }); router.refresh() }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof Error ? e.message : '처리하지 못했습니다.' }) }
    finally { setBusy(false) }
  }

  const saveRow = (r: PaymentRow) => run(async () => {
    const n = Math.max(0, Math.floor(Number(sessions[r.payment!.id]) || 0))
    const c = calcPayment(n, perSession)
    await update(r.payment!.id, { sessions: n, amount: c.amount, tax: c.tax })
  }, `${r.name} 수당 산정됨`)

  const recalcAll = () => run(async () => {
    for (const r of rows) {
      if (!r.payment || r.payment.paid_at) continue
      const n = Math.max(0, Math.floor(Number(sessions[r.payment.id]) || 0))
      const c = calcPayment(n, perSession)
      await update(r.payment.id, { sessions: n, amount: c.amount, tax: c.tax })
    }
  }, '미지급 심사위원 수당을 다시 산정했습니다.')

  const togglePaid = (r: PaymentRow) => run(async () => {
    await update(r.payment!.id, { paid_at: r.payment!.paid_at ? null : new Date().toISOString() })
    setPaying(null)
  }, r.payment!.paid_at ? `${r.name} 지급 취소` : `${r.name} 지급 완료 처리`)

  async function reveal(r: PaymentRow) {
    try {
      const d = await api<{ account: string | null; rrn: string | null }>(`/api/payments/${r.payment!.id}/reveal`, { method: 'POST', body: {} })
      setRevealed(x => ({ ...x, [r.payment!.id]: { ...d, until: Date.now() + REVEAL_MS } }))
      setMsg({ tone: 'highlight', text: `${r.name} 개인정보 열람 — 열람 기록이 감사로그에 남았습니다. 30초 후 자동으로 가려집니다.` })
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : '열람하지 못했습니다.' })
    }
  }

  const withPay = rows.filter(r => r.payment)
  const total = withPay.reduce((a, r) => ({ amount: a.amount + r.payment!.amount, tax: a.tax + r.payment!.tax, paid: a.paid + (r.payment!.paid_at ? 1 : 0) }), { amount: 0, tax: 0, paid: 0 })

  return (
    <div className="grid gap-5">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="1회 수당" value={won(perSession)} hint="프로그램 설정값" />
        <Stat label="정보 등록" value={`${withPay.length}/${rows.length}`} hint="심사위원 입력 기준" />
        <Stat label="지급 총액 / 원천징수" value={won(total.amount)} hint={`원천징수 ${won(total.tax)} · 실지급 ${won(total.amount - total.tax)}`} />
        <Stat label="지급 완료" value={`${total.paid}/${withPay.length}`} tone={total.paid === withPay.length && withPay.length > 0 ? 'accent' : undefined} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-card px-5 py-3 text-sm">
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            {canPay ? <Badge tone="accent">정산 권한자</Badge> : <Badge>열람 전용</Badge>}
            <span className="text-muted">{canPay ? '수당 산정·지급 처리·개인정보 복호화 가능 (열람 시 감사로그 기록)' : '계좌·주민등록번호는 마스킹됩니다. 수정·복호화는 정산 권한자만 가능합니다.'}</span>
          </div>
          <div className="text-xs text-muted">{TAX_RULE_TEXT}</div>
        </div>
        <div className="flex gap-2">
          {canPay && <Button size="sm" variant="outline" onClick={recalcAll} disabled={busy || !withPay.length}>미지급분 일괄 산정</Button>}
          <DownloadLink href={`/api/payments/export?program_id=${programId}`} variant="primary">지급·원천징수 명세 엑셀</DownloadLink>
        </div>
      </div>

      {perSession <= 0 && <Alert tone="highlight">프로그램의 1회 수당이 0원입니다. 프로그램 설정에서 수당을 먼저 입력하세요.</Alert>}

      <Table>
        <thead>
          <tr>
            <th>심사위원</th><th>계좌</th><th>주민등록번호</th><th>동의</th>
            <th className="text-right">횟수</th><th className="text-right">지급액</th><th className="text-right">원천징수</th><th className="text-right">실지급</th>
            <th>지급</th><th />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const p = r.payment
            if (!p) {
              return (
                <tr key={r.judge_id} className="text-muted">
                  <td><div className="font-semibold text-fg">{r.name}</div><div className="text-xs">{r.affiliation}</div></td>
                  <td colSpan={9}>지급 정보 미등록 — 심사위원이 &lsquo;수당 지급 정보&rsquo;에서 입력해야 합니다.</td>
                </tr>
              )
            }
            const rv = revealed[p.id]
            const n = Math.max(0, Math.floor(Number(sessions[p.id]) || 0))
            const preview = calcPayment(n, perSession)
            const changed = n !== p.sessions || preview.amount !== p.amount || preview.tax !== p.tax
            return (
              <tr key={r.judge_id} className={cn(p.paid_at && 'bg-accent/5')}>
                <td><div className="font-semibold">{r.name}</div><div className="text-xs text-muted">{r.affiliation}</div></td>
                <td className="whitespace-nowrap text-sm">
                  <div>{p.bank_name ?? '-'} {p.holder && <span className="text-muted">· {p.holder}</span>}</div>
                  <div className="tabular text-xs">{p.has_account ? (rv ? <b>{rv.account}</b> : MASK_ACC) : <span className="text-muted">미입력</span>}</div>
                </td>
                <td className="tabular whitespace-nowrap text-sm">{p.has_rrn ? (rv ? <b>{rv.rrn}</b> : MASK_RRN) : <span className="text-muted">미입력</span>}</td>
                <td>{p.consent_at ? <Badge tone="accent">동의</Badge> : <Badge tone="highlight">미동의</Badge>}</td>
                <td className="text-right">
                  {canPay && !p.paid_at
                    ? <Input type="number" min={0} className="ml-auto h-8 w-16 text-right text-sm" value={sessions[p.id] ?? ''} onChange={e => setSessions(s => ({ ...s, [p.id]: e.target.value }))} />
                    : <span className="tabular">{p.sessions}</span>}
                </td>
                <td className="tabular text-right">{won(changed && canPay ? preview.amount : p.amount)}</td>
                <td className="tabular text-right">{won(changed && canPay ? preview.tax : p.tax)}</td>
                <td className="tabular text-right font-semibold">{won((changed && canPay ? preview.net : p.amount - p.tax))}</td>
                <td className="whitespace-nowrap">
                  {p.paid_at ? <Badge tone="accent">지급 {fmtDate(p.paid_at, false)}</Badge> : <Badge>미지급</Badge>}
                </td>
                <td className="whitespace-nowrap text-right">
                  <div className="flex justify-end gap-1">
                    {canPay && changed && !p.paid_at && <Button size="sm" onClick={() => saveRow(r)} disabled={busy}>산정 저장</Button>}
                    {canPay && !changed && <Button size="sm" variant={p.paid_at ? 'ghost' : 'secondary'} onClick={() => setPaying(r)} disabled={busy || (!p.paid_at && p.amount <= 0)}>{p.paid_at ? '지급 취소' : '지급 처리'}</Button>}
                    {canPay && (p.has_account || p.has_rrn) && !rv && <Button size="sm" variant="outline" onClick={() => reveal(r)}>열람</Button>}
                    {rv && <span className="tabular self-center text-xs text-muted">{Math.max(0, Math.ceil((rv.until - Date.now()) / 1000))}초</span>}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </Table>

      <ConfirmDialog open={!!paying} busy={busy} title={paying?.payment?.paid_at ? '지급 처리를 취소할까요?' : '지급 완료로 처리할까요?'}
        confirmLabel={paying?.payment?.paid_at ? '지급 취소' : '지급 완료'} tone={paying?.payment?.paid_at ? 'danger' : 'primary'}
        onClose={() => setPaying(null)} onConfirm={() => paying && togglePaid(paying)}>
        {paying?.payment && (
          <p className="tabular">{paying.name} · 지급액 {won(paying.payment.amount)} · 원천징수 {won(paying.payment.tax)} · 실지급 {won(paying.payment.amount - paying.payment.tax)}</p>
        )}
      </ConfirmDialog>
    </div>
  )
}
