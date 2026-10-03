-- 인트윈 심사 관리 플랫폼 · Storage·Realtime·Cron (5장, 8-2, 8-4)

-- Storage: 비공개 버킷. 직접 접근 정책 없음 → 서버가 발급한 서명 URL(유효 10분)로만 업로드·열람
-- 경로 규칙: {program_id}/{stage_id}/{company_id}/{file_type}_v{n}.{ext}
--           consents/{judge_id}/…, evaluations/{stage_id}/{judge_id}/…, bonus/…, appeals/…
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('program-files', 'program-files', false, 52428800,
            array['application/pdf',
                  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                  'image/png', 'image/jpeg', 'application/zip'])
    on conflict (id) do nothing;
  end if;
end $$;

-- Realtime: 관리자 대시보드(scores 구독), 발표 현장 모드(presentation_slots 구독)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table scores, reviews, presentation_slots, stages, assignments;
  end if;
end $$;

-- Cron: 5분마다 단계 일정 확인 → 자동 전환
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('auto-advance-stages', '*/5 * * * *', 'select public.auto_advance_stages()');
  end if;
end $$;
