import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { inviteCompany, inviteJudge, reinviteJudge } from '@/components/admin/setup/invite'
import { siteUrl } from '@/components/admin/setup/server'

// POST /api/invite — 기업·심사위원 계정 생성 + 초대 메일 (A-05, A-06)
const opt = z.string().nullish()
const Body = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('company'),
    program_id: z.string().uuid(),
    company_id: z.string().uuid().optional(), // 있으면 기존 기업 (재)초대
    company: z.object({ name: z.string(), biz_no: opt, ceo: opt, field: opt }).optional(),
    email: opt,
    send: z.boolean().default(true),
  }),
  z.object({
    role: z.literal('judge'),
    program_id: z.string().uuid(),
    judge_id: z.string().uuid().optional(), // 있으면 재초대
    email: opt,
    name: opt,
    affiliation: opt,
    expertise: opt,
    is_chair: z.boolean().optional(),
    pool_id: z.string().uuid().nullish(),
  }),
])

export const POST = handle(async (req: Request) => {
  const { supabase } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '입력값을 확인해 주세요.')
  const b = parsed.data
  const ctx = { supabase, site: siteUrl(req) }

  if (b.role === 'company') {
    if (!b.company_id && !b.company) throw new ApiError(400, '기업 정보를 입력해 주세요.')
    const r = await inviteCompany(ctx, {
      programId: b.program_id, companyId: b.company_id, company: b.company, email: b.email ?? undefined, send: b.send,
    })
    return NextResponse.json(r)
  }

  if (b.judge_id) return NextResponse.json(await reinviteJudge(ctx, b.program_id, b.judge_id))
  if (!b.email || !b.name) throw new ApiError(400, '이름과 이메일을 입력해 주세요.')
  const r = await inviteJudge(ctx, b.program_id, {
    email: b.email, name: b.name, affiliation: b.affiliation, expertise: b.expertise, is_chair: b.is_chair, pool_id: b.pool_id,
  })
  return NextResponse.json(r)
})
