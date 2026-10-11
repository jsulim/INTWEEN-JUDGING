import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'

// POST /api/eval/reopen — 특정 심사위원 평가 재오픈 (A-08, J-07). 사유 필수 → 감사로그
const Body = z.object({ judge_id: z.string().uuid(), stage_id: z.string().uuid(), reason: z.string().trim().min(2) })

export const POST = handle(async (req: Request) => {
  const { supabase, user } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '재오픈 사유를 입력해 주세요.')
  const { judge_id, stage_id, reason } = parsed.data

  const { data: stage } = await supabase.from('stages').select('id, status').eq('id', stage_id).maybeSingle()
  if (!stage) throw new ApiError(404, '단계를 찾을 수 없습니다.')
  if (stage.status === 'locked' || stage.status === 'published') {
    throw new ApiError(409, '확정된 단계입니다. 단계 확정을 해제한 뒤 재오픈해 주세요.')
  }

  const { data: sub } = await supabase.from('evaluation_submissions').select('id, status')
    .eq('judge_id', judge_id).eq('stage_id', stage_id).maybeSingle()
  if (!sub) throw new ApiError(404, '최종 제출 기록이 없습니다.')
  if (sub.status === 'reopened') throw new ApiError(409, '이미 재오픈된 평가입니다.')

  const now = new Date().toISOString()
  const { error } = await supabase.from('evaluation_submissions')
    .update({ status: 'reopened', reopened_by: user.id, reopened_at: now, reopen_reason: reason })
    .eq('id', sub.id)
  if (error) throw error
  // 제출 시 'submitted' 로 바뀐 종합 심사평 상태를 되돌린다
  const { data: asg } = await supabase.from('assignments').select('id').eq('judge_id', judge_id).eq('stage_id', stage_id)
  const ids = (asg ?? []).map(a => a.id)
  if (ids.length) await supabaseAdmin().from('reviews').update({ status: 'draft' }).in('assignment_id', ids)

  await supabase.rpc('log_event', {
    p_action: 'eval.reopen', p_table: 'evaluation_submissions', p_row: sub.id,
    p_meta: { judge_id, stage_id, reason },
  })
  return NextResponse.json({ ok: true, reopened_at: now })
})
