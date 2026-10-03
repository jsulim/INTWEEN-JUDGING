import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

// 서명 PDF·평가표·심사평 PDF 생성 (pdf-lib + Pretendard 한글 폰트)
// 주의: fontkit 서브셋은 Pretendard 한글 글리프 상당수를 누락시킨다 → 전체 임베드(약 1.2MB).
// 또한 문맥 대체(calt: hyphen.case 등)가 PDF 폭과 어긋나 'A-  01'처럼 벌어지므로 OpenType 기능을 모두 끈다.
// 굵은 글씨는 두 번째 폰트(+1.2MB) 대신 같은 폰트를 미세 오프셋으로 덧그려 표현한다.
const FONT_DIR = path.join(process.cwd(), 'node_modules/pretendard/dist/public/static/alternative')
let fontCache: { regular: Uint8Array; features: Record<string, boolean> } | null = null
async function fonts() {
  if (!fontCache) {
    const regular = await readFile(path.join(FONT_DIR, 'Pretendard-Regular.ttf'))
    const features = Object.fromEntries(fontkit.create(regular).availableFeatures.map(k => [k as string, false]))
    fontCache = { regular, features }
  }
  return fontCache
}

const A4: [number, number] = [595.28, 841.89]
const M = 50
const PRIMARY = rgb(0x57 / 255, 0x8c / 255, 0x76 / 255)
const TEXT = rgb(0x1f / 255, 0x2a / 255, 0x25 / 255)
const MUTED = rgb(0.45, 0.48, 0.46)

/** 줄바꿈·자동 페이지 넘김을 처리하는 간단한 문서 작성기 */
export class PdfWriter {
  doc!: PDFDocument
  page!: PDFPage
  regular!: PDFFont
  bold!: PDFFont
  y = 0
  footer = ''

  static async create(footer = '') {
    const w = new PdfWriter()
    w.doc = await PDFDocument.create()
    w.doc.registerFontkit(fontkit)
    const f = await fonts()
    w.regular = await w.doc.embedFont(f.regular, { subset: false, features: f.features })
    w.bold = w.regular
    w.footer = footer
    w.addPage()
    return w
  }

  get width() {
    return A4[0] - M * 2
  }

  addPage() {
    this.page = this.doc.addPage(A4)
    this.y = A4[1] - M
    if (this.footer) {
      this.page.drawText(this.footer, { x: M, y: 24, size: 7.5, font: this.regular, color: MUTED })
    }
  }

  /** bold 는 0.35pt 오프셋으로 덧그려 표현 */
  draw(text: string, x: number, y: number, size: number, color: ReturnType<typeof rgb>, bold = false) {
    this.page.drawText(text, { x, y, size, font: this.regular, color })
    if (bold) this.page.drawText(text, { x: x + Math.max(0.25, size * 0.03), y, size, font: this.regular, color })
  }

  ensure(h: number) {
    if (this.y - h < M) this.addPage()
  }

  wrap(text: string, size: number, font: PDFFont, width = this.width) {
    const lines: string[] = []
    for (const para of (text ?? '').split('\n')) {
      let line = ''
      for (const ch of [...para]) {
        if (font.widthOfTextAtSize(line + ch, size) > width && line) {
          lines.push(line)
          line = ch === ' ' ? '' : ch
        } else line += ch
      }
      lines.push(line)
    }
    return lines
  }

  text(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; x?: number; width?: number } = {}) {
    const size = opts.size ?? 10
    const font = opts.bold ? this.bold : this.regular
    const lh = size * 1.55
    for (const line of this.wrap(text, size, font, opts.width)) {
      this.ensure(lh)
      this.draw(line, opts.x ?? M, this.y - size, size, opts.color ?? TEXT, !!opts.bold)
      this.y -= lh
    }
    this.y -= opts.gap ?? 4
  }

  title(text: string, sub?: string) {
    this.page.drawRectangle({ x: M, y: this.y - 3, width: 36, height: 3, color: PRIMARY })
    this.y -= 14
    this.text(text, { size: 17, bold: true, gap: 2 })
    if (sub) this.text(sub, { size: 9, color: MUTED, gap: 10 })
  }

  heading(text: string) {
    this.y -= 6
    this.text(text, { size: 12, bold: true, color: PRIMARY, gap: 4 })
  }

  rule() {
    this.ensure(10)
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 0.5, color: rgb(0.85, 0.87, 0.86) })
    this.y -= 10
  }

  /** 열 너비 비율 cols 로 표 그리기 */
  table(headers: string[], rows: string[][], cols: number[]) {
    const total = cols.reduce((a, b) => a + b, 0)
    const widths = cols.map(c => (c / total) * this.width)
    const size = 8.5
    const drawRow = (cells: string[], bold: boolean) => {
      const font = bold ? this.bold : this.regular
      const wrapped = cells.map((c, i) => this.wrap(c ?? '', size, font, widths[i] - 8))
      const h = Math.max(...wrapped.map(l => l.length)) * size * 1.45 + 8
      this.ensure(h)
      let x = M
      if (bold) this.page.drawRectangle({ x: M, y: this.y - h, width: this.width, height: h, color: rgb(0.95, 0.97, 0.96) })
      wrapped.forEach((lines, i) => {
        lines.forEach((ln, k) => {
          this.draw(ln, x + 4, this.y - 4 - size - k * size * 1.45, size, TEXT, bold)
        })
        x += widths[i]
      })
      this.y -= h
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 0.4, color: rgb(0.85, 0.87, 0.86) })
    }
    drawRow(headers, true)
    rows.forEach(r => drawRow(r, false))
    this.y -= 8
  }

  async image(png: Uint8Array, maxW = 180, maxH = 70) {
    const img = await this.doc.embedPng(png)
    const scale = Math.min(maxW / img.width, maxH / img.height, 1)
    const w = img.width * scale
    const h = img.height * scale
    this.ensure(h + 6)
    this.page.drawImage(img, { x: M, y: this.y - h, width: w, height: h })
    this.y -= h + 6
  }

  async save() {
    this.doc.setProducer('INTWEEN 심사 관리 플랫폼')
    this.doc.setCreationDate(new Date())
    return this.doc.save()
  }
}

/** 동의서 서명 PDF: 문구 + 서명 + 서명시각 + IP (8-3) */
export async function buildConsentPdf(p: {
  programTitle: string
  templateTitle: string
  version: number
  body: string
  judgeName: string
  signedAt: string
  ip: string | null
  userAgent: string | null
  signaturePng: Uint8Array
  conflictDeclared?: boolean | null
  conflictNote?: string | null
}) {
  const w = await PdfWriter.create(`${p.programTitle} · ${p.templateTitle} v${p.version} · 서명 증빙`)
  w.title(p.templateTitle, `${p.programTitle} · 양식 버전 ${p.version}`)
  w.text(p.body, { size: 10, gap: 12 })
  if (p.conflictDeclared != null) {
    w.heading('이해충돌 확인')
    w.text(p.conflictDeclared ? `이해관계 있음 — ${p.conflictNote ?? ''}` : '이해관계 없음')
  }
  w.rule()
  w.text(`서명자: ${p.judgeName}`, { bold: true })
  w.text(`서명 시각: ${new Date(p.signedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (KST)`, { size: 9 })
  w.text(`IP: ${p.ip ?? '-'}`, { size: 9 })
  w.text(`User-Agent: ${p.userAgent ?? '-'}`, { size: 8, color: MUTED, gap: 8 })
  await w.image(p.signaturePng)
  return w.save()
}
