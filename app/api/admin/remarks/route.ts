import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { saveRemark } from '@/lib/server/remarks'

// POST /api/admin/remarks — 심사위원별 채점표 '비고' 저장 (빈 값이면 삭제, all_judges 면 그 팀의 모든 심사위원에 일괄). 관리자 전용
const Body = z.object({
  assignment_id: z.guid(),
  remark: z.string().max(2000),
  all_judges: z.boolean().optional(),
})

export const POST = handle(async (req: Request) => {
  const { supabase, user } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const b = parsed.data
  const { count } = await saveRemark(supabase, { assignmentId: b.assignment_id, remark: b.remark, allJudges: !!b.all_judges, userId: user.id })
  await supabase.rpc('log_event', { p_action: 'remark.save', p_table: 'assignment_remarks', p_row: b.assignment_id, p_meta: { length: b.remark.trim().length, count } })
  return NextResponse.json({ ok: true, count })
})
