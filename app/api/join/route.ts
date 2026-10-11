import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, getSession, handle } from '@/lib/server/auth'
import { emitEvent } from '@/lib/server/n8n'
import { supabaseAdmin } from '@/lib/supabase/server'
import { siteUrl } from '@/components/admin/setup/server'

// POST /api/join — 심사위원 가입 신청. 로그인(Google·이메일)만 된 상태에서 호출하며 프로필은 아직 없다.
// 프로그램이 신청을 받는 중인지 확인한 뒤 서비스 롤로 기록하고, 관리자에게 알림(n8n)을 보낸다.
const Body = z.object({
  program_id: z.guid(),
  name: z.string().trim().min(1).max(50),
  phone: z.string().trim().min(9).max(30),
  org: z.string().trim().max(100).optional(),
  expertise: z.string().trim().max(200).optional(),
})

export const POST = handle(async (req: Request) => {
  const { user, profile } = await getSession()
  if (!user) throw new ApiError(401, '로그인이 필요합니다.')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '이름과 연락처를 입력해 주세요.')
  const b = parsed.data
  if (profile && profile.role !== 'judge') throw new ApiError(409, '이미 다른 역할(관리자·기업)로 등록된 계정입니다. 다른 계정으로 신청해 주세요.')

  const admin = supabaseAdmin()
  const { data: program } = await admin.from('programs').select('id, title, judge_signup_open').eq('id', b.program_id).maybeSingle()
  if (!program?.judge_signup_open) throw new ApiError(403, '심사위원 신청을 받지 않는 프로그램입니다.')
  const { data: already } = await admin.from('judges').select('id').eq('program_id', b.program_id).eq('user_id', user.id).maybeSingle()
  if (already) throw new ApiError(409, '이미 이 프로그램의 심사위원입니다.')

  const { data: prev } = await admin.from('judge_requests').select('status').eq('program_id', b.program_id).eq('user_id', user.id).maybeSingle()
  if (prev?.status === 'approved') throw new ApiError(409, '이미 승인된 신청입니다.')
  const { error } = await admin.from('judge_requests').upsert({
    program_id: b.program_id, user_id: user.id, email: user.email ?? null,
    name: b.name, phone: b.phone, org: b.org || null, expertise: b.expertise || null,
    status: 'pending', decided_by: null, decided_at: null, updated_at: new Date().toISOString(),
  }, { onConflict: 'program_id,user_id' })
  if (error) throw error

  if (prev?.status !== 'pending') {
    await emitEvent('judge.requested', {
      program: { id: program.id, title: program.title },
      name: b.name, email: user.email, org: b.org || null,
      review_url: `${siteUrl(req)}/a/p/${program.id}/judges`,
    })
  }
  return NextResponse.json({ ok: true })
})
