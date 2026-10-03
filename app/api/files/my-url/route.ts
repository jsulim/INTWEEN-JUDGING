import { NextResponse } from 'next/server'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { signedViewUrl } from '@/lib/server/storage'
import { UUID_RE, ownsUploadPath } from '@/app/c/_lib/server'
import type { Submission } from '@/lib/types'

// 기업 본인 파일 열람용 서명 URL (10분).
//   ?submission_id=…[&pdf=1]  제출 파일 (RLS company_read 로 소유 확인)
//   ?path=…                   신청서 첨부·가점 증빙·이의신청 첨부 (경로 소유 확인)
//   &redirect=1               JSON 대신 서명 URL 로 이동
export const GET = handle(async (req: Request) => {
  const { supabase } = await requireApi('company')
  const q = new URL(req.url).searchParams
  const submissionId = q.get('submission_id')
  const path = q.get('path')
  let target: string
  let download: string | undefined

  if (submissionId) {
    if (!UUID_RE.test(submissionId)) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
    const { data } = await supabase.from('submissions').select('*').eq('id', submissionId).maybeSingle()
    const sub = data as Submission | null
    if (!sub) throw new ApiError(404, '파일을 찾을 수 없습니다.')
    if (q.get('pdf') === '1' && sub.pdf_path) {
      target = sub.pdf_path
    } else {
      target = sub.storage_path
      download = sub.file_name
    }
  } else if (path) {
    if (!(await ownsUploadPath(supabase, path))) throw new ApiError(404, '파일을 찾을 수 없습니다.')
    target = path
  } else {
    throw new ApiError(400, 'submission_id 또는 path 가 필요합니다.')
  }

  const url = await signedViewUrl(target, download ? { download } : undefined)
  if (q.get('redirect') === '1') return NextResponse.redirect(url)
  return NextResponse.json({ url })
})
