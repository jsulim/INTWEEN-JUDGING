'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type SignaturePadType from 'signature_pad'
import { cn } from '@/components/ui'

export interface SignaturePadHandle {
  isEmpty(): boolean
  toDataURL(): string
  clear(): void
}

// 캔버스 손서명 (signature_pad). 마우스·터치·펜 입력 지원. disabled 동안 입력 불가.
export const SignaturePad = forwardRef<SignaturePadHandle, {
  disabled?: boolean
  disabledText?: string
  onChange?: (empty: boolean) => void
  className?: string
}>(function SignaturePad({ disabled, disabledText, onChange, className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePadType | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  const [empty, setEmpty] = useState(true)

  useImperativeHandle(ref, () => ({
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    toDataURL: () => padRef.current?.toDataURL('image/png') ?? '',
    clear: () => {
      padRef.current?.clear()
      setEmpty(true)
      onChangeRef.current?.(true)
    },
  }))

  useEffect(() => {
    let disposed = false
    let ro: ResizeObserver | null = null
    ;(async () => {
      const { default: SP } = await import('signature_pad')
      const canvas = canvasRef.current
      if (disposed || !canvas) return
      const pad = new SP(canvas, { penColor: '#1F2A25', minWidth: 0.8, maxWidth: 2.6, backgroundColor: 'rgba(0,0,0,0)' })
      padRef.current = pad
      pad.addEventListener('endStroke', () => {
        setEmpty(pad.isEmpty())
        onChangeRef.current?.(pad.isEmpty())
      })
      const resize = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1)
        const data = pad.toData()
        canvas.width = canvas.offsetWidth * ratio
        canvas.height = canvas.offsetHeight * ratio
        canvas.getContext('2d')?.scale(ratio, ratio)
        pad.clear()
        if (data.length) pad.fromData(data)
      }
      resize()
      ro = new ResizeObserver(resize)
      ro.observe(canvas)
      if (disabledRef.current) pad.off()
    })()
    return () => {
      disposed = true
      ro?.disconnect()
      padRef.current?.off()
      padRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const pad = padRef.current
    if (!pad) return
    if (disabled) pad.off()
    else pad.on()
  }, [disabled])

  return (
    <div className={cn('relative', className)}>
      <canvas ref={canvasRef}
        className={cn('block h-40 w-full touch-none rounded-md border border-line bg-card', disabled ? 'cursor-not-allowed' : 'cursor-crosshair')} />
      {empty && !disabled && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted/70">여기에 서명하세요</span>
      )}
      {disabled && (
        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-bg/80 px-4 text-center text-sm text-muted">
          {disabledText ?? '서명할 수 없습니다'}
        </div>
      )}
      {!disabled && (
        <button type="button" onClick={() => { padRef.current?.clear(); setEmpty(true); onChange?.(true) }}
          className="absolute right-2 top-2 rounded px-2 py-0.5 text-xs text-muted hover:bg-fg/5">
          지우기
        </button>
      )}
    </div>
  )
})
