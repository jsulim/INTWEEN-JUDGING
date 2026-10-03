import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { signedViewUrl } from '@/lib/server/storage'

// GET /api/admin/files/url?path=…[&download=1][&json=1] — 관리자 전용 서명 URL(10분) 발급 + 열람 로그
// 기본은 서명 URL 로 302 리다이렉트 (링크로 바로 열기)
export const GET = handle(async (req: NextRequest) => {
  const { supabase } = await requireApi('admin')
  const path = req.nextUrl.searchParams.get('path') ?? ''
  if (!path || path.includes('..') || path.startsWith('/')) throw new ApiError(400, '파일 경로가 올바르지 않습니다.')
  const download = req.nextUrl.searchParams.get('download') === '1'
  const url = await signedViewUrl(path, download ? { download: true } : undefined).catch(() => null)
  if (!url) throw new ApiError(404, '파일을 찾을 수 없습니다.')
  await supabase.rpc('log_event', { p_action: 'view', p_table: 'storage', p_row: null, p_meta: { path, by: 'admin' } })
  if (req.nextUrl.searchParams.get('json') === '1') return NextResponse.json({ url })
  return NextResponse.redirect(url)
})
