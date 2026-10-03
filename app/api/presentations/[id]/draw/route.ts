import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { siteOrigin } from '@/lib/server/export'
import { DRAW_ALGORITHM, drawOrder } from '@/components/admin/results/draw'
import { emitPresentationSchedule } from '@/components/admin/results/presentation-server'
import type { PresentationSlot, StageEntry } from '@/lib/types'

export const runtime = 'nodejs'

// POST /api/presentations/:stageId/draw — 발표 순서 랜덤 추첨 (A-13)
// 슬롯이 없으면 단계 참가 기업(부적격 제외)으로 생성 후 추첨. 진행 시작된 슬롯이 있으면 거부.
// 시드(crypto random)·결과 순서를 각 슬롯 draw_seed 와 감사로그에 남긴다.
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const { supabase } = await requireApi('admin')
  const stageId = params.id
  const { data: stage } = await supabase.from('stages').select('id, name').eq('id', stageId).maybeSingle()
  if (!stage) throw new ApiError(404, '단계를 찾을 수 없습니다.')

  let { data: slots } = await supabase.from('presentation_slots').select('*').eq('stage_id', stageId)
  if (!slots?.length) {
    const { data: ents } = await supabase.from('stage_entries').select('*').eq('stage_id', stageId)
    const active = ((ents ?? []) as StageEntry[]).filter(e => e.eligibility !== 'ineligible')
    if (!active.length) throw new ApiError(400, '발표 대상 기업이 없습니다.')
    const { error } = await supabase.from('presentation_slots')
      .insert(active.map((e, i) => ({ stage_id: stageId, company_id: e.company_id, order_no: i + 1 })), { defaultToNull: false })
    if (error) throw error
    ;({ data: slots } = await supabase.from('presentation_slots').select('*').eq('stage_id', stageId))
  }
  const list = (slots ?? []) as PresentationSlot[]
  if (list.some(s => s.status !== 'waiting')) throw new ApiError(409, '발표가 이미 시작된 슬롯이 있어 추첨할 수 없습니다.')

  const seed = randomBytes(16).toString('hex')
  const order = drawOrder(list.map(s => s.company_id), seed)
  const slotOf = new Map(list.map(s => [s.company_id, s]))
  for (const [i, companyId] of order.entries()) {
    const { error } = await supabase.from('presentation_slots').update({ order_no: i + 1, draw_seed: seed }).eq('id', slotOf.get(companyId)!.id)
    if (error) throw error
  }

  const { data: comps } = await supabase.from('companies').select('id, name').in('id', order)
  const nameOf = new Map((comps ?? []).map(c => [c.id, c.name]))
  await supabase.rpc('log_event', {
    p_action: 'presentation.draw', p_table: 'stages', p_row: stageId,
    p_meta: { stage_id: stageId, seed, algorithm: DRAW_ALGORITHM, order: order.map((id, i) => ({ order_no: i + 1, company_id: id, name: nameOf.get(id) ?? '' })) },
  })
  await emitPresentationSchedule(supabase, stageId, siteOrigin(req), 'draw')

  return NextResponse.json({ ok: true, seed, algorithm: DRAW_ALGORITHM, order })
})
