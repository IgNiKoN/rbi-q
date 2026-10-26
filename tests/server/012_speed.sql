-- P2-0009 (012, К6): расчёт КС-2 и сводки не растёт как n² на ВОР с материалами под работами (как «Спутник»).
-- 400 работ × 2 материала (1 200 строк заказчика), факт по всем работам, договорная КП с ценами.
-- Норма (PGlite): ks2_rows ≤ 1,5 с, summary_rows ≤ 3 с. Страж скорости и денег на большой ВОР.
-- Медленный план (пересчёт «итога по строке» на каждую строку, n²) воспроизводился на базе стенда без статистики таблиц
-- (сразу после большой загрузки, до ANALYZE): «Спутник» 578 строк — 4,4 с / 13,5 с. На синтетике план зависит от оценок
-- планировщика, поэтому тест проходит и без 012; MATERIALIZED в 012 делает план независимым от статистики.
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 012_up.sql.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then 'OK ' || l else 'FAIL ' || l end || E'\n' $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); k int; pa uuid; f1 uuid; m2 uuid; wt uuid; imp uuid; est uuid; kp uuid; b1 uuid;
  t0 timestamptz; ms_k int; ms_s int; n int; res text := ''; td date := (now() at time zone 'Europe/Moscow')::date;
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor);
  insert into core.role_assignments(company_id,user_id,role_id,project_id)
  select ca, u, (select id from core.company_roles where company_id = ca and template_code = c), null
  from (values (uadm,'company_admin'),(upto,'pto'),(ufor,'foreman')) v(u, c);
  select id into m2 from core.units where company_id is null and code = 'м²';

  reset role; perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Большой');
  f1 := public.pf_add_location(pa, null, 'building', 'Корпус 1.1');
  reset role; perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Работа', m2);
  imp := public.pf_vor_create_import(pa, 'вор.xlsx', repeat('a', 64), 'Лист 1');
  for k in 0..1 loop   -- по 600 строк за вызов (лимит 1 000)
    perform public.pf_vor_add_rows(imp, (select jsonb_agg(r) from (
      select jsonb_build_object('row_no', g * 3, 'kind', 'work', 'number', g::text, 'name', 'Работа ' || g, 'unit_text', 'м2', 'qty', 100) r from generate_series(k * 200 + 1, k * 200 + 200) g
      union all select jsonb_build_object('row_no', g * 3 + 1, 'kind', 'material', 'number', g || '.1', 'name', 'Материал А ' || g, 'unit_text', 'кг', 'qty', 300, 'norm', 3, 'parent_row_no', g * 3) from generate_series(k * 200 + 1, k * 200 + 200) g
      union all select jsonb_build_object('row_no', g * 3 + 2, 'kind', 'material', 'number', g || '.2', 'name', 'Материал Б ' || g, 'unit_text', 'шт', 'qty', 50, 'norm', 0.5, 'parent_row_no', g * 3) from generate_series(k * 200 + 1, k * 200 + 200) g) x));
  end loop;
  perform public.pf_vor_resolve_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g * 3, 'location_id', f1, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')) from generate_series(1, 400) g));
  perform public.pf_vor_confirm(imp);
  est := public.pf_estimate_create(pa, 'Смета', array[imp]);
  kp := (public.pf_kp_create(est, repeat('a', 64), jsonb_build_object('version', 1, 'rows', (select jsonb_agg(r) from (
    select jsonb_build_object('import_id', imp, 'row_no', g * 3, 'kind', 'work', 'price_labor', 100) r from generate_series(1, 400) g
    union all select jsonb_build_object('import_id', imp, 'row_no', g * 3 + 1, 'kind', 'material', 'price_material', 10) from generate_series(1, 400) g
    union all select jsonb_build_object('import_id', imp, 'row_no', g * 3 + 2, 'kind', 'material', 'price_material', 5) from generate_series(1, 400) g) x)), 1) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(pa, kp);
  b1 := public.pf_brigade_save(ca, null, 'Иванов');
  reset role; perform pg_temp.as_user(ufor);
  perform public.pf_fact_add(p.id, b1, td - 3, 10) from planfact.vor_positions p where p.project_id = pa;
  reset role;
  -- статистика таблиц, как на рабочей базе после автоматического ANALYZE
  analyze planfact.vor_source_rows; analyze planfact.vor_links; analyze planfact.vor_positions; analyze planfact.fact_entries;

  t0 := clock_timestamp();
  select count(*) into n from planfact.ks2_rows(pa, td, kp);
  ms_k := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || pg_temp.t(n = 1200, 'ks2_rows: строк с объёмом 1 200 (получено ' || n || ')');
  res := res || pg_temp.t(ms_k <= 1500, 'ks2_rows за ' || ms_k || ' мс (норма ≤ 1 500)');
  t0 := clock_timestamp();
  select count(*) into n from planfact.summary_rows(pa, td);
  ms_s := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || pg_temp.t(n = 1200, 'summary_rows: 1 200 строк (получено ' || n || ')');
  res := res || pg_temp.t(ms_s <= 3000, 'summary_rows за ' || ms_s || ' мс (норма ≤ 3 000)');
  -- деньги: 400 × (10 м² × 100 + 30 кг × 10 + 5 шт × 5) = 400 × 1 325 = 530 000
  select sum(done_qty * price) into n from planfact.summary_rows(pa, td);
  res := res || pg_temp.t(n = 530000, 'сделано по деньгам 530 000 (получено ' || n || ')');

  select count(*) into n from regexp_matches(res, '(^|\n)FAIL', 'g');
  raise exception E'%\nFAIL всего: %', res, n;
end $$;
