-- P2-0006d доработка (046b): КС-2 после переноса уже выставленного факта (на позицию прежнего КП и на новую строку нового КП),
-- материалы один к одному (одноимённые, переименованный), выдача акта по новому КП, пачка факта.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 046b_vor_revisions_ks2_moves_up.sql.
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
  bld uuid; f5 uuid; kv uuid; m2 uuid; wt uuid; wt2 uuid; wt4 uuid; wt5 uuid; b1 uuid;
  imp1 uuid; imp2 uuid; pos_a uuid; pos_b uuid; pos_d uuid; pos_e uuid;
  est1 uuid; est2 uuid; kp1 uuid; kp2 uuid; a1 uuid; a2 uuid; j jsonb; t text; res text := '';
  today date := (now() at time zone 'Europe/Moscow')::date; items jsonb; rows1 jsonb;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, upto, ufor]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 046b', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, upto), (ca, ufor);
  select id into r_adm from core.company_roles where company_id = ca and template_code = 'company_admin';
  select id into r_pto from core.company_roles where company_id = ca and template_code = 'pto';
  select id into r_for from core.company_roles where company_id = ca and template_code = 'foreman';
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values (ca, uadm, r_adm, null), (ca, upto, r_pto, null), (ca, ufor, r_for, null);
  select id into m2 from core.units where company_id is null and code = 'м²';

  perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК 046b');
  bld := public.pf_add_location(pa, null, 'building', 'Корпус 1');
  f5 := public.pf_add_location(pa, bld, 'floor', '5 этаж');
  kv := public.pf_add_location(pa, f5, 'apartment', 'Кв. 1');
  b1 := public.pf_brigade_save(ca, null, 'Бригада 046b', null, null);
  perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка стен', m2);
  wt2 := public.pf_vor_add_work_type(pa, 'Окраска стен', m2);
  wt4 := public.pf_vor_add_work_type(pa, 'Грунтовка стен', m2);
  wt5 := public.pf_vor_add_work_type(pa, 'Стяжка пола', m2);

  -- №1: A — штукатурка 12 (+ смесь 13); B — окраска 14; D — грунтовка 15 (+ грунт 16); E — стяжка 17 (+ смесь М150 18)
  imp1 := public.pf_vor_create_import(pa, 'вор-1.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp1, '[{"row_no": 12, "kind": "work", "name": "Штукатурка стен", "unit_text": "м2", "qty": 100},
    {"row_no": 13, "kind": "material", "name": "Смесь «Альфа»", "unit_text": "кг", "qty": 900, "norm": 9, "parent_row_no": 12},
    {"row_no": 14, "kind": "work", "name": "Окраска стен", "unit_text": "м2", "qty": 20},
    {"row_no": 15, "kind": "work", "name": "Грунтовка стен", "unit_text": "м2", "qty": 50},
    {"row_no": 16, "kind": "material", "name": "Грунт", "unit_text": "кг", "qty": 100, "norm": 2, "parent_row_no": 15},
    {"row_no": 17, "kind": "work", "name": "Стяжка пола", "unit_text": "м2", "qty": 30},
    {"row_no": 18, "kind": "material", "name": "Смесь М150", "unit_text": "кг", "qty": 90, "norm": 3, "parent_row_no": 17}]');
  perform public.pf_vor_resolve_rows(imp1, jsonb_build_array(
    jsonb_build_object('row_no', 12, 'location_id', f5, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 14, 'location_id', kv, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 15, 'location_id', f5, 'work_type_id', wt4, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 17, 'location_id', kv, 'work_type_id', wt5, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp1);
  pos_a := pg_temp.pos(imp1, 12); pos_b := pg_temp.pos(imp1, 14); pos_d := pg_temp.pos(imp1, 15); pos_e := pg_temp.pos(imp1, 17);
  perform pg_temp.as_user(ufor);
  j := public.pf_fact_add_batch(pa, b1, today, jsonb_build_array(jsonb_build_object('position_id', pos_a, 'qty', 10),
         jsonb_build_object('position_id', pos_d, 'qty', 5), jsonb_build_object('position_id', pos_e, 'qty', 4)));
  res := res || pg_temp.t((j ->> 'accepted')::int = 3, 'пачка факта (блокировка по порядку): 3 принято (' || j::text || ')');

  -- КП №1 договорное, акт выдан: A 10 (+90 кг), D 5 (+10 кг), E 4 (+12 кг)
  perform pg_temp.as_user(upto);
  est1 := public.pf_estimate_create(pa, 'Смета №1', array[imp1]);
  kp1 := (public.pf_kp_create(est1, repeat('a', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', imp1, 'row_no', 12, 'kind', 'work', 'price_labor', 300, 'price_material', null),
    jsonb_build_object('import_id', imp1, 'row_no', 13, 'kind', 'material', 'price_labor', null, 'price_material', 12),
    jsonb_build_object('import_id', imp1, 'row_no', 14, 'kind', 'work', 'price_labor', 100, 'price_material', null),
    jsonb_build_object('import_id', imp1, 'row_no', 15, 'kind', 'work', 'price_labor', 80, 'price_material', null),
    jsonb_build_object('import_id', imp1, 'row_no', 16, 'kind', 'material', 'price_labor', null, 'price_material', 5),
    jsonb_build_object('import_id', imp1, 'row_no', 17, 'kind', 'work', 'price_labor', 200, 'price_material', null),
    jsonb_build_object('import_id', imp1, 'row_no', 18, 'kind', 'material', 'price_labor', null, 'price_material', 7))), 1000) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(pa, kp1);
  a1 := public.pf_ks2_act_create(pa, '1', today, today - 1, today);
  perform public.pf_ks2_save(a1, '{"customer": "АО Заказчик", "contract_no": "Д-1", "contract_date": "2026-03-01"}', '[]');
  perform public.pf_ks2_issue(a1);
  reset role;
  res := res || pg_temp.t(pg_temp.k(pa, kp1, 12) = 'всего 10.000, выставлено 10.000, к выставлению 0.000', 'КП №1, A (12): ' || pg_temp.k(pa, kp1, 12));

  -- №2: A снята — факт переносится на B (позиция прежнего КП); D снята — факт на новую строку 24 (одноимённые материалы 25, 26);
  --     B (21) и E (27, материал переименован «Смесь М-150») — те же позиции
  perform pg_temp.as_user(upto);
  imp2 := public.pf_vor_create_revision(imp1, 'вор-2.xlsx', repeat('b', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp2, '[{"row_no": 21, "kind": "work", "name": "Окраска стен", "unit_text": "м2", "qty": 20},
    {"row_no": 24, "kind": "work", "name": "Грунтовка стен глубокая", "unit_text": "м2", "qty": 50},
    {"row_no": 25, "kind": "material", "name": "Грунт", "unit_text": "кг.", "qty": 100, "norm": 2, "parent_row_no": 24},
    {"row_no": 26, "kind": "material", "name": "Грунт", "unit_text": "кг", "qty": 50, "norm": 1, "parent_row_no": 24},
    {"row_no": 27, "kind": "work", "name": "Стяжка пола", "unit_text": "м2", "qty": 30},
    {"row_no": 28, "kind": "material", "name": "Смесь М-150", "unit_text": "кг", "qty": 90, "norm": 3, "parent_row_no": 27}]');
  perform public.pf_vor_resolve_rows(imp2, jsonb_build_array(
    jsonb_build_object('row_no', 21, 'location_id', kv, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 24, 'location_id', f5, 'work_type_id', wt4, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 27, 'location_id', kv, 'work_type_id', wt5, 'unit_id', m2, 'match', 'green')));
  j := public.pf_vor_accept_revision(imp2,
         jsonb_build_array(jsonb_build_object('row_no', 21, 'position_id', pos_b), jsonb_build_object('row_no', 24, 'position_id', null),
                           jsonb_build_object('row_no', 27, 'position_id', pos_e)),
         jsonb_build_array(jsonb_build_object('position_id', pos_a, 'action', 'move', 'to_position_id', pos_b),
                           jsonb_build_object('position_id', pos_d, 'action', 'move', 'to_row_no', 24)));
  res := res || pg_temp.t((j ->> 'fact_moved_entries')::int = 2, 'принято: перенесено 2 записи (' || j::text || ')');
  reset role;
  res := res || pg_temp.t(planfact.position_moved_to(pos_a) = pos_b and planfact.position_moved_to(pos_e) = pos_e, 'перенос A → B найден, E — на месте');

  -- 1. Прежний КП: перенесённые на B 10 уже выставлены по A — к выставлению 0 (было бы 10)
  res := res || pg_temp.t(pg_temp.k(pa, kp1, 14) = 'всего 10.000, выставлено 10.000, к выставлению 0.000', 'КП №1, B (14) после переноса с A: ' || pg_temp.k(pa, kp1, 14));
  res := res || pg_temp.t(pg_temp.k(pa, kp1, 12) = 'нет строки', 'КП №1, A (12): выставленное ушло за фактом — ' || pg_temp.k(pa, kp1, 12));
  res := res || pg_temp.t((select sum(issued_qty) from planfact.summary_rows(pa, today) where kind = 'work') = 19,
                          'сводка: выставлено по работам всего 19 (10 + 5 + 4), без потерь и удвоения');

  -- 2. Новый КП по №2: D перенесена на новую строку 24 — выставленное 5 там; грунт — один к одному (25, не 26); E — переименованный материал
  perform pg_temp.as_user(upto);
  est2 := public.pf_estimate_create(pa, 'Смета №2', array[imp2]);
  kp2 := (public.pf_kp_create(est2, repeat('b', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', imp2, 'row_no', 21, 'kind', 'work', 'price_labor', 100, 'price_material', null),
    jsonb_build_object('import_id', imp2, 'row_no', 24, 'kind', 'work', 'price_labor', 80, 'price_material', null),
    jsonb_build_object('import_id', imp2, 'row_no', 25, 'kind', 'material', 'price_labor', null, 'price_material', 5),
    jsonb_build_object('import_id', imp2, 'row_no', 26, 'kind', 'material', 'price_labor', null, 'price_material', 5),
    jsonb_build_object('import_id', imp2, 'row_no', 27, 'kind', 'work', 'price_labor', 200, 'price_material', null),
    jsonb_build_object('import_id', imp2, 'row_no', 28, 'kind', 'material', 'price_labor', null, 'price_material', 7))), 1100) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(pa, kp2);
  reset role;
  res := res || pg_temp.t(pg_temp.k(pa, kp2, 21) = 'всего 10.000, выставлено 10.000, к выставлению 0.000', 'КП №2, B (21): ' || pg_temp.k(pa, kp2, 21));
  res := res || pg_temp.t(pg_temp.k(pa, kp2, 24) = 'всего 5.000, выставлено 5.000, к выставлению 0.000', 'КП №2, новая 24 (перенос с D): ' || pg_temp.k(pa, kp2, 24));
  res := res || pg_temp.t(pg_temp.k(pa, kp2, 25) = 'всего 10.000, выставлено 10.000, к выставлению 0.000', 'КП №2, грунт 25 («кг.» = «кг»): ' || pg_temp.k(pa, kp2, 25));
  res := res || pg_temp.t(pg_temp.k(pa, kp2, 26) = 'всего 5.000, выставлено 0.000, к выставлению 5.000', 'КП №2, второй грунт 26 — не удвоен: ' || pg_temp.k(pa, kp2, 26));
  res := res || pg_temp.t(pg_temp.k(pa, kp2, 27) = 'всего 4.000, выставлено 4.000, к выставлению 0.000', 'КП №2, E (27): ' || pg_temp.k(pa, kp2, 27));
  res := res || pg_temp.t(pg_temp.k(pa, kp2, 28) = 'всего 12.000, выставлено 12.000, к выставлению 0.000', 'КП №2, переименованный материал 28: ' || pg_temp.k(pa, kp2, 28));

  -- 3. Акт по новому КП: предложено только новое (второй грунт), выдаётся; прежний акт по КП №1 его видит
  perform pg_temp.as_user(upto);
  a2 := public.pf_ks2_act_create(pa, '2', today, today - 1, today);
  perform public.pf_ks2_save(a2, '{}', '[]');
  rows1 := (public.pf_ks2_act(a2) -> 'last_revision' -> 'snapshot' -> 'rows');
  res := res || pg_temp.t((select coalesce(sum((r ->> 'qty')::numeric), 0) from jsonb_array_elements(rows1) r) = 5, 'акт 2 по КП №2: к выставлению только 5 (второй грунт)');
  t := pg_temp.err(format('select public.pf_ks2_issue(%L)', a2));
  res := res || pg_temp.t(t = 'OK', 'акт 2 выдан (' || t || ')');
  reset role;
  res := res || pg_temp.t(pg_temp.k(pa, kp2, 26) = 'всего 5.000, выставлено 5.000, к выставлению 0.000', 'после акта 2: второй грунт выставлен — ' || pg_temp.k(pa, kp2, 26));
  res := res || pg_temp.t((select count(*) from planfact.ks2_rows(pa, today, kp2) where sys_qty > 0) = 0, 'по КП №2 больше нечего выставлять');
  -- сводка по местам: «позиций здесь» и «позиций» — по одному правилу
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t((select bool_and(here_positions <= positions) from public.pf_summary_places(pa, f5)) is not false, 'сводка по местам: «позиций здесь» ≤ «позиций»');

  reset role;
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
