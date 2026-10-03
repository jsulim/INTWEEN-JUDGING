import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { emitEvent } from '@/lib/server/n8n'
import { appealWindow } from '@/components/company/rules'
import { myEntryById } from '@/app/c/_lib/server'
import type { Appeal } from '@/lib/types'

// C-07 이의신청 접수 (9장 /api/appeals): 기간(결과공개 후 appeal_days)·횟수(단계별 1회) 검증 후
// 로그인 사용자 클라이언트로 insert → RLS company_insert 가 한 번 더 강제한다 (Q16).
const Body = z.object({
  entry_id: z.guid(),
  reason: z.string().trim().min(10, '사유를 10자 이상 입력해 주세요.').max(5000, '사유는 5,000자 이내로 입력해 주세요.'),
  attachment_path: z.string().max(500).nullish(),
})

export const POST = handle(async (req: Request) => {
  const { supabase } = await requireApi('company')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || '요청 형식이 올바르지 않습니다.')
  const body = parsed.data

  const entry = await myEntryById(supabase, body.entry_id)
  const win = appealWindow(entry)
  if (!win.open) throw new ApiError(403, win.reason!)

  const { data: existing } = await supabase.from('appeals').select('id').eq('entry_id', entry.entry_id).limit(1)
  if (existing?.length) throw new ApiError(409, '이미 이의신청을 접수했습니다. 단계별 1회만 신청할 수 있습니다.')

  const attachment = body.attachment_path || null
  if (attachment && !attachment.startsWith(`${entry.program_id}/appeals/${entry.entry_id}/`)) {
    throw new ApiError(400, '첨부 파일 경로가 올바르지 않습니다.')
  }

  const { data, error } = await supabase.from('appeals')
    .insert({ entry_id: entry.entry_id, reason: body.reason, attachment_path: attachment })
    .select('*').single()
  if (error) {
    if (error.code === '23505') throw new ApiError(409, '이미 이의신청을 접수했습니다. 단계별 1회만 신청할 수 있습니다.')
    if (error.code === '42501') throw new ApiError(403, '이의신청 기간이 아닙니다.')
    throw error
  }
  const appeal = data as Appeal

  const [{ data: company }, { data: program }] = await Promise.all([
    supabase.from('companies').select('name').eq('id', entry.company_id).maybeSingle(),
    supabase.from('programs').select('title').eq('id', entry.program_id).maybeSingle(),
  ])
  await emitEvent('appeal.received', {
    appeal_id: appeal.id,
    company_id: entry.company_id,
    company_name: company?.name ?? '',
    program_id: entry.program_id,
    program_title: program?.title ?? '',
    stage_id: entry.stage_id,
    stage_name: entry.stage_name,
    reason_summary: body.reason.length > 200 ? body.reason.slice(0, 200) + '…' : body.reason,
    has_attachment: !!attachment,
    appeal_until: win.until?.toISOString() ?? null,
    received_at: appeal.created_at,
  })

  return NextResponse.json(appeal)
})
