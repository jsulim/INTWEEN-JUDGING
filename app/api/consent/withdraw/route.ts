import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { BUCKET } from '@/lib/server/storage'
import { CONSENT_CONFLICT_REASON } from '@/lib/consent-conflict'

// 동의서 서명 취소: 본인 서명만, 평가표를 최종 제출하기 전까지만. 서명 기록·서명본 파일을 지우고 다시 서명할 수 있게 한다
const Body = z.object({ consent_id: z.string().min(1) })

export const POST = handle(async (req: Request) => {
  const { supabase, user } = await requireApi('judge')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const admin = supabaseAdmin()

  const { data: c } = await admin.from('consents')
    .select('*, judges!inner(user_id)')
    .eq('id', parsed.data.consent_id).maybeSingle()
  const owner = (c?.judges as unknown as { user_id: string } | null)?.user_id
  if (!c || owner !== user.id) throw new ApiError(404, '서명 기록을 찾을 수 없습니다.')

  const { count } = await admin.from('evaluation_submissions')
    .select('id', { count: 'exact', head: true }).eq('judge_id', c.judge_id).eq('status', 'submitted')
  if (count) throw new ApiError(409, '평가표를 최종 제출한 뒤에는 동의서 서명을 취소할 수 없습니다. 운영사무국에 문의해 주세요.')

  const { error } = await admin.from('consents').delete().eq('id', c.id)
  if (error) throw new Error(error.message)
  // 이 확인서로 자동 제외했던 배정은 되돌린다 (채점 화면에서 직접 신고한 것은 그대로)
  const ids = (c.conflict_company_ids ?? []) as string[]
  if (ids.length) {
    await admin.from('assignments').update({ conflict: false, conflict_reason: null, conflict_reported_at: null })
      .eq('judge_id', c.judge_id).eq('conflict', true).in('company_id', ids).like('conflict_reason', `${CONSENT_CONFLICT_REASON}%`)
  }
  await admin.storage.from(BUCKET).remove([c.signature_path, c.signed_pdf_path].filter(Boolean) as string[]).then(() => null, () => null)
  await supabase.rpc('log_event', { p_action: 'consent.withdraw', p_table: 'consents', p_row: c.id, p_meta: { template_id: c.template_id } })

  return NextResponse.json({ ok: true })
})
