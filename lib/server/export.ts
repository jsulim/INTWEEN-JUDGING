import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import type { CompanyResult, JudgeTotal } from '@/lib/scoring'
import { loadStageResults } from '@/lib/server/stage-data'
import { downloadBytes } from '@/lib/server/storage'
import { sha256 } from '@/lib/server/crypto'
import { fmtDate } from '@/lib/format'
import type { Company, Consent, ConsentTemplate, EvaluationSubmission, Judge, Program, Review, StageResult } from '@/lib/types'

// A-08 결과 화면·/lock·A-09 내보내기·증빙 패키지 공용 로더·빌더.
// 숫자는 모두 loadStageResults() 에서 나온다(Q10). 확정(locked/published) 단계는 그 결과를 저장한 stage_results 스냅샷을 쓴다.

export type ResultSource = 'live' | 'snapshot'

export interface JudgeInfo {
  id: string
  user_id: string
  name: string
  email: string | null
  phone: string | null
  affiliation: string | null
  is_chair: boolean
}

/** stage_results.detail 에 저장하는 값 (스냅샷 → CompanyResult 복원용) */
export function snapshotDetail(r: CompanyResult, options: { normalize: boolean; trim_extremes: boolean; bonus_cap: number }) {
  return {
    criterion_avgs: r.criterion_avgs,
    judge_totals: r.judge_totals,
    done_count: r.done_count,
    in_progress: r.in_progress,
    cutoff_criteria: r.cutoff_criteria,
    tied: r.tied,
    bonus_pending: r.bonus_pending,
    deviation: r.deviation,
    deviation_alert: r.deviation_alert,
    aggregate: r.aggregate,
    options,
  }
}

const num = (v: unknown) => (v == null ? null : Number(v))

export function snapshotToResult(row: StageResult): CompanyResult {
  const d = (row.detail ?? {}) as Record<string, unknown>
  return {
    company_id: row.company_id,
    judge_count: row.judge_count,
    done_count: Number(d.done_count ?? row.judge_count),
    in_progress: !!d.in_progress,
    raw: num(row.raw_score),
    normalized: num(row.normalized_score),
    aggregate: num(d.aggregate ?? row.normalized_score ?? row.raw_score),
    bonus: Number(row.bonus ?? 0),
    bonus_pending: Number(d.bonus_pending ?? 0),
    final: num(row.avg_score),
    cutoff: row.cutoff,
    cutoff_criteria: (d.cutoff_criteria as string[]) ?? [],
    criterion_avgs: (d.criterion_avgs as Record<string, number | null>) ?? {},
    judge_totals: (d.judge_totals as JudgeTotal[]) ?? [],
    deviation: num(d.deviation),
    deviation_alert: !!d.deviation_alert,
    rank: row.rank,
    tied: !!d.tied,
  }
}

export function sortResults(rs: CompanyResult[]) {
  return [...rs].sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank
    if (a.rank != null) return -1
    if (b.rank != null) return 1
    return (b.final ?? -Infinity) - (a.final ?? -Infinity)
  })
}

/** 심사위원 이름·연락처 (judges.user_id → profiles) */
export async function loadJudgeDirectory(supabase: SupabaseClient, programId: string): Promise<JudgeInfo[]> {
  const { data: judges } = await supabase.from('judges').select('*').eq('program_id', programId).order('created_at')
  const js = (judges ?? []) as Judge[]
  const ids = js.map(j => j.user_id)
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('user_id, name, email, phone').in('user_id', ids)
    : { data: [] as { user_id: string; name: string; email: string | null; phone: string | null }[] }
  const pm = new Map((profiles ?? []).map(p => [p.user_id, p]))
  return js.map(j => {
    const p = pm.get(j.user_id)
    return { id: j.id, user_id: j.user_id, name: p?.name || p?.email || '(이름 없음)', email: p?.email ?? null, phone: p?.phone ?? null,
      affiliation: j.affiliation, is_chair: j.is_chair }
  })
}

/**
 * 단계 결과 (확정 단계는 스냅샷, 아니면 실시간) + 심사평·심사위원 정보.
 * A-08 화면과 내보내기가 모두 이 함수를 쓴다.
 */
export async function loadStageReport(supabase: SupabaseClient, stageId: string) {
  const data = await loadStageResults(supabase, stageId)
  const { stage } = data
  let results = data.results
  let source: ResultSource = 'live'
  let lockedAt: string | null = null
  const companies = new Map<string, Company>(data.companies)

  if (stage.status === 'locked' || stage.status === 'published') {
    const { data: snap } = await supabase.from('stage_results').select('*').eq('stage_id', stageId)
    if (snap && snap.length) {
      const rows = snap as StageResult[]
      results = sortResults(rows.map(snapshotToResult))
      source = 'snapshot'
      lockedAt = rows.map(r => r.locked_at).filter(Boolean).sort().pop() ?? null
      const missing = rows.map(r => r.company_id).filter(id => !companies.has(id))
      if (missing.length) {
        const { data: extra } = await supabase.from('companies').select('*').in('id', missing)
        for (const c of (extra ?? []) as Company[]) companies.set(c.id, c)
      }
    }
  }

  const [{ data: program }, judges, { data: reviews }] = await Promise.all([
    supabase.from('programs').select('*').eq('id', stage.program_id).single(),
    loadJudgeDirectory(supabase, stage.program_id),
    data.assignments.length
      ? supabase.from('reviews').select('*').in('assignment_id', data.assignments.map(a => a.id))
      : Promise.resolve({ data: [] as Review[] }),
  ])

  // 이 단계에 배정된 심사위원만 (매트릭스 열)
  const stageJudgeIds = new Set(data.assignments.map(a => a.judge_id))
  const stageJudges = judges.filter(j => stageJudgeIds.has(j.id))

  return {
    ...data,
    program: program as Program,
    companies,
    results,
    source,
    lockedAt,
    judges,
    stageJudges,
    reviews: (reviews ?? []) as Review[],
  }
}
export type StageReport = Awaited<ReturnType<typeof loadStageReport>>

export const companyLabel = (c: Company | undefined) => (c ? c.name : '(삭제된 기업)')

// ─────────────────────────────────────────────────────────────
// 엑셀 (결과 · 점수매트릭스 · 항목별 · 심사평)
// ─────────────────────────────────────────────────────────────
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0EC' } }
const TOP_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF1DC' } }

function styleHeader(ws: ExcelJS.Worksheet, rowNo = 1) {
  const row = ws.getRow(rowNo)
  row.font = { bold: true }
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  row.eachCell(c => { c.fill = HEADER_FILL })
  ws.views = [{ state: 'frozen', ySplit: rowNo }]
}

export async function buildResultsWorkbook(r: StageReport) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'INTWEEN 심사 관리 플랫폼'
  wb.created = new Date()
  const { stage, criteria, results, companies, stageJudges, assignments } = r
  const normalize = stage.normalize
  const sourceNote = r.source === 'snapshot' ? `확정 스냅샷 (${fmtDate(r.lockedAt)})` : `실시간 집계 (${fmtDate(new Date())})`

  // 1) 결과
  const ws = wb.addWorksheet('결과')
  ws.columns = [
    { header: '순위', key: 'rank', width: 7 },
    { header: '블라인드 코드', key: 'code', width: 12 },
    { header: '기업명', key: 'name', width: 28 },
    { header: '심사위원 수', key: 'judges', width: 11 },
    { header: '원점수', key: 'raw', width: 10 },
    { header: '정규화 점수', key: 'norm', width: 11 },
    { header: '가감점', key: 'bonus', width: 9 },
    { header: '최종 점수', key: 'final', width: 10 },
    { header: '과락', key: 'cutoff', width: 8 },
    { header: '비고', key: 'note', width: 26 },
  ]
  styleHeader(ws)
  for (const x of results) {
    const c = companies.get(x.company_id)
    const notes: string[] = []
    if (x.in_progress) notes.push('집계 중')
    if (x.tied) notes.push('공동 순위')
    if (x.cutoff) notes.push('과락: ' + x.cutoff_criteria.map(id => criteria.find(k => k.id === id)?.name ?? id).join(', '))
    if (x.bonus_pending) notes.push(`미승인 가점 ${x.bonus_pending}(0점 처리)`)
    const row = ws.addRow({
      rank: x.rank ?? '-', code: c?.blind_code ?? '', name: companyLabel(c),
      judges: `${x.done_count}/${x.judge_count}`,
      raw: x.raw, norm: normalize ? x.normalized : '미사용', bonus: x.bonus, final: x.final,
      cutoff: x.cutoff ? '과락' : '', note: notes.join(' · '),
    })
    if (x.rank === 1) row.eachCell(cell => { cell.fill = TOP_FILL })
  }
  for (const k of ['raw', 'norm', 'bonus', 'final']) ws.getColumn(k).numFmt = '0.000'
  ws.addRow([])
  ws.addRow([`${r.program.title} · ${stage.name}`])
  ws.addRow([`집계 기준: ${sourceNote} · 정규화 ${normalize ? '사용' : '미사용'} · 최고·최저 제외 ${stage.trim_extremes ? '사용(5인 이상)' : '미사용'} · 가점 상한 ±${stage.bonus_cap}`])

  // 2) 점수매트릭스 (기업 × 심사위원 합계)
  const wm = wb.addWorksheet('점수매트릭스')
  wm.columns = [
    { header: '순위', key: 'rank', width: 7 },
    { header: '기업명', key: 'name', width: 28 },
    ...stageJudges.map(j => ({ header: j.name, key: j.id, width: 12 })),
    { header: '최종 점수', key: 'final', width: 10 },
  ]
  styleHeader(wm)
  for (const x of results) {
    const totals = new Map(x.judge_totals.map(t => [t.judge_id, t]))
    const row: Record<string, unknown> = { rank: x.rank ?? '-', name: companyLabel(companies.get(x.company_id)), final: x.final }
    for (const j of stageJudges) {
      const a = assignments.find(a => a.company_id === x.company_id && a.judge_id === j.id)
      const t = totals.get(j.id)
      row[j.id] = !a ? '' : a.conflict ? '제외(이해충돌)' : t?.total == null ? '미완료' : normalize && t.normalized != null ? `${t.total} (${t.normalized})` : t.total
    }
    wm.addRow(row)
  }
  if (normalize) { wm.addRow([]); wm.addRow(['괄호 안은 정규화 점수']) }

  // 3) 항목별 평균
  const wc = wb.addWorksheet('항목별')
  wc.columns = [
    { header: '순위', key: 'rank', width: 7 },
    { header: '기업명', key: 'name', width: 28 },
    ...criteria.map(k => ({ header: `${k.name} (${Number(k.max_score)})`, key: k.id, width: 14 })),
    { header: '원점수', key: 'raw', width: 10 },
  ]
  styleHeader(wc)
  for (const x of results) {
    const row: Record<string, unknown> = { rank: x.rank ?? '-', name: companyLabel(companies.get(x.company_id)), raw: x.raw }
    for (const k of criteria) row[k.id] = x.criterion_avgs[k.id] ?? null
    const added = wc.addRow(row)
    for (const id of x.cutoff_criteria) {
      const idx = criteria.findIndex(k => k.id === id)
      if (idx >= 0) added.getCell(3 + idx).font = { color: { argb: 'FFC84040' }, bold: true }
    }
  }
  wc.addRow([])
  wc.addRow(['과락 기준', '', ...criteria.map(k => (k.min_pass_score == null ? '' : Number(k.min_pass_score)))])

  // 4) 심사평
  const wr = wb.addWorksheet('심사평')
  wr.columns = [
    { header: '기업명', key: 'company', width: 24 },
    { header: '심사위원', key: 'judge', width: 14 },
    { header: '항목', key: 'criterion', width: 18 },
    { header: '점수', key: 'score', width: 8 },
    { header: '심사평', key: 'comment', width: 70 },
  ]
  styleHeader(wr)
  const judgeName = new Map(r.judges.map(j => [j.id, j.name]))
  const reviewOf = new Map(r.reviews.map(v => [v.assignment_id, v]))
  for (const x of results) {
    const name = companyLabel(companies.get(x.company_id))
    for (const a of assignments.filter(a => a.company_id === x.company_id && !a.conflict)) {
      for (const k of criteria) {
        const s = r.scores.find(s => s.assignment_id === a.id && s.criterion_id === k.id)
        if (!s) continue
        wr.addRow({ company: name, judge: judgeName.get(a.judge_id) ?? '', criterion: k.name, score: s.score == null ? null : Number(s.score), comment: s.comment ?? '' })
      }
      const rv = reviewOf.get(a.id)
      if (rv?.overall_comment) wr.addRow({ company: name, judge: judgeName.get(a.judge_id) ?? '', criterion: '종합 의견', comment: rv.overall_comment })
      if (rv?.qna_memo) wr.addRow({ company: name, judge: judgeName.get(a.judge_id) ?? '', criterion: '질의응답 메모', comment: rv.qna_memo })
    }
  }
  wr.getColumn('comment').alignment = { wrapText: true, vertical: 'top' }

  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}

// ─────────────────────────────────────────────────────────────
// 서명본 (동의서 + 평가표 최종 제출)
// ─────────────────────────────────────────────────────────────
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\n\r\t]+/g, '_').trim().slice(0, 80) || '_'

export interface ZipFile { path: string; bytes: Uint8Array }

export async function collectSignatureFiles(supabase: SupabaseClient, r: StageReport, prefix = '서명본') {
  const judgeIds = r.judges.map(j => j.id)
  const judgeName = new Map(r.judges.map(j => [j.id, j.name]))
  const [{ data: consents }, { data: templates }, { data: evals }] = await Promise.all([
    judgeIds.length ? supabase.from('consents').select('*').in('judge_id', judgeIds) : Promise.resolve({ data: [] as Consent[] }),
    supabase.from('consent_templates').select('*').eq('program_id', r.stage.program_id),
    supabase.from('evaluation_submissions').select('*').eq('stage_id', r.stage.id),
  ])
  const tm = new Map(((templates ?? []) as ConsentTemplate[]).map(t => [t.id, t]))
  const wanted: { path: string; storage: string }[] = []
  for (const c of (consents ?? []) as Consent[]) {
    const t = tm.get(c.template_id)
    wanted.push({
      path: `${prefix}/동의서/${safeName(judgeName.get(c.judge_id) ?? c.judge_id)}_${safeName(t?.title ?? '동의서')}_v${t?.version ?? 1}.pdf`,
      storage: c.signed_pdf_path,
    })
  }
  for (const e of (evals ?? []) as EvaluationSubmission[]) {
    if (!e.signed_pdf_path) continue
    wanted.push({ path: `${prefix}/평가표/${safeName(judgeName.get(e.judge_id) ?? e.judge_id)}_평가표_${safeName(r.stage.name)}.pdf`, storage: e.signed_pdf_path })
  }
  const files: ZipFile[] = []
  const missing: string[] = []
  const seen = new Set<string>()
  await Promise.all(wanted.map(async w => {
    try {
      let p = w.path
      for (let i = 2; seen.has(p); i++) p = w.path.replace(/\.pdf$/, `_${i}.pdf`)
      seen.add(p)
      files.push({ path: p, bytes: await downloadBytes(w.storage) })
    } catch {
      missing.push(`${w.path} (${w.storage})`)
    }
  }))
  files.sort((a, b) => a.path.localeCompare(b.path, 'ko'))
  return { files, missing }
}

export async function zipFiles(files: ZipFile[], extra?: Record<string, string>) {
  const zip = new JSZip()
  for (const f of files) zip.file(f.path, f.bytes)
  for (const [p, s] of Object.entries(extra ?? {})) zip.file(p, s)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

// ─────────────────────────────────────────────────────────────
// 수정 이력 CSV (v_audit_logs: 작업자 이름·단계 포함)
// ─────────────────────────────────────────────────────────────
export interface AuditViewRow {
  id: string
  actor_id: string | null
  action: string
  table_name: string | null
  row_id: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  ip: string | null
  meta: Record<string, unknown> | null
  created_at: string
  actor_name: string | null
  actor_email: string | null
  actor_role: string | null
  stage_id: string | null
  program_id: string | null
}

export const STAGE_AUDIT_TABLES = ['scores', 'reviews', 'criteria', 'assignments', 'stages', 'stage_results', 'evaluation_submissions', 'stage_entries', 'entry_bonuses', 'bonus_rules', 'chair_reviews']

export async function loadStageAudit(supabase: SupabaseClient, stageId: string) {
  const rows: AuditViewRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('v_audit_logs').select('*').eq('stage_id', stageId)
      .order('created_at', { ascending: true }).range(from, from + 999)
    if (error) throw new Error('감사로그 조회 실패: ' + error.message)
    rows.push(...((data ?? []) as AuditViewRow[]))
    if (!data || data.length < 1000) break
  }
  return rows
}

/** update 는 바뀐 컬럼만, insert/delete 는 전체 */
export function diffKeys(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  keys.delete('created_at')
  keys.delete('updated_at')
  const out: { key: string; before: unknown; after: unknown }[] = []
  for (const k of keys) {
    const b = before?.[k]
    const a = after?.[k]
    if (before && after && JSON.stringify(b) === JSON.stringify(a)) continue
    out.push({ key: k, before: b, after: a })
  }
  return out
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function auditCsv(rows: AuditViewRow[]) {
  const head = ['일시(KST)', '작업자', '이메일', '역할', '작업', '테이블', '행 ID', '변경 항목', '이전 값', '새 값', 'IP', '메타']
  const lines = [head.join(',')]
  for (const r of rows) {
    const d = diffKeys(r.before, r.after)
    const keys = d.map(x => x.key).join('; ')
    const b = Object.fromEntries(d.map(x => [x.key, x.before]))
    const a = Object.fromEntries(d.map(x => [x.key, x.after]))
    lines.push([
      fmtDate(r.created_at), r.actor_name ?? (r.actor_id ? r.actor_id : 'system'), r.actor_email ?? '', r.actor_role ?? '',
      r.action, r.table_name ?? '', r.row_id ?? '', keys,
      r.before ? b : '', r.after ? a : '', r.ip ?? '', r.meta ?? '',
    ].map(csvCell).join(','))
  }
  return '﻿' + lines.join('\r\n')
}

export function sha256Hex(bytes: Uint8Array | string) {
  return sha256(bytes)
}

/** 첨부 다운로드 응답 */
export function fileResponse(bytes: Uint8Array, fileName: string, contentType: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_')
  return new Response(new Blob([bytes as BlobPart], { type: contentType }), {
    headers: {
      'content-type': contentType,
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
    },
  })
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function siteOrigin(req: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || new URL(req.url).origin
}

/** 단계별 심사위원 진행 현황: 배정 수 · 완료 수 · 최종 제출 상태 */
export async function loadJudgeProgress(supabase: SupabaseClient, r: Pick<StageReport, 'stage' | 'assignments' | 'scores' | 'criteria' | 'stageJudges'>) {
  const { data: subs } = await supabase.from('evaluation_submissions').select('*').eq('stage_id', r.stage.id)
  const subOf = new Map(((subs ?? []) as EvaluationSubmission[]).map(s => [s.judge_id, s]))
  const nCrit = r.criteria.length
  const filled = new Map<string, number>()
  for (const s of r.scores) if (s.score != null) filled.set(s.assignment_id, (filled.get(s.assignment_id) ?? 0) + 1)
  return r.stageJudges.map(j => {
    const mine = r.assignments.filter(a => a.judge_id === j.id)
    const active = mine.filter(a => !a.conflict)
    const done = active.filter(a => nCrit > 0 && (filled.get(a.id) ?? 0) >= nCrit).length
    return { judge: j, assigned: active.length, conflicts: mine.length - active.length, done, submission: subOf.get(j.id) ?? null }
  })
}
export type JudgeProgress = Awaited<ReturnType<typeof loadJudgeProgress>>[number]
