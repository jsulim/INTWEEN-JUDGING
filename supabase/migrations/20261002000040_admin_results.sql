-- 관리자 결과·운영 화면 보조 (A-09 증빙 패키지 수정 이력, A-11 감사로그)
-- v_audit_logs: 감사로그 + 작업자 이름 + 행이 속한 프로그램·단계 (필터용)
-- security_invoker: 조회자의 RLS 그대로 (audit_logs 는 관리자 읽기 전용)

create or replace function try_uuid(p text) returns uuid
language sql immutable as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end;
$$;

create or replace view v_audit_logs with (security_invoker = true) as
with base as (
  select l.*, coalesce(l.after, l.before, '{}'::jsonb) as rowdata
  from audit_logs l
),
keyed as (
  select b.*,
         coalesce(case when b.table_name = 'stages' then b.row_id end,
                  try_uuid(b.rowdata ->> 'stage_id'),
                  (select a.stage_id from assignments a where a.id = try_uuid(b.rowdata ->> 'assignment_id')),
                  (select e.stage_id from stage_entries e where e.id = try_uuid(b.rowdata ->> 'entry_id')),
                  try_uuid(b.meta ->> 'stage_id')) as stage_id
  from base b
)
select k.id, k.actor_id, k.action, k.table_name, k.row_id, k.before, k.after, k.ip, k.meta, k.created_at,
       p.name as actor_name, p.email as actor_email, p.role as actor_role,
       k.stage_id,
       coalesce(case when k.table_name = 'programs' then k.row_id end,
                try_uuid(k.rowdata ->> 'program_id'),
                (select s.program_id from stages s where s.id = k.stage_id),
                (select j.program_id from judges j where j.id = try_uuid(k.rowdata ->> 'judge_id')),
                (select c.program_id from companies c where c.id = try_uuid(k.rowdata ->> 'company_id')),
                try_uuid(k.meta ->> 'program_id')) as program_id
from keyed k
left join profiles p on p.user_id = k.actor_id;

revoke all on v_audit_logs from anon;
grant select on v_audit_logs to authenticated;
