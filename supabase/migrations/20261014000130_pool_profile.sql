-- 심사위원 후보 소개 (기관 검토 화면 오른쪽 패널)
-- { region, summary, fields[], career[], education[], certs[] }
alter table judge_pool add column if not exists profile jsonb;
