'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { fmtScore } from '@/lib/format'
import { Alert, Input, Textarea } from '@/components/ui'
import { ConfirmDialog } from './ui'

// 관리자 점수 수정 (A-08). 심사위원이 잘못 체크한 점수를 관리자가 바로잡는다. 사유 필수 → 감사로그.
export interface ScoreEditTarget {
  assignment_id: string
  judgeName: string
  companyName: string
  scores: { criterion_id: string; score: number | null; comment: string | null }[]
  overall: string | null
}

export default function ScoreEditDialog({ target, criteria, onClose, onSaved }: {
  target: ScoreEditTarget | null
  criteria: { id: string; name: string; max_score: number }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [vals, setVals] = useState<Record<string, { score: string; comment: string }>>({})
  const [overall, setOverall] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!target) return
    const by = new Map(target.scores.map(s => [s.criterion_id, s]))
    setVals(Object.fromEntries(criteria.map(c => {
      const s = by.get(c.id)
      return [c.id, { score: s?.score == null ? '' : String(s.score), comment: s?.comment ?? '' }]
    })))
    setOverall(target.overall ?? '')
    setReason('')
    setError(null)
  }, [target, criteria])

  const parsed = criteria.map(c => {
    const raw = vals[c.id]?.score.trim() ?? ''
    const n = raw === '' ? null : Number(raw)
    return { c, n, bad: n != null && (!Number.isFinite(n) || n < 0 || n > c.max_score) }
  })
  const total = parsed.reduce((a, x) => a + (x.n ?? 0), 0)
  const invalid = parsed.some(x => x.bad) || reason.trim().length < 2

  async function save() {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      await api('/api/admin/scores', {
        body: {
          assignment_id: target.assignment_id,
          scores: parsed.map(x => ({ criterion_id: x.c.id, score: x.n, comment: vals[x.c.id]?.comment.trim() || null })),
          overall_comment: overall.trim() || null,
          reason: reason.trim(),
        },
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally { setBusy(false) }
  }

  return (
    <ConfirmDialog open={!!target} title={target ? `점수 수정 — ${target.companyName} · ${target.judgeName}` : ''}
      confirmLabel="저장" busy={busy} disabled={invalid} onClose={onClose} onConfirm={save}>
      <div className="grid max-h-[55vh] gap-3 overflow-y-auto pr-1">
        {parsed.map(({ c, bad }) => (
          <div key={c.id} className="grid gap-1.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 font-semibold">{c.name}</span>
              <Input type="number" inputMode="decimal" min={0} max={c.max_score} step={0.5} className="w-24 text-right"
                value={vals[c.id]?.score ?? ''} aria-invalid={bad}
                onChange={e => setVals(v => ({ ...v, [c.id]: { ...v[c.id], score: e.target.value } }))} />
              <span className="tabular w-14 text-muted">/ {fmtScore(c.max_score)}</span>
            </div>
            {bad && <p className="text-xs text-danger">0 ~ {fmtScore(c.max_score)} 사이로 입력해 주세요.</p>}
            <Input value={vals[c.id]?.comment ?? ''} placeholder="항목 심사평"
              onChange={e => setVals(v => ({ ...v, [c.id]: { ...v[c.id], comment: e.target.value } }))} />
          </div>
        ))}
        <div className="tabular text-right font-bold">합계 {fmtScore(total)} / {fmtScore(criteria.reduce((a, c) => a + c.max_score, 0))}</div>
        <div className="grid gap-1.5">
          <span className="font-semibold">종합 심사평</span>
          <Textarea value={overall} onChange={e => setOverall(e.target.value)} className="min-h-[80px]" />
        </div>
      </div>
      <div className="grid gap-1.5 border-t border-line pt-3">
        <span className="font-semibold">수정 사유 <span className="text-danger">*</span></span>
        <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="예: 심사위원 요청 — 사업성 점수 오기입 정정" />
        <p className="text-xs text-muted">수정 전·후 값과 사유가 감사로그에 남습니다. 이미 최종 제출된 평가표 PDF는 바뀌지 않습니다.</p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </ConfirmDialog>
  )
}
