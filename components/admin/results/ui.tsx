'use client'
import Link from 'next/link'
import { useEffect, useRef, type ReactNode } from 'react'
import { Button, buttonClass, cn } from '@/components/ui'
import { StageStatusBadge } from '@/components/StatusBadges'
import type { StageStatus } from '@/lib/types'

/** 단계 선택 탭 (?stage=) */
export function StageTabs({ stages, current, base }: { stages: { id: string; name: string; order_no: number; status: StageStatus }[]; current: string | null; base: string }) {
  if (!stages.length) return null
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {stages.map(s => (
        <Link key={s.id} href={`${base}?stage=${s.id}`}
          className={cn('flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold',
            s.id === current ? 'border-primary bg-primary/10 text-primary' : 'border-line bg-card text-muted hover:text-fg')}>
          <span className="tabular">{s.order_no}.</span> {s.name} <StageStatusBadge status={s.status} />
        </Link>
      ))}
    </div>
  )
}

/** 확인 다이얼로그 (확정·이관·재오픈 등 되돌리기 어려운 작업) */
export function ConfirmDialog({ open, title, children, confirmLabel = '확인', tone = 'primary', busy, disabled, onConfirm, onClose }: {
  open: boolean
  title: ReactNode
  children?: ReactNode
  confirmLabel?: string
  tone?: 'primary' | 'danger'
  busy?: boolean
  disabled?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className="w-full max-w-lg rounded-lg border border-line bg-card shadow-xl outline-none">
        <div className="border-b border-line px-5 py-3 font-bold">{title}</div>
        <div className="grid gap-3 px-5 py-4 text-sm">{children}</div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>취소</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} size="sm" onClick={onConfirm} disabled={busy || disabled}>
            {busy ? '처리 중…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={cn('flex items-start gap-3', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-fg/20')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  )
}

/** fetch + JSON. 409 경고 응답 등 본문을 그대로 돌려준다 */
export async function callApi<T = Record<string, unknown>>(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  return { ok: res.ok, status: res.status, data }
}

/** 파일 다운로드 버튼 — next/link 프리페치가 내보내기 API 를 호출하지 않도록 일반 <a> */
export function DownloadLink({ href, children, variant = 'outline', size = 'sm' }: { href: string; children: ReactNode; variant?: 'primary' | 'outline' | 'secondary' | 'ghost'; size?: 'sm' | 'md' }) {
  return <a href={href} className={buttonClass(variant, size)} download>{children}</a>
}
