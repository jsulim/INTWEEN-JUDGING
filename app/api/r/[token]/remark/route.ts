import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { loadResultShare } from '@/lib/server/result-share'
import { saveRemark } from '@/lib/server/remarks'

// POST /api/r/<token>/remark — 결과 열람 링크(기관 담당자)에서 심사위원별 채점표 '비고' 작성. 링크의 대회 배정만.
const Body = z.object({
  assignment_id: z.guid(),
  remark: z.string().max(2000),
  all_judges: z.boolean().optional(),
})

export const POST = handle(async (req: Request, { params }: { params: { token: string } }) => {
  const share = await loadResultShare(params.token)
  if (!share) throw new ApiError(404, '링크가 만료되었거나 사용이 중지되었습니다.')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const b = parsed.data
  const db = supabaseAdmin()
  const { count } = await saveRemark(db, { assignmentId: b.assignment_id, remark: b.remark, allJudges: !!b.all_judges, userId: null, programId: share.program_id })
  await db.from('audit_logs').insert({ actor_id: null, action: 'remark.save', table_name: 'assignment_remarks', row_id: b.assignment_id, meta: { via: 'result_share', share_id: share.id, length: b.remark.trim().length, count } })
    .then(() => null, () => null)
  return NextResponse.json({ ok: true, count })
})
