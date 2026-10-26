-- P2-0035 доработка 1 (039d): M1 — закрепление переходит на пришедший объект Качества; M3 — пересчёт «не разобрано» один раз
-- на запрос и не на пересылку без изменений; L6 — переименование узла не трогает объект, найденный только по синониму.
-- Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N». Запуск: после 039d_quality_review_fixes_up.sql (PGlite — суперпользователь:
-- число вызовов quality.reresolve — по pg_stat_xact_user_functions).
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
create or replace function pg_temp.calls() returns bigint language sql as $f$
  select coalesce((select calls from pg_stat_xact_user_functions where schemaname = 'quality' and funcname = 'reresolve'), 0) $f$;

set track_functions = 'all';
do $$
declare
  ca uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); ue uuid := gen_random_uuid(); r_eng uuid;
  v uuid; v_auto text; n0 bigint; s text; res text := '';
begin
  insert into auth.users(id, email) values (ue, ue || '@test.invalid');
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 039d', true);
  insert into core.company_members(company_id, user_id) values (ca, ue);
  insert into core.projects(id, company_id, name, quality_container) values (pa, ca, 'Контейнер 039d', true);
  insert into core.company_modules(company_id, module, enabled) select ca, m, true from unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер 039d') returning id into r_eng;
  insert into core.company_role_permissions(role_id, company_id, action) select r_eng, ca, a from unnest(array['quality.view', 'quality.edit']) a;

  -- M1: объект «Компании» → объект Качества (сервер); инженер закреплён за ним; затем приходит объект с тем же ключом
  insert into core.projects(company_id, name) values (ca, 'ЖК Луч') returning id into v;
  select id into v_auto from quality.project_objects where core_company_id = ca and core_object_id = v;
  insert into core.role_assignments(company_id, user_id, role_id, quality_objects) values (ca, ue, r_eng, array[v_auto]);
  insert into quality.rbi_inspections(id, project_code, project_canonical_key, core_company_id) values ('i1-m39d', pa::text, 'луч', ca);
  insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id) values ('obj_real_m39d', 'луч', 'ЖК Луч', '{}', ca)
    on conflict do nothing;
  res := res || pg_temp.t((select quality_objects = array['obj_real_m39d'] from core.role_assignments where user_id = ue and company_id = ca),
                          'M1: закрепление перешло на пришедший объект');
  res := res || pg_temp.t(exists (select 1 from core.audit_log where company_id = ca and table_name = 'role_assignments'
                            and new_data ->> 'source' like 'P2-0035 039d%'), 'M1: перенос закрепления — в журнале');
  perform pg_temp.as_user(ue, ca);
  res := res || pg_temp.t((select count(*) = 1 from quality.rbi_inspections where id = 'i1-m39d'), 'M1: инженер по-прежнему видит записи объекта');
  reset role;

  -- M3: пачка синонимов одним запросом — один пересчёт; пересылка без изменений — ни одного
  insert into quality.rbi_inspections(id, project_code, project_display_name, core_company_id)
  select 'u' || g || '-m39d', pa::text, 'Лучик ' || g, ca from generate_series(1, 5) g;
  n0 := pg_temp.calls();
  insert into quality.object_aliases(id, raw_name, canonical_key, core_company_id)
  select 'al' || g || '-m39d', 'Лучик ' || g, 'луч', ca from generate_series(1, 5) g;
  res := res || pg_temp.t(pg_temp.calls() - n0 = 1, 'M3: 5 синонимов одним запросом — пересчёт 1 раз (было ' || (pg_temp.calls() - n0) || ')');
  res := res || pg_temp.t((select count(*) = 5 from quality.rbi_inspections where id like 'u%-m39d' and core_object_id = v),
                          'M3: записи узнаны после пачки');
  n0 := pg_temp.calls();
  update quality.object_aliases set updated_at = now() where id like 'al%-m39d';
  res := res || pg_temp.t(pg_temp.calls() - n0 = 0, 'M3: пересылка синонимов без изменений — без пересчёта');
  n0 := pg_temp.calls();
  insert into quality.location_nodes(id, canonical_key, "displayName", synonyms, "nodeType", core_company_id)
  select 'nb' || g || '-m39d', 'узел ' || g, 'Узел ' || g, '[]', 'object', ca from generate_series(1, 3) g;
  res := res || pg_temp.t(pg_temp.calls() - n0 <= 4, 'M3: 3 узла одним запросом — пересчёт не на каждую строку цепочки (' || (pg_temp.calls() - n0) || ')');

  -- L6: объект переименован (старое — синоним); новый узел со старым названием; его переименование не трогает объект ядра
  insert into quality.location_nodes(id, canonical_key, "displayName", synonyms, "nodeType", core_company_id)
  values ('na-m39d', 'жк заря', 'ЖК Заря', '[]', 'object', ca);
  select core_object_id into v from quality.project_objects where core_company_id = ca and display_name = 'ЖК Заря';
  update quality.location_nodes set "displayName" = 'ЖК Заря-2', canonical_key = 'жк заря-2' where id = 'na-m39d';
  res := res || pg_temp.t((select name = 'ЖК Заря-2' from core.projects where id = v), 'L6: переименование своего узла — объект ядра переименован');
  insert into quality.location_nodes(id, canonical_key, "displayName", synonyms, "nodeType", core_company_id)
  values ('nz-m39d', 'жк заря', 'ЖК Заря', '[]', 'object', ca);
  update quality.location_nodes set "displayName" = 'ЖК Восход' where id = 'nz-m39d';
  res := res || pg_temp.t((select name = 'ЖК Заря-2' from core.projects where id = v), 'L6: узел со старым названием переименован — чужой объект ядра не тронут');

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
