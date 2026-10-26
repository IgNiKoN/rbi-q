-- P2-0009 (012): цены файла заказчика в строках ВОР (pf_vor_import_rows.prices) — только с правом на деньги или сметы.
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 012_up.sql.
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
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); ucus uuid := gen_random_uuid();
  ueco uuid := gen_random_uuid(); uboss uuid := gen_random_uuid(); ubeta uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); pa uuid; imp uuid; p jsonb; t text; res text := ''; n int;
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,ucus,ueco,uboss,ubeta]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor),(ca,ucus),(ca,ueco),(ca,uboss),(cb,ubeta);
  insert into core.role_assignments(company_id,user_id,role_id,project_id)
  select v.c, v.u, (select id from core.company_roles where company_id = v.c and template_code = v.code), null
  from (values (ca,uadm,'company_admin'),(ca,upto,'pto'),(ca,ufor,'foreman'),(ca,ucus,'customer'),(ca,ueco,'economist'),(ca,uboss,'management'),(cb,ubeta,'company_admin')) v(c, u, code);

  reset role; perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Спутник');
  reset role; perform pg_temp.as_user(upto);
  imp := public.pf_vor_create_import(pa, 'вор.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, '[{"row_no": 6, "kind": "work", "number": "1.1", "name": "Утеплитель", "unit_text": "м2", "qty": 83.33,
    "prices": {"Цена / Работа": 300, "Всего / Работа": 24999}}]');

  -- С правом: ПТО (сметы + деньги), экономист и руководство (деньги), админ — цены видны
  select r.prices into p from public.pf_vor_import_rows(imp) r where r.row_no = 6;
  res := res || pg_temp.t((p ->> 'Цена / Работа')::numeric = 300 and (p ->> 'Всего / Работа')::numeric = 24999, 'ПТО видит цены файла (' || p::text || ')');
  foreach t in array array['economist', 'management', 'company_admin'] loop
    reset role; perform pg_temp.as_user(case t when 'economist' then ueco when 'management' then uboss else uadm end);
    select r.prices into p from public.pf_vor_import_rows(imp) r where r.row_no = 6;
    res := res || pg_temp.t((p ->> 'Цена / Работа')::numeric = 300, t || ' видит цены файла');
  end loop;

  -- Без права: прораб и заказчик — строка есть (номер, объём), цен нет
  reset role; perform pg_temp.as_user(ufor);
  select r.prices into p from public.pf_vor_import_rows(imp) r where r.row_no = 6;
  res := res || pg_temp.t(p = '{}'::jsonb, 'прораб: prices = {} (' || coalesce(p::text, 'null') || ')');
  select count(*) into n from public.pf_vor_import_rows(imp) r where r.row_no = 6 and r.number = '1.1' and r.qty = 83.33;
  res := res || pg_temp.t(n = 1, 'прораб: номер и объём строки на месте');
  reset role; perform pg_temp.as_user(ucus);
  select r.prices into p from public.pf_vor_import_rows(imp) r where r.row_no = 6;
  res := res || pg_temp.t(p = '{}'::jsonb, 'заказчик: prices = {}');

  -- Чужая компания и anon — отказ, как раньше
  reset role; perform pg_temp.as_user(ubeta);
  t := pg_temp.err(format('select count(*) from public.pf_vor_import_rows(%L)', imp));
  res := res || pg_temp.t(t like '22023%', 'Бета: «Загрузка не найдена» (' || t || ')');
  reset role;
  perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  t := pg_temp.err(format('select count(*) from public.pf_vor_import_rows(%L)', imp));
  res := res || pg_temp.t(t like '42501%', 'anon: нет права на вызов (' || t || ')');
  reset role;

  select count(*) into n from regexp_matches(res, '(^|\n)FAIL', 'g');
  raise exception E'%\nFAIL всего: %', res, n;
end $$;
