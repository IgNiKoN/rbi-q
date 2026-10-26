-- P2-0018 доработка 2: справочники подрядчиков только для чтения у «своей фирмы»; функции 023 — только с правами Качества (024). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N». Запуск: после 024.
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

create or replace function pg_temp.cnt(q text) returns int language plpgsql as $f$
declare n int; begin execute q into n; return n; exception when others then return -1; end $f$;
-- Минимальная строка без id (обязательные колонки; id — по умолчанию или метка, если id текстовый и обязателен).
create or replace function pg_temp.ins0(tbl text, pc text) returns text language plpgsql as $f$
declare c record; cols text := ''; vals text := '';
begin
  for c in select a.attname, format_type(a.atttypid, a.atttypmod) typ
             from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = ('quality.' || tbl)::regclass and a.attnum > 0 and not a.attisdropped
              and a.attname not in ('core_company_id', 'core_project_id', 'core_created_by')
              and (a.attname = 'project_code' or (a.attnotnull and d.adbin is null)) order by a.attnum loop
    cols := cols || ', ' || quote_ident(c.attname);
    vals := vals || ', ' || case when c.attname = 'project_code' then quote_nullable(pc)
      when c.typ = 'text' then quote_literal('m20-' || c.attname) when c.typ = 'uuid' then 'gen_random_uuid()'
      when c.typ = 'boolean' then 'false' when c.typ in ('jsonb', 'json') then '''{}''' when c.typ like 'timestamp%' then 'now()'
      when c.typ in ('integer', 'bigint', 'numeric', 'smallint') then '1' else 'null' end;
  end loop;
  return format('insert into quality.%I (%s) values (%s)', tbl, substr(cols, 3), substr(vals, 3));
end $f$;

do $$
declare
  ua uuid := gen_random_uuid(); uq1 uuid := gen_random_uuid(); uc1 uuid := gen_random_uuid(); ueco uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); p1 uuid := gen_random_uuid(); k1 uuid := gen_random_uuid(); s text; res text := ''; r record;
begin
  insert into auth.users(id, email) values (ua, 'adm024@test.invalid'), (uq1, 'eng024@test.invalid'), (uc1, 'con024@test.invalid'), (ueco, 'eco024@test.invalid');
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 024', true);
  insert into core.company_members(company_id, user_id) select ca, u from unnest(array[ua, uq1, uc1, ueco]) u;
  insert into core.projects(id, company_id, name) values (p1, ca, 'Объект 1');
  insert into core.company_modules(company_id, module, enabled)
    select ca, m, true from unnest(array['quality', 'construction']) m on conflict (company_id, module) do update set enabled = true;
  insert into core.counterparties(id, company_id, name, inn, kinds) values (k1, ca, 'ООО «Альфа-Строй»', '7700000011', array['contractor']);
  insert into core.role_assignments(company_id, user_id, role_id, project_id, counterparty_id)
  select ca, x.u, (select id from core.company_roles where company_id = ca and template_code = x.tpl), x.p, x.k
  from (values (ua, 'company_admin', null::uuid, null::uuid), (uq1, 'qc_engineer', p1, null), (uc1, 'contractor_rep', p1, k1),
               (ueco, 'economist', null, null)) x(u, tpl, p, k);
  perform set_config('request.headers', json_build_object('x-company-id', ca)::text, true);
  perform pg_temp.mk('contractors', null, 'm20k2', ua, format('canonical_key = %L, "displayName" = %L', 'beta_montazh', 'Бета Монтаж'));
  perform pg_temp.mk('construction_defects_v2', null, 'm20v2', uq1, '"contractorId" = ''m20k2-id''');
  -- по строке в остальных справочниках (id у части — uuid: вставка без id)
  for r in select unnest(array['contractor_aliases', 'contractor_normalization_queue', 'sk_contractor_map', 'contractor_directory']) t loop
    execute pg_temp.ins0(r.t, p1::text);
  end loop;

  -- 1. Подрядчик: справочники только читает
  perform pg_temp.as_user(uc1, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.contractors set canonical_key = ''ооо_альфа_строй'' where id = ''m20k2-id''') <= 0,
    'подрядчик не переписывает ключ чужой фирмы в contractors');
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = '', 'подрядчик по-прежнему не видит замечание v2 чужой фирмы');
  for r in select unnest(array['contractor_aliases', 'contractor_normalization_queue', 'sk_contractor_map', 'contractor_directory', 'contractors']) t loop
    res := res || pg_temp.t(pg_temp.rows(format('update quality.%I set updated_at = now()', r.t)) <= 0, 'подрядчик не правит ' || r.t);
    res := res || pg_temp.t(pg_temp.rows(format('delete from quality.%I', r.t)) <= 0, 'подрядчик не удаляет из ' || r.t);
    res := res || pg_temp.t(pg_temp.cnt(format('select count(*) from quality.%I', r.t)) >= 1, 'подрядчик читает ' || r.t);
  end loop;
  s := pg_temp.err(format('insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id) values (%L, ''x024'', ''Х 024'', %L)', p1, ca));
  res := res || pg_temp.t(s <> 'OK', 'подрядчик не добавляет в справочник (' || s || ')');
  -- 2. Инженер — как раньше
  perform pg_temp.as_user(uq1, ca);
  -- 037 (решение владельца 25.10.2026): править справочник подрядчиков — только администратор
  res := res || pg_temp.t(pg_temp.rows('update quality.contractors set "displayName" = ''Бета Монтаж'' where id = ''m20k2-id''')
                          = case when to_regprocedure('quality.queue_guard()') is null then 1 else 0 end, 'инженер правит справочник подрядчиков (до 037) / нет (037)');
  -- 3. Функции 023 — только с правами Качества
  perform pg_temp.as_user(ueco, ca);
  res := res || pg_temp.t(quality.member_by_email(ca, 'eng024@test.invalid') is null, 'экономист (без Качества): member_by_email — пусто');
  res := res || pg_temp.t(quality.contractor_ref(ca, 'm20k2-id', 'name') is null, 'экономист: contractor_ref — пусто');
  perform pg_temp.as_user(uq1, ca);
  res := res || pg_temp.t(quality.member_by_email(ca, 'ENG024@test.invalid') = uq1, 'инженер: member_by_email работает');
  res := res || pg_temp.t(quality.contractor_ref(ca, 'm20k2-id', 'name') = 'Бета Монтаж', 'инженер: contractor_ref работает');

  raise exception 'ОТЧЁТ (откат):%FAIL всего: %', E'\n' || res, (select count(*) from regexp_matches(res, 'FAIL ', 'g')) using errcode = 'P0001';
end $$;
