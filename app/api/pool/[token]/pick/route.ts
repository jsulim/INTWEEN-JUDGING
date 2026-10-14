import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { loadShare, shareEntries } from '@/lib/server/pool-share'
import { allCategories } from '@/lib/pool'

// POST /api/pool/<token>/pick — 공유 링크에서 심사위원 별표(선정) 켜기·끄기. 링크 열람자 모두 같은 목록을 본다.
//  category: 별표를 누른 분야 탭 (같은 사람이 여러 분야에 있으면 분야별로 따로 담긴다)
const Body = z.object({ entry_id: z.guid(), category: z.string().max(10), picked: z.boolean() })

export const POST = handle(async (req: Request, { params }: { params: { token: string } }) => {
  const share = await loadShare(params.token)
  if (!share) throw new ApiError(404, '링크가 만료되었거나 사용이 중지되었습니다.')
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const { entry_id, category, picked } = parsed.data
  const e = (await shareEntries(share)).find(x => x.id === entry_id)
  if (!e) throw new ApiError(404, '후보를 찾을 수 없습니다.')
  if (!allCategories(e).includes(category)) throw new ApiError(400, '이 후보의 분야가 아닙니다.')
  const t = supabaseAdmin().from('pool_share_picks')
  const { error } = picked
    ? await t.upsert({ share_id: share.id, pool_id: entry_id, category }, { onConflict: 'share_id,pool_id,category' })
    : await t.delete().eq('share_id', share.id).eq('pool_id', entry_id).in('category', category === e.category ? [category, ''] : [category])
  if (error) throw error
  return NextResponse.json({ ok: true })
})
