-- P2-0035 этап 1 (039): объекты Качества — объекты ядра; записи — по id объекта ядра (core_object_id); видимость — по id.
-- Матрица: Админ / Зам. руководителя / Директор / Инженер СК (с объектами и без) × (свой объект, чужой объект, без объекта,
-- «не разобрано», переименованный объект, "projectId" на чужой узел) × (видеть / править) + вторая компания, подделка id,
-- удалённый объект, функции закрыты. Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
-- Запуск: после 039_quality_objects_by_id_up.sql. Пользователи и компании — тестовые (@test.invalid, is_test).
-- Альфа: объект-контейнер pa (как «Объекты RBI»); объект ядра «Школа 400» (План/Факт) уже есть; два объекта ядра «Дубль».
-- Объекты Качества Альфы: O1 «ЖК «Большевиков, 22»» (синоним «Гений»; узел n1; синоним справочника «Гений-Холл»), O2 «Школа 400»
-- (узел n2, корпус k2), O3 «Дубль» (спорно). Беты: OB (тот же ключ, что у O1).
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate; end $f$;
create or replace function pg_temp.rows(q text) returns int language plpgsql as $f$
declare n int; begin execute q; get diagnostics n = row_count; return n; exception when others then return -1; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
create or replace function pg_temp.vis(tbl text) returns text language plpgsql as $f$
declare s text;
begin
  execute format('select coalesce(string_agg(split_part(id, ''-'', 1), '','' order by id collate "C"), '''') from quality.%I where id like ''%%-m39''', tbl) into s;
  return s;
exception when others then return 'ERR:' || sqlstate; end $f$;
create or replace function pg_temp.oid(tbl text, mark text) returns uuid language plpgsql as $f$
declare v uuid; begin reset role; execute format('select core_object_id from quality.%I where id = %L', tbl, mark || '-m39') into v; return v; end $f$;
-- Минимальная строка (как в 033): обязательные колонки + project_code + id = «метка-m39»; затем — p_set (как автор).
create or replace function pg_temp.mk(tbl text, mark text, author uuid, p_set text) returns void language plpgsql as $f$
declare c record; cols text := 'id'; vals text := quote_literal(mark || '-m39');
begin
  for c in select a.attname, format_type(a.atttypid, a.atttypmod) typ
             from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = ('quality.' || tbl)::regclass and a.attnum > 0 and not a.attisdropped
              and a.attname not in ('id', 'core_company_id', 'core_project_id', 'core_created_by', 'core_object_id')
              and (a.attname = 'project_code' or (a.attnotnull and d.adbin is null)) order by a.attnum loop
    cols := cols || ', ' || quote_ident(c.attname);
    vals := vals || ', ' || case
      when c.attname = 'project_code' then quote_literal(current_setting('m39.pc'))
      when c.typ = 'text' then quote_literal(mark || '-' || c.attname)
      when c.typ = 'uuid' then 'gen_random_uuid()'
      when c.typ = 'boolean' then 'false'
      when c.typ in ('jsonb', 'json') then '''{}'''
      when c.typ in ('integer', 'bigint', 'numeric', 'smallint', 'double precision', 'real') then '1'
      when c.typ like 'timestamp%' then 'now()'
      when c.typ = 'date' then 'current_date'
      when c.typ like '%[]' then '''{}'''
      else 'null' end;
  end loop;
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(author::text, ''), true);
  execute format('insert into quality.%I (%s) values (%s)', tbl, cols, vals);
  if p_set is not null then execute format('update quality.%I set %s where id = %L', tbl, p_set, mark || '-m39'); end if;
end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); udep uuid := gen_random_uuid(); udir uuid := gen_random_uuid();
  ue1 uuid := gen_random_uuid(); ue2 uuid := gen_random_uuid(); ue0 uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  p400 uuid := gen_random_uuid();
  r_adm uuid; r_dep uuid; r_dir uuid; r_eng uuid; r_bng uuid;
  c1 uuid; c2 uuid; c3 uuid; cob uuid; v uuid; s text; n int; res text := '';
  o1 text := 'obj-1-m39'; o2 text := 'obj-2-m39'; o3 text := 'obj-3-m39'; ob text := 'obj-b-m39';
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, udep, udir, ue1, ue2, ue0, ub]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 039', true), (cb, 'Бета 039', true);
  insert into core.company_members(company_id, user_id)
    select ca, u from unnest(array[uadm, udep, udir, ue1, ue2, ue0]) u union all select cb, ub;
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  perform set_config('quality.object_sync', '1', true);   -- данные «как до 039b»: без синхронизации объектов ядра и Качества
  insert into core.projects(id, company_id, name) values (pa, ca, 'Объекты Альфы 039'), (pb, cb, 'Объекты Беты 039'),
    (p400, ca, '«Школа 400»'), (gen_random_uuid(), ca, 'Дубль'), (gen_random_uuid(), ca, 'дубль');
  perform set_config('m39.pc', pa::text, true);
  insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id, project_code) values
    (o1, 'большевиков,22 (гений)', 'ЖК «Большевиков, 22»', array['Гений'], ca, pa::text),
    (o2, 'школа 400', 'Школа 400', '{}', ca, pa::text),
    (o3, 'дубль', 'Дубль', '{}', ca, pa::text),
    (ob, 'большевиков,22 (гений)', 'Чужой объект', '{}', cb, pb::text);
  insert into quality.object_aliases(raw_name, canonical_key, core_company_id) values ('Гений-Холл', 'большевиков,22 (гений)', ca);
  insert into quality.location_nodes(id, canonical_key, "displayName", "nodeType", core_company_id, "parentId") values
    ('n1-m39', 'Большевиков,22 (гений)', 'Большевиков, 22', 'object', ca, null),
    ('n2-m39', 'школа 400', 'Школа 400', 'object', ca, null),
    ('k2-m39', 'корпус 1', 'Корпус 1', 'building', ca, 'n2-m39');
  perform set_config('quality.object_sync', '', true);
  select core_object_id into c1 from quality.project_objects where id = o1;
  select core_object_id into c2 from quality.project_objects where id = o2;
  select core_object_id into c3 from quality.project_objects where id = o3;
  select core_object_id into cob from quality.project_objects where id = ob;

  -- 1. Объекты Качества → объекты ядра
  res := res || pg_temp.t(c1 is not null and (select company_id = ca and name = 'ЖК «Большевиков, 22»' from core.projects where id = c1),
                          'O1: создан объект ядра Альфы с названием объекта Качества');
  res := res || pg_temp.t(c2 = p400, 'O2: связан с существующим объектом ядра «Школа 400» (очищенное название)');
  res := res || pg_temp.t(c3 is null, 'O3: два объекта ядра «Дубль» — спорно, связь пустая');
  res := res || pg_temp.t(cob is not null and cob <> c1 and (select company_id = cb from core.projects where id = cob),
                          'OB: свой объект ядра Беты (ключ как у O1 — объекты разные)');
  res := res || pg_temp.t(c1 <> pa and c2 <> pa, 'контейнер не используется как объект ЖК');
  res := res || pg_temp.t((select count(*) = 1 from quality.object_link_report(ca) where t like 'project_objects%' and unresolved = 1),
                          'сводка: спорный объект Качества — 1');

  -- 2. Роли «как в РБИ»
  insert into core.company_roles(company_id, name) values (ca, 'Админ 039') returning id into r_adm;
  insert into core.company_roles(company_id, name) values (ca, 'Зам. руководителя 039') returning id into r_dep;
  insert into core.company_roles(company_id, name) values (ca, 'Директор 039') returning id into r_dir;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер СК 039') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (cb, 'Инженер СК Б 039') returning id into r_bng;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_adm, ca, a from unnest(array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company', 'quality.objects.manage',
    'construction.view', 'construction.edit', 'construction.manage', 'construction.objects.manage']) a
  union all select r_dep, ca, a from unnest(array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company',
    'construction.view', 'construction.edit', 'construction.manage']) a
  union all select r_dir, ca, a from unnest(array['quality.view', 'quality.scope.company', 'construction.view']) a
  union all select r_eng, ca, a from unnest(array['quality.view', 'quality.edit', 'construction.view', 'construction.edit']) a
  union all select r_bng, cb, a from unnest(array['quality.view', 'quality.edit', 'construction.view', 'construction.edit']) a;
  insert into core.role_assignments(company_id, user_id, role_id, quality_objects) values
    (ca, uadm, r_adm, null), (ca, udep, r_dep, null), (ca, udir, r_dir, null),
    (ca, ue1, r_eng, array[o1]), (ca, ue2, r_eng, array[o2]), (ca, ue0, r_eng, null), (cb, ub, r_bng, array[ob]);

  -- 3. Записи: объект ядра дописывает сервер
  perform pg_temp.mk('rbi_inspections', 'a1', ue1, format('core_company_id = %L, project_canonical_key = %L', ca, 'большевиков,22 (гений)'));
  perform pg_temp.mk('rbi_inspections', 'a2', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'большевиков,22 (гений)'));
  perform pg_temp.mk('rbi_inspections', 'a3', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'школа 400'));
  perform pg_temp.mk('rbi_inspections', 'a4', ue1, format('core_company_id = %L, project_canonical_key = %L', ca, 'unknown'));
  perform pg_temp.mk('rbi_inspections', 'a5', ue2, format('core_company_id = %L, project_canonical_key = null', ca));
  perform pg_temp.mk('rbi_inspections', 'a6', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, '«БОЛЬШЕВИКОВ,22 (ГЕНИЙ)»'));
  perform pg_temp.mk('rbi_inspections', 'a7', ue2, format('core_company_id = %L, "projectId" = %L', ca, 'n1-m39'));
  perform pg_temp.mk('rbi_inspections', 'a8', ue2, format('core_company_id = %L, project_display_name = %L', ca, 'ЖК Гений'));
  perform pg_temp.mk('rbi_inspections', 'a9', ue2, format('core_company_id = %L, project_display_name = %L', ca, 'Гений-Холл'));
  perform pg_temp.mk('rbi_inspections', 'c1', uadm, format('core_company_id = %L, "projectId" = %L, project_canonical_key = %L', ca, 'n1-m39', 'школа 400'));
  perform pg_temp.mk('rbi_inspections', 'c2', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'Неизвестный ЖК'));
  perform pg_temp.mk('rbi_inspections', 'c3', uadm, format('core_company_id = %L, project_canonical_key = %L', ca, 'дубль'));
  perform pg_temp.mk('rbi_inspections', 'c4', ue2, format('core_company_id = %L, "projectId" = %L, project_canonical_key = %L', ca, 'k2-m39', 'большевиков,22 (гений)'));
  perform pg_temp.mk('rbi_tasks', 't1', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'Большевиков,22 (гений)'));
  perform pg_temp.mk('rbi_tasks', 't2', ue2, format('core_company_id = %L, project_canonical_key = %L, assigned_to_auth_user_id = %L', ca, 'школа 400', ue1));
  perform pg_temp.mk('sk_records', 's1', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'большевиков,22 (гений)'));
  perform pg_temp.mk('sk_records', 's2', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'школа 400'));
  perform pg_temp.mk('project_meetings', 'm1', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'большевиков,22 (гений)'));
  perform pg_temp.mk('project_meetings', 'm2', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, ''));
  perform pg_temp.mk('shared_reports', 'r1', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'школа 400'));
  perform pg_temp.mk('rbi_inspection_items', 'p1', ue2, format('core_company_id = %L, inspection_id = %L, project_canonical_key = %L', ca, 'a2-m39', 'большевиков,22 (гений)'));
  perform pg_temp.mk('rbi_inspection_items', 'p2', ue2, format('core_company_id = %L, inspection_id = %L', ca, 'a3-m39'));
  perform set_config('m39.pc', pb::text, true);
  perform pg_temp.mk('rbi_inspections', 'b1', ub, format('core_company_id = %L, project_canonical_key = %L', cb, 'большевиков,22 (гений)'));
  perform set_config('m39.pc', pa::text, true);

  res := res || pg_temp.t(pg_temp.oid('rbi_inspections', 'a1') = c1 and pg_temp.oid('rbi_inspections', 'a6') = c1
                          and pg_temp.oid('rbi_inspections', 'a7') = c1 and pg_temp.oid('rbi_inspections', 'a8') = c1,
                          'узнавание: ключ, заглавные с кавычками, узел-объект, синоним с «ЖК» → O1');
  res := res || pg_temp.t(pg_temp.oid('rbi_inspections', 'a9') = c1, 'узнавание: синоним справочника (object_aliases) → O1');
  res := res || pg_temp.t(pg_temp.oid('rbi_inspections', 'a3') = c2 and pg_temp.oid('rbi_tasks', 't2') = c2 and pg_temp.oid('shared_reports', 'r1') = c2,
                          'узнавание: O2 в проверках, задачах, отчётах');
  res := res || pg_temp.t(pg_temp.oid('rbi_inspections', 'a4') is null and pg_temp.oid('rbi_inspections', 'a5') is null
                          and pg_temp.oid('project_meetings', 'm2') is null, 'без объекта (unknown, пусто) — null');
  res := res || pg_temp.t(pg_temp.oid('rbi_inspections', 'c1') is null, 'признаки на разные объекты (Админ) — «не разобрано»');
  res := res || pg_temp.t(pg_temp.oid('rbi_inspections', 'c2') is null and pg_temp.oid('rbi_inspections', 'c3') is null,
                          'неизвестное название и спорный объект — «не разобрано», не угадывается');
  res := res || pg_temp.t(pg_temp.oid('rbi_inspections', 'c4') = c1, 'ТД 197: "projectId" на корпус чужого объекта не считается — объект по ключу');
  res := res || pg_temp.t(pg_temp.oid('rbi_inspection_items', 'p1') = c1, 'пункт проверки — свой объект ядра');
  res := res || pg_temp.t(pg_temp.oid('rbi_inspections', 'b1') = cob, 'Бета: ключ как у O1 → объект Беты, не Альфы');
  res := res || pg_temp.t((select pc.core_project_id = pa from quality.rbi_inspections pc where id = 'a1-m39'),
                          'core_project_id записи — контейнер, как раньше');
  res := res || pg_temp.t((select count(*) = 1 from quality.object_link_report(ca) where t = 'rbi_inspections' and total = 13 and linked = 8 and unresolved = 3),
                          'сводка: проверок 13, с объектом 8, «не разобрано» 3');

  -- 4. Матрица видимости и правки (проверки)
  perform pg_temp.as_user(uadm, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a1,a2,a3,a4,a5,a6,a7,a8,a9,c1,c2,c3,c4', 'Админ видит всё Альфы ' || s);
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set updated_at = now() where id = 'a3-m39'$q$) = 1, 'Админ правит чужую запись');
  perform pg_temp.as_user(udep, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a1,a2,a3,a4,a5,a6,a7,a8,a9,c1,c2,c3,c4', 'Зам видит всё Альфы ' || s);
  perform pg_temp.as_user(udir, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a1,a2,a3,a4,a5,a6,a7,a8,a9,c1,c2,c3,c4', 'Директор видит всё Альфы ' || s);
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set updated_at = now() where id = 'a1-m39'$q$) = 0, 'Директор не правит');
  perform pg_temp.as_user(ue1, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a1,a2,a4,a6,a7,a8,a9,c4', 'Инженер O1: записи O1 любого автора + свои без объекта ' || s);
  s := pg_temp.vis('rbi_tasks'); res := res || pg_temp.t(s = 't1', 'Инженер O1: задача O1; назначенная ему на O2 — нет (как 033) ' || s);
  s := pg_temp.vis('sk_records'); res := res || pg_temp.t(s = 's1', 'Инженер O1: СК только O1 ' || s);
  s := pg_temp.vis('project_meetings'); res := res || pg_temp.t(s = 'm1', 'Инженер O1: совещание O1, чужое без объекта — нет ' || s);
  s := pg_temp.vis('shared_reports'); res := res || pg_temp.t(s = '', 'Инженер O1: отчёт O2 — нет ' || s);
  s := pg_temp.vis('rbi_inspection_items'); res := res || pg_temp.t(s = 'p1', 'Инженер O1: пункт проверки O1, не O2 ' || s);
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set updated_at = now() where id = 'a1-m39'$q$) = 1, 'Инженер правит свою запись O1');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set updated_at = now() where id = 'a2-m39'$q$) = 0, 'Инженер не правит чужую запись O1');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set updated_at = now() where id = 'a3-m39'$q$) = 0, 'Инженер не правит запись O2');
  perform pg_temp.as_user(ue2, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a3,a5,c2', 'Инженер O2: O2 + свои без объекта и «не разобрано» ' || s);
  perform pg_temp.as_user(ue0, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = '', 'Инженер без объектов — только свои (своих нет) ' || s);
  perform pg_temp.as_user(ub, cb);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'b1', 'Бета видит только своё ' || s);
  perform pg_temp.as_user(ub, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = '', 'Бета с заголовком Альфы — ничего ' || s);

  -- 5. Запись инженером: свой / чужой объект, разные объекты, подделка id
  perform pg_temp.as_user(ue1, ca);
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, project_canonical_key, core_company_id)
    values ('e1-m39', %L, 'Гений', %L)$q$, pa, ca)) = 'OK', 'Инженер O1 создаёт запись O1');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, project_canonical_key, core_company_id)
    values ('e2-m39', %L, 'школа 400', %L)$q$, pa, ca)) = '42501', 'Инженер O1 не создаёт запись O2');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, "projectId", project_canonical_key, core_company_id)
    values ('e3-m39', %L, 'n2-m39', 'большевиков,22 (гений)', %L)$q$, pa, ca)) = '42501', 'M3: узел O2 + ключ O1 — отказ');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set project_display_name = 'Школа 400' where id = 'a1-m39'$q$) = -1,
                          'M3: своей записи O1 нельзя дописать название O2');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, project_canonical_key, core_company_id, core_object_id)
    values ('e4-m39', %L, 'Гений', %L, %L)$q$, pa, ca, c2)) = 'OK' and pg_temp.oid('rbi_inspections', 'e4') = c1,
                          'подделка: id объекта от клиента не принимается (сервер считает по тексту)');
  perform pg_temp.as_user(ue1, ca);
  res := res || pg_temp.t(pg_temp.rows(format($q$update quality.rbi_inspections set core_object_id = %L where id = 'a1-m39'$q$, c2)) = 1
                          and pg_temp.oid('rbi_inspections', 'a1') = c1, 'подделка: правка id объекта без смены текста — id прежний');
  perform pg_temp.as_user(ue1, ca);
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, project_canonical_key, core_company_id)
    values ('e5-m39', %L, 'Новое название', %L)$q$, pa, ca)) = 'OK' and pg_temp.oid('rbi_inspections', 'e5') is null,
                          'своя запись с неизвестным названием — создаётся, «не разобрано»');
  perform pg_temp.as_user(ue2, ca);
  res := res || pg_temp.t(position('e5' in pg_temp.vis('rbi_inspections')) = 0, '«не разобрано» чужого инженера не видно');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(position('e5' in pg_temp.vis('rbi_inspections')) > 0, '«не разобрано» видно Админу');

  -- 6. Переименование объекта: записи при нём, старое название — синоним
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.rows(format($q$update quality.project_objects set display_name = 'Большевиков 22 — новый', canonical_key = 'большевиков 22 новый'
    where id = %L$q$, o1)) = 1, 'Админ переименовал O1');
  reset role;
  res := res || pg_temp.t((select synonyms @> array['ЖК «Большевиков, 22»', 'большевиков,22 (гений)'] from quality.project_objects where id = o1),
                          'старые название и ключ — в синонимах');
  res := res || pg_temp.t((select core_object_id = c1 from quality.project_objects where id = o1), 'id объекта ядра у O1 не изменился');
  perform pg_temp.as_user(ue1, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a1,a2,a4,a6,a7,a8,a9,c4,e1,e4,e5', 'после переименования инженер видит те же записи ' || s);
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, project_canonical_key, core_company_id)
    values ('e6-m39', %L, 'большевиков,22 (гений)', %L)$q$, pa, ca)) = 'OK' and pg_temp.oid('rbi_inspections', 'e6') = c1,
                          'старое устройство пишет прежний ключ — узнаётся (синоним)');
  perform pg_temp.as_user(ue1, ca);
  res := res || pg_temp.t(pg_temp.rows(format($q$update quality.project_objects set core_object_id = %L where id = %L$q$, c2, o1)) = 0,
                          'инженер не правит справочник объектов');
  perform pg_temp.as_user(uadm, ca);
  perform pg_temp.rows(format($q$update quality.project_objects set core_object_id = %L where id = %L$q$, c2, o1));
  reset role;
  res := res || pg_temp.t((select core_object_id = c1 from quality.project_objects where id = o1), 'Админ не меняет связь объекта с ядром напрямую');

  -- 7. Новый объект в Качестве — объект ядра
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.project_objects(id, canonical_key, display_name, core_company_id, project_code)
    values ('obj-4-m39', 'новый жк', 'Новый ЖК', %L, %L)$q$, ca, pa)) = 'OK', 'Админ добавил объект в Качестве');
  reset role;
  res := res || pg_temp.t((select pr.name = 'Новый ЖК' and pr.company_id = ca from quality.project_objects po join core.projects pr on pr.id = po.core_object_id
                            where po.id = 'obj-4-m39'), 'объект ядра создан, его видят «Компания» и План/Факт');

  -- 8. Удалённый объект видимости не даёт
  update quality.project_objects set is_deleted = true where id = o1;
  perform pg_temp.as_user(ue1, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a4,e5', 'объект удалён — только свои без объекта ' || s);
  reset role;
  update quality.project_objects set is_deleted = false where id = o1;

  -- 9. Функции закрыты
  perform pg_temp.as_user(null, ca);
  res := res || pg_temp.t(pg_temp.err('select quality.object_row_visible(null, null, null, null, null, null, null, null, null)') = '42501',
                          'anon: правило видимости закрыто');
  perform pg_temp.as_user(ue1, ca);
  res := res || pg_temp.t(pg_temp.err('select quality.object_of(null, null, null, null)') = '42501', 'сотрудник: узнавание объекта закрыто');
  res := res || pg_temp.t(pg_temp.err(format('select * from quality.object_link_report(%L)', ca)) = '42501', 'сотрудник: сводка закрыта');

  reset role;
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
