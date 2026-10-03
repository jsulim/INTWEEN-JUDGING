'use client'
// 관리자 설정·운영 화면 공용 클라이언트 헬퍼
import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, cn } from '@/components/ui'

/** Supabase·API 오류 메시지를 사용자 문구로 변환 */
export function errMsg(e: unknown): string {
  const raw = (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)) || '오류'
  if (raw.includes('stage_locked')) return '확정된 단계는 수정할 수 없습니다.'
  if (raw.includes('duplicate key') || raw.includes('23505')) return '이미 존재하는 값과 중복됩니다. (순서 번호·코드 등 확인)'
  if (raw.includes('violates foreign key')) return '연결된 데이터가 있어 처리할 수 없습니다.'
  if (raw.includes('row-level security') || raw.includes('42501')) return '권한이 없습니다.'
  return raw
}

/** Supabase 응답의 error 를 throw 로 변환 */
export function must<T>(res: { data?: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

/** 비동기 작업 실행 + busy/error/notice 상태 + 성공 시 router.refresh() */
export function useRun() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  async function run(fn: () => Promise<unknown>, opts?: { success?: string; refresh?: boolean }) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
      if (opts?.success) setNotice(opts.success)
      if (opts?.refresh !== false) router.refresh()
      return true
    } catch (e) {
      setError(errMsg(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, notice, run, setError, setNotice }
}

export function Feedback({ error, notice }: { error?: string | null; notice?: string | null }) {
  if (!error && !notice) return null
  return <div className="mb-3">{error ? <Alert tone="danger">{error}</Alert> : <Alert tone="accent">{notice}</Alert>}</div>
}

export function Check({ label, checked, onChange, hint, disabled }:
  { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('flex items-start gap-2 text-sm', disabled && 'opacity-60')}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--primary))]" checked={checked} disabled={disabled}
        onChange={e => onChange(e.target.checked)} />
      <span>
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  )
}

/** 숫자 입력값 → number | null */
export const num = (v: string): number | null => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v))

/** 서명 URL 엔드포인트로 새 창 열기 (엔드포인트가 302 리다이렉트) */
export function openUrl(href: string) {
  window.open(href, '_blank', 'noopener')
}
