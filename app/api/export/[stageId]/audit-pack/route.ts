import { ApiError, handle, requireApi } from '@/lib/server/auth'
import {
  auditCsv, buildResultsWorkbook, collectSignatureFiles, fileResponse, loadStageAudit, loadStageReport, safeName, sha256Hex,
  zipFiles, type ZipFile,
} from '@/lib/server/export'
import { buildReviewsPdf } from '@/lib/server/pdf-reviews'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// GET /api/export/:stageId/audit-pack — 증빙 패키지 ZIP (4-1 감사)
// 평가표 원본(엑셀) · 서명본(동의서·평가표) · 심사평 PDF · 수정 이력 CSV + manifest.json(SHA-256)
export const GET = handle(async (_req: Request, { params }: { params: { stageId: string } }) => {
  const { supabase, user, profile } = await requireApi('admin')
  const report = await loadStageReport(supabase, params.stageId).catch(() => { throw new ApiError(404, '단계를 찾을 수 없습니다.') })
  const { stage, program } = report

  const [excel, reviews, signatures, audit] = await Promise.all([
    buildResultsWorkbook(report),
    buildReviewsPdf(report),
    collectSignatureFiles(supabase, report, '02_서명본'),
    loadStageAudit(supabase, stage.id),
  ])

  const enc = new TextEncoder()
  const files: ZipFile[] = [
    { path: '01_평가표_원본/결과표.xlsx', bytes: excel },
    ...signatures.files,
    { path: '03_심사평/심사평.pdf', bytes: reviews },
    { path: '04_수정이력/수정이력.csv', bytes: enc.encode(auditCsv(audit)) },
  ]
  if (signatures.missing.length) {
    files.push({ path: '02_서명본/누락_목록.txt', bytes: enc.encode(`내려받지 못한 파일\n${signatures.missing.join('\n')}\n`) })
  }

  const generatedAt = new Date().toISOString()
  const manifest = {
    generator: 'INTWEEN 심사 관리 플랫폼',
    generated_at: generatedAt,
    generated_by: { user_id: user.id, name: profile.name, email: profile.email },
    program: { id: program.id, title: program.title },
    stage: { id: stage.id, name: stage.name, order_no: stage.order_no, status: stage.status },
    result_source: report.source === 'snapshot' ? `stage_results 확정 스냅샷 (${report.lockedAt})` : '실시간 집계 (미확정)',
    scoring_options: { normalize: stage.normalize, trim_extremes: stage.trim_extremes, bonus_cap: Number(stage.bonus_cap) },
    counts: { companies: report.results.length, judges: report.stageJudges.length, audit_rows: audit.length, signatures: signatures.files.length },
    hash_algorithm: 'SHA-256',
    files: files.map(f => ({ path: f.path, bytes: f.bytes.byteLength, sha256: sha256Hex(f.bytes) })),
  }
  const bytes = await zipFiles(files, { 'manifest.json': JSON.stringify(manifest, null, 2) })

  await supabase.rpc('log_event', {
    p_action: 'export', p_table: 'stages', p_row: stage.id,
    p_meta: { stage_id: stage.id, type: 'audit-pack', files: files.length, zip_sha256: sha256Hex(bytes) },
  })

  const name = `${safeName(`${program.title}_${stage.name}`)}_증빙패키지_${generatedAt.slice(0, 10)}.zip`
  return fileResponse(bytes, name, 'application/zip')
})
