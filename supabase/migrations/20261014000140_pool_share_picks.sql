-- 기관 공유 링크에서 별표로 고른 심사위원 (링크마다 하나의 선정 목록, 로그인 없이 링크 열람자 모두 공유)
create table if not exists pool_share_picks (
  share_id uuid not null references pool_shares(id) on delete cascade,
  pool_id uuid not null references judge_pool(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (share_id, pool_id)
);
alter table pool_share_picks enable row level security;
-- 관리자는 직접 조회. 기관 화면은 서버(서비스 롤)가 토큰을 확인한 뒤 읽고 쓴다.
create policy admin_all on pool_share_picks for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on pool_share_picks to authenticated;
grant all on pool_share_picks to service_role;
