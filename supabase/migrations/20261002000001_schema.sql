-- 인트윈 심사 관리 플랫폼 · 스키마 (개발 가이드 6장)
-- 모든 테이블: id uuid PK, created_at, updated_at

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- 열거형
-- ─────────────────────────────────────────────────────────────
create type user_role as enum ('admin', 'company', 'judge');
create type program_type as enum ('hackathon', 'screening');
create type program_status as enum ('draft', 'active', 'closed', 'archived');
-- 단계 상태 5종 (4장): 준비 → 접수중 → 평가중 → 확정 → 결과공개
create type stage_status as enum ('ready', 'submitting', 'evaluating', 'locked', 'published');
create type entry_result as enum ('pending', 'pass', 'fail');
create type eligibility_status as enum ('pending', 'eligible', 'supplement', 'ineligible');
create type check_result as enum ('pass', 'fail', 'supplement');
create type review_status as enum ('draft', 'submitted');
create type field_type as enum ('text', 'textarea', 'number', 'select', 'file', 'check');
create type slot_status as enum ('waiting', 'presenting', 'qna', 'done', 'absent');
create type appeal_status as enum ('received', 'reviewing', 'accepted', 'rejected');
create type eval_submission_status as enum ('submitted', 'reopened');

-- updated_at 자동 갱신
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 사용자·프로그램·단계
-- ─────────────────────────────────────────────────────────────
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role user_role not null,
  name text not null default '',
  email text,
  phone text,
  org text,
  can_pay boolean not null default false,          -- 정산 권한자 (A-15 복호화)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type program_type not null default 'screening',
  status program_status not null default 'draft',
  description text,
  cloned_from uuid references programs(id) on delete set null,
  application_open boolean not null default false,  -- 신청서(C-06) 접수 여부
  application_due timestamptz,
  retention_years int not null default 3,           -- 개인정보 보유기간 (4-1)
  closed_at timestamptz,                            -- 보유기간 기산일
  payment_per_session int not null default 0,       -- 심사 1회 수당(원)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table stages (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  order_no int not null,
  name text not null,
  submit_start timestamptz,
  submit_end timestamptz,
  eval_start timestamptz,
  eval_end timestamptz,
  status stage_status not null default 'ready',
  -- [{"type":"plan","label":"사업계획서","accept":["pdf"],"required":true}]
  required_files jsonb not null default '[]'::jsonb,
  score_visible boolean not null default false,     -- 결과 공개 시 점수 공개 여부
  -- 4-1 설정값
  blind_mode boolean not null default false,
  normalize boolean not null default false,
  trim_extremes boolean not null default false,
  bonus_cap numeric(5,2) not null default 5,
  appeal_days int not null default 3,
  deviation_alert numeric(5,2) not null default 20, -- 점수 편차 경고 기준
  is_presentation boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, order_no)
);

create table criteria (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages(id) on delete cascade,
  order_no int not null,
  name text not null,
  description text,
  max_score numeric(6,2) not null check (max_score > 0),
  comment_required boolean not null default false,
  min_pass_score numeric(6,2) check (min_pass_score is null or min_pass_score >= 0), -- 과락
  rubric jsonb not null default '[]'::jsonb,        -- [{"min":25,"max":30,"label":"독자 기술 검증됨"}]
  tie_priority int,                                 -- 동점 시 우선순위 (1이 최우선)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 기업·제출
-- ─────────────────────────────────────────────────────────────
create table companies (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  biz_no text,
  ceo text,
  field text,
  members jsonb not null default '[]'::jsonb,       -- [{"name":"","role":""}]
  contact_email text,
  blind_code text,                                  -- 블라인드 표시용 코드 (예: A-03)
  application_submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, blind_code)
);
create index on companies (owner_user_id);

create table stage_entries (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  result entry_result not null default 'pending',
  eligibility eligibility_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stage_id, company_id)
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references stage_entries(id) on delete cascade,
  file_type text not null,
  storage_path text not null,
  pdf_path text,                                    -- PPTX 변환본 (8-4)
  file_name text not null,
  file_size bigint,
  version int not null default 1,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index submissions_current_uq on submissions (entry_id, file_type) where is_current;

-- ─────────────────────────────────────────────────────────────
-- 심사위원·동의서·배정·평가
-- ─────────────────────────────────────────────────────────────
create table judges (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  affiliation text,
  expertise text,
  is_chair boolean not null default false,          -- 심사위원장 (2차)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, user_id)
);

create table consent_templates (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  kind text not null default 'privacy',             -- privacy / security / conflict / payment
  title text not null,
  body text not null,
  version int not null default 1,
  required boolean not null default true,
  is_active boolean not null default true,          -- 새 버전 등록 시 이전 버전 비활성 → 재서명 요청
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  judge_id uuid not null references judges(id) on delete cascade,
  template_id uuid not null references consent_templates(id) on delete restrict,
  signature_path text not null,
  signed_pdf_path text not null,
  signed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  doc_hash text not null,                           -- SHA-256
  conflict_declared boolean,                        -- 이해충돌 확인서: 이해관계 있음 여부
  conflict_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (judge_id, template_id)
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages(id) on delete cascade,
  judge_id uuid not null references judges(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  conflict boolean not null default false,          -- 이해충돌 → 배정 제외
  conflict_reason text,
  conflict_reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stage_id, judge_id, company_id)
);
create index on assignments (judge_id);
create index on assignments (stage_id, company_id);

create table scores (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  criterion_id uuid not null references criteria(id) on delete cascade,
  score numeric(6,2) check (score is null or score >= 0),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, criterion_id)
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references assignments(id) on delete cascade,
  overall_comment text,
  qna_memo text,                                    -- 발표심사 질의응답 메모 (J-06)
  status review_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table evaluation_submissions (
  id uuid primary key default gen_random_uuid(),
  judge_id uuid not null references judges(id) on delete cascade,
  stage_id uuid not null references stages(id) on delete cascade,
  status eval_submission_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  signature_path text,
  signed_pdf_path text,
  doc_hash text,
  reopened_by uuid references auth.users(id),
  reopened_at timestamptz,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (judge_id, stage_id)
);

create table stage_results (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  raw_score numeric(8,3),
  normalized_score numeric(8,3),
  bonus numeric(6,2) not null default 0,
  avg_score numeric(8,3),                           -- 최종 점수
  rank int,
  cutoff boolean not null default false,            -- 과락
  judge_count int not null default 0,
  detail jsonb not null default '{}'::jsonb,        -- 항목별 평균 등
  locked_at timestamptz,
  locked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stage_id, company_id)
);

create table chair_reviews (                         -- 심사위원장 종합의견·확인 서명 (2차)
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null unique references stages(id) on delete cascade,
  judge_id uuid not null references judges(id) on delete cascade,
  opinion text,
  confirmed_at timestamptz,
  signature_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 운영 (감사로그·공지·신청서·적격·가점·발표·이의·정산·풀·파기)
-- ─────────────────────────────────────────────────────────────
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,                             -- insert/update/delete/login/view/...
  table_name text,
  row_id uuid,
  before jsonb,
  after jsonb,
  ip text,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on audit_logs (created_at desc);
create index on audit_logs (table_name, row_id);

create table notices (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  title text not null,
  body text not null default '',
  target_role user_role,                            -- null = 전체
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table application_fields (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  label text not null,
  help text,
  type field_type not null default 'text',
  options jsonb not null default '[]'::jsonb,       -- select 옵션
  required boolean not null default false,
  is_eligibility boolean not null default false,    -- 자격요건 자가 체크 항목
  order_no int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table application_answers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  field_id uuid not null references application_fields(id) on delete cascade,
  value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, field_id)
);

create table eligibility_checks (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references stage_entries(id) on delete cascade,
  item text not null,
  result check_result not null,
  due_at timestamptz,
  note text,
  resolved_at timestamptz,                          -- 기업이 보완 제출한 시각
  checked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table bonus_rules (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages(id) on delete cascade,
  name text not null,
  points numeric(5,2) not null,                     -- ± 가점/감점
  evidence_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table entry_bonuses (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references stage_entries(id) on delete cascade,
  rule_id uuid not null references bonus_rules(id) on delete cascade,
  evidence_path text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  rejected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, rule_id)
);

create table presentation_slots (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  order_no int not null,
  start_at timestamptz,
  present_min int not null default 10,
  qna_min int not null default 5,
  status slot_status not null default 'waiting',
  phase_started_at timestamptz,                     -- 현재 단계(발표/질의) 시작 시각 → 타이머
  meeting_url text,
  draw_seed text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stage_id, company_id)
);

create table appeals (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique references stage_entries(id) on delete cascade, -- 1회 제한
  reason text not null,
  attachment_path text,
  status appeal_status not null default 'received',
  review_note text,                                 -- 내부 검토 의견
  rereview boolean,                                 -- 재심 여부
  response text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table judge_payments (
  id uuid primary key default gen_random_uuid(),
  judge_id uuid not null unique references judges(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  bank_name text,
  bank_enc text,                                    -- AES-256-GCM (서버 키) 암호문
  rrn_enc text,
  holder text,
  consent_at timestamptz,                           -- 별도 동의
  sessions int not null default 1,
  amount int not null default 0,
  tax int not null default 0,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table judge_pool (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text,
  phone text,
  affiliation text,
  expertise text[] not null default '{}',
  career text,
  history jsonb not null default '[]'::jsonb,       -- [{"program_id","title","year"}]
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table disposal_logs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs(id) on delete set null,
  program_title text,
  target text not null,
  disposed_at timestamptz not null default now(),
  method text not null,
  operator text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at 트리거 일괄 부착
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','programs','stages','criteria','companies','stage_entries','submissions','judges',
    'consent_templates','consents','assignments','scores','reviews','evaluation_submissions',
    'stage_results','chair_reviews','audit_logs','notices','application_fields','application_answers',
    'eligibility_checks','bonus_rules','entry_bonuses','presentation_slots','appeals','judge_payments',
    'judge_pool','disposal_logs']
  loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;
