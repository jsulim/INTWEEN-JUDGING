-- 기관 담당자용 심사 결과 열람 링크 (로그인 없이 링크 하나로 보기만)
-- 종합 평가표·심사위원별 채점 결과·제출 자료(발표자료·사업계획서)를 보여준다. 서버(서비스 롤)가 토큰을 확인한 뒤 읽는다.
create table if not exists result_shares (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  title text not null,
  program_id uuid not null references programs(id) on delete cascade,
  show_judge_names boolean not null default true,
  expires_at timestamptz,
  revoked_at timestamptz,
  view_count int not null default 0,
  last_viewed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table result_shares enable row level security;
drop policy if exists admin_all on result_shares;
create policy admin_all on result_shares for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on result_shares to authenticated;
grant all on result_shares to service_role;
