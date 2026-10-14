-- 대회(프로그램)별 심사위원 후보 목록
-- 심사위원 풀(judge_pool)은 모든 대회 공용 명단이고, 대회마다 후보를 골라 담는다.
-- 기관 공유 링크(pool_shares.program_id)는 그 대회 후보만 보여준다.
create table if not exists pool_members (
  program_id uuid not null references programs(id) on delete cascade,
  pool_id uuid not null references judge_pool(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (program_id, pool_id)
);
alter table pool_members enable row level security;
create policy admin_all on pool_members for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on pool_members to authenticated;
grant all on pool_members to service_role;
