-- P2-0035 этап 2 (039a): подрядчик записи — по id контрагента ядра (core_counterparty_id); «только своя фирма» — по id.
-- Проверки: подрядчик видит свою фирму до и после переименования в «Контрагентах», чужую — нет; ключ на две фирмы —
-- «не разобрано» (не видно ни одной); подделка id; вторая компания; функции закрыты. Всё откатывается; отчёт — ERROR P0001.
-- Запуск: после 039a_quality_contractors_by_id_up.sql. Пользователи и компании — тестовые (@test.invalid, is_test).
-- Альфа: F1 «ООО Ромашка» (связь ключа «romashka-old» из Качества), F2 «Лютик», F3 «Общий» + связь ключа «общий» к F1 (две фирмы).
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
  execute format('select coalesce(string_agg(split_part(id, ''-'', 1), '','' order by id collate "C"), '''') from quality.%I where id like ''%%-m39a''', tbl) into s;
  return s;
exception when others then return 'ERR:' || sqlstate; end $f$;
create or replace function pg_temp.cid(tbl text, mark text) returns uuid language plpgsql as $f$
declare v uuid; begin reset role; execute format('select core_counterparty_id from quality.%I where id = %L', tbl, mark || '-m39a') into v; return v; end $f$;
create or replace function pg_temp.mk(tbl text, mark text, author uuid, p_set text) returns void language plpgsql as $f$
declare c record; cols text := 'id'; vals text := quote_literal(mark || '-m39a');
begin
  for c in select a.attname, format_type(a.atttypid, a.atttypmod) typ
             from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = ('quality.' || tbl)::regclass and a.attnum > 0 and not a.attisdropped
              and a.attname not in ('id', 'core_company_id', 'core_project_id', 'core_created_by', 'core_object_id', 'core_counterparty_id')
              and (a.attname = 'project_code' or (a.attnotnull and d.adbin is null)) order by a.attnum loop
    cols := cols || ', ' || quote_ident(c.attname);
    vals := vals || ', ' || case
      when c.attname = 'project_code' then quote_literal(current_setting('m39a.pc'))
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
  if p_set is not null then execute format('update quality.%I set %s where id = %L', tbl, p_set, mark || '-m39a'); end if;
end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); uc1 uuid := gen_random_uuid(); uc2 uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); f3 uuid := gen_random_uuid(); fb uuid := gen_random_uuid();
  r_adm uuid; r_con uuid; r_bcon uuid; s text; res text := '';
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, uc1, uc2, ub]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 039a', true), (cb, 'Бета 039a', true);
  insert into core.company_members(company_id, user_id) select ca, u from unnest(array[uadm, uc1, uc2]) u union all select cb, ub;
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.projects(id, company_id, name) values (pa, ca, 'Объекты Альфы 039a'), (pb, cb, 'Объекты Беты 039a');
  insert into core.counterparties(id, company_id, name, inn, kinds) values
    (f1, ca, 'ООО Ромашка', '7700000001', array['contractor']), (f2, ca, 'Лютик', '7700000002', array['contractor']),
    (f3, ca, 'Общий', '7700000003', array['contractor']), (fb, cb, 'ООО Ромашка', '7700000001', array['contractor']);
  insert into quality.contractor_core_links(core_company_id, canonical_key, counterparty_id) values
    (ca, 'romashka-old', f1), (ca, 'общий', f1) on conflict (core_company_id, canonical_key) do update set counterparty_id = excluded.counterparty_id;
  insert into core.company_roles(company_id, name) values (ca, 'Админ 039a') returning id into r_adm;
  insert into core.company_roles(company_id, name) values (ca, 'Подрядчик 039a') returning id into r_con;
  insert into core.company_roles(company_id, name) values (cb, 'Подрядчик Б 039a') returning id into r_bcon;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_adm, ca, a from unnest(array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company']) a
  union all select r_con, ca, a from unnest(array['quality.view', 'quality.edit', 'quality.scope.contractor']) a
  union all select r_bcon, cb, a from unnest(array['quality.view', 'quality.edit', 'quality.scope.contractor']) a;
  insert into core.role_assignments(company_id, user_id, role_id, counterparty_id) values
    (ca, uadm, r_adm, null), (ca, uc1, r_con, f1), (ca, uc2, r_con, f2), (cb, ub, r_bcon, fb);

  perform set_config('m39a.pc', pa::text, true);
  perform pg_temp.mk('sk_records', 's1', uadm, format('core_company_id = %L, contractor_name = %L', ca, '«ООО Ромашка»'));
  perform pg_temp.mk('sk_records', 's2', uadm, format('core_company_id = %L, contractor_canonical_key = %L', ca, 'лютик'));
  perform pg_temp.mk('sk_records', 's3', uadm, format('core_company_id = %L, contractor_canonical_key = %L', ca, 'romashka-old'));
  perform pg_temp.mk('sk_records', 's4', uadm, format('core_company_id = %L, contractor_canonical_key = %L', ca, 'общий'));
  perform pg_temp.mk('sk_records', 's5', uadm, format('core_company_id = %L, contractor_name = %L', ca, 'Неизвестная фирма'));
  perform pg_temp.mk('rbi_inspections', 'i1', uadm, format('core_company_id = %L, contractor_canonical_key = %L', ca, 'ооо_ромашка'));
  perform pg_temp.mk('project_meetings', 'm1', uadm, format('core_company_id = %L, contractor_name = %L', ca, 'Лютик'));
  perform set_config('m39a.pc', pb::text, true);
  perform pg_temp.mk('sk_records', 'b1', ub, format('core_company_id = %L, contractor_name = %L', cb, 'ООО Ромашка'));
  perform set_config('m39a.pc', pa::text, true);

  -- 1. Узнавание
  res := res || pg_temp.t(pg_temp.cid('sk_records', 's1') = f1 and pg_temp.cid('rbi_inspections', 'i1') = f1,
                          'название и ключ названия → F1');
  res := res || pg_temp.t(pg_temp.cid('sk_records', 's2') = f2 and pg_temp.cid('project_meetings', 'm1') = f2, 'ключ и название → F2');
  res := res || pg_temp.t(pg_temp.cid('sk_records', 's3') = f1, 'связь ключа Качества → F1');
  res := res || pg_temp.t(pg_temp.cid('sk_records', 's4') is null, 'ключ на две фирмы — «не разобрано», не угадывается');
  res := res || pg_temp.t(pg_temp.cid('sk_records', 's5') is null, 'неизвестная фирма — «не разобрано»');
  res := res || pg_temp.t(pg_temp.cid('sk_records', 'b1') = fb, 'Бета: то же название → фирма Беты');
  res := res || pg_temp.t((select count(*) = 1 from quality.counterparty_link_report(ca) where t = 'sk_records' and total = 5 and linked = 3 and unresolved = 2),
                          'сводка: СК 5, с фирмой 3, «не разобрано» 2');

  -- 2. «Только своя фирма»
  perform pg_temp.as_user(uc1, ca);
  s := pg_temp.vis('sk_records'); res := res || pg_temp.t(s = 's1,s3', 'подрядчик F1: свои s1, s3; чужая и спорная — нет ' || s);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s = 'i1', 'подрядчик F1: проверка своей фирмы ' || s);
  s := pg_temp.vis('project_meetings'); res := res || pg_temp.t(s = '', 'подрядчик F1: совещание F2 — нет ' || s);
  perform pg_temp.as_user(uc2, ca);
  s := pg_temp.vis('sk_records'); res := res || pg_temp.t(s = 's2', 'подрядчик F2: только s2 ' || s);
  perform pg_temp.as_user(uadm, ca);
  s := pg_temp.vis('sk_records'); res := res || pg_temp.t(s = 's1,s2,s3,s4,s5', 'Админ: все СК ' || s);
  perform pg_temp.as_user(ub, cb);
  s := pg_temp.vis('sk_records'); res := res || pg_temp.t(s = 'b1', 'Бета: только своя запись ' || s);

  -- 3. Переименование в «Контрагентах» не отрывает записи; старое название узнаётся
  reset role;
  update core.counterparties set name = 'ООО Ромашка-Плюс' where id = f1;
  perform pg_temp.as_user(uc1, ca);
  s := pg_temp.vis('sk_records'); res := res || pg_temp.t(s = 's1,s3', 'после переименования F1 подрядчик видит те же записи ' || s);
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.sk_records(id, project_code, sk_number, sk_unique_key, contractor_name, core_company_id)
    values ('s6-m39a', %L, 's6', 's6', 'ООО Ромашка', %L)$q$, pa, ca)) = 'OK' and pg_temp.cid('sk_records', 's6') = f1,
                          'старое устройство пишет прежнее название — узнаётся (связь ключа)');
  -- 4. Запись чужой фирмы и подделка id
  perform pg_temp.as_user(uc1, ca);
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.sk_records(id, project_code, sk_number, sk_unique_key, contractor_name, core_company_id)
    values ('s7-m39a', %L, 's7', 's7', 'Лютик', %L)$q$, pa, ca)) = '42501', 'подрядчик F1 не пишет запись F2');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.sk_records(id, project_code, sk_number, sk_unique_key, contractor_name, core_company_id, core_counterparty_id)
    values ('s8-m39a', %L, 's8', 's8', 'Лютик', %L, %L)$q$, pa, ca, f1)) = '42501', 'подделка: id своей фирмы при названии чужой — отказ');
  perform pg_temp.as_user(uc1, ca);
  res := res || pg_temp.t(pg_temp.rows(format($q$update quality.sk_records set core_counterparty_id = %L where id = 's1-m39a'$q$, f2)) = 1
                          and pg_temp.cid('sk_records', 's1') = f1, 'подделка: правка id фирмы без смены текста — id прежний');
  perform pg_temp.as_user(uc1, ca);
  res := res || pg_temp.t(pg_temp.rows($q$update quality.sk_records set contractor_name = 'Лютик' where id = 's1-m39a'$q$) = -1,
                          'подрядчик F1 не переводит свою запись на F2');

  -- 5. Функции закрыты
  perform pg_temp.as_user(null, ca);
  res := res || pg_temp.t(pg_temp.err('select quality.record_visible(null, null, null, null, null, null, null, null)') = '42501',
                          'anon: правило видимости закрыто');
  perform pg_temp.as_user(uc1, ca);
  res := res || pg_temp.t(pg_temp.err('select quality.counterparty_of(null, null, null)') = '42501', 'сотрудник: узнавание фирмы закрыто');
  res := res || pg_temp.t(pg_temp.err(format('select * from quality.counterparty_link_report(%L)', ca)) = '42501', 'сотрудник: сводка закрыта');

  reset role;
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
