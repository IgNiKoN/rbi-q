-- P2-0018 этап 3: ключи по компании (021) на КАЖДОЙ таблице quality. Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
-- Запуск: после 021_quality_keys_up.sql. Пользователи и компании — тестовые (@test.invalid, is_test).
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
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
-- Одинаковая строка для любой компании: обязательные колонки — постоянные значения (метка), project_code — объект компании.
create or replace function pg_temp.ins(tbl text, pc text, mark text, upsert boolean) returns text language plpgsql as $f$
declare c record; cols text := ''; vals text := ''; v_conf text;
begin
  for c in select a.attname, format_type(a.atttypid, a.atttypmod) typ, a.attnotnull nn, d.adbin is not null hasdef
             from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = ('quality.' || tbl)::regclass and a.attnum > 0 and not a.attisdropped
              and a.attname not in ('core_company_id', 'core_project_id', 'core_created_by') order by a.attnum loop
    if c.attname = 'project_code' then
      cols := cols || ', project_code'; vals := vals || ', ' || quote_nullable(pc);
    elsif c.attname = 'id' or (c.nn and not c.hasdef) or c.attname in ('code', 'raw_name', 'canonical_key', 'inspector_id', 'engineer_name',
          'sk_number', 'bucket', 'storage_path', 'company_id') then
      cols := cols || ', ' || quote_ident(c.attname);
      vals := vals || ', ' || case
        when c.attname = 'contractorId' then quote_literal(mark || '-id')   -- договор → подрядчик той же метки (FK по компании)
        when c.typ = 'text' then quote_literal(mark || '-' || c.attname)
        when c.typ = 'uuid' then quote_literal('00000000-0000-4000-8000-000000000021')
        when c.typ = 'boolean' then 'false'
        when c.typ in ('jsonb', 'json') then '''{}'''
        when c.typ in ('integer', 'bigint', 'numeric', 'smallint', 'double precision', 'real') then '21'
        when c.typ like 'timestamp%' then 'now()'
        when c.typ = 'date' then 'current_date'
        when c.typ like '%[]' then '''{}'''
        else 'null' end;
    end if;
  end loop;
  -- upsert как у старого клиента через мост: цель — первичный ключ таблицы (с компанией)
  select string_agg(quote_ident(a.attname), ', ' order by k.ord) into v_conf
    from pg_constraint x cross join lateral unnest(x.conkey) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = x.conrelid and a.attnum = k.attnum
   where x.conrelid = ('quality.' || tbl)::regclass and x.contype = 'p';
  return format('insert into quality.%I (%s) values (%s)%s', tbl, substr(cols, 3), substr(vals, 3),
    case when upsert then format(' on conflict (%s) do nothing', v_conf) else '' end);
end $f$;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  r record; s text; sb text; qa text; qb text; qu text; n int; na int; nb int; res text := ''; ntab int := 0;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[ua, ub]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 021', true), (cb, 'Бета 021', true);
  insert into core.company_members(company_id, user_id) values (ca, ua), (cb, ub);
  insert into core.projects(id, company_id, name) values (pa, ca, 'Объект А'), (pb, cb, 'Объект Б');
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, ua, (select id from core.company_roles where company_id = ca and template_code = 'company_admin'), null),
    (cb, ub, (select id from core.company_roles where company_id = cb and template_code = 'company_admin'), null);

  -- структура: у каждого первичного ключа, уникального ограничения и индекса раздела quality первым идёт компания
  select count(*), string_agg(c.conrelid::regclass || '.' || c.conname, ', ') into n, s from pg_constraint c
   where c.connamespace = 'quality'::regnamespace and c.contype in ('p', 'u')
     and c.conrelid::regclass::text not like 'quality.rbi\_transfer\_%'   -- P2-0027: служебные таблицы переноса (клиенту закрыты)
     and not ((select attnum from pg_attribute where attrelid = c.conrelid and attname = 'core_company_id') = any(c.conkey));
  res := res || pg_temp.t(n = 0, 'ключи без компании: ' || coalesce(s, '—'));
  select count(*), string_agg(i.indexrelid::regclass::text, ', ') into n, s from pg_index i join pg_class t on t.oid = i.indrelid
   where t.relnamespace = 'quality'::regnamespace and i.indisunique and t.relname not like 'rbi\_transfer\_%'
     and not ((select attnum from pg_attribute where attrelid = t.oid and attname = 'core_company_id') = any(i.indkey::int2[]));
  res := res || pg_temp.t(n = 0, 'уникальные индексы без компании: ' || coalesce(s, '—'));

  for r in select c.relname t,
                  exists (select 1 from pg_attribute where attrelid = c.oid and attname = 'project_code') haspc
             from pg_class c where c.relnamespace = 'quality'::regnamespace and c.relkind = 'r'
              and c.relname not in ('contractor_core_links') and c.relname not like 'rbi\_transfer\_%' order by 1 loop   -- P2-0027: служебные таблицы переноса клиенту закрыты
    ntab := ntab + 1;
    -- одна и та же строка (тот же id и прочие ключи) — сначала в Альфе, затем в Бете
    reset role;
    qa := pg_temp.ins(r.t, case when r.haspc then pa::text end, 'k21', false);
    qb := pg_temp.ins(r.t, case when r.haspc then pb::text end, 'k21', false);
    qu := pg_temp.ins(r.t, case when r.haspc then pb::text end, 'k21', true);
    perform pg_temp.as_user(ua, ca);
    s := pg_temp.err(qa);
    perform pg_temp.as_user(ub, cb);
    sb := pg_temp.err(qb);
    res := res || pg_temp.t(s = 'OK' and sb = 'OK', r.t || ': одинаковая строка в двух компаниях (' || s || ' / ' || sb || ')');
    -- повторная отправка той же строки (upsert по ключу) — без ошибки и без дубля
    sb := pg_temp.err(qu);
    res := res || pg_temp.t(sb = 'OK', r.t || ': повтор upsert в Бете (' || sb || ')');
    execute format('select count(*) from quality.%I', r.t) into nb;
    perform pg_temp.as_user(ua, ca);
    execute format('select count(*) from quality.%I', r.t) into na;
    reset role;
    execute format('select count(*) from quality.%I where core_company_id = %L', r.t, ca) into n;
    res := res || pg_temp.t(na = n and na >= 1 and nb >= 1, r.t || ': каждый видит только свою (' || na || ' / ' || nb || ' / в Альфе ' || n || ')');
    execute format('select count(*) from quality.%I where core_company_id in (%L, %L)', r.t, ca, cb) into n;
    res := res || pg_temp.t(n = na + nb, r.t || ': обе строки живут (' || n || ')');
  end loop;
  res := res || pg_temp.t(ntab = 55, 'таблиц проверено: ' || ntab);

  raise exception 'ОТЧЁТ (откат), таблиц %:%FAIL всего: %', ntab, E'\n' || res, (select count(*) from regexp_matches(res, 'FAIL ', 'g'))
    using errcode = 'P0001';
end $$;
