import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { signedViewUrl } from '@/lib/server/storage'
import { loadResultShare } from '@/lib/server/result-share'

// POST /api/r/<token>/file — 결과 열람 링크로 제출 자료(PDF) 열람용 서명 URL(10분) 발급. 링크의 대회 자료만.
const Body = z.object({ submission_id: z.guid() })

export const POST = handle(async (req: Request, { params }: { params: { token: string } }) => {
  const share = await loadResultShare(params.token)
  if (!share) throw new ApiError(404, '링크가 만료되었거나 사용이 중지되었습니다.')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const { data } = await supabaseAdmin().from('submissions')
    .select('storage_path, pdf_path, is_current, stage_entries!inner(stages!inner(program_id))')
    .eq('id', parsed.data.submission_id).maybeSingle()
  const sub = data as unknown as { storage_path: string; pdf_path: string | null; is_current: boolean; stage_entries: { stages: { program_id: string } } } | null
  if (!sub || !sub.is_current || sub.stage_entries.stages.program_id !== share.program_id) throw new ApiError(404, '자료를 찾을 수 없습니다.')
  const path = sub.pdf_path ?? (/\.pdf$/i.test(sub.storage_path) ? sub.storage_path : null)
  if (!path) throw new ApiError(404, 'PDF로 볼 수 없는 파일입니다.')
  return NextResponse.json({ url: await signedViewUrl(path) })
})
