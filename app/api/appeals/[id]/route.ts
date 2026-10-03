import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import type { Appeal } from '@/lib/types'

// PATCH /api/appeals/:id — 이의신청 검토 의견·재심 여부·결정·회신 (A-14)
const Body = z.object({
  status: z.enum(['received', 'reviewing', 'accepted', 'rejected']).optional(),
  review_note: z.string().nullish(),
  rereview: z.boolean().nullish(),
  response: z.string().nullish(),
})

export const PATCH = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const { supabase, user } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '입력값을 확인해 주세요.')
  const b = parsed.data

  const { data: cur } = await supabase.from('appeals').select('*').eq('id', params.id).maybeSingle()
  if (!cur) throw new ApiError(404, '이의신청을 찾을 수 없습니다.')
  const appeal = cur as Appeal

  const patch: Record<string, unknown> = {}
  if (b.review_note !== undefined) patch.review_note = b.review_note?.trim() || null
  if (b.rereview !== undefined) patch.rereview = b.rereview
  if (b.response !== undefined) patch.response = b.response?.trim() || null
  if (b.status) {
    patch.status = b.status
    const deciding = b.status === 'accepted' || b.status === 'rejected'
    if (deciding) {
      const response = (patch.response ?? appeal.response) as string | null
      if (!response) throw new ApiError(400, '결정 시 기업에 보낼 회신 내용을 입력해 주세요.')
      patch.decided_by = user.id
      patch.decided_at = new Date().toISOString()
    } else {
      patch.decided_by = null
      patch.decided_at = null
    }
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true })

  const { error } = await supabase.from('appeals').update(patch).eq('id', appeal.id)
  if (error) throw error
  if (b.status && b.status !== appeal.status) {
    await supabase.rpc('log_event', {
      p_action: 'appeal.decide', p_table: 'appeals', p_row: appeal.id,
      p_meta: { entry_id: appeal.entry_id, from: appeal.status, to: b.status, rereview: patch.rereview ?? appeal.rereview },
    })
  }
  return NextResponse.json({ ok: true })
})
