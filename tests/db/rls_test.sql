-- RLS·트리거·뷰 시나리오 검증 (scripts/test-db.sh 에서 실행)
\set ON_ERROR_STOP 1

-- ── 픽스처 (superuser) ─────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@t'),
  ('00000000-0000-0000-0000-0000000000c1', 'c1@t'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@t'),
  ('00000000-0000-0000-0000-0000000000f1', 'j1@t'),
  ('00000000-0000-0000-0000-0000000000f2', 'j2@t');
insert into profiles (user_id, role, name) values
  ('00000000-0000-0000-0000-00000000000a', 'admin', '관리자'),
  ('00000000-0000-0000-0000-0000000000c1', 'company', '기업1'),
  ('00000000-0000-0000-0000-0000000000c2', 'company', '기업2'),
  ('00000000-0000-0000-0000-0000000000f1', 'judge', '심사1'),
  ('00000000-0000-0000-0000-0000000000f2', 'judge', '심사2');
insert into programs (id, title) values ('10000000-0000-0000-0000-000000000001', '테스트 해커톤');
insert into stages (id, program_id, order_no, name, status, blind_mode, appeal_days)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, '1차 서류', 'evaluating', true, 3);
insert into criteria (id, stage_id, order_no, name, max_score, min_pass_score) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, '기술성', 30, 12),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 2, '사업성', 70, null);
insert into companies (id, program_id, owner_user_id, name, ceo) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', '알파테크', '김알파'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', '베타랩스', '이베타');
insert into stage_entries (id, stage_id, company_id) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002');
insert into submissions (entry_id, file_type, storage_path, file_name) values
  ('50000000-0000-0000-0000-000000000001', 'plan', 'p/s/c1/plan_v1.pdf', '알파테크_사업계획서.pdf'),
  ('50000000-0000-0000-0000-000000000002', 'plan', 'p/s/c2/plan_v1.pdf', '베타랩스_사업계획서.pdf');
insert into judges (id, program_id, user_id) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f2');
insert into consent_templates (id, program_id, title, body) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '개인정보 동의', '본문');
insert into consents (judge_id, template_id, signature_path, signed_pdf_path, doc_hash) values
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'sig.png', 'signed.pdf', 'h');
insert into assignments (id, stage_id, judge_id, company_id) values
  ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001');

create function pg_temp.expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant execute on function pg_temp.expect(boolean, text) to authenticated;

-- 블라인드 코드 자동 부여
select pg_temp.expect((select blind_code from companies where name = '알파테크') = 'A-01', '블라인드 코드 자동 부여');

-- ── 기업 1 ──────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', false);
set role authenticated;
select pg_temp.expect((select count(*) from submissions) = 1, 'Q1 기업은 본인 파일만 조회');
select pg_temp.expect((select count(*) from companies) = 1, 'Q1 기업은 본인 기업만 조회');
select pg_temp.expect((select count(*) from scores) = 0 and (select count(*) from audit_logs) = 0, '기업은 점수·감사로그 접근 불가');
select pg_temp.expect((select count(*) from criteria) = 0, '기업은 평가항목 읽기 불가');
select pg_temp.expect((select result from v_my_entries) is null, '결과공개 전 결과 비노출');
do $$ begin
  begin
    insert into appeals (entry_id, reason) values ('50000000-0000-0000-0000-000000000001', '재검토 요청');
    raise exception 'FAIL: 결과공개 전 이의신청이 허용됨';
  exception when insufficient_privilege then raise notice 'ok - Q16 결과공개 전 이의신청 거부';
  end;
  begin
    update profiles set role = 'admin' where user_id = auth.uid();
    raise exception 'FAIL: 역할 변경이 허용됨';
  exception when insufficient_privilege then raise notice 'ok - 비관리자 역할 변경 차단';
  end;
  begin
    insert into submissions (entry_id, file_type, storage_path, file_name)
    values ('50000000-0000-0000-0000-000000000001', 'deck', 'x', 'x.pdf');
    raise exception 'FAIL: 접수중 아닌 단계 업로드 허용';
  exception when insufficient_privilege then raise notice 'ok - Q2 접수기간 외 업로드 거부';
  end;
end $$;
reset role;
-- 접수중 단계에서는 업로드 허용 (정책이 실제 단계 상태를 보는지 확인)
update stages set status = 'submitting' where id = '20000000-0000-0000-0000-000000000001';
set role authenticated;
insert into submissions (entry_id, file_type, storage_path, file_name, is_current)
values ('50000000-0000-0000-0000-000000000001', 'deck', 'x', 'x.pdf', false);
select pg_temp.expect((select count(*) from submissions) = 2, '접수중 단계 업로드 허용');
reset role;
delete from submissions where file_type = 'deck';
update stages set status = 'evaluating' where id = '20000000-0000-0000-0000-000000000001';

-- ── 심사위원 1 (서명 완료, 기업1 배정) ───────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', false);
set role authenticated;
select pg_temp.expect((select count(*) from v_judge_submissions) = 1, 'Q4 배정 기업 파일만 노출');
select pg_temp.expect((select display_name from v_companies_blind) = 'A-01', 'Q12 블라인드 기업명 코드 표시');
select pg_temp.expect((select ceo from v_companies_blind) is null, 'Q12 블라인드 대표자명 마스킹');
select pg_temp.expect((select file_name from v_judge_submissions) = 'A-01_plan_v1.pdf', 'Q12 블라인드 파일명 마스킹');
select pg_temp.expect((select count(*) from submissions) = 0, '블라인드 단계 submissions 직접 조회 차단');
select pg_temp.expect((select count(*) from companies) = 0, '심사위원은 companies 직접 조회 불가');
select pg_temp.expect((select count(*) from criteria) = 2, '배정 단계 평가항목 읽기');
do $$ begin
  begin
    insert into scores (assignment_id, criterion_id, score) values
      ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 35);
    raise exception 'FAIL: 배점 초과 허용';
  exception when check_violation then raise notice 'ok - Q6 배점 초과 차단';
  end;
end $$;
insert into scores (assignment_id, criterion_id, score, comment) values
  ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 25, '좋음');
update scores set score = 27 where assignment_id = '80000000-0000-0000-0000-000000000001';
select pg_temp.expect((select score from scores) = 27, '평가중 점수 수정 가능');
reset role;
select pg_temp.expect((select count(*) from audit_logs where table_name = 'scores' and action = 'update'
  and actor_id = '00000000-0000-0000-0000-0000000000f1' and before ->> 'score' = '25.00' and after ->> 'score' = '27.00') = 1,
  '감사로그: 이전 값 → 새 값 기록');

-- ── 심사위원 2 (미서명) ────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2"}', false);
set role authenticated;
select pg_temp.expect((select count(*) from v_judge_submissions) = 0, 'Q3 미서명 심사위원 파일 열람 불가');
select pg_temp.expect((select count(*) from scores) = 0, '타 심사위원 점수 비노출(블라인드)');
do $$ begin
  begin
    insert into scores (assignment_id, criterion_id, score) values
      ('80000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 10);
    raise exception 'FAIL: 미서명 점수 입력 허용';
  exception when insufficient_privilege then raise notice 'ok - 미서명 심사위원 점수 입력 차단';
  end;
end $$;
reset role;

-- ── 확정 후 수정 (Q7) ─────────────────────────────────────────
update stages set status = 'locked' where id = '20000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', false);
set role authenticated;
update scores set score = 10 where assignment_id = '80000000-0000-0000-0000-000000000001';
select pg_temp.expect((select score from scores) = 27, 'Q7 확정 후 점수 수정 거부');
reset role;
update stages set status = 'evaluating' where id = '20000000-0000-0000-0000-000000000001';

-- ── 이해충돌 신고 → 배정 제외 ──────────────────────────────────
set role authenticated;
select report_conflict('80000000-0000-0000-0000-000000000001', '전 직장 동료');
select pg_temp.expect((select conflict from assignments where id = '80000000-0000-0000-0000-000000000001'), '이해충돌 신고 → 배정 제외');
select pg_temp.expect((select count(*) from v_judge_submissions) = 0, '이해충돌 후 파일 열람 불가');
update scores set score = 20 where assignment_id = '80000000-0000-0000-0000-000000000001';
select pg_temp.expect((select score from scores) = 27, '이해충돌 후 점수 수정 불가');
reset role;

-- ── 관리자 ───────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
set role authenticated;
select pg_temp.expect((select count(*) from submissions) = 2 and (select count(*) from scores) = 1, '관리자 전체 조회');
select pg_temp.expect((select count(*) from audit_logs) > 0, '관리자 감사로그 읽기');
do $$ begin
  begin
    delete from audit_logs;
    raise notice 'ok - 감사로그 삭제 정책 없음 (0행)';
  end;
end $$;
select pg_temp.expect((select count(*) from audit_logs) > 0, '감사로그 삭제 불가');
select clone_program('10000000-0000-0000-0000-000000000001', '복제본');
select pg_temp.expect((select count(*) from criteria c join stages s on s.id = c.stage_id
  join programs p on p.id = s.program_id where p.title = '복제본') = 2, 'A-02 프로그램 복제(평가항목 포함)');
select pg_temp.expect((select count(*) from v_stage_ranking) >= 1, '집계 뷰 조회');

-- 결과 공개 후 이의신청 기간 검증
reset role;
update stages set status = 'published', published_at = now() where id = '20000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', false);
set role authenticated;
insert into appeals (entry_id, reason) values ('50000000-0000-0000-0000-000000000001', '재검토 요청');
select pg_temp.expect((select count(*) from appeals) = 1, '결과공개 후 기간 내 이의신청 접수');
reset role;
update stages set published_at = now() - interval '10 days' where id = '20000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', false);
set role authenticated;
do $$ begin
  begin
    insert into appeals (entry_id, reason) values ('50000000-0000-0000-0000-000000000002', '늦은 신청');
    raise exception 'FAIL: 기간 경과 이의신청 허용';
  exception when insufficient_privilege then raise notice 'ok - Q16 기간 경과 이의신청 거부';
  end;
end $$;
reset role;

-- 자동 전환
update stages set status = 'ready', submit_start = now() - interval '1 hour', submit_end = now() + interval '1 day',
  eval_start = null where id = '20000000-0000-0000-0000-000000000001';
select auto_advance_stages();
select pg_temp.expect((select status from stages where id = '20000000-0000-0000-0000-000000000001') = 'submitting', 'Cron 자동 전환 준비→접수중');
