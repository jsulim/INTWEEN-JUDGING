import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/server/auth'
import type { Company, MyEntryRow, Program, RequiredFile } from '@/lib/types'

// 참가 기업 영역(C-01~07)과 기업용 API 가 함께 쓰는 서버 헬퍼.
// 모두 로그인 사용자 클라이언트(RLS)로 조회한다 — 본인 기업·참가 단계만 보인다.

export type CompanyWithProgram = Company & { programs: Program | null }

export async function loadMyCompanies(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from('companies').select('*, programs(*)')
    .eq('owner_user_id', userId).order('created_at')
  return ((data ?? []) as CompanyWithProgram[]).map(c => ({ ...c, members: Array.isArray(c.members) ? c.members : [] }))
}

function normalizeEntry(e: MyEntryRow): MyEntryRow {
  return { ...e, required_files: Array.isArray(e.required_files) ? (e.required_files as RequiredFile[]) : [] }
}

export async function loadMyEntries(supabase: SupabaseClient) {
  const { data } = await supabase.from('v_my_entries').select('*').order('order_no')
  return ((data ?? []) as MyEntryRow[]).map(normalizeEntry)
}

/** 단계 기준 본인 참가 행. 없으면 404 */
export async function myEntryByStage(supabase: SupabaseClient, stageId: string) {
  const { data } = await supabase.from('v_my_entries').select('*').eq('stage_id', stageId).limit(1)
  const e = (data ?? [])[0] as MyEntryRow | undefined
  if (!e) throw new ApiError(404, '참가 중인 단계가 아닙니다.')
  return normalizeEntry(e)
}

/** 참가 행 id 기준 본인 참가 행. 없으면 404 */
export async function myEntryById(supabase: SupabaseClient, entryId: string) {
  const { data } = await supabase.from('v_my_entries').select('*').eq('entry_id', entryId).limit(1)
  const e = (data ?? [])[0] as MyEntryRow | undefined
  if (!e) throw new ApiError(404, '참가 중인 단계가 아닙니다.')
  return normalizeEntry(e)
}

export function slotOf(entry: MyEntryRow, fileType: string) {
  const slot = entry.required_files.find(f => f.type === fileType)
  if (!slot) throw new ApiError(400, '제출 항목을 찾을 수 없습니다.')
  return slot
}

export function acceptOf(slot: RequiredFile) {
  return (slot.accept?.length ? slot.accept : ['pdf']).map(a => a.toLowerCase())
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 기업 업로드 파일(신청서·가점 증빙·이의신청 첨부) 경로 소유 확인.
 *   {program_id}/application/{company_id}/…
 *   {program_id}/bonus/{entry_id}/…
 *   {program_id}/appeals/{entry_id}/…
 */
export async function ownsUploadPath(supabase: SupabaseClient, path: string) {
  const parts = path.split('/')
  if (parts.length !== 4 || parts.some(p => !p || p === '..' || p === '.')) return false
  const [programId, kind, ownerId] = parts
  if (!UUID_RE.test(programId) || !UUID_RE.test(ownerId)) return false
  if (kind === 'application') {
    const { data } = await supabase.from('companies').select('id').eq('id', ownerId).eq('program_id', programId).maybeSingle()
    return !!data
  }
  if (kind === 'bonus' || kind === 'appeals') {
    const { data } = await supabase.from('v_my_entries').select('entry_id').eq('entry_id', ownerId).eq('program_id', programId).limit(1)
    return !!data?.length
  }
  return false
}

export function safeFileName(name: string) {
  const trimmed = name.trim().slice(-200)
  return trimmed || 'file'
}
