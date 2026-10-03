import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadStageResults } from '@/lib/server/stage-data'
import type { Profile, Stage } from '@/lib/types'

export async function programStages(supabase: SupabaseClient, programId: string): Promise<Stage[]> {
  const { data } = await supabase.from('stages').select('*').eq('program_id', programId).order('order_no')
  return (data ?? []) as Stage[]
}

/** ?stage= 값이 없으면 진행 중(평가중 > 접수중) → 마지막 진행 단계 → 첫 단계 */
export function pickStage(stages: Stage[], param?: string | string[] | null): Stage | null {
  const p = Array.isArray(param) ? param[0] : param
  if (p) {
    const s = stages.find(x => x.id === p)
    if (s) return s
  }
  return (
    stages.find(s => s.status === 'evaluating') ??
    stages.find(s => s.status === 'submitting') ??
    [...stages].reverse().find(s => s.status !== 'ready') ??
    stages[0] ??
    null
  )
}

export async function profilesByUser(supabase: SupabaseClient, userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter(Boolean))] as string[]
  if (!ids.length) return new Map<string, Profile>()
  const { data } = await supabase.from('profiles').select('*').in('user_id', ids)
  return new Map(((data ?? []) as Profile[]).map(p => [p.user_id, p]))
}

export function requiredTypes(stage: Pick<Stage, 'required_files'>) {
  return (stage.required_files ?? []).filter(f => f.required).map(f => f.type)
}

/** 현재 파일 세트(entry_id → file_type 집합) */
export async function currentFiles(supabase: SupabaseClient, entryIds: string[]) {
  const map = new Map<string, Set<string>>()
  if (!entryIds.length) return map
  const { data } = await supabase.from('submissions').select('entry_id, file_type').eq('is_current', true).in('entry_id', entryIds)
  for (const s of data ?? []) {
    if (!map.has(s.entry_id)) map.set(s.entry_id, new Set())
    map.get(s.entry_id)!.add(s.file_type)
  }
  return map
}

/**
 * A-01 대시보드 집계: 제출률·평가 진행률·심사위원별 진행률·순위(loadStageResults)
 */
export async function stageOverview(supabase: SupabaseClient, stageId: string) {
  const data = await loadStageResults(supabase, stageId)
  const req = requiredTypes(data.stage)
  const files = await currentFiles(supabase, data.entries.map(e => e.id))
  const submittedEntryIds = new Set(
    data.entries.filter(e => (req.length ? req.every(t => files.get(e.id)?.has(t)) : (files.get(e.id)?.size ?? 0) > 0)).map(e => e.id),
  )
  const judgeProgress = new Map<string, { assigned: number; done: number }>()
  for (const r of data.results) {
    for (const jt of r.judge_totals) {
      const cur = judgeProgress.get(jt.judge_id) ?? { assigned: 0, done: 0 }
      cur.assigned += 1
      if (jt.total != null) cur.done += 1
      judgeProgress.set(jt.judge_id, cur)
    }
  }
  const assigned = data.results.reduce((a, r) => a + r.judge_count, 0)
  const done = data.results.reduce((a, r) => a + r.done_count, 0)
  return {
    ...data,
    files,
    requiredCount: req.length,
    entryCount: data.entries.length,
    submittedEntryIds,
    submittedCount: submittedEntryIds.size,
    assigned,
    done,
    judgeProgress,
    alerts: data.results.filter(r => r.deviation_alert),
    inProgressCount: data.results.filter(r => r.in_progress && r.judge_count > 0).length,
  }
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export function siteUrl(req?: Request) {
  const env = process.env.NEXT_PUBLIC_SITE_URL
  if (env) return env.replace(/\/$/, '')
  if (req) return new URL(req.url).origin
  return 'http://localhost:3000'
}
