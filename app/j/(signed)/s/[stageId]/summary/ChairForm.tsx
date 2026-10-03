'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Textarea } from '@/components/ui'
import { SignaturePad, type SignaturePadHandle } from '@/components/judge/SignaturePad'
import { supabaseBrowser } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/format'

export default function ChairForm({ stageId, judgeId, initialOpinion, confirmedAt }:
  { stageId: string; judgeId: string; initialOpinion: string; confirmedAt: string | null }) {
  const router = useRouter()
  const padRef = useRef<SignaturePadHandle>(null)
  const [opinion, setOpinion] = useState(initialOpinion)
  const [empty, setEmpty] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null)

  if (confirmedAt) {
    return (
      <div className="grid gap-3">
        <p className="whitespace-pre-wrap text-sm">{initialOpinion || '-'}</p>
        <Alert tone="accent">확인 서명 완료 · <span className="tabular">{fmtDate(confirmedAt)}</span></Alert>
      </div>
    )
  }

  async function saveDraft() {
    setBusy(true)
    const { error } = await supabaseBrowser().from('chair_reviews')
      .upsert({ stage_id: stageId, judge_id: judgeId, opinion }, { onConflict: 'stage_id', defaultToNull: false })
    setBusy(false)
    setMsg(error ? { tone: 'danger', text: '저장하지 못했습니다.' } : { tone: 'accent', text: '임시 저장됨' })
  }

  async function confirm() {
    if (!opinion.trim()) return setMsg({ tone: 'danger', text: '종합의견을 입력하세요.' })
    if (!padRef.current || padRef.current.isEmpty()) return setMsg({ tone: 'danger', text: '서명을 입력하세요.' })
    setBusy(true)
    setMsg(null)
    try {
      await api('/api/chair/confirm', { body: { stage_id: stageId, opinion, signature: padRef.current.toDataURL() } })
      router.refresh()
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : '확인 서명하지 못했습니다.' })
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <Textarea value={opinion} onChange={e => setOpinion(e.target.value)} className="min-h-[160px]"
        placeholder="심사 경과, 선정 사유, 특이사항 등 종합 심사의견" />
      <div>
        <div className="mb-1 text-sm font-semibold">위원장 확인 서명</div>
        <SignaturePad ref={padRef} onChange={setEmpty} />
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={saveDraft} disabled={busy}>임시 저장</Button>
        <Button onClick={confirm} disabled={busy || empty || !opinion.trim()}>확인 서명</Button>
      </div>
    </div>
  )
}
