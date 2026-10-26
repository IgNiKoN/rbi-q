-- P2-0011 этап 0: тесты доработки 013a по ревью P2-0010 — рабочие дни до финиша арифметически (= перебору дней для всех пар дат),
-- границы дат проекта (9999 год — отказ, а и при такой дате в базе сводка — мгновенно), старт «застоя» — первый принятый факт,
-- порядок строк «без цены» — порядок ВОР, нагрузка: портфель 5 × 2 000 при ещё 20 000 позиций другой компании в базе ≤ 2 с без ANALYZE.
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 013a_review_fix.sql (регрессия — 013_dashboard.sql).
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
-- Объект с p_rows строками-работами по 100 м² (цена 100 ₽), договорной КП и фактом по 10 м² на каждую позицию за 20 дней.
create or replace function pg_temp.load_project(p_company uuid, p_adm uuid, p_pto uuid, p_for uuid, p_name text, p_rows int, p_today date)
returns uuid language plpgsql as $f$
declare p uuid; loc uuid; wt uuid; imp uuid; est uuid; kp uuid; br uuid; m2 uuid; k int; n int;
begin
  select id into m2 from core.units where company_id is null and code = 'м²';
  reset role; perform pg_temp.as_user(p_adm);
  p := public.pf_create_project(p_company, p_name);
  loc := public.pf_add_location(p, null, 'building', 'Корпус');
  perform public.pf_project_set_dates(p, p_today - 60, p_today + 60);
  br := public.pf_brigade_save(p_company, null, 'Бригада ' || p_name);
  reset role; perform pg_temp.as_user(p_pto);
  wt := public.pf_vor_add_work_type(p, 'Работа ' || p_name, m2);
  imp := public.pf_vor_create_import(p, 'вор.xlsx', repeat('c', 64), 'Лист 1');
  for k in 0..(p_rows / 1000 - 1) loop
    perform public.pf_vor_add_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'kind', 'work', 'number', g::text, 'name', 'Работа ' || g,
      'unit_text', 'м2', 'qty', 100)) from generate_series(k * 1000 + 1, k * 1000 + 1000) g));
    perform public.pf_vor_resolve_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'location_id', loc, 'work_type_id', wt, 'unit_id', m2,
      'match', 'green')) from generate_series(k * 1000 + 1, k * 1000 + 1000) g));
  end loop;
  perform public.pf_vor_confirm(imp);
  est := public.pf_estimate_create(p, 'Смета', array[imp]);
  kp := (public.pf_kp_create(est, repeat('c', 64), jsonb_build_object('version', 1, 'rows', (select jsonb_agg(jsonb_build_object('import_id', imp,
    'row_no', g, 'kind', 'work', 'price_labor', 100)) from generate_series(1, p_rows) g)), p_rows * 10000) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(p, kp);
  reset role; perform pg_temp.as_user(p_for);
  for n in 0..19 loop
    for k in 0..((p_rows / 20 - 1) / 500) loop
      perform public.pf_fact_add_batch(p, br, p_today - n, (select jsonb_agg(jsonb_build_object('position_id', x.id, 'qty', 10)) from (
        select vp.id, row_number() over (order by vp.id) rn from planfact.vor_positions vp where vp.project_id = p) x
        where x.rn % 20 = n and (x.rn / 20) / 500 = k));
    end loop;
  end loop;
  reset role;
  return p;
end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); upm uuid := gen_random_uuid();
  umgmt uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid(); ubpto uuid := gen_random_uuid(); ubfor uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid; pc uuid; b1 uuid; wt uuid; m2 uuid; imp uuid; est uuid; kp uuid; br uuid; posx uuid; posy uuid; posz uuid;
  j jsonb; n int; k int; d int; bad int := 0; t text; res text := ''; r record; t0 timestamptz; ms int; pp uuid[];
  td date := (now() at time zone 'Europe/Moscow')::date;
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,upm,umgmt,ubadm,ubpto,ubfor]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor),(ca,upm),(ca,umgmt),(cb,ubadm),(cb,ubpto),(cb,ubfor);
  insert into core.role_assignments(company_id,user_id,role_id,project_id)
  select v.c, v.u, (select id from core.company_roles where company_id = v.c and template_code = v.code), null
  from (values (ca,uadm,'company_admin'),(ca,upto,'pto'),(ca,ufor,'foreman'),(ca,upm,'project_manager'),(ca,umgmt,'management'),
               (cb,ubadm,'company_admin'),(cb,ubpto,'pto'),(cb,ubfor,'foreman')) v(c, u, code);
  select id into m2 from core.units where company_id is null and code = 'м²';

  -- 1. Объект: 4 строки ВОР (10, 20 — без цены; 30 — с ценой; 40 — без цены), по позиции на строку.
  perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Проверка');
  b1 := public.pf_add_location(pa, null, 'building', 'Корпус 1');
  br := public.pf_brigade_save(ca, null, 'Иванов');
  reset role; perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка', m2);
  imp := public.pf_vor_create_import(pa, 'вор.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'kind', 'work', 'number', (g / 10)::text, 'name', 'Строка ' || g,
    'unit_text', 'м2', 'qty', 100)) from unnest(array[40, 10, 30, 20]) g));
  perform public.pf_vor_resolve_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'location_id', b1, 'work_type_id', wt, 'unit_id', m2,
    'match', 'green')) from unnest(array[10, 20, 30, 40]) g));
  perform public.pf_vor_confirm(imp);
  est := public.pf_estimate_create(pa, 'Смета', array[imp]);
  kp := (public.pf_kp_create(est, repeat('a', 64), jsonb_build_object('version', 1, 'rows', (select jsonb_agg(jsonb_build_object('import_id', imp,
    'row_no', g, 'kind', 'work', 'price_labor', case when g = 30 then 100 end)) from unnest(array[40, 20, 30, 10]) g)), 10000) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(pa, kp);

  -- 2. Рабочие дни до финиша: арифметика = перебору дней (пн–пт после T до T_end включительно) для 7 дней недели × финиш −3…+40 дней
  reset role;
  for k in 0..6 loop
    for d in -3..40 loop
      update core.projects set planned_start = td - 10, planned_finish = td + k + d where id = pa;
      select s.work_days_left into n from planfact.summary_project(pa, td + k) s;
      if n is distinct from (select count(*)::int from generate_series(1, d) g where extract(isodow from td + k + g) < 6) then bad := bad + 1; end if;
    end loop;
  end loop;
  res := res || pg_temp.t(bad = 0, 'рабочие дни до финиша: 308 пар дат = перебору дней (расхождений ' || bad || ')');

  -- 3. Границы дат: 2000-01-01 … 2100-12-31; дата из 9999 года уже в базе — сводка не «висит»
  perform pg_temp.as_user(upm);
  t := pg_temp.err(format('select public.pf_project_set_dates(%L, %L, %L)', pa, td, '9999-12-31'));
  res := res || pg_temp.t(t like '22023%', 'дата окончания 9999-12-31 — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_project_set_dates(%L, %L, %L)', pa, '1999-12-31', td));
  res := res || pg_temp.t(t like '22023%', 'дата начала до 2000 года — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_project_set_dates(%L, %L, %L)', pa, '2000-01-01', '2100-12-31'));
  res := res || pg_temp.t(t = 'OK', 'границы 2000-01-01 и 2100-12-31 — можно (' || t || ')');
  t := pg_temp.err(format('select public.pf_project_set_dates(%L, %L, %L)', pa, td + 5, td));
  res := res || pg_temp.t(t like '22023%', 'начало позже окончания — по-прежнему отказ');
  reset role;
  update core.projects set planned_start = td - 10, planned_finish = '9999-12-31' where id = pa;
  perform pg_temp.as_user(upm);
  t0 := clock_timestamp();
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || pg_temp.t(r.work_days_left > 2000000 and ms <= 500, 'финиш 9999-12-31 в базе: сводка за ' || ms || ' мс (≤ 500), рабочих дней ' || r.work_days_left);
  perform public.pf_project_set_dates(pa, null, null);

  -- 4. «Без цены» — в порядке ВОР (строки 10, 20, 40), не в порядке вставки строк КП
  j := public.pf_summary_attention(pa);
  res := res || pg_temp.t((j #>> '{counts,unpriced_rows}')::int = 3 and j #>> '{unpriced,0,name}' = 'Строка 10' and j #>> '{unpriced,1,name}' = 'Строка 20'
                          and j #>> '{unpriced,2,name}' = 'Строка 40', 'без цены по порядку ВОР: 10, 20, 40 (' || (j -> 'unpriced')::text || ')');

  -- 5. Старт «застоя» без плановых дат — первый принятый факт: X — факт 20 и 1 день назад, Y — 2 дня назад, Z — факта нет → Z стоит 20 дн.
  select l.position_id into posx from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp and s.row_no = 10;
  select l.position_id into posy from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp and s.row_no = 20;
  select l.position_id into posz from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp and s.row_no = 30;
  reset role; perform pg_temp.as_user(ufor);
  perform public.pf_fact_add(posx, br, td - 20, 1);
  perform public.pf_fact_add(posx, br, td - 1, 1);
  perform public.pf_fact_add(posy, br, td - 2, 1);
  reset role; perform pg_temp.as_user(upm);
  j := public.pf_summary_attention(pa, 5);
  res := res || pg_temp.t((select count(*) from jsonb_array_elements(j -> 'stale') x where (x ->> 'position_id')::uuid = posz and (x ->> 'idle_days')::int = 20) = 1,
                          'без дат объекта: позиция без факта стоит с первого факта объекта — 20 дн. (' || (j -> 'stale')::text || ')');

  -- 6. Нагрузка: в базе ещё 20 000 позиций другой компании (факт, связки, строки ВОР), затем портфель 5 × 2 000 — без ANALYZE
  for k in 1..4 loop
    pc := pg_temp.load_project(cb, ubadm, ubpto, ubfor, 'Бета-объём ' || k, 5000, td);
  end loop;
  for k in 1..5 loop
    pp[k] := pg_temp.load_project(ca, uadm, upto, ufor, 'ЖК Нагрузка ' || k, 2000, td);
  end loop;
  select count(*) into n from planfact.vor_positions vp join core.projects p on p.id = vp.project_id where p.company_id = cb;
  res := res || pg_temp.t(n = 20000, 'позиций другой компании в базе: ' || n);
  perform pg_temp.as_user(umgmt);
  t0 := clock_timestamp();
  select count(*) into n from public.pf_summary_portfolio() p where p.project_id = any(pp) and p.lag_days is not null and p.done_money = 2000000;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || pg_temp.t(n = 5 and ms <= 2000, 'портфель 5 × 2 000 при 20 000 чужих позиций: ' || ms || ' мс (≤ 2 000)');
  t0 := clock_timestamp();
  select count(*) into n from public.pf_summary_weekly(pp[1], 12);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || pg_temp.t(n = 12 and ms <= 2000, 'недели (12): ' || ms || ' мс (≤ 2 000)');
  t0 := clock_timestamp();
  j := public.pf_summary_attention(pp[1]);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || pg_temp.t((j #>> '{completeness,positions_total}')::int = 2000 and ms <= 2000, '«требует внимания»: ' || ms || ' мс (≤ 2 000)');
  t0 := clock_timestamp();
  select * into r from public.pf_summary_places(pp[1]) p;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || pg_temp.t(r.positions = 2000 and r.done_money = 2000000 and ms <= 2000, 'места: ' || ms || ' мс (≤ 2 000)');
  reset role;

  select count(*) into n from regexp_matches(res, '(^|\n)FAIL', 'g');
  raise exception E'%\nFAIL всего: %', res, n;
end $$;
