-- P2-0011 этап 1: ТОЛЬКО ДЛЯ PGlite (на общем сервере НЕ запускать — создаёт данные и не откатывается).
-- Подготовка к проверке scripts/cleanup-test-projects.sql: компании «Альфа» (тест), «Бета» (тест), «Демо» (НЕ тест) и проекты
-- с полным набором защищённых данных (подтверждённый ВОР, КП, принятый и исправленный факт, выданный, аннулированный и черновой
-- акт КС-2, работы, журнал). Счётчики ДО — в public.cleanup_seed_before. Порядок: этот файл → скрипт (dry) → cleanup_check.pglite.sql
-- (режим dry) → скрипт (apply) → cleanup_check.pglite.sql → скрипт (apply) ещё раз → cleanup_check.pglite.sql.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $f$;

create table public.cleanup_seed(company text, name text, id uuid, expect_deleted boolean);
create or replace function pg_temp.full_project(p_company uuid, p_adm uuid, p_pto uuid, p_for uuid, p_name text, p_archive boolean)
returns uuid language plpgsql as $f$
declare p uuid; sec uuid; wt uuid; imp uuid; est uuid; kp uuid; br uuid; m2 uuid; pos uuid; f jsonb; a1 uuid; a2 uuid; td date := planfact.fact_today();
begin
  select id into m2 from core.units where company_id is null and code = 'м²';
  reset role; perform pg_temp.as_user(p_adm);
  p := public.pf_create_project(p_company, p_name);
  sec := public.pf_add_location(p, null, 'section', 'Секция 1');
  perform public.pf_add_location(p, sec, 'floor', 'Этаж 1');
  perform public.pf_project_set_dates(p, td - 30, td + 30);
  br := public.pf_brigade_save(p_company, null, 'Бригада ' || p_name);
  reset role;   -- работы (таблица 001) — напрямую: их триггер журнала тоже проверяется
  insert into planfact.works(company_id, project_id, name, created_by) values (p_company, p, 'Работа ' || p_name, p_adm);
  perform pg_temp.as_user(p_adm);
  reset role; perform pg_temp.as_user(p_pto);
  wt := public.pf_vor_add_work_type(p, 'Вид ' || p_name, m2);
  imp := public.pf_vor_create_import(p, 'вор.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, '[{"row_no": 1, "kind": "work", "number": "1", "name": "Пол", "unit_text": "м2", "qty": 100},
    {"row_no": 2, "kind": "material", "number": "1.1", "name": "Смесь", "unit_text": "кг", "qty": 50, "norm": 0.5, "parent_row_no": 1}]');
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(jsonb_build_object('row_no', 1, 'location_id', sec, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp);
  select id into pos from planfact.vor_positions where project_id = p;
  est := public.pf_estimate_create(p, 'Смета', array[imp]);
  kp := (public.pf_kp_create(est, repeat('a', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', imp, 'row_no', 1, 'kind', 'work', 'price_labor', 100),
    jsonb_build_object('import_id', imp, 'row_no', 2, 'kind', 'material', 'price_material', 10))), 10500) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(p, kp);
  reset role; perform pg_temp.as_user(p_for);
  f := public.pf_fact_add(pos, br, td - 5, 20);
  perform public.pf_fact_correct((f ->> 'id')::uuid, 15, 'уточнение');
  perform public.pf_fact_add(pos, br, td - 1, 5);
  reset role; perform pg_temp.as_user(p_pto);
  a1 := public.pf_ks2_act_create(p, '1', td - 1, td - 30, td - 1);
  perform public.pf_ks2_save(a1, '{}', '[]');
  perform public.pf_ks2_issue(a1);
  perform public.pf_ks2_annul(a1, 'проверка');
  a2 := public.pf_ks2_act_create(p, '2', td, td - 30, td);
  perform public.pf_ks2_save(a2, '{}', '[]');
  perform public.pf_ks2_issue(a2);
  perform public.pf_ks2_act_create(p, '3', td, td, td);
  if p_archive then
    reset role; perform pg_temp.as_user(p_adm);
    perform public.pf_update_project(p, p_name, null, true);
  end if;
  reset role;
  return p;
end $f$;

do $$
declare
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); cd uuid := gen_random_uuid();
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                    gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  p uuid;
begin
  insert into auth.users(id, email) select x, x || '@test.invalid' from unnest(u) x;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа', true), (cb, 'Бета', true), (cd, 'Демо-компания', false);
  insert into core.company_members(company_id, user_id) values (ca, u[1]), (ca, u[2]), (ca, u[3]), (cb, u[4]), (cb, u[5]), (cb, u[6]),
                                                                  (cd, u[7]), (cd, u[8]), (cd, u[9]);
  insert into core.role_assignments(company_id, user_id, role_id, project_id)
  select v.c, v.u, (select id from core.company_roles where company_id = v.c and template_code = v.code), null
  from (values (ca, u[1], 'company_admin'), (ca, u[2], 'pto'), (ca, u[3], 'foreman'), (cb, u[4], 'company_admin'), (cb, u[5], 'pto'),
               (cb, u[6], 'foreman'), (cd, u[7], 'company_admin'), (cd, u[8], 'pto'), (cd, u[9], 'foreman')) v(c, u, code);

  p := pg_temp.full_project(ca, u[1], u[2], u[3], 'REST-ВОР 2026-10-21T10:00', true);
  insert into public.cleanup_seed values ('Альфа', 'REST-ВОР 2026-10-21T10:00', p, true);
  p := pg_temp.full_project(ca, u[1], u[2], u[3], 'REST-ВОР 2026-10-22T10:00', true);
  insert into public.cleanup_seed values ('Альфа', 'REST-ВОР 2026-10-22T10:00', p, true);
  perform pg_temp.as_user(u[1]);
  p := public.pf_create_project(ca, 'REST-проект 2026-10-22T10:00', 'REST');
  perform public.pf_update_project(p, 'REST-проект 2026-10-22T10:00', 'REST', true);
  reset role;
  insert into public.cleanup_seed values ('Альфа', 'REST-проект 2026-10-22T10:00', p, true);
  p := pg_temp.full_project(ca, u[1], u[2], u[3], 'REST-автопроверки', false);             -- не архив — остаётся
  insert into public.cleanup_seed values ('Альфа', 'REST-автопроверки', p, false);
  p := pg_temp.full_project(ca, u[1], u[2], u[3], 'Альфа основной', false);
  insert into public.cleanup_seed values ('Альфа', 'Альфа основной', p, false);
  p := pg_temp.full_project(ca, u[1], u[2], u[3], 'Старый объект', true);                  -- архив, но не REST- — остаётся
  insert into public.cleanup_seed values ('Альфа', 'Старый объект', p, false);
  p := pg_temp.full_project(ca, u[1], u[2], u[3], 'rest-маленькими', true);                -- регистр другой — остаётся
  insert into public.cleanup_seed values ('Альфа', 'rest-маленькими', p, false);
  p := pg_temp.full_project(cb, u[4], u[5], u[6], 'REST-ВОР бета', true);
  insert into public.cleanup_seed values ('Бета', 'REST-ВОР бета', p, true);
  p := pg_temp.full_project(cd, u[7], u[8], u[9], 'REST-ВОР демо', true);                  -- НЕ тестовая компания — остаётся
  insert into public.cleanup_seed values ('Демо-компания', 'REST-ВОР демо', p, false);
  p := pg_temp.full_project(cd, u[7], u[8], u[9], 'Спутник', false);
  insert into public.cleanup_seed values ('Демо-компания', 'Спутник', p, false);
end $$;
reset role;

-- Счётчики ДО по каждому проекту и каждой таблице с project_id
create table public.cleanup_seed_before as
select s.id, x.t, x.n from public.cleanup_seed s cross join lateral (
  select 'vor_imports' t, (select count(*) from planfact.vor_imports where project_id = s.id) n
  union all select 'vor_source_rows', (select count(*) from planfact.vor_source_rows where project_id = s.id)
  union all select 'vor_positions', (select count(*) from planfact.vor_positions where project_id = s.id)
  union all select 'vor_links', (select count(*) from planfact.vor_links where project_id = s.id)
  union all select 'locations', (select count(*) from core.locations where project_id = s.id)
  union all select 'fact_entries', (select count(*) from planfact.fact_entries where project_id = s.id)
  union all select 'estimates', (select count(*) from planfact.estimates where project_id = s.id)
  union all select 'estimate_rows', (select count(*) from planfact.estimate_rows where project_id = s.id)
  union all select 'estimate_overheads', (select count(*) from planfact.estimate_overheads where project_id = s.id)
  union all select 'kp_revisions', (select count(*) from planfact.kp_revisions where project_id = s.id)
  union all select 'ks2_settings', (select count(*) from planfact.ks2_settings where project_id = s.id)
  union all select 'ks2_acts', (select count(*) from planfact.ks2_acts where project_id = s.id)
  union all select 'ks2_revisions', (select count(*) from planfact.ks2_revisions where project_id = s.id)
  union all select 'works', (select count(*) from planfact.works where project_id = s.id)
  union all select 'audit_log', (select count(*) from core.audit_log where project_id = s.id)
  union all select 'projects', (select count(*) from core.projects where id = s.id)) x;
create table public.cleanup_seed_company_before as
select (select count(*) from core.work_types) work_types, (select count(*) from planfact.brigades) brigades,
       (select count(*) from planfact.price_items) price_items, (select count(*) from core.company_roles) roles,
       (select count(*) from core.units) units, (select count(*) from core.companies) companies;
