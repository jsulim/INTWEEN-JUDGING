import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'

// POST /api/admin/remarks — 심사위원별 채점표 '비고' 저장 (빈 값이면 삭제). 관리자 전용
const Body = z.object({
  assignment_id: z.string().uuid(),
  remark: z.string().max(2000),
})

export const POST = handle(async (req: Request) => {
  const { supabase, user } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const { assignment_id } = parsed.data
  const remark = parsed.data.remark.trim()

  const { error } = remark
    ? await supabase.from('assignment_remarks').upsert({ assignment_id, remark, updated_by: user.id, updated_at: new Date().toISOString() })
    : await supabase.from('assignment_remarks').delete().eq('assignment_id', assignment_id)
  if (error) {
    if (/assignment_remarks/.test(error.message)) throw new ApiError(503, '비고 기능의 DB 설정(SQL)이 아직 적용되지 않았습니다.')
    throw new Error(error.message)
  }
  await supabase.rpc('log_event', { p_action: 'remark.save', p_table: 'assignment_remarks', p_row: assignment_id, p_meta: { length: remark.length } })
  return NextResponse.json({ ok: true })
})
