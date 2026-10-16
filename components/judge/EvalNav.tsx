'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { buttonClass, cn } from '@/components/ui'

export const EVAL_MISSING_EVENT = 'eval-missing'
export type EvalMissingDetail = { assignmentId: string; missing: string[] }

type Target = { href: string; label: string } | null

// 평가 화면 하단 이동: 이전 기업 / 다음 기업(마지막은 최종 확인).
// 점수·필수 심사평을 다 입력해야 다음으로 넘어간다 (입력 상태는 ScoringPanel 이 이벤트로 알려준다)
export default function EvalNav({ assignmentId, initialMissing, enforce, prev, next }: {
  assignmentId: string
  initialMissing: string[]
  enforce: boolean // 평가 가능 상태일 때만 막는다 (제출 완료·마감·이해충돌이면 자유 이동)
  prev: Target
  next: Target
}) {
  const [missing, setMissing] = useState(initialMissing)
  const [warn, setWarn] = useState(false)
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<EvalMissingDetail>).detail
      if (d.assignmentId !== assignmentId) return
      setMissing(d.missing)
      if (!d.missing.length) setWarn(false)
    }
    window.addEventListener(EVAL_MISSING_EVENT, on)
    return () => window.removeEventListener(EVAL_MISSING_EVENT, on)
  }, [assignmentId])
  const blocked = enforce && missing.length > 0

  const cls = (primary?: boolean) => cn(buttonClass(primary ? 'primary' : 'outline'), 'min-w-0 max-w-[48%]')
  return (
    <div className="grid gap-2 border-t border-line pt-3">
      {warn && blocked && (
        <p className="rounded-md bg-highlight/15 px-3 py-2 text-sm font-semibold text-[#8a5a00]" role="alert">
          다음으로 넘어가려면 먼저 입력해 주세요: {missing.join(', ')}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        {prev
          ? <Link href={prev.href} className={cls()}><span className="truncate">{prev.label}</span></Link>
          : <span className={cn(cls(), 'pointer-events-none opacity-40')}>← 이전 기업</span>}
        {next && (blocked
          ? <button type="button" onClick={() => setWarn(true)} aria-disabled className={cn(cls(true), 'opacity-50')}>
              <span className="truncate">{next.label}</span>
            </button>
          : <Link href={next.href} className={cls(true)}><span className="truncate">{next.label}</span></Link>)}
      </div>
    </div>
  )
}
