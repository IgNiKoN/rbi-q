-- P2-0022: тест 030_fact_period_forecast — запись факта «за период» и прогноз окончания по видам работ и позициям.
-- Период: запись с period_from, проверки (начало позже конца, > 31 дня, будущее), неизменяемость, исправление наследует период,
-- история и журнал отдают period_from; без периода и пачкой — как 009. Прогноз = формуле ТЗ §9 на ручных числах (есть темп /
-- нет темпа / выполнено / без дат объекта), Δ к финишу, % отклонения; разные ЕИ не суммируются; права и ₽ — как прежде.
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 030_fact_period_forecast_up.sql.
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
-- Единица вида работ из pf_summary_worktypes (jsonb, null — нет).
create or replace function pg_temp.wu(p uuid, wt uuid, u text) returns jsonb language sql as $f$
  select x from public.pf_summary_worktypes(p) w, jsonb_array_elements(w.units) x where w.work_type_id = wt and x ->> 'unit' = u $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); upm uuid := gen_random_uuid();
  ubpm uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); td date := (now() at time zone 'Europe/Moscow')::date;
  pa uuid; pn uuid; bld uuid; m2 uuid; m3 uuid; wt uuid; wt2 uuid; imp uuid; imp2 uuid; est uuid; kp uuid; br uuid;
  pos10 uuid; pos20 uuid; pos30 uuid; posn uuid; posx uuid; ep uuid; ec uuid; j jsonb; r record; t text; n int; res text := '';
  ppl numeric := round(100.0 * 30 / 90, 1);
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,upm,ubpm]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor),(ca,upm),(cb,ubpm);
  insert into core.role_assignments(company_id,user_id,role_id,project_id)
  select v.c, v.u, (select id from core.company_roles where company_id = v.c and template_code = v.code), null
  from (values (ca,uadm,'company_admin'),(ca,upto,'pto'),(ca,ufor,'foreman'),(ca,upm,'project_manager'),(cb,ubpm,'project_manager')) v(c, u, code);
  select id into m2 from core.units where company_id is null and code = 'м²';
  select id into m3 from core.units where company_id is null and code = 'м³';

  -- Объект А (старт 30 дней назад, финиш через 60 → план на сегодня 33,3 %): вид «Штукатурка» — строки 10, 20 по 100 м²
  -- и строка 30 — 100 м³ (другая ЕИ того же вида), цена 100 ₽, договорная КП.
  perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Прогноз');
  bld := public.pf_add_location(pa, null, 'building', 'Корпус 1');
  br := public.pf_brigade_save(ca, null, 'Иванов');
  pn := public.pf_create_project(ca, 'ЖК Без дат');
  reset role; perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка', m2);
  imp := public.pf_vor_create_import(pa, 'вор.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'kind', 'work', 'number', (g / 10)::text,
    'name', 'Строка ' || g, 'unit_text', 'м2', 'qty', 100)) from unnest(array[10, 20, 30]) g));
  perform public.pf_vor_resolve_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'location_id', bld, 'work_type_id', wt,
    'unit_id', case when g = 30 then m3 else m2 end, 'match', 'green')) from unnest(array[10, 20, 30]) g));
  perform public.pf_vor_confirm(imp);
  est := public.pf_estimate_create(pa, 'Смета', array[imp]);
  kp := (public.pf_kp_create(est, repeat('a', 64), jsonb_build_object('version', 1, 'rows', (select jsonb_agg(jsonb_build_object(
    'import_id', imp, 'row_no', g, 'kind', 'work', 'price_labor', 100)) from unnest(array[10, 20, 30]) g)), 30000) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(pa, kp);
  -- Объект без дат: «Кладка», 100 м²
  wt2 := public.pf_vor_add_work_type(pn, 'Кладка', m2);
  imp2 := public.pf_vor_create_import(pn, 'вор2.xlsx', repeat('b', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp2, '[{"row_no": 5, "kind": "work", "name": "Кладка", "unit_text": "м2", "qty": 100}]');
  reset role; perform pg_temp.as_user(uadm);
  bld := public.pf_add_location(pn, null, 'building', 'Корпус Н');
  reset role; perform pg_temp.as_user(upto);
  perform public.pf_vor_resolve_rows(imp2, jsonb_build_array(jsonb_build_object('row_no', 5, 'location_id', bld, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp2);
  reset role;
  update core.projects set planned_start = td - 30, planned_finish = td + 60 where id = pa;
  select l.position_id into pos10 from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp and s.row_no = 10;
  select l.position_id into pos20 from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp and s.row_no = 20;
  select l.position_id into pos30 from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp and s.row_no = 30;
  select id into posn from planfact.vor_positions where project_id = pn;

  -- 0. Доступ
  res := res || pg_temp.t(not has_function_privilege('anon', 'public.pf_fact_add(uuid,uuid,date,numeric,integer,numeric,text,date)', 'execute')
                          and has_function_privilege('authenticated', 'public.pf_fact_add(uuid,uuid,date,numeric,integer,numeric,text,date)', 'execute'),
                          'pf_fact_add: anon закрыта, authenticated — открыта');
  res := res || pg_temp.t(not has_function_privilege('authenticated', 'planfact.forecast(numeric,numeric,numeric,date,date)', 'execute')
                          and not has_function_privilege('authenticated', 'planfact.fact_insert(uuid,uuid,uuid,uuid,date,numeric,integer,numeric,text,uuid,uuid,text,date)', 'execute'),
                          'служебные forecast и fact_insert — не вызываются клиентом');
  res := res || pg_temp.t(to_regprocedure('public.pf_fact_add(uuid,uuid,date,numeric,integer,numeric,text)') is null
                          and to_regprocedure('planfact.fact_insert(uuid,uuid,uuid,uuid,date,numeric,integer,numeric,text,uuid,uuid,text)') is null,
                          'старые сигнатуры удалены (нет двух путей вставки)');
  res := res || pg_temp.t(not has_function_privilege('anon', 'public.pf_summary_positions(uuid,uuid)', 'execute')
                          and not has_function_privilege('anon', 'public.pf_summary_worktypes(uuid)', 'execute')
                          and not has_function_privilege('anon', 'public.pf_fact_history(uuid)', 'execute')
                          and not has_function_privilege('anon', 'public.pf_fact_journal(uuid,date,date,integer)', 'execute'),
                          'anon: сводка, история, журнал закрыты');

  -- 1. Формула на ручных числах (ТЗ §9: T + (V_план − V_факт) / (факт14 / 14))
  select * into r from planfact.forecast(100, 30, 14, td, td + 60);
  res := res || pg_temp.t(r.forecast_finish = td + 70 and r.delta_days = 10, 'формула: 100/30/14 → +70 дн., Δ +10');
  select * into r from planfact.forecast(100, 30, 7, td, td + 200);
  res := res || pg_temp.t(r.forecast_finish = td + 140 and r.delta_days = -60, 'формула: темп 0,5/дн. → +140 дн., Δ −60');
  select * into r from planfact.forecast(10, 1, 3, td, td + 1);
  res := res || pg_temp.t(r.forecast_finish = td + 42 and r.delta_days = 41, 'формула: 9 / (3/14) = ровно 42 (без ошибки деления на 14)');
  select * into r from planfact.forecast(10, 1, 4, td, td + 1);
  res := res || pg_temp.t(r.forecast_finish = td + 32 and r.delta_days = 31, 'формула: дробный срок округляется вверх (9 / (4/14) = 31,5 → 32)');
  select * into r from planfact.forecast(100, 30, 0, td, td + 60);
  res := res || pg_temp.t(r.forecast_finish is null and r.delta_days is null, 'нет факта за 14 дней — нет темпа (null)');
  select * into r from planfact.forecast(100, 100, 0, td, td + 60);
  res := res || pg_temp.t(r.forecast_finish = td and r.delta_days is null, 'выполнено — сегодня, Δ не считается');
  select * into r from planfact.forecast(100, 120, 5, td, td - 3);
  res := res || pg_temp.t(r.forecast_finish = td and r.delta_days is null, 'перебор — как выполнено');
  select * into r from planfact.forecast(100, 30, 14, td, null);
  res := res || pg_temp.t(r.forecast_finish = td + 70 and r.delta_days is null, 'без финиша объекта — прогноз есть, Δ null');
  select * into r from planfact.forecast(0, 0, 0, td, td + 5);
  res := res || pg_temp.t(r.forecast_finish is null, 'план 0 — прогноза нет');
  select * into r from planfact.forecast(1000000000, 0, 0.001, td, td + 5);
  res := res || pg_temp.t(r.forecast_finish is null, 'срок > 100 лет — прогноза нет');

  -- 2. Ввод «за период» (прораб)
  perform pg_temp.as_user(ufor);
  perform public.pf_fact_add(pos10, br, td - 20, 10);
  perform public.pf_fact_add(pos20, br, td - 20, 100);
  perform public.pf_fact_add(pos30, br, td - 20, 5);
  ep := (public.pf_fact_add(pos10, br, td, 28, 3, null, 'за две недели', td - 13) ->> 'id')::uuid;
  res := res || pg_temp.t((select period_from = td - 13 and work_date = td and qty = 28 and status = 'accepted' from planfact.fact_entries where id = ep),
                          'запись за период: одна запись, с ' || to_char(td - 13, 'DD.MM') || ' по ' || to_char(td, 'DD.MM'));
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1, null, null, null, %L)', posn, br, td - 5, td - 4));
  res := res || pg_temp.t(t like '22023:%Начало периода позже конца%', 'начало позже конца — отказ');
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1, null, null, null, %L)', posn, br, td, td - 31));
  res := res || pg_temp.t(t like '22023:%не больше 31 дня%', '32 дня — отказ');
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1, null, null, null, %L)', posn, br, td + 1, td - 2));
  res := res || pg_temp.t(t like '22023:%в будущем%', 'конец периода в будущем — отказ');
  ec := (public.pf_fact_add(posn, br, td, 14, null, null, null, td - 30) ->> 'id')::uuid;
  res := res || pg_temp.t((select period_from = td - 30 from planfact.fact_entries where id = ec), 'ровно 31 день — принято');
  j := public.pf_fact_add(posn, br, td - 1, 1);
  res := res || pg_temp.t((select period_from is null and work_date = td - 1 from planfact.fact_entries where id = (j ->> 'id')::uuid),
                          'без периода — запись за день, как в 009');
  j := public.pf_fact_add_batch(pn, br, td - 2, jsonb_build_array(jsonb_build_object('position_id', posn, 'qty', 1)));
  res := res || pg_temp.t((select count(*) = 1 and bool_and(period_from is null) from planfact.fact_entries where batch_id = (j ->> 'batch_id')::uuid),
                          'пачка — без периода, как прежде');
  -- Исправление записи за период — та же дата и тот же период
  j := public.pf_fact_correct(ec, 20, 'перемерили');
  res := res || pg_temp.t((select period_from = td - 30 and work_date = td and qty = 20 and corrects_id = ec from planfact.fact_entries where id = (j ->> 'id')::uuid)
                          and (select status = 'superseded' from planfact.fact_entries where id = ec),
                          'исправление записи за период — период сохранён, прежняя заменена');
  -- История и журнал отдают период
  res := res || pg_temp.t((select period_from = td - 13 from public.pf_fact_history(pos10) where id = ep)
                          and (select count(*) = 1 from public.pf_fact_history(pos10) where period_from is null),
                          'история позиции: «за период» и обычная запись');
  res := res || pg_temp.t((select period_from = td - 13 from public.pf_fact_journal(pa, td, td) where id = ep)
                          and (select count(*) = 0 from public.pf_fact_journal(pa, td - 13, td - 1)),
                          'журнал: запись за период — в дне окончания периода (фильтр по дате работ — как прежде)');
  -- Неизменяемость
  reset role;
  t := pg_temp.err(format('update planfact.fact_entries set period_from = null where id = %L', ep));
  res := res || pg_temp.t(t like '42501:%изменять нельзя%', 'менять запись напрямую нельзя');
  t := pg_temp.err(format($q$select set_config('planfact.fact_tx', '1', true); update planfact.fact_entries set period_from = %L where id = %L$q$, td - 10, ep));
  perform set_config('planfact.fact_tx', '0', true);
  res := res || pg_temp.t(t like '42501:%изменять нельзя%', 'период неизменяем и изнутри функций (fact_guard)');
  t := pg_temp.err(format($q$select set_config('planfact.fact_tx', '1', true); update planfact.fact_entries set status = 'superseded' where id = %L$q$, ep));
  perform set_config('planfact.fact_tx', '0', true);
  res := res || pg_temp.t(t = 'OK', 'статус по-прежнему меняется (для проверки сторожа)');
  -- вернуть статус нельзя (superseded закрыта) — поэтому дальше откатываем статус обходом: пересоздаём проверку на другой записи
  t := pg_temp.err(format('insert into planfact.fact_entries(company_id, project_id, position_id, brigade_id, work_date, qty, status, period_from) values (%L, %L, %L, %L, %L, 1, %L, %L)',
                          ca, pa, pos10, br, td, 'accepted', td - 40));
  res := res || pg_temp.t(t like '42501:%', 'прямая вставка запрещена');
  perform set_config('planfact.fact_tx', '1', true);
  t := pg_temp.err(format('insert into planfact.fact_entries(company_id, project_id, position_id, brigade_id, work_date, qty, status, period_from) values (%L, %L, %L, %L, %L, 1, %L, %L)',
                          ca, pa, pos10, br, td, 'accepted', td - 40));
  perform set_config('planfact.fact_tx', '0', true);
  res := res || pg_temp.t(t like '23514:%', 'ограничение таблицы: период > 31 дня не записывается даже в обход функций');
  -- вернуть запись ep в итог (тест сторожа выше закрыл её) — новой записью того же периода
  perform pg_temp.as_user(ufor);
  ep := (public.pf_fact_add(pos10, br, td, 28, 3, null, 'за две недели', td - 13) ->> 'id')::uuid;
  reset role;

  -- 3. Итоги факта: запись за период — в дне work_date; прежние функции итогов не изменились по смыслу
  res := res || pg_temp.t((select fact_qty = 38 from planfact.fact_totals(pa) where position_id = pos10)
                          and (select fact_qty = 28 from planfact.fact_totals(pa, td - 6, td) where position_id = pos10)
                          and (select fact_qty = 0 from planfact.fact_totals(pa, td - 13, td - 1) where position_id = pos10),
                          'fact_totals: накоплено 38; за 7 дней — вся запись периода (ТД: темп «прыгает»)');

  -- 4. Прогноз позиции (РП). pos10: план 100, факт 38, 14 дн. 28 → темп 2/дн., остаток 62 → +31 дн.; Δ к финишу (+60) = −29;
  --    план % 33,3, отклонение 33,3 − 38 = −4,7. pos20: выполнено. pos30 (м³): нет темпа, отклонение 33,3 − 5 = 28,3.
  perform pg_temp.as_user(upm);
  select * into r from public.pf_summary_positions(pa) where position_id = pos10;
  res := res || pg_temp.t(r.forecast_finish = td + 31 and r.delta_days = -29 and r.plan_pct_today = ppl and r.dev_pp = round(100.0 * 30 / 90 - 38, 1),
                          'позиция с темпом: прогноз +31, Δ −29, план % ' || ppl || ', отклонение ' || r.dev_pp);
  res := res || pg_temp.t(r.plan_qty = 100 and r.fact_qty = 38 and r.fact14 = 28 and r.fact7 = 28 and r.pct = 38 and r.rest_qty = 62,
                          'прежние колонки позиции — как прежде');
  select * into r from public.pf_summary_positions(pa) where position_id = pos20;
  res := res || pg_temp.t(r.forecast_finish = td and r.delta_days is null and r.dev_pp = round(100.0 * 30 / 90 - 100, 1), 'позиция выполнена: сегодня, Δ нет');
  select * into r from public.pf_summary_positions(pa) where position_id = pos30;
  res := res || pg_temp.t(r.forecast_finish is null and r.delta_days is null and r.dev_pp = round(100.0 * 30 / 90 - 5, 1) and r.unit_code = 'м³',
                          'позиция без темпа: прогноза нет, отклонение 28,3');
  -- 5. Вид работ по ЕИ: м² (200 / 138 / 14 дн. 28 → остаток 62, темп 2 → +31), м³ отдельно (нет темпа)
  j := pg_temp.wu(pa, wt, 'м²');
  res := res || pg_temp.t((j ->> 'plan')::numeric = 200 and (j ->> 'fact')::numeric = 138 and (j ->> 'forecast_finish')::date = td + 31
                          and (j ->> 'delta_days')::int = -29 and (j ->> 'dev_pp')::numeric = round(100.0 * 30 / 90 - 69, 1),
                          'вид работ, м²: прогноз +31, Δ −29, отклонение −35,7');
  j := pg_temp.wu(pa, wt, 'м³');
  res := res || pg_temp.t((j ->> 'plan')::numeric = 100 and (j ->> 'fact')::numeric = 5 and j -> 'forecast_finish' = 'null'::jsonb
                          and (j ->> 'dev_pp')::numeric = round(100.0 * 30 / 90 - 5, 1), 'вид работ, м³ — отдельно: нет темпа');
  res := res || pg_temp.t((select jsonb_array_length(units) = 2 and plan_pct_today = ppl and positions = 3 from public.pf_summary_worktypes(pa) where work_type_id = wt),
                          'разные ЕИ не суммируются: две строки ЕИ; план % вида = план % объекта');
  res := res || pg_temp.t((select plan_money = 30000 and done_money = 14300 from public.pf_summary_worktypes(pa) where work_type_id = wt),
                          'РП видит ₽ (план 30 000, сделано 14 300)');
  -- 6. Объект без дат: прогноз есть, Δ / план % / отклонение — null. posn: 20 (период) + 1 + 1 = 22, всё за 14 дн.
  --    темп 22/14, остаток 78 → ceil(78 · 14 / 22) = 50
  select * into r from public.pf_summary_positions(pn) where position_id = posn;
  res := res || pg_temp.t(r.fact_qty = 22 and r.forecast_finish = td + 50 and r.delta_days is null and r.plan_pct_today is null and r.dev_pp is null,
                          'без дат объекта: прогноз +50, Δ / план % / отклонение — нет');
  j := pg_temp.wu(pn, wt2, 'м²');
  res := res || pg_temp.t((j ->> 'forecast_finish')::date = td + 50 and j -> 'delta_days' = 'null'::jsonb and j -> 'dev_pp' = 'null'::jsonb
                          and (select plan_pct_today is null from public.pf_summary_worktypes(pn) where work_type_id = wt2),
                          'без дат объекта — вид работ: прогноз есть, Δ и план % — нет');

  -- 7. Права: прораб — без ₽, но с прогнозом; чужая компания и anon — отказ
  reset role; perform pg_temp.as_user(ufor);
  res := res || pg_temp.t((select plan_money is null and done_money is null from public.pf_summary_worktypes(pa) where work_type_id = wt)
                          and (select forecast_finish = td + 31 from public.pf_summary_positions(pa) where position_id = pos10),
                          'прораб (без money.view): ₽ нет, прогноз есть');
  reset role; perform pg_temp.as_user(ubpm);
  t := pg_temp.err(format('select count(*) from public.pf_summary_positions(%L)', pa));
  res := res || pg_temp.t(t like '42501:%', 'чужая компания: сводка позиций — отказ');
  t := pg_temp.err(format('select count(*) from public.pf_summary_worktypes(%L)', pa));
  res := res || pg_temp.t(t like '42501:%', 'чужая компания: сводка видов — отказ');
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1, null, null, null, %L)', pos10, br, td, td - 1));
  res := res || pg_temp.t(t like '42501:%', 'чужая компания: ввод за период — отказ');
  t := pg_temp.err(format('select count(*) from public.pf_fact_history(%L)', pos10));
  res := res || pg_temp.t(t like '42501:%', 'чужая компания: история — отказ');
  reset role; perform pg_temp.as_user(upto);
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1, null, null, null, %L)', pos10, br, td, td - 1));
  res := res || pg_temp.t(t like '42501:%', 'ПТО без fact.create — ввод за период — отказ');
  -- Перебор за период — то же правило: на подтверждение РП
  reset role; perform pg_temp.as_user(ufor);
  j := public.pf_fact_add(pos20, br, td, 50, null, null, null, td - 3);
  res := res || pg_temp.t(j ->> 'status' = 'pending_approval', 'перебор «за период» — ждёт подтверждения РП (правило прежнее)');

  -- 8. Журнал администратора: период записан
  reset role;
  res := res || pg_temp.t(exists (select 1 from core.audit_log a where a.record_id = ep and a.new_data ->> 'period_from' = (td - 13)::text),
                          'журнал изменений: period_from записан');

  reset role;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res,'FAIL','')))/4;
end $$;
