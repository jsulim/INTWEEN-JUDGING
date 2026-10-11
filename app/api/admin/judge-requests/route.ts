import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { emitEvent } from '@/lib/server/n8n'
import { siteUrl } from '@/components/admin/setup/server'
import { ensureProfile } from '@/components/admin/setup/invite'
import type { JudgeRequest } from '@/lib/types'

// POST /api/admin/judge-requests — 심사위원 가입 신청 승인·반려 (A-06)
// 승인: profiles(role=judge) 생성·보완 + judges 행 생성. 관리자 세션으로 써서 감사로그에 승인자가 남는다.
const Body = z.object({ id: z.guid(), action: z.enum(['approve', 'reject']) })

export const POST = handle(async (req: Request) => {
  const { supabase, user } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const { id, action } = parsed.data

  const { data } = await supabase.from('judge_requests').select('*').eq('id', id).maybeSingle()
  const r = data as JudgeRequest | null
  if (!r) throw new ApiError(404, '신청을 찾을 수 없습니다.')
  if (r.status !== 'pending') throw new ApiError(409, '이미 처리된 신청입니다.')
  const now = new Date().toISOString()

  if (action === 'reject') {
    const { error } = await supabase.from('judge_requests').update({ status: 'rejected', decided_by: user.id, decided_at: now }).eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  }

  const site = siteUrl(req)
  await ensureProfile({ supabase, site }, r.user_id, 'judge', r.name, r.email ?? '', r.org)
  await supabase.from('profiles').update({ phone: r.phone }).eq('user_id', r.user_id).is('phone', null)
  const { error: jErr } = await supabase.from('judges').upsert({
    program_id: r.program_id, user_id: r.user_id, affiliation: r.org, expertise: r.expertise,
  }, { onConflict: 'program_id,user_id' })
  if (jErr) throw jErr
  const { error } = await supabase.from('judge_requests').update({ status: 'approved', decided_by: user.id, decided_at: now }).eq('id', id)
  if (error) throw error

  const { data: program } = await supabase.from('programs').select('id, title').eq('id', r.program_id).single()
  await emitEvent('judge.approved', {
    name: r.name, email: r.email, program: program ?? { id: r.program_id }, login_url: `${site}/login`,
  })
  return NextResponse.json({ ok: true })
})
