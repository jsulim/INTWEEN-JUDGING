import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'

// POST /api/admin/scores — 관리자가 심사위원 점수·심사평을 대신 수정 (잘못 체크한 경우 대비)
// 관리자 본인 세션으로 쓰므로 audit_row 트리거가 수정자·이전 값·새 값을 남기고, 사유는 log_event 로 별도 기록.
// 배점 초과는 validate_score 트리거가 막는다. 확정(잠금) 이후에는 확정 해제 후에만 수정 가능.
const Body = z.object({
  assignment_id: z.string().uuid(),
  scores: z.array(z.object({
    criterion_id: z.string().uuid(),
    score: z.number().min(0).nullable(),
    comment: z.string().max(5000).nullable(),
  })),
  overall_comment: z.string().max(10000).nullable(),
  reason: z.string().trim().min(2),
})

export const POST = handle(async (req: Request) => {
  const { supabase } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '수정 사유를 2자 이상 입력해 주세요.')
  const { assignment_id, scores, overall_comment, reason } = parsed.data

  const { data: asg } = await supabase.from('assignments')
    .select('id, stage_id, judge_id, company_id, conflict, stages(status)').eq('id', assignment_id).maybeSingle()
  if (!asg) throw new ApiError(404, '배정을 찾을 수 없습니다.')
  const status = (asg.stages as unknown as { status: string } | null)?.status
  if (status === 'locked' || status === 'published') throw new ApiError(409, '확정된 단계입니다. 확정을 해제한 뒤 수정해 주세요.')
  if (asg.conflict) throw new ApiError(409, '이해충돌로 제외된 배정입니다.')

  const { data: before } = await supabase.from('scores').select('criterion_id, score').eq('assignment_id', assignment_id)
  const prev = new Map((before ?? []).map(s => [s.criterion_id, s.score == null ? null : Number(s.score)]))

  if (scores.length) {
    const { error } = await supabase.from('scores').upsert(
      scores.map(s => ({ assignment_id, criterion_id: s.criterion_id, score: s.score, comment: s.comment })),
      { onConflict: 'assignment_id,criterion_id', defaultToNull: false })
    if (error) {
      if (error.message.includes('score_exceeds_max')) throw new ApiError(400, '배점을 초과한 점수가 있습니다.')
      throw error
    }
  }
  const { error: rvErr } = await supabase.from('reviews')
    .upsert({ assignment_id, overall_comment }, { onConflict: 'assignment_id', defaultToNull: false })
  if (rvErr) throw rvErr

  await supabase.rpc('log_event', {
    p_action: 'score.admin_edit', p_table: 'assignments', p_row: assignment_id,
    p_meta: {
      reason, stage_id: asg.stage_id, judge_id: asg.judge_id, company_id: asg.company_id,
      changes: scores.filter(s => prev.get(s.criterion_id) !== s.score)
        .map(s => ({ criterion_id: s.criterion_id, from: prev.get(s.criterion_id) ?? null, to: s.score })),
    },
  })
  return NextResponse.json({ ok: true })
})
