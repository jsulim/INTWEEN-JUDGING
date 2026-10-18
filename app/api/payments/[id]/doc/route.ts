import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { signedViewUrl } from '@/lib/server/storage'
import type { JudgePayment } from '@/lib/types'

export const runtime = 'nodejs'

const Body = z.object({ kind: z.enum(['id_card', 'bank_copy']) })

// POST /api/payments/:id/doc — 정산 권한자만 신분증·통장 사본 열람 (10분 서명 URL) + 열람 로그
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const { supabase, profile } = await requireApi('admin')
  if (!profile.can_pay) throw new ApiError(403, '정산 권한자만 증빙 사본을 열람할 수 있습니다.')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const { data } = await supabase.from('judge_payments').select('*').eq('id', params.id).maybeSingle()
  const p = data as JudgePayment | null
  if (!p) throw new ApiError(404, '정산 정보를 찾을 수 없습니다.')
  const path = parsed.data.kind === 'id_card' ? p.id_card_path : p.bank_copy_path
  if (!path) throw new ApiError(404, '올라온 사본이 없습니다.')
  await supabase.rpc('log_event', {
    p_action: 'view', p_table: 'judge_payments', p_row: p.id,
    p_meta: { judge_id: p.judge_id, program_id: p.program_id, fields: [parsed.data.kind] },
  })
  return NextResponse.json({ url: await signedViewUrl(path) })
})
