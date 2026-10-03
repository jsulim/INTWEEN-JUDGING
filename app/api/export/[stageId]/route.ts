import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { buildResultsWorkbook, collectSignatureFiles, fileResponse, loadStageReport, safeName, XLSX_TYPE, zipFiles } from '@/lib/server/export'
import { buildReviewsPdf } from '@/lib/server/pdf-reviews'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/export/:stageId?type=excel|reviews|signatures — 결과표 엑셀 / 심사평 PDF / 서명본 일괄 ZIP (A-09)
export const GET = handle(async (req: Request, { params }: { params: { stageId: string } }) => {
  const { supabase } = await requireApi('admin')
  const type = new URL(req.url).searchParams.get('type') ?? 'excel'
  if (!['excel', 'reviews', 'signatures'].includes(type)) throw new ApiError(400, '알 수 없는 내보내기 형식입니다.')

  const report = await loadStageReport(supabase, params.stageId).catch(() => { throw new ApiError(404, '단계를 찾을 수 없습니다.') })
  const base = safeName(`${report.program.title}_${report.stage.name}`)
  const stamp = new Date().toISOString().slice(0, 10)

  await supabase.rpc('log_event', {
    p_action: 'export', p_table: 'stages', p_row: report.stage.id,
    p_meta: { stage_id: report.stage.id, type, source: report.source },
  })

  if (type === 'excel') {
    const bytes = await buildResultsWorkbook(report)
    return fileResponse(bytes, `${base}_결과표_${stamp}.xlsx`, XLSX_TYPE)
  }
  if (type === 'reviews') {
    const bytes = await buildReviewsPdf(report)
    return fileResponse(bytes, `${base}_심사평_${stamp}.pdf`, 'application/pdf')
  }
  const { files, missing } = await collectSignatureFiles(supabase, report, '')
  const flat = files.map(f => ({ ...f, path: f.path.replace(/^\//, '') }))
  const bytes = await zipFiles(flat, missing.length ? { '누락_목록.txt': `내려받지 못한 파일\n${missing.join('\n')}\n` } : undefined)
  return fileResponse(bytes, `${base}_서명본_${stamp}.zip`, 'application/zip')
})
