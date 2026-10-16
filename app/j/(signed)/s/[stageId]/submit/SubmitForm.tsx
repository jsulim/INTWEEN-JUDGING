'use client'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button } from '@/components/ui'
import { SignaturePad, type SignaturePadHandle } from '@/components/judge/SignaturePad'

type Incomplete = { company_id: string; name: string; missing: string[] }

export default function SubmitForm({ stageId, base }: { stageId: string; base: string }) {
  const router = useRouter()
  const padRef = useRef<SignaturePadHandle>(null)
  const [open, setOpen] = useState(false) // '제출하기'를 누르면 확인 문구·서명란을 연다
  const [agree, setAgree] = useState(false)
  const [empty, setEmpty] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [incomplete, setIncomplete] = useState<Incomplete[]>([])

  async function submit() {
    if (!padRef.current || padRef.current.isEmpty()) return setErr('서명을 입력하세요.')
    setBusy(true)
    setErr(null)
    setIncomplete([])
    try {
      const res = await fetch('/api/eval/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId, signature: padRef.current.toDataURL() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error || `제출하지 못했습니다 (${res.status})`)
        if (Array.isArray(data.incomplete)) setIncomplete(data.incomplete)
        setBusy(false)
        return
      }
      router.refresh()
    } catch {
      setErr('네트워크 오류로 제출하지 못했습니다. 다시 시도하세요.')
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">위 점수를 모두 확인했으면 제출하세요. 제출 후에는 수정할 수 없습니다.</p>
        <Button size="lg" onClick={() => setOpen(true)}>제출하기</Button>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border-2 border-primary/40 bg-primary/5 px-5 py-4 text-center">
        <p className="text-lg font-bold">본 심사는 공정하게 심사되었습니다.</p>
        <p className="mt-1 text-sm text-muted">위 평가 내용은 본인의 독립적이고 공정한 판단에 따른 것임을 확인하며, 아래에 서명합니다.</p>
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]" />
        <span>공정하게 심사했음을 확인합니다. 제출 후에는 관리자 재오픈 없이 수정할 수 없습니다.</span>
      </label>
      <SignaturePad ref={padRef} onChange={setEmpty} disabled={!agree} disabledText="확인란을 선택하면 서명할 수 있습니다" />
      {err && (
        <Alert tone="danger">
          {err}
          {incomplete.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {incomplete.map(i => <li key={i.company_id}><Link href={`${base}/c/${i.company_id}`} className="underline">{i.name}</Link> — {i.missing.join(', ')}</li>)}
            </ul>
          )}
        </Alert>
      )}
      <div className="flex justify-end">
        <Button size="lg" onClick={submit} disabled={!agree || empty || busy}>{busy ? '제출 중…' : '서명하고 최종 제출'}</Button>
      </div>
    </div>
  )
}
