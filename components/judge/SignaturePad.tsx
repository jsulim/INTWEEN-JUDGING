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
// 서명 이미지 파일(사진·스캔)도 올릴 수 있다: 흰 배경을 투명하게 바꿔 캔버스에 맞춰 넣는다.

/** 이미지 파일 → 배경 제거·여백 자른 PNG data URL */
async function signatureFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image()
      el.onload = () => res(el)
      el.onerror = () => rej(new Error('이미지를 열 수 없습니다.'))
      el.src = url
    })
    const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h)
    const px = data.data
    let minX = w, minY = h, maxX = -1, maxY = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
        // 밝은 배경(종이)은 투명, 어두운 획만 남긴다
        if (px[i + 3] < 10 || lum > 200) { px[i + 3] = 0; continue }
        if (lum > 150) px[i + 3] = Math.round(px[i + 3] * (200 - lum) / 50)
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    if (maxX < 0) throw new Error('서명을 찾지 못했습니다. 흰 종이에 진하게 쓴 서명 사진을 올려 주세요.')
    ctx.putImageData(data, 0, 0)
    const pad = 6
    const cx = Math.max(0, minX - pad), cy = Math.max(0, minY - pad)
    const cw = Math.min(w, maxX + pad) - cx, ch = Math.min(h, maxY + pad) - cy
    const out = document.createElement('canvas')
    out.width = cw
    out.height = ch
    out.getContext('2d')!.drawImage(c, cx, cy, cw, ch, 0, 0, cw, ch)
    return out.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
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
  const [fileErr, setFileErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // 올린 서명 이미지 (캔버스 크기가 바뀌면 다시 그린다)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const drawImage = () => {
    const canvas = canvasRef.current
    const img = imageRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !img || !ctx) return
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    const s = Math.min((W - 24) / img.naturalWidth, (H - 24) / img.naturalHeight, 3)
    const w = img.naturalWidth * s, h = img.naturalHeight * s
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
  }

  async function onFile(file: File | undefined) {
    setFileErr(null)
    if (!file) return
    if (!file.type.startsWith('image/')) return setFileErr('PNG·JPG 같은 이미지 파일을 올려 주세요.')
    try {
      const src = await signatureFromFile(file)
      const img = new Image()
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('이미지를 열 수 없습니다.')); img.src = src })
      const pad = padRef.current
      if (!pad) return
      pad.clear()
      imageRef.current = img
      drawImage()
      // signature_pad 는 획이 없으면 빈 서명으로 본다 → 이미지 서명 상태를 직접 표시
      ;(pad as unknown as { _isEmpty: boolean })._isEmpty = false
      setEmpty(false)
      onChangeRef.current?.(false)
    } catch (e) {
      setFileErr(e instanceof Error ? e.message : '이미지를 처리하지 못했습니다.')
    }
  }

  const clearAll = () => {
    imageRef.current = null
    padRef.current?.clear()
    setEmpty(true)
    setFileErr(null)
    onChangeRef.current?.(true)
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => (padRef.current?.isEmpty() ?? true) && !imageRef.current,
    toDataURL: () => padRef.current ? canvasRef.current?.toDataURL('image/png') ?? '' : '',
    clear: clearAll,
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
      pad.addEventListener('beginStroke', () => {
        // 이미지 위에 손으로 덧쓰면 이미지는 지우고 손서명으로 바꾼다
        if (imageRef.current) { imageRef.current = null; pad.clear() }
      })
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
        if (imageRef.current) { drawImage(); (pad as unknown as { _isEmpty: boolean })._isEmpty = false }
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
        <button type="button" onClick={clearAll}
          className="absolute right-2 top-2 rounded px-2 py-0.5 text-xs text-muted hover:bg-fg/5">
          지우기
        </button>
      )}
      {!disabled && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="rounded-md border border-line bg-card px-2.5 py-1 font-semibold text-fg hover:bg-bg">
            서명 이미지 올리기
          </button>
          <span className="text-muted">흰 종이에 쓴 서명 사진·스캔 (PNG·JPG) · 배경은 자동으로 지워집니다</span>
          {fileErr && <span className="w-full text-danger">{fileErr}</span>}
        </div>
      )}
    </div>
  )
})
