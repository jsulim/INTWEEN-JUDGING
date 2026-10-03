import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'

// PATCH /api/presentations/:slotId/state — 현재 발표 기업 전환·발표→질의→완료·불참 (A-13)
// 심사위원 화면(J-06)은 presentation_slots Realtime 구독으로 따라온다.
const Body = z.object({ status: z.enum(['waiting', 'presenting', 'qna', 'done', 'absent']) })

export const PATCH = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const { supabase } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '상태 값이 올바르지 않습니다.')
  const { status } = parsed.data

  const { data: slot } = await supabase.from('presentation_slots').select('id, stage_id, status').eq('id', params.id).maybeSingle()
  if (!slot) throw new ApiError(404, '발표 슬롯을 찾을 수 없습니다.')
  const now = new Date().toISOString()

  // 새 기업이 발표를 시작하면 진행 중이던 다른 기업은 완료 처리
  if (status === 'presenting') {
    const { error } = await supabase.from('presentation_slots').update({ status: 'done', phase_started_at: now })
      .eq('stage_id', slot.stage_id).neq('id', slot.id).in('status', ['presenting', 'qna'])
    if (error) throw error
  }
  const { error } = await supabase.from('presentation_slots')
    .update({ status, phase_started_at: status === 'waiting' ? null : now }).eq('id', slot.id)
  if (error) throw error

  await supabase.rpc('log_event', {
    p_action: 'presentation.state', p_table: 'presentation_slots', p_row: slot.id,
    p_meta: { stage_id: slot.stage_id, from: slot.status, to: status },
  })
  return NextResponse.json({ ok: true, status, phase_started_at: now })
})
