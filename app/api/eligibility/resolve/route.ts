import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fmtDate } from '@/lib/format'
import type { EligibilityCheck } from '@/lib/types'

// C-06 보완 요청 재제출 완료 표시. 기업은 eligibility_checks 수정 정책이 없으므로
// 소유(RLS company_read)·기한을 확인한 뒤 서비스 롤로 resolved_at 만 기록한다.
const Body = z.object({ check_id: z.guid() })

export const POST = handle(async (req: Request) => {
  const { supabase } = await requireApi('company')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')

  const { data } = await supabase.from('eligibility_checks').select('*').eq('id', parsed.data.check_id).maybeSingle()
  const check = data as EligibilityCheck | null
  if (!check) throw new ApiError(404, '보완 요청을 찾을 수 없습니다.')
  if (check.result !== 'supplement') throw new ApiError(400, '보완 요청 항목이 아닙니다.')
  if (check.resolved_at) throw new ApiError(409, `이미 보완 제출했습니다. (${fmtDate(check.resolved_at)})`)
  if (check.due_at && new Date() > new Date(check.due_at)) {
    throw new ApiError(403, `보완 기한이 지났습니다. (기한: ${fmtDate(check.due_at)})`)
  }

  const resolvedAt = new Date().toISOString()
  const { data: updated, error } = await supabaseAdmin().from('eligibility_checks')
    .update({ resolved_at: resolvedAt }).eq('id', check.id).is('resolved_at', null).select('*').maybeSingle()
  if (error) throw error
  if (!updated) throw new ApiError(409, '이미 보완 제출했습니다.')

  await supabase.rpc('log_event', {
    p_action: 'eligibility.resolved', p_table: 'eligibility_checks', p_row: check.id,
    p_meta: { entry_id: check.entry_id, item: check.item },
  })
  return NextResponse.json(updated)
})
