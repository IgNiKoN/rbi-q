-- P2-0027 (ветка perf-debug). Замер цены правил доступа на пунктах проверок — ТОЛЬКО ЧТЕНИЕ, всё в транзакции с откатом.
-- Те же 200 проверок, что одна пачка загрузки приложения; от имени владельца (компания RBI в заголовке, как у клиента).
begin;
create temp table _t (step text, ms numeric, n bigint) on commit drop;
grant insert on _t to authenticated;
do $$
declare
  c uuid := (select id from core.companies where name = 'RBI');
  u uuid := (select user_id from quality.rbi_transfer_people where core_company_id = (select id from core.companies where name = 'RBI') limit 1);
  ids text[]; t0 timestamptz; n bigint;
begin
  select array_agg(id order by id) into ids from (select id from quality.rbi_inspections where core_company_id = c order by id limit 200) s;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', json_build_object('x-company-id', c)::text, true);

  t0 := clock_timestamp();
  select count(*) into n from quality.rbi_inspection_items where core_company_id = c and inspection_id = any (ids);
  insert into _t values ('1 без правил (только выборка)', round(extract(epoch from clock_timestamp() - t0) * 1000, 1), n);

  t0 := clock_timestamp();
  select count(i.core_created_by) + count(*) into n from quality.rbi_inspection_items it
    join quality.rbi_inspections i on i.core_company_id = it.core_company_id and i.id = it.inspection_id
   where it.core_company_id = c and it.inspection_id = any (ids);
  insert into _t values ('2 найти проверку каждого пункта', round(extract(epoch from clock_timestamp() - t0) * 1000, 1), n);

  t0 := clock_timestamp();
  select count(*) filter (where quality.member_by_email(c, i.engineer_name) is not null) into n from quality.rbi_inspection_items it
    join quality.rbi_inspections i on i.core_company_id = it.core_company_id and i.id = it.inspection_id
   where it.core_company_id = c and it.inspection_id = any (ids);
  insert into _t values ('3 поиск автора по имени (member_by_email) на каждый пункт', round(extract(epoch from clock_timestamp() - t0) * 1000, 1), n);

  t0 := clock_timestamp();
  select count(*) filter (where quality.row_visible(c, it.core_project_id, '{quality.view}', 'author', null, null, null, null)) into n
    from quality.rbi_inspection_items it where it.core_company_id = c and it.inspection_id = any (ids);
  insert into _t values ('4 проверка роли (row_visible) на каждый пункт', round(extract(epoch from clock_timestamp() - t0) * 1000, 1), n);

  t0 := clock_timestamp();
  select count(*) filter (where quality.inspection_child_visible(it.core_company_id, it.core_project_id, '{quality.view}', it.inspection_id, it.core_created_by)) into n
    from quality.rbi_inspection_items it where it.core_company_id = c and it.inspection_id = any (ids);
  insert into _t values ('5 всё правило пункта (inspection_child_visible)', round(extract(epoch from clock_timestamp() - t0) * 1000, 1), n);

  t0 := clock_timestamp();
  select count(*) filter (where quality.request_company() = c) into n from quality.rbi_inspection_items it where it.core_company_id = c and it.inspection_id = any (ids);
  insert into _t values ('6 только «текущая компания» (request_company) на каждый пункт', round(extract(epoch from clock_timestamp() - t0) * 1000, 1), n);

  execute 'set local role authenticated';
  t0 := clock_timestamp();
  select count(*) into n from quality.rbi_inspection_items where inspection_id = any (ids);
  insert into _t values ('7 как приложение: роль authenticated + правила', round(extract(epoch from clock_timestamp() - t0) * 1000, 1), n);
  execute 'reset role';
end $$;
select * from _t order by step;
rollback;
