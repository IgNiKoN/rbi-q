-- P2-0016 этап 1: изоляция хранилища quality (018) на КАЖДОЙ таблице. Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
-- Запуск: после 018_quality_up.sql. Пользователи и компании — тестовые (@test.invalid, is_test).
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
create or replace function pg_temp.cnt(q text) returns int language plpgsql as $f$
declare n int; begin execute q into n; return n; exception when others then return -1; end $f$;
create or replace function pg_temp.rows(q text) returns int language plpgsql as $f$
declare n int; begin execute q; get diagnostics n = row_count; return n; exception when others then return -1; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
-- Вставка минимальной строки: обязательные колонки без значения по умолчанию + project_code + метка id.
create or replace function pg_temp.ins(tbl text, pc text, mark text) returns text language plpgsql as $f$
declare c record; cols text := ''; vals text := '';
begin
  for c in select a.attname, format_type(a.atttypid, a.atttypmod) typ, a.attnotnull nn, d.adbin is not null hasdef
             from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = ('quality.' || tbl)::regclass and a.attnum > 0 and not a.attisdropped
              and a.attname not in ('core_company_id', 'core_project_id') order by a.attnum loop
    if c.attname = 'project_code' then
      cols := cols || ', project_code'; vals := vals || ', ' || quote_nullable(pc);
    elsif c.nn and not c.hasdef then
      cols := cols || ', ' || quote_ident(c.attname);
      vals := vals || ', ' || case
        when c.typ = 'text' then quote_literal(mark || '-' || c.attname)
        when c.typ = 'uuid' then 'gen_random_uuid()'
        when c.typ = 'boolean' then 'false'
        when c.typ in ('jsonb', 'json') then '''{}'''
        when c.typ in ('integer', 'bigint', 'numeric', 'smallint', 'double precision', 'real') then '1'
        when c.typ like 'timestamp%' then 'now()'
        when c.typ = 'date' then 'current_date'
        when c.typ like '%[]' then '''{}'''
        else 'null' end;
    end if;
  end loop;
  if cols = '' then return format('insert into quality.%I default values', tbl); end if;
  return format('insert into quality.%I (%s) values (%s)', tbl, substr(cols, 3), substr(vals, 3));
end $f$;

do $$
declare
  ua uuid := gen_random_uuid(); ua_eco uuid := gen_random_uuid(); ua_qc uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  r record; t text; v_conf text; i_a text; i_x text; i_b text; i_c text; i_e text; cls text; haspc boolean; mods text[]; mark text; pc text; n int; s text; res text := ''; ntab int := 0;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[ua, ua_eco, ua_qc, ub]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 018', true), (cb, 'Бета 018', true);
  insert into core.company_members(company_id, user_id) values (ca, ua), (ca, ua_eco), (ca, ua_qc), (cb, ub);
  perform set_config('quality.object_sync', '1', true);   -- структура и права таблиц «как до 039b/039c»: без синхронизации объектов
  insert into core.projects(id, company_id, name) values (pa, ca, 'Спутник'), (pb, cb, 'Проект Б');
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, ua,     (select id from core.company_roles where company_id = ca and template_code = 'company_admin'), null),
    (ca, ua_eco, (select id from core.company_roles where company_id = ca and template_code = 'economist'), null),
    (ca, ua_qc,  (select id from core.company_roles where company_id = ca and template_code = 'qc_engineer'), pa),
    (cb, ub,     (select id from core.company_roles where company_id = cb and template_code = 'company_admin'), null);

  -- Общие проверки раздела
  res := res || pg_temp.t(not has_schema_privilege('anon', 'quality', 'usage'), 'anon не видит раздел quality');
  select count(*) into n from pg_tables where schemaname = 'quality' and not rowsecurity;
  res := res || pg_temp.t(n = 0, 'RLS включена у всех таблиц quality (без RLS: ' || n || ')');
  select count(*) into n from information_schema.role_table_grants where table_schema = 'quality' and grantee in ('anon', 'PUBLIC');
  res := res || pg_temp.t(n = 0, 'anon/PUBLIC — без прав на таблицы quality (' || n || ')');
  select count(*), string_agg(tgrelid::regclass::text, ', ') into n, s from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'quality' and not tg.tgisinternal and tg.tgname not like '%_bind_company'
     and tg.tgname <> 'contractor_directory_to_core'    -- 018e: подрядчик из Качества → «Контрагенты»
     and tg.tgname not like '%_set_author'              -- 020: автор записи
     and tg.tgname not like '%_refresh_object_keys'     -- 033: пересчёт признаков закреплённых объектов
     and tg.tgname not like '%_queue_guard'             -- 037: решение по заявке — только администратор
     and tg.tgname not like '%_record_object'           -- 039: объект ядра записи
     and tg.tgname not like '%_record_counterparty'     -- 039a: контрагент записи
     and tg.tgname not like '%_queue_unresolved'        -- 039b: «не разобрано» → очередь названий
     and tg.tgname not like '%_reresolve'               -- 039b: заново узнать «не разобрано»
     and tg.tgname not like '%_reresolve_flush'         -- 039d: пересчёт «не разобрано» один раз на запрос
     and tg.tgname <> 'location_nodes_object_sync'      -- 039b: узел-объект ↔ объект Качества и ядра
     and tg.tgname <> 'project_objects_core_object';     -- 039: объект ядра объекта Качества
  res := res || pg_temp.t(n = 0, 'в quality только триггер привязки к компании (лишние: ' || coalesce(s, '—') || ')');
  select count(*), string_agg(p.proname, ', ') into n, s from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'quality' and has_function_privilege('anon', p.oid, 'execute');
  res := res || pg_temp.t(n = 0, 'функции quality недоступны anon (' || coalesce(s, '—') || ')');
  res := res || pg_temp.t(not has_function_privilege('authenticated', 'quality.bind_company()', 'execute'), 'триггерная функция недоступна клиенту');

  for r in select c.relname::text tbl,
                  (select (regexp_match(pg_get_triggerdef(tg.oid), 'bind_company\(''(\w+)'', ''(\d)''\)'))
                     from pg_trigger tg where tg.tgrelid = c.oid and tg.tgname like '%_bind_company') a,
                  (select regexp_match(qual, '\{([^}]*)\}') from pg_policies p where p.schemaname = 'quality' and p.tablename = c.relname and p.cmd = 'SELECT') m
             from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
            where ns.nspname = 'quality' and c.relkind = 'r' and c.relname <> 'contractor_core_links' order by 1 loop
    t := r.tbl; ntab := ntab + 1;
    if r.a is null or r.m is null then res := res || pg_temp.t(false, t || ': нет триггера привязки или политики чтения'); continue; end if;
    cls := r.a[1]; haspc := r.a[2] = '1';
    mark := 'T018-' || t;
    pc := case when haspc then pa::text end;
    i_a := pg_temp.ins(t, pc, mark || '-a'); i_x := pg_temp.ins(t, 'не-объект', mark || '-x');
    i_b := pg_temp.ins(t, pa::text, mark || '-b'); i_c := pg_temp.ins(t, case when haspc then pb::text end, mark || '-c');
    i_e := pg_temp.ins(t, pc, mark || '-e');
    if t = 'contracts' then  -- договор ссылается на подрядчика своей компании
      i_a := pg_temp.ins('contractors', null, 'C018') || '; '
             || replace(i_a, quote_literal(mark || '-a-contractorId'), quote_literal('C018-id'));
    end if;

    -- 1. Своя компания (админ Альфы, заголовок Альфы): запись и чтение; строка привязана к компании и объекту
    perform pg_temp.as_user(ua, ca);
    s := pg_temp.err(i_a);
    res := res || pg_temp.t(s = 'OK', t || ': своя компания пишет (' || s || ')');
    n := pg_temp.cnt(format('select count(*) from quality.%I', t));
    res := res || pg_temp.t(n = 1, t || ': своя компания читает (' || n || ')');
    reset role;
    select count(*) into n from pg_temp.cnt(format('select count(*) from quality.%I where core_company_id = %L and core_project_id %s',
      t, ca, case when haspc then '= ' || quote_literal(pa) else 'is null' end)) x where x = 1;
    res := res || pg_temp.t(n = 1, t || ': компания и объект проставлены');
    if cls = 'project' then
      perform pg_temp.as_user(ua, ca);
      s := pg_temp.err(i_x);
      res := res || pg_temp.t(s = '42501', t || ': проектная таблица без объекта ядра — отказ (' || s || ')');
    end if;

    -- 2. Чужая компания (админ Беты): 0 строк, правка/удаление 0, запись в объект Альфы — отказ
    perform pg_temp.as_user(ub, cb);
    n := pg_temp.cnt(format('select count(*) from quality.%I', t));
    res := res || pg_temp.t(n = 0, t || ': чужая компания видит 0 строк (' || n || ')');
    n := pg_temp.rows(format('update quality.%I set core_project_id = core_project_id', t));
    res := res || pg_temp.t(n = 0, t || ': чужая компания не меняет (' || n || ')');
    n := pg_temp.rows(format('delete from quality.%I', t));
    res := res || pg_temp.t(n = 0, t || ': чужая компания не удаляет (' || n || ')');
    if haspc then
      s := pg_temp.err(i_b);
      res := res || pg_temp.t(s <> 'OK', t || ': запись в объект чужой компании — отказ (' || s || ')');
    end if;
    -- 2а. Чужая компания подставляет заголовок Альфы — она в ней не состоит
    perform pg_temp.as_user(ub, ca);
    n := pg_temp.cnt(format('select count(*) from quality.%I', t));
    res := res || pg_temp.t(n = 0, t || ': заголовок чужой компании не помогает (' || n || ')');
    s := pg_temp.err(i_c);
    res := res || pg_temp.t(s <> 'OK', t || ': запись с заголовком чужой компании — отказ (' || s || ')');

    -- 3. Без заголовка компании — ничего
    perform pg_temp.as_user(ua, null);
    n := pg_temp.cnt(format('select count(*) from quality.%I', t));
    res := res || pg_temp.t(n = 0, t || ': без текущей компании 0 строк (' || n || ')');

    -- 4. Без права модуля (экономист Альфы)
    perform pg_temp.as_user(ua_eco, ca);
    n := pg_temp.cnt(format('select count(*) from quality.%I', t));
    res := res || pg_temp.t(n = 0, t || ': без права модуля 0 строк (' || n || ')');
    s := pg_temp.err(i_e);
    res := res || pg_temp.t(s <> 'OK', t || ': без права модуля запись — отказ (' || s || ')');

    -- 5. anon
    perform pg_temp.as_user(null, ca);
    n := pg_temp.cnt(format('select count(*) from quality.%I', t));
    res := res || pg_temp.t(n = -1, t || ': anon — отказ (' || n || ')');

    -- 6. Своя компания меняет и удаляет; компанию записи сменить нельзя
    perform pg_temp.as_user(ua, ca);
    s := pg_temp.err(format('update quality.%I set core_company_id = %L', t, cb));
    res := res || pg_temp.t(s <> 'OK', t || ': компанию записи сменить нельзя (' || s || ')');
    n := pg_temp.rows(format('update quality.%I set core_project_id = core_project_id', t));
    res := res || pg_temp.t(n = 1, t || ': своя компания меняет (' || n || ')');
    n := pg_temp.rows(format('delete from quality.%I', t));
    res := res || pg_temp.t(n = 1, t || ': своя компания удаляет (' || n || ')');
    reset role;
  end loop;

  -- 7. Модуль выключен у компании — ничего не видно
  i_a := pg_temp.ins('rbi_inspections', pa::text, 'T018-off'); i_e := pg_temp.ins('rbi_company_settings', null, 'T018-qc');
  perform pg_temp.as_user(ua, ca);
  perform pg_temp.err(i_a);
  reset role;
  update core.company_modules set enabled = false where company_id = ca and module = 'quality';
  perform pg_temp.as_user(ua, ca);
  n := pg_temp.cnt('select count(*) from quality.rbi_inspections');
  res := res || pg_temp.t(n = 0, 'модуль «Качество» выключен — 0 строк (' || n || ')');
  reset role;
  update core.company_modules set enabled = true where company_id = ca and module = 'quality';

  -- 8. Назначение на объект: технадзор Альфы на «Спутнике» видит проверку этого объекта, но не настройки компании
  perform pg_temp.as_user(ua_qc, ca);
  n := pg_temp.cnt('select count(*) from quality.rbi_inspections');
  -- после 020 инженер СК видит только свои проверки (проверку создал админ)
  res := res || pg_temp.t(n = case when to_regprocedure('quality.row_visible(uuid,uuid,text[],text,uuid,uuid,text,text)') is not null then 0 else 1 end, 'технадзор объекта видит проверку объекта (' || n || ')');
  s := pg_temp.err(i_e);
  res := res || pg_temp.t(s <> 'OK', 'технадзор не меняет настройки компании (' || s || ')');
  reset role;

  -- 9. Настройки компании — одна строка на компанию: company_id = компания (upsert по company_id работает у каждой)
  -- после 021 ключ — (core_company_id, company_id); мост Качества дописывает core_company_id в onConflict
  v_conf := case when exists (select 1 from pg_constraint where conname = 'rbi_company_settings_pkey'
                  and pg_get_constraintdef(oid) like '%core_company_id%') then 'core_company_id, company_id' else 'company_id' end;
  perform pg_temp.as_user(ua, ca);
  s := pg_temp.err('insert into quality.rbi_company_settings(company_id) values (''rbi'') on conflict (' || v_conf || ') do update set updated_at = now()');
  res := res || pg_temp.t(s = 'OK', 'настройки Альфы: upsert (' || s || ')');
  perform pg_temp.as_user(ub, cb);
  s := pg_temp.err('insert into quality.rbi_company_settings(company_id) values (''rbi'') on conflict (' || v_conf || ') do update set updated_at = now()');
  res := res || pg_temp.t(s = 'OK', 'настройки Беты: upsert, не мешает Альфе (' || s || ')');
  reset role;
  select count(*) into n from quality.rbi_company_settings where company_id in (ca::text, cb::text);
  res := res || pg_temp.t(n = 2, 'настройки — по строке на компанию (' || n || ')');

  res := res || pg_temp.t(ntab = 55, 'проверено таблиц: ' || ntab || ' из 55');
  -- служебная таблица 018e (связь подрядчиков с ядром) — клиенту не выдана
  if to_regclass('quality.contractor_core_links') is not null then
    select count(*) into n from information_schema.role_table_grants
     where table_schema = 'quality' and table_name = 'contractor_core_links' and grantee in ('anon', 'authenticated', 'PUBLIC');
    res := res || pg_temp.t(n = 0, 'quality.contractor_core_links — без прав клиента (' || n || ')');
  end if;
  raise exception E'ОТЧЁТ (откат), таблиц %:\n%\nFAIL всего: %', ntab, res, (length(res) - length(replace(res, 'FAIL', ''))) / 4;
end $$;
