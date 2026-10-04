import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/server'
import { emitEvent } from '@/lib/server/n8n'
import { loadStageResults } from '@/lib/server/stage-data'
import { profilesByUser } from '@/components/admin/setup/server'

// 서버가 판단해 보내는 알림. 발송 여부를 DB 에 먼저 기록(선점)해서
// 수동 상태 변경·5분 tick·여러 대시보드 탭 어디서 불러도 한 번만 나간다.

/** 평가 시작 (evaluation.started): 심사위원별 배정 기업 수·마감일. 이미 보냈으면 false */
export async function notifyEvaluationStarted(stageId: string, site: string) {
  const db = supabaseAdmin()
  const { data: claimed } = await db.from('stages')
    .update({ eval_notified_at: new Date().toISOString() })
    .eq('id', stageId).eq('status', 'evaluating').is('eval_notified_at', null)
    .select('id, name, order_no, eval_end, programs(id, title)')
  const stage = claimed?.[0] as { id: string; name: string; order_no: number; eval_end: string | null; programs: { id: string; title: string } | null } | undefined
  if (!stage) return false

  const { data: asg } = await db.from('assignments').select('judge_id, conflict').eq('stage_id', stageId)
  const counts = new Map<string, number>()
  for (const a of asg ?? []) if (!a.conflict) counts.set(a.judge_id, (counts.get(a.judge_id) ?? 0) + 1)
  if (!counts.size) return true
  const { data: judges } = await db.from('judges').select('id, user_id').in('id', [...counts.keys()])
  const profs = await profilesByUser(db, (judges ?? []).map(j => j.user_id))
  await Promise.all((judges ?? []).map(j => {
    const p = profs.get(j.user_id)
    return emitEvent('evaluation.started', {
      program: stage.programs, stage: { id: stage.id, name: stage.name, order_no: stage.order_no },
      judge: { id: j.id, name: p?.name ?? '', email: p?.email ?? null, phone: p?.phone ?? null },
      assigned_count: counts.get(j.id) ?? 0,
      eval_end: stage.eval_end,
      url: `${site}/j/s/${stage.id}`,
    })
  }))
  return true
}

/** 점수 편차 (score.deviation): 아직 알리지 않은 경고 기업만 묶어서 1회 발송. 보낸 기업 수 반환 */
export async function notifyDeviations(stageId: string, site: string) {
  const db = supabaseAdmin()
  const data = await loadStageResults(db, stageId)
  const alerts = data.results.filter(r => r.deviation_alert)
  if (!alerts.length) return 0

  // 기록에 성공한(처음 보는) 기업만 알린다
  const { data: fresh } = await db.from('deviation_alerts')
    .upsert(alerts.map(r => ({ stage_id: stageId, company_id: r.company_id, deviation: r.deviation })),
      { onConflict: 'stage_id,company_id', ignoreDuplicates: true })
    .select('company_id')
  const ids = new Set((fresh ?? []).map(r => r.company_id as string))
  const items = alerts.filter(r => ids.has(r.company_id))
  if (!items.length) return 0

  const { data: program } = await db.from('programs').select('id, title').eq('id', data.stage.program_id).maybeSingle()
  const { data: judges } = await db.from('judges').select('id, user_id').eq('program_id', data.stage.program_id)
  const profs = await profilesByUser(db, (judges ?? []).map(j => j.user_id))
  const judgeName = new Map((judges ?? []).map(j => [j.id, profs.get(j.user_id)?.name ?? '']))

  await emitEvent('score.deviation', {
    program,
    stage: { id: data.stage.id, name: data.stage.name },
    threshold: Number(data.stage.deviation_alert),
    url: `${site}/a/p/${data.stage.program_id}?stage=${data.stage.id}`,
    items: items.map(r => {
      const c = data.companies.get(r.company_id)
      return {
        company_id: r.company_id,
        company: c?.name ?? '',
        blind_code: c?.blind_code ?? null,
        deviation: r.deviation,
        judges: r.judge_totals.filter(j => j.total != null).map(j => ({ name: judgeName.get(j.judge_id) ?? '', total: j.total })),
      }
    }),
  })
  return items.length
}
