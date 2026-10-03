// 참가 기업 영역 공용 규칙 (서버·클라이언트 공용, 순수 함수)
import { fmtDate } from '@/lib/format'
import type { StageStatus } from '@/lib/types'

export const BUCKET_NAME = 'program-files'
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 파일당 50MB (8-4)
/** 신청서 첨부·가점 증빙·이의신청 첨부 허용 형식 (버킷 허용 MIME 과 일치) */
export const EVIDENCE_EXT = ['pdf', 'pptx', 'png', 'jpg', 'jpeg', 'zip'] as const
export const EVIDENCE_ACCEPT = EVIDENCE_EXT.map(e => '.' + e).join(',')

export function extOfName(name: string) {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}

export function fmtBytes(n: number | null | undefined) {
  if (n == null) return '-'
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

export const SIZE_ERROR = '파일당 최대 50MB까지 업로드할 수 있습니다.'

interface WindowSource {
  stage_status: StageStatus
  submit_start: string | null
  submit_end: string | null
}

/** C-03 제출 가능 여부: 단계 '접수중' + submit_start..submit_end 이내 (Q2) */
export function submitWindow(e: WindowSource, now = new Date()): { open: boolean; reason?: string } {
  const start = e.submit_start ? new Date(e.submit_start) : null
  const end = e.submit_end ? new Date(e.submit_end) : null
  if (e.stage_status === 'ready') {
    return { open: false, reason: start ? `접수 시작 전입니다. (시작: ${fmtDate(start)})` : '접수 시작 전입니다.' }
  }
  if (e.stage_status !== 'submitting') {
    return { open: false, reason: end ? `제출 기간이 종료되었습니다. (마감: ${fmtDate(end)})` : '제출 기간이 종료되었습니다.' }
  }
  if (start && now < start) return { open: false, reason: `접수 시작 전입니다. (시작: ${fmtDate(start)})` }
  if (end && now > end) {
    return { open: false, reason: `제출 기간이 종료되었습니다. (마감: ${fmtDate(end)}) 마감 이후에는 업로드할 수 없습니다.` }
  }
  return { open: true }
}

interface AppealSource {
  stage_status: StageStatus
  published_at: string | null
  appeal_days: number
}

/** C-07 이의신청 기간: 결과공개 후 appeal_days 이내 (Q16) */
export function appealWindow(e: AppealSource, now = new Date()): { open: boolean; until: Date | null; reason?: string } {
  if (e.stage_status !== 'published' || !e.published_at) {
    return { open: false, until: null, reason: '결과 공개 후 신청할 수 있습니다.' }
  }
  const until = new Date(new Date(e.published_at).getTime() + e.appeal_days * 86_400_000)
  if (now > until) {
    return { open: false, until, reason: `이의신청 기간이 지났습니다. (기한: ${fmtDate(until)}, 결과 공개 후 ${e.appeal_days}일)` }
  }
  return { open: true, until }
}

export function fmtPoints(p: number) {
  const n = Number(p)
  return `${n > 0 ? '+' : ''}${n % 1 === 0 ? n : n.toFixed(2)}점`
}

/** 본인 파일 열람 링크 (서버가 소유 확인 후 10분 서명 URL 로 리다이렉트) */
export function myFileHref(p: { submissionId?: string; path?: string; pdf?: boolean }) {
  const q = new URLSearchParams({ redirect: '1' })
  if (p.submissionId) q.set('submission_id', p.submissionId)
  if (p.path) q.set('path', p.path)
  if (p.pdf) q.set('pdf', '1')
  return `/api/files/my-url?${q.toString()}`
}
