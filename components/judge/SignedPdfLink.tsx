'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { cn } from '@/components/ui'

// 서명본 PDF 열람 (서버가 본인 소유 확인 후 10분 서명 URL 발급)
export function SignedPdfLink({ path, kind, children = '서명본 보기', className }:
  { path: string; kind: 'consent' | 'evaluation'; children?: React.ReactNode; className?: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function open() {
    setBusy(true)
    setErr(null)
    const w = window.open('', '_blank') // 팝업 차단 방지: 클릭 시점에 창을 연다
    try {
      const { url } = await api<{ url: string }>('/api/files/view-url', { body: { path, kind } })
      if (w) { w.opener = null; w.location.href = url }
      else window.location.href = url
    } catch (e) {
      w?.close()
      setErr(e instanceof Error ? e.message : '열 수 없습니다.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={open} disabled={busy}
        className={cn('text-sm font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-50', className)}>
        {busy ? '여는 중…' : children}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  )
}
