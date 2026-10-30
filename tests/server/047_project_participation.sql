-- P2-0048 (047): участие в проекте — назначение до места, «ответственный за факт», права План/Факта по области, «за кого»,
-- «Изменить область» без отзыва, привязка и перепривязка инженера Качества, старые назначения — как прежде, изоляция компаний.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 047_project_participation_up.sql.
-- P2-0071 (053): мост «объекты Качества» снят — у назначения нет объектов Качества, роль Качества назначается на объект,
-- объекты Качества при назначении — отказ; проверки План/Факта и области не менялись.
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
-- позиции, которые видит текущий пользователь в списке ВОР (через запятую, по номеру строки)
create or replace function pg_temp.vis(p uuid, imp uuid) returns text language sql security definer as $f$   -- номера строк — мимо правил строк; список позиций — от имени пользователя (auth.uid)
  select coalesce(string_agg(s.row_no::text, ',' order by s.row_no), '')
    from public.pf_vor_positions(p) v join planfact.vor_links l on l.position_id = v.id
    join planfact.vor_source_rows s on s.id = l.source_row_id and s.import_id = imp $f$;

-- назначения — чтение мимо правил строк (проверка из теста)
create or replace function pg_temp.ra() returns setof core.role_assignments language sql security definer as $f$
  select * from core.role_assignments $f$;
do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); upm uuid := gen_random_uuid();
  uiv uuid := gen_random_uuid(); upe uuid := gen_random_uuid(); uap uuid := gen_random_uuid(); uqe uuid := gen_random_uuid();
  ubadm uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); pa uuid; pb uuid;
  r_adm uuid; r_pto uuid; r_for uuid; r_pm uuid; r_qe uuid; r_badm uuid;
  bld uuid; s1 uuid; s2 uuid; s3 uuid; f1 uuid; wt uuid; m2 uuid; imp uuid; br uuid; p1 uuid; p2 uuid; p3 uuid;
  o1 text := 'obj-1-047'; o2 text := 'obj-2-047';
  j jsonb; t text; n int; v_id uuid; v_id2 uuid; e record; res text := '';
  today date := (now() at time zone 'Europe/Moscow')::date;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, upto, ufor, upm, uiv, upe, uap, uqe, ubadm]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 047', true), (cb, 'Бета 047', true);
  insert into core.company_members(company_id, user_id) select ca, u from unnest(array[uadm, upto, ufor, upm, uiv, upe, uap, uqe]) u
    union all select cb, ubadm;
  insert into core.user_profiles(user_id, full_name) values (uiv, 'Иванов И.'), (upe, 'Петров П.');
  select id into r_adm from core.company_roles where company_id = ca and template_code = 'company_admin';
  select id into r_pto from core.company_roles where company_id = ca and template_code = 'pto';
  select id into r_for from core.company_roles where company_id = ca and template_code = 'foreman';
  select id into r_pm from core.company_roles where company_id = ca and template_code = 'project_manager';
  select id into r_badm from core.company_roles where company_id = cb and template_code = 'company_admin';
  insert into core.company_roles(company_id, name) values (ca, 'Инженер качества 047') returning id into r_qe;
  insert into core.company_role_permissions(role_id, company_id, action)
    select r_qe, ca, a from unnest(array['quality.view', 'quality.edit', 'construction.view', 'construction.edit']) a;
  insert into core.role_assignments(company_id, user_id, role_id, project_id)
    values (ca, uadm, r_adm, null), (ca, upto, r_pto, null), (ca, ufor, r_for, null), (cb, ubadm, r_badm, null);
  select id into m2 from core.units where company_id is null and code = 'м²';

  -- схема
  res := res || pg_temp.t((select count(*) from information_schema.columns where table_schema = 'core' and table_name = 'role_assignments'
                           and column_name in ('location_id', 'fact_owner')) = 2, 'у назначения есть место и «ответственный за факт»');
  res := res || pg_temp.t((select array_agg(action order by action) from core.permission_catalog where area_scoped and action like 'planfact.%')
                          = array['planfact.checklist.create', 'planfact.checklist.view', 'planfact.fact.approve', 'planfact.fact.create',
                                  'planfact.fact.view', 'planfact.works.view'], 'права «по местам» — данные каталога');
  res := res || pg_temp.t(not has_function_privilege('anon', 'public.pf_set_participation(uuid[],uuid,uuid,uuid[],boolean,timestamptz,text[],uuid)', 'execute')
                          and has_function_privilege('authenticated', 'public.pf_set_participation(uuid[],uuid,uuid,uuid[],boolean,timestamptz,text[],uuid)', 'execute'),
                          'pf_set_participation — только authenticated');
  res := res || pg_temp.t(not has_function_privilege('authenticated', 'planfact.require_fact_place(uuid,uuid,uuid,boolean)', 'execute')
                          and not has_function_privilege('authenticated', 'planfact.place_fact_owners(uuid,uuid)', 'execute')
                          and not has_function_privilege('anon', 'public.pf_fact_add_for(uuid,uuid,uuid,date,numeric,integer,numeric,text,date)', 'execute'),
                          'служебные — не вызываются клиентом');
  res := res || pg_temp.t(to_regprocedure('public.pf_fact_add(uuid,uuid,date,numeric,integer,numeric,text,date)') is not null
                          and to_regprocedure('public.pf_fact_add_batch(uuid,uuid,date,jsonb,integer,text,boolean)') is not null,
                          'прежние pf_fact_add / pf_fact_add_batch — с прежней подписью (старое приложение работает)');

  -- проект: корпус → секции 1, 2, 3; этаж в секции 1; ВОР: строка 1 — этаж секции 1, строка 2 — секция 2, строка 3 — секция 3
  perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Альфа 047');
  bld := public.pf_add_location(pa, null, 'building', 'Корпус 1');
  s1 := public.pf_add_location(pa, bld, 'section', 'Секция 1');
  s2 := public.pf_add_location(pa, bld, 'section', 'Секция 2');
  s3 := public.pf_add_location(pa, bld, 'section', 'Секция 3');
  f1 := public.pf_add_location(pa, s1, 'floor', '1 этаж');
  br := public.pf_brigade_save(ca, null, 'Бригада 047', null, null);
  perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка', m2);
  imp := public.pf_vor_create_import(pa, 'вор-047.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'kind', 'work', 'name', 'Строка ' || g,
    'unit_text', 'м2', 'qty', 100)) from unnest(array[1, 2, 3]) g));
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(
    jsonb_build_object('row_no', 1, 'location_id', f1, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 2, 'location_id', s2, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 3, 'location_id', s3, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp);
  p1 := pg_temp.pos(imp, 1); p2 := pg_temp.pos(imp, 2); p3 := pg_temp.pos(imp, 3);
  reset role;
  -- Качество включается после мест План/Факта (иначе места объекта ведёт Качество)
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  perform set_config('quality.object_sync', '1', true);
  insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id) values
    (o1, 'объект 1 047', 'Объект 1', '{}', ca), (o2, 'объект 2 047', 'Объект 2', '{}', ca);
  perform set_config('quality.object_sync', '', true);

  -- назначения (админ): Иванов — прораб, секции 1–2, ответственный за факт; Петров — прораб, секция 3; РП — весь проект;
  -- «РП по секции 1» — роль РП на часть проекта
  perform pg_temp.as_user(uadm);
  j := public.pf_set_participation(array[uiv], r_for, pa, array[s1, s2], true);
  res := res || pg_temp.t(j = '{"added": 2, "changed": 0, "revoked": 0}', 'Иванов: два места одним вызовом (' || j::text || ')');
  j := public.pf_set_participation(array[upe], r_for, pa, array[s3]);
  res := res || pg_temp.t((j ->> 'added')::int = 1, 'Петров: секция 3');
  j := public.pf_set_participation(array[upm], r_pm, pa);
  res := res || pg_temp.t((j ->> 'added')::int = 1, 'РП: весь проект');
  j := public.pf_set_participation(array[uap], r_pm, pa, array[s1]);
  res := res || pg_temp.t((j ->> 'added')::int = 1, 'РП на секцию 1');
  j := public.pf_set_participation(array[uiv], r_for, pa, array[s1, s2], true);
  res := res || pg_temp.t(j = '{"added": 0, "changed": 0, "revoked": 0}', 'повтор того же — без изменений (' || j::text || ')');
  reset role;
  res := res || pg_temp.t((select count(*) from core.audit_log where table_name = 'role_assignments' and new_data ->> 'user_id' = uiv::text
                           and action = 'ASSIGN') = 2, 'журнал: два назначения Иванова');
  res := res || pg_temp.t((select bool_and(quality_objects is null) from pg_temp.ra() where user_id = uiv),
                          'P2-0071: мост снят — у назначения на проект объектов Качества нет');
  perform pg_temp.as_user(uadm);
  -- пакет: 3 сотрудника × 2 места
  j := public.pf_set_participation(array[uiv, upe, uap], r_pto, pa, array[s2, s3]);
  res := res || pg_temp.t((j ->> 'added')::int = 6, 'пакет 3 × 2 — шесть назначений (' || j::text || ')');
  j := public.pf_set_participation(array[uiv, upe, uap], r_pto, pa, array[s2]);
  res := res || pg_temp.t(j = '{"added": 0, "changed": 0, "revoked": 3}', 'пакет: убрали секцию 3 — три отзыва (' || j::text || ')');
  perform public.pf_set_participation(array[uiv, upe, uap], r_pto, pa, array[]::uuid[]);
  perform public.pf_set_participation(array[uiv, upe, uap], r_pto, pa, array[s1]);
  reset role;
  update core.role_assignments set revoked_at = now() where role_id = r_pto and user_id in (uiv, upe, uap) and revoked_at is null;
  perform pg_temp.as_user(uadm);
  -- ошибки ввода
  t := pg_temp.err(format('select public.pf_set_participation(%L, %L, null, %L)', array[uiv], r_for, array[s1]));
  res := res || pg_temp.t(t like '22023%внутри проекта%', 'места без проекта — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_set_participation(%L, %L, null, null, true)', array[uiv], r_for));
  res := res || pg_temp.t(t like '22023%Ответственный за факт%', 'ответственный без проекта — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_set_participation(%L, %L, %L)', array[uadm], r_for, pa));
  res := res || pg_temp.t(t like '42501%самому себе%', 'себе — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_set_participation(%L, %L, %L)', array[uqe], r_qe, pa));
  res := res || pg_temp.t(t = 'OK', 'P2-0071: роль только Качества — на проект (' || t || ')');
  t := pg_temp.err(format('select public.pf_set_participation(%L, %L, %L, %L)', array[uiv], r_for, pa, array[gen_random_uuid()]));
  res := res || pg_temp.t(t like '22023%Место не найдено%', 'чужое место — отказ (' || t || ')');
  -- список сотрудников показывает место и «ответственного»
  res := res || pg_temp.t((select string_agg(location_path || ':' || fact_owner, ';' order by location_path) from public.pf_list_company_members(ca)
                           where user_id = uiv and assignment_id is not null) = 'Корпус 1 · Секция 1:true;Корпус 1 · Секция 2:true',
                          'список: места Иванова и «ответственный» — ' || coalesce((select string_agg(location_path || ':' || fact_owner, ';')
                            from public.pf_list_company_members(ca) where user_id = uiv), 'нет'));

  -- видимость
  perform pg_temp.as_user(uiv);
  res := res || pg_temp.t(pg_temp.vis(pa, imp) = '1,2', 'Иванов: в ВОР строки 1, 2 (' || pg_temp.vis(pa, imp) || ')');
  res := res || pg_temp.t((select count(*) from public.pf_fact_positions(pa)) = 2, 'Иванов: факт — две позиции');
  res := res || pg_temp.t((select count(*) from planfact.vor_positions where project_id = pa) = 2, 'Иванов: прямой запрос к позициям — две');
  res := res || pg_temp.t((select string_agg(name, ',' order by name) from public.pf_list_locations(pa, bld)) = 'Секция 1,Секция 2',
                          'Иванов: в дереве секции 1, 2 (' || coalesce((select string_agg(name, ',') from public.pf_list_locations(pa, bld)), '') || ')');
  res := res || pg_temp.t((select count(*) from public.pf_list_locations(pa)) = 1, 'Иванов: корпус виден (родитель своей секции)');
  res := res || pg_temp.t((select count(*) from public.pf_vor_list_imports(pa)) = 0 and (select count(*) from planfact.vor_imports where project_id = pa) = 0
                          and (select count(*) from planfact.vor_source_rows where project_id = pa) = 0,
                          'Иванов: загрузки ВОР (файлы и строки) не видны — их ведут ПТО и РП по всему проекту');
  t := pg_temp.err(format('select * from public.pf_vor_import_rows(%L)', imp));
  res := res || pg_temp.t(t like '22023%', 'Иванов: строки файла ВОР — отказ (' || t || ')');
  t := pg_temp.err(format('select * from public.pf_fact_history(%L)', p3));
  res := res || pg_temp.t(t like '42501%', 'Иванов: история позиции секции 3 — отказ (' || t || ')');
  res := res || pg_temp.t((select jsonb_build_array(j2 -> 'full', j2 -> 'can_on_behalf', jsonb_array_length(j2 -> 'fact_owner'))
                           from (select public.pf_my_area(pa) j2) x) = '[false, false, 2]', 'Иванов: pf_my_area — часть проекта, ответственный по двум местам');
  perform pg_temp.as_user(uap);
  res := res || pg_temp.t(not ('planfact.ks2.edit' = any (public.pf_my_permissions(pa))) and not ('planfact.money.view' = any (public.pf_my_permissions(pa)))
                          and 'planfact.fact.approve' = any (public.pf_my_permissions(pa)),
                          'РП на часть проекта: КС-2 и деньги — нет, подтверждение факта — да (' || array_to_string(public.pf_my_permissions(pa), ',') || ')');
  res := res || pg_temp.t(pg_temp.vis(pa, imp) = '1', 'РП на секцию 1: строка 1');
  perform pg_temp.as_user(upm);
  res := res || pg_temp.t(pg_temp.vis(pa, imp) = '1,2,3', 'РП проекта: все строки');
  res := res || pg_temp.t((select count(*) from public.pf_vor_list_imports(pa)) = 1, 'РП проекта: загрузки ВОР видны');
  res := res || pg_temp.t('planfact.ks2.edit' = any (public.pf_my_permissions(pa)) and 'planfact.money.view' = any (public.pf_my_permissions(pa)), 'РП проекта: КС-2 и деньги есть');
  perform pg_temp.as_user(ufor);
  res := res || pg_temp.t(pg_temp.vis(pa, imp) = '1,2,3', 'прораб на всю компанию (старое назначение): все строки');
  perform pg_temp.as_user(upto);
  res := res || pg_temp.t(pg_temp.vis(pa, imp) = '1,2,3' and public.pf_my_area(pa) ->> 'full' = 'true', 'ПТО на всю компанию: всё, область — весь проект');

  -- факт
  perform pg_temp.as_user(uiv);
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 5)', p1, br, today));
  res := res || pg_temp.t(t = 'OK', 'Иванов: факт по своей секции (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 5)', p3, br, today));
  res := res || pg_temp.t(t like '42501%вне вашей области%', 'Иванов: факт по секции 3 — отказ (' || t || ')');
  perform pg_temp.as_user(upe);
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 5)', p3, br, today));
  res := res || pg_temp.t(t = 'OK', 'Петров: секция 3 без ответственного — как сейчас (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 5)', p1, br, today));
  res := res || pg_temp.t(t like '42501%вне вашей области%', 'Петров: секция 1 — отказ');
  perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 5)', p2, br, today));
  res := res || pg_temp.t(t like '42501%вносит ответственный: Иванов И.%', 'прораб компании: место с ответственным — отказ с именем (' || t || ')');
  res := res || pg_temp.t(t not like '%..%', 'в отказе нет двойной точки после инициалов (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 5)', p3, br, today));
  res := res || pg_temp.t(t = 'OK', 'прораб компании: место без ответственного — как сейчас');
  t := pg_temp.err(format('select public.pf_fact_add_for(%L, %L, %L, %L, 5)', uiv, p2, br, today));
  res := res || pg_temp.t(t like '42501%только тот, кто подтверждает%', 'прораб «за кого» — отказ (' || t || ')');
  perform pg_temp.as_user(upm);
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 7)', p2, br, today));
  res := res || pg_temp.t(t like '42501%', 'РП без «за кого» по месту с ответственным — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_add_for(%L, %L, %L, %L, 7)', upe, p2, br, today));
  res := res || pg_temp.t(t like '22023%не отвечает%', 'РП за Петрова по секции 2 — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_add_for(%L, %L, %L, %L, 7)', uiv, p2, br, today));
  res := res || pg_temp.t(t = 'OK', 'РП за Иванова — принято (' || t || ')');
  res := res || pg_temp.t(coalesce(current_setting('planfact.on_behalf', true), '') = '', '«за кого» не остаётся после вызова');
  select * into e from planfact.fact_entries where position_id = p2 order by created_at desc limit 1;
  res := res || pg_temp.t(e.created_by = upm and e.on_behalf_of = uiv, 'автор — РП, «за кого» — Иванов');
  res := res || pg_temp.t((select on_behalf_email from public.pf_fact_history(p2) limit 1) = uiv || '@test.invalid'
                          and (select count(*) from public.pf_fact_journal(pa) where on_behalf_email is not null) = 1,
                          'история и журнал показывают «за кого»');
  reset role;
  res := res || pg_temp.t((select new_data ->> 'on_behalf_of' from core.audit_log where table_name = 'fact_entries' and record_id = e.id) = uiv::text,
                          'журнал изменений: «за кого»');
  perform pg_temp.as_user(upm);
  t := pg_temp.err(format('select public.pf_fact_add_batch_for(%L, %L, %L, %L, %L)', uiv, pa, br, today,
                          jsonb_build_array(jsonb_build_object('position_id', p1, 'qty', 1))));
  res := res || pg_temp.t(t = 'OK', 'РП пачкой за Иванова — принято (' || t || ')');
  t := pg_temp.err(format('update planfact.fact_entries set on_behalf_of = null where id = %L', e.id));
  res := res || pg_temp.t(t <> 'OK', '«за кого» изменить нельзя');
  perform pg_temp.as_user(uiv);
  res := res || pg_temp.t((select count(*) from public.pf_fact_journal(pa)) = 3, 'Иванов: в журнале только свои секции (' || (select count(*) from public.pf_fact_journal(pa)) || ')');
  res := res || pg_temp.t((select count(*) from planfact.fact_entries where project_id = pa) = 3, 'Иванов: прямой запрос к факту — только свои секции');
  perform pg_temp.as_user(upm);
  res := res || pg_temp.t((select count(*) from public.pf_fact_journal(pa)) = 5, 'РП: весь журнал (5)');

  -- «Изменить область» без отзыва: Иванов — только секция 2; затем без «ответственного»
  perform pg_temp.as_user(uadm);
  select id into v_id from pg_temp.ra() where user_id = uiv and location_id = s2 and revoked_at is null;
  j := public.pf_set_participation(array[uiv], r_for, pa, array[s2], true);
  res := res || pg_temp.t(j = '{"added": 0, "changed": 0, "revoked": 1}', 'Иванов: убрали секцию 1 (' || j::text || ')');
  j := public.pf_set_participation(array[uiv], r_for, pa, array[s2], false, now() + interval '30 days');
  res := res || pg_temp.t(j = '{"added": 0, "changed": 1, "revoked": 0}', 'Иванов: снят «ответственный», срок — изменено (' || j::text || ')');
  res := res || pg_temp.t((select id from pg_temp.ra() where user_id = uiv and revoked_at is null) = v_id, 'то же назначение, без отзыва');
  perform pg_temp.as_user(uiv);
  res := res || pg_temp.t(pg_temp.vis(pa, imp) = '2', 'Иванов: теперь только строка 2');
  perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select public.pf_fact_add(%L, %L, %L, 1)', p2, br, today));
  res := res || pg_temp.t(t = 'OK', 'ответственного нет — прораб компании вносит, как раньше');

  -- инженер качества (P2-0071: мост снят): участие на объект; объекты Качества не принимаются
  perform pg_temp.as_user(uadm);
  t := pg_temp.err(format('select public.pf_set_participation(%L, %L, null, null, false, null, %L)', array[uqe], r_qe, array[o1]));
  res := res || pg_temp.t(t like '22023%Объекты Качества больше не выбираются%', 'объекты Качества — отказ (' || t || ')');
  res := res || pg_temp.t((select count(*) from pg_temp.ra() where user_id = uqe and project_id = pa and revoked_at is null
                             and quality_objects is null) = 1, 'инженер качества — участие на объект, без объектов Качества');
  j := public.pf_set_participation(array[uqe], r_qe, pa);
  res := res || pg_temp.t(j = '{"added": 0, "changed": 0, "revoked": 0}', 'повтор — без изменений (' || j::text || ')');
  t := pg_temp.err(format('select public.pf_set_participation(%L, %L, %L, null, false, null, %L)', array[uiv], r_for, pa, array[o1]));
  res := res || pg_temp.t(t like '22023%Объекты Качества больше не выбираются%', 'объекты Качества при назначении на проект — отказ');

  -- срок, отзыв
  reset role;
  update core.role_assignments set valid_to = now() - interval '1 second' where user_id = upe and project_id = pa and revoked_at is null;
  perform pg_temp.as_user(upe);
  t := pg_temp.err(format('select * from public.pf_vor_positions(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'истёк срок — доступа нет (' || t || ')');
  perform pg_temp.as_user(uadm);
  perform public.pf_set_participation(array[uap], r_pm, pa, array[]::uuid[]);
  perform pg_temp.as_user(uap);
  res := res || pg_temp.t(pg_temp.vis(pa, imp) = '1,2,3', 'область заменена на весь проект — видно всё');

  -- изоляция
  perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select public.pf_set_participation(%L, %L, %L)', array[uiv], r_for, pa));
  res := res || pg_temp.t(t like '42501%', 'чужая компания: назначение — отказ (' || t || ')');
  t := pg_temp.err(format('select * from public.pf_vor_positions(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'чужая компания: позиции — отказ');
  res := res || pg_temp.t((select count(*) from planfact.vor_positions where project_id = pa) = 0
                          and (select count(*) from planfact.fact_entries where project_id = pa) = 0, 'чужая компания: прямой запрос — пусто');
  t := pg_temp.err(format('select * from public.pf_place_fact_owners(%L)', s2));
  res := res || pg_temp.t(t like '42501%', 'чужая компания: ответственные — отказ');
  perform pg_temp.as_user(uiv);
  t := pg_temp.err(format('select public.pf_set_participation(%L, %L, %L)', array[upe], r_for, pa));
  res := res || pg_temp.t(t like '42501%', 'прораб назначать не может');
  reset role;

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
