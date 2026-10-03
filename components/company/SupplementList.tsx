'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import { Alert, Badge, Button, Card } from '@/components/ui'
import { DDayBadge } from '@/components/StatusBadges'
import type { EligibilityCheck } from '@/lib/types'

// 0차 적격 검토 보완 요청 (A-12 → C-06): 기한 내 보완 후 '보완 제출'
export default function SupplementList({ checks }: { checks: EligibilityCheck[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null)
  const now = Date.now()

  async function resolve(c: EligibilityCheck) {
    if (!window.confirm(`'${c.item}' 보완을 제출할까요?\n신청서·증빙을 먼저 수정·저장한 뒤 눌러 주세요.`)) return
    setBusy(c.id)
    setMsg(null)
    try {
      await api('/api/eligibility/resolve', { body: { check_id: c.id } })
      setMsg({ tone: 'accent', text: '보완 제출 완료 · 관리자가 다시 검토합니다.' })
      router.refresh()
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : '보완 제출하지 못했습니다.' })
    } finally {
      setBusy(null)
    }
  }

  const openCount = checks.filter(c => !c.resolved_at).length
  return (
    <Card title={<span className="flex items-center gap-2">보완 요청{openCount > 0 && <Badge tone="highlight"><span className="tabular">{openCount}건</span></Badge>}</span>}>
      <div className="grid gap-3">
        {openCount > 0 && <p className="text-sm text-muted">요청 내용을 신청서·가점 증빙에 반영해 저장한 뒤 &lsquo;보완 제출&rsquo;을 눌러 주세요.</p>}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <ul className="grid gap-2">
          {checks.map(c => {
            const expired = !!c.due_at && new Date(c.due_at).getTime() < now
            return (
              <li key={c.id} className="rounded-md border border-line px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{c.item}</div>
                    {c.note && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{c.note}</p>}
                    <div className="tabular mt-1 text-xs text-muted">기한 {c.due_at ? fmtDate(c.due_at) : '없음'}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.resolved_at ? (
                      <Badge tone="accent">보완 제출 완료</Badge>
                    ) : expired ? (
                      <Badge tone="danger">기한 경과</Badge>
                    ) : (
                      <>
                        <DDayBadge deadline={c.due_at} />
                        <Button size="sm" onClick={() => resolve(c)} disabled={!!busy}>{busy === c.id ? '처리 중…' : '보완 제출'}</Button>
                      </>
                    )}
                  </div>
                </div>
                {c.resolved_at && <div className="tabular mt-1 text-xs text-muted">제출 {fmtDate(c.resolved_at)}</div>}
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}
