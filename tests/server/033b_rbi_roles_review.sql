-- P2-0033 доработка 1 (033b): атаки ревью — правка справочника объектов и дерева локаций, запись в чужой объект, удалённый
-- объект, пересчёт признаков; 033c — справочник объектов и дерево локаций только у Админа (не у Зама). Основа и данные —
-- как в 033_rbi_roles_objects.sql. Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
-- Запуск: после 033c_objects_manage_up.sql. Пользователи и компании — тестовые (@test.invalid, is_test).
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
  insert into core.projects(id, company_id, name) values (pa, ca, 'Объекты Альфы 033'), (pb, cb, 'Объекты Беты 033');
  perform set_config('m33.pc', pa::text, true);
  insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id) values
    (o1, 'большевиков,22 (гений)', 'ЖК «Большевиков, 22»', array['Гений'], ca),
    (o2, 'школа 400 (крыленко)', 'Школа 400', '{}', ca),
    (ob, 'большевиков,22 (гений)', 'Чужой объект', '{}', cb);
  insert into quality.location_nodes(id, canonical_key, "displayName", "nodeType", core_company_id) values
    ('n1-m33', 'Большевиков,22 (гений)', 'Большевиков, 22', 'object', ca);
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

  -- H1: инженер не правит справочник объектов и дерево локаций (и не расширяет себе видимость)
  perform pg_temp.as_user(ue1, ca);
  res := res || pg_temp.t(pg_temp.rows(format($q$update quality.project_objects set synonyms = array['школа 400 (крыленко)'] where id = %L$q$, o1)) = 0,
                          'H1: инженер не дописывает синоним своему объекту');
  res := res || pg_temp.t(pg_temp.rows(format($q$update quality.project_objects set display_name = 'Школа 400' where id = %L$q$, o1)) = 0,
                          'H1: инженер не переименовывает свой объект');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.location_nodes set "displayName" = 'Школа 400' where id = 'n1-m33'$q$) = 0,
                          'H1: инженер не правит дерево локаций');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.location_nodes(id, canonical_key, "displayName", "nodeType", core_company_id)
    values ('n9-m33', 'школа 400 (крыленко)', 'Школа 400', 'object', %L)$q$, ca)) = '42501', 'H1: инженер не добавляет узел-объект');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.project_objects(id, canonical_key, display_name, core_company_id)
    values ('obj-9-m33', 'x', 'y', %L)$q$, ca)) = '42501', 'H1: инженер не добавляет объект в справочник');
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a1,a2,a4,a6,a7,a8,a9', 'H1: видимость инженера не изменилась ' || s);
  perform pg_temp.as_user(udir, ca);
  res := res || pg_temp.t(pg_temp.rows($q$update quality.location_nodes set "displayName" = 'Большевиков 22' where id = 'n1-m33'$q$) = 0,
                          'владелец: дерево локаций — не Директор');
  perform pg_temp.as_user(udep, ca);
  res := res || pg_temp.t(pg_temp.rows($q$update quality.location_nodes set "displayName" = 'Большевиков, 22' where id = 'n1-m33'$q$) = 0,
                          'владелец (033c): дерево локаций — не Зам. руководителя');
  res := res || pg_temp.t(pg_temp.rows(format($q$update quality.project_objects set synonyms = array['x'] where id = %L$q$, o1)) = 0,
                          'владелец (033c): справочник объектов — не Зам. руководителя');
  -- роль «Админ» теста — права РБИ «Админа» (033c: + справочник объектов)
  reset role;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_adm, ca, a from unnest(array['quality.objects.manage', 'construction.objects.manage']) a;
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.rows($q$update quality.location_nodes set "displayName" = 'Большевиков, 22' where id = 'n1-m33'$q$) = 1,
                          'владелец (033c): дерево локаций правит Админ');
  res := res || pg_temp.t(pg_temp.rows(format($q$update quality.project_objects set synonyms = array['Гений', 'ЖК Гений-2'] where id = %L$q$, o1)) = 1,
                          'Админ правит справочник объектов');

  -- M3: своя запись не вписывается в чужой объект; своя запись с непохожим названием (не объект) — правится
  perform pg_temp.as_user(ue1, ca);
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, "projectId", project_canonical_key, core_company_id)
    values ('c7-m33', %L, 'n1-m33', 'школа 400 (крыленко)', %L)$q$, pa, ca)) = '42501', 'M3: свой узел + чужой ключ — отказ');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set project_display_name = 'Школа 400' where id = 'a1-m33'$q$) = -1,
                          'M3: своей записи нельзя дописать название чужого объекта');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.rbi_inspections set project_display_name = 'Большевиков, 22 — секция 3' where id = 'a1-m33'$q$) = 1,
                          'M3: своё название, не совпадающее с другим объектом, — правится');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_tasks(id, project_code, project_canonical_key, project_display_name, core_company_id)
    values ('c8-m33', %L, 'большевиков,22 (гений)', 'Большевиков,22', %L)$q$, pa, ca)) = 'OK', 'M3: обычная запись своего объекта — создаётся');
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s like 'a1,%', 'M3: просмотр не изменился ' || s);

  -- L1: удалённый объект справочника видимости не даёт; L2: пересчёт — по нужным столбцам
  reset role;
  update quality.project_objects set is_deleted = true where id = o1 and core_company_id = ca;
  perform pg_temp.as_user(ue1, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'a4,a6', 'L1: объект удалён — только свои без объекта ' || s);
  reset role;
  update quality.project_objects set is_deleted = false where id = o1 and core_company_id = ca;
  res := res || pg_temp.t((select 'ЖК Гений-2' <> all (quality_object_keys) and 'гений-2' = any (quality_object_keys)
                             from core.role_assignments where user_id = ue1 and revoked_at is null), 'L2: признаки пересчитаны после правки и восстановления');
  update quality.project_objects set updated_at = now() where id = o1 and core_company_id = ca;   -- служебное поле — без пересчёта (проверка не падает)
  perform pg_temp.as_user(null, ca);
  res := res || pg_temp.t(pg_temp.err('select quality.record_foreign_object(null, null, null)') = '42501', 'anon: функция M3 закрыта');

  reset role;
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
