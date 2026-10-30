-- P2-0011, P2-0075: ТОЛЬКО ДЛЯ PGlite (на общем сервере НЕ запускать — создаёт данные и не откатывается).
-- Засев для проверки scripts/cleanup-test-projects.sql: «Альфа», «Бета», «Демо-компания» — тестовые (is_test), «РБИ» — нет.
-- Проекты с полным набором защищённых данных (подтверждённый ВОР и его редакция, КП, принятый и исправленный факт, выданный, аннулированный
-- и черновой акт КС-2, работы, журнал) и записи компании «REST…» (виды работ, цены, словарь, бригады, единицы, роли, контрагенты,
-- подразделения, места, строки Качества) рядом с обычными. public.cleanup_seed — проекты: удалить / оставить.
-- Счётчики ДО — public.cleanup_counts_before (по таблице, компании, проекту). Порядок — tests/server/cleanup.pglite.mjs.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', u::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $f$;

create table public.cleanup_seed(company text, name text, id uuid, expect_deleted boolean);
-- p_tag — приставка названий записей компании этого проекта (вид работ, бригада, файл ВОР, смета): у проектов «REST…» — «REST…»
create or replace function pg_temp.full_project(p_company uuid, p_adm uuid, p_pto uuid, p_for uuid, p_name text, p_tag text, p_archive boolean)
returns uuid language plpgsql as $f$
declare p uuid; bld uuid; sec uuid; fl uuid; wt uuid; imp uuid; rev uuid; est uuid; kp uuid; br uuid; m2 uuid; pos uuid; f jsonb;
  a1 uuid; a2 uuid; td date := planfact.fact_today();
begin
  select id into m2 from core.units where company_id is null and code = 'м²';
  perform pg_temp.as_user(p_adm);
  p := public.pf_create_project(p_company, p_name);
  bld := public.pf_add_location(p, null, 'building', 'Корпус 1');
  sec := public.pf_add_location(p, bld, 'section', 'Секция 1');
  fl := public.pf_add_location(p, sec, 'floor', 'Этаж 1');
  perform public.pf_project_set_dates(p, td - 30, td + 30);
  br := public.pf_brigade_save(p_company, null, p_tag || ' бригада ' || p_name, null, null);
  reset role;   -- работы (таблица 001) — напрямую: их триггер журнала тоже проверяется
  insert into planfact.works(company_id, project_id, name, created_by) values (p_company, p, p_tag || ' работа', p_adm);
  perform pg_temp.as_user(p_pto);
  wt := public.pf_vor_add_work_type(p, p_tag || ' вид ' || p_name, m2);
  imp := public.pf_vor_create_import(p, p_tag || ' вор.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, jsonb_build_array(
    jsonb_build_object('row_no', 1, 'kind', 'work', 'number', '1', 'name', p_tag || ' пол', 'unit_text', 'м2', 'qty', 100),
    jsonb_build_object('row_no', 2, 'kind', 'material', 'number', '1.1', 'name', p_tag || ' смесь', 'unit_text', 'кг', 'qty', 50, 'norm', 0.5, 'parent_row_no', 1)));
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(jsonb_build_object('row_no', 1, 'location_id', fl, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp);
  perform public.pf_vor_learn(p, jsonb_build_array(jsonb_build_object('name', p_tag || ' пол', 'unit_text', 'м2', 'work_type_id', wt)));
  perform public.pf_price_upsert(p_company, jsonb_build_array(jsonb_build_object('kind', 'work', 'work_type_id', wt, 'price_labor', 10, 'price_material', 1),
    jsonb_build_object('kind', 'material', 'name', p_tag || ' смесь', 'unit_text', 'кг', 'price_material', 2)), 'import:' || imp);
  select l.position_id into pos from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp and s.row_no = 1;
  -- редакция ВОР №2 (vor_heads, события позиции)
  rev := public.pf_vor_create_revision(imp, p_tag || ' вор ред2.xlsx', repeat('a', 64), 'Лист 1', null, '{}'::jsonb);
  perform public.pf_vor_add_rows(rev, jsonb_build_array(jsonb_build_object('row_no', 1, 'kind', 'work', 'name', p_tag || ' пол', 'unit_text', 'м2', 'qty', 80)));
  perform public.pf_vor_resolve_rows(rev, jsonb_build_array(jsonb_build_object('row_no', 1, 'location_id', fl, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_accept_revision(rev, jsonb_build_array(jsonb_build_object('row_no', 1, 'position_id', pos)), '[]'::jsonb);
  est := public.pf_estimate_create(p, p_tag || ' смета', array[rev]);
  kp := (public.pf_kp_create(est, repeat('a', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', rev, 'row_no', 1, 'kind', 'work', 'price_labor', 100))), 8000) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(p, kp);
  perform pg_temp.as_user(p_for);
  f := public.pf_fact_add(pos, br, td - 5, 20);
  perform public.pf_fact_correct((f ->> 'id')::uuid, 15, 'уточнение');
  perform public.pf_fact_submit(gen_random_uuid(), jsonb_build_object('kind', 'entry', 'position_id', pos, 'brigade_id', br, 'date', td - 1, 'qty', 5));
  perform pg_temp.as_user(p_pto);
  a1 := public.pf_ks2_act_create(p, '1', td - 1, td - 30, td - 1);
  perform public.pf_ks2_save(a1, '{}', '[]');
  perform public.pf_ks2_issue(a1);
  perform public.pf_ks2_annul(a1, 'проверка');
  a2 := public.pf_ks2_act_create(p, '2', td, td - 30, td);
  perform public.pf_ks2_save(a2, '{}', '[]');
  perform public.pf_ks2_issue(a2);
  perform public.pf_ks2_act_create(p, '3', td, td, td);
  if p_archive then
    perform pg_temp.as_user(p_adm);
    perform public.pf_update_project(p, p_name, null, true);
  end if;
  reset role;
  return p;
end $f$;

do $$
declare
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); cd uuid := gen_random_uuid(); cr uuid := gen_random_uuid();
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 12));
  p uuid; pk uuid; pm uuid; wt uuid; m2 uuid; imp uuid; o uuid; a uuid;
begin
  select id into m2 from core.units where company_id is null and code = 'м²';
  insert into auth.users(id, email) select x, x || '@test.invalid' from unnest(u) x;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа', true), (cb, 'Бета', true), (cd, 'Демо-компания', true), (cr, 'РБИ', false);
  insert into core.company_members(company_id, user_id)
  select c, u[i] from (values (ca, 1), (ca, 2), (ca, 3), (cb, 4), (cb, 5), (cb, 6), (cd, 7), (cd, 8), (cd, 9), (cr, 10), (cr, 11), (cr, 12)) v(c, i);
  insert into core.role_assignments(company_id, user_id, role_id, project_id)
  select v.c, u[v.i], (select id from core.company_roles where company_id = v.c and template_code = v.code), null
  from (values (ca, 1, 'company_admin'), (ca, 2, 'pto'), (ca, 3, 'foreman'), (cb, 4, 'company_admin'), (cb, 5, 'pto'), (cb, 6, 'foreman'),
               (cd, 7, 'company_admin'), (cd, 8, 'pto'), (cd, 9, 'foreman'), (cr, 10, 'company_admin'), (cr, 11, 'pto'), (cr, 12, 'foreman')) v(c, i, code);

  -- Альфа: основной (обычный, в нём ещё работы «REST-тест» и вид работ «REST…», на который ссылается ВОР — остаётся)
  pm := pg_temp.full_project(ca, u[1], u[2], u[3], 'Альфа основной', 'Кладка', false);
  insert into public.cleanup_seed values ('Альфа', 'Альфа основной', pm, false);
  insert into planfact.works(company_id, project_id, name, created_by) values (ca, pm, 'REST-тест 2026-10-30T10:00', u[2]), (ca, pm, 'REST-прораб REST-роль', u[3]);
  perform pg_temp.as_user(u[2]);
  wt := public.pf_vor_add_work_type(pm, 'REST-вид занят', m2);
  imp := public.pf_vor_create_import(pm, 'обычный вор.xlsx', repeat('c', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, '[{"row_no": 1, "kind": "work", "name": "Пол", "unit_text": "м2", "qty": 10}]');
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(jsonb_build_object('row_no', 1,
    'location_id', (select id from core.locations where project_id = pm and name = 'Этаж 1'), 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp);
  reset role;
  -- постоянный объект автопроверок: данные прогонов «REST…» убираются, объект и «Корпус 1» остаются
  pk := pg_temp.full_project(ca, u[1], u[2], u[3], 'REST-автопроверки', 'REST-ВОР 2026-10-30T11:00', false);
  insert into public.cleanup_seed values ('Альфа', 'REST-автопроверки', pk, false);
  perform pg_temp.as_user(u[1]);
  o := gen_random_uuid();
  perform public.pf_save_place(pk, o, null, 'object', 'REST-045 ' || left(o::text, 8), 'building');
  perform public.pf_fill_object(o, 1, 2, 2, 1, 'through', 1, false, false);
  perform public.pf_remove_place(o);
  -- назначения на объект: отозванное (остаток прогона — убирается) и действующее (остаётся)
  a := public.pf_assign_role(u[3], (select id from core.company_roles where company_id = ca and template_code = 'foreman'), pk);
  perform public.pf_revoke_assignment(a);
  perform public.pf_assign_role(u[2], (select id from core.company_roles where company_id = ca and template_code = 'pto'), pk);
  perform public.pf_create_role((select id from core.company_roles where company_id = ca and template_code = 'foreman'), 'REST-роль 2026-10-30T11:00');
  perform public.pf_add_unit(ca, 'rest1', 'REST единица');
  perform public.pf_delete_unit((select id from core.units where company_id = ca and code = 'rest1'));
  perform public.pf_save_division(ca, gen_random_uuid(), 'REST-045 подразделение', null, true);
  perform public.pf_save_division(ca, gen_random_uuid(), 'Отдел продаж', null, null);
  reset role;
  -- архивные и неархивные проекты «REST…» — удаляются целиком; «Старый объект» и «rest-маленькими» — остаются
  p := pg_temp.full_project(ca, u[1], u[2], u[3], 'REST-ВОР 2026-10-21T10:00', 'REST-ВОР 2026-10-21T10:00', true);
  insert into public.cleanup_seed values ('Альфа', 'REST-ВОР 2026-10-21T10:00', p, true);
  perform pg_temp.as_user(u[1]);
  p := public.pf_create_project(ca, 'REST-проект 2026-10-22T10:00', 'REST');
  reset role;
  insert into public.cleanup_seed values ('Альфа', 'REST-проект 2026-10-22T10:00', p, true);
  p := pg_temp.full_project(ca, u[1], u[2], u[3], 'Старый объект', 'Старое', true);
  insert into public.cleanup_seed values ('Альфа', 'Старый объект', p, false);
  p := pg_temp.full_project(ca, u[1], u[2], u[3], 'rest-маленькими', 'маленькими', true);
  insert into public.cleanup_seed values ('Альфа', 'rest-маленькими', p, false);
  -- Качество Альфы: строки «REST-…» (остатки прерванного прогона) и обычные; подрядчик из справочника → черновик в «Контрагентах»
  insert into quality.contractor_directory(id, project_code, canonical_key, display_name, core_company_id, core_project_id)
  values (gen_random_uuid(), pk::text, 'rest-018-1', 'REST-018 Подрядчик 1', ca, pk), (gen_random_uuid(), pm::text, 'rest-018-1', 'REST-018 Подрядчик 1', ca, pm),
         (gen_random_uuid(), pm::text, 'obychnyi', 'ООО Обычный подрядчик', ca, pm);
  insert into quality.rbi_inspections(id, project_code, core_company_id, core_project_id)
  values ('REST-018-1-insp', pk::text, ca, pk), ('insp-ok-1', pm::text, ca, pm);
  -- P2-0075 доработка №1: «REST…» в таблицах Качества с текстовым ключом (объекты, места) — после таблиц с ключом uuid
  -- (на боевой сухой прогон падал 42804: тип ключа менялся между таблицами одного цикла)
  insert into quality.project_objects(id, canonical_key, display_name, project_code, core_company_id, core_project_id)
  values ('po-rest-1', 'rest-045-obj', 'REST-045 объект', pk::text, ca, pk), ('po-ok-1', 'obychnyi-obj', 'Обычный объект', pm::text, ca, pm);
  insert into quality.location_nodes(id, "displayName", canonical_key, core_company_id, core_project_id)
  values ('ln-rest-1', 'REST-045 место', 'rest-045-mesto', ca, pk), ('ln-ok-1', 'Обычное место', 'obychnoe-mesto', ca, pm);

  -- Бета: архивный «REST…» — удаляется; основной — остаётся
  p := pg_temp.full_project(cb, u[4], u[5], u[6], 'REST-ВОР бета', 'REST-ВОР бета', true);
  insert into public.cleanup_seed values ('Бета', 'REST-ВОР бета', p, true);
  p := pg_temp.full_project(cb, u[4], u[5], u[6], 'Бета основной', 'Бета', false);
  insert into public.cleanup_seed values ('Бета', 'Бета основной', p, false);
  -- Демо (тестовая): обычный проект, бригада «REST…» — удаляется
  p := pg_temp.full_project(cd, u[7], u[8], u[9], 'Спутник', 'Демо', false);
  insert into public.cleanup_seed values ('Демо-компания', 'Спутник', p, false);
  perform pg_temp.as_user(u[7]);
  perform public.pf_brigade_save(cd, null, 'REST-бригада демо', null, null);
  reset role;
  -- РБИ (НЕ тестовая): полный обычный проект, без «REST…» — ничего не меняется
  p := pg_temp.full_project(cr, u[10], u[11], u[12], 'ЖК РБИ', 'РБИ', false);
  insert into public.cleanup_seed values ('РБИ', 'ЖК РБИ', p, false);
  insert into quality.contractor_directory(id, project_code, canonical_key, display_name, core_company_id, core_project_id)
  values (gen_random_uuid(), p::text, 'rbi', 'ООО Подрядчик РБИ', cr, p);
end $$;
reset role;

-- Счётчики по таблице, компании, проекту (в т. ч. журнал); ДО — public.cleanup_counts_before
create or replace function public.cleanup_counts() returns table(tbl text, company text, project text, n bigint) language plpgsql as $f$
declare t text; c text; pc text;
begin
  foreach t in array array['core.projects', 'core.locations', 'core.role_assignments', 'core.audit_log', 'core.work_types', 'core.units',
    'core.company_roles', 'core.counterparties', 'core.divisions', 'planfact.vor_imports', 'planfact.vor_source_rows', 'planfact.vor_positions',
    'planfact.vor_links', 'planfact.vor_heads', 'planfact.vor_position_events', 'planfact.fact_entries', 'planfact.fact_submissions',
    'planfact.estimates', 'planfact.estimate_rows', 'planfact.estimate_overheads', 'planfact.kp_revisions', 'planfact.ks2_settings',
    'planfact.ks2_acts', 'planfact.ks2_revisions', 'planfact.works', 'planfact.brigades', 'planfact.price_items', 'planfact.vor_dictionary',
    'quality.contractor_directory', 'quality.rbi_inspections', 'quality.location_nodes', 'quality.project_objects'] loop
    c := case when t like 'quality.%' then 'x.core_company_id' when t in ('planfact.vor_source_rows', 'planfact.vor_links', 'planfact.estimate_rows',
      'planfact.estimate_overheads') then '(select company_id from core.projects where id = x.project_id)' else 'x.company_id' end;
    pc := case when t like 'quality.%' then 'x.core_project_id' when t = 'core.projects' then 'x.id'
      when exists (select 1 from information_schema.columns where table_schema || '.' || table_name = t and column_name = 'project_id') then 'x.project_id'
      else 'null::uuid' end;
    return query execute format('select %L, coalesce(co.name, ''—''), coalesce(pr.name, ''—''), count(*) from %s x
      left join core.companies co on co.id = %s left join core.projects pr on pr.id = %s group by 2, 3', t, t, c, pc);
  end loop;
end $f$;
create table public.cleanup_counts_before as select * from public.cleanup_counts();
