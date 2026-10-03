import { NextResponse } from 'next/server'
import { handle } from '@/lib/server/auth'
import { assertCron } from '@/components/admin/results/cron'
import { emitEvent } from '@/lib/server/n8n'
import { supabaseAdmin } from '@/lib/supabase/server'
import { siteOrigin } from '@/lib/server/export'
import type { Company, Program, RequiredFile, Stage, StageEntry } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY = 86_400_000

/** 마감까지 남은 시간이 (d-1, d]일 이면 D-d. 하루 1회 실행 시 정확히 한 번 걸린다 */
function dWindow(deadline: string | null, now: number, days: number[]) {
  if (!deadline) return null
  const ms = new Date(deadline).getTime() - now
  for (const d of days) if (ms > (d - 1) * DAY && ms <= d * DAY) return d
  return null
}

type Prof = { user_id: string; name: string; email: string | null; phone: string | null }

// GET /api/cron/daily — 리마인드 이벤트 (Vercel Cron, Authorization: Bearer CRON_SECRET)
//  submission.reminder (접수 마감 D-3·D-1 미제출 기업) · evaluation.reminder (평가 마감 D-1 미완료 심사위원)
//  retention.upcoming (보유기간 만료 D-30). 발표 10분 전 알림은 /api/webhooks/n8n 조회로 처리.
export const GET = handle(async (req: Request) => {
  assertCron(req)
  const db = supabaseAdmin()
  const now = Date.now()
  const site = siteOrigin(req)
  const sent = { submission: 0, evaluation: 0, retention: 0 }

  const { data: stageRows } = await db.from('stages').select('*, programs(id, title, status)')
    .in('status', ['ready', 'submitting', 'evaluating'])
  const stages = (stageRows ?? []) as (Stage & { programs: Pick<Program, 'id' | 'title' | 'status'> })[]

  const profiles = async (ids: string[]) => {
    if (!ids.length) return new Map<string, Prof>()
    const { data } = await db.from('profiles').select('user_id, name, email, phone').in('user_id', ids)
    return new Map(((data ?? []) as Prof[]).map(p => [p.user_id, p]))
  }

  // ── 접수 마감 D-3, D-1: 필수 파일 미제출 기업
  for (const s of stages) {
    if (s.status === 'evaluating') continue
    const d = dWindow(s.submit_end, now, [1, 3])
    if (!d) continue
    const required = ((s.required_files ?? []) as RequiredFile[]).filter(f => f.required)
    if (!required.length) continue
    const { data: ents } = await db.from('stage_entries').select('*, companies(*)').eq('stage_id', s.id).neq('eligibility', 'ineligible')
    const entries = (ents ?? []) as (StageEntry & { companies: Company })[]
    if (!entries.length) continue
    const { data: subs } = await db.from('submissions').select('entry_id, file_type').eq('is_current', true).in('entry_id', entries.map(e => e.id))
    const have = new Set((subs ?? []).map(x => `${x.entry_id}:${x.file_type}`))
    const owners = await profiles(entries.map(e => e.companies.owner_user_id).filter(Boolean) as string[])
    const missing = entries.map(e => {
      const m = required.filter(f => !have.has(`${e.id}:${f.type}`))
      const o = e.companies.owner_user_id ? owners.get(e.companies.owner_user_id) : undefined
      return {
        company_id: e.company_id, name: e.companies.name,
        email: e.companies.contact_email ?? o?.email ?? null, phone: o?.phone ?? null,
        missing: m.map(f => f.label),
      }
    }).filter(x => x.missing.length)
    if (!missing.length) continue
    await emitEvent('submission.reminder', {
      program: { id: s.programs.id, title: s.programs.title }, stage: { id: s.id, name: s.name },
      d_day: d, submit_end: s.submit_end, submit_url: `${site}/c/submit/${s.id}`, companies: missing,
    })
    sent.submission++
  }

  // ── 평가 마감 D-1: 남은 기업이 있거나 최종 제출 전인 심사위원
  for (const s of stages) {
    if (s.status !== 'evaluating') continue
    if (dWindow(s.eval_end, now, [1]) !== 1) continue
    const [{ data: asg }, { count: nCrit }, { data: subs }] = await Promise.all([
      db.from('assignments').select('id, judge_id').eq('stage_id', s.id).eq('conflict', false),
      db.from('criteria').select('id', { count: 'exact', head: true }).eq('stage_id', s.id),
      db.from('evaluation_submissions').select('judge_id, status').eq('stage_id', s.id),
    ])
    const assignments = asg ?? []
    if (!assignments.length || !nCrit) continue
    const { data: scores } = await db.from('scores').select('assignment_id, score').in('assignment_id', assignments.map(a => a.id)).not('score', 'is', null)
    const filled = new Map<string, number>()
    for (const x of scores ?? []) filled.set(x.assignment_id, (filled.get(x.assignment_id) ?? 0) + 1)
    const submitted = new Set((subs ?? []).filter(x => x.status === 'submitted').map(x => x.judge_id))
    const byJudge = new Map<string, { total: number; remaining: number }>()
    for (const a of assignments) {
      const cur = byJudge.get(a.judge_id) ?? { total: 0, remaining: 0 }
      cur.total++
      if ((filled.get(a.id) ?? 0) < nCrit) cur.remaining++
      byJudge.set(a.judge_id, cur)
    }
    const pending = [...byJudge.entries()].filter(([jid, v]) => v.remaining > 0 || !submitted.has(jid))
    if (!pending.length) continue
    const { data: judges } = await db.from('judges').select('id, user_id').in('id', pending.map(([id]) => id))
    const jUser = new Map((judges ?? []).map(j => [j.id, j.user_id]))
    const profs = await profiles([...jUser.values()])
    await emitEvent('evaluation.reminder', {
      program: { id: s.programs.id, title: s.programs.title }, stage: { id: s.id, name: s.name },
      d_day: 1, eval_end: s.eval_end, url: `${site}/j/s/${s.id}`,
      judges: pending.map(([jid, v]) => {
        const p = profs.get(jUser.get(jid) ?? '')
        return { judge_id: jid, name: p?.name ?? '', email: p?.email ?? null, phone: p?.phone ?? null,
          assigned: v.total, remaining: v.remaining, final_submitted: submitted.has(jid) }
      }),
    })
    sent.evaluation++
  }

  // ── 개인정보 파기 예정 D-30
  const { data: progs } = await db.from('programs').select('*').not('closed_at', 'is', null)
  for (const p of (progs ?? []) as Program[]) {
    const due = new Date(p.closed_at!)
    due.setFullYear(due.getFullYear() + p.retention_years)
    if (dWindow(due.toISOString(), now, [30]) !== 30) continue
    await emitEvent('retention.upcoming', {
      program: { id: p.id, title: p.title }, closed_at: p.closed_at, retention_years: p.retention_years,
      dispose_at: due.toISOString(), d_day: 30,
      targets: ['신청서 응답', '제출 파일(Storage)', '심사위원 정산 정보(계좌·주민등록번호)', '동의서·평가표 서명 파일'],
      audit_url: `${site}/a/audit?tab=disposal`,
    })
    sent.retention++
  }

  return NextResponse.json({ ok: true, at: new Date(now).toISOString(), sent })
})
