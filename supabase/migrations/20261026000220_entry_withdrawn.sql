-- 발표 포기(불참) 기업: 심사 대상에서는 빼고(부적격과 같이 배정·발표 순서·집계 제외) 최종 결과표에는 '포기'로 맨 아래에 표시한다
alter table stage_entries add column if not exists withdrawn boolean not null default false;

notify pgrst, 'reload schema';
