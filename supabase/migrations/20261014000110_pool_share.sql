-- 심사위원 풀 공유 (기관 검토용)
-- 운영팀이 수집한 심사위원 후보 이력서를 분야별로 정리해, 기관에 링크 하나로 열람시킨다.
-- 이력서는 업로드 전에 주민번호·연락처·주소 가림, 신분증·통장 사본 제외를 마친 이미지 PDF만 올린다.

alter table judge_pool add column if not exists category text;          -- 분야 코드 (lib/pool.ts POOL_CATEGORIES)
alter table judge_pool add column if not exists position text;          -- 직위 (선택)
alter table judge_pool add column if not exists source text;            -- 추천 경로 (운영팀 내부용, 기관 화면 비노출)
alter table judge_pool add column if not exists resume_path text;       -- 이력서 PDF (program-files 버킷)
alter table judge_pool add column if not exists docs jsonb not null default '[]'::jsonb; -- 증빙 [{label, path}]
alter table judge_pool add column if not exists shareable boolean not null default true; -- 기관 공유 대상
create index if not exists judge_pool_category on judge_pool (category);

create table if not exists pool_shares (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  title text not null,
  program_id uuid references programs(id) on delete set null,
  categories text[],                 -- null = 전체 분야
  expires_at timestamptz,
  revoked_at timestamptz,
  view_count int not null default 0,
  last_viewed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table pool_shares enable row level security;
-- 관리자만 직접 접근. 기관 열람 화면은 서버(서비스 롤)가 토큰을 확인한 뒤 읽는다.
create policy admin_all on pool_shares for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on pool_shares to authenticated;
grant all on pool_shares to service_role;
