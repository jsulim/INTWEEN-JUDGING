import { NextResponse } from 'next/server'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { emitEvent } from '@/lib/server/n8n'
import { STAGE_FLOW, STAGE_STATUS } from '@/lib/format'
import { profilesByUser, siteUrl } from '@/components/admin/setup/server'
import type { Stage, StageStatus } from '@/lib/types'

// PATCH /api/stages/:id/status — 단계 상태 변경 (A-03)
// body: { status, reason? }  · 확정(locked)은 POST /api/stages/:id/lock 사용 (결과공개→확정 공개 취소만 예외)
// 확정·결과공개 상태에서 이전 상태로 되돌리기(확정 해제)는 사유 필수 → 감사로그(log_event)
export const PATCH = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const { supabase } = await requireApi('admin')
  const body = (await req.json().catch(() => ({}))) as { status?: StageStatus; reason?: string }
  const target = body.status
  const reason = (body.reason ?? '').trim()
  if (!target || !STAGE_FLOW.includes(target)) throw new ApiError(400, '변경할 상태가 올바르지 않습니다.')

  const { data: stageRow } = await supabase.from('stages').select('*, programs(id, title)').eq('id', params.id).maybeSingle()
  if (!stageRow) throw new ApiError(404, '단계를 찾을 수 없습니다.')
  const stage = stageRow as Stage & { programs: { id: string; title: string } }
  const from = stage.status
  if (from === target) return NextResponse.json({ ok: true, status: from })

  // 확정(locked)으로의 전진은 점수 스냅샷이 필요하므로 /lock 사용. 결과공개 → 확정(공개 취소)만 여기서 허용
  if (target === 'locked' && from !== 'published') {
    throw new ApiError(400, '확정은 점수 확정(잠금) 기능으로 진행해 주세요. (POST /api/stages/:id/lock)')
  }
  const fromIdx = STAGE_FLOW.indexOf(from)
  const toIdx = STAGE_FLOW.indexOf(target)
  const unlocking = (from === 'locked' || from === 'published') && toIdx < fromIdx
  if (unlocking && reason.length < 2) throw new ApiError(400, '확정 해제 사유를 입력해 주세요.')
  if (target === 'published' && from !== 'locked') throw new ApiError(400, '결과 공개는 확정된 단계에서만 가능합니다.')
  if (target === 'published') {
    // 통과/탈락이 정해지지 않은 기업이 있으면 공개하지 않는다 (기업 화면에 '심사 중'으로 남는 것을 방지)
    const { count } = await supabase.from('stage_entries').select('id', { count: 'exact', head: true })
      .eq('stage_id', stage.id).eq('result', 'pending').neq('eligibility', 'ineligible')
    if (count) throw new ApiError(400, `통과/탈락이 정해지지 않은 기업이 ${count}개 있습니다. 평가 결과 화면에서 통과 확정을 먼저 진행해 주세요.`)
  }

  const patch: Partial<Stage> = { status: target }
  if (target === 'published') patch.published_at = new Date().toISOString()
  if (toIdx < STAGE_FLOW.indexOf('published')) patch.published_at = null

  const { error } = await supabase.from('stages').update(patch).eq('id', stage.id)
  if (error) throw error

  await supabase.rpc('log_event', {
    p_action: unlocking ? 'stage.unlock' : 'stage.status',
    p_table: 'stages',
    p_row: stage.id,
    p_meta: { from, to: target, reason: reason || null, rollback: toIdx < fromIdx },
  })

  const program = { id: stage.programs.id, title: stage.programs.title }
  const stageInfo = { id: stage.id, name: stage.name, order_no: stage.order_no }
  const site = siteUrl(req)

  if (target === 'evaluating' && toIdx > fromIdx) {
    // 평가 시작: 심사위원별 배정 기업 수·마감일
    const { data: asg } = await supabase.from('assignments').select('judge_id, conflict').eq('stage_id', stage.id)
    const counts = new Map<string, number>()
    for (const a of asg ?? []) if (!a.conflict) counts.set(a.judge_id, (counts.get(a.judge_id) ?? 0) + 1)
    if (counts.size) {
      const { data: judges } = await supabase.from('judges').select('id, user_id').in('id', [...counts.keys()])
      const profs = await profilesByUser(supabase, (judges ?? []).map(j => j.user_id))
      await Promise.all((judges ?? []).map(j => {
        const p = profs.get(j.user_id)
        return emitEvent('evaluation.started', {
          program, stage: stageInfo,
          judge: { id: j.id, name: p?.name ?? '', email: p?.email ?? null, phone: p?.phone ?? null },
          assigned_count: counts.get(j.id) ?? 0,
          eval_end: stage.eval_end,
          url: `${site}/j/s/${stage.id}`,
        })
      }))
    }
  }

  if (target === 'published') {
    const { data: entries } = await supabase.from('stage_entries').select('result').eq('stage_id', stage.id)
    const tally = { pass: 0, fail: 0, pending: 0 }
    for (const e of entries ?? []) tally[e.result as keyof typeof tally]++
    await emitEvent('stage.published', {
      program, stage: stageInfo, published_at: patch.published_at,
      score_visible: stage.score_visible, appeal_days: stage.appeal_days,
      counts: tally, url: `${site}/c/results`,
    })
  }

  return NextResponse.json({ ok: true, status: target, message: `${STAGE_STATUS[from]} → ${STAGE_STATUS[target]}` })
})
