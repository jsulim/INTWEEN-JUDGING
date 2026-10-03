-- Data API 역할 권한 부여
-- 최근 Supabase 프로젝트는 SQL 로 만든 테이블에 anon/authenticated/service_role 권한을 자동 부여하지 않을 수 있다.
-- 권한이 없으면 로그인 후 profiles 조회가 실패해 '계정 권한 정보가 없습니다'가 표시된다.
-- 행 단위 접근 통제는 RLS 정책이 그대로 담당한다.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
-- 심사위원·기업용 마스킹 뷰(소유자 권한으로 실행)는 비로그인 접근 차단 유지
revoke all on v_companies_blind, v_judge_submissions, v_my_entries from anon;
