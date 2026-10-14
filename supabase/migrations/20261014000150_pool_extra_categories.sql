-- 심사위원 풀: 한 사람이 여러 분야에 보이도록 추가 분야 (category = 주 분야)
alter table judge_pool add column if not exists extra_categories text[] not null default '{}';
