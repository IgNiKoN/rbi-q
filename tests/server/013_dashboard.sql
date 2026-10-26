-- P2-0010: тесты дашборда руководителя — формулы ТЗ §9 (P_план(T), отставание п.п. и дни D), каждая ветка светофора ТЗ 8.2 с порогами
-- объекта, вердикт темпа ±10 %, недели (Σ недель = сделано), «Требует внимания» и полнота, проваливание по местам (Σ мест = проект),
-- ₽ = null без planfact.money.view, права (прораб, заказчик, чужая компания, без роли, anon, thresholds.edit), журнал порогов.
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 013_up.sql.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then 'OK ' || l else 'FAIL ' || l end || E'\n' $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); upm uuid := gen_random_uuid();
  umgmt uuid := gen_random_uuid(); ucust uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid(); unone uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid; pb uuid; b1 uuid; b2 uuid; s1 uuid; f1 uuid; lb uuid; m2 uuid; sht uuid; wt uuid; wt3 uuid; wt4 uuid; imp uuid; impb uuid;
  est uuid; kp1 uuid; kpb uuid; pos12 uuid; pos14 uuid; pos16 uuid; posb uuid; br uuid; j jsonb; n int; t text; res text := '';
  r record; a1 uuid; rev int; x numeric; y numeric; t0 timestamptz; ms int; k int; pp uuid[]; td date := (now() at time zone 'Europe/Moscow')::date;
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,upm,umgmt,ucust,ubadm,unone]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor),(ca,upm),(ca,umgmt),(ca,ucust),(ca,unone),(cb,ubadm);
  insert into core.role_assignments(company_id,user_id,role_id,project_id)
  select ca, u, (select id from core.company_roles where company_id = ca and template_code = c), null
  from (values (uadm,'company_admin'),(upto,'pto'),(ufor,'foreman'),(upm,'project_manager'),(umgmt,'management'),(ucust,'customer')) v(u, c);
  insert into core.role_assignments(company_id,user_id,role_id,project_id)
  values (cb, ubadm, (select id from core.company_roles where company_id = cb and template_code = 'company_admin'), null);
  select id into m2 from core.units where company_id is null and code = 'м²';
  select id into sht from core.units where company_id is null and code = 'шт.';

  -- 1. Подготовка. Места: Корпус 1 → Секция 1 → Этаж 1; Корпус 2 (пустой).
  -- ВОР: 12 штукатурка 100 м² (Этаж 1) → 13 смесь 200 кг (норма 2); 14 двери 100 шт (Корпус 1); 16 грунтовка 50 м² (Секция 1, без цены).
  -- КП: 12 — 100; 13 — 5; 14 — 50 + 50. План ₽ = 10 000 + 1 000 + 10 000 = 21 000.
  reset role; perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Дашборд');
  pb := public.pf_create_project(ca, 'ЖК Готово');
  b1 := public.pf_add_location(pa, null, 'building', 'Корпус 1');
  b2 := public.pf_add_location(pa, null, 'building', 'Корпус 2');
  s1 := public.pf_add_location(pa, b1, 'section', 'Секция 1');
  f1 := public.pf_add_location(pa, s1, 'floor', 'Этаж 1');
  lb := public.pf_add_location(pb, null, 'building', 'Корпус Б');
  reset role; perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка стен', m2);
  wt3 := public.pf_vor_add_work_type(pa, 'Установка дверей', sht);
  wt4 := public.pf_vor_add_work_type(pa, 'Грунтовка', m2);
  imp := public.pf_vor_create_import(pa, 'вор.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, '[{"row_no": 12, "kind": "work", "number": "1.1", "name": "Штукатурка стен", "unit_text": "м2", "qty": 100},
    {"row_no": 13, "kind": "material", "number": "1.1.1", "name": "Смесь", "unit_text": "кг", "qty": 200, "norm": 2, "parent_row_no": 12},
    {"row_no": 14, "kind": "work", "number": "1.2", "name": "Установка дверей", "unit_text": "шт", "qty": 100},
    {"row_no": 16, "kind": "work", "number": "1.3", "name": "Грунтовка", "unit_text": "м2", "qty": 50}]');
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(
    jsonb_build_object('row_no', 12, 'location_id', f1, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 14, 'location_id', b1, 'work_type_id', wt3, 'unit_id', sht, 'match', 'green'),
    jsonb_build_object('row_no', 16, 'location_id', s1, 'work_type_id', wt4, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp);
  select id into pos12 from planfact.vor_positions where project_id = pa and work_type_id = wt;
  select id into pos14 from planfact.vor_positions where project_id = pa and work_type_id = wt3;
  select id into pos16 from planfact.vor_positions where project_id = pa and work_type_id = wt4;
  est := public.pf_estimate_create(pa, 'Смета', array[imp]);
  kp1 := (public.pf_kp_create(est, repeat('a', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', imp, 'row_no', 12, 'kind', 'work', 'price_labor', 100, 'price_material', null),
    jsonb_build_object('import_id', imp, 'row_no', 13, 'kind', 'material', 'price_labor', null, 'price_material', 5),
    jsonb_build_object('import_id', imp, 'row_no', 14, 'kind', 'work', 'price_labor', 50, 'price_material', 50),
    jsonb_build_object('import_id', imp, 'row_no', 16, 'kind', 'work', 'price_labor', null, 'price_material', null))), 21000) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(pa, kp1);
  -- ЖК Готово: 10 м² × 10 ₽, всё сделано 10 дней назад
  wt := public.pf_vor_add_work_type(pb, 'Покраска', m2);
  impb := public.pf_vor_create_import(pb, 'вор-б.xlsx', repeat('b', 64), 'Лист 1');
  perform public.pf_vor_add_rows(impb, '[{"row_no": 1, "kind": "work", "number": "1", "name": "Покраска", "unit_text": "м2", "qty": 10}]');
  perform public.pf_vor_resolve_rows(impb, jsonb_build_array(jsonb_build_object('row_no', 1, 'location_id', lb, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(impb);
  select id into posb from planfact.vor_positions where project_id = pb;
  est := public.pf_estimate_create(pb, 'Смета', array[impb]);
  kpb := (public.pf_kp_create(est, repeat('b', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', impb, 'row_no', 1, 'kind', 'work', 'price_labor', 10, 'price_material', null))), 100) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(pb, kpb);
  br := public.pf_brigade_save(ca, null, 'Иванов');
  -- Факт: штукатурка 10 (−10 дн.) = 1 000 + смесь 20 кг × 5 = 100 → 1 100; двери 11 (−3 дн.) = 1 100 → темп ровный.
  reset role; perform pg_temp.as_user(ufor);
  perform public.pf_fact_add(pos12, br, td - 10, 10);
  perform public.pf_fact_add(pos14, br, td - 3, 11);
  perform public.pf_fact_add(posb, br, td - 10, 10);
  perform public.pf_fact_add(pos16, br, td - 2, 60);   -- больше плана → на подтверждении

  -- 2. Миграция: пороги объекта, план на дату (ТЗ §9)
  reset role;
  select light_yellow_pp, light_red_pp, light_overdue_days into r from core.projects where id = pa;
  res := res || pg_temp.t(r.light_yellow_pp = 3 and r.light_red_pp = 10 and r.light_overdue_days = 3, 'пороги по умолчанию 3 / 10 п.п., 3 дня');
  t := pg_temp.err(format('update core.projects set light_yellow_pp = 20, light_red_pp = 10 where id = %L', pa));
  res := res || pg_temp.t(t like '23514%', 'ограничение БД: жёлтый < красного (' || t || ')');
  res := res || pg_temp.t(planfact.plan_pct(td, td + 100, td + 25) = 25, 'P_план: 25 дней из 100 = 25 %');
  res := res || pg_temp.t(planfact.plan_pct(td, td + 100, td - 5) = 0 and planfact.plan_pct(td, td + 100, td + 130) = 100,
                          'P_план: до начала 0 %, после окончания 100 %');
  res := res || pg_temp.t(planfact.plan_pct(td, td, td - 1) = 0 and planfact.plan_pct(td, td, td) = 100 and planfact.plan_pct(null, td, td) is null,
                          'P_план: нулевая длительность 0 / 100 %, без дат — null');

  -- 3. Светофор ТЗ 8.2 (ПТО видит ₽). Сделано 2 200 из 21 000 = 10,476 %.
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.light = 'grey' and r.light_reason = 'no_dates' and r.plan_pct_today is null and r.lag_days is null,
                          'без дат: серый no_dates, плана на сегодня и отставания нет (' || r.light_reason || ')');
  res := res || pg_temp.t(r.done_money = 2200 and r.pace_verdict = 'steady', 'сделано 2 200; темп 7 дн. = 14 дн. → steady (' || r.pace_verdict || ')');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_dates(pa, td - 10, td + 90);
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.plan_pct_today = 10 and r.lag_pp = -0.5 and r.lag_days = -0.5 and r.light = 'green' and r.light_reason = 'on_track',
                          'опережение: план 10 %, отставание −0,5 п.п. / −0,5 дн. → зелёный (' || r.lag_pp || '/' || r.lag_days || '/' || r.light || ')');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_dates(pa, td - 11, td + 89);     -- план 11 %, отставание 0,52 п.п. = 0,5 дн.
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.lag_pp = 0.5 and r.lag_days = 0.5 and r.light = 'green', 'отставание 0,5 п.п. и 0,5 дн. (< 3) → зелёный (' || r.light || ')');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_dates(pa, td - 112, td + 888);   -- 1 000 дней: план 11,2 %, отставание 0,72 п.п. = 7,2 дн.
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.lag_pp = 0.7 and r.lag_days = 7.2 and r.light = 'yellow' and r.light_reason = 'lag_days',
                          'длинный объект: 0,7 п.п., но 7,2 дн. ≥ 3 → жёлтый lag_days (' || r.lag_days || '/' || r.light_reason || ')');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_thresholds(pa, 3, 10, 8);
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.light = 'green' and r.light_overdue_days = 8, 'порог дней 8 → 7,2 дн. зелёный (' || r.light || ')');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_thresholds(pa, 3, 10, 3);
  perform public.pf_project_set_dates(pa, td - 20, td + 80);     -- план 20 %, отставание 9,52 п.п.
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.lag_pp = 9.5 and r.lag_days = 9.5 and r.light = 'yellow' and r.light_reason = 'lag_yellow',
                          'отставание 9,5 п.п. (3…10) → жёлтый lag_yellow (' || r.lag_pp || '/' || r.light_reason || ')');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_dates(pa, td - 30, td + 70);     -- план 30 %, отставание 19,52 п.п. = 19,5 дн.
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.plan_pct_today = 30 and r.lag_pp = 19.5 and r.lag_days = 19.5 and r.light = 'red' and r.light_reason = 'lag_red',
                          'отставание 19,5 п.п. (> 10) = D 19,5 дн. → красный lag_red (' || r.lag_days || '/' || r.light_reason || ')');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_thresholds(pa, 5, 25, 30);
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.light = 'yellow' and r.light_reason = 'lag_yellow', 'красный порог 25 → тот же объект жёлтый (' || r.light || ')');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_thresholds(pa, 3, 10, 3);
  perform public.pf_project_set_dates(pa, td - 1, td + 4);       -- план 20 %, до финиша 4 дня
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  n := (select count(*) from generate_series(1, 4) g where extract(isodow from td + g) < 6);
  res := res || pg_temp.t(r.light = 'yellow' and r.light_reason = 'finish_near' and r.work_days_left = n,
                          'до финиша ≤ 5 раб. дней при отставании > 3 п.п. → жёлтый finish_near, раб. дней ' || n || ' (' || r.light_reason || '/' || r.work_days_left || ')');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_dates(pa, td - 200, td - 1);     -- срок прошёл, план 100 %
  perform public.pf_project_set_thresholds(pa, 90, 100, 3);
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.light = 'red' and r.light_reason = 'overdue' and r.plan_pct_today = 100, 'срок прошёл, сделано < 100 % → красный overdue (' || r.light_reason || ')');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_thresholds(pa, 3, 10, 3);
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.light = 'red' and r.light_reason = 'lag_red', 'тот же объект при порогах 3/10 → lag_red (' || r.light_reason || ')');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_dates(pb, td - 30, td + 30);
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pb;
  res := res || pg_temp.t(r.light = 'green' and r.light_reason = 'done' and r.pace_verdict = 'slower',
                          'всё сделано → зелёный done; за 7 дн. ничего → slower (' || r.light_reason || '/' || r.pace_verdict || ')');

  -- 4. Вердикт: ещё 5 дверей вчера → темп 7 дн. 1 600/7 = 228,6 > 14 дн. 2 700/14 × 1,1 = 212,1 → faster
  reset role; perform pg_temp.as_user(ufor);
  perform public.pf_fact_add(pos14, br, td - 1, 5);
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_dates(pa, td - 30, td + 70);
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.pace_verdict = 'faster' and r.done_money = 2700, 'темп вырос > 10 % → faster, сделано 2 700 (' || r.pace_verdict || ')');
  -- сделано 12,857 %, план 30 % → 17,1 п.п. = 17,1 дн.
  res := res || pg_temp.t(r.lag_pp = 17.1 and r.lag_days = 17.1 and r.can_thresholds = false, 'D = (30 − 12,86) / 100 × 100 = 17,1 дн.; ПТО пороги не меняет');

  -- 5. Пороги: права, проверки, архив, журнал
  reset role; perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select public.pf_project_set_thresholds(%L, 3, 10, 3)', pa));
  res := res || pg_temp.t(t like '42501%', 'прораб не меняет пороги (' || t || ')');
  reset role; perform pg_temp.as_user(upto);
  t := pg_temp.err(format('select public.pf_project_set_thresholds(%L, 3, 10, 3)', pa));
  res := res || pg_temp.t(t like '42501%', 'ПТО (без thresholds.edit) не меняет пороги (' || t || ')');
  reset role; perform pg_temp.as_user(ucust);
  t := pg_temp.err(format('select public.pf_project_set_thresholds(%L, 3, 10, 3)', pa));
  res := res || pg_temp.t(t like '42501%', 'заказчик не меняет пороги');
  reset role; perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select public.pf_project_set_thresholds(%L, 3, 10, 3)', pa));
  res := res || pg_temp.t(t like '42501%', 'чужая компания не меняет пороги');
  reset role; perform pg_temp.as_user(upm);
  t := pg_temp.err(format('select public.pf_project_set_thresholds(%L, 10, 10, 3)', pa));
  res := res || pg_temp.t(t like '22023%', 'жёлтый = красный — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_project_set_thresholds(%L, 3, 101, 3)', pa));
  res := res || pg_temp.t(t like '22023%', 'красный > 100 — отказ');
  t := pg_temp.err(format('select public.pf_project_set_thresholds(%L, 3, 10, 61)', pa));
  res := res || pg_temp.t(t like '22023%', 'дни > 60 — отказ');
  t := pg_temp.err(format('update core.projects set light_red_pp = 50 where id = %L', pa));
  res := res || pg_temp.t(t like '42501%' or (select light_red_pp from core.projects where id = pa) = 10, 'прямая правка порогов закрыта (' || t || ')');
  reset role; perform pg_temp.as_user(umgmt);
  perform public.pf_project_set_thresholds(pa, 4, 12, 5);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.light_yellow_pp = 4 and r.light_red_pp = 12 and r.light_overdue_days = 5 and r.can_thresholds,
                          'руководство меняет пороги, видит их и право');
  reset role;
  select count(*) into n from core.audit_log a where a.project_id = pa and a.table_name = 'projects' and a.new_data ? 'light_red_pp';
  res := res || pg_temp.t(n >= 6, 'смена порогов в журнале (' || n || ')');
  perform pg_temp.as_user(upm);
  perform public.pf_project_set_thresholds(pa, 3, 10, 3);
  perform public.pf_update_project(pb, 'ЖК Готово', null, true);
  t := pg_temp.err(format('select public.pf_project_set_thresholds(%L, 3, 10, 3)', pb));
  res := res || pg_temp.t(t like '22023%архиве%', 'архивный проект — отказ (' || t || ')');
  perform public.pf_update_project(pb, 'ЖК Готово', null, false);

  -- 6. КС-2: выдан акт (−2 дн.): всё сделанное (штукатурка 1 000 + смесь 100), двери — 10 шт из 16 = 1 000 → итог 2 100 ₽
  reset role; perform pg_temp.as_user(upto);
  a1 := public.pf_ks2_act_create(pa, '1', td - 2, td - 30, td - 2);
  rev := public.pf_ks2_save(a1, '{}', jsonb_build_array(jsonb_build_object('source_row_id',
           (select s.id from planfact.vor_source_rows s where s.import_id = imp and s.row_no = 14), 'qty', 10, 'price', 100)));
  perform public.pf_ks2_issue(a1);

  -- 7. Недели (3): [−20…−14] 0; [−13…−7] 1 100 (штукатурка); [−6…0] 1 600 (двери); выставлено 2 100 в последнюю неделю
  select count(*), sum(w.done_money), max(w.done_money_cum) filter (where w.week_end = td) into n, x, y from public.pf_summary_weekly(pa, 3) w;
  res := res || pg_temp.t(n = 3 and x = 2700 and y = 2700, 'недели: 3, Σ сделано за недели = нарастающий итог = сводка 2 700 (' || n || '/' || x || '/' || y || ')');
  select * into r from public.pf_summary_weekly(pa, 3) w order by w.week_end desc limit 1;
  res := res || pg_temp.t(r.week_end = td and r.week_start = td - 6 and r.done_money = 1600 and r.issued_money = 2100 and r.issued_money_cum = 2100,
                          'последняя неделя: сделано 1 600, выставлено 2 100 (' || r.done_money || '/' || r.issued_money || ')');
  res := res || pg_temp.t(r.plan_pct = 30 and r.plan_money_cum = 6300, 'план на конец недели 30 % = 6 300 ₽ (' || r.plan_money_cum || ')');
  res := res || pg_temp.t(r.units = '[{"qty": 16, "unit": "шт."}]'::jsonb, 'объём недели по ЕИ: 16 шт. (' || r.units::text || ')');
  select * into r from public.pf_summary_weekly(pa, 3) w where w.week_end = td - 7;
  res := res || pg_temp.t(r.done_money = 1100 and r.plan_pct = 23 and r.units = '[{"qty": 10, "unit": "м²"}]'::jsonb,
                          'неделя −7: сделано 1 100, план 23 %, 10 м² (' || r.done_money || '/' || r.units::text || ')');
  select count(*) into n from public.pf_summary_weekly(pa, 500) w;
  res := res || pg_temp.t(n = 52, 'не больше 52 недель (' || n || ')');

  -- 8. «Требует внимания» (застой > 5 дн.): разрыв — только двери 6 шт = 600 ₽; без цены — 16; застой — грунтовка (30 дн.),
  -- штукатурка (10 дн.); на подтверждении 1; полнота: цены 3 из 4, места ниже корпуса 2 из 3
  j := public.pf_summary_attention(pa, 5);
  res := res || pg_temp.t((j #>> '{counts,gap_rows}')::int = 1 and (j #>> '{counts,gap_money}')::numeric = 600 and j #>> '{gap,0,number}' = '1.2'
                          and (j #>> '{gap,0,qty}')::numeric = 6 and (j #>> '{gap,0,money}')::numeric = 600, 'сделано не выставлено: 1 строка (1.2) — 6 шт = 600 ₽ (' || (j -> 'counts')::text || ')');
  res := res || pg_temp.t((j #>> '{counts,unpriced_rows}')::int = 1 and j #>> '{unpriced,0,number}' = '1.3', 'без цены: 1 строка (1.3)');
  res := res || pg_temp.t((j #>> '{counts,stale_positions}')::int = 2 and (j #>> '{stale,0,position_id}')::uuid = pos16 and (j #>> '{stale,0,idle_days}')::int = 30,
                          'застой > 5 дн.: 2, первая — грунтовка 30 дн. (' || (j -> 'stale')::text || ')');
  res := res || pg_temp.t((j #>> '{counts,pending_entries}')::int = 1 and not (j #>> '{counts,no_kp}')::boolean and not (j #>> '{counts,no_dates}')::boolean,
                          'на подтверждении 1; КП и даты есть');
  res := res || pg_temp.t((j #>> '{completeness,priced_pct}')::numeric = 75 and (j #>> '{completeness,dates_pct}')::int = 100
                          and (j #>> '{completeness,placed_pct}')::numeric = 66.7, 'полнота: цены 75 %, даты 100 %, места ниже корпуса 66,7 % (' || (j -> 'completeness')::text || ')');
  j := public.pf_summary_attention(pa);
  res := res || pg_temp.t((j #>> '{counts,stale_positions}')::int = 1 and (j #>> '{stale_days}')::int = 14, 'по умолчанию 14 дн.: застой 1');

  -- 9. Проваливание: Корпус 1 (всё) / Корпус 2 (пусто) → Секция 1 (+ двери на корпусе) → Этаж 1 (+ грунтовка на секции)
  select * into r from public.pf_summary_places(pa) p where p.location_id = b1;
  res := res || pg_temp.t(r.here_positions = 1, 'Корпус 1: на самом корпусе 1 позиция (двери) (' || r.here_positions || ')');
  res := res || pg_temp.t(r.positions = 3 and r.children = 1 and r.plan_money = 21000 and r.done_money = 2700 and r.pct_money = 12.9
                          and jsonb_array_length(r.units) = 2, 'Корпус 1: 3 позиции, 21 000 / 2 700 ₽, 12,9 %, две ЕИ (' || r.units::text || ')');
  select * into r from public.pf_summary_places(pa) p where p.location_id = b2;
  res := res || pg_temp.t(r.positions = 0 and r.plan_money = 0 and r.pct_money is null, 'Корпус 2: пусто');
  select * into r from public.pf_summary_places(pa, b1) p;
  res := res || pg_temp.t(r.location_id = s1 and r.positions = 2 and r.here_positions = 1 and r.plan_money = 11000 and r.done_money = 1100,
                          'Корпус 1 → Секция 1: 2 позиции, 11 000 / 1 100 ₽; на самой секции 1 (грунтовка) (' || r.plan_money || '/' || r.here_positions || ')');
  select * into r from public.pf_summary_places(pa, s1) p;
  res := res || pg_temp.t(r.location_id = f1 and r.positions = 1 and r.here_positions = 1 and r.done_money = 1100
                          and r.units = '[{"pct": 10.0, "fact": 10, "plan": 100, "unit": "м²"}]'::jsonb, 'Секция 1 → Этаж 1: 10 из 100 м², на этаже 1 позиция (' || r.units::text || ')');
  select count(*) into n from public.pf_summary_places(pa, f1);
  res := res || pg_temp.t(n = 0, 'у этажа детей нет');
  t := pg_temp.err(format('select * from public.pf_summary_places(%L, %L)', pa, lb));
  res := res || pg_temp.t(t like '22023%', 'место другого проекта — отказ (' || t || ')');
  reset role;
  select sum(plan_money), sum(done_money) into x, y from planfact.position_money(pa, kp1, td);
  res := res || pg_temp.t(x = 21000 and y = 2700, 'Σ денег по позициям = сводка проекта (21 000 / 2 700)');

  -- 10. Без money.view: ₽ и отставание (из него виден %) не приходят, объёмы и светофор — есть
  perform pg_temp.as_user(ufor);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.lag_pp is null and r.lag_days is null and r.pct_money is null and r.light = 'red' and r.plan_pct_today = 30
                          and r.pace_verdict = 'faster', 'прораб: отставание и % = null; светофор, план %, вердикт есть');
  select count(*) into n from public.pf_summary_weekly(pa, 3) w where w.done_money is not null or w.done_money_cum is not null
    or w.issued_money is not null or w.plan_money_cum is not null;
  res := res || pg_temp.t(n = 0, 'прораб: в неделях ₽ нет');
  select * into r from public.pf_summary_weekly(pa, 3) w order by w.week_end desc limit 1;
  res := res || pg_temp.t(r.units = '[{"qty": 16, "unit": "шт."}]'::jsonb, 'прораб видит объёмы недель');
  j := public.pf_summary_attention(pa, 5);
  res := res || pg_temp.t(j #> '{counts,gap_money}' = 'null'::jsonb and j #> '{gap,0,money}' = 'null'::jsonb and (j #>> '{counts,gap_rows}')::int = 1,
                          'прораб: «требует внимания» без ₽, счётчики есть');
  select count(*) into n from public.pf_summary_places(pa) p where p.plan_money is not null or p.done_money is not null or p.pct_money is not null;
  res := res || pg_temp.t(n = 0, 'прораб: в местах ₽ нет');
  reset role; perform pg_temp.as_user(ucust);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.project_id = pa and r.lag_days is null and r.plan_money is null and not r.can_thresholds, 'заказчик: дни и ₽ нет');
  j := public.pf_summary_attention(pa);
  res := res || pg_temp.t(j #> '{counts,gap_money}' = 'null'::jsonb, 'заказчик: ₽ разрыва нет');

  -- 11. Отказы: чужая компания, без роли, anon; служебные функции клиенту не выданы
  reset role; perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select * from public.pf_summary_weekly(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'чужая компания: недели — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_summary_attention(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'чужая компания: «требует внимания» — отказ');
  t := pg_temp.err(format('select * from public.pf_summary_places(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'чужая компания: места — отказ');
  reset role; perform pg_temp.as_user(unone);
  t := pg_temp.err(format('select * from public.pf_summary_places(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'без fact.view: места — отказ');
  reset role; perform pg_temp.as_user(upto);
  t := pg_temp.err(format('select * from planfact.position_money(%L, %L, current_date)', pa, kp1));
  res := res || pg_temp.t(t like '42501%', 'служебный расчёт денег позиций клиенту не выдан (' || t || ')');
  t := pg_temp.err('select planfact.plan_pct(current_date, current_date, current_date)');
  res := res || pg_temp.t(t like '42501%', 'служебная формула плана клиенту не выдана');
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  t := pg_temp.err(format('select * from public.pf_summary_weekly(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'anon: недели — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_summary_attention(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'anon: «требует внимания» — отказ');
  t := pg_temp.err(format('select * from public.pf_summary_places(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'anon: места — отказ');
  t := pg_temp.err(format('select public.pf_project_set_thresholds(%L, 3, 10, 3)', pa));
  res := res || pg_temp.t(t like '42501%', 'anon: пороги — отказ');
  reset role;

  -- 12. NFR-03: портфель 5 объектов × 2 000 позиций ≤ 2 с — без ANALYZE (урок ТД №72); недели, «внимание», места — по одному объекту
  for k in 1..5 loop
    perform pg_temp.as_user(uadm);
    pp[k] := public.pf_create_project(ca, 'ЖК Нагрузка ' || k);
    f1 := public.pf_add_location(pp[k], null, 'building', 'Корпус');
    perform public.pf_project_set_dates(pp[k], td - 60, td + 60);
    reset role; perform pg_temp.as_user(upto);
    wt := public.pf_vor_add_work_type(pp[k], 'Работа ' || k, m2);
    imp := public.pf_vor_create_import(pp[k], 'вор.xlsx', repeat('c', 64), 'Лист 1');
    perform public.pf_vor_add_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'kind', 'work', 'number', g::text, 'name', 'Работа ' || g,
      'unit_text', 'м2', 'qty', 100)) from generate_series(1, 1000) g));
    perform public.pf_vor_add_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'kind', 'work', 'number', g::text, 'name', 'Работа ' || g,
      'unit_text', 'м2', 'qty', 100)) from generate_series(1001, 2000) g));
    perform public.pf_vor_resolve_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'location_id', f1, 'work_type_id', wt, 'unit_id', m2,
      'match', 'green')) from generate_series(1, 1000) g));
    perform public.pf_vor_resolve_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'location_id', f1, 'work_type_id', wt, 'unit_id', m2,
      'match', 'green')) from generate_series(1001, 2000) g));
    perform public.pf_vor_confirm(imp);
    est := public.pf_estimate_create(pp[k], 'Смета', array[imp]);
    kp1 := (public.pf_kp_create(est, repeat('c', 64), jsonb_build_object('version', 1, 'rows', (select jsonb_agg(jsonb_build_object('import_id', imp,
      'row_no', g, 'kind', 'work', 'price_labor', 100)) from generate_series(1, 2000) g)), 20000000) ->> 'id')::uuid;
    perform public.pf_ks2_set_contract(pp[k], kp1);
    reset role; perform pg_temp.as_user(ufor);
    for n in 0..19 loop   -- факт по всем позициям за 20 дней, по 100 позиций в день
      perform public.pf_fact_add_batch(pp[k], br, td - n, (select jsonb_agg(jsonb_build_object('position_id', x.id, 'qty', 10)) from (
        select p.id, row_number() over (order by p.id) rn from planfact.vor_positions p where p.project_id = pp[k]) x where x.rn % 20 = n));
    end loop;
    reset role;
  end loop;
  perform pg_temp.as_user(umgmt);
  t0 := clock_timestamp();
  select count(*) into n from public.pf_summary_portfolio() p where p.project_id = any(pp) and p.lag_days is not null;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || pg_temp.t(n = 5 and ms <= 2000, 'портфель 5 × 2 000 позиций: ' || ms || ' мс (≤ 2 000)');
  t0 := clock_timestamp();
  select count(*) into n from public.pf_summary_weekly(pp[1], 12);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || pg_temp.t(n = 12 and ms <= 2000, 'недели (12) на 2 000 позиций: ' || ms || ' мс (≤ 2 000)');
  t0 := clock_timestamp();
  j := public.pf_summary_attention(pp[1]);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || pg_temp.t((j #>> '{completeness,positions_total}')::int = 2000 and ms <= 2000, '«требует внимания» на 2 000 позиций: ' || ms || ' мс (≤ 2 000)');
  t0 := clock_timestamp();
  select * into r from public.pf_summary_places(pp[1]) p;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || pg_temp.t(r.positions = 2000 and r.done_money = 2000000 and ms <= 2000, 'места на 2 000 позиций: ' || ms || ' мс (≤ 2 000)');
  reset role;

  select count(*) into n from regexp_matches(res, '(^|\n)FAIL', 'g');
  raise exception E'%\nFAIL всего: %', res, n;
end $$;
