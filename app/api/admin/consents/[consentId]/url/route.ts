import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { signedViewUrl } from '@/lib/server/storage'

// GET /api/admin/consents/:consentId/url[?json=1][&download=1] — 동의서 서명본 PDF 서명 URL (A-06)
export const GET = handle(async (req: NextRequest, { params }: { params: { consentId: string } }) => {
  const { supabase } = await requireApi('admin')
  const { data: consent } = await supabase.from('consents').select('id, signed_pdf_path').eq('id', params.consentId).maybeSingle()
  if (!consent?.signed_pdf_path) throw new ApiError(404, '서명본을 찾을 수 없습니다.')
  const download = req.nextUrl.searchParams.get('download') === '1'
  const url = await signedViewUrl(consent.signed_pdf_path, download ? { download: true } : undefined).catch(() => null)
  if (!url) throw new ApiError(404, '서명본 파일이 없습니다.')
  await supabase.rpc('log_event', { p_action: 'view', p_table: 'consents', p_row: consent.id, p_meta: { path: consent.signed_pdf_path } })
  if (req.nextUrl.searchParams.get('json') === '1') return NextResponse.json({ url })
  return NextResponse.redirect(url)
})
