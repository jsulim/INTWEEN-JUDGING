'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { api } from '@/lib/api'
import { cn } from '@/components/ui'

// J-04 자료 열람 (8-4): PDF.js 로 캔버스 렌더 + 심사위원명·현재 시각 워터마크.
// 다운로드 버튼 없음, 우클릭·저장·인쇄 단축키 차단 (완전 차단은 불가 → 보안서약으로 보완)

export interface ViewerFile {
  submission_id: string
  file_type: string
  file_name: string
  version: number
  viewable: boolean
}

const FILE_LABEL: Record<string, string> = { plan: '사업계획서', deck: '발표자료', etc: '기타' }

// 구형 Safari 등 Promise.withResolvers 미지원 브라우저 보완 (pdfjs v4)
function polyfill() {
  const P = Promise as unknown as { withResolvers?: () => unknown }
  if (!P.withResolvers) {
    P.withResolvers = function withResolvers() {
      let resolve!: (v: unknown) => void
      let reject!: (e: unknown) => void
      const promise = new Promise((res, rej) => { resolve = res; reject = rej })
      return { promise, resolve, reject }
    }
  }
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null
function loadPdfjs() {
  if (!pdfjsPromise) {
    polyfill()
    pdfjsPromise = import('pdfjs-dist').then(m => {
      m.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      return m
    })
  }
  return pdfjsPromise
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function useWatermark(name: string) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return useMemo(() => {
    if (!now) return ''
    const ts = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const text = esc(`${name} · ${ts}`)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="240"><text x="190" y="120" text-anchor="middle" dominant-baseline="middle" transform="rotate(-28 190 120)" font-family="Pretendard, sans-serif" font-size="15" font-weight="600" fill="rgba(31,42,37,0.13)">${text}</text></svg>`
    return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
  }, [name, now])
}

export default function PdfViewer({ files, watermarkName, className }: { files: ViewerFile[]; watermarkName: string; className?: string }) {
  const [active, setActive] = useState(files[0]?.submission_id ?? null)
  const file = files.find(f => f.submission_id === active) ?? null
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wm = useWatermark(watermarkName)

  // 컨테이너 너비 추적 → 페이지를 너비에 맞춰 렌더
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth - 32)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    let loaded: PDFDocumentProxy | null = null
    setDoc(null)
    setErr(null)
    if (!file) { setState('idle'); return }
    if (!file.viewable) { setState('error'); setErr('PPTX 원본만 있어 화면에서 열람할 수 없습니다. PDF 변환본이 준비되면 열람할 수 있습니다.'); return }
    setState('loading')
    ;(async () => {
      try {
        const { url } = await api<{ url: string }>('/api/files/view-url', { body: { submission_id: file.submission_id } })
        // 서명 URL(10분)을 오래 붙잡지 않도록 한 번에 받아 메모리에서 연다
        const res = await fetch(url)
        if (!res.ok) throw new Error(`파일을 불러오지 못했습니다 (${res.status})`)
        const data = new Uint8Array(await res.arrayBuffer())
        const pdfjs = await loadPdfjs()
        loaded = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
        if (cancelled) { void loaded.destroy(); return }
        setDoc(loaded)
        setState('ready')
        scrollRef.current?.scrollTo({ top: 0 })
      } catch (e) {
        if (cancelled) return
        setState('error')
        setErr(e instanceof Error ? e.message : '파일을 열지 못했습니다.')
      }
    })()
    return () => {
      cancelled = true
      if (loaded) void loaded.destroy()
    }
  }, [file?.submission_id, file?.viewable, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // 저장·인쇄 단축키 차단
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['s', 'p'].includes(e.key.toLowerCase())) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pages = doc ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : []

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-[#e9ecea] select-none print:hidden', className)}
      onContextMenu={e => e.preventDefault()}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-card px-3 py-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {files.map(f => (
            <button key={f.submission_id} type="button" onClick={() => setActive(f.submission_id)} title={f.file_name}
              className={cn('max-w-[16rem] truncate rounded-md px-3 py-1.5 text-sm font-semibold',
                f.submission_id === active ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-fg/5')}>
              {FILE_LABEL[f.file_type] ?? f.file_type}
              <span className="ml-1 font-normal opacity-80">v{f.version}</span>
            </button>
          ))}
        </div>
        {doc && <span className="tabular text-xs text-muted">{doc.numPages}쪽</span>}
        <div className="flex items-center gap-1">
          <button type="button" aria-label="축소" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            className="h-8 w-8 rounded-md border border-line bg-card font-bold hover:bg-bg">−</button>
          <button type="button" onClick={() => setZoom(1)} className="tabular h-8 rounded-md px-2 text-xs text-muted hover:bg-fg/5">{Math.round(zoom * 100)}%</button>
          <button type="button" aria-label="확대" onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))}
            className="h-8 w-8 rounded-md border border-line bg-card font-bold hover:bg-bg">+</button>
        </div>
      </div>
      {file && <div className="truncate border-b border-line bg-card px-3 py-1 text-xs text-muted">{file.file_name}</div>}

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto p-4">
        {files.length === 0 && <Message>제출된 자료가 없습니다.</Message>}
        {state === 'loading' && <Message>불러오는 중…</Message>}
        {state === 'error' && (
          <Message>
            <p>{err}</p>
            {file?.viewable && (
              <button type="button" onClick={() => setReloadKey(k => k + 1)} className="mt-3 text-sm font-semibold text-primary hover:underline">다시 시도</button>
            )}
          </Message>
        )}
        {doc && width > 0 && (
          <div className="mx-auto grid w-fit gap-4">
            {pages.map(n => <PdfPage key={`${active}-${n}`} doc={doc} pageNo={n} width={width * zoom} watermark={wm} root={scrollRef} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-6 text-center text-sm text-muted">{children}</div>
}

// 한 페이지: 화면 근처에 올 때만 렌더 (긴 문서 성능)
function PdfPage({ doc, pageNo, width, watermark, root }:
  { doc: PDFDocumentProxy; pageNo: number; width: number; watermark: string; root: React.RefObject<HTMLDivElement> }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [visible, setVisible] = useState(pageNo <= 2)

  useEffect(() => {
    let alive = true
    doc.getPage(pageNo).then(p => { if (alive) setPage(p) }).catch(() => {})
    return () => { alive = false }
  }, [doc, pageNo])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setVisible(true) },
      { root: root.current, rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [root])

  const base = page?.getViewport({ scale: 1 })
  const scale = base ? width / base.width : 1
  const height = base ? base.height * scale : width * 1.414

  const render = useCallback(() => {
    if (!page || !visible || !canvasRef.current) return null
    const viewport = page.getViewport({ scale })
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const canvas = canvasRef.current
    canvas.width = Math.floor(viewport.width * ratio)
    canvas.height = Math.floor(viewport.height * ratio)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    return page.render({ canvasContext: ctx, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined })
  }, [page, visible, scale])

  useEffect(() => {
    let task: RenderTask | null = null
    const t = setTimeout(() => {
      task = render()
      task?.promise.catch(() => { /* 취소됨 */ })
    }, 60) // 확대·리사이즈 연속 입력 디바운스
    return () => { clearTimeout(t); task?.cancel() }
  }, [render])

  return (
    <div ref={wrapRef} className="relative bg-white shadow-sm" style={{ width: Math.floor(width), height: Math.floor(height) }}>
      <canvas ref={canvasRef} className="pointer-events-none block" draggable={false} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: watermark, backgroundRepeat: 'repeat' }} />
      <span className="tabular pointer-events-none absolute bottom-1 right-2 text-[10px] text-muted/70">{pageNo}</span>
    </div>
  )
}
