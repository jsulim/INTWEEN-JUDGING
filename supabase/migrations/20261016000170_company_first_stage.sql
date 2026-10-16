-- 단계를 만든 뒤 등록한 기업도 첫 단계 심사 대상에 자동 포함 (대리 업로드·배정이 가능하도록)
create or replace function add_company_to_first_stage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into stage_entries (stage_id, company_id)
  select id, new.id from stages where program_id = new.program_id order by order_no limit 1
  on conflict (stage_id, company_id) do nothing;
  return new;
end $$;

drop trigger if exists companies_first_stage on companies;
create trigger companies_first_stage after insert on companies for each row execute function add_company_to_first_stage();

-- 이미 등록됐는데 어느 단계에도 없는 기업 보정
insert into stage_entries (stage_id, company_id)
select (select s.id from stages s where s.program_id = c.program_id order by s.order_no limit 1), c.id
from companies c
where not exists (select 1 from stage_entries e where e.company_id = c.id)
  and exists (select 1 from stages s where s.program_id = c.program_id)
on conflict (stage_id, company_id) do nothing;
