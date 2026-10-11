-- 본선 발표심사 운영 옵션 (2026 울진군 창업아이디어톤 회의 반영)
--  · 합격선: 최종 점수가 기준 미만이면 '합격선 미달' 표시 (예: 100점 만점 60점)
--  · 종합 심사평 필수: 비어 있으면 '완료'로 보지 않고 최종 제출 불가
--  · 수당 정산 사용 여부: 끄면 정산 메뉴를 숨긴다
--  · 관리자 점수 수정: 심사위원이 잘못 입력한 점수를 관리자가 바로잡는다 (확정 전까지, audit_row 로 이력 기록)

alter table stages add column if not exists pass_score numeric(6,2);
alter table stages add column if not exists overall_comment_required boolean not null default false;
alter table programs add column if not exists payments_enabled boolean not null default true;

create or replace function admin_can_edit_assignment(p_assignment_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() and exists (
    select 1 from assignments a join stages s on s.id = a.stage_id
    where a.id = p_assignment_id and not a.conflict and s.status not in ('locked', 'published')
  );
$$;
grant execute on function admin_can_edit_assignment(uuid) to authenticated;

create policy admin_insert on scores for insert to authenticated with check (admin_can_edit_assignment(assignment_id));
create policy admin_update on scores for update to authenticated
  using (admin_can_edit_assignment(assignment_id)) with check (admin_can_edit_assignment(assignment_id));
create policy admin_insert on reviews for insert to authenticated with check (admin_can_edit_assignment(assignment_id));
create policy admin_update on reviews for update to authenticated
  using (admin_can_edit_assignment(assignment_id)) with check (admin_can_edit_assignment(assignment_id));
