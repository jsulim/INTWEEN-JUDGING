import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handle } from '@/lib/server/auth'
import { assertCron } from '@/components/admin/results/cron'
import { BUCKET } from '@/lib/server/storage'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Program } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const METHOD = '자동 파기'
const OPERATOR = 'system'

/** prefix 아래 모든 객체 경로 (재귀) */
async function listAll(db: SupabaseClient, prefix: string): Promise<string[]> {
  const out: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000, offset })
    if (error || !data?.length) break
    for (const item of data) {
      const p = `${prefix}/${item.name}`
      if (item.id == null) out.push(...(await listAll(db, p))) // 폴더
      else out.push(p)
    }
    if (data.length < 1000) break
  }
  return out
}

async function removeObjects(db: SupabaseClient, paths: string[]) {
  let n = 0
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100)
    const { data, error } = await db.storage.from(BUCKET).remove(chunk)
    if (error) throw new Error(`Storage 삭제 실패: ${error.message}`)
    n += data?.length ?? 0
  }
  return n
}

const ids = <T extends { id: string }>(rows: T[] | null) => (rows ?? []).map(r => r.id)

// GET /api/cron/retention — 보유기간(closed_at + retention_years) 경과 프로그램 개인정보 자동 파기 (4-1)
// 신청서 응답·제출 파일·정산 정보·서명 파일 삭제 + 파기 대장(disposal_logs) 기록. 재실행해도 안전(멱등).
export const GET = handle(async (req: Request) => {
  assertCron(req)
  const db = supabaseAdmin()
  const now = new Date()
  const { data: progs } = await db.from('programs').select('*').not('closed_at', 'is', null)
  const expired = ((progs ?? []) as Program[]).filter(p => {
    const due = new Date(p.closed_at!)
    due.setFullYear(due.getFullYear() + p.retention_years)
    return due < now
  })

  const report: { program_id: string; title: string; disposed: Record<string, number>; skipped?: boolean }[] = []
  for (const p of expired) {
    const [{ data: stages }, { data: judges }, { data: companies }] = await Promise.all([
      db.from('stages').select('id').eq('program_id', p.id),
      db.from('judges').select('id').eq('program_id', p.id),
      db.from('companies').select('id').eq('program_id', p.id),
    ])
    const stageIds = ids(stages)
    const judgeIds = ids(judges)
    const companyIds = ids(companies)
    const { data: entries } = stageIds.length ? await db.from('stage_entries').select('id').in('stage_id', stageIds) : { data: [] }
    const entryIds = ids(entries as { id: string }[] | null)

    // ── Storage: 제출 파일·가점 증빙·이의신청 첨부·동의서·평가표 서명
    const explicit: string[] = []
    if (judgeIds.length) {
      const { data: cs } = await db.from('consents').select('signature_path, signed_pdf_path').in('judge_id', judgeIds)
      for (const c of cs ?? []) explicit.push(c.signature_path, c.signed_pdf_path)
      const { data: es } = await db.from('evaluation_submissions').select('signature_path, signed_pdf_path').in('judge_id', judgeIds)
      for (const e of es ?? []) explicit.push(e.signature_path, e.signed_pdf_path)
    }
    if (stageIds.length) {
      const { data: cr } = await db.from('chair_reviews').select('signature_path').in('stage_id', stageIds)
      for (const c of cr ?? []) explicit.push(c.signature_path)
    }
    if (entryIds.length) {
      const { data: eb } = await db.from('entry_bonuses').select('evidence_path').in('entry_id', entryIds)
      for (const b of eb ?? []) explicit.push(b.evidence_path)
      const { data: ap } = await db.from('appeals').select('attachment_path').in('entry_id', entryIds)
      for (const a of ap ?? []) explicit.push(a.attachment_path)
    }
    const prefixed = [
      ...(await listAll(db, p.id)),
      ...(await Promise.all(judgeIds.map(j => listAll(db, `consents/${j}`)))).flat(),
      ...(await Promise.all(stageIds.map(s => listAll(db, `evaluations/${s}`)))).flat(),
    ]
    const signatureSet = new Set([...explicit.filter(Boolean)].filter(x => !x.startsWith(`${p.id}/`)))
    for (const x of prefixed) if (x.startsWith('consents/') || x.startsWith('evaluations/')) signatureSet.add(x)
    const submissionObjs = prefixed.filter(x => x.startsWith(`${p.id}/`))

    const disposed: Record<string, number> = {}
    disposed['제출 파일·첨부(Storage)'] = await removeObjects(db, submissionObjs)
    disposed['서명본·증빙 파일(Storage: 동의서·평가표·가점 증빙·이의신청 첨부)'] = await removeObjects(db, [...signatureSet])

    // ── DB 행
    if (entryIds.length) {
      const { count } = await db.from('submissions').delete({ count: 'exact' }).in('entry_id', entryIds)
      disposed['제출 파일 기록(submissions)'] = count ?? 0
      await db.from('entry_bonuses').update({ evidence_path: null }).in('entry_id', entryIds).not('evidence_path', 'is', null)
      await db.from('appeals').update({ attachment_path: null }).in('entry_id', entryIds).not('attachment_path', 'is', null)
    }
    if (companyIds.length) {
      const { count } = await db.from('application_answers').delete({ count: 'exact' }).in('company_id', companyIds)
      disposed['신청서 응답(application_answers)'] = count ?? 0
    }
    {
      const { count } = await db.from('judge_payments').delete({ count: 'exact' }).eq('program_id', p.id)
      disposed['심사위원 정산 정보(judge_payments)'] = count ?? 0
    }

    const done = Object.entries(disposed).filter(([, n]) => n > 0)
    if (done.length) {
      const { error } = await db.from('disposal_logs').insert(done.map(([target, n]) => ({
        program_id: p.id, program_title: p.title, target: `${target} ${n}건`, method: METHOD, operator: OPERATOR, disposed_at: now.toISOString(),
      })), { defaultToNull: false })
      if (error) throw error
      report.push({ program_id: p.id, title: p.title, disposed })
    } else {
      // 이미 파기된 프로그램: 처음 한 번만 '대상 없음' 기록
      const { count } = await db.from('disposal_logs').select('id', { count: 'exact', head: true }).eq('program_id', p.id).eq('method', METHOD)
      if (!count) {
        await db.from('disposal_logs').insert({ program_id: p.id, program_title: p.title, target: '파기 대상 없음 (보유 자료 없음)', method: METHOD, operator: OPERATOR })
      }
      report.push({ program_id: p.id, title: p.title, disposed, skipped: true })
    }
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), programs: report })
})
