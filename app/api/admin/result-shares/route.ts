import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'

// POST /api/admin/result-shares — 기관 담당자용 결과 열람 링크 만들기·끄기
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), title: z.string().trim().min(1).max(100), program_id: z.guid(),
    show_judge_names: z.boolean().default(true), expires_days: z.number().int().min(1).max(180).default(60) }),
  z.object({ action: z.literal('revoke'), id: z.guid() }),
])

export const POST = handle(async (req: Request) => {
  const { supabase, user } = await requireApi('admin')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const b = parsed.data

  if (b.action === 'revoke') {
    const { error } = await supabase.from('result_shares').update({ revoked_at: new Date().toISOString() }).eq('id', b.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  }
  const token = randomBytes(24).toString('base64url')
  const expires = new Date(Date.now() + b.expires_days * 86400_000).toISOString()
  const { data, error } = await supabase.from('result_shares')
    .insert({ token, title: b.title, program_id: b.program_id, show_judge_names: b.show_judge_names, expires_at: expires, created_by: user.id })
    .select('*').single()
  if (error) {
    if (/result_shares/.test(error.message)) throw new ApiError(500, '결과 열람 링크 기능의 DB 설정(SQL)이 아직 적용되지 않았습니다.')
    throw error
  }
  await supabase.rpc('log_event', { p_action: 'result.share_create', p_table: 'result_shares', p_row: data.id, p_meta: { title: b.title, expires } })
  return NextResponse.json(data)
})
