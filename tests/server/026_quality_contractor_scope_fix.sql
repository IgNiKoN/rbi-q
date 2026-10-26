-- P2-0018 доработка 3: «своя фирма» без зависимости от модуля и по объекту (026). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N». Запуск: после 026.
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
-- Метки видимых строк таблицы (id = «метка-…»), через запятую по алфавиту; ошибка — «ERR:код».
create or replace function pg_temp.vis(tbl text) returns text language plpgsql as $f$
declare s text;
begin
  execute format('select coalesce(string_agg(split_part(id, ''-'', 1), '','' order by id), '''') from quality.%I where id like ''m20%%''', tbl) into s;
  return s;
exception when others then return 'ERR:' || sqlstate; end $f$;
-- Минимальная строка: обязательные колонки + project_code + id = метка; затем — значения из p_set (как служебная запись).
create or replace function pg_temp.mk(tbl text, pc text, mark text, author uuid, p_set text) returns void language plpgsql as $f$
declare c record; cols text := 'id'; vals text := quote_literal(mark || '-id');
begin
  for c in select a.attname, format_type(a.atttypid, a.atttypmod) typ
             from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = ('quality.' || tbl)::regclass and a.attnum > 0 and not a.attisdropped
              and a.attname not in ('id', 'core_company_id', 'core_project_id', 'core_created_by')
              and (a.attname = 'project_code' or (a.attnotnull and d.adbin is null)) order by a.attnum loop
    cols := cols || ', ' || quote_ident(c.attname);
    vals := vals || ', ' || case
      when c.attname = 'project_code' then quote_nullable(pc)
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
  perform set_config('request.jwt.claim.sub', coalesce(author::text, ''), true);   -- автор = кто создаёт (ставит сервер)
  execute format('insert into quality.%I (%s) values (%s)', tbl, cols, vals);
  if p_set is not null then execute format('update quality.%I set %s where id = %L', tbl, p_set, mark || '-id'); end if;
end $f$;

do $$
declare
  ua uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); umx uuid := gen_random_uuid(); uq uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid(); k1 uuid := gen_random_uuid();
  s text; res text := '';
begin
  insert into auth.users(id, email) values (ua, 'adm026@test.invalid'), (uc, 'con026@test.invalid'), (umx, 'mix026@test.invalid'), (uq, 'eng026@test.invalid');
  insert into core.companies(id, name, is_test) values (ca, 'Стройконтроль 026', true);
  insert into core.company_members(company_id, user_id) select ca, u from unnest(array[ua, uc, umx, uq]) u;
  insert into core.projects(id, company_id, name) values (pa, ca, 'Объект А'), (pb, ca, 'Объект Б');
  -- только Стройконтроль, Качество выключено
  insert into core.company_modules(company_id, module, enabled) values (ca, 'construction', true), (ca, 'quality', false)
    on conflict (company_id, module) do update set enabled = excluded.enabled;
  insert into core.counterparties(id, company_id, name, inn, kinds) values (k1, ca, 'ООО «Альфа-Строй»', '7700000011', array['contractor']);
  insert into core.role_assignments(company_id, user_id, role_id, project_id, counterparty_id)
  select ca, x.u, (select id from core.company_roles where company_id = ca and template_code = x.tpl), x.p, x.k
  from (values (ua, 'company_admin', null::uuid, null::uuid), (uc, 'contractor_rep', pa, k1),
               (umx, 'contractor_rep', pa, k1), (umx, 'project_manager', pb, null), (uq, 'qc_engineer', pa, null)) x(u, tpl, p, k);
  -- смешанные роли: на объекте Б — право настроек Стройконтроля (своя роль)
  insert into core.company_roles(id, company_id, name) values (gen_random_uuid(), ca, 'Настройки СК 026');
  insert into core.company_role_permissions(role_id, company_id, action)
    select id, ca, a from core.company_roles, unnest(array['construction.view', 'construction.edit', 'construction.manage']) a
     where company_id = ca and name = 'Настройки СК 026';
  insert into core.role_assignments(company_id, user_id, role_id, project_id)
    values (ca, umx, (select id from core.company_roles where company_id = ca and name = 'Настройки СК 026'), pb);
  perform set_config('request.headers', json_build_object('x-company-id', ca)::text, true);
  perform pg_temp.mk('contractors', null, 'm20k2', ua, '"displayName" = ''Бета Монтаж'', canonical_key = ''beta_montazh''');
  perform pg_temp.mk('construction_defects_v2', null, 'm20v2', ua, '"contractorId" = ''m20k2-id''');
  insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id)
    values (pa::text, 'm20da', 'Справочник А', ca), (pb::text, 'm20db', 'Справочник Б', ca);

  -- 1. Компания без Качества: подрядчик справочники не правит, чужое замечание v2 не видит
  perform pg_temp.as_user(uc, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.contractors set canonical_key = ''ооо_альфа_строй'' where id = ''m20k2-id''') <= 0,
    'без Качества: подрядчик не переписывает ключ чужой фирмы');
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = '', 'без Качества: подрядчик не видит замечание v2 чужой фирмы (' || pg_temp.vis('construction_defects_v2') || ')');
  res := res || pg_temp.t(pg_temp.rows('update quality.contractor_directory set updated_at = now() where canonical_key = ''m20da'' and project_code = ' || quote_literal(pa) || '') <= 0, 'без Качества: подрядчик не правит справочник объекта А');
  s := pg_temp.err(format('insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id) values (%L, ''x026'', ''Х 026'', %L)', pa, ca));
  reset role;
  res := res || pg_temp.t(s <> 'OK' and not exists (select 1 from quality.contractor_core_links where core_company_id = ca and canonical_key = 'x026'),
    'без Качества: подрядчик не добавляет в справочник и не создаёт связь (' || s || ')');

  -- 2. Смешанные роли: подрядчик на А, настройки на Б
  perform pg_temp.as_user(umx, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.contractor_directory set updated_at = now() where canonical_key = ''m20da'' and project_code = ' || quote_literal(pa) || '') <= 0, 'смешанные роли: на объекте А (подрядчик) — не правит');
  res := res || pg_temp.t(pg_temp.rows('update quality.contractor_directory set updated_at = now() where canonical_key = ''m20db'' and project_code = ' || quote_literal(pb) || '') = 1, 'смешанные роли: на объекте Б (настройки) — правит');

  -- 3. Обычные роли — как раньше
  perform pg_temp.as_user(uq, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.contractor_directory set updated_at = now() where canonical_key = ''m20da'' and project_code = ' || quote_literal(pa) || '')
                          = case when to_regprocedure('quality.queue_guard()') is null then 1 else 0 end, 'инженер правит справочник (до 037) / нет (037)');
  perform pg_temp.as_user(ua, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.contractors set "displayName" = ''Бета Монтаж'' where id = ''m20k2-id''') = 1, 'админ правит справочник подрядчиков');

  raise exception 'ОТЧЁТ (откат):%FAIL всего: %', E'\n' || res, (select count(*) from regexp_matches(res, 'FAIL ', 'g')) using errcode = 'P0001';
end $$;
