-- P2-0055 (049): редактор структуры. Перенос помещения на другой этаж и этажа в другую секцию того же объекта — глубина, порядок,
-- зеркало Качества (тот же узел, новый родитель), замечание и приёмка СК 2.0 — на месте; порядок «перед соседом» без дыр; повтор —
-- без изменений; отказы: другой объект, другой проект, своя ветка, глубже 6, занятое название, объект внутрь; копия в другой корпус —
-- новые строительные номера получателя, зеркало; прежний pf_copy_place(3 арг.); удаление → pf_restore_place — ветка своего действия,
-- узлы Качества живы; журнал MOVE / RESTORE; проект 'quality' не затронут; без Качества; чужая компания, роль без права, аноним.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 049_structure_editor_up.sql.
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
create or replace function pg_temp.qn(l uuid) returns quality.location_nodes language sql security definer as $f$
  select n.* from quality.location_nodes n where n.core_location_id = l $f$;
-- расхождения дерева проекта ядра и Качества (как в тесте 048) + узлы с порядком не как у места
create or replace function pg_temp.diff(p uuid) returns int language sql security definer as $f$
  select (select count(*)::int from core.locations l
           where l.project_id = p and l.deleted_at is null
             and not exists (select 1 from quality.location_nodes n
                              where n.core_location_id = l.id and not n.is_deleted and n."displayName" = l.name and n.sort_order = l.sort_order
                                and n."parentId" = coalesce((select x.id from quality.location_nodes x where x.core_location_id = l.parent_id),
                                                            quality.project_root_node(p))))
       + (select count(*)::int from quality.location_nodes n join core.locations l on l.id = n.core_location_id
           where l.project_id = p and not n.is_deleted and l.deleted_at is not null) $f$;
-- глубина места = глубина родителя + 1 по всему проекту (живые места)
create or replace function pg_temp.bad_depth(p uuid) returns int language sql security definer as $f$
  select count(*)::int from core.locations l left join core.locations pr on pr.id = l.parent_id
   where l.project_id = p and l.deleted_at is null and l.depth <> coalesce(pr.depth, 0) + 1 $f$;
-- порядок уровня: 1..n без дыр и повторов
create or replace function pg_temp.orders(par uuid) returns text language sql security definer as $f$
  select string_agg(sort_order::text, ',' order by sort_order, name, id) from core.locations where parent_id = par and deleted_at is null $f$;
create or replace function pg_temp.names(par uuid) returns text language sql security definer as $f$
  select string_agg(name, ',' order by sort_order, name, id) from core.locations where parent_id = par and deleted_at is null $f$;
create or replace function pg_temp.kid(par uuid, nm text) returns uuid language sql security definer as $f$
  select id from core.locations where parent_id = par and name = nm and deleted_at is null $f$;

-- каждое удаление на сервере — своя транзакция со своим now(); здесь весь тест — одна: даём удалённому только что своё время
create or replace function pg_temp.tick() returns void language plpgsql security definer as $f$
declare t timestamptz := clock_timestamp();
begin update core.locations set deleted_at = t where deleted_at = now(); end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); ueng uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); cc uuid := gen_random_uuid();
  r_adm uuid; r_eng uuid; r_b uuid; r_c uuid;
  pn uuid := gen_random_uuid(); pn2 uuid := gen_random_uuid(); pc uuid := gen_random_uuid(); pq uuid;
  k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid(); k3 uuid := gen_random_uuid(); kc uuid := gen_random_uuid();
  s1 uuid; s2 uuid; s1f1 uuid; s1f2 uuid; s1f3 uuid; s2f1 uuid; k2s1 uuid; k2f1 uuid; a1 uuid; ax uuid; ay uuid;
  o1 uuid := gen_random_uuid(); o2 uuid := gen_random_uuid(); o3 uuid := gen_random_uuid(); o4 uuid := gen_random_uuid();
  cp uuid := gen_random_uuid(); cp3 uuid := gen_random_uuid(); cpf uuid := gen_random_uuid(); sc1 uuid; sc2 uuid;
  nd quality.location_nodes; res text := ''; cnt int; cnt2 int; str text; v int; j jsonb; vers int; n_log int; dep int;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, ueng, ub, uc]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 049', true), (cb, 'Бета 049', true), (cc, 'Без Качества 049', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, ueng), (cb, ub), (cc, uc);
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction', 'planfact']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_modules(company_id, module, enabled) values (cc, 'planfact', true)
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_modules(company_id, module, enabled) values (cc, 'quality', false), (cc, 'construction', false)
    on conflict (company_id, module) do update set enabled = false;
  insert into core.company_roles(company_id, name) values (ca, 'Админ 049') returning id into r_adm;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер 049') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (cb, 'Админ Б 049') returning id into r_b;
  insert into core.company_roles(company_id, name) values (cc, 'Админ В 049') returning id into r_c;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_adm, ca, a from unnest(array['planfact.projects.manage', 'quality.view', 'construction.view', 'construction.edit']) a
  union all select r_eng, ca, a from unnest(array['quality.view', 'construction.view', 'construction.edit', 'construction.objects.manage']) a
  union all select r_b, cb, 'planfact.projects.manage'
  union all select r_c, cc, 'planfact.projects.manage';
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, uadm, r_adm, null), (ca, ueng, r_eng, null), (cb, ub, r_b, null), (cc, uc, r_c, null);

  -- 0. Проект ядра: Корпус 1 (2 секции × 3 этажа × 2 кв.), Корпус 2 (1 × 2 × 2), Корпус 3 (пустой); второй проект
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_project(ca, pn, '{"name": "ЖК Редактор 049"}');
  perform public.pf_save_project(ca, pn2, '{"name": "ЖК Другой 049"}');
  perform public.pf_save_place(pn, k1, null, 'object', 'Корпус 1', 'building');
  perform public.pf_save_place(pn, k2, null, 'object', 'Корпус 2', 'building');
  perform public.pf_save_place(pn, k3, null, 'object', 'Корпус 3', 'building');
  perform public.pf_save_place(pn2, kc, null, 'object', 'Корпус Д', 'building');
  perform public.pf_fill_object(k1, 2, 3, 2);
  perform public.pf_fill_object(k2, 1, 2, 2, 1, 'through', 101);
  reset role;
  s1 := pg_temp.kid(k1, 'Секция 1'); s2 := pg_temp.kid(k1, 'Секция 2'); k2s1 := pg_temp.kid(k2, 'Секция 1');
  s1f1 := pg_temp.kid(s1, 'эт. 1'); s1f2 := pg_temp.kid(s1, 'эт. 2'); s1f3 := pg_temp.kid(s1, 'эт. 3');
  s2f1 := pg_temp.kid(s2, 'эт. 1'); k2f1 := pg_temp.kid(k2s1, 'эт. 1');
  a1 := pg_temp.kid(s1f1, 'кв. 1');
  res := res || pg_temp.t(a1 is not null and s2f1 is not null and k2f1 is not null and pg_temp.diff(pn) = 0, 'засев: места и зеркало Качества');
  insert into quality.construction_defects_v2(id, "locationId", status, core_company_id) values ('d1-m49', a1::text, 'issued', ca);
  insert into quality.construction_acceptance_v2(id, "locationId", core_company_id) values ('a1-m49', s1f3::text, ca);
  select version into vers from quality.location_nodes where core_company_id = ca and id = a1::text;

  -- 1. Перенос квартиры на другой этаж той же секции (в начало уровня)
  perform pg_temp.as_user(uadm, ca);
  j := public.pf_move_place(a1, s1f2, pg_temp.kid(s1f2, 'кв. 3'));
  reset role;
  res := res || pg_temp.t((j ->> 'changed')::boolean and (j ->> 'old_parent')::uuid = s1f1
                          and (j ->> 'old_before')::uuid = pg_temp.kid(s1f1, 'кв. 2'), 'перенос кв.: ответ — прежний родитель и сосед (' || j::text || ')');
  res := res || pg_temp.t((select parent_id from core.locations where id = a1) = s1f2 and pg_temp.names(s1f2) = 'кв. 1,кв. 3,кв. 4'
                          and pg_temp.orders(s1f2) = '1,2,3', 'перенос кв.: новый этаж, встала перед соседом, порядок без дыр ('
                          || pg_temp.names(s1f2) || ' / ' || pg_temp.orders(s1f2) || ')');
  nd := pg_temp.qn(a1);
  res := res || pg_temp.t(nd.id = a1::text and nd."parentId" = s1f2::text and not nd.is_deleted, 'перенос кв.: тот же узел Качества, новый родитель');
  res := res || pg_temp.t(pg_temp.diff(pn) = 0 and pg_temp.bad_depth(pn) = 0, 'перенос кв.: деревья совпадают, глубина верна');
  res := res || pg_temp.t((select "locationId" from quality.construction_defects_v2 where id = 'd1-m49') = a1::text
                          and (select core_project_id from quality.construction_defects_v2 where id = 'd1-m49') = pn,
                          'перенос кв.: замечание СК 2.0 — на том же месте и проекте');

  -- 2. Повтор того же запроса — без изменений (ни правки узла, ни записи журнала)
  select version into vers from quality.location_nodes where core_company_id = ca and id = a1::text;
  select count(*) into n_log from core.audit_log where record_id = a1 and action = 'MOVE';
  perform pg_temp.as_user(uadm, ca);
  j := public.pf_move_place(a1, s1f2, pg_temp.kid(s1f2, 'кв. 3'));
  reset role;
  res := res || pg_temp.t(not (j ->> 'changed')::boolean and (select version from quality.location_nodes where core_company_id = ca and id = a1::text) = vers
                          and (select count(*) from core.audit_log where record_id = a1 and action = 'MOVE') = n_log,
                          'повтор переноса — без изменений (' || j::text || ')');
  res := res || pg_temp.t(n_log = 1 and (select new_data ->> 'parent_id' from core.audit_log where record_id = a1 and action = 'MOVE') = s1f2::text,
                          'журнал: MOVE с новым родителем');

  -- 3. Порядок без смены родителя: эт. 3 — в начало секции; «Отменить» — обратно перед прежним соседом
  perform pg_temp.as_user(uadm, ca);
  j := public.pf_move_place(s1f3, s1, s1f1);
  reset role;
  res := res || pg_temp.t(pg_temp.names(s1) = 'эт. 3,эт. 1,эт. 2' and pg_temp.orders(s1) = '1,2,3' and pg_temp.diff(pn) = 0,
                          'порядок: этаж 3 первым, соседи без дыр, Качество тоже (' || pg_temp.names(s1) || ')');
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_move_place(s1f3, (j ->> 'old_parent')::uuid, (j ->> 'old_before')::uuid);
  reset role;
  res := res || pg_temp.t(pg_temp.names(s1) = 'эт. 1,эт. 2,эт. 3', 'порядок: «Отменить» вернул прежний (' || pg_temp.names(s1) || ')');

  -- 4. Перенос этажа в другую секцию того же объекта (с квартирами и приёмкой СК 2.0)
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, %L, null)$q$, s1f3, s2));
  reset role;
  res := res || pg_temp.t(str like '23505 Место с таким названием уже есть%', 'перенос на занятое название — отказ (' || str || ')');
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_place(pn, s1f3, null, null, 'эт. 3а');
  perform public.pf_move_place(s1f3, s2, null);
  reset role;
  res := res || pg_temp.t((select parent_id from core.locations where id = s1f3) = s2 and pg_temp.names(s2) = 'эт. 1,эт. 2,эт. 3,эт. 3а'
                          and pg_temp.bad_depth(pn) = 0 and pg_temp.diff(pn) = 0,
                          'перенос этажа в другую секцию: в конце, глубина ветки и Качество верны (' || pg_temp.names(s2) || ')');
  res := res || pg_temp.t((select count(*) from core.locations where parent_id = s1f3 and deleted_at is null) = 2
                          and (select "locationId" from quality.construction_acceptance_v2 where id = 'a1-m49') = s1f3::text
                          and (select count(*) from quality.location_nodes x where x."parentId" = s1f3::text and not x.is_deleted) = 2,
                          'перенос этажа: квартиры с ним, приёмка СК 2.0 — на месте');

  -- 5. Отказы переноса
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, %L, null)$q$, a1, k2f1));
  res := res || pg_temp.t(str = '22023 Переносить можно только внутри объекта; в другой объект — копировать и вставить',
                          'перенос в другой объект — отказ (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, %L, null)$q$, s1, k2));
  res := res || pg_temp.t(str like '22023 Переносить можно только внутри объекта%', 'секция в другой корпус — отказ');
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, %L, null)$q$, a1, kc));
  res := res || pg_temp.t(str like '22023 Переносить можно только внутри объекта%', 'перенос в другой проект — отказ (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, null, null)$q$, s1));
  res := res || pg_temp.t(str like '22023 Переносить можно только внутри объекта%', 'секция наверх (без родителя) — отказ');
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, %L, null)$q$, s1, s1f1));
  res := res || pg_temp.t(str = '22023 Нельзя перенести место внутрь самого себя', 'перенос в свою ветку — отказ (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, %L, null)$q$, s1, s1));
  res := res || pg_temp.t(str = '22023 Нельзя перенести место внутрь самого себя', 'перенос в себя — отказ');
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, %L, null)$q$, k1, k2));
  res := res || pg_temp.t(str like '22023 Объект не переносится%', 'объект внутрь другого — отказ (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, %L, %L)$q$, a1, s1f1, s2f1));
  res := res || pg_temp.t(str = '22023 Место-сосед не найдено на этом уровне', 'сосед с другого уровня — отказ (' || str || ')');
  -- глубже 6: цепочка «прочее» до 6-го уровня, этаж с квартирами (2 уровня) под 5-й
  perform public.pf_save_place(pn, o1, s1, 'other', 'Узел 1');
  perform public.pf_save_place(pn, o2, o1, 'other', 'Узел 2');
  perform public.pf_save_place(pn, o3, o2, 'other', 'Узел 3');
  perform public.pf_save_place(pn, o4, o3, 'other', 'Узел 4');
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, %L, null)$q$, s1f1, o3));
  res := res || pg_temp.t(str = '22023 Слишком глубокая вложенность (максимум 6 уровней)', 'перенос глубже 6 — отказ (' || str || ')');
  reset role;
  res := res || pg_temp.t((select parent_id from core.locations where id = a1) = s1f2 and (select parent_id from core.locations where id = s1) = k1
                          and pg_temp.diff(pn) = 0 and pg_temp.bad_depth(pn) = 0, 'после отказов ничего не сдвинулось');
  -- порядок объектов проекта
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_move_place(k3, null, k1);
  reset role;
  res := res || pg_temp.t((select string_agg(name, ',' order by sort_order, name) from core.locations where project_id = pn and parent_id is null and deleted_at is null)
                          = 'Корпус 3,Корпус 1,Корпус 2' and pg_temp.diff(pn) = 0, 'порядок объектов: Корпус 3 первым');

  -- 6. Копия секции в другой корпус: новые номера получателя, глубина, зеркало
  select count(*) into cnt from (with recursive sub(id) as (select s2 union all select c.id from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null) select * from sub) x;
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_copy_place(s2, cp, 'Секция 2', k2);
  perform public.pf_copy_place(s2, cp, 'Секция 2', k2);   -- повтор — та же копия
  reset role;
  select count(*) into cnt2 from (with recursive sub(id) as (select cp union all select c.id from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null) select * from sub) x;
  res := res || pg_temp.t((select parent_id from core.locations where id = cp) = k2 and cnt2 = cnt and cnt > 1,
                          'копия в другой корпус: под Корпусом 2, вся ветка (' || cnt2 || ' / ' || cnt || ')');
  res := res || pg_temp.t((select min(build_no::int) from core.locations l where l.node_type = 'apartment' and core.place_object(l.id) = k2 and l.id <> all(array(
                            select id from core.locations where parent_id in (select id from core.locations where parent_id = k2s1)))) = 105
                          and (select count(*) from core.locations where project_id = pn and node_type = 'apartment' and deleted_at is null
                                and core.place_object(id) = k2 and build_no is not null) =
                              (select count(distinct build_no) from core.locations where project_id = pn and node_type = 'apartment' and deleted_at is null
                                and core.place_object(id) = k2),
                          'копия: квартиры — дальше по номерам Корпуса 2 (105…), без повторов');
  res := res || pg_temp.t(pg_temp.bad_depth(pn) = 0 and pg_temp.diff(pn) = 0, 'копия: глубина и зеркало Качества');
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.msg(format($q$select public.pf_copy_place(%L, %L, 'Секция 9', %L)$q$, s1, gen_random_uuid(), s1f2));
  res := res || pg_temp.t(str = '22023 Нельзя вставить место внутрь самого себя', 'копия в свою ветку — отказ (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_copy_place(%L, %L, 'Секция 9', %L)$q$, s1, gen_random_uuid(), kc));
  res := res || pg_temp.t(str = '22023 Вставить можно только в этот же проект', 'копия в другой проект — отказ (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_copy_place(%L, %L, 'Секция 2', %L)$q$, s1, gen_random_uuid(), k2));
  res := res || pg_temp.t(str like '23505 Место с таким названием уже есть%', 'копия на занятое название — отказ');
  str := pg_temp.msg(format($q$select public.pf_copy_place(%L, %L, 'Этаж Х', %L)$q$, s1f1, gen_random_uuid(), o4));
  res := res || pg_temp.t(str = '22023 Слишком глубокая вложенность (максимум 6 уровней)', 'копия глубже 6 — отказ (' || str || ')');
  -- копия на другой уровень (этаж — под «Узел 1»): глубина ветки — от нового родителя
  perform public.pf_copy_place(s1f2, cpf, 'эт. 2', o1);
  str := pg_temp.bad_depth(pn)::text;
  res := res || pg_temp.t(str = '0' and (select depth from core.locations where id = cpf) = 4
                          and (select max(depth) from core.locations where parent_id = cpf) = 5, 'копия на другой уровень — глубина пересчитана (' || str || ')');
  -- прежний вызов (3 аргумента): рядом с источником, номера дальше по объекту
  reset role;
  v := core.next_build_no(k1);
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_copy_place(s1, cp3, 'Секция 3');
  reset role;
  res := res || pg_temp.t((select parent_id from core.locations where id = cp3) = k1
                          and (select min(build_no::int) from core.locations l where l.parent_id in (select id from core.locations where parent_id = cp3)) = v
                          and pg_temp.diff(pn) = 0, 'прежний pf_copy_place(3 арг.) — как раньше: рядом, номера Корпуса 1 дальше (' || v || '…)');

  -- 7. Удаление → восстановление: ветка своего действия; удалённое раньше отдельно — остаётся удалённым
  ax := pg_temp.kid(s2f1, (select name from core.locations where parent_id = s2f1 and deleted_at is null order by sort_order limit 1));
  ay := pg_temp.kid(s2f1, (select name from core.locations where parent_id = s2f1 and deleted_at is null order by sort_order offset 1 limit 1));
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_remove_place(ax);
  perform pg_temp.tick();
  v := public.pf_remove_place(s2f1);
  perform pg_temp.tick();
  reset role;
  res := res || pg_temp.t(v = 2 and (pg_temp.qn(s2f1)).is_deleted, 'удаление этажа: 2 места (этаж и оставшаяся кв.)');
  perform pg_temp.as_user(uadm, ca);
  v := public.pf_restore_place(s2f1);
  reset role;
  res := res || pg_temp.t(v = 2 and (select deleted_at from core.locations where id = s2f1) is null and (select deleted_at from core.locations where id = ay) is null
                          and (select deleted_at from core.locations where id = ax) is not null,
                          'восстановление: этаж и кв. его действия живы, удалённая раньше — нет (' || v || ')');
  res := res || pg_temp.t(not (pg_temp.qn(s2f1)).is_deleted and not (pg_temp.qn(ay)).is_deleted and (pg_temp.qn(ax)).is_deleted
                          and pg_temp.diff(pn) = 0 and pg_temp.bad_depth(pn) = 0, 'восстановление: в Качестве узлы живы, деревья совпадают');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(public.pf_restore_place(s2f1) = 0, 'повтор восстановления — 0');
  perform public.pf_remove_place(s2f1);
  perform pg_temp.tick();
  perform public.pf_save_place(pn, gen_random_uuid(), s2, 'floor', 'эт. 1');
  str := pg_temp.msg(format($q$select public.pf_restore_place(%L)$q$, s2f1));
  res := res || pg_temp.t(str like '23505 На этом уровне уже есть «эт. 1»%', 'восстановление на занятое название — отказ (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_restore_place(%L)$q$, ay));
  res := res || pg_temp.t(str = '22023 Место выше удалено — сначала верните его', 'восстановление под удалённым — отказ (' || str || ')');
  reset role;
  res := res || pg_temp.t((select count(*) from core.audit_log where record_id = s2f1 and action = 'RESTORE') = 1, 'журнал: RESTORE');
  -- удалить секцию (с переносимым этажом внутри) и вернуть — ветка цела
  select count(*) into cnt from core.locations where project_id = pn and deleted_at is null;
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_remove_place(s2);
  perform pg_temp.tick();
  perform public.pf_restore_place(s2);
  reset role;
  res := res || pg_temp.t((select count(*) from core.locations where project_id = pn and deleted_at is null) = cnt and pg_temp.diff(pn) = 0,
                          'секция: удалить → вернуть — все места и узлы на месте');

  -- 7а. Следующий строительный номер объекта (для «+ Кв.»): как core.next_build_no
  v := core.next_build_no(k2);
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(public.pf_next_build_no(k2f1) = v and public.pf_next_build_no(k2) = v, 'pf_next_build_no — следующий номер Корпуса 2 (' || v || ')');
  reset role;

  -- 8. Права: роль без права, чужая компания, аноним
  perform pg_temp.as_user(ueng, ca);
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, %L, null)$q$, a1, s1f1));
  res := res || pg_temp.t(str like '42501%', 'без права управлять местами: перенос — отказ (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_restore_place(%L)$q$, ax));
  res := res || pg_temp.t(str like '42501%', 'без права: восстановление — отказ');
  str := pg_temp.msg(format($q$select public.pf_copy_place(%L, %L, 'Секция 7', %L)$q$, s1, gen_random_uuid(), k3));
  res := res || pg_temp.t(str like '42501%', 'без права: копия — отказ');
  perform pg_temp.as_user(ub, cb);
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, %L, null)$q$, a1, s1f1));
  res := res || pg_temp.t(str like '42501%', 'чужая компания: перенос — отказ (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_restore_place(%L)$q$, ax));
  res := res || pg_temp.t(str like '42501%', 'чужая компания: восстановление — отказ');
  str := pg_temp.msg(format($q$select public.pf_next_build_no(%L)$q$, k1));
  res := res || pg_temp.t(str like '42501%', 'чужая компания: номер — отказ');
  str := pg_temp.msg(format($q$select public.pf_copy_place(%L, %L, 'Секция 7', %L)$q$, s1, gen_random_uuid(), k3));
  res := res || pg_temp.t(str like '42501%', 'чужая компания: копия — отказ');
  reset role;
  res := res || pg_temp.t((select parent_id from core.locations where id = a1) = s1f2 and (select deleted_at from core.locations where id = ax) is not null,
                          'после отказов прав места не изменились');
  res := res || pg_temp.t(not exists (select 1 from unnest(array['public.pf_move_place(uuid,uuid,uuid)', 'public.pf_copy_place(uuid,uuid,text,uuid)',
                            'public.pf_restore_place(uuid)', 'public.pf_next_build_no(uuid)']) f where has_function_privilege('anon', f::regprocedure, 'execute')),
                          'аноним: новые функции не вызываются');

  -- 9. Проект 'quality' (как RBI): места ведёт Качество — перенос и восстановление в Компании — отказ, узлы не тронуты
  perform pg_temp.node(ca, 'obj-q49', null, 'object', 'ЖК Старый 049');
  select quality.node_root_project(x) into pq from quality.location_nodes x where x.core_company_id = ca and x.id = 'obj-q49';
  update core.projects set places_master = 'quality' where id = pq;
  perform pg_temp.node(ca, 'qb1-49', 'obj-q49', 'building', 'Корпус 1', 1);
  perform pg_temp.node(ca, 'qs1-49', 'qb1-49', 'section', 'Секция 1', 1);
  perform pg_temp.node(ca, 'qs2-49', 'qb1-49', 'section', 'Секция 2', 2);
  select l.id into sc1 from core.locations l join quality.location_nodes x on x.core_location_id = l.id where x.core_company_id = ca and x.id = 'qs1-49';
  select l.id into sc2 from core.locations l join quality.location_nodes x on x.core_location_id = l.id where x.core_company_id = ca and x.id = 'qs2-49';
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, %L, %L)$q$, sc2, (select parent_id from core.locations where id = sc2), sc1));
  reset role;
  res := res || pg_temp.t(sc1 is not null and str like '42501 Места этого объекта ведутся в Качестве%', 'проект Качества: порядок в Компании — отказ (' || str || ')');
  res := res || pg_temp.t((select sort_order from quality.location_nodes where core_company_id = ca and id = 'qs2-49') = 2
                          and (select "parentId" from quality.location_nodes where core_company_id = ca and id = 'qs2-49') = 'qb1-49',
                          'проект Качества: узлы не тронуты');

  -- 10. Компания без Качества: перенос работает, узлов Качества нет
  perform pg_temp.as_user(uc, cc);
  perform public.pf_save_project(cc, pc, '{"name": "ЖК Без Качества 049"}');
  sc1 := gen_random_uuid();
  perform public.pf_save_place(pc, sc1, null, 'object', 'Корпус 1', 'building');
  perform public.pf_fill_object(sc1, 1, 2, 1);
  sc2 := pg_temp.kid(pg_temp.kid(sc1, 'Секция 1'), 'эт. 1');
  str := pg_temp.msg(format($q$select public.pf_move_place(%L, %L, null)$q$, pg_temp.kid(sc2, 'кв. 1'), pg_temp.kid(pg_temp.kid(sc1, 'Секция 1'), 'эт. 2')));
  reset role;
  res := res || pg_temp.t(str = 'OK' and pg_temp.names(pg_temp.kid(pg_temp.kid(sc1, 'Секция 1'), 'эт. 2')) = 'кв. 2,кв. 1'
                          and (select count(*) from quality.location_nodes where core_company_id = cc) = 0 and pg_temp.bad_depth(pc) = 0,
                          'без Качества: перенос работает, в Качество не уходит (' || str || ')');
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
