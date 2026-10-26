-- P2-0035 этап 3 (039c): объекты ядра, заведённые до 039b, и объекты компании, у которой Качество включили позже, — в Качестве.
-- Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N». Запуск: после 039c_quality_objects_backfill_up.sql.
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;

do $$
declare
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid();
  p3 uuid := gen_random_uuid(); pc uuid := gen_random_uuid(); res text := '';
begin
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 039c', true), (cb, 'Бета 039c', true);
  -- объекты ядра — до Качества (как у компании, где Качество включают позже)
  insert into core.projects(id, company_id, name) values (p1, ca, 'ЖК Восток'), (p2, ca, 'ЖК Запад'), (p3, cb, 'ЖК Бета');
  insert into core.projects(id, company_id, name, archived_at) values (gen_random_uuid(), ca, 'ЖК Архив', now());
  insert into core.projects(id, company_id, name, quality_container) values (pc, ca, 'Контейнер 039c', true);
  res := res || pg_temp.t(not exists (select 1 from quality.project_objects where core_company_id = ca), 'до включения Качества — в Качестве пусто');
  insert into core.company_modules(company_id, module, enabled) values (ca, 'quality', true)
    on conflict (company_id, module) do update set enabled = true;
  res := res || pg_temp.t((select count(*) = 2 from quality.project_objects where core_company_id = ca and core_object_id in (p1, p2)),
                          'Качество включено — объекты ядра стали объектами Качества');
  res := res || pg_temp.t((select count(*) = 2 from quality.location_nodes where core_company_id = ca and "nodeType" = 'object'
                            and "displayName" in ('ЖК Восток', 'ЖК Запад')), '… и узлами дерева (выбор объекта в Качестве)');
  res := res || pg_temp.t(not exists (select 1 from quality.project_objects where core_company_id = ca and display_name in ('ЖК Архив', 'Контейнер 039c')),
                          'архивный объект и контейнер — не переносятся');
  res := res || pg_temp.t(not exists (select 1 from quality.project_objects where core_company_id = cb), 'компания без Качества — без изменений');
  res := res || pg_temp.t(quality.sync_company_objects(ca) = 0, 'повторно — ничего нового');
  update core.company_modules set enabled = false where company_id = ca and module = 'quality';
  update core.company_modules set enabled = true where company_id = ca and module = 'quality';
  res := res || pg_temp.t((select count(*) = 2 from quality.project_objects where core_company_id = ca), 'выключили и включили — не задвоилось');
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
