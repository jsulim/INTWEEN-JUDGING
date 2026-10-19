-- 이해충돌 확인서에서 이해관계 기업을 등록된 기업 목록에서 고른다.
-- 고른 기업은 서명 즉시 (이미 배정된 경우) 그리고 나중에 배정되더라도 자동으로 이해충돌 제외된다.
alter table consents add column if not exists conflict_company_ids uuid[] not null default '{}';

create or replace function apply_consent_conflicts() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_note text; v_at timestamptz;
begin
  select c.conflict_note, c.signed_at into v_note, v_at
  from consents c
  where c.judge_id = new.judge_id and new.company_id = any(c.conflict_company_ids)
  order by c.signed_at desc limit 1;
  if found then
    new.conflict := true;
    new.conflict_reason := '동의서 이해관계 신고' || coalesce(': ' || nullif(v_note, ''), '');
    new.conflict_reported_at := v_at;
  end if;
  return new;
end $$;

drop trigger if exists assignments_consent_conflict on assignments;
create trigger assignments_consent_conflict before insert on assignments
  for each row execute function apply_consent_conflicts();

notify pgrst, 'reload schema';
