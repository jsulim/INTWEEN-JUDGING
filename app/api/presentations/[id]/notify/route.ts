import { NextResponse } from 'next/server'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { siteOrigin } from '@/lib/server/export'
import { emitPresentationSchedule } from '@/components/admin/results/presentation-server'

// POST /api/presentations/:stageId/notify — 발표 순서·시각·화상 링크 배포 (A-13 화상 발표)
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const { supabase } = await requireApi('admin')
  const { count } = await supabase.from('presentation_slots').select('id', { count: 'exact', head: true }).eq('stage_id', params.id)
  if (!count) throw new ApiError(400, '편성된 발표 순서가 없습니다.')
  const r = await emitPresentationSchedule(supabase, params.id, siteOrigin(req), 'distribute')
  await supabase.rpc('log_event', { p_action: 'presentation.notify', p_table: 'stages', p_row: params.id, p_meta: { stage_id: params.id, slots: count } })
  return NextResponse.json({ ok: true, sent: count, n8n: r })
})
