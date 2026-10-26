-- P2-0045 (044): места Качества — в общем дереве core.locations. Узел Качества → место ядра (создание, переименование, перенос,
-- удаление ветки, порядок «ребёнок раньше родителя», дубли названий, глубина > 6); правка мест в План/Факте у объекта, который
-- ведёт Качество, — отказ сервера; у объекта со своими местами План/Факта — как раньше; замечания и приёмки v2 — объект по месту.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 044_one_places_tree_up.sql.
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
-- узел Качества (как пишет приложение: строкой, компания — из записи)
create or replace function pg_temp.node(c uuid, nid text, parent text, typ text, nm text, ord int default 0) returns void language sql as $f$
  insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id)
  values (nid, parent, typ, nm, lower(nm), ord, c) $f$;
create or replace function pg_temp.loc(c uuid, nid text) returns core.locations language sql as $f$
  select l.* from quality.location_nodes n join core.locations l on l.id = n.core_location_id where n.core_company_id = c and n.id = nid $f$;
create or replace function pg_temp.vis(tbl text) returns text language plpgsql as $f$
declare s text;
begin
  execute format('select coalesce(string_agg(id, '','' order by id collate "C"), '''') from quality.%I where id like ''%%-m44''', tbl) into s;
  return s;
exception when others then return 'ERR:' || sqlstate; end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); ux uuid := gen_random_uuid(); uy uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); r_adm uuid; r_eng uuid; px uuid; py uuid; pown uuid; ql core.locations;
  res text := ''; cnt int; str text; vid uuid; ids uuid[];
begin
  -- 0. Инвариант разового переноса (данные базы): каждый живой узел под живым узлом-объектом объекта, который ведёт Качество
  --    (глубина ≤ 6), имеет живое место того же объекта.
  with recursive t as (
    select n.core_company_id c, n.id, quality.node_root_project(o) proj, 1 depth
      from quality.location_nodes n join quality.location_nodes o on o.core_company_id = n.core_company_id and o.id = n."parentId"
     where not n.is_deleted and o."nodeType" = 'object' and not o.is_deleted and coalesce(o."parentId", '') = ''
    union all
    select n.core_company_id, n.id, t.proj, t.depth + 1 from quality.location_nodes n join t on t.c = n.core_company_id and n."parentId" = t.id
     where not n.is_deleted)
  select count(*) into cnt from t
   where t.depth <= 6 and quality.places_led_by_quality(t.proj)
     and not exists (select 1 from quality.location_nodes x join core.locations l on l.id = x.core_location_id
                      where x.core_company_id = t.c and x.id = t.id and l.deleted_at is null and l.project_id = t.proj and l.depth = t.depth);
  res := res || pg_temp.t(cnt = 0, 'разовый перенос: узлов без места ' || cnt);

  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, ux, uy]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 044', true);
  insert into core.company_members(company_id, user_id) select ca, u from unnest(array[uadm, ux, uy]) u;
  insert into core.company_modules(company_id, module, enabled)
    select ca, m, true from unnest(array['quality', 'construction', 'planfact']) m on conflict (company_id, module) do update set enabled = true;
  insert into core.company_roles(company_id, name) values (ca, 'Админ 044') returning id into r_adm;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер 044') returning id into r_eng;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_adm, ca, a from unnest(array['planfact.projects.manage', 'quality.view', 'construction.view', 'construction.edit']) a
  union all select r_eng, ca, a from unnest(array['quality.view', 'construction.view', 'construction.edit']) a;
  perform set_config('request.headers', json_build_object('x-company-id', ca)::text, true);

  -- 1. Узел-объект Качества → объект ядра (039b); места — с узлов под ним
  perform pg_temp.node(ca, 'obj-x', null, 'object', 'ЖК Икс 044');
  perform pg_temp.node(ca, 'obj-y', null, 'object', 'ЖК Игрек 044');
  select quality.node_root_project(n) into px from quality.location_nodes n where n.core_company_id = ca and n.id = 'obj-x';
  select quality.node_root_project(n) into py from quality.location_nodes n where n.core_company_id = ca and n.id = 'obj-y';
  res := res || pg_temp.t(px is not null and py is not null and px <> py, 'узел-объект → объект ядра');
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, uadm, r_adm, null), (ca, ux, r_eng, px), (ca, uy, r_eng, py);
  res := res || pg_temp.t(quality.places_led_by_quality(px), 'пустой объект из Качества — места ведёт Качество');

  perform pg_temp.node(ca, 'b1', 'obj-x', 'building', 'Корпус 1', 1);
  perform pg_temp.node(ca, 's1', 'b1', 'section', 'Секция 1', 1);
  perform pg_temp.node(ca, 'f1', 's1', 'floor', 'Этаж 1', 1);
  perform pg_temp.node(ca, 'a1', 'f1', 'apartment', 'Кв. 1', 1);
  ql := pg_temp.loc(ca, 'a1');
  res := res || pg_temp.t(ql.project_id = px and ql.depth = 4 and ql.node_type = 'apartment' and ql.name = 'Кв. 1' and ql.deleted_at is null
                          and ql.parent_id = (pg_temp.loc(ca, 'f1')).id and (pg_temp.loc(ca, 'b1')).parent_id is null
                          and (pg_temp.loc(ca, 'b1')).depth = 1, 'создание: корпус → секция → этаж → квартира');
  select count(*) into cnt from core.locations where project_id = px and deleted_at is null;
  res := res || pg_temp.t(cnt = 4, 'мест у объекта 4 (' || cnt || ')');
  -- ребёнок пришёл раньше родителя (порядок отправки устройства)
  perform pg_temp.node(ca, 'f2', 's2', 'floor', 'Этаж 2', 2);
  res := res || pg_temp.t((pg_temp.loc(ca, 'f2')).id is null, 'этаж без родителя — пока без места');
  perform pg_temp.node(ca, 's2', 'b1', 'section', 'Секция 2', 2);
  res := res || pg_temp.t((pg_temp.loc(ca, 'f2')).parent_id = (pg_temp.loc(ca, 's2')).id and (pg_temp.loc(ca, 'f2')).depth = 3,
                          'родитель пришёл — место этажа создано');

  -- 2. Переименование и перенос
  update quality.location_nodes set "displayName" = 'Этаж 1 (новый)' where core_company_id = ca and id = 'f1';
  res := res || pg_temp.t((pg_temp.loc(ca, 'f1')).name = 'Этаж 1 (новый)' and (pg_temp.loc(ca, 'f1')).canonical_key = 'этаж 1 (новый)',
                          'переименование');
  vid := (pg_temp.loc(ca, 'f1')).id;
  update quality.location_nodes set "parentId" = 's2' where core_company_id = ca and id = 'f1';
  res := res || pg_temp.t((pg_temp.loc(ca, 'f1')).id = vid and (pg_temp.loc(ca, 'f1')).parent_id = (pg_temp.loc(ca, 's2')).id
                          and (pg_temp.loc(ca, 'a1')).depth = 4, 'перенос этажа в другую секцию (то же место)');
  update quality.location_nodes set "parentId" = 'b1' where core_company_id = ca and id = 'f1';
  res := res || pg_temp.t((pg_temp.loc(ca, 'f1')).depth = 2 and (pg_temp.loc(ca, 'a1')).depth = 3, 'перенос выше — глубина ветки');
  update quality.location_nodes set "parentId" = 's1' where core_company_id = ca and id = 'f1';

  -- 3. Удаление ветки и возврат
  ids := array[(pg_temp.loc(ca, 's2')).id, (pg_temp.loc(ca, 'f2')).id];
  update quality.location_nodes set is_deleted = true where core_company_id = ca and id = 's2';
  select count(*) into cnt from core.locations where id = any(ids) and deleted_at is not null;
  res := res || pg_temp.t(cnt = 2, 'удалена секция — места секции и её этажа удалены');
  update quality.location_nodes set is_deleted = false where core_company_id = ca and id = 's2';
  select count(*) into cnt from core.locations where id = any(ids) and deleted_at is null;
  res := res || pg_temp.t(cnt = 2, 'секция возвращена — те же места живые');
  vid := (pg_temp.loc(ca, 'a1')).id;
  delete from quality.location_nodes where core_company_id = ca and id = 'a1';
  res := res || pg_temp.t((select deleted_at is not null from core.locations where id = vid), 'узел стёрт — место удалено');

  -- 4. Одинаковые названия у одного родителя; глубина > 6; узел-объект в корне — не место
  perform pg_temp.node(ca, 'd1', 's1', 'floor', 'Этаж 9');
  perform pg_temp.node(ca, 'd2', 's1', 'floor', 'этаж  9');
  res := res || pg_temp.t((pg_temp.loc(ca, 'd1')).id is not null and (pg_temp.loc(ca, 'd2')).id is not null
                          and (pg_temp.loc(ca, 'd1')).canonical_key <> (pg_temp.loc(ca, 'd2')).canonical_key, 'дубли названий — оба места');
  perform pg_temp.node(ca, 'g1', 'obj-y', 'building', 'К');
  perform pg_temp.node(ca, 'g2', 'g1', 'section', 'С');
  perform pg_temp.node(ca, 'g3', 'g2', 'floor', 'Э');
  perform pg_temp.node(ca, 'g4', 'g3', 'apartment', 'Кв');
  perform pg_temp.node(ca, 'g5', 'g4', 'room', 'Комната');
  perform pg_temp.node(ca, 'g6', 'g5', 'zone', 'Зона');
  perform pg_temp.node(ca, 'g7', 'g6', 'zone', 'Точка');
  res := res || pg_temp.t((pg_temp.loc(ca, 'g6')).depth = 6 and (pg_temp.loc(ca, 'g6')).node_type = 'other'
                          and (pg_temp.loc(ca, 'g7')).id is null, 'глубина 6 — место «прочее», 7 — без места');
  res := res || pg_temp.t((pg_temp.loc(ca, 'obj-x')).id is null, 'узел-объект — не место');

  -- 5. План/Факт: места объекта из Качества — только просмотр (сервер)
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t((select public.pf_locations_from_quality(px)), 'pf_locations_from_quality = да');
  res := res || pg_temp.t((select count(*) from public.pf_list_locations(px, null)) = 1, 'План/Факт видит корпус объекта');
  str := pg_temp.msg(format($q$select public.pf_add_location(%L, null, 'building', 'Корпус ПФ')$q$, px));
  res := res || pg_temp.t(str like '42501 Места этого объекта ведутся в Качестве%', 'План/Факт: добавить место — отказ (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_rename_location(%L, 'Взлом')$q$, (pg_temp.loc(ca, 'b1')).id));
  res := res || pg_temp.t(str like '42501 Места этого объекта%', 'План/Факт: переименовать — отказ');
  str := pg_temp.msg(format($q$select public.pf_delete_location(%L, true)$q$, (pg_temp.loc(ca, 'b1')).id));
  res := res || pg_temp.t(str like '42501 Места этого объекта%', 'План/Факт: удалить ветку — отказ');
  str := pg_temp.msg(format($q$select public.pf_generate_building(%L, null, 'Генератор', 1, 1, 1, 1)$q$, py));
  res := res || pg_temp.t(str like '42501 Места этого объекта%', 'План/Факт: генератор корпуса — отказ');
  perform pg_temp.as_user(ux, ca);
  res := res || pg_temp.t(pg_temp.msg(format($q$select public.pf_locations_from_quality(%L)$q$, py)) like '42501%', 'чужой объект — нет доступа');
  reset role;

  -- 6. Объект со своими местами План/Факта — как раньше; узлы Качества под ним не переносятся
  insert into core.projects(company_id, name) values (ca, 'Своё 044') returning id into pown;
  perform set_config('quality.place_sync', '1', true);   -- «было до 044»: своё место План/Факта
  insert into core.locations(company_id, project_id, node_type, name, canonical_key) values (ca, pown, 'building', 'Корпус ПФ', 'корпус пф');
  perform set_config('quality.place_sync', '', true);
  res := res || pg_temp.t(not quality.places_led_by_quality(pown), 'объект со своими местами — ведёт План/Факт');
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.msg(format($q$select public.pf_add_location(%L, null, 'building', 'Корпус 2 ПФ')$q$, pown));
  res := res || pg_temp.t(str = 'OK', 'План/Факт: своё место добавляется (' || str || ')');
  reset role;
  select n.id into str from quality.location_nodes n where n.core_company_id = ca and n."nodeType" = 'object' and quality.node_root_project(n) = pown;
  perform pg_temp.node(ca, 'own-b', str, 'building', 'Корпус Q');
  res := res || pg_temp.t(str is not null and (pg_temp.loc(ca, 'own-b')).id is null, 'узел Качества под объектом План/Факта — без места');

  -- 7. Замечания и приёмки v2 — объект по месту; видимость по объекту
  insert into quality.construction_defects_v2(id, "locationId", status, core_company_id) values
    ('dx-m44', 'f1', 'issued', ca), ('dy-m44', 'g3', 'issued', ca), ('dn-m44', 'нет-такого', 'issued', ca), ('d0-m44', null, 'issued', ca);
  insert into quality.construction_acceptance_v2(id, "locationId", core_company_id) values ('ax-m44', 'b1', ca);
  res := res || pg_temp.t((select core_project_id from quality.construction_defects_v2 where id = 'dx-m44') = px
                          and (select core_project_id from quality.construction_defects_v2 where id = 'dy-m44') = py
                          and (select core_project_id from quality.construction_defects_v2 where id = 'dn-m44') is null
                          and (select core_project_id from quality.construction_acceptance_v2 where id = 'ax-m44') = px, 'v2: объект по месту');
  update quality.construction_defects_v2 set status = 'in_progress' where id = 'dx-m44';
  res := res || pg_temp.t((select core_project_id from quality.construction_defects_v2 where id = 'dx-m44') = px, 'v2: правка не теряет объект');
  perform pg_temp.as_user(ux, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = 'd0-m44,dn-m44,dx-m44', 'инженер объекта Икс: Икс и без объекта (' || pg_temp.vis('construction_defects_v2') || ')');
  res := res || pg_temp.t(pg_temp.msg($q$insert into quality.construction_defects_v2(id, "locationId", status) values ('dz-m44', 'g3', 'issued')$q$) like '42501%',
                          'инженер объекта Икс не создаёт замечание на объекте Игрек');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = 'd0-m44,dn-m44,dx-m44,dy-m44', 'вся компания: все замечания');
  reset role;

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
