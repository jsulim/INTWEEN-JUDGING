'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Alert, Badge, Button, Card } from '@/components/ui'
import { uploadFile } from './upload'
import { EVIDENCE_ACCEPT, EVIDENCE_EXT, MAX_UPLOAD_BYTES, SIZE_ERROR, extOfName, fmtPoints, myFileHref } from './rules'
import type { BonusRule, EntryBonus, StageStatus } from '@/lib/types'

export interface BonusGroup {
  entry_id: string
  stage_name: string
  stage_status: StageStatus
  bonus_cap: number | null
  rules: BonusRule[]
  claims: EntryBonus[]
}

// 가점 증빙 (4-1 가점·감점): 증빙 업로드 → 관리자 승인 시 반영. 승인 전에는 취소 가능
export default function BonusClaims({ groups }: { groups: BonusGroup[] }) {
  const [msg, setMsg] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null)
  return (
    <Card title="가점 증빙">
      <div className="grid gap-5">
        <p className="text-sm text-muted">해당하는 우대 조건의 증빙을 올려 주세요. 관리자가 증빙을 확인·승인하면 점수에 반영됩니다.</p>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        {groups.map(g => {
          const editable = g.stage_status !== 'locked' && g.stage_status !== 'published'
          return (
            <div key={g.entry_id}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{g.stage_name}</span>
                {g.bonus_cap != null && <span className="tabular text-xs text-muted">가점 상한 {g.bonus_cap}점</span>}
                {!editable && <Badge>확정됨</Badge>}
              </div>
              <ul className="divide-y divide-line rounded-md border border-line">
                {g.rules.map(rule => (
                  <RuleRow key={rule.id} entryId={g.entry_id} rule={rule} claim={g.claims.find(c => c.rule_id === rule.id) ?? null}
                    editable={editable} onMessage={setMsg} />
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function RuleRow({ entryId, rule, claim, editable, onMessage }: {
  entryId: string
  rule: BonusRule
  claim: EntryBonus | null
  editable: boolean
  onMessage: (m: { tone: 'accent' | 'danger'; text: string } | null) => void
}) {
  const router = useRouter()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function claimWith(file: File | null) {
    onMessage(null)
    if (file) {
      if (!(EVIDENCE_EXT as readonly string[]).includes(extOfName(file.name))) {
        return onMessage({ tone: 'danger', text: `${EVIDENCE_EXT.map(e => e.toUpperCase()).join('·')} 파일만 업로드할 수 있습니다.` })
      }
      if (file.size > MAX_UPLOAD_BYTES) return onMessage({ tone: 'danger', text: SIZE_ERROR })
    }
    setBusy(true)
    try {
      const evidence = file ? (await uploadFile(file, 'bonus', { entry_id: entryId, rule_id: rule.id })).path : null
      const { error } = await supabaseBrowser().from('entry_bonuses').insert({ entry_id: entryId, rule_id: rule.id, evidence_path: evidence })
      if (error) throw new Error(error.code === '23505' ? '이미 신청한 항목입니다.' : '가점을 신청하지 못했습니다.')
      onMessage({ tone: 'accent', text: `'${rule.name}' 가점 신청 완료` })
      router.refresh()
    } catch (e) {
      onMessage({ tone: 'danger', text: e instanceof Error ? e.message : '가점을 신청하지 못했습니다.' })
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  async function cancel() {
    if (!claim || !window.confirm(`'${rule.name}' 가점 신청을 취소할까요?`)) return
    setBusy(true)
    onMessage(null)
    const { error } = await supabaseBrowser().from('entry_bonuses').delete().eq('id', claim.id)
    setBusy(false)
    if (error) return onMessage({ tone: 'danger', text: '신청을 취소하지 못했습니다.' })
    router.refresh()
  }

  const status = claim
    ? claim.approved_at ? <Badge tone="accent">승인</Badge>
      : claim.rejected ? <Badge tone="danger">반려</Badge>
      : <Badge>확인 대기</Badge>
    : null

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{rule.name}</span>
          <span className="tabular text-xs font-semibold text-accent">{fmtPoints(rule.points)}</span>
          {status}
        </div>
        {claim?.evidence_path ? (
          <a href={myFileHref({ path: claim.evidence_path })} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">증빙 보기</a>
        ) : rule.evidence_required ? (
          <span className="text-xs text-muted">증빙 필요</span>
        ) : null}
      </div>
      {editable && (
        <div className="flex gap-2">
          <input ref={ref} type="file" className="sr-only" accept={EVIDENCE_ACCEPT} onChange={e => { const f = e.target.files?.[0]; if (f) claimWith(f) }} disabled={busy} />
          {claim ? (
            !claim.approved_at && <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>{busy ? '처리 중…' : '신청 취소'}</Button>
          ) : rule.evidence_required ? (
            <Button size="sm" variant="outline" onClick={() => ref.current?.click()} disabled={busy}>{busy ? '업로드 중…' : '증빙 업로드'}</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => claimWith(null)} disabled={busy}>{busy ? '처리 중…' : '신청'}</Button>
          )}
        </div>
      )}
    </li>
  )
}
