-- 신청서 제출(C-06)을 서버 함수로 옮긴다.
-- 기존에는 기업이 companies.application_submitted_at 을 브라우저에서 직접 써서, 접수 마감 뒤에도
-- 제출 시각을 임의로 바꾸거나 지울 수 있었고 필수 항목 검증도 화면에만 있었다.

-- 1) 기업은 제출 시각을 직접 바꿀 수 없다 (submit_application 경유만 허용)
create or replace function guard_company() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    if new.program_id <> old.program_id or new.owner_user_id is distinct from old.owner_user_id
       or new.blind_code is distinct from old.blind_code then
      raise exception 'forbidden_company_change' using errcode = '42501';
    end if;
    if new.application_submitted_at is distinct from old.application_submitted_at
       and current_setting('app.submitting_application', true) is distinct from 'on' then
      raise exception 'forbidden_company_change' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- 2) 제출: 소유·수정 기간·필수 항목을 DB 에서 확인하고 서버 시각으로 기록
create or replace function submit_application(p_company_id uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_at timestamptz := now();
  v_missing text;
begin
  if not exists (select 1 from companies where id = p_company_id and owner_user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not company_can_edit_application(p_company_id) then
    raise exception 'application_closed' using errcode = '42501';
  end if;
  select string_agg(f.label, ', ' order by f.order_no) into v_missing
  from application_fields f join companies c on c.program_id = f.program_id
  where c.id = p_company_id and f.required
    and not exists (
      select 1 from application_answers a
      where a.company_id = p_company_id and a.field_id = f.id
        and a.value is not null and a.value not in ('null'::jsonb, '""'::jsonb, 'false'::jsonb));
  if v_missing is not null then
    raise exception 'missing_required: %', v_missing using errcode = 'P0001';
  end if;
  perform set_config('app.submitting_application', 'on', true);
  update companies set application_submitted_at = v_at where id = p_company_id;
  perform set_config('app.submitting_application', 'off', true);
  return v_at;
end $$;
grant execute on function submit_application(uuid) to authenticated;

-- 3) 값이 그대로인 저장은 updated_at 을 올리지 않는다.
--    (제출 이후 '수정됨 · 다시 제출 필요' 판정을 answers.updated_at > application_submitted_at 으로 한다)
create or replace function skip_noop_update() returns trigger
language plpgsql as $$
begin
  return null;
end $$;
create trigger application_answers_0_skip_noop before update on application_answers
  for each row when (old.value is not distinct from new.value) execute function skip_noop_update();
