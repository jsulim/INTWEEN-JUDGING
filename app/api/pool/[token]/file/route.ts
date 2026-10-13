import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle } from '@/lib/server/auth'
import { signedViewUrl } from '@/lib/server/storage'
import { loadShare, shareEntries } from '@/lib/server/pool-share'

// POST /api/pool/<token>/file — 공유 링크로 이력서·증빙 열람용 서명 URL(10분) 발급
const Body = z.object({ entry_id: z.guid(), doc: z.number().int().min(-1) }) // -1 = 이력서

export const POST = handle(async (req: Request, { params }: { params: { token: string } }) => {
  const share = await loadShare(params.token)
  if (!share) throw new ApiError(404, '링크가 만료되었거나 사용이 중지되었습니다.')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const e = (await shareEntries(share)).find(x => x.id === parsed.data.entry_id)
  const path = parsed.data.doc < 0 ? e?.resume_path : e?.docs?.[parsed.data.doc]?.path
  if (!path) throw new ApiError(404, '자료를 찾을 수 없습니다.')
  return NextResponse.json({ url: await signedViewUrl(path) })
})
