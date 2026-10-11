-- 심사위원 자가 가입 + 관리자 승인
-- 심사위원이 프로그램 가입 링크(/join/<program_id>)에서 Google 또는 이메일로 계정을 만들고 신청하면,
-- 관리자가 승인할 때 profiles(role=judge)·judges 행이 생긴다. 승인 전에는 프로필이 없어 어떤 화면에도 접근하지 못한다.
-- 초대 메일을 보내지 않아도 되므로 메일 발송 한도와 무관하다.

alter table programs add column if not exists judge_signup_open boolean not null default false;

create table if not exists judge_requests (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  name text not null,
  phone text,
  org text,
  expertise text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, user_id)
);
create index if not exists judge_requests_pending on judge_requests (program_id) where status = 'pending';

alter table judge_requests enable row level security;
-- 신청 생성·수정은 서버(서비스 롤)가 프로그램 접수 여부를 확인한 뒤에만 한다
create policy admin_all on judge_requests for all to authenticated using (is_admin()) with check (is_admin());
create policy own_read on judge_requests for select to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on judge_requests to authenticated;
grant all on judge_requests to service_role;
