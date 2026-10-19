'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

// 동의서 서명 취소 → 같은 화면에서 다시 서명할 수 있다 (평가표 최종 제출 전까지)
export default function WithdrawButton({ consentId, required }: { consentId: string; required: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function withdraw() {
    const warn = required ? '\n필수 동의서라 다시 서명할 때까지 기업 자료 열람과 평가가 막힙니다. (입력한 점수는 그대로 남습니다)' : ''
    if (!confirm(`이 동의서 서명을 취소할까요?${warn}`)) return
    setBusy(true)
    setErr(null)
    try {
      await api('/api/consent/withdraw', { body: { consent_id: consentId } })
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '취소하지 못했습니다.')
      setBusy(false)
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={withdraw} disabled={busy}
        className="text-sm font-semibold text-danger underline-offset-2 hover:underline disabled:opacity-50">
        {busy ? '취소 중…' : '서명 취소'}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  )
}
