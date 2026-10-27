-- P2-0006d (046a): доработки редакций ВОР по ревью 046 — КС-2 после смены договорного КП (без повторного выставления),
-- перенос факта (сверх плана — отказ, автор сохраняется, «на подтверждении» не становится исправлением, получатель из
-- другой ВОР), повторное решение, база сравнения только с правом ВОР, чужой проект в переносе.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 046a_vor_revisions_fixes_up.sql.
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
create or replace function pg_temp.src(imp uuid, rn int) returns uuid language sql as $f$
  select id from planfact.vor_source_rows where import_id = imp and row_no = rn $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); pa uuid; pa2 uuid; r_adm uuid; r_pto uuid; r_for uuid;
  bld uuid; f5 uuid; kv uuid; bld2 uuid; m2 uuid; kg uuid; wt uuid; wt2 uuid; wt3 uuid; wt4 uuid; b1 uuid;
  imp1 uuid; imp2 uuid; imp3 uuid; impx uuid; impo uuid; pos_a uuid; pos_b uuid; pos_e uuid; pos_x uuid; pos_o uuid;
  est1 uuid; est2 uuid; kp1 uuid; kp2 uuid; a1 uuid; e_b1 uuid; e_b2 uuid; j jsonb; r record; t text; res text := ''; v numeric;
  today date := (now() at time zone 'Europe/Moscow')::date; items jsonb;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, upto, ufor]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 046a', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, upto), (ca, ufor);
  select id into r_adm from core.company_roles where company_id = ca and template_code = 'company_admin';
  select id into r_pto from core.company_roles where company_id = ca and template_code = 'pto';
  select id into r_for from core.company_roles where company_id = ca and template_code = 'foreman';
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values (ca, uadm, r_adm, null), (ca, upto, r_pto, null), (ca, ufor, r_for, null);
  select id into m2 from core.units where company_id is null and code = 'м²';
  select id into kg from core.units where company_id is null and code = 'кг';

  perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК 046a');
  pa2 := public.pf_create_project(ca, 'ЖК 046a-2');
  bld := public.pf_add_location(pa, null, 'building', 'Корпус 1');
  f5 := public.pf_add_location(pa, bld, 'floor', '5 этаж');
  kv := public.pf_add_location(pa, f5, 'apartment', 'Кв. 1');
  bld2 := public.pf_add_location(pa2, null, 'building', 'Корпус 9');
  b1 := public.pf_brigade_save(ca, null, 'Бригада 046a', null, null);
  perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка стен', m2);
  wt2 := public.pf_vor_add_work_type(pa, 'Окраска стен', m2);
  wt3 := public.pf_vor_add_work_type(pa, 'Грунтовка стен', m2);
  wt4 := public.pf_vor_add_work_type(pa, 'Стяжка пола', m2);

  -- №1: работа 12 (100 м²) с материалом 13 (900 кг, норма 9), работа 14 (20 м²)
  imp1 := public.pf_vor_create_import(pa, 'вор-1.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp1, '[{"row_no": 12, "kind": "work", "number": "1.1", "name": "Штукатурка стен", "unit_text": "м2", "qty": 100},
    {"row_no": 13, "kind": "material", "number": "1.1.1", "name": "Смесь «Альфа»", "unit_text": "кг", "qty": 900, "norm": 9, "parent_row_no": 12},
    {"row_no": 14, "kind": "work", "number": "1.2", "name": "Окраска стен", "unit_text": "м2", "qty": 20}]');
  perform public.pf_vor_resolve_rows(imp1, jsonb_build_array(
    jsonb_build_object('row_no', 12, 'location_id', f5, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 14, 'location_id', kv, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp1);
  pos_a := pg_temp.pos(imp1, 12); pos_b := pg_temp.pos(imp1, 14);
  perform pg_temp.as_user(ufor);
  perform public.pf_fact_add(pos_a, b1, today, 10);

  -- 1. КС-2 по КП на №1: акт выдан на 10 м² и 90 кг
  perform pg_temp.as_user(upto);
  est1 := public.pf_estimate_create(pa, 'Смета №1', array[imp1]);
  kp1 := (public.pf_kp_create(est1, repeat('a', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', imp1, 'row_no', 12, 'kind', 'work', 'price_labor', 300, 'price_material', null),
    jsonb_build_object('import_id', imp1, 'row_no', 13, 'kind', 'material', 'price_labor', null, 'price_material', 12.5),
    jsonb_build_object('import_id', imp1, 'row_no', 14, 'kind', 'work', 'price_labor', 100, 'price_material', 50))), 1000) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(pa, kp1);
  a1 := public.pf_ks2_act_create(pa, '1', today, today - 1, today);
  perform public.pf_ks2_save(a1, '{"customer": "АО Заказчик", "contract_no": "Д-1", "contract_date": "2026-03-01"}', '[]');
  perform public.pf_ks2_issue(a1);
  reset role;
  res := res || pg_temp.t((select prev_qty from planfact.ks2_rows(pa, today, kp1) where row_no = 12) = 10, 'КП №1: выставлено по работе 12 — 10');

  -- №2: вставка строки в начало; работа и материал те же (новые номера 21 / 22), окраска 23; новая грунтовка 20
  perform pg_temp.as_user(upto);
  imp2 := public.pf_vor_create_revision(imp1, 'вор-2.xlsx', repeat('b', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp2, '[{"row_no": 20, "kind": "work", "number": "1.0", "name": "Грунтовка стен", "unit_text": "м2", "qty": 50},
    {"row_no": 21, "kind": "work", "number": "1.1", "name": "Штукатурка стен", "unit_text": "м2", "qty": 100},
    {"row_no": 22, "kind": "material", "number": "1.1.1", "name": "Смесь  «альфа»", "unit_text": "кг", "qty": 900, "norm": 9, "parent_row_no": 21},
    {"row_no": 23, "kind": "work", "number": "1.2", "name": "Окраска стен", "unit_text": "м2", "qty": 20}]');
  perform public.pf_vor_resolve_rows(imp2, jsonb_build_array(
    jsonb_build_object('row_no', 20, 'location_id', f5, 'work_type_id', wt3, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 21, 'location_id', f5, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 23, 'location_id', kv, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_accept_revision(imp2, jsonb_build_array(jsonb_build_object('row_no', 20, 'position_id', null),
    jsonb_build_object('row_no', 21, 'position_id', pos_a), jsonb_build_object('row_no', 23, 'position_id', pos_b)));
  pos_e := pg_temp.pos(imp2, 20);
  perform pg_temp.as_user(ufor);
  perform public.pf_fact_add(pos_e, b1, today, 5);

  -- 2. Договорным стало КП по смете на №2: уже выставленное не предлагается снова, факт новой позиции — в КС-2
  perform pg_temp.as_user(upto);
  est2 := public.pf_estimate_create(pa, 'Смета №2', array[imp2]);
  kp2 := (public.pf_kp_create(est2, repeat('b', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', imp2, 'row_no', 20, 'kind', 'work', 'price_labor', 80, 'price_material', null),
    jsonb_build_object('import_id', imp2, 'row_no', 21, 'kind', 'work', 'price_labor', 300, 'price_material', null),
    jsonb_build_object('import_id', imp2, 'row_no', 22, 'kind', 'material', 'price_labor', null, 'price_material', 12.5),
    jsonb_build_object('import_id', imp2, 'row_no', 23, 'kind', 'work', 'price_labor', 100, 'price_material', 50))), 1200) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(pa, kp2);
  reset role;
  select * into r from planfact.ks2_rows(pa, today, kp2) where row_no = 21;
  res := res || pg_temp.t(r.total_qty = 10 and r.prev_qty = 10 and r.sys_qty = 0,
                          'КП №2, работа 21: всего 10, выставлено 10 (по строке 12 №1), к выставлению 0 (' || coalesce(r::text, 'нет строки') || ')');
  select * into r from planfact.ks2_rows(pa, today, kp2) where row_no = 22;
  res := res || pg_temp.t(r.prev_qty = 90 and r.sys_qty = 0, 'КП №2, материал 22: выставлено 90 (по строке 13), к выставлению 0 (' || coalesce(r::text, 'нет строки') || ')');
  select * into r from planfact.ks2_rows(pa, today, kp2) where row_no = 20;
  res := res || pg_temp.t(r.total_qty = 5 and r.prev_qty = 0 and r.sys_qty = 5, 'КП №2, новая работа 20: факт 5 — к выставлению 5 (' || coalesce(r::text, 'нет строки') || ')');
  res := res || pg_temp.t((select sum(issued_qty) from planfact.summary_rows(pa, today) where row_no in (21, 22)) = 100,
                          'сводка «сделано ↔ выставлено» по КП №2: выставлено 10 + 90');

  -- 3. Перенос факта: окраска (pos_b) снимается в №3; на ней принято 15 и 10 на подтверждении (перебор, не исправление)
  perform pg_temp.as_user(ufor);
  e_b1 := (public.pf_fact_add(pos_b, b1, today, 15) ->> 'id')::uuid;
  j := public.pf_fact_add(pos_b, b1, today, 10);
  e_b2 := (j ->> 'id')::uuid;
  res := res || pg_temp.t(j ->> 'status' = 'pending_approval', 'перебор на окраске — на подтверждение (' || j::text || ')');
  -- отдельная ВОР того же проекта: позиция-получатель другой цепочки (стяжка 30 м²)
  perform pg_temp.as_user(upto);
  impx := public.pf_vor_create_import(pa, 'вор-отдельная.xlsx', repeat('c', 64), 'Лист 1');
  perform public.pf_vor_add_rows(impx, '[{"row_no": 5, "kind": "work", "name": "Стяжка пола", "unit_text": "м2", "qty": 30}]');
  perform public.pf_vor_resolve_rows(impx, jsonb_build_array(jsonb_build_object('row_no', 5, 'location_id', kv, 'work_type_id', wt4, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(impx);
  pos_x := pg_temp.pos(impx, 5);
  -- чужой проект: позиция pa2
  impo := public.pf_vor_create_import(pa2, 'чужой.xlsx', repeat('d', 64), 'Лист 1');
  perform public.pf_vor_add_rows(impo, '[{"row_no": 1, "kind": "work", "name": "Окраска стен", "unit_text": "м2", "qty": 500}]');
  perform public.pf_vor_resolve_rows(impo, jsonb_build_array(jsonb_build_object('row_no', 1, 'location_id', bld2, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green')));
  t := pg_temp.err(format('select public.pf_vor_confirm(%L)', impo));
  pos_o := pg_temp.pos(impo, 1);

  imp3 := public.pf_vor_create_revision(imp2, 'вор-3.xlsx', repeat('e', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp3, '[{"row_no": 30, "kind": "work", "name": "Грунтовка стен", "unit_text": "м2", "qty": 50},
    {"row_no": 31, "kind": "work", "name": "Штукатурка стен", "unit_text": "м2", "qty": 100},
    {"row_no": 34, "kind": "work", "name": "Окраска стен новая", "unit_text": "м2", "qty": 12}]');
  perform public.pf_vor_resolve_rows(imp3, jsonb_build_array(
    jsonb_build_object('row_no', 30, 'location_id', f5, 'work_type_id', wt3, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 31, 'location_id', f5, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 34, 'location_id', kv, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green')));
  items := jsonb_build_array(jsonb_build_object('row_no', 30, 'position_id', pos_e), jsonb_build_object('row_no', 31, 'position_id', pos_a),
                             jsonb_build_object('row_no', 34, 'position_id', null));
  perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select * from public.pf_vor_revision_base(%L)', imp3));
  res := res || pg_temp.t(t like '42501%', 'прораб: базу сравнения (объёмы факта) не видит (' || t || ')');
  perform pg_temp.as_user(upto);
  t := pg_temp.err(format('select public.pf_vor_accept_revision(%L, %L, %L)', imp3, items,
         jsonb_build_array(jsonb_build_object('position_id', pos_b, 'action', 'keep'), jsonb_build_object('position_id', pos_b, 'action', 'move', 'to_row_no', 34))));
  res := res || pg_temp.t(t like '22023%дважды%', 'два решения по одной позиции — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_vor_accept_revision(%L, %L, %L)', imp3, items,
         jsonb_build_array(jsonb_build_object('position_id', pos_b, 'action', 'move', 'to_row_no', 34))));
  res := res || pg_temp.t(t like '22023%больше остатка плана%', 'перенос 15 на новую строку с планом 12 — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_vor_accept_revision(%L, %L, %L)', imp3, items,
         jsonb_build_array(jsonb_build_object('position_id', pos_b, 'action', 'move', 'to_position_id', pos_o))));
  res := res || pg_temp.t(pos_o is not null and t like '22023%Перенос факта%', 'перенос на позицию чужого проекта — отказ (' || t || ')');
  j := public.pf_vor_accept_revision(imp3, items, jsonb_build_array(jsonb_build_object('position_id', pos_b, 'action', 'move', 'to_position_id', pos_x)));
  res := res || pg_temp.t((j ->> 'fact_moved_entries')::int = 2, 'перенос на позицию отдельной ВОР: 2 записи (' || j::text || ')');
  reset role;
  res := res || pg_temp.t((select bool_and(created_by = ufor) from planfact.fact_entries where position_id = pos_x) and
                          (select count(*) from planfact.fact_entries where position_id = pos_x) = 2, 'перенесённые записи — автор прораб');
  res := res || pg_temp.t((select corrects_id from planfact.fact_entries where position_id = pos_x and status = 'accepted') = e_b1,
                          'принятая копия заменяет перенесённую запись');
  res := res || pg_temp.t((select corrects_id is null from planfact.fact_entries where position_id = pos_x and status = 'pending_approval'),
                          'копия записи «на подтверждении» — не исправление');
  res := res || pg_temp.t((select plan_qty from planfact.fact_totals(pa) where position_id = pos_x) = 30
                          and (select fact_qty from planfact.fact_totals(pa) where position_id = pos_x) = 15, 'получатель: план 30, факт 15');
  res := res || pg_temp.t((select (new_data -> 'moved') ? e_b2::text from core.audit_log where table_name = 'vor_imports' and record_id = imp3 and action = 'ACCEPT_REVISION'),
                          'журнал принятия: какие записи куда перенесены');
  perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select public.pf_fact_correct(%L, 14, %L)',
         (select id from planfact.fact_entries where position_id = pos_x and status = 'accepted'), 'уточнение'));
  res := res || pg_temp.t(t = 'OK', 'прораб исправляет свою перенесённую запись (' || t || ')');
  reset role;

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
