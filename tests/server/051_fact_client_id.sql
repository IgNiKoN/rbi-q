-- P2-0064 (051): факт с номером записи с телефона — повтор без дубля (одна запись и пачка), прежний ответ при повторе,
-- «за кого», отказ не занимает номер (после исправления уходит), чужой номер — отказ, права и область — как у pf_fact_add,
-- перебор — «на проверку», бригада в архиве / позиция снята — отказ с причиной, прежние вызовы без номера работают, изоляция компаний.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 051_fact_client_id_up.sql.
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
-- записи факта позиции — мимо правил строк (проверка из теста)
create or replace function pg_temp.cnt(p uuid) returns int language sql security definer as $f$
  select count(*)::int from planfact.fact_entries where position_id = p $f$;
create or replace function pg_temp.subs(c uuid) returns int language sql security definer as $f$
  select count(*)::int from planfact.fact_submissions where id = c $f$;
do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); uiv uuid := gen_random_uuid(); upe uuid := gen_random_uuid();
  upm uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid(); uview uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); pa uuid;
  r_adm uuid; r_pto uuid; r_for uuid; r_pm uuid; r_badm uuid; r_view uuid;
  bld uuid; s1 uuid; s2 uuid; s3 uuid; f1 uuid; wt uuid; m2 uuid; imp uuid; br uuid; br2 uuid; p1 uuid; p2 uuid; p3 uuid;
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid(); c4 uuid := gen_random_uuid();
  c5 uuid := gen_random_uuid(); c6 uuid := gen_random_uuid(); c7 uuid := gen_random_uuid(); c8 uuid := gen_random_uuid();
  c9 uuid := gen_random_uuid();
  j jsonb; j2 jsonb; j3 jsonb; t text; n int; res text := '';
  today date := (now() at time zone 'Europe/Moscow')::date;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, upto, uiv, upe, upm, ubadm, uview]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 051', true), (cb, 'Бета 051', true);
  insert into core.company_members(company_id, user_id) select ca, u from unnest(array[uadm, upto, uiv, upe, upm, uview]) u
    union all select cb, ubadm;
  insert into core.user_profiles(user_id, full_name) values (uiv, 'Иванов И.'), (upe, 'Петров П.');
  select id into r_adm from core.company_roles where company_id = ca and template_code = 'company_admin';
  select id into r_pto from core.company_roles where company_id = ca and template_code = 'pto';
  select id into r_for from core.company_roles where company_id = ca and template_code = 'foreman';
  select id into r_pm from core.company_roles where company_id = ca and template_code = 'project_manager';
  select id into r_badm from core.company_roles where company_id = cb and template_code = 'company_admin';
  insert into core.company_roles(company_id, name) values (ca, 'Только просмотр 051') returning id into r_view;
  insert into core.company_role_permissions(role_id, company_id, action)
    select r_view, ca, a from unnest(array['planfact.works.view', 'planfact.fact.view']) a;
  insert into core.role_assignments(company_id, user_id, role_id, project_id)
    values (ca, uadm, r_adm, null), (ca, upto, r_pto, null), (cb, ubadm, r_badm, null);
  select id into m2 from core.units where company_id is null and code = 'м²';

  -- схема и права на функцию
  res := res || pg_temp.t(to_regprocedure('public.pf_fact_submit(uuid,jsonb)') is not null, 'есть pf_fact_submit');
  res := res || pg_temp.t(not has_function_privilege('anon', 'public.pf_fact_submit(uuid,jsonb)', 'execute')
                          and has_function_privilege('authenticated', 'public.pf_fact_submit(uuid,jsonb)', 'execute'), 'pf_fact_submit — только authenticated');
  res := res || pg_temp.t(not has_table_privilege('authenticated', 'planfact.fact_submissions', 'select')
                          and not has_table_privilege('authenticated', 'planfact.fact_submissions', 'insert')
                          and not has_table_privilege('anon', 'planfact.fact_submissions', 'select'), 'принятые номера — клиенту недоступны');
  res := res || pg_temp.t((select relrowsecurity from pg_class where oid = 'planfact.fact_submissions'::regclass), 'принятые номера — RLS включена');
  res := res || pg_temp.t(to_regprocedure('public.pf_fact_add(uuid,uuid,date,numeric,integer,numeric,text,date)') is not null
                          and to_regprocedure('public.pf_fact_add_batch(uuid,uuid,date,jsonb,integer,text,boolean)') is not null
                          and to_regprocedure('public.pf_fact_add_for(uuid,uuid,uuid,date,numeric,integer,numeric,text,date)') is not null
                          and to_regprocedure('public.pf_fact_add_batch_for(uuid,uuid,uuid,date,jsonb,integer,text)') is not null,
                          'прежние функции ввода факта — с прежней подписью');

  -- проект: корпус → секции 1, 2, 3; этаж в секции 1; ВОР: строка 1 — этаж секции 1, 2 — секция 2, 3 — секция 3 (план 100)
  perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Альфа 051');
  bld := public.pf_add_location(pa, null, 'building', 'Корпус 1');
  s1 := public.pf_add_location(pa, bld, 'section', 'Секция 1');
  s2 := public.pf_add_location(pa, bld, 'section', 'Секция 2');
  s3 := public.pf_add_location(pa, bld, 'section', 'Секция 3');
  f1 := public.pf_add_location(pa, s1, 'floor', '1 этаж');
  br := public.pf_brigade_save(ca, null, 'Бригада 051', null, null);
  br2 := public.pf_brigade_save(ca, null, 'Бригада 051-архив', null, null);
  perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка', m2);
  imp := public.pf_vor_create_import(pa, 'вор-051.xlsx', repeat('b', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'kind', 'work', 'name', 'Строка ' || g,
    'unit_text', 'м2', 'qty', 100)) from unnest(array[1, 2, 3]) g));
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(
    jsonb_build_object('row_no', 1, 'location_id', f1, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 2, 'location_id', s2, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 3, 'location_id', s3, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp);
  p1 := pg_temp.pos(imp, 1); p2 := pg_temp.pos(imp, 2); p3 := pg_temp.pos(imp, 3);
  -- Иванов — прораб, секции 1–2, ответственный за факт; Петров — прораб, секция 3; РП — весь проект; «просмотр» — весь проект
  perform pg_temp.as_user(uadm);
  perform public.pf_set_participation(array[uiv], r_for, pa, array[s1, s2], true);
  perform public.pf_set_participation(array[upe], r_for, pa, array[s3]);
  perform public.pf_set_participation(array[upm], r_pm, pa);
  perform public.pf_set_participation(array[uview], r_view, pa);
  perform public.pf_brigade_archive(br2, true);

  -- 1. одна запись: три одинаковые отправки → одна запись, тот же ответ
  perform pg_temp.as_user(uiv);
  j := public.pf_fact_submit(c1, jsonb_build_object('kind', 'entry', 'position_id', p1, 'brigade_id', br, 'date', today, 'qty', 10, 'workers', 3,
         'man_hours', 24, 'note', 'без сети'));
  j2 := public.pf_fact_submit(c1, jsonb_build_object('kind', 'entry', 'position_id', p1, 'brigade_id', br, 'date', today, 'qty', 10, 'workers', 3,
         'man_hours', 24, 'note', 'без сети'));
  j3 := public.pf_fact_submit(c1, jsonb_build_object('kind', 'entry', 'position_id', p1, 'brigade_id', br, 'date', today, 'qty', 10));
  res := res || pg_temp.t(j ->> 'status' = 'accepted' and j ? 'id' and not j ? 'repeat', 'первая отправка — принято (' || j::text || ')');
  res := res || pg_temp.t(j2 ->> 'id' = j ->> 'id' and j3 ->> 'id' = j ->> 'id' and (j2 ->> 'repeat')::boolean and (j3 ->> 'repeat')::boolean
                          and j2 ->> 'status' = 'accepted', 'повторы — прежний ответ с пометкой repeat (' || j2::text || ')');
  reset role;
  res := res || pg_temp.t(pg_temp.cnt(p1) = 1, '3 отправки — 1 запись факта (' || pg_temp.cnt(p1) || ')');
  res := res || pg_temp.t((select note = 'без сети' and workers = 3 and man_hours = 24 and created_by = uiv from planfact.fact_entries where id = (j ->> 'id')::uuid),
                          'запись — поля и автор как переданы');
  res := res || pg_temp.t((select count(*) from core.audit_log where table_name = 'fact_entries' and record_id = (j ->> 'id')::uuid) = 1, 'журнал: одна запись');

  -- 2. пачка: повтор → одна пачка; перебор → «на проверку»
  perform pg_temp.as_user(uiv);
  j := public.pf_fact_submit(c2, jsonb_build_object('kind', 'batch', 'project_id', pa, 'brigade_id', br, 'date', today, 'workers', 5,
         'items', jsonb_build_array(jsonb_build_object('position_id', p1, 'qty', 20), jsonb_build_object('position_id', p2, 'qty', 150))));
  j2 := public.pf_fact_submit(c2, jsonb_build_object('kind', 'batch', 'project_id', pa, 'brigade_id', br, 'date', today, 'workers', 5,
         'items', jsonb_build_array(jsonb_build_object('position_id', p1, 'qty', 20), jsonb_build_object('position_id', p2, 'qty', 150))));
  res := res || pg_temp.t((j ->> 'accepted')::int = 1 and (j ->> 'pending')::int = 1, 'пачка: 1 принято, перебор — на проверку (' || j::text || ')');
  res := res || pg_temp.t(j2 ->> 'batch_id' = j ->> 'batch_id' and (j2 ->> 'repeat')::boolean, 'повтор пачки — прежний ответ');
  reset role;
  res := res || pg_temp.t(pg_temp.cnt(p1) = 2 and pg_temp.cnt(p2) = 1, 'повтор пачки — без дублей (' || pg_temp.cnt(p1) || '/' || pg_temp.cnt(p2) || ')');
  res := res || pg_temp.t((select status from planfact.fact_entries where position_id = p2) = 'pending_approval', 'перебор — pending_approval');

  -- 3. отказ не занимает номер: бригада в архиве → отказ; та же запись с действующей бригадой → уходит
  perform pg_temp.as_user(uiv);
  t := pg_temp.err(format('select public.pf_fact_submit(%L, %L)', c3,
         jsonb_build_object('kind', 'entry', 'position_id', p1, 'brigade_id', br2, 'date', today, 'qty', 1)));
  res := res || pg_temp.t(t like '22023%Бригада в архиве%', 'бригада в архиве — отказ с причиной (' || t || ')');
  reset role;
  res := res || pg_temp.t(pg_temp.subs(c3) = 0, 'отказ — номер не занят');
  perform pg_temp.as_user(uiv);
  j := public.pf_fact_submit(c3, jsonb_build_object('kind', 'entry', 'position_id', p1, 'brigade_id', br, 'date', today, 'qty', 1));
  res := res || pg_temp.t(j ->> 'status' = 'accepted' and not j ? 'repeat', 'после исправления — уходит');

  -- 4. права и область — как pf_fact_add: чужое место, без права, чужая компания, будущая дата
  perform pg_temp.as_user(uiv);
  t := pg_temp.err(format('select public.pf_fact_submit(%L, %L)', c4, jsonb_build_object('kind', 'entry', 'position_id', p3, 'brigade_id', br, 'date', today, 'qty', 1)));
  res := res || pg_temp.t(t like '42501%', 'Иванов: место секции 3 — отказ (' || t || ')');
  perform pg_temp.as_user(uview);
  t := pg_temp.err(format('select public.pf_fact_submit(%L, %L)', c4, jsonb_build_object('kind', 'entry', 'position_id', p1, 'brigade_id', br, 'date', today, 'qty', 1)));
  res := res || pg_temp.t(t like '42501%', 'без права fact.create — отказ (' || t || ')');
  perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select public.pf_fact_submit(%L, %L)', c4, jsonb_build_object('kind', 'entry', 'position_id', p1, 'brigade_id', br, 'date', today, 'qty', 1)));
  res := res || pg_temp.t(t like '42501%', 'чужая компания — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_submit(%L, %L)', c4, jsonb_build_object('kind', 'batch', 'project_id', pa, 'brigade_id', br, 'date', today,
         'items', jsonb_build_array(jsonb_build_object('position_id', p1, 'qty', 1)))));
  res := res || pg_temp.t(t like '42501%', 'чужая компания: пачка — отказ (' || t || ')');
  perform pg_temp.as_user(uiv);
  t := pg_temp.err(format('select public.pf_fact_submit(%L, %L)', c4, jsonb_build_object('kind', 'entry', 'position_id', p1, 'brigade_id', br, 'date', today + 1, 'qty', 1)));
  res := res || pg_temp.t(t like '22023%будущем%', 'будущая дата — отказ (' || t || ')');
  reset role;
  res := res || pg_temp.t(pg_temp.subs(c4) = 0, 'отказы — номер не занят');
  perform pg_temp.as_user(null);
  t := pg_temp.err(format('select public.pf_fact_submit(%L, %L)', c9, jsonb_build_object('kind', 'entry', 'position_id', p1, 'brigade_id', br, 'date', today, 'qty', 1)));
  res := res || pg_temp.t(t like '42501%', 'без входа — отказ (' || t || ')');

  -- 5. чужой номер: Петров шлёт номер, уже принятый от Иванова → отказ, прежняя запись не видна
  perform pg_temp.as_user(upe);
  t := pg_temp.err(format('select public.pf_fact_submit(%L, %L)', c1, jsonb_build_object('kind', 'entry', 'position_id', p3, 'brigade_id', br, 'date', today, 'qty', 1)));
  res := res || pg_temp.t(t like '42501%занят%', 'чужой номер — отказ (' || t || ')');
  reset role;
  res := res || pg_temp.t(pg_temp.cnt(p3) = 0, 'чужой номер — записи нет');

  -- 6. «за кого»: РП за Иванова — одна запись и пачка, повтор без дубля
  perform pg_temp.as_user(upm);
  j := public.pf_fact_submit(c5, jsonb_build_object('kind', 'entry', 'position_id', p2, 'brigade_id', br, 'date', today, 'qty', 5, 'on_behalf', uiv));
  j2 := public.pf_fact_submit(c5, jsonb_build_object('kind', 'entry', 'position_id', p2, 'brigade_id', br, 'date', today, 'qty', 5, 'on_behalf', uiv));
  res := res || pg_temp.t(j ? 'id' and j2 ->> 'id' = j ->> 'id', 'за кого: повтор — прежний ответ (' || j::text || ')');
  j := public.pf_fact_submit(c6, jsonb_build_object('kind', 'batch', 'project_id', pa, 'brigade_id', br, 'date', today, 'on_behalf', uiv,
         'items', jsonb_build_array(jsonb_build_object('position_id', p1, 'qty', 2))));
  perform public.pf_fact_submit(c6, jsonb_build_object('kind', 'batch', 'project_id', pa, 'brigade_id', br, 'date', today, 'on_behalf', uiv,
         'items', jsonb_build_array(jsonb_build_object('position_id', p1, 'qty', 2))));
  reset role;
  res := res || pg_temp.t(pg_temp.cnt(p2) = 2 and pg_temp.cnt(p1) = 4, 'за кого: без дублей (' || pg_temp.cnt(p2) || '/' || pg_temp.cnt(p1) || ')');
  res := res || pg_temp.t((select count(*) from planfact.fact_entries where on_behalf_of = uiv) = 2, 'за кого: отмечено за Иванова');

  -- 7. «Закрыть через РП» пачкой; позиция снята в новой редакции — отказ
  perform pg_temp.as_user(uiv);
  j := public.pf_fact_submit(c7, jsonb_build_object('kind', 'batch', 'project_id', pa, 'brigade_id', br, 'date', today, 'require_approval', true,
         'items', jsonb_build_array(jsonb_build_object('position_id', p1, 'qty', 1))));
  res := res || pg_temp.t((j ->> 'pending')::int = 1 and (j ->> 'accepted')::int = 0, 'через РП — на проверку (' || j::text || ')');

  -- 8. неверная запись: нет вида, нет номера, нет позиции — отказ с причиной
  t := pg_temp.err(format('select public.pf_fact_submit(%L, %L)', c8, '{"kind":"x"}'));
  res := res || pg_temp.t(t like '22023%', 'неизвестный вид — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_submit(null, %L)', jsonb_build_object('kind', 'entry', 'position_id', p1, 'brigade_id', br, 'date', today, 'qty', 1)));
  res := res || pg_temp.t(t like '22023%', 'без номера — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_submit(%L, %L)', c8, jsonb_build_object('kind', 'entry', 'position_id', gen_random_uuid(), 'brigade_id', br, 'date', today, 'qty', 1)));
  res := res || pg_temp.t(t like '22023%Позиция не найдена%', 'нет позиции — отказ (' || t || ')');

  -- 9. прежние вызовы без номера — как раньше (каждый вызов — новая запись)
  j := public.pf_fact_add(p1, br, today, 1);
  j2 := public.pf_fact_add(p1, br, today, 1);
  res := res || pg_temp.t(j ->> 'id' <> j2 ->> 'id', 'pf_fact_add без номера — работает как раньше');
  j := public.pf_fact_add_batch(pa, br, today, jsonb_build_array(jsonb_build_object('position_id', p2, 'qty', 1)));
  res := res || pg_temp.t((j ->> 'accepted')::int + (j ->> 'pending')::int = 1, 'pf_fact_add_batch без номера — работает');
  reset role;

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
