import 'server-only'
import { PdfWriter } from '@/lib/server/pdf'

// 평가표 최종 제출 PDF (J-07, 4-1 '평가표 최종 제출·서명'): 기업 × 항목 점수표 + 심사평 + 심사위원 서명

export interface EvalPdfCriterion { id: string; name: string; max_score: number }
export interface EvalPdfRow {
  name: string // 블라인드 단계는 코드
  scores: Record<string, number | null>
  comments: Record<string, string | null>
  overall: string | null
}

const fmt = (n: number | null | undefined) => (n == null ? '-' : Number(n).toFixed(2).replace(/\.?0+$/, ''))
const kst = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

export async function buildEvaluationPdf(p: {
  programTitle: string
  stageName: string
  blind: boolean
  judgeName: string
  affiliation: string | null
  criteria: EvalPdfCriterion[]
  rows: EvalPdfRow[]
  submittedAt: string
  ip: string | null
  signaturePng: Uint8Array
}) {
  const w = await PdfWriter.create(`${p.programTitle} · ${p.stageName} · 평가표 (${p.judgeName}) · 제출 ${kst(p.submittedAt)}`)
  w.title('평가표', `${p.programTitle} · ${p.stageName}${p.blind ? ' · 블라인드 심사' : ''}`)
  w.text(`심사위원: ${p.judgeName}${p.affiliation ? ` (${p.affiliation})` : ''}`, { bold: true })
  w.text(`평가 기업 ${p.rows.length}개 · 평가항목 ${p.criteria.length}개 · 만점 ${fmt(p.criteria.reduce((a, c) => a + c.max_score, 0))}점`, { size: 9, gap: 10 })

  w.heading('점수표')
  const total = (r: EvalPdfRow) => p.criteria.reduce((a, c) => a + (r.scores[c.id] ?? 0), 0)
  w.table(
    ['기업', ...p.criteria.map(c => `${c.name} (${fmt(c.max_score)})`), '합계'],
    p.rows.map(r => [r.name, ...p.criteria.map(c => fmt(r.scores[c.id])), fmt(total(r))]),
    [2.2, ...p.criteria.map(() => 1), 1],
  )

  w.heading('심사평')
  for (const r of p.rows) {
    w.ensure(40)
    w.text(`${r.name} · 합계 ${fmt(total(r))}점`, { bold: true, size: 10, gap: 2 })
    for (const c of p.criteria) {
      const cm = r.comments[c.id]
      if (cm && cm.trim()) w.text(`[${c.name}] ${cm.trim()}`, { size: 9, gap: 1 })
    }
    w.text(`[종합] ${r.overall?.trim() || '-'}`, { size: 9, gap: 8 })
  }

  w.rule()
  w.text('위 평가 내용이 본인의 독립적인 판단에 따른 것임을 확인하고 최종 제출합니다.', { size: 9.5, gap: 6 })
  w.text(`제출 시각: ${kst(p.submittedAt)} (KST)`, { size: 9 })
  w.text(`IP: ${p.ip ?? '-'}`, { size: 9 })
  w.text(`서명: ${p.judgeName}`, { bold: true, size: 10, gap: 2 })
  await w.image(p.signaturePng)
  return w.save()
}

/** 'data:image/png;base64,…' → PNG 바이트. 형식·크기(1MB) 검증 */
export function parsePngDataUrl(dataUrl: unknown): Uint8Array | null {
  if (typeof dataUrl !== 'string') return null
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) return null
  const bytes = new Uint8Array(Buffer.from(m[1], 'base64'))
  if (bytes.length < 100 || bytes.length > 1024 * 1024) return null
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return sig.every((b, i) => bytes[i] === b) ? bytes : null
}
