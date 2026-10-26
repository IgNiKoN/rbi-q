-- P2-0033 этап 1: роли «как в РБИ» × закреплённые объекты × действия (033). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
-- Запуск: после 033_rbi_roles_objects_up.sql. Пользователи и компании — тестовые (@test.invalid, is_test).
-- Объекты Качества Альфы: O1 «Большевиков,22 (гений)» (синоним «Гений»; узел локаций n1), O2 «Школа 400»; Беты: OB.
-- Проверки (автор): a1 — O1, инженер 1; a2 — O1, инженер 2; a3 — O2, инженер 2; a4 — без объекта, инженер 1; a5 — без объекта,
-- инженер 2; a6 — «Все», инженер 1; a7 — O1 ЗАГЛАВНЫМИ и в кавычках, инженер 2; a8 — только узел объекта n1, инженер 2;
-- a9 — «ЖК Гений» (синоним с приставкой), инженер 2. Задачи: t1 — O1 (заглавными), автор инженер 2; t2 — O2, автор инженер 2,
-- назначена инженеру 1. СК: s1 — O1, s2 — O2. Совещания: m1 — O1, m2 — без объекта (автор инженер 2). Пункты: p1 (к a2), p2 (к a3).
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
  execute format('select coalesce(string_agg(split_part(id, ''-'', 1), '','' order by id collate "C"), '''') from quality.%I where id like ''%%-m33''', tbl) into s;
  return s;
exception when others then return 'ERR:' || sqlstate; end $f$;
-- Минимальная строка (как в 020): обязательные колонки + project_code + id = «метка-m33»; затем — p_set.
create or replace function pg_temp.mk(tbl text, mark text, author uuid, p_set text) returns void language plpgsql as $f$
declare c record; cols text := 'id'; vals text := quote_literal(mark || '-m33');
begin
  for c in select a.attname, format_type(a.atttypid, a.atttypmod) typ
             from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = ('quality.' || tbl)::regclass and a.attnum > 0 and not a.attisdropped
              and a.attname not in ('id', 'core_company_id', 'core_project_id', 'core_created_by')
              and (a.attname = 'project_code' or (a.attnotnull and d.adbin is null)) order by a.attnum loop
    cols := cols || ', ' || quote_ident(c.attname);
    vals := vals || ', ' || case
      when c.attname = 'project_code' then quote_literal(current_setting('m33.pc'))
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
  if p_set is not null then execute format('update quality.%I set %s where id = %L', tbl, p_set, mark || '-m33'); end if;
end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); udep uuid := gen_random_uuid(); udir uuid := gen_random_uuid();
  ue1 uuid := gen_random_uuid(); ue2 uuid := gen_random_uuid(); ue0 uuid := gen_random_uuid(); uqc uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  r_adm uuid; r_dep uuid; r_dir uuid; r_eng uuid; r_bng uuid;
  v_id uuid; j jsonb; s text; n int; res text := '';
  o1 text := 'obj-1-m33'; o2 text := 'obj-2-m33'; ob text := 'obj-b-m33';
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, udep, udir, ue1, ue2, ue0, uqc, ub]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 033', true), (cb, 'Бета 033', true);
  insert into core.company_members(company_id, user_id)
    select ca, u from unnest(array[uadm, udep, udir, ue1, ue2, ue0, uqc]) u union all select cb, ub;
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  -- как у РБИ: все объекты Качества — внутри одного объекта ядра
  perform set_config('quality.object_sync', '1', true);   -- данные «как до 039b»: без синхронизации объектов ядра и Качества
  insert into core.projects(id, company_id, name) values (pa, ca, 'Объекты Альфы 033'), (pb, cb, 'Объекты Беты 033');
  perform set_config('m33.pc', pa::text, true);
  insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id) values
    (o1, 'большевиков,22 (гений)', 'ЖК «Большевиков, 22»', array['Гений'], ca),
    (o2, 'школа 400 (крыленко)', 'Школа 400', '{}', ca),
    (ob, 'большевиков,22 (гений)', 'Чужой объект', '{}', cb);
  insert into quality.location_nodes(id, canonical_key, "displayName", "nodeType", core_company_id) values
    ('n1-m33', 'Большевиков,22 (гений)', 'Большевиков, 22', 'object', ca);
  perform set_config('quality.object_sync', '', true);
  -- 4 роли «как в РБИ» (наборы прав — таблица «флаг ROLE_MATRIX → действие», этап 2)
  insert into core.company_roles(company_id, name) values (ca, 'Админ 033') returning id into r_adm;
  insert into core.company_roles(company_id, name) values (ca, 'Зам. руководителя 033') returning id into r_dep;
  insert into core.company_roles(company_id, name) values (ca, 'Директор 033') returning id into r_dir;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер СК 033') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (cb, 'Инженер СК Б 033') returning id into r_bng;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r, ca, a from unnest(array[r_adm, r_dep]) r, unnest(array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company',
    'construction.view', 'construction.edit', 'construction.manage', 'security.roles.assign']) a
  union all select r_dir, ca, a from unnest(array['quality.view', 'quality.scope.company', 'construction.view']) a
  union all select r_eng, ca, a from unnest(array['quality.view', 'quality.edit', 'construction.view', 'construction.edit']) a
  union all select r_bng, cb, a from unnest(array['quality.view', 'quality.edit', 'construction.view', 'construction.edit']) a;
  insert into core.role_assignments(company_id, user_id, role_id, quality_objects) values
    (ca, uadm, r_adm, null), (ca, udep, r_dep, null), (ca, udir, r_dir, null),
    (ca, ue1, r_eng, array[o1]), (ca, ue2, r_eng, array[o2]), (ca, ue0, r_eng, null), (cb, ub, r_bng, array[ob]);
  insert into core.role_assignments(company_id, user_id, role_id) select ca, uqc, id from core.company_roles where company_id = ca and template_code = 'qc_engineer';

  perform pg_temp.mk('rbi_inspections', 'a1', ue1, format('core_company_id = %L, project_canonical_key = %L', ca, 'большевиков,22 (гений)'));
  perform pg_temp.mk('rbi_inspections', 'a2', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'большевиков,22 (гений)'));
  perform pg_temp.mk('rbi_inspections', 'a3', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'школа 400 (крыленко)'));
  perform pg_temp.mk('rbi_inspections', 'a4', ue1, format('core_company_id = %L, project_canonical_key = %L', ca, 'unknown'));
  perform pg_temp.mk('rbi_inspections', 'a5', ue2, format('core_company_id = %L, project_canonical_key = null', ca));
  perform pg_temp.mk('rbi_inspections', 'a6', ue1, format('core_company_id = %L, project_canonical_key = %L', ca, 'Все'));
  perform pg_temp.mk('rbi_inspections', 'a7', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, '«БОЛЬШЕВИКОВ,22 (ГЕНИЙ)»'));
  perform pg_temp.mk('rbi_inspections', 'a8', ue2, format('core_company_id = %L, project_canonical_key = null, "projectId" = %L', ca, 'n1-m33'));
  perform pg_temp.mk('rbi_inspections', 'a9', ue2, format('core_company_id = %L, project_display_name = %L', ca, 'ЖК Гений'));
  perform pg_temp.mk('rbi_tasks', 't1', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'БОЛЬШЕВИКОВ,22 (ГЕНИЙ)'));
  perform pg_temp.mk('rbi_tasks', 't2', ue2, format('core_company_id = %L, project_canonical_key = %L, assigned_to_auth_user_id = %L', ca, 'школа 400 (крыленко)', ue1));
  perform pg_temp.mk('sk_records', 's1', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'большевиков,22 (гений)'));
  perform pg_temp.mk('sk_records', 's2', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'школа 400 (крыленко)'));
  perform pg_temp.mk('project_meetings', 'm1', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, 'большевиков,22 (гений)'));
  perform pg_temp.mk('project_meetings', 'm2', ue2, format('core_company_id = %L, project_canonical_key = %L', ca, ''));
  perform pg_temp.mk('rbi_inspection_items', 'p1', ue2, format('core_company_id = %L, inspection_id = %L', ca, 'a2-m33'));
  perform pg_temp.mk('rbi_inspection_items', 'p2', ue2, format('core_company_id = %L, inspection_id = %L', ca, 'a3-m33'));
  perform set_config('m33.pc', pb::text, true);
  perform pg_temp.mk('rbi_inspections', 'b1', ub, format('core_company_id = %L, project_canonical_key = %L', cb, 'большевиков,22 (гений)'));

  -- Видимость: Инженер 1 (объект O1) — все записи O1 любого автора + свои без объекта; «Все» — по правилу «свои без объекта»
  perform pg_temp.as_user(ue1, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a1,a2,a4,a6,a7,a8,a9', 'инженер O1: проверки ' || s);
  s := pg_temp.vis('rbi_tasks');       res := res || pg_temp.t(s = 't1', 'инженер O1: задачи (O1 заглавными; t2 — назначена ему, но чужой объект) ' || s);
  s := pg_temp.vis('sk_records');      res := res || pg_temp.t(s = 's1', 'инженер O1: СК ' || s);
  s := pg_temp.vis('project_meetings'); res := res || pg_temp.t(s = 'm1', 'инженер O1: совещания (m2 — чужая без объекта) ' || s);
  s := pg_temp.vis('rbi_inspection_items'); res := res || pg_temp.t(s = 'p1', 'инженер O1: пункты (p1 — к чужой проверке O1) ' || s);
  -- Правка: только свои (в своём объекте или без объекта)
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set project_code = project_code where id = 'a1-m33'$q$) = 1, 'инженер: правит свою (O1)');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set project_code = project_code where id = 'a4-m33'$q$) = 1, 'инженер: правит свою без объекта');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set project_code = project_code where id = 'a2-m33'$q$) = 0, 'инженер: чужую в своём объекте не правит');
  res := res || pg_temp.t(pg_temp.rows($q$delete from quality.rbi_inspections where id = 'a2-m33'$q$) = 0, 'инженер: чужую в своём объекте не удаляет');
  res := res || pg_temp.t(pg_temp.rows($q$delete from quality.rbi_inspections where id = 'a3-m33'$q$) = 0, 'инженер: чужой объект не удаляет');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set project_canonical_key = 'школа 400 (крыленко)' where id = 'a1-m33'$q$) = -1,
                          'инженер: свою запись в чужой объект не переносит');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspection_items set core_company_id = core_company_id where id = 'p1-m33'$q$) = 0,
                          'инженер: пункт чужой проверки не правит');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_tasks set core_company_id = core_company_id where id = 't1-m33'$q$) = 0,
                          'инженер: чужую задачу своего объекта не правит');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.sk_records set core_company_id = core_company_id where id = 's1-m33'$q$) = 1,
                          'инженер: СК своего объекта правит (canManageSK, как раньше у qc_engineer)');
  -- Создание: в свой объект и без объекта — да; в чужой — нет
  reset role;
  perform set_config('request.jwt.claim.sub', ue1::text, true);
  perform pg_temp.as_user(ue1, ca);
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, project_canonical_key, core_company_id)
    values ('c1-m33', %L, 'Большевиков,22 (гений)', %L)$q$, pa, ca)) = 'OK', 'инженер: создаёт в свой объект');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, project_canonical_key, core_company_id)
    values ('c2-m33', %L, '', %L)$q$, pa, ca)) = 'OK', 'инженер: создаёт без объекта');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, project_canonical_key, core_company_id)
    values ('c3-m33', %L, 'школа 400 (крыленко)', %L)$q$, pa, ca)) = '42501', 'инженер: в чужой объект не создаёт');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspection_items(id, item_id, project_code, inspection_id, core_company_id)
    values ('c4-m33', 'x', %L, 'a2-m33', %L)$q$, pa, ca)) = '42501', 'инженер: пункт к чужой проверке не добавляет');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspection_items(id, item_id, project_code, inspection_id, core_company_id)
    values ('c5-m33', 'x', %L, 'a1-m33', %L)$q$, pa, ca)) = 'OK', 'инженер: пункт к своей проверке добавляет');

  -- Инженер 2 (O2): O2 любого автора + свои без объекта (a5); задача t2 (O2)
  perform pg_temp.as_user(ue2, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a3,a5', 'инженер O2: проверки ' || s);
  s := pg_temp.vis('rbi_tasks');       res := res || pg_temp.t(s = 't2', 'инженер O2: задачи ' || s);
  s := pg_temp.vis('project_meetings'); res := res || pg_temp.t(s = 'm2', 'инженер O2: совещания (своё без объекта) ' || s);
  s := pg_temp.vis('rbi_inspection_items'); res := res || pg_temp.t(s = 'p2', 'инженер O2: пункты ' || s);

  -- Справочник изменён после назначения: новый синоним O2 — признаки пересчитаны, запись с синонимом видна инженеру 2
  reset role;
  update quality.project_objects set synonyms = array['Крыленко'] where core_company_id = ca and id = o2;
  perform set_config('m33.pc', pa::text, true);
  perform pg_temp.mk('rbi_inspections', 'a10', ue1, format('core_company_id = %L, project_canonical_key = %L', ca, 'крыленко'));
  perform pg_temp.as_user(ue2, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a10,a3,a5', 'инженер O2: синоним, добавленный после назначения ' || s);
  reset role;
  res := res || pg_temp.t(pg_temp.err(format('update core.role_assignments set quality_object_keys = array[%L] where user_id = %L', 'школа 400 (крыленко)', ue1)) = 'OK'
                          and (select not ('школа 400 (крыленко)' = any (quality_object_keys)) from core.role_assignments where user_id = ue1),
                          'признаки объектов считает сервер (подставить нельзя)');
  -- Без закреплённых объектов (null = все): как до 033 — свои проверки и задачи, СК всей компании
  perform pg_temp.as_user(ue0, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = '', 'инженер без объектов: только свои проверки (своих нет) ' || s);
  s := pg_temp.vis('sk_records');      res := res || pg_temp.t(s = 's1,s2', 'инженер без объектов: СК всей компании ' || s);
  perform pg_temp.as_user(uqc, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = '', 'qc_engineer (шаблон, без объектов): как раньше ' || s);

  -- Директор: видит всё, ничего не правит и не создаёт
  perform pg_temp.as_user(udir, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a1,a10,a2,a3,a4,a5,a6,a7,a8,a9,c1,c2', 'директор: все проверки ' || s);
  s := pg_temp.vis('rbi_tasks');       res := res || pg_temp.t(s = 't1,t2', 'директор: все задачи ' || s);
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set project_code = project_code where id = 'a2-m33'$q$) = 0, 'директор: не правит');
  res := res || pg_temp.t(pg_temp.rows($q$delete from quality.rbi_inspections where id = 'a2-m33'$q$) = 0, 'директор: не удаляет');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, core_company_id) values ('c6-m33', %L, %L)$q$, pa, ca)) = '42501',
                          'директор: не создаёт');

  -- Зам. руководителя и Админ: видят всё, правят и удаляют чужие
  perform pg_temp.as_user(udep, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a1,a10,a2,a3,a4,a5,a6,a7,a8,a9,c1,c2', 'зам.: все проверки ' || s);
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set project_code = project_code where id = 'a2-m33'$q$) = 1, 'зам.: правит чужую');
  res := res || pg_temp.t(pg_temp.rows($q$delete from quality.rbi_tasks where id = 't1-m33'$q$) = 1, 'зам.: удаляет чужую задачу');
  perform pg_temp.as_user(uadm, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a1,a10,a2,a3,a4,a5,a6,a7,a8,a9,c1,c2', 'админ: все проверки ' || s);
  res := res || pg_temp.t(pg_temp.rows($q$delete from quality.rbi_inspections where id = 'a3-m33'$q$) = 1, 'админ: удаляет чужую');

  -- Изоляция компаний: инженер Беты с тем же ключом объекта; заголовок чужой компании
  perform pg_temp.as_user(ub, cb);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'b1', 'Бета: только своя запись (тот же ключ объекта у Альфы не виден) ' || s);
  perform pg_temp.as_user(ub, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = '', 'Бета с заголовком Альфы: ничего ' || s);
  perform pg_temp.as_user(ue1, cb);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = '', 'инженер Альфы с заголовком Беты: ничего ' || s);

  -- Экран: закреплённые объекты в my_access
  perform pg_temp.as_user(ue1, ca);
  j := quality.my_access(null);
  res := res || pg_temp.t(j -> 'objects' = jsonb_build_array(jsonb_build_object('id', o1, 'key', 'большевиков,22 (гений)', 'name', 'ЖК «Большевиков, 22»')),
                          'my_access: объекты инженера ' || coalesce(j ->> 'objects', 'null'));
  perform pg_temp.as_user(udir, ca);
  j := quality.my_access(null);
  res := res || pg_temp.t(j ? 'objects' and jsonb_typeof(j -> 'objects') = 'null', 'my_access: директор — все объекты (null)');

  -- Назначение с объектами (pf_assign_role) и список людей
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_assign_role(%L, %L, null, null, null, array[%L])', uqc, r_eng, ob)) = '22023',
                          'назначение: объект другой компании — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_assign_role(%L, %L, null, null, null, array[%L])', uqc, r_eng, 'нет-такого')) = '22023',
                          'назначение: несуществующий объект — отказ');
  v_id := public.pf_assign_role(uqc, r_eng, null, null, null, array[o2, ' ' || o2, '']);
  res := res || pg_temp.t((select quality_objects from core.role_assignments where id = v_id) = array[o2], 'назначение: объекты по id, без дублей и пустых');
  reset role;
  res := res || pg_temp.t((select new_data -> 'quality_objects' from core.audit_log where record_id = v_id and action = 'ASSIGN') = jsonb_build_array(o2),
                          'назначение: объекты в журнале');
  perform pg_temp.as_user(uadm, ca);
  v_id := public.pf_assign_role(udir, r_eng, null, null, null, '{}');
  res := res || pg_temp.t((select quality_objects from core.role_assignments where id = v_id) is null, 'назначение: пустой список = все объекты');
  res := res || pg_temp.t((select quality_objects from public.pf_list_company_members(ca) where user_id = ue1)
                          = jsonb_build_array(jsonb_build_object('id', o1, 'name', 'ЖК «Большевиков, 22»')), 'список людей: объекты с названием');
  res := res || pg_temp.t((select string_agg(id, ',' order by id collate "C") from public.pf_list_quality_objects(ca)) = o1 || ',' || o2, 'объекты для выбора — только своей компании');
  perform pg_temp.as_user(ue1, ca);
  res := res || pg_temp.t(pg_temp.err(format('select * from public.pf_list_quality_objects(%L)', ca)) = '42501', 'объекты для выбора: инженеру — нет');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_assign_role(%L, %L, null, null, null, array[%L])', ue2, r_eng, o1)) = '42501',
                          'назначение: инженеру — нет');
  perform pg_temp.as_user(null, ca);
  res := res || pg_temp.t(pg_temp.err('select quality.objects_keys(null, null)') = '42501', 'anon: служебные функции закрыты');

  reset role;
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
