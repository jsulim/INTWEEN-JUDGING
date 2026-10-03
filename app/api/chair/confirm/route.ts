import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { uploadBytes } from '@/lib/server/storage'
import { parsePngDataUrl } from '@/lib/server/pdf-eval'
import type { Judge, Stage } from '@/lib/types'

// J-05 심사위원장 종합의견 확인 서명 (4-1, 2차): 확정·결과공개 단계에서 위원장만
const Body = z.object({
  stage_id: z.string().min(1),
  opinion: z.string().trim().min(1, '종합의견을 입력하세요.').max(10000),
  signature: z.string().min(1),
})

export const POST = handle(async (req: Request) => {
  const { user } = await requireApi('judge')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '요청 형식이 올바르지 않습니다.')
  const b = parsed.data
  const png = parsePngDataUrl(b.signature)
  if (!png) throw new ApiError(400, '서명 이미지가 올바르지 않습니다.')
  const admin = supabaseAdmin()

  const { data: stageRow } = await admin.from('stages').select('*').eq('id', b.stage_id).maybeSingle()
  const stage = stageRow as Stage | null
  if (!stage) throw new ApiError(404, '단계를 찾을 수 없습니다.')
  const { data: judgeRow } = await admin.from('judges').select('*')
    .eq('program_id', stage.program_id).eq('user_id', user.id).maybeSingle()
  const judge = judgeRow as Judge | null
  if (!judge?.is_chair) throw new ApiError(403, '심사위원장만 확인 서명할 수 있습니다.')
  if (stage.status !== 'locked' && stage.status !== 'published') throw new ApiError(409, '순위 확정 후에 확인 서명할 수 있습니다.')

  const { data: existing } = await admin.from('chair_reviews').select('id, confirmed_at').eq('stage_id', stage.id).maybeSingle()
  if (existing?.confirmed_at) throw new ApiError(409, '이미 확인 서명했습니다.')

  const confirmedAt = new Date().toISOString()
  const path = `chair/${stage.id}/${judge.id}_${confirmedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}.png`
  await uploadBytes(path, png, 'image/png')
  const { error } = await admin.from('chair_reviews').upsert({
    stage_id: stage.id,
    judge_id: judge.id,
    opinion: b.opinion,
    confirmed_at: confirmedAt,
    signature_path: path,
  }, { onConflict: 'stage_id' })
  if (error) throw new Error(error.message)
  return NextResponse.json({ ok: true, confirmed_at: confirmedAt })
})
