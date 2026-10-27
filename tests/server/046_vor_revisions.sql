-- P2-0006b (046): редакции ВОР — черновик к действующей, база сравнения, принятие одной функцией, перенос и «снята»,
-- план во всех расчётах — по действующей редакции, права и изоляция компаний.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 046_vor_revisions_up.sql.
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
create or replace function pg_temp.plan(p uuid) returns numeric language plpgsql as $f$
declare r text := current_user; v numeric;
begin reset role; select coalesce(sum(plan_qty), 0) into v from planfact.fact_totals(p); execute format('set local role %I', r); return v; end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); pa uuid; pb uuid;
  r_adm uuid; r_pto uuid; r_for uuid; r_badm uuid; bld uuid; f5 uuid; f6 uuid; kv uuid; m2 uuid; m3 uuid;
  wt uuid; wt2 uuid; wt3 uuid; wt4 uuid; b1 uuid;
  imp1 uuid; imp2 uuid; imp3 uuid; pos_a uuid; pos_b uuid; pos_c uuid; pos_d uuid; pos_e uuid;
  eA uuid; eC uuid; eD0 uuid; eD1 uuid; j jsonb; t text; n int; res text := ''; v numeric;
  today date := (now() at time zone 'Europe/Moscow')::date; items jsonb;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, upto, ufor, ubadm]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 046', true), (cb, 'Бета 046', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, upto), (ca, ufor), (cb, ubadm);
  select id into r_adm from core.company_roles where company_id = ca and template_code = 'company_admin';
  select id into r_pto from core.company_roles where company_id = ca and template_code = 'pto';
  select id into r_for from core.company_roles where company_id = ca and template_code = 'foreman';
  select id into r_badm from core.company_roles where company_id = cb and template_code = 'company_admin';
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, uadm, r_adm, null), (ca, upto, r_pto, null), (ca, ufor, r_for, null), (cb, ubadm, r_badm, null);
  select id into m2 from core.units where company_id is null and code = 'м²';
  select id into m3 from core.units where company_id is null and code = 'м³';

  -- 0. Проект, места, виды работ, бригада; редакция №1 из четырёх строк (A 100, B 20, C 50, D 30)
  perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Редакции');
  bld := public.pf_add_location(pa, null, 'building', 'Корпус 1');
  f5 := public.pf_add_location(pa, bld, 'floor', '5 этаж');
  f6 := public.pf_add_location(pa, bld, 'floor', '6 этаж');
  kv := public.pf_add_location(pa, f5, 'apartment', 'Кв. 1');
  b1 := public.pf_brigade_save(ca, null, 'Бригада 046', null, null);
  perform pg_temp.as_user(ubadm);
  pb := public.pf_create_project(cb, 'ЖК Бета');
  perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка стен', m2);
  wt2 := public.pf_vor_add_work_type(pa, 'Окраска стен', m2);
  wt3 := public.pf_vor_add_work_type(pa, 'Стяжка пола', m2);
  wt4 := public.pf_vor_add_work_type(pa, 'Грунтовка стен', m2);
  imp1 := public.pf_vor_create_import(pa, 'вор-1.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp1, '[{"row_no": 10, "kind": "work", "name": "Штукатурка стен", "unit_text": "м2", "qty": 100},
    {"row_no": 11, "kind": "work", "name": "Окраска стен", "unit_text": "м2", "qty": 20},
    {"row_no": 12, "kind": "work", "name": "Штукатурка стен", "unit_text": "м2", "qty": 50},
    {"row_no": 13, "kind": "work", "name": "Стяжка пола", "unit_text": "м2", "qty": 30}]');
  perform public.pf_vor_resolve_rows(imp1, jsonb_build_array(
    jsonb_build_object('row_no', 10, 'location_id', f5, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 11, 'location_id', kv, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 12, 'location_id', f6, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 13, 'location_id', f5, 'work_type_id', wt3, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp1);
  reset role;
  select p.id into pos_a from planfact.vor_positions p join planfact.vor_links l on l.position_id = p.id join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp1 and s.row_no = 10;
  select p.id into pos_b from planfact.vor_positions p join planfact.vor_links l on l.position_id = p.id join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp1 and s.row_no = 11;
  select p.id into pos_c from planfact.vor_positions p join planfact.vor_links l on l.position_id = p.id join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp1 and s.row_no = 12;
  select p.id into pos_d from planfact.vor_positions p join planfact.vor_links l on l.position_id = p.id join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp1 and s.row_no = 13;
  res := res || pg_temp.t((select current_import_id from planfact.vor_heads where root_import_id = imp1) = imp1
                          and (select revision_no from planfact.vor_imports where id = imp1) = 1, 'первая загрузка — редакция №1, действующая');

  -- факт: A 40, C 10, D 5 (+ исправление D до 40 — на подтверждении: перебор)
  perform pg_temp.as_user(ufor);
  eA := (public.pf_fact_add(pos_a, b1, today, 40) ->> 'id')::uuid;
  eC := (public.pf_fact_add(pos_c, b1, today, 10) ->> 'id')::uuid;
  eD0 := (public.pf_fact_add(pos_d, b1, today, 5) ->> 'id')::uuid;
  j := public.pf_fact_correct(eD0, 40, 'пересчёт');
  eD1 := (j ->> 'id')::uuid;
  res := res || pg_temp.t(j ->> 'status' = 'pending_approval', 'исправление D до 40 — на подтверждении (' || j::text || ')');
  reset role;
  res := res || pg_temp.t(pg_temp.plan(pa) = 200, 'план до новой редакции: 200');

  -- 1. Черновик новой редакции: права, один черновик, только к действующей
  perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select public.pf_vor_create_revision(%L, %L, %L, %L)', imp1, 'вор-2.xlsx', repeat('b', 64), 'Лист 1'));
  res := res || pg_temp.t(t like '42501%', 'прораб: новую редакцию не загружает (' || t || ')');
  perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select public.pf_vor_create_revision(%L, %L, %L, %L)', imp1, 'вор-2.xlsx', repeat('b', 64), 'Лист 1'));
  res := res || pg_temp.t(t like '22023%', 'чужая компания: загрузка не найдена (' || t || ')');
  perform pg_temp.as_user(upto);
  imp2 := public.pf_vor_create_revision(imp1, 'вор-2.xlsx', repeat('b', 64), 'Лист 1');
  res := res || pg_temp.t((select revision_no = 2 and previous_import_id = imp1 and root_import_id = imp1 and status = 'draft'
                           from planfact.vor_imports where id = imp2), 'черновик: редакция №2, предыдущая и первая — №1');
  t := pg_temp.err(format('select public.pf_vor_create_revision(%L, %L, %L, %L)', imp1, 'вор-2б.xlsx', repeat('c', 64), 'Лист 1'));
  res := res || pg_temp.t(t like '22023%Черновик%', 'второй черновик к той же редакции — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_vor_create_revision(%L, %L, %L, %L)', imp2, 'вор-3.xlsx', repeat('c', 64), 'Лист 1'));
  res := res || pg_temp.t(t like '22023%действующей%', 'к черновику (не действующей) — отказ (' || t || ')');

  -- №2: вставка строки в начало (нумерация сдвинулась): E новая 10; A без изменений; C уменьшена до 5 (ниже факта 10);
  --     B удалена (без факта), D удалена (с фактом) — факт переносим на новую E
  perform public.pf_vor_add_rows(imp2, '[{"row_no": 10, "kind": "work", "name": "Грунтовка стен", "unit_text": "м2", "qty": 10},
    {"row_no": 11, "kind": "work", "name": "Штукатурка стен", "unit_text": "м2", "qty": 100},
    {"row_no": 12, "kind": "work", "name": "Штукатурка стен", "unit_text": "м2", "qty": 5}]');
  perform public.pf_vor_resolve_rows(imp2, jsonb_build_array(
    jsonb_build_object('row_no', 10, 'location_id', f5, 'work_type_id', wt4, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 11, 'location_id', f5, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 12, 'location_id', f6, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  t := pg_temp.err(format('select public.pf_vor_confirm(%L)', imp2));
  res := res || pg_temp.t(t like '22023%новая редакция%', 'новая редакция обычным подтверждением — отказ (' || t || ')');

  -- 2. База сравнения
  select count(*), sum(fact_qty) into n, v from public.pf_vor_revision_base(imp2) x;
  res := res || pg_temp.t(n = 4 and v = 55, 'база сравнения: 4 строки №1, факт 55 (' || n || ', ' || v || ')');
  perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select * from public.pf_vor_revision_base(%L)', imp2));
  res := res || pg_temp.t(t like '22023%', 'чужая компания: базу сравнения не видит (' || t || ')');

  -- 3. Принятие: отказы
  items := jsonb_build_array(jsonb_build_object('row_no', 10, 'position_id', null),
                             jsonb_build_object('row_no', 11, 'position_id', pos_a), jsonb_build_object('row_no', 12, 'position_id', pos_c));
  t := pg_temp.err(format('select public.pf_vor_accept_revision(%L, %L)', imp2, items));
  res := res || pg_temp.t(t like '22023%', 'чужая компания: принять нельзя (' || t || ')');
  perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select public.pf_vor_accept_revision(%L, %L)', imp2, items));
  res := res || pg_temp.t(t like '42501%', 'прораб: принять нельзя (' || t || ')');
  perform pg_temp.as_user(upto);
  t := pg_temp.err(format('select public.pf_vor_accept_revision(%L, %L)', imp2, items));
  res := res || pg_temp.t(t like '22023%без решения: 1%', 'снимаемая D с фактом без решения — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_vor_accept_revision(%L, %L)', imp2, items - 0));
  res := res || pg_temp.t(t like '22023%ровно один раз%', 'не по всем строкам — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_vor_accept_revision(%L, %L)', imp2,
         jsonb_build_array(jsonb_build_object('row_no', 10, 'position_id', null), jsonb_build_object('row_no', 11, 'position_id', pos_a),
                           jsonb_build_object('row_no', 12, 'position_id', pos_a))));
  res := res || pg_temp.t(t like '22023%несколькими%', 'одна позиция на две строки — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_vor_accept_revision(%L, %L, %L)', imp2,
         jsonb_build_array(jsonb_build_object('row_no', 10, 'position_id', null), jsonb_build_object('row_no', 11, 'position_id', pos_c),
                           jsonb_build_object('row_no', 12, 'position_id', pos_a)),
         jsonb_build_array(jsonb_build_object('position_id', pos_d, 'action', 'keep'))));
  res := res || pg_temp.t(t like '22023%не совпадают%', 'позиция с другим местом — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_vor_accept_revision(%L, %L, %L)', imp2, items,
         jsonb_build_array(jsonb_build_object('position_id', pos_d, 'action', 'move', 'to_position_id', pos_b))));
  res := res || pg_temp.t(t like '22023%Перенос факта%', 'перенос на снимаемую позицию — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_vor_accept_revision(%L, %L, %L)', imp2, items,
         jsonb_build_array(jsonb_build_object('position_id', pos_d, 'action', 'keep'), jsonb_build_object('position_id', pos_b, 'action', 'keep'))));
  res := res || pg_temp.t(t like '22023%не снимается или без факта%', 'решение по позиции без факта — отказ (' || t || ')');

  -- 4. Принятие: D → перенос факта на новую строку 10 (E)
  j := public.pf_vor_accept_revision(imp2, items, jsonb_build_array(jsonb_build_object('position_id', pos_d, 'action', 'move', 'to_row_no', 10)));
  res := res || pg_temp.t((j ->> 'added')::int = 1 and (j ->> 'unchanged')::int = 1 and (j ->> 'qty_changed')::int = 1
                          and (j ->> 'withdrawn')::int = 2 and (j ->> 'fact_moved_entries')::int = 2, 'итог принятия: ' || j::text);
  reset role;
  select p.id into pos_e from planfact.vor_positions p where p.import_id = imp2;
  res := res || pg_temp.t((select current_import_id from planfact.vor_heads where root_import_id = imp1) = imp2, 'действующая — №2');
  res := res || pg_temp.t((select status from planfact.vor_imports where id = imp1) = 'confirmed'
                          and (select count(*) from planfact.vor_source_rows where import_id = imp1) = 4
                          and (select count(*) from planfact.vor_positions where import_id = imp1) = 4, '№1 не изменилась: 4 строки, 4 позиции');
  res := res || pg_temp.t((select status from planfact.fact_entries where id = eA) = 'accepted'
                          and (select position_id from planfact.fact_entries where id = eA) = pos_a, 'факт A — та же запись на той же позиции');
  res := res || pg_temp.t((select count(*) from planfact.vor_positions where id in (pos_a, pos_c)) = 2 and
                          (select count(*) from planfact.vor_links where position_id = pos_a) = 2, 'A: тот же id, связка и с №1, и с №2');
  select plan_qty, fact_qty into v, n from planfact.fact_totals(pa) where position_id = pos_c;
  res := res || pg_temp.t(v = 5 and n = 10, 'C: план 5 (было 50), факт 10 — «факт больше объёма»');
  res := res || pg_temp.t(not exists (select 1 from planfact.fact_totals(pa) where position_id in (pos_b, pos_d)),
                          'B (без факта) и D (факт перенесён) — сняты, в расчётах не видны');
  select plan_qty, fact_qty into v, n from planfact.fact_totals(pa) where position_id = pos_e;
  res := res || pg_temp.t(v = 10 and n = 5, 'E: план 10, принятый факт 5 перенесён с D');
  res := res || pg_temp.t((select count(*) from planfact.fact_entries where position_id = pos_d and status = 'superseded') = 2,
                          'записи D — «заменены», не удалены');
  res := res || pg_temp.t((select corrects_id from planfact.fact_entries where position_id = pos_e and status = 'pending_approval')
                          = (select id from planfact.fact_entries where position_id = pos_e and status = 'accepted'),
                          'исправление на подтверждении указывает на перенесённую копию');
  res := res || pg_temp.t(pg_temp.plan(pa) = 115, 'план после принятия: 115 = 10 + 100 + 5, без двойного счёта (' || pg_temp.plan(pa) || ')');
  res := res || pg_temp.t((select count(*) from planfact.vor_position_events where import_id = imp2) = 3, 'событий редакции: 3 (C объём, B и D сняты)');
  res := res || pg_temp.t((select qty from planfact.vor_positions where id = pos_c) = 50, 'позиция C не переписана (база 50, объём — событием)');

  perform pg_temp.as_user(uadm);
  j := (select to_jsonb(x) from public.pf_fact_pending(pa) x where x.position_id = pos_e);
  perform public.pf_fact_decide((j ->> 'id')::uuid, true);
  reset role;
  res := res || pg_temp.t((select fact_qty from planfact.fact_totals(pa) where position_id = pos_e) = 40,
                          'исправление подтверждено: факт E 40, не 45');
  -- допуск — от действующего объёма C (5): +1 к факту 10 → на подтверждение
  perform pg_temp.as_user(ufor);
  j := public.pf_fact_add(pos_c, b1, today, 1);
  res := res || pg_temp.t(j ->> 'status' = 'pending_approval', 'факт сверх нового объёма — на подтверждение (' || j::text || ')');

  -- 5. Повтор и списки
  perform pg_temp.as_user(upto);
  t := pg_temp.err(format('select public.pf_vor_accept_revision(%L, %L)', imp2, items));
  res := res || pg_temp.t(t like '42501%', 'повторное принятие — отказ (' || t || ')');
  res := res || pg_temp.t((select is_current and revision_no = 2 from public.pf_vor_list_imports(pa) where id = imp2)
                          and (select not is_current from public.pf_vor_list_imports(pa) where id = imp1), 'список: №2 действующая, №1 — нет');
  res := res || pg_temp.t((select count(*) from public.pf_vor_revision_changes(imp2)) = 3, 'изменения редакции №2: 3');
  res := res || pg_temp.t((select count(*) from public.pf_vor_positions(pa) where not withdrawn) = 3
                          and (select count(*) from public.pf_vor_positions(pa) where withdrawn) = 2
                          and (select source_row_no from public.pf_vor_positions(pa) where id = pos_a) = 11, 'позиции ВОР: 3 действующие, 2 сняты, A — строка 11 №2');
  t := pg_temp.err(format('select public.pf_estimate_create(%L, %L, %L)', pa, 'Смета по №1', array[imp1]));
  res := res || pg_temp.t(t like '22023%новая редакция%', 'смета по прежней редакции — отказ (' || t || ')');

  -- 6. №3: A снята, факт оставлен («оставить») → план 0, факт 40 виден с признаком «снята»; новый факт на A — отказ
  imp3 := public.pf_vor_create_revision(imp2, 'вор-3.xlsx', repeat('c', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp3, '[{"row_no": 1, "kind": "work", "name": "Грунтовка стен", "unit_text": "м2", "qty": 10},
    {"row_no": 2, "kind": "work", "name": "Штукатурка стен", "unit_text": "м2", "qty": 5}]');
  perform public.pf_vor_resolve_rows(imp3, jsonb_build_array(
    jsonb_build_object('row_no', 1, 'location_id', f5, 'work_type_id', wt4, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 2, 'location_id', f6, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  -- устаревшее сравнение: подменяем действующую на №1 — принять №3 нельзя
  reset role;
  update planfact.vor_heads set current_import_id = imp1 where root_import_id = imp1;
  perform pg_temp.as_user(upto);
  t := pg_temp.err(format('select public.pf_vor_accept_revision(%L, %L, %L)', imp3,
         jsonb_build_array(jsonb_build_object('row_no', 1, 'position_id', pos_e), jsonb_build_object('row_no', 2, 'position_id', pos_c)),
         jsonb_build_array(jsonb_build_object('position_id', pos_a, 'action', 'keep'))));
  res := res || pg_temp.t(t like '22023%уже сменилась%', 'принятие по устаревшему сравнению — отказ (' || t || ')');
  reset role;
  update planfact.vor_heads set current_import_id = imp2 where root_import_id = imp1;
  perform pg_temp.as_user(upto);
  j := public.pf_vor_accept_revision(imp3,
         jsonb_build_array(jsonb_build_object('row_no', 1, 'position_id', pos_e), jsonb_build_object('row_no', 2, 'position_id', pos_c)),
         jsonb_build_array(jsonb_build_object('position_id', pos_a, 'action', 'keep')));
  res := res || pg_temp.t((j ->> 'withdrawn')::int = 1 and (j ->> 'fact_kept')::int = 1, '№3: A снята, факт оставлен (' || j::text || ')');
  reset role;
  select plan_qty, fact_qty into v, n from planfact.fact_totals(pa) where position_id = pos_a;
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(v = 0 and n = 40, 'A: план 0, факт 40 не потерян');
  res := res || pg_temp.t((select withdrawn from public.pf_fact_positions(pa) where position_id = pos_a)
                          and (select withdrawn from public.pf_summary_positions(pa) where position_id = pos_a), 'A в факте и сводке — с признаком «снята»');
  perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1)', pos_a, b1, today));
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(t like '22023%снята%', 'новый факт на снятую — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_correct(%L, 30, %L)', eA, 'уточнение'));
  res := res || pg_temp.t(t = 'OK', 'исправление факта на снятой — можно (' || t || ')');
  res := res || pg_temp.t((select positions from public.pf_summary_portfolio() where project_id = pa) = 2, 'портфель: 2 действующие позиции');

  -- 7. Изоляция и неизменяемость таблиц
  perform pg_temp.as_user(ubadm);
  res := res || pg_temp.t((select count(*) from planfact.vor_heads where project_id = pa) = 0
                          and (select count(*) from planfact.vor_position_events where project_id = pa) = 0, 'чужая компания: редакции и события не видны');
  t := pg_temp.err(format('select * from public.pf_vor_list_imports(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'чужая компания: список загрузок — отказ (' || t || ')');
  perform pg_temp.as_user(upto);
  t := pg_temp.err(format('delete from planfact.vor_position_events where project_id = %L', pa));
  res := res || pg_temp.t(t like '42501%', 'события: удаление пользователем — отказ (' || t || ')');
  reset role;
  t := pg_temp.err(format('delete from planfact.vor_position_events where project_id = %L', pa));
  res := res || pg_temp.t(t like '42501%удалить нельзя%', 'события: удаление владельцем — отказ (' || t || ')');
  t := pg_temp.err(format('update planfact.vor_position_events set qty_after = 1 where project_id = %L', pa));
  res := res || pg_temp.t(t like '42501%', 'события: правка — отказ (' || t || ')');
  t := pg_temp.err(format('update planfact.vor_imports set file_name = %L where id = %L', 'x', imp1));
  res := res || pg_temp.t(t like '42501%', 'подтверждённая редакция по-прежнему неизменяема (' || t || ')');
  res := res || pg_temp.t(has_table_privilege('anon', 'planfact.vor_heads', 'select') = false
                          and has_table_privilege('authenticated', 'planfact.vor_positions_current', 'select') = false
                          and has_function_privilege('anon', 'public.pf_vor_accept_revision(uuid, jsonb, jsonb)', 'execute') = false,
                          'anon: ни таблиц, ни функций; представление — только серверным функциям');

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
