-- P2-0006d мини-доработка (046c): материалы в «уже выставлено» КС-2 без столкновений — [A, B] → [C, A] (B не уходит в A),
-- [A, A] → [A] (оба выставленных — в один), индекс по corrects_id.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 046c_vor_revisions_ks2_materials_up.sql.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
create or replace function pg_temp.pos(imp uuid, rn int) returns uuid language sql as $f$
  select l.position_id from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp and s.row_no = rn $f$;
create or replace function pg_temp.k(p uuid, kp uuid, rn int) returns text language sql as $f$
  select coalesce((select 'всего ' || total_qty || ', выставлено ' || prev_qty || ', к выставлению ' || sys_qty
                   from planfact.ks2_rows(p, (now() at time zone 'Europe/Moscow')::date, kp) where row_no = rn), 'нет строки') $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); pa uuid; r_adm uuid; r_pto uuid; r_for uuid;
  bld uuid; f5 uuid; kv uuid; m2 uuid; wt uuid; wt2 uuid; b1 uuid;
  imp1 uuid; imp2 uuid; pos_1 uuid; pos_2 uuid; est1 uuid; est2 uuid; kp1 uuid; kp2 uuid; a1 uuid; res text := '';
  today date := (now() at time zone 'Europe/Moscow')::date;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, upto, ufor]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 046c', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, upto), (ca, ufor);
  select id into r_adm from core.company_roles where company_id = ca and template_code = 'company_admin';
  select id into r_pto from core.company_roles where company_id = ca and template_code = 'pto';
  select id into r_for from core.company_roles where company_id = ca and template_code = 'foreman';
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values (ca, uadm, r_adm, null), (ca, upto, r_pto, null), (ca, ufor, r_for, null);
  select id into m2 from core.units where company_id is null and code = 'м²';
  res := res || pg_temp.t(to_regclass('planfact.fact_entries_corrects_idx') is not null, 'индекс по corrects_id есть');

  perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК 046c');
  bld := public.pf_add_location(pa, null, 'building', 'Корпус 1');
  f5 := public.pf_add_location(pa, bld, 'floor', '5 этаж');
  kv := public.pf_add_location(pa, f5, 'apartment', 'Кв. 1');
  b1 := public.pf_brigade_save(ca, null, 'Бригада 046c', null, null);
  perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка стен', m2);
  wt2 := public.pf_vor_add_work_type(pa, 'Окраска стен', m2);
  -- №1: работа 12 с материалами A (13, норма 1), B (14, норма 2); работа 15 с двумя A (16, 17, норма 1)
  imp1 := public.pf_vor_create_import(pa, 'вор-1.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp1, '[{"row_no": 12, "kind": "work", "name": "Штукатурка стен", "unit_text": "м2", "qty": 100},
    {"row_no": 13, "kind": "material", "name": "Смесь А", "unit_text": "кг", "qty": 100, "norm": 1, "parent_row_no": 12},
    {"row_no": 14, "kind": "material", "name": "Сетка Б", "unit_text": "кг", "qty": 200, "norm": 2, "parent_row_no": 12},
    {"row_no": 15, "kind": "work", "name": "Окраска стен", "unit_text": "м2", "qty": 50},
    {"row_no": 16, "kind": "material", "name": "Краска", "unit_text": "л", "qty": 50, "norm": 1, "parent_row_no": 15},
    {"row_no": 17, "kind": "material", "name": "Краска", "unit_text": "л", "qty": 50, "norm": 1, "parent_row_no": 15}]');
  perform public.pf_vor_resolve_rows(imp1, jsonb_build_array(
    jsonb_build_object('row_no', 12, 'location_id', f5, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 15, 'location_id', kv, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp1);
  pos_1 := pg_temp.pos(imp1, 12); pos_2 := pg_temp.pos(imp1, 15);
  perform pg_temp.as_user(ufor);
  perform public.pf_fact_add_batch(pa, b1, today, jsonb_build_array(jsonb_build_object('position_id', pos_1, 'qty', 10), jsonb_build_object('position_id', pos_2, 'qty', 10)));
  perform pg_temp.as_user(upto);
  est1 := public.pf_estimate_create(pa, 'Смета №1', array[imp1]);
  kp1 := (public.pf_kp_create(est1, repeat('a', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', imp1, 'row_no', 12, 'kind', 'work', 'price_labor', 300, 'price_material', null),
    jsonb_build_object('import_id', imp1, 'row_no', 13, 'kind', 'material', 'price_labor', null, 'price_material', 10),
    jsonb_build_object('import_id', imp1, 'row_no', 14, 'kind', 'material', 'price_labor', null, 'price_material', 10),
    jsonb_build_object('import_id', imp1, 'row_no', 15, 'kind', 'work', 'price_labor', 100, 'price_material', null),
    jsonb_build_object('import_id', imp1, 'row_no', 16, 'kind', 'material', 'price_labor', null, 'price_material', 10),
    jsonb_build_object('import_id', imp1, 'row_no', 17, 'kind', 'material', 'price_labor', null, 'price_material', 10))), 1000) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(pa, kp1);
  a1 := public.pf_ks2_act_create(pa, '1', today, today - 1, today);
  perform public.pf_ks2_save(a1, '{"customer": "АО Заказчик", "contract_no": "Д-1", "contract_date": "2026-03-01"}', '[]');
  perform public.pf_ks2_issue(a1);
  -- №2: работа 21 — материалы [C (22, норма 3), A (23, норма 1)]; работа 25 — один A «Краска» (26, норма 2)
  imp2 := public.pf_vor_create_revision(imp1, 'вор-2.xlsx', repeat('b', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp2, '[{"row_no": 21, "kind": "work", "name": "Штукатурка стен", "unit_text": "м2", "qty": 100},
    {"row_no": 22, "kind": "material", "name": "Сетка С", "unit_text": "кг", "qty": 300, "norm": 3, "parent_row_no": 21},
    {"row_no": 23, "kind": "material", "name": "Смесь А", "unit_text": "кг", "qty": 100, "norm": 1, "parent_row_no": 21},
    {"row_no": 25, "kind": "work", "name": "Окраска стен", "unit_text": "м2", "qty": 50},
    {"row_no": 26, "kind": "material", "name": "Краска", "unit_text": "л", "qty": 100, "norm": 2, "parent_row_no": 25}]');
  perform public.pf_vor_resolve_rows(imp2, jsonb_build_array(
    jsonb_build_object('row_no', 21, 'location_id', f5, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 25, 'location_id', kv, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_accept_revision(imp2, jsonb_build_array(jsonb_build_object('row_no', 21, 'position_id', pos_1), jsonb_build_object('row_no', 25, 'position_id', pos_2)));
  est2 := public.pf_estimate_create(pa, 'Смета №2', array[imp2]);
  kp2 := (public.pf_kp_create(est2, repeat('b', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', imp2, 'row_no', 21, 'kind', 'work', 'price_labor', 300, 'price_material', null),
    jsonb_build_object('import_id', imp2, 'row_no', 22, 'kind', 'material', 'price_labor', null, 'price_material', 10),
    jsonb_build_object('import_id', imp2, 'row_no', 23, 'kind', 'material', 'price_labor', null, 'price_material', 10),
    jsonb_build_object('import_id', imp2, 'row_no', 25, 'kind', 'work', 'price_labor', 100, 'price_material', null),
    jsonb_build_object('import_id', imp2, 'row_no', 26, 'kind', 'material', 'price_labor', null, 'price_material', 10))), 1100) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(pa, kp2);
  reset role;
  res := res || pg_temp.t(pg_temp.k(pa, kp2, 23) = 'всего 10.000, выставлено 10.000, к выставлению 0.000', '[A, B] → [C, A]: A (23) — только своё: ' || pg_temp.k(pa, kp2, 23));
  res := res || pg_temp.t(pg_temp.k(pa, kp2, 22) = 'всего 30.000, выставлено 20.000, к выставлению 10.000', '[A, B] → [C, A]: B → C (22), норма выросла — к выставлению разница: ' || pg_temp.k(pa, kp2, 22));
  res := res || pg_temp.t(pg_temp.k(pa, kp2, 26) = 'всего 20.000, выставлено 20.000, к выставлению 0.000', '[A, A] → [A]: оба выставленных — в один (26): ' || pg_temp.k(pa, kp2, 26));
  res := res || pg_temp.t((select count(*) from planfact.ks2_rows(pa, today, kp2) where kind = 'work' and sys_qty > 0) = 0, 'работы по КП №2 — к выставлению 0');

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
