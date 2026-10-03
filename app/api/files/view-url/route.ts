import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, handle, requireApi } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { SIGNED_URL_TTL, signedViewUrl } from '@/lib/server/storage'

// 열람용 서명 URL 발급 (J, A) — 7장: 유효 10분, 배정·서명 검증, 열람 로그 (Q4)
//  { submission_id }                      제출 파일 (심사위원: 배정+서명+이해충돌 아님, 관리자: 전체)
//  { path, kind: 'consent'|'evaluation' } 서명본 PDF (심사위원: 본인 것만, 관리자: 전체)
const Body = z.union([
  z.object({ submission_id: z.string().min(1), download: z.boolean().optional() }),
  z.object({ path: z.string().min(1).max(512), kind: z.enum(['consent', 'evaluation']), download: z.boolean().optional() }),
])

export const POST = handle(async (req: Request) => {
  const { supabase, profile } = await requireApi(['judge', 'admin'])
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, '요청 형식이 올바르지 않습니다.')
  const b = parsed.data
  const isAdmin = profile.role === 'admin'
  const admin = supabaseAdmin()
  // 다운로드(attachment)는 관리자만. 심사위원 뷰어는 다운로드 버튼을 두지 않는다 (8-4)
  const download = isAdmin && b.download ? true : undefined

  if ('submission_id' in b) {
    if (!isAdmin) {
      // 사용자 클라이언트로 뷰를 조회 → 배정 + 서명 완료 + 이해충돌 아님이 증명된다
      const { data: visible } = await supabase.from('v_judge_submissions')
        .select('submission_id').eq('submission_id', b.submission_id).maybeSingle()
      if (!visible) throw new ApiError(403, '배정된 기업의 자료만 열람할 수 있습니다.')
    }
    const { data: sub } = await admin.from('submissions')
      .select('id, storage_path, pdf_path, file_name').eq('id', b.submission_id).maybeSingle()
    if (!sub) throw new ApiError(404, '파일을 찾을 수 없습니다.')
    const path = isAdmin && download
      ? sub.storage_path
      : sub.pdf_path ?? (/\.pdf$/i.test(sub.storage_path) ? sub.storage_path : null)
    if (!path) throw new ApiError(422, 'PDF 변환본이 없어 열람할 수 없습니다.')
    const url = await signedViewUrl(path, download ? { download: sub.file_name } : undefined)
    await supabase.rpc('log_event', {
      p_action: download ? 'download' : 'view', p_table: 'submissions', p_row: sub.id,
      p_meta: { file_name: sub.file_name, pdf: path !== sub.storage_path },
    })
    return NextResponse.json({ url, expires_in: SIGNED_URL_TTL })
  }

  // 서명본: 경로가 실제 서명 기록에 있는지 확인 (임의 경로 열람 차단)
  const table = b.kind === 'consent' ? 'consents' : 'evaluation_submissions'
  let rowId: string | null = null
  if (isAdmin) {
    const { data } = await admin.from(table).select('id').eq('signed_pdf_path', b.path).limit(1).maybeSingle()
    rowId = data?.id ?? null
  } else {
    // RLS judge_read: 본인 judge_id 행만 보인다
    const { data } = await supabase.from(table).select('id').eq('signed_pdf_path', b.path).limit(1).maybeSingle()
    rowId = data?.id ?? null
  }
  if (!rowId) throw new ApiError(403, '열람 권한이 없습니다.')
  const url = await signedViewUrl(b.path, download ? { download: b.path.split('/').pop() } : undefined)
  await supabase.rpc('log_event', { p_action: download ? 'download' : 'view', p_table: table, p_row: rowId, p_meta: { path: b.path } })
  return NextResponse.json({ url, expires_in: SIGNED_URL_TTL })
})
