'use client'
// 업로드 공통 흐름: 서버 서명 URL 발급(/api/files/upload-url) → Storage 직접 업로드
import { api } from '@/lib/api'
import { supabaseBrowser } from '@/lib/supabase/client'
import { BUCKET_NAME, MAX_UPLOAD_BYTES, SIZE_ERROR } from './rules'

export type UploadKind = 'submission' | 'application' | 'bonus' | 'appeal'

export interface UploadTicket {
  path: string
  token: string
  signedUrl: string
  contentType: string
  version?: number
}

export async function uploadFile(file: File, kind: UploadKind, extra: Record<string, unknown> = {}) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(SIZE_ERROR)
  if (file.size === 0) throw new Error('빈 파일은 업로드할 수 없습니다.')
  const ticket = await api<UploadTicket>('/api/files/upload-url', {
    body: { kind, ...extra, file_name: file.name, size: file.size },
  })
  // 모바일 브라우저는 file.type 이 비어 있는 경우가 있어 서버가 정한 MIME 으로 다시 감싼다
  const blob = new Blob([file], { type: ticket.contentType })
  const { error } = await supabaseBrowser().storage.from(BUCKET_NAME)
    .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: ticket.contentType })
  if (error) throw new Error('파일을 업로드하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.')
  return { ...ticket, name: file.name, size: file.size }
}
