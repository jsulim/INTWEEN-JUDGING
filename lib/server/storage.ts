import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/server'

export const BUCKET = 'program-files'
export const MAX_FILE_BYTES = 50 * 1024 * 1024 // 파일당 50MB (8-4)
export const SIGNED_URL_TTL = 600 // 서명 URL 유효 10분 (7장)

export const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  zip: 'application/zip',
}

export function extOf(name: string) {
  return (name.split('.').pop() || '').toLowerCase()
}

/** 경로 규칙: {program_id}/{stage_id}/{company_id}/{file_type}_v{n}.{ext} */
export function submissionPath(p: { programId: string; stageId: string; companyId: string; fileType: string; version: number; ext: string }) {
  return `${p.programId}/${p.stageId}/${p.companyId}/${p.fileType}_v${p.version}.${p.ext}`
}

export async function signedViewUrl(path: string, opts?: { download?: string | boolean }) {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL, opts)
  if (error) throw error
  return data.signedUrl
}

export async function signedUploadUrl(path: string) {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false })
  if (error) throw error
  return data // { signedUrl, token, path }
}

export async function uploadBytes(path: string, bytes: Uint8Array | Buffer, contentType: string) {
  const { error } = await supabaseAdmin().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true })
  if (error) throw error
  return path
}

export async function downloadBytes(path: string) {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(path)
  if (error) throw error
  return new Uint8Array(await data.arrayBuffer())
}

/** PPTX → PDF 변환 (LibreOffice 서버리스, Gotenberg 호환). PPTX_CONVERT_URL 미설정 시 null */
export async function convertPptxToPdf(pptx: Uint8Array, fileName: string): Promise<Uint8Array | null> {
  const url = process.env.PPTX_CONVERT_URL
  if (!url) return null
  const form = new FormData()
  form.append('files', new Blob([new Uint8Array(pptx)], { type: MIME.pptx }), fileName)
  const res = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`PPTX 변환 실패 (${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}
