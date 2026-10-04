-- 필수 동의서 양식이 하나도 없으면 '서명 완료'로 보지 않는다.
-- 기존에는 양식이 0개면 무조건 통과해, 양식을 빠뜨린 프로그램에서 심사위원이 동의 절차 없이
-- 자료 열람·평가를 할 수 있었다 (J-01 미서명 시 차단 원칙 위반).
create or replace function has_signed_all(p_judge_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from judges j
    join consent_templates t on t.program_id = j.program_id and t.is_active and t.required
    where j.id = p_judge_id
  ) and not exists (
    select 1
    from judges j
    join consent_templates t on t.program_id = j.program_id and t.is_active and t.required
    where j.id = p_judge_id
      and not exists (select 1 from consents c where c.judge_id = j.id and c.template_id = t.id)
  );
$$;
