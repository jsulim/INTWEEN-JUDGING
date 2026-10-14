-- 기관 선정(별표)을 분야별로: 같은 사람이 관광·대학 두 분야에 있으면 누른 분야 탭으로 따로 담긴다
alter table pool_share_picks add column if not exists category text not null default '';
update pool_share_picks p set category = coalesce(j.category, '') from judge_pool j where j.id = p.pool_id and p.category = '';
alter table pool_share_picks drop constraint if exists pool_share_picks_pkey;
alter table pool_share_picks add primary key (share_id, pool_id, category);
