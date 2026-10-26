-- P2-0033 этап 1. Цена правила «закреплённые объекты» (033) на данных РБИ — ТОЛЬКО ЧТЕНИЕ, всё в транзакции с откатом.
-- Как perf/01_rls_cost.sql: те же 200 проверок (одна пачка загрузки приложения) и их пункты, роль authenticated + правила.
-- Сотрудник RBI из переноса; на время замера ему добавляется назначение «Инженер СК» с одним объектом (объект с наибольшим
-- числом проверок) — откатывается вместе со всем. Сравнение: то же назначение без объектов (как до 033). Цель — пачка ≤ 1 с.
begin;
create temp table _t (step text, ms numeric, n bigint) on commit drop;
grant insert on _t to authenticated;
do $$
declare
  c uuid := (select id from core.companies where name = 'RBI');
  u uuid := (select user_id from quality.rbi_transfer_people where core_company_id = (select id from core.companies where name = 'RBI')
              and user_id is not null order by email limit 1);
  r uuid := (select id from core.company_roles where company_id = (select id from core.companies where name = 'RBI') and template_code = 'qc_engineer');
  o text; a uuid; ids text[]; t0 timestamptz; n bigint; k int;
begin
  select po.id into o from quality.project_objects po
    join quality.rbi_inspections i on i.core_company_id = po.core_company_id
     and quality.object_clean(i.project_canonical_key) = quality.object_clean(po.canonical_key)
   where po.core_company_id = c group by po.id order by count(*) desc limit 1;
  select array_agg(id order by id) into ids from (select id from quality.rbi_inspections where core_company_id = c order by id limit 200) s;
  update core.role_assignments set revoked_at = now() where company_id = c and user_id = u and revoked_at is null;
  insert into core.role_assignments(company_id, user_id, role_id, quality_objects) values (c, u, r, array[o]) returning id into a;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', json_build_object('x-company-id', c)::text, true);
  for k in 1..2 loop
    execute 'set local role authenticated';
    t0 := clock_timestamp();
    select count(*) into n from quality.rbi_inspection_items where inspection_id = any (ids);
    insert into _t values (case k when 1 then '1 пункты пачки: инженер с объектом' else '2 пункты пачки: инженер без объектов (как до 033)' end,
                           round(extract(epoch from clock_timestamp() - t0) * 1000, 1), n);
    t0 := clock_timestamp();
    select count(*) into n from quality.rbi_inspections;
    insert into _t values (case k when 1 then '3 все проверки: инженер с объектом' else '4 все проверки: инженер без объектов' end,
                           round(extract(epoch from clock_timestamp() - t0) * 1000, 1), n);
    execute 'reset role';
    update core.role_assignments set quality_objects = null where id = a;
  end loop;
end $$;
select * from _t order by step;
rollback;
