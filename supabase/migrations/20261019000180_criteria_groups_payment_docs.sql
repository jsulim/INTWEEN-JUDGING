-- 평가항목 대항목 묶음: 세부 항목별로 점수를 매기고, 화면·출력은 대항목(예: 사업성 30점) 아래에 묶어 보여준다.
-- 동점 우선순위는 같은 숫자를 준 항목끼리 평균을 합산해 비교한다 (대항목 단위 동점 처리).
alter table criteria add column if not exists group_name text;

-- 심사위원 정산 증빙: 신분증·통장 사본 (비공개 버킷, 정산 권한자만 열람)
alter table judge_payments add column if not exists id_card_path text;
alter table judge_payments add column if not exists bank_copy_path text;

-- 프로그램 복제: 대항목·합격선·종합 심사평 필수까지 복사
create or replace function clone_program(p_src uuid, p_title text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_new uuid; r record; v_stage uuid;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into programs (title, type, status, description, cloned_from, retention_years, payment_per_session)
  select p_title, type, 'draft', description, id, retention_years, payment_per_session from programs where id = p_src
  returning id into v_new;
  if v_new is null then raise exception 'not_found'; end if;

  for r in select * from stages where program_id = p_src order by order_no loop
    insert into stages (program_id, order_no, name, required_files, score_visible, blind_mode, normalize,
                        trim_extremes, bonus_cap, appeal_days, deviation_alert, is_presentation, pass_score, overall_comment_required)
    values (v_new, r.order_no, r.name, r.required_files, r.score_visible, r.blind_mode, r.normalize,
            r.trim_extremes, r.bonus_cap, r.appeal_days, r.deviation_alert, r.is_presentation, r.pass_score, r.overall_comment_required)
    returning id into v_stage;
    insert into criteria (stage_id, order_no, name, description, max_score, comment_required, min_pass_score, rubric, tie_priority, group_name)
    select v_stage, order_no, name, description, max_score, comment_required, min_pass_score, rubric, tie_priority, group_name
    from criteria where stage_id = r.id;
    insert into bonus_rules (stage_id, name, points, evidence_required)
    select v_stage, name, points, evidence_required from bonus_rules where stage_id = r.id;
  end loop;

  insert into application_fields (program_id, label, help, type, options, required, is_eligibility, order_no)
  select v_new, label, help, type, options, required, is_eligibility, order_no from application_fields where program_id = p_src;
  insert into consent_templates (program_id, kind, title, body, version, required, is_active)
  select v_new, kind, title, body, 1, required, true from consent_templates where program_id = p_src and is_active;
  return v_new;
end $$;
