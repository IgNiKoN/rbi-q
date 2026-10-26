-- P2-0007: тесты бригад и факта прораба — права, изоляция компаний, ввод и проверки полей, перебор плана (допуск 2 %) и
-- подтверждение РП, исправление с историей, пачка «закрыть этаж», неизменяемость записей, журнал.
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 009_up.sql (или вставить 009_up.sql перед этим файлом).
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
-- Выполнить запрос; вернуть 'OK' или 'sqlstate: сообщение' (ошибка откатывается в подтранзакции).
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then 'OK ' || l else 'FAIL ' || l end || E'\n' $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); ufor2 uuid := gen_random_uuid();
  upm uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid; pa2 uuid; pb uuid;
  r_adm uuid; r_pto uuid; r_for uuid; r_pm uuid; r_badm uuid;
  bld uuid; f5 uuid; f6 uuid; kv uuid; m2 uuid; wt uuid; wt2 uuid; wtb uuid; secb uuid;
  imp uuid; impb uuid; imp2 uuid; pos5 uuid; pos6 uuid; posk uuid; posb uuid; pos2 uuid;
  b1 uuid; b2 uuid; b3 uuid; bb uuid; j jsonb; e1 uuid; e2 uuid; e3 uuid; e4 uuid; n int; t text; res text := '';
  e15 uuid; e5 uuid; tot record; today date := (now() at time zone 'Europe/Moscow')::date; batch1 uuid; cnt_before int;
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,ufor2,upm,ubadm]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor),(ca,ufor2),(ca,upm),(cb,ubadm);
  select id into r_adm from core.company_roles where company_id=ca and template_code='company_admin';
  select id into r_pto from core.company_roles where company_id=ca and template_code='pto';
  select id into r_for from core.company_roles where company_id=ca and template_code='foreman';
  select id into r_pm  from core.company_roles where company_id=ca and template_code='project_manager';
  select id into r_badm from core.company_roles where company_id=cb and template_code='company_admin';
  insert into core.role_assignments(company_id,user_id,role_id,project_id) values
    (ca,uadm,r_adm,null),(ca,upto,r_pto,null),(ca,ufor,r_for,null),(ca,ufor2,r_for,null),(ca,upm,r_pm,null),(cb,ubadm,r_badm,null);
  select id into m2 from core.units where company_id is null and code = 'м²';

  -- 0. Каталог и шаблоны ролей
  select count(*) into n from core.permission_catalog where action in ('planfact.fact.approve', 'planfact.brigades.manage');
  res := res || pg_temp.t(n = 2, 'действия fact.approve и brigades.manage в каталоге');
  select string_agg(r.template_code, ',' order by r.template_code) into t from core.company_role_permissions rp
    join core.company_roles r on r.id = rp.role_id where r.company_id = ca and rp.action = 'planfact.fact.approve';
  res := res || pg_temp.t(t = 'company_admin,project_manager', 'fact.approve: только админ и РП (получено: ' || coalesce(t, '-') || ')');
  select string_agg(r.template_code, ',' order by r.template_code) into t from core.company_role_permissions rp
    join core.company_roles r on r.id = rp.role_id where r.company_id = ca and rp.action = 'planfact.brigades.manage';
  res := res || pg_temp.t(t = 'company_admin,project_manager,pto', 'brigades.manage: админ, РП, ПТО (получено: ' || coalesce(t, '-') || ')');

  select string_agg(r.template_code, ',' order by r.template_code) into t from core.company_role_permissions rp
    join core.company_roles r on r.id = rp.role_id where r.company_id = ca and rp.action = 'planfact.fact.view';
  res := res || pg_temp.t(t like 'company_admin%', 'fact.view есть и у администратора (получено: ' || coalesce(t, '-') || ')');

  -- 1. Подготовка: проект Альфы с местами и тремя позициями (план 100 / 20 / 50), проект Беты
  reset role; perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Факт');
  pa2 := public.pf_create_project(ca, 'ЖК Архив');
  select fact_tolerance_pct into tot from core.projects where id = pa;
  res := res || pg_temp.t((select fact_tolerance_pct from core.projects where id = pa) = 2, 'допуск перебора по умолчанию 2 %');
  bld := public.pf_add_location(pa, null, 'building', 'Корпус 1');
  f5 := public.pf_add_location(pa, bld, 'floor', '5 этаж');
  f6 := public.pf_add_location(pa, bld, 'floor', '6 этаж');
  kv := public.pf_add_location(pa, f5, 'apartment', 'Кв. 1');
  reset role; perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка стен', m2);
  wt2 := public.pf_vor_add_work_type(pa, 'Окраска стен', m2);
  imp := public.pf_vor_create_import(pa, 'вор.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, '[{"row_no": 12, "kind": "work", "name": "Штукатурка стен", "unit_text": "м2", "qty": 100},
    {"row_no": 13, "kind": "work", "name": "Окраска стен", "unit_text": "м2", "qty": 20},
    {"row_no": 14, "kind": "work", "name": "Штукатурка стен 6", "unit_text": "м2", "qty": 50}]');
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(
    jsonb_build_object('row_no', 12, 'location_id', f5, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 13, 'location_id', kv, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 14, 'location_id', f6, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp);
  select id into pos5 from planfact.vor_positions where project_id = pa and location_id = f5;
  select id into posk from planfact.vor_positions where project_id = pa and location_id = kv;
  select id into pos6 from planfact.vor_positions where project_id = pa and location_id = f6;
  -- архивный проект с позицией
  reset role; perform pg_temp.as_user(uadm);
  wt2 := wt2; secb := public.pf_add_location(pa2, null, 'section', 'Секция А');
  reset role; perform pg_temp.as_user(upto);
  imp2 := public.pf_vor_create_import(pa2, 'арх.xlsx', repeat('d', 64), 'Лист');
  perform public.pf_vor_add_rows(imp2, '[{"row_no": 12, "kind": "work", "name": "Штукатурка стен", "unit_text": "м2", "qty": 10}]');
  perform public.pf_vor_resolve_rows(imp2, jsonb_build_array(jsonb_build_object('row_no', 12, 'location_id', secb, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp2);
  select id into pos2 from planfact.vor_positions where project_id = pa2;
  reset role; perform pg_temp.as_user(ubadm);
  pb := public.pf_create_project(cb, 'ЖК Беты');
  secb := public.pf_add_location(pb, null, 'section', 'Секция Б');
  wtb := public.pf_vor_add_work_type(pb, 'Работа Беты', m2);
  impb := public.pf_vor_create_import(pb, 'бета.xlsx', repeat('b', 64), 'Лист');
  perform public.pf_vor_add_rows(impb, '[{"row_no": 12, "kind": "work", "name": "Работа Беты", "unit_text": "м2", "qty": 30}]');
  perform public.pf_vor_resolve_rows(impb, jsonb_build_array(jsonb_build_object('row_no', 12, 'location_id', secb, 'work_type_id', wtb, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(impb);
  select id into posb from planfact.vor_positions where project_id = pb;
  bb := public.pf_brigade_save(cb, null, 'Бригада Беты');
  reset role; perform pg_temp.as_user(uadm);
  perform public.pf_update_project(pa2, 'ЖК Архив', null, true);

  -- 2. Бригады
  reset role; perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select public.pf_brigade_save(%L, null, %L)', ca, 'Взлом'));
  res := res || pg_temp.t(t like '42501%', 'прораб не ведёт справочник бригад (' || t || ')');
  reset role; perform pg_temp.as_user(upto);
  b1 := public.pf_brigade_save(ca, null, 'Иванов', 'Иван Иванов', '+7 900 000-00-01');
  b2 := public.pf_brigade_save(ca, null, 'Петров');
  b3 := public.pf_brigade_save(ca, null, 'Сидоров');
  res := res || pg_temp.t(b1 is not null and b2 is not null, 'ПТО добавил бригады');
  t := pg_temp.err(format('select public.pf_brigade_save(%L, null, %L)', ca, '  иванов '));
  res := res || pg_temp.t(t like '23505%', 'повтор имени (без учёта регистра) — понятная ошибка (' || t || ')');
  perform public.pf_brigade_save(ca, b2, 'Петров-Строй', null, null);
  perform public.pf_brigade_archive(b3);
  reset role; perform pg_temp.as_user(ufor);
  select count(*) into n from public.pf_brigade_list(ca);
  res := res || pg_temp.t(n = 2, 'прораб видит 2 действующие бригады (переименованная есть, архивной нет), видит: ' || n);
  select count(*) into n from public.pf_brigade_list(ca, true);
  res := res || pg_temp.t(n = 3, 'с архивом — 3');
  reset role; perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select count(*) from public.pf_brigade_list(%L)', ca));
  res := res || pg_temp.t(t like '42501%', 'Бета: список бригад Альфы — отказ (' || t || ')');
  select count(*) into n from planfact.brigades;
  res := res || pg_temp.t(n = 1, 'Бета: по RLS видна только своя бригада, видит: ' || n);
  t := pg_temp.err(format('select public.pf_brigade_archive(%L)', b1));
  res := res || pg_temp.t(t like '42501%', 'Бета: архивация бригады Альфы — отказ');
  t := pg_temp.err(format('select public.pf_brigade_save(%L, %L, %L)', ca, b1, 'Взлом'));
  res := res || pg_temp.t(t like '42501%', 'Бета: переименование бригады Альфы — отказ');

  -- 3. Ввод факта: проверки полей и прав
  reset role; perform pg_temp.as_user(ufor);
  j := public.pf_fact_add(pos5, b1, today, 10, 3, 24, 'утро');
  e1 := (j ->> 'id')::uuid;
  res := res || pg_temp.t(j ->> 'status' = 'accepted', 'прораб: 10 из 100 — принято');
  select * into tot from public.pf_fact_position_totals(pa) where position_id = pos5;
  res := res || pg_temp.t(tot.fact_qty = 10 and tot.plan_qty = 100 and tot.pending_qty = 0, 'итог позиции: факт 10 из 100');
  j := public.pf_fact_add(pos5, b1, today, 15);
  e15 := (j ->> 'id')::uuid;
  select * into tot from public.pf_fact_position_totals(pa) where position_id = pos5;
  res := res || pg_temp.t(tot.fact_qty = 25, 'повторный ввод суммируется: 25');
  t := pg_temp.err(format('select public.pf_fact_add(%L, null, %L, 1)', pos5, today));
  res := res || pg_temp.t(t like '22023%', 'без бригады — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1)', pos5, b1, today + 1));
  res := res || pg_temp.t(t like '22023%', 'будущая дата — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 0)', pos5, b1, today));
  res := res || pg_temp.t(t like '22023%', 'объём 0 — отказ');
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, -5)', pos5, b1, today));
  res := res || pg_temp.t(t like '22023%' or t like '23514%', 'отрицательный объём — отказ');
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1)', pos5, b3, today));
  res := res || pg_temp.t(t like '22023%', 'бригада в архиве — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1)', pos5, bb, today));
  res := res || pg_temp.t(t like '22023%', 'бригада другой компании — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1)', posb, b1, today));
  res := res || pg_temp.t(t like '22023%' or t like '42501%', 'позиция чужой компании — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1)', pos2, b1, today));
  res := res || pg_temp.t(t like '22023%', 'архивный проект — отказ (' || t || ')');
  reset role; perform pg_temp.as_user(upm);
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1)', pos5, b1, today));
  res := res || pg_temp.t(t like '42501%', 'РП без fact.create не вносит факт (' || t || ')');
  reset role; perform pg_temp.as_user(upto);
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1)', pos5, b1, today));
  res := res || pg_temp.t(t like '42501%', 'ПТО без fact.create не вносит факт');
  select count(*) into n from public.pf_fact_positions(pa);
  res := res || pg_temp.t(n = 3, 'ПТО (fact.view) видит 3 позиции проекта, видит: ' || n);
  reset role; perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1)', pos5, bb, today));
  res := res || pg_temp.t(t like '42501%', 'Бета: ввод факта в позицию Альфы — отказ');

  -- 4. Перебор плана: допуск 2 % (план 100 → предел 102)
  reset role; perform pg_temp.as_user(ufor);
  j := public.pf_fact_add(pos5, b1, today, 78);
  e2 := (j ->> 'id')::uuid;
  res := res || pg_temp.t(j ->> 'status' = 'pending_approval', '25 + 78 = 103 > 102 — ждёт подтверждения');
  select * into tot from public.pf_fact_position_totals(pa) where position_id = pos5;
  res := res || pg_temp.t(tot.fact_qty = 25 and tot.pending_qty = 78 and tot.pending_count = 1, 'неподтверждённый перебор в итог не входит: факт 25, ждёт 78');
  j := public.pf_fact_add(pos6, b1, today, 51);
  res := res || pg_temp.t(j ->> 'status' = 'accepted', 'граница: 51 из 50 (ровно +2 %) — принято');
  j := public.pf_fact_add(pos6, b1, today, 0.001);
  res := res || pg_temp.t(j ->> 'status' = 'pending_approval', '51,001 из 50 — ждёт подтверждения');
  e3 := (j ->> 'id')::uuid;
  t := pg_temp.err(format('select public.pf_fact_decide(%L, true)', e2));
  res := res || pg_temp.t(t like '42501%', 'прораб не подтверждает перебор (' || t || ')');
  reset role; perform pg_temp.as_user(upto);
  t := pg_temp.err(format('select public.pf_fact_decide(%L, true)', e2));
  res := res || pg_temp.t(t like '42501%', 'ПТО не подтверждает перебор');
  t := pg_temp.err(format('select count(*) from public.pf_fact_pending(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'ПТО не видит очередь подтверждения');
  reset role; perform pg_temp.as_user(upm);
  select count(*) into n from public.pf_fact_pending(pa);
  res := res || pg_temp.t(n = 2, 'РП: в очереди 2 записи, видит: ' || n);
  t := pg_temp.err(format('select public.pf_fact_decide(%L, false)', e2));
  res := res || pg_temp.t(t like '22023%', 'отказ без причины не проходит');
  perform public.pf_fact_decide(e2, true, 'согласовано с заказчиком');
  select * into tot from public.pf_fact_position_totals(pa) where position_id = pos5;
  res := res || pg_temp.t(tot.fact_qty = 103 and tot.pending_qty = 0, 'после подтверждения факт 103 входит в итог');
  perform public.pf_fact_decide(e3, false, 'лишний объём');
  select * into tot from public.pf_fact_position_totals(pa) where position_id = pos6;
  res := res || pg_temp.t(tot.fact_qty = 51 and tot.pending_qty = 0, 'отклонённый перебор в итог не вошёл');
  t := pg_temp.err(format('select public.pf_fact_decide(%L, true)', e3));
  res := res || pg_temp.t(t like '22023%', 'повторное решение по закрытой записи — отказ');
  reset role; perform pg_temp.as_user(ufor);
  select last_rejected_note into t from public.pf_fact_positions(pa) where position_id = pos6;
  res := res || pg_temp.t(t = 'лишний объём', 'прораб видит причину отказа (' || coalesce(t, '-') || ')');

  reset role; perform pg_temp.as_user(uadm);
  select count(*) into n from public.pf_fact_pending(pa);
  res := res || pg_temp.t(n = 0, 'администратор видит пустую очередь без ошибок');
  reset role; perform pg_temp.as_user(ufor);
  j := public.pf_fact_add(pos6, b1, today, 5);
  reset role; perform pg_temp.as_user(uadm);
  perform public.pf_fact_decide((public.pf_fact_pending(pa)).id, true, 'админ подтвердил');
  res := res || pg_temp.t(not exists (select 1 from public.pf_fact_pending(pa)), 'администратор подтверждает перебор (право fact.approve + fact.view)');
  reset role; perform pg_temp.as_user(ufor);

  -- 5. Исправление с историей (итог позиции 103 при плане 100; предел 102)
  j := public.pf_fact_correct(e1, 8, 'ошиблись при замере');
  e4 := (j ->> 'id')::uuid;
  res := res || pg_temp.t(j ->> 'status' = 'accepted', 'исправление вниз подтверждения не требует');
  select * into tot from public.pf_fact_position_totals(pa) where position_id = pos5;
  res := res || pg_temp.t(tot.fact_qty = 101, '10 → 8: итог 103 - 10 + 8 = 101, получено: ' || tot.fact_qty);
  select count(*) into n from public.pf_fact_history(pos5) where status = 'superseded' and id = e1 and decision_note = 'ошиблись при замере';
  res := res || pg_temp.t(n = 1, 'в истории старая запись «заменена» с причиной');
  select count(*) into n from public.pf_fact_history(pos5) where id = e4 and corrects_id = e1 and status = 'accepted';
  res := res || pg_temp.t(n = 1, 'в истории новая запись ссылается на старую');
  t := pg_temp.err(format('select public.pf_fact_correct(%L, 5, %L)', e1, 'ещё раз'));
  res := res || pg_temp.t(t like '22023%', 'заменённую запись исправить нельзя (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_correct(%L, 5, %L)', e4, '   '));
  res := res || pg_temp.t(t like '22023%', 'без причины исправление не проходит');
  reset role; perform pg_temp.as_user(ufor2);
  t := pg_temp.err(format('select public.pf_fact_correct(%L, 5, %L)', e4, 'чужая'));
  res := res || pg_temp.t(t like '42501%', 'прораб не исправляет чужую запись (' || t || ')');
  reset role; perform pg_temp.as_user(upm);
  j := public.pf_fact_correct(e4, 9, 'уточнение РП');
  select * into tot from public.pf_fact_position_totals(pa) where position_id = pos5;
  res := res || pg_temp.t(tot.fact_qty = 102 and j ->> 'status' = 'accepted', 'РП (fact.approve) исправил чужую запись 8 → 9: итог 102 (ровно предел), получено: ' || tot.fact_qty);
  -- отмена принятой записи: новая запись не создаётся
  reset role; perform pg_temp.as_user(ufor);
  select count(*) into cnt_before from planfact.fact_entries where position_id = pos5;
  j := public.pf_fact_correct(e15, 0, 'внесено ошибочно');
  select count(*) into n from planfact.fact_entries where position_id = pos5;
  res := res || pg_temp.t(n = cnt_before and j ->> 'status' = 'superseded', 'отмена: новая запись не создана, старая заменена');
  select * into tot from public.pf_fact_position_totals(pa) where position_id = pos5;
  res := res || pg_temp.t(tot.fact_qty = 87, 'после отмены 15 итог 87, получено: ' || tot.fact_qty);
  -- исправление вверх с перебором ждёт РП; старая запись остаётся в итоге
  j := public.pf_fact_add(pos5, b1, today, 5);
  e5 := (j ->> 'id')::uuid;
  j := public.pf_fact_correct(e5, 300, 'уточнили объём');
  res := res || pg_temp.t(j ->> 'status' = 'pending_approval', 'исправление сверх допуска ждёт подтверждения');
  select * into tot from public.pf_fact_position_totals(pa) where position_id = pos5;
  res := res || pg_temp.t(tot.fact_qty = 92 and tot.pending_qty = 300, 'пока ждёт — старая запись в итоге (92), новая нет');
  t := pg_temp.err(format('select public.pf_fact_correct(%L, 6, %L)', e5, 'пока ждёт'));
  res := res || pg_temp.t(t like '22023%', 'запись с ждущим исправлением повторно исправить нельзя');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_fact_decide((j ->> 'id')::uuid, true, 'ок');
  select * into tot from public.pf_fact_position_totals(pa) where position_id = pos5;
  res := res || pg_temp.t(tot.fact_qty = 92 - 5 + 300 and tot.pending_qty = 0, 'после подтверждения старая заменена: итог 387, получено: ' || tot.fact_qty);

  -- 6. Пачка «закрыть этаж»
  reset role; perform pg_temp.as_user(ufor);
  select count(*) into n from public.pf_fact_positions(pa, f5);
  res := res || pg_temp.t(n = 2, 'работы этажа 5 вместе с квартирой: 2 позиции, видит: ' || n);
  select count(*) into n from public.pf_fact_positions(pa, kv);
  res := res || pg_temp.t(n = 1, 'работы квартиры: 1 позиция');
  select count(*) into cnt_before from planfact.fact_entries where project_id = pa;
  t := pg_temp.err(format('select public.pf_fact_add_batch(%L, %L, %L, %L::jsonb)', pa, b1, today,
        jsonb_build_array(jsonb_build_object('position_id', posk, 'qty', 5), jsonb_build_object('position_id', posk, 'qty', 6))::text));
  select count(*) into n from planfact.fact_entries where project_id = pa;
  res := res || pg_temp.t(t like '22023%' and n = cnt_before, 'пачка с повтором позиции — отказ, ничего не записано (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_add_batch(%L, %L, %L, %L::jsonb)', pa, b1, today,
        jsonb_build_array(jsonb_build_object('position_id', posk, 'qty', 5), jsonb_build_object('position_id', posb, 'qty', 6))::text));
  select count(*) into n from planfact.fact_entries where project_id = pa;
  res := res || pg_temp.t(t like '22023%' and n = cnt_before, 'пачка с чужой позицией — отказ целиком');
  t := pg_temp.err(format('select public.pf_fact_add_batch(%L, null, %L, %L::jsonb)', pa, today,
        jsonb_build_array(jsonb_build_object('position_id', posk, 'qty', 5))::text));
  res := res || pg_temp.t(t like '22023%', 'пачка без бригады — отказ');
  t := pg_temp.err(format('select public.pf_fact_add_batch(%L, %L, %L, %L::jsonb)', pa, b1, today,
        jsonb_build_array(jsonb_build_object('position_id', posk, 'qty', 0))::text));
  res := res || pg_temp.t(t like '22023%', 'строка пачки с объёмом 0 — отказ, не теряется молча');
  j := public.pf_fact_add_batch(pa, b2, today, jsonb_build_array(
    jsonb_build_object('position_id', posk, 'qty', 20), jsonb_build_object('position_id', pos6, 'qty', 5)), 4, 'закрываем');
  batch1 := (j ->> 'batch_id')::uuid;
  res := res || pg_temp.t((j ->> 'accepted')::int = 1 and (j ->> 'pending')::int = 1, 'пачка: квартира 20/20 принята, строка с перебором ждёт РП: ' || j::text);
  select count(distinct batch_id) into n from planfact.fact_entries where batch_id = batch1;
  select count(*) into cnt_before from planfact.fact_entries where batch_id = batch1;
  res := res || pg_temp.t(n = 1 and cnt_before = 2, 'обе записи пачки под одним batch_id');
  select * into tot from public.pf_fact_position_totals(pa) where position_id = posk;
  res := res || pg_temp.t(tot.fact_qty = 20 and tot.plan_qty = 20, 'квартира закрыта на 100 %');
  t := pg_temp.err(format('select public.pf_fact_add_batch(%L, %L, %L, %L::jsonb)', pa2, b1, today,
        jsonb_build_array(jsonb_build_object('position_id', pos2, 'qty', 1))::text));
  res := res || pg_temp.t(t like '22023%', 'пачка в архивный проект — отказ');

  -- 7. Неизменяемость и прямой доступ
  reset role; perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('update planfact.fact_entries set qty = 1 where id = %L', e4));
  res := res || pg_temp.t(t <> 'OK', 'прямой UPDATE клиентом — отказ');
  t := pg_temp.err(format('delete from planfact.fact_entries where id = %L', e4));
  res := res || pg_temp.t(t <> 'OK', 'прямой DELETE клиентом — отказ');
  t := pg_temp.err(format('insert into planfact.fact_entries(company_id, project_id, position_id, brigade_id, work_date, qty, status) values (%L,%L,%L,%L,%L,1,%L)', ca, pa, pos5, b1, today, 'accepted'));
  res := res || pg_temp.t(t <> 'OK', 'прямой INSERT клиентом — отказ');
  t := pg_temp.err(format('update planfact.brigades set name = %L', 'х'));
  res := res || pg_temp.t(t <> 'OK', 'прямой UPDATE бригад клиентом — отказ');
  reset role;
  t := pg_temp.err(format('update planfact.fact_entries set qty = 1 where id = %L', e4));
  res := res || pg_temp.t(t like '42501%', 'UPDATE владельцем в обход функций — сторож (' || t || ')');
  t := pg_temp.err(format('update planfact.fact_entries set status = %L where id = %L', 'accepted', e4));
  res := res || pg_temp.t(t like '42501%', 'смена статуса в обход функций — сторож');
  t := pg_temp.err(format('delete from planfact.fact_entries where id = %L', e4));
  res := res || pg_temp.t(t like '42501%', 'DELETE владельцем — сторож');
  t := pg_temp.err(format('insert into planfact.fact_entries(company_id, project_id, position_id, brigade_id, work_date, qty, status) values (%L,%L,%L,%L,%L,1,%L)', ca, pa, pos5, b1, today, 'accepted'));
  res := res || pg_temp.t(t like '42501%', 'INSERT владельцем в обход функций — сторож');

  -- 8. Изоляция компаний
  perform pg_temp.as_user(ubadm);
  select count(*) into n from planfact.fact_entries;
  res := res || pg_temp.t(n = 0, 'Бета: таблица факта Альфы по RLS пуста, видит: ' || n);
  t := pg_temp.err(format('select count(*) from public.pf_fact_positions(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'Бета: позиции Альфы — отказ');
  t := pg_temp.err(format('select count(*) from public.pf_fact_history(%L)', pos5));
  res := res || pg_temp.t(t like '42501%', 'Бета: история Альфы — отказ');
  t := pg_temp.err(format('select count(*) from public.pf_fact_pending(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'Бета: очередь Альфы — отказ');
  t := pg_temp.err(format('select public.pf_fact_decide(%L, true)', e3));
  res := res || pg_temp.t(t like '22023%' or t like '42501%', 'Бета: решение по записи Альфы — отказ');
  t := pg_temp.err(format('select public.pf_fact_correct(%L, 1, %L)', e4, 'взлом'));
  res := res || pg_temp.t(t like '22023%' or t like '42501%', 'Бета: исправление записи Альфы — отказ');
  t := pg_temp.err(format('select count(*) from public.pf_fact_position_totals(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'Бета: итоги Альфы — отказ');

  -- 9. Журнал компании
  reset role; perform pg_temp.as_user(uadm);
  select string_agg(distinct table_name || ':' || action, ',' order by table_name || ':' || action) into t
    from public.pf_list_company_audit(ca, 200) where table_name in ('brigades', 'fact_entries');
  res := res || pg_temp.t(t = 'brigades:ARCHIVE,brigades:INSERT,brigades:UPDATE,fact_entries:APPROVE,fact_entries:CANCEL,fact_entries:CORRECT,fact_entries:INSERT,fact_entries:REJECT',
    'журнал компании: бригады, факт, подтверждения (' || coalesce(t, '-') || ')');

  -- 10. anon
  reset role; perform set_config('request.jwt.claims','',true); perform set_config('request.jwt.claim.sub','',true); execute 'set local role anon';
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1)', pos5, b1, today));
  res := res || pg_temp.t(t <> 'OK', 'anon: ввод факта закрыт');
  t := pg_temp.err('select count(*) from planfact.fact_entries');
  res := res || pg_temp.t(t <> 'OK', 'anon: таблица факта закрыта');
  t := pg_temp.err(format('select count(*) from public.pf_brigade_list(%L)', ca));
  res := res || pg_temp.t(t <> 'OK', 'anon: бригады закрыты');
  reset role;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res,'FAIL','')))/4;
end $$;
