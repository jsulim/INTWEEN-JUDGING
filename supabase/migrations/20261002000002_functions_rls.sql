-- 인트윈 심사 관리 플랫폼 · 함수·트리거·뷰·RLS (개발 가이드 6~8장)
-- 원칙: 권한은 화면이 아니라 DB에서 강제한다.

-- ─────────────────────────────────────────────────────────────
-- 헬퍼 함수 (security definer: RLS 재귀 방지)
-- ─────────────────────────────────────────────────────────────
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function can_pay() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where user_id = auth.uid() and role = 'admin' and can_pay);
$$;

create or replace function my_judge_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from judges where user_id = auth.uid();
$$;

create or replace function my_company_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from companies where owner_user_id = auth.uid();
$$;

create or replace function my_program_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select program_id from companies where owner_user_id = auth.uid()
  union
  select program_id from judges where user_id = auth.uid();
$$;

-- 심사위원이 해당 프로그램의 활성·필수 동의서를 모두 서명했는가
create or replace function has_signed_all(p_judge_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1
    from judges j
    join consent_templates t on t.program_id = j.program_id and t.is_active and t.required
    where j.id = p_judge_id
      and not exists (select 1 from consents c where c.judge_id = j.id and c.template_id = t.id)
  );
$$;

-- 심사위원(현재 사용자)이 해당 단계·기업에 유효 배정되어 있는가
create or replace function is_assigned(p_stage_id uuid, p_company_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assignments a join judges j on j.id = a.judge_id
    where j.user_id = auth.uid() and a.stage_id = p_stage_id and a.company_id = p_company_id
      and not a.conflict
  );
$$;

create or replace function judge_in_stage(p_stage_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assignments a join judges j on j.id = a.judge_id
    where j.user_id = auth.uid() and a.stage_id = p_stage_id
  );
$$;

create or replace function is_eval_submitted(p_judge_id uuid, p_stage_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from evaluation_submissions
                 where judge_id = p_judge_id and stage_id = p_stage_id and status = 'submitted');
$$;

-- 점수·심사평 쓰기 가능 여부: 본인 배정 + 단계 '평가중' + 이해충돌 아님 + 서명 완료 + 최종 제출 전
create or replace function judge_can_write(p_assignment_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assignments a
    join judges j on j.id = a.judge_id
    join stages s on s.id = a.stage_id
    where a.id = p_assignment_id
      and j.user_id = auth.uid()
      and s.status = 'evaluating'
      and not a.conflict
      and has_signed_all(j.id)
      and not is_eval_submitted(j.id, a.stage_id)
  );
$$;

create or replace function judge_owns_assignment(p_assignment_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assignments a join judges j on j.id = a.judge_id
                 where a.id = p_assignment_id and j.user_id = auth.uid());
$$;

create or replace function owns_entry(p_entry_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from stage_entries e join companies c on c.id = e.company_id
                 where e.id = p_entry_id and c.owner_user_id = auth.uid());
$$;

create or replace function stage_accepting(p_stage_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from stages s where s.id = p_stage_id and s.status = 'submitting'
                 and (s.submit_start is null or now() >= s.submit_start)
                 and (s.submit_end is null or now() <= s.submit_end));
$$;

-- 아래 3개는 기업 정책에서 stage_entries(기업 직접 조회 불가)를 거쳐야 하므로 definer 함수로 둔다
create or replace function entry_accepting(p_entry_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select stage_accepting((select stage_id from stage_entries where id = p_entry_id));
$$;

-- 결과공개 후 appeal_days 이내
create or replace function entry_appeal_open(p_entry_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from stage_entries e join stages s on s.id = e.stage_id
                 where e.id = p_entry_id and s.status = 'published' and s.published_at is not null
                   and now() <= s.published_at + make_interval(days => s.appeal_days));
$$;

-- 신청서 수정 가능: 접수 기간 중이거나, 기한 내 미해결 보완 요청이 있을 때
create or replace function company_can_edit_application(p_company_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from companies c join programs p on p.id = c.program_id
    where c.id = p_company_id and c.owner_user_id = auth.uid()
      and ((p.application_open and (p.application_due is null or now() <= p.application_due))
           or exists (select 1 from eligibility_checks ec join stage_entries e on e.id = ec.entry_id
                      where e.company_id = c.id and ec.result = 'supplement' and ec.resolved_at is null
                        and (ec.due_at is null or now() <= ec.due_at))));
$$;

create or replace function request_ip() returns text
language sql stable as $$
  select nullif(split_part(coalesce(
    (nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'), ''), ',', 1), '');
$$;

-- ─────────────────────────────────────────────────────────────
-- 트리거: 감사로그 (누가, 언제, 이전 값 → 새 값)
-- ─────────────────────────────────────────────────────────────
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_before := to_jsonb(old) - 'updated_at'; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_after := to_jsonb(new) - 'updated_at'; end if;
  -- 민감정보 암호문은 로그에 남기지 않는다
  if tg_table_name = 'judge_payments' then
    v_before := v_before - 'bank_enc' - 'rrn_enc';
    v_after := v_after - 'bank_enc' - 'rrn_enc';
  end if;
  if tg_op = 'UPDATE' and v_before = v_after then return new; end if;
  v_id := coalesce((v_after ->> 'id')::uuid, (v_before ->> 'id')::uuid);
  insert into audit_logs (actor_id, action, table_name, row_id, before, after, ip)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_before, v_after, request_ip());
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'scores','reviews','stages','criteria','assignments','stage_entries','stage_results','entry_bonuses',
    'bonus_rules','eligibility_checks','evaluation_submissions','consents','consent_templates','appeals',
    'judge_payments','presentation_slots','companies','submissions','judges','programs','chair_reviews','profiles']
  loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_row()',
                   t || '_audit', t);
  end loop;
end $$;

-- 앱에서 남기는 이벤트(로그인·열람·재오픈 사유 등)
create or replace function log_event(p_action text, p_table text default null, p_row uuid default null,
                                     p_meta jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into audit_logs (actor_id, action, table_name, row_id, meta, ip)
  select auth.uid(), p_action, p_table, p_row, p_meta, request_ip()
  where auth.uid() is not null;
$$;

-- ─────────────────────────────────────────────────────────────
-- 트리거: 무결성 검증
-- ─────────────────────────────────────────────────────────────
-- Q6: 배점 초과 점수 차단 + 항목이 배정 단계 소속인지 확인
create or replace function validate_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max numeric; v_ok boolean;
begin
  select c.max_score, c.stage_id = a.stage_id into v_max, v_ok
  from criteria c, assignments a where c.id = new.criterion_id and a.id = new.assignment_id;
  if v_ok is not true then raise exception 'criterion_stage_mismatch' using errcode = '23514'; end if;
  if new.score is not null and new.score > v_max then
    raise exception 'score_exceeds_max: % > %', new.score, v_max using errcode = '23514';
  end if;
  return new;
end $$;
create trigger scores_validate before insert or update on scores for each row execute function validate_score();

-- 비관리자는 역할·정산권한을 바꿀 수 없다
create or replace function guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    if new.role <> old.role or new.can_pay <> old.can_pay or new.user_id <> old.user_id then
      raise exception 'forbidden_profile_change' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles for each row execute function guard_profile();

-- 기업은 소속 프로그램·소유자·블라인드 코드를 바꿀 수 없다
create or replace function guard_company() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    if new.program_id <> old.program_id or new.owner_user_id is distinct from old.owner_user_id
       or new.blind_code is distinct from old.blind_code then
      raise exception 'forbidden_company_change' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger companies_guard before update on companies for each row execute function guard_company();

-- 블라인드 코드 자동 부여 (A-01, A-02 …)
create or replace function assign_blind_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.blind_code is null then
    perform pg_advisory_xact_lock(hashtext(new.program_id::text));
    select count(*) + 1 into n from companies where program_id = new.program_id;
    loop
      new.blind_code := 'A-' || lpad(n::text, 2, '0');
      exit when not exists (select 1 from companies where program_id = new.program_id and blind_code = new.blind_code);
      n := n + 1;
    end loop;
  end if;
  return new;
end $$;
create trigger companies_blind_code before insert on companies for each row execute function assign_blind_code();

-- 평가 시작 후 평가항목 변경 시 경고는 UI에서, 확정 이후 변경은 DB에서 차단
create or replace function guard_criteria() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status stage_status;
begin
  select status into v_status from stages where id = coalesce(new.stage_id, old.stage_id);
  if v_status in ('locked', 'published') then
    raise exception 'stage_locked' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger criteria_guard before insert or update or delete on criteria for each row execute function guard_criteria();

-- ─────────────────────────────────────────────────────────────
-- RPC
-- ─────────────────────────────────────────────────────────────
-- 이해충돌 상시 신고 (J-04) → 해당 배정 자동 제외
create or replace function report_conflict(p_assignment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not judge_owns_assignment(p_assignment_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update assignments set conflict = true, conflict_reason = p_reason, conflict_reported_at = now()
  where id = p_assignment_id;
end $$;

-- 프로그램 복제 (A-02): 단계·평가항목·가점규칙·신청항목·동의서 양식 복사, 일정·참가자는 제외
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
                        trim_extremes, bonus_cap, appeal_days, deviation_alert, is_presentation)
    values (v_new, r.order_no, r.name, r.required_files, r.score_visible, r.blind_mode, r.normalize,
            r.trim_extremes, r.bonus_cap, r.appeal_days, r.deviation_alert, r.is_presentation)
    returning id into v_stage;
    insert into criteria (stage_id, order_no, name, description, max_score, comment_required, min_pass_score, rubric, tie_priority)
    select v_stage, order_no, name, description, max_score, comment_required, min_pass_score, rubric, tie_priority
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

-- 단계 자동 전환 (Supabase Cron 5분 주기): 준비→접수중→평가중. 확정·결과공개는 관리자 수동.
create or replace function auto_advance_stages() returns int
language plpgsql security definer set search_path = public as $$
declare n1 int; n2 int;
begin
  update stages set status = 'submitting'
  where status = 'ready' and submit_start is not null and now() >= submit_start
    and (submit_end is null or now() < submit_end);
  get diagnostics n1 = row_count;
  update stages set status = 'evaluating'
  where status in ('ready', 'submitting') and eval_start is not null and now() >= eval_start;
  get diagnostics n2 = row_count;
  return n1 + n2;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 뷰
-- ─────────────────────────────────────────────────────────────
-- 원점수 집계 (8-1): 심사위원 합계 → 평균(옵션: 5명 이상이면 최고·최저 제외) → 순위
-- security_invoker: 조회자의 RLS가 그대로 적용 (관리자만 전체)
create or replace view v_stage_ranking with (security_invoker = true) as
with judge_totals as (
  select a.stage_id, a.company_id, a.judge_id, sum(sc.score) as total,
         count(sc.score) as scored, (select count(*) from criteria c where c.stage_id = a.stage_id) as n_criteria
  from assignments a
  left join scores sc on sc.assignment_id = a.id
  where not a.conflict
  group by a.stage_id, a.company_id, a.judge_id
),
ranked as (
  select jt.*, s.trim_extremes,
         count(*) filter (where jt.scored = jt.n_criteria) over w as n_done,
         count(*) over w as n_assigned,
         row_number() over (partition by jt.stage_id, jt.company_id order by jt.total desc nulls last) as r_desc,
         row_number() over (partition by jt.stage_id, jt.company_id order by jt.total asc nulls last) as r_asc
  from judge_totals jt join stages s on s.id = jt.stage_id
  window w as (partition by jt.stage_id, jt.company_id)
),
agg as (
  select stage_id, company_id, max(n_assigned) as judge_count, max(n_done) as done_count,
         avg(total) filter (where scored = n_criteria and not (trim_extremes and n_done >= 5 and (r_desc = 1 or r_asc = 1))) as avg_score
  from ranked group by stage_id, company_id
)
select stage_id, company_id, judge_count, done_count, round(avg_score, 3) as avg_score,
       done_count < judge_count as in_progress,
       rank() over (partition by stage_id order by avg_score desc nulls last) as rank
from agg;

-- 심사위원용 기업 정보: 블라인드 단계에서는 기업명·대표자명을 코드로 마스킹
create or replace view v_companies_blind as
select a.stage_id, c.id as company_id, a.id as assignment_id, a.judge_id, a.conflict,
       s.blind_mode,
       case when s.blind_mode then c.blind_code else c.name end as display_name,
       case when s.blind_mode then null else c.ceo end as ceo,
       c.field,
       case when s.blind_mode then null else c.members end as members,
       c.blind_code
from assignments a
join judges j on j.id = a.judge_id and j.user_id = auth.uid()
join companies c on c.id = a.company_id
join stages s on s.id = a.stage_id;

-- 심사위원용 제출 파일 목록: 배정 + 서명 완료 시에만, 블라인드면 파일명 마스킹
create or replace view v_judge_submissions as
select e.stage_id, e.company_id, sub.id as submission_id, sub.file_type, sub.version, sub.created_at,
       sub.pdf_path is not null or sub.storage_path ilike '%.pdf' as viewable,
       case when s.blind_mode then c.blind_code || '_' || sub.file_type || '_v' || sub.version
              || coalesce(substring(sub.file_name from '\.[A-Za-z0-9]+$'), '')
            else sub.file_name end as file_name
from submissions sub
join stage_entries e on e.id = sub.entry_id
join stages s on s.id = e.stage_id
join companies c on c.id = e.company_id
where sub.is_current
  and exists (select 1 from assignments a join judges j on j.id = a.judge_id
              where j.user_id = auth.uid() and a.stage_id = e.stage_id and a.company_id = e.company_id
                and not a.conflict and has_signed_all(j.id));

-- 기업용 단계 참가 현황: 결과는 '결과공개' 단계만 노출
create or replace view v_my_entries as
select e.id as entry_id, e.stage_id, e.company_id, s.program_id, s.name as stage_name, s.order_no, s.status as stage_status,
       s.submit_start, s.submit_end, s.required_files, s.blind_mode, s.appeal_days, s.published_at, s.score_visible,
       e.eligibility,
       case when s.status = 'published' then e.result else null end as result
from stage_entries e
join stages s on s.id = e.stage_id
join companies c on c.id = e.company_id and c.owner_user_id = auth.uid();

-- 뷰 접근 권한
revoke all on v_companies_blind, v_judge_submissions, v_my_entries from anon;
grant select on v_stage_ranking, v_companies_blind, v_judge_submissions, v_my_entries to authenticated;

-- ─────────────────────────────────────────────────────────────
-- RLS 정책 (7장)
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','programs','stages','criteria','companies','stage_entries','submissions','judges',
    'consent_templates','consents','assignments','scores','reviews','evaluation_submissions',
    'stage_results','chair_reviews','audit_logs','notices','application_fields','application_answers',
    'eligibility_checks','bonus_rules','entry_bonuses','presentation_slots','appeals','judge_payments',
    'judge_pool','disposal_logs']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
  -- 관리자 전체 권한 (감사로그·파기대장·정산 제외)
  foreach t in array array[
    'profiles','programs','stages','criteria','companies','stage_entries','submissions','judges',
    'consent_templates','assignments','stage_results','chair_reviews','notices','application_fields',
    'application_answers','eligibility_checks','bonus_rules','entry_bonuses','presentation_slots','appeals',
    'judge_pool','evaluation_submissions']
  loop
    execute format('create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- 관리자 읽기 전용
create policy admin_read on scores for select to authenticated using (is_admin());
create policy admin_read on reviews for select to authenticated using (is_admin());
create policy admin_read on consents for select to authenticated using (is_admin());
create policy admin_read on audit_logs for select to authenticated using (is_admin());
create policy admin_read on disposal_logs for select to authenticated using (is_admin());
-- 정산: 일반 관리자는 목록(암호문)만, 수정·복호화는 정산 권한자
create policy admin_read on judge_payments for select to authenticated using (is_admin());
create policy payer_write on judge_payments for update to authenticated using (can_pay()) with check (can_pay());

-- profiles: 본인 읽기·수정
create policy own_read on profiles for select to authenticated using (user_id = auth.uid());
create policy own_update on profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- programs / stages: 참여 프로그램만 읽기
create policy member_read on programs for select to authenticated using (id in (select my_program_ids()));
create policy member_read on stages for select to authenticated using (program_id in (select my_program_ids()));

-- criteria: 심사위원은 배정 단계만
create policy judge_read on criteria for select to authenticated using (judge_in_stage(stage_id));

-- companies: 기업은 본인 소유 행 읽기·수정. 심사위원은 v_companies_blind 로만 조회
create policy owner_read on companies for select to authenticated using (owner_user_id = auth.uid());
create policy owner_update on companies for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- stage_entries: 기업은 v_my_entries 로 조회 (결과 비공개 처리). 직접 접근 없음.

-- submissions: 기업 본인 행 읽기, 접수중일 때만 쓰기 / 심사위원 배정+서명 완료+비블라인드 단계 읽기
create policy company_read on submissions for select to authenticated using (owns_entry(entry_id));
create policy company_insert on submissions for insert to authenticated
  with check (owns_entry(entry_id) and entry_accepting(entry_id));
create policy judge_read on submissions for select to authenticated using (
  exists (select 1 from stage_entries e join stages s on s.id = e.stage_id
          join assignments a on a.stage_id = e.stage_id and a.company_id = e.company_id and not a.conflict
          join judges j on j.id = a.judge_id and j.user_id = auth.uid()
          where e.id = submissions.entry_id and not s.blind_mode and has_signed_all(j.id)));

-- judges: 본인 행
create policy own_read on judges for select to authenticated using (user_id = auth.uid());

-- consent_templates: 심사위원은 소속 프로그램 활성 양식
create policy judge_read on consent_templates for select to authenticated
  using (is_active and program_id in (select program_id from judges where user_id = auth.uid()));

-- consents: 본인 행 생성·읽기 (수정·삭제 정책 없음 = 불가)
create policy judge_read on consents for select to authenticated using (judge_id in (select my_judge_ids()));
create policy judge_insert on consents for insert to authenticated with check (judge_id in (select my_judge_ids()));

-- assignments: 본인 배정 읽기 (이해충돌 신고는 report_conflict RPC)
create policy judge_read on assignments for select to authenticated using (judge_id in (select my_judge_ids()));

-- scores / reviews: 본인 assignment 만, 평가중 + 미확정 + 최종제출 전에만 쓰기 (7장 예시 정책)
create policy judge_read on scores for select to authenticated using (judge_owns_assignment(assignment_id));
create policy judge_insert on scores for insert to authenticated with check (judge_can_write(assignment_id));
create policy judge_update on scores for update to authenticated
  using (judge_can_write(assignment_id)) with check (judge_can_write(assignment_id));
create policy judge_delete on scores for delete to authenticated using (judge_can_write(assignment_id));
create policy judge_read on reviews for select to authenticated using (judge_owns_assignment(assignment_id));
create policy judge_insert on reviews for insert to authenticated with check (judge_can_write(assignment_id));
create policy judge_update on reviews for update to authenticated
  using (judge_can_write(assignment_id)) with check (judge_can_write(assignment_id));

-- evaluation_submissions: 본인 읽기 (생성은 서버에서 검증 후)
create policy judge_read on evaluation_submissions for select to authenticated using (judge_id in (select my_judge_ids()));

-- stage_results: 기업은 결과공개 단계의 본인 행 / 위원장은 확정 이후 단계 전체
create policy company_read on stage_results for select to authenticated using (
  company_id in (select my_company_ids())
  and exists (select 1 from stages s where s.id = stage_id and s.status = 'published'));
create policy chair_read on stage_results for select to authenticated using (
  exists (select 1 from stages s join judges j on j.program_id = s.program_id
          where s.id = stage_results.stage_id and j.user_id = auth.uid() and j.is_chair
            and s.status in ('locked', 'published')));

-- chair_reviews: 위원장 본인
create policy chair_rw on chair_reviews for all to authenticated
  using (judge_id in (select id from judges where user_id = auth.uid() and is_chair))
  with check (judge_id in (select id from judges where user_id = auth.uid() and is_chair));

-- notices: 대상 역할 공지
create policy member_read on notices for select to authenticated using (
  program_id in (select my_program_ids())
  and (target_role is null or target_role = (select role from profiles where user_id = auth.uid())));

-- application_fields / answers
create policy company_read on application_fields for select to authenticated
  using (program_id in (select program_id from companies where owner_user_id = auth.uid()));
create policy company_read on application_answers for select to authenticated using (company_id in (select my_company_ids()));
create policy company_write on application_answers for all to authenticated
  using (company_can_edit_application(company_id)) with check (company_can_edit_application(company_id));

-- eligibility_checks: 기업 본인 읽기
create policy company_read on eligibility_checks for select to authenticated using (owns_entry(entry_id));

-- bonus_rules / entry_bonuses: 기업은 규칙 읽기, 본인 신청 생성·읽기·삭제(승인 전)
create policy member_read on bonus_rules for select to authenticated
  using (exists (select 1 from stages s where s.id = stage_id and s.program_id in (select my_program_ids())));
create policy company_read on entry_bonuses for select to authenticated using (owns_entry(entry_id));
create policy company_insert on entry_bonuses for insert to authenticated
  with check (owns_entry(entry_id) and approved_at is null);
create policy company_delete on entry_bonuses for delete to authenticated
  using (owns_entry(entry_id) and approved_at is null);

-- presentation_slots: 심사위원은 배정 단계, 기업은 본인 슬롯
create policy judge_read on presentation_slots for select to authenticated using (judge_in_stage(stage_id));
create policy company_read on presentation_slots for select to authenticated using (company_id in (select my_company_ids()));

-- appeals: 기업 본인 행 생성(결과공개 후 기간 내)·읽기
create policy company_read on appeals for select to authenticated using (owns_entry(entry_id));
create policy company_insert on appeals for insert to authenticated
  with check (owns_entry(entry_id) and entry_appeal_open(entry_id));

-- judge_payments: 심사위원 본인 읽기 (입력은 서버에서 암호화 후 저장)
create policy judge_read on judge_payments for select to authenticated using (judge_id in (select my_judge_ids()));
