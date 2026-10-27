-- P2-0054 (048): места ведёт ядро. Новый проект (ядро): объект «Школа» / «Детский сад», заполнение, этажи, копия секции,
-- переименование, удаление — зеркалом в Качество (id узла = id места, без петли); прямая запись структуры узлов проекта ядра —
-- отказ сервера (синонимы, порядок, узел-проект — можно); переименование проекта не теряет места; замечание СК 2.0 по месту ядра —
-- с проектом. Проект 'quality' — поведение 044 (перенос Качество → ядро, отказ План/Факту, зеркала нет). Компания без Качества,
-- чужая компания, аноним. Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 048_core_places_up.sql.
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.msg(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ' ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
create or replace function pg_temp.node(c uuid, nid text, parent text, typ text, nm text, ord int default 0) returns void language sql as $f$
  insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id)
  values (nid, parent, typ, nm, lower(nm), ord, c) $f$;
-- узел Качества места ядра (мимо правил строк — проверка из теста)
create or replace function pg_temp.qn(l uuid) returns quality.location_nodes language sql security definer as $f$
  select n.* from quality.location_nodes n where n.core_location_id = l $f$;
-- расхождения дерева проекта: живые места без живого узла с тем же родителем и названием + живые узлы без живого места
create or replace function pg_temp.diff(p uuid) returns int language sql security definer as $f$
  select (select count(*)::int from core.locations l
           where l.project_id = p and l.deleted_at is null
             and not exists (select 1 from quality.location_nodes n
                              where n.core_location_id = l.id and not n.is_deleted and n."displayName" = l.name
                                and n."parentId" = coalesce((select x.id from quality.location_nodes x where x.core_location_id = l.parent_id),
                                                            quality.project_root_node(p))))
       + (select count(*)::int from quality.location_nodes n join core.locations l on l.id = n.core_location_id
           where l.project_id = p and not n.is_deleted and l.deleted_at is not null) $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); ueng uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); cc uuid := gen_random_uuid();
  r_adm uuid; r_eng uuid; r_b uuid; r_c uuid;
  pn uuid := gen_random_uuid(); pc uuid := gen_random_uuid(); pq uuid; pp uuid;
  osch uuid := gen_random_uuid(); okg uuid := gen_random_uuid(); s1 uuid; s2 uuid; f1 uuid; a1 uuid; scopy uuid := gen_random_uuid();
  root text; nd quality.location_nodes; res text := ''; cnt int; cnt2 int; str text; v int;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, ueng, ub, uc]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 048', true), (cb, 'Бета 048', true), (cc, 'Без Качества 048', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, ueng), (cb, ub), (cc, uc);
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction', 'planfact']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_modules(company_id, module, enabled) values (cc, 'planfact', true)
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_modules(company_id, module, enabled) values (cc, 'quality', false), (cc, 'construction', false)
    on conflict (company_id, module) do update set enabled = false;
  insert into core.company_roles(company_id, name) values (ca, 'Админ 048') returning id into r_adm;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер 048') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (cb, 'Админ Б 048') returning id into r_b;
  insert into core.company_roles(company_id, name) values (cc, 'Админ В 048') returning id into r_c;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_adm, ca, a from unnest(array['planfact.projects.manage', 'quality.view', 'quality.objects.manage', 'construction.view',
                                        'construction.edit', 'construction.objects.manage']) a
  union all select r_eng, ca, a from unnest(array['quality.view', 'construction.view', 'construction.edit', 'construction.objects.manage']) a
  union all select r_b, cb, a from unnest(array['planfact.projects.manage', 'construction.view', 'construction.objects.manage']) a
  union all select r_c, cc, 'planfact.projects.manage';
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, uadm, r_adm, null), (ca, ueng, r_eng, null), (cb, ub, r_b, null), (cc, uc, r_c, null);

  -- 0. Справочник: новые виды объектов
  res := res || pg_temp.t((select string_agg(code, ',' order by sort_order) from core.object_kinds)
                          = 'building,parking,networks,landscaping,kindergarten,school,other', 'виды объектов: + детский сад, школа');

  -- 1. Новый проект (ядро): узел-проект Качества есть, места ведёт ядро
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_project(ca, pn, '{"name": "ЖК Новый 048"}');
  reset role;
  root := quality.project_root_node(pn);
  res := res || pg_temp.t(root is not null, 'новый проект — узел-проект в Качестве');
  res := res || pg_temp.t((select places_master from core.projects where id = pn) = 'core' and not quality.places_led_by_quality(pn),
                          'новый проект — места ведёт ядро');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(not public.pf_locations_from_quality(pn), 'pf_locations_from_quality = нет');
  str := pg_temp.msg(format($q$select public.pf_save_place(%L, %L, null, 'object', 'Школа', 'school')$q$, pn, osch));
  res := res || pg_temp.t(str = 'OK', 'объект «Школа» заводится (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_save_place(%L, %L, null, 'object', 'Детский сад', 'kindergarten')$q$, pn, okg));
  res := res || pg_temp.t(str = 'OK', 'объект «Детский сад» заводится (' || str || ')');
  reset role;
  nd := pg_temp.qn(osch);
  res := res || pg_temp.t(nd.id = osch::text and nd."nodeType" = 'building' and nd."parentId" = root and nd."displayName" = 'Школа'
                          and not nd.is_deleted and nd.core_company_id = ca, 'зеркало: объект — узел "building" под узлом-проектом, id = id места');

  -- 2. Заполнить объект, добавить этажи, копировать секцию
  perform pg_temp.as_user(uadm, ca);
  v := public.pf_fill_object(osch, 2, 3, 2);
  select id into s1 from core.locations where parent_id = osch and deleted_at is null order by sort_order limit 1;
  select id into s2 from core.locations where parent_id = osch and deleted_at is null order by sort_order offset 1 limit 1;
  perform public.pf_add_floors(array[s1, s2], 4, 5, 1);
  perform public.pf_copy_place(s1, scopy, 'Секция 3');
  reset role;
  select count(*) into cnt from core.locations where project_id = pn and deleted_at is null;
  select count(*) into cnt2 from quality.location_nodes n where n.core_company_id = ca and not n.is_deleted and n.core_location_id is not null
     and exists (select 1 from core.locations l where l.id = n.core_location_id and l.project_id = pn);
  res := res || pg_temp.t(v > 0 and cnt > 20 and cnt = cnt2, 'заполнение / этажи / копия — все места в Качестве (' || cnt || ' / ' || cnt2 || ')');
  res := res || pg_temp.t(pg_temp.diff(pn) = 0, 'дерево Качества = дереву ядра (' || pg_temp.diff(pn) || ')');
  select id into f1 from core.locations where parent_id = s1 and deleted_at is null order by sort_order limit 1;
  select id into a1 from core.locations where parent_id = f1 and deleted_at is null order by sort_order limit 1;
  nd := pg_temp.qn(a1);
  res := res || pg_temp.t(nd.id = a1::text and nd."nodeType" = 'apartment' and nd."parentId" = f1::text, 'квартира: тип и родитель');
  res := res || pg_temp.t((select count(*) from quality.location_nodes where core_company_id = ca and core_location_id is null and "nodeType" <> 'object') = 0,
                          'петли нет: узлов без места ядра не появилось');

  -- 3. Переименование: одна запись в каждой таблице
  select version into v from quality.location_nodes where core_company_id = ca and id = a1::text;
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_place(pn, a1, null, null, 'Кв. 1А');
  reset role;
  nd := pg_temp.qn(a1);
  res := res || pg_temp.t(nd."displayName" = 'Кв. 1А' and nd.version = v + 1, 'переименование — в Качестве, ровно одна правка узла');
  res := res || pg_temp.t((select count(*) from core.locations where project_id = pn and name = 'Кв. 1А') = 1, 'переименование — без дубля в ядре');

  -- 4. Удаление ветки
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_remove_place(s2);
  reset role;
  select count(*) into cnt from core.locations l join quality.location_nodes n on n.core_location_id = l.id
   where l.project_id = pn and l.deleted_at is not null and n.is_deleted;
  select count(*) into cnt2 from core.locations where project_id = pn and deleted_at is not null;
  res := res || pg_temp.t(cnt2 > 0 and cnt = cnt2, 'удаление секции — узлы ветки удалены (' || cnt || ' / ' || cnt2 || ')');
  res := res || pg_temp.t(pg_temp.diff(pn) = 0, 'после удаления деревья совпадают');

  -- 5. Прямая запись структуры в Качестве — отказ; синонимы, порядок, узел-проект — можно
  perform pg_temp.as_user(ueng, ca);
  str := pg_temp.msg(format($q$insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order)
                               values ('hack-048', %L, 'apartment', 'Кв. взлом', '', 9)$q$, f1));
  res := res || pg_temp.t(str like '42501 Места ведутся в «Компания → Объекты и места»%', 'Качество: создать место — отказ (' || str || ')');
  str := pg_temp.msg(format($q$insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order)
                               values ('hack2-048', %L, 'building', 'Корпус взлом', '', 9)$q$, root));
  res := res || pg_temp.t(str like '42501 Места ведутся%', 'Качество: корпус под узлом-проектом — отказ (' || str || ')');
  str := pg_temp.msg(format($q$update quality.location_nodes set "displayName" = 'Взлом' where id = %L$q$, a1));
  res := res || pg_temp.t(str like '42501 Места ведутся%', 'Качество: переименовать — отказ');
  str := pg_temp.msg(format($q$update quality.location_nodes set "parentId" = %L where id = %L$q$, scopy, f1));
  res := res || pg_temp.t(str like '42501 Места ведутся%', 'Качество: перенести — отказ');
  str := pg_temp.msg(format($q$update quality.location_nodes set is_deleted = true, deleted_at = now() where id = %L$q$, a1));
  res := res || pg_temp.t(str like '42501 Места ведутся%', 'Качество: удалить пометкой — отказ');
  str := pg_temp.msg(format($q$delete from quality.location_nodes where id = %L$q$, a1));
  res := res || pg_temp.t(str like '42501 Места ведутся%', 'Качество: стереть — отказ');
  str := pg_temp.msg(format($q$update quality.location_nodes set "nodeType" = 'floor' where id = %L$q$, a1));
  res := res || pg_temp.t(str like '42501 Места ведутся%', 'Качество: сменить тип — отказ');
  str := pg_temp.msg(format($q$update quality.location_nodes set core_location_id = null where id = %L$q$, a1));
  res := res || pg_temp.t(str like '42501 Места ведутся%', 'Качество: отвязать от места ядра — отказ');
  str := pg_temp.msg(format($q$update quality.location_nodes set synonyms = '["кв 1а"]', sort_order = 7, updated_at = now() where id = %L$q$, a1));
  res := res || pg_temp.t(str = 'OK', 'Качество: синонимы и порядок — можно (' || str || ')');
  -- старая офлайн-правка: тот же узел целиком с прежним названием — отказ; без изменений структуры — проходит
  str := pg_temp.msg(format($q$insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id)
                               values (%L, %L, 'apartment', 'Кв. 1', '', 7, %L)
                               on conflict (core_company_id, id) do update set "displayName" = excluded."displayName"$q$, a1, f1, ca));
  res := res || pg_temp.t(str like '42501 Места ведутся%', 'офлайн-правка названия (повтор записи) — отказ');
  str := pg_temp.msg(format($q$insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id)
                               values (%L, %L, 'apartment', 'Кв. 1А', '', 7, %L)
                               on conflict (core_company_id, id) do update set "displayName" = excluded."displayName", updated_at = now()$q$, a1, f1, ca));
  res := res || pg_temp.t(str = 'OK', 'повтор записи без изменений структуры — проходит (' || str || ')');
  reset role;
  res := res || pg_temp.t(pg_temp.diff(pn) = 0 and (pg_temp.qn(a1))."displayName" = 'Кв. 1А', 'после отказов деревья совпадают');

  -- 6. Переименование проекта (узел-проект, синонимы) — места не теряются ни в ядре, ни в Качестве
  select count(*) into cnt from core.locations where project_id = pn and deleted_at is null;
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_project(ca, pn, '{"name": "ЖК Новый 048 (2)"}');
  reset role;
  res := res || pg_temp.t((select count(*) from core.locations where project_id = pn and deleted_at is null) = cnt and pg_temp.diff(pn) = 0
                          and quality.project_root_node(pn) = root, 'переименование проекта — места на месте');
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.msg(format($q$update quality.location_nodes set "displayName" = 'ЖК Новый 048 (3)', synonyms = '["жк новый"]' where id = %L$q$, root));
  res := res || pg_temp.t(str = 'OK', 'узел-проект в Качестве правится как раньше (' || str || ')');
  reset role;
  res := res || pg_temp.t((select count(*) from core.locations where project_id = pn and deleted_at is null) = cnt and pg_temp.diff(pn) = 0,
                          'правка узла-проекта в Качестве — места ядра не тронуты');

  -- 7. Замечание и приёмка СК 2.0 по месту ядра — с проектом; видимость
  insert into quality.construction_defects_v2(id, "locationId", status, core_company_id) values ('d1-m48', a1::text, 'issued', ca);
  insert into quality.construction_acceptance_v2(id, "locationId", core_company_id) values ('a1-m48', f1::text, ca);
  res := res || pg_temp.t((select core_project_id from quality.construction_defects_v2 where id = 'd1-m48') = pn
                          and (select core_project_id from quality.construction_acceptance_v2 where id = 'a1-m48') = pn,
                          'замечание и приёмка по месту ядра — проект проставлен');
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t((select count(*) from quality.location_nodes where id = a1::text) = 1, 'инженер видит место ядра в Качестве');
  reset role;

  -- 8. Проект 'quality' (как RBI до перевода): поведение 044, зеркала нет
  perform pg_temp.node(ca, 'obj-q48', null, 'object', 'ЖК Старый 048');
  select quality.node_root_project(x) into pq from quality.location_nodes x where x.core_company_id = ca and x.id = 'obj-q48';
  update core.projects set places_master = 'quality' where id = pq;
  perform pg_temp.node(ca, 'qb1', 'obj-q48', 'building', 'Корпус 1', 1);
  perform pg_temp.node(ca, 'qs1', 'qb1', 'section', 'Секция 1', 1);
  res := res || pg_temp.t(quality.places_led_by_quality(pq)
                          and (select count(*) from core.locations l join quality.location_nodes x on x.core_location_id = l.id
                                where l.project_id = pq and l.deleted_at is null and x.id in ('qb1', 'qs1')) = 2,
                          'проект Качества: узлы → места ядра (044)');
  update quality.location_nodes set "displayName" = 'Секция 1 (новая)' where core_company_id = ca and id = 'qs1';
  res := res || pg_temp.t((select l.name from core.locations l join quality.location_nodes x on x.core_location_id = l.id
                            where x.core_company_id = ca and x.id = 'qs1') = 'Секция 1 (новая)', 'проект Качества: переименование → ядро');
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.msg(format($q$select public.pf_save_place(%L, %L, null, 'object', 'Корпус ПФ', 'building')$q$, pq, gen_random_uuid()));
  res := res || pg_temp.t(str like '42501 Места этого объекта ведутся в Качестве%', 'проект Качества: правка в Компании — отказ (' || str || ')');
  reset role;
  res := res || pg_temp.t((select count(*) from quality.location_nodes x join core.locations l on l.id::text = x.id where l.project_id = pq) = 0,
                          'проект Качества: зеркальных узлов нет');

  -- 9. Компания без Качества: места заводятся, узлов Качества нет
  perform pg_temp.as_user(uc, cc);
  perform public.pf_save_project(cc, pc, '{"name": "ЖК Без Качества 048"}');
  pp := gen_random_uuid();
  str := pg_temp.msg(format($q$select public.pf_save_place(%L, %L, null, 'object', 'Корпус 1', 'building')$q$, pc, pp));
  reset role;
  res := res || pg_temp.t(str = 'OK' and (select count(*) from quality.location_nodes where core_company_id = cc) = 0,
                          'без Качества: место заведено, в Качество не уходит (' || str || ')');

  -- 10. Чужая компания и аноним
  perform pg_temp.as_user(ub, cb);
  str := pg_temp.msg(format($q$select public.pf_save_place(%L, %L, null, 'object', 'Чужой', 'school')$q$, pn, gen_random_uuid()));
  res := res || pg_temp.t(str like '42501%', 'чужая компания: завести место — отказ (' || str || ')');
  str := pg_temp.msg(format($q$select count(*) from public.pf_project_places(%L)$q$, pn));
  res := res || pg_temp.t(str like '42501%', 'чужая компания: места проекта — отказ');
  res := res || pg_temp.t((select count(*) from quality.location_nodes where core_company_id = ca) = 0, 'чужая компания: узлов Альфы не видно');
  str := pg_temp.msg(format($q$update quality.location_nodes set "displayName" = 'x' where core_company_id = %L$q$, ca));
  res := res || pg_temp.t(str = 'OK' and (pg_temp.qn(a1))."displayName" = 'Кв. 1А', 'чужая компания: правка узлов Альфы — ни одной строки');
  reset role;
  perform pg_temp.as_user(null, ca);
  str := pg_temp.msg(format($q$select public.pf_save_place(%L, %L, null, 'object', 'Аноним', 'school')$q$, pn, gen_random_uuid()));
  res := res || pg_temp.t(str like '42501%', 'аноним: завести место — отказ (' || str || ')');
  reset role;
  res := res || pg_temp.t(not exists (select 1 from unnest(array['quality.node_core_project(uuid,text)', 'quality.project_root_node(uuid)',
                            'quality.mirror_place(uuid,integer)', 'quality.core_place_mirror()', 'quality.nodes_core_guard()']) f,
                            unnest(array['anon', 'authenticated']) r where has_function_privilege(r, f::regprocedure, 'execute')),
                          'служебные функции 048 — не вызываются ни анонимом, ни пользователем');

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
