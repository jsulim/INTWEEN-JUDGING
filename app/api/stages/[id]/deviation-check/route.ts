import { NextResponse } from 'next/server'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { siteUrl } from '@/components/admin/setup/server'
import { notifyDeviations } from '@/lib/server/notify'

// POST /api/stages/:id/deviation-check — 점수 편차 경고(n8n 'score.deviation') 즉시 확인
// 대시보드가 경고를 발견하면 호출한다. 이미 알린 기업은 서버가 걸러 내므로 여러 탭·새로고침에도 중복되지 않는다.
// (대시보드를 열지 않아도 /api/cron/tick 이 5분마다 같은 확인을 한다)
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const { supabase } = await requireApi('admin')
  const { data: stage } = await supabase.from('stages').select('id').eq('id', params.id).maybeSingle()
  if (!stage) throw new ApiError(404, '단계를 찾을 수 없습니다.')
  const count = await notifyDeviations(params.id, siteUrl(req))
  return NextResponse.json({ ok: true, count })
})
