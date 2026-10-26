// DB 행 타입 (supabase/migrations 기준). 컬럼 추가 시 함께 갱신한다.

export type Role = 'admin' | 'company' | 'judge'
export type StageStatus = 'ready' | 'submitting' | 'evaluating' | 'locked' | 'published'
export type EntryResult = 'pending' | 'pass' | 'fail'
export type Eligibility = 'pending' | 'eligible' | 'supplement' | 'ineligible'
export type SlotStatus = 'waiting' | 'presenting' | 'qna' | 'done' | 'absent'
export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'file' | 'check'
export type AppealStatus = 'received' | 'reviewing' | 'accepted' | 'rejected'

export interface Profile {
  id: string
  user_id: string
  role: Role
  name: string
  email: string | null
  phone: string | null
  org: string | null
  can_pay: boolean
}

export interface Program {
  id: string
  title: string
  type: 'hackathon' | 'screening'
  status: 'draft' | 'active' | 'closed' | 'archived'
  description: string | null
  cloned_from: string | null
  application_open: boolean
  application_due: string | null
  retention_years: number
  closed_at: string | null
  payment_per_session: number
  payments_enabled: boolean // 심사위원 수당 정산 사용 (끄면 정산 메뉴 숨김)
  judge_signup_open: boolean // 심사위원 가입 신청 링크 접수 중
  created_at: string
}

export type JudgeRequestStatus = 'pending' | 'approved' | 'rejected'

/** 심사위원 자가 가입 신청 (관리자 승인 시 profiles·judges 생성) */
export interface JudgeRequest {
  id: string
  program_id: string
  user_id: string
  email: string | null
  name: string
  phone: string | null
  org: string | null
  expertise: string | null
  status: JudgeRequestStatus
  decided_at: string | null
  created_at: string
}

export interface RequiredFile {
  type: string // plan / deck / etc
  label: string
  accept: ('pdf' | 'pptx')[]
  required: boolean
}

export interface Stage {
  id: string
  program_id: string
  order_no: number
  name: string
  submit_start: string | null
  submit_end: string | null
  eval_start: string | null
  eval_end: string | null
  status: StageStatus
  required_files: RequiredFile[]
  score_visible: boolean
  blind_mode: boolean
  normalize: boolean
  trim_extremes: boolean
  bonus_cap: number
  appeal_days: number
  deviation_alert: number
  is_presentation: boolean
  pass_score: number | null          // 합격선 (최종 점수 기준). null = 미사용
  overall_comment_required: boolean  // 종합 심사평 필수
  published_at: string | null
  eval_notified_at: string | null
}

export interface RubricBand {
  min: number
  max: number
  label: string
}

export interface Criterion {
  id: string
  stage_id: string
  order_no: number
  name: string
  description: string | null
  max_score: number
  comment_required: boolean
  min_pass_score: number | null
  rubric: RubricBand[]
  tie_priority: number | null
  group_name?: string | null // 대항목 (예: 사업성) — 세부 항목을 묶어 보여줌
}

export interface Company {
  id: string
  program_id: string
  owner_user_id: string | null
  name: string
  biz_no: string | null
  ceo: string | null
  field: string | null
  members: { name: string; role?: string }[]
  contact_email: string | null
  blind_code: string | null
  application_submitted_at: string | null
}

export interface StageEntry {
  id: string
  stage_id: string
  company_id: string
  result: EntryResult
  eligibility: Eligibility
  withdrawn?: boolean // 발표 포기 (심사 제외, 결과표에 '포기' 표시)
}

export interface Submission {
  id: string
  entry_id: string
  file_type: string
  storage_path: string
  pdf_path: string | null
  file_name: string
  file_size: number | null
  version: number
  is_current: boolean
  created_at: string
}

export interface Judge {
  id: string
  program_id: string
  user_id: string
  affiliation: string | null
  expertise: string | null
  is_chair: boolean
}

export interface ConsentTemplate {
  id: string
  program_id: string
  kind: 'privacy' | 'security' | 'conflict' | 'payment' | string
  title: string
  body: string
  version: number
  required: boolean
  is_active: boolean
  created_at: string
}

export interface Consent {
  id: string
  judge_id: string
  template_id: string
  signature_path: string
  signed_pdf_path: string
  signed_at: string
  ip: string | null
  user_agent: string | null
  doc_hash: string
  conflict_declared: boolean | null
  conflict_note: string | null
}

export interface Assignment {
  id: string
  stage_id: string
  judge_id: string
  company_id: string
  conflict: boolean
  conflict_reason: string | null
}

export interface Score {
  id: string
  assignment_id: string
  criterion_id: string
  score: number | null
  comment: string | null
  updated_at: string
}

export interface Review {
  id: string
  assignment_id: string
  overall_comment: string | null
  qna_memo: string | null
  status: 'draft' | 'submitted'
}

export interface EvaluationSubmission {
  id: string
  judge_id: string
  stage_id: string
  status: 'submitted' | 'reopened'
  submitted_at: string
  signed_pdf_path: string | null
  doc_hash: string | null
  reopened_by: string | null
  reopened_at: string | null
  reopen_reason: string | null
}

export interface StageResult {
  id: string
  stage_id: string
  company_id: string
  raw_score: number | null
  normalized_score: number | null
  bonus: number
  avg_score: number | null
  rank: number | null
  cutoff: boolean
  judge_count: number
  detail: Record<string, unknown>
  locked_at: string | null
}

export interface AuditLog {
  id: string
  actor_id: string | null
  action: string
  table_name: string | null
  row_id: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  ip: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

export interface Notice {
  id: string
  program_id: string
  title: string
  body: string
  target_role: Role | null
  created_at: string
}

export interface ApplicationField {
  id: string
  program_id: string
  label: string
  help: string | null
  type: FieldType
  options: string[]
  required: boolean
  is_eligibility: boolean
  order_no: number
}

export interface EligibilityCheck {
  id: string
  entry_id: string
  item: string
  result: 'pass' | 'fail' | 'supplement'
  due_at: string | null
  note: string | null
  resolved_at: string | null
}

export interface BonusRule {
  id: string
  stage_id: string
  name: string
  points: number
  evidence_required: boolean
}

export interface EntryBonus {
  id: string
  entry_id: string
  rule_id: string
  evidence_path: string | null
  approved_by: string | null
  approved_at: string | null
  rejected: boolean
}

export interface PresentationSlot {
  id: string
  stage_id: string
  company_id: string
  order_no: number
  start_at: string | null
  present_min: number
  qna_min: number
  status: SlotStatus
  phase_started_at: string | null
  meeting_url: string | null
  draw_seed: string | null
}

export interface Appeal {
  id: string
  entry_id: string
  reason: string
  attachment_path: string | null
  status: AppealStatus
  review_note: string | null
  rereview: boolean | null
  response: string | null
  decided_at: string | null
  created_at: string
}

export interface JudgePayment {
  id: string
  judge_id: string
  program_id: string
  bank_name: string | null
  bank_enc: string | null
  rrn_enc: string | null
  holder: string | null
  consent_at: string | null
  sessions: number
  amount: number
  tax: number
  paid_at: string | null
  id_card_path?: string | null
  bank_copy_path?: string | null
}

export interface JudgePoolEntry {
  id: string
  user_id: string | null
  name: string
  email: string | null
  phone: string | null
  affiliation: string | null
  expertise: string[]
  career: string | null
  history: { program_id: string; title: string; year: number }[]
  note: string | null
  category: string | null
  extra_categories: string[] // 추가 분야 (같은 사람이 여러 분야 탭에 보임)
  position: string | null
  source: string | null      // 추천 경로 (내부용)
  resume_path: string | null
  docs: { label: string; path: string }[]
  shareable: boolean
  profile: PoolProfile | null
}

/** 기관 검토 화면에 보이는 후보 소개 */
export interface PoolProfile {
  region?: string | null
  summary?: string
  fields?: string[]
  career?: string[]
  education?: string[]
  certs?: string[]
}

/** 심사위원 풀 공유 링크 (기관 검토용) */
export interface PoolShare {
  id: string
  token: string
  title: string
  program_id: string | null
  categories: string[] | null
  expires_at: string | null
  revoked_at: string | null
  view_count: number
  last_viewed_at: string | null
  created_at: string
}

export interface ResultShare {
  id: string
  token: string
  title: string
  program_id: string
  show_judge_names: boolean
  expires_at: string | null
  revoked_at: string | null
  view_count: number
  last_viewed_at: string | null
  created_at: string
}

// 뷰
export interface BlindCompanyRow {
  stage_id: string
  company_id: string
  assignment_id: string
  judge_id: string
  conflict: boolean
  blind_mode: boolean
  display_name: string
  ceo: string | null
  field: string | null
  members: Company['members'] | null
  blind_code: string | null
}

export interface JudgeSubmissionRow {
  stage_id: string
  company_id: string
  submission_id: string
  file_type: string
  version: number
  created_at: string
  viewable: boolean
  file_name: string
}

export interface MyEntryRow {
  entry_id: string
  stage_id: string
  company_id: string
  program_id: string
  stage_name: string
  order_no: number
  stage_status: StageStatus
  submit_start: string | null
  submit_end: string | null
  required_files: RequiredFile[]
  blind_mode: boolean
  appeal_days: number
  published_at: string | null
  score_visible: boolean
  eligibility: Eligibility
  result: EntryResult | null
}
