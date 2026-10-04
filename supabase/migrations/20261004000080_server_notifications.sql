-- 알림을 화면 동작이 아니라 서버가 판단해 보낸다.
--  · 평가 시작(evaluation.started): 기존에는 관리자가 상태를 수동 변경할 때만 발송 → 5분 자동 전환 시 누락
--  · 점수 편차(score.deviation): 기존에는 관리자 대시보드 탭이 열려 있을 때만 브라우저가 발송 → 누락·중복
-- 발송 여부를 DB 에 기록해 수동·자동·여러 탭 어디서 호출해도 한 번만 나가게 한다.

-- 평가 시작 알림 발송 시각 (평가중 이전 상태로 되돌리면 null 로 초기화)
alter table stages add column if not exists eval_notified_at timestamptz;
-- 이미 평가중 이후인 단계는 발송된 것으로 본다 (배포 직후 일괄 재발송 방지)
update stages set eval_notified_at = now()
where eval_notified_at is null and status in ('evaluating', 'locked', 'published');

-- 편차 경고 발송 기록 (단계·기업별 1회)
create table if not exists deviation_alerts (
  stage_id uuid not null references stages(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  deviation numeric(6,2),
  notified_at timestamptz not null default now(),
  primary key (stage_id, company_id)
);
alter table deviation_alerts enable row level security;
create policy admin_read on deviation_alerts for select to authenticated using (is_admin());
grant select on deviation_alerts to authenticated;
grant all on deviation_alerts to service_role;

-- 5분마다 /api/cron/tick 호출 (pg_cron + pg_net).
-- 사이트 주소와 CRON_SECRET 은 Vault 에 넣는다 (값이 없으면 호출하지 않음):
--   select vault.create_secret('https://<사이트 주소>', 'app_site_url');
--   select vault.create_secret('<CRON_SECRET 값>', 'app_cron_secret');
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from information_schema.schemata where schema_name = 'vault') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule('notify-tick', '*/5 * * * *', $job$
      select net.http_get(
        url := u.decrypted_secret || '/api/cron/tick',
        headers := jsonb_build_object('Authorization', 'Bearer ' || s.decrypted_secret),
        timeout_milliseconds := 30000)
      from vault.decrypted_secrets u, vault.decrypted_secrets s
      where u.name = 'app_site_url' and s.name = 'app_cron_secret'
    $job$);
  end if;
end $$;
