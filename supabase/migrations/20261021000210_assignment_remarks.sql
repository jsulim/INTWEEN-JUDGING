-- 심사위원별 채점표 '비고' 란: 관리자만 쓰고 읽는다 (심사위원에게는 보이지 않음)
create table if not exists assignment_remarks (
  assignment_id uuid primary key references assignments(id) on delete cascade,
  remark text not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table assignment_remarks enable row level security;
drop policy if exists admin_all on assignment_remarks;
create policy admin_all on assignment_remarks for all to authenticated using (is_admin()) with check (is_admin());

notify pgrst, 'reload schema';
