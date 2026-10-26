-- P2-0008, доработка (011a): прогноз при почти нулевом темпе не роняет сводку (red / no_pace); порядок строк «Сделано ↔ КС-2».
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 011a_summary_fix.sql.
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
  ca uuid := gen_random_uuid(); pa uuid; f5 uuid; m2 uuid; wt uuid; wt2 uuid; imp uuid; est uuid; kp uuid; b1 uuid; pos uuid; pos2 uuid;
  r record; t text; res text := ''; n int; rows_ text; td date := (now() at time zone 'Europe/Moscow')::date;
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,upm]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor),(ca,upm);
  insert into core.role_assignments(company_id,user_id,role_id,project_id)
  select ca, u, (select id from core.company_roles where company_id = ca and template_code = c), null
  from (values (uadm,'company_admin'),(upto,'pto'),(ufor,'foreman'),(upm,'project_manager')) v(u, c);
  select id into m2 from core.units where company_id is null and code = 'м²';

  -- План 30 000 000 м² × 1 ₽ = 30 млн ₽; за 14 дней сделано 0,14 м² → темп 0,01 ₽/дн. → остаток / темп ≈ 3·10⁹ дней.
  reset role; perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Медленный');
  f5 := public.pf_add_location(pa, null, 'floor', '5 этаж');
  reset role; perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка стен', m2);
  wt2 := public.pf_vor_add_work_type(pa, 'Окраска стен', m2);
  imp := public.pf_vor_create_import(pa, 'вор.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, '[{"row_no": 30, "kind": "work", "number": "2", "name": "Окраска стен", "unit_text": "м2", "qty": 10},
    {"row_no": 12, "kind": "work", "number": "1", "name": "Штукатурка стен", "unit_text": "м2", "qty": 30000000}]');
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(
    jsonb_build_object('row_no', 12, 'location_id', f5, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 30, 'location_id', f5, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp);
  select id into pos from planfact.vor_positions where project_id = pa and work_type_id = wt;
  select id into pos2 from planfact.vor_positions where project_id = pa and work_type_id = wt2;
  est := public.pf_estimate_create(pa, 'Смета', array[imp]);
  kp := (public.pf_kp_create(est, repeat('a', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', imp, 'row_no', 12, 'kind', 'work', 'price_labor', 1),
    jsonb_build_object('import_id', imp, 'row_no', 30, 'kind', 'work', 'price_labor', 0))), 1) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(pa, kp);
  b1 := public.pf_brigade_save(ca, null, 'Иванов');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_dates(pa, td - 30, td + 100);
  reset role; perform pg_temp.as_user(ufor);
  perform public.pf_fact_add(pos, b1, td - 3, 0.14);
  perform public.pf_fact_add(pos2, b1, td - 2, 1);

  -- 1. Прогноз за пределами 36 500 дней — нет прогноза, красный, портфель не падает
  reset role; perform pg_temp.as_user(upto);
  t := pg_temp.err('select count(*) from public.pf_summary_portfolio()');
  res := res || pg_temp.t(t = 'OK', 'портфель не падает при почти нулевом темпе (' || t || ')');
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.pace14 = 0.01, 'темп 14 дней = 0,14 / 14 = 0,01 ₽/дн. (получено ' || r.pace14 || ')');
  res := res || pg_temp.t(r.forecast_finish is null and r.light = 'red' and r.light_reason = 'no_pace',
                          'прогноза нет, красный, причина no_pace (' || r.light || '/' || r.light_reason || ')');

  -- 2. Порядок строк «Сделано ↔ КС-2»: по номеру строки заказчика (12, затем 30), хотя строка 30 добавлена первой
  select string_agg(g.row_no::text, ',' order by g.ord) into rows_
  from (select x.row_no, row_number() over () ord from public.pf_summary_ks2_gap(pa) x) g;
  res := res || pg_temp.t(rows_ = '12,30', 'строки разрыва КС-2 по порядку: 12, 30 (получено ' || coalesce(rows_, '-') || ')');
  reset role;

  select count(*) into n from regexp_matches(res, '(^|\n)FAIL', 'g');
  raise exception E'%\nFAIL всего: %', res, n;
end $$;
