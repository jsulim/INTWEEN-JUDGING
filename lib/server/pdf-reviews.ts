import 'server-only'
import { rgb } from 'pdf-lib'
import { PdfWriter } from '@/lib/server/pdf'
import { fmtDate, fmtScore } from '@/lib/format'
import { companyLabel, type StageReport } from '@/lib/server/export'

const MUTED = rgb(0.45, 0.48, 0.46)

const createWriter = (footer: string) => PdfWriter.create(footer)

/** 심사평 PDF (A-09): 기업별 섹션 → 심사위원별 항목 점수·심사평·종합 의견 */
export async function buildReviewsPdf(r: StageReport) {
  const { stage, criteria, results, companies, assignments, scores, reviews } = r
  const w = await createWriter(`${r.program.title} · ${stage.name} · 심사평 · 출력 ${fmtDate(new Date())}`)
  w.title(`심사평 — ${stage.name}`, `${r.program.title} · 기업 ${results.length}개 · ${r.source === 'snapshot' ? `확정 ${fmtDate(r.lockedAt)}` : '실시간 집계(미확정)'}`)

  const judgeName = new Map(r.judges.map(j => [j.id, j.name]))
  const reviewOf = new Map(reviews.map(v => [v.assignment_id, v]))

  w.heading('순위 요약')
  w.table(
    ['순위', '기업', '원점수', stage.normalize ? '정규화' : '', '가감점', '최종'].filter(Boolean),
    results.map(x => [
      x.cutoff ? '과락' : x.rank == null ? '-' : String(x.rank),
      `${companyLabel(companies.get(x.company_id))}${companies.get(x.company_id)?.blind_code ? ` (${companies.get(x.company_id)!.blind_code})` : ''}`,
      fmtScore(x.raw, 3),
      ...(stage.normalize ? [fmtScore(x.normalized, 3)] : []),
      fmtScore(x.bonus),
      fmtScore(x.final, 3),
    ]),
    stage.normalize ? [1, 4, 1.2, 1.2, 1, 1.2] : [1, 4, 1.2, 1, 1.2],
  )

  for (const x of results) {
    const c = companies.get(x.company_id)
    w.addPage()
    w.title(companyLabel(c), [
      c?.blind_code ? `코드 ${c.blind_code}` : null,
      x.rank != null ? `순위 ${x.rank}${x.tied ? '(공동)' : ''}` : x.cutoff ? '과락' : '순위 없음',
      `최종 ${fmtScore(x.final, 3)}`,
      `심사위원 ${x.done_count}/${x.judge_count}`,
    ].filter(Boolean).join(' · '))

    w.table(
      ['항목', '배점', '평균'],
      criteria.map(k => [k.name, fmtScore(Number(k.max_score)), fmtScore(x.criterion_avgs[k.id], 3)]),
      [4, 1, 1],
    )

    const mine = assignments.filter(a => a.company_id === x.company_id && !a.conflict)
    if (!mine.length) w.text('배정된 심사위원이 없습니다.', { color: MUTED })
    for (const a of mine) {
      const total = x.judge_totals.find(t => t.judge_id === a.judge_id)?.total
      w.heading(`${judgeName.get(a.judge_id) ?? '심사위원'} — 합계 ${fmtScore(total ?? null)}`)
      const rows = criteria.map(k => {
        const s = scores.find(s => s.assignment_id === a.id && s.criterion_id === k.id)
        return [k.name, s?.score == null ? '-' : fmtScore(Number(s.score)), s?.comment?.trim() || '-']
      })
      w.table(['항목', '점수', '심사평'], rows, [2, 0.8, 6])
      const rv = reviewOf.get(a.id)
      if (rv?.overall_comment?.trim()) {
        w.text('종합 의견', { bold: true, size: 9.5, gap: 2 })
        w.text(rv.overall_comment.trim(), { size: 9.5, gap: 6 })
      }
      if (rv?.qna_memo?.trim()) {
        w.text('질의응답 메모', { bold: true, size: 9.5, gap: 2 })
        w.text(rv.qna_memo.trim(), { size: 9.5, gap: 6 })
      }
      w.rule()
    }
  }
  return w.save()
}
