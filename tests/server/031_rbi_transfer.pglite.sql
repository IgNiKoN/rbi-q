-- P2-0027 этап 1: перенос РБИ (031) — ТОЛЬКО ДЛЯ PGlite (наполняет public.* подставными данными; боевой сервер этот файл не выполняет).
-- Проверяет: каждая переносимая таблица переносится; один объект; повтор без дублей; очистка; полный перенос; ссылки на файлы,
-- код проекта, автор, PIN; отчёты переносятся с 036 (P2-0036; подробно — 036_rbi_transfer_reports.pglite.sql); public до = после; клиент видит перенесённое по правилам компании,
-- служебные таблицы переноса клиенту закрыты. Отчёт — ERROR P0001 с «FAIL всего: N» (всё откатывается).
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
-- Строка в public.<таблица>: обязательные колонки — метка, project_code — код РБИ.
create or replace function pg_temp.pins(tbl text, pc text, mark text) returns void language plpgsql as $f$
declare c record; cols text := ''; vals text := '';
begin
  for c in select a.attname, format_type(a.atttypid, a.atttypmod) typ, a.attnotnull nn, d.adbin is not null hasdef
             from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = ('public.' || tbl)::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum loop
    if c.attname in ('project_code', 'code') then
      cols := cols || ', ' || c.attname; vals := vals || ', ' || quote_nullable(case when c.attname = 'code' then pc else pc end);
    elsif c.attname = 'id' or (c.nn and not c.hasdef) or c.attname in ('raw_name', 'canonical_key', 'inspector_id', 'engineer_name',
          'sk_number', 'bucket', 'storage_path', 'company_id') then
      cols := cols || ', ' || quote_ident(c.attname);
      vals := vals || ', ' || case
        when c.attname = 'contractorId' then quote_literal('m31kontr-id')
        when c.typ = 'text' then quote_literal(mark || '-' || c.attname)
        when c.typ = 'uuid' then quote_literal(gen_random_uuid()::text)
        when c.typ = 'boolean' then 'false'
        when c.typ in ('jsonb', 'json') then '''{}'''
        when c.typ in ('integer', 'bigint', 'numeric', 'smallint', 'double precision', 'real') then '31'
        when c.typ like 'timestamp%' then 'now()'
        when c.typ = 'date' then 'current_date'
        when c.typ like '%[]' then '''{}'''
        else 'null' end;
    end if;
  end loop;
  execute format('insert into public.%I (%s) values (%s)', tbl, substr(cols, 3), substr(vals, 3));
end $f$;

do $$
declare
  c uuid := gen_random_uuid(); cx uuid := gen_random_uuid(); p uuid := gen_random_uuid(); px uuid := gen_random_uuid();
  uo uuid := gen_random_uuid();       -- владелец: учётка по почте
  ux uuid := gen_random_uuid();       -- чужая компания
  old_o uuid := gen_random_uuid();    -- старая учётка владельца (PIN, @rbi-quality.local)
  old_e uuid := gen_random_uuid();    -- старая учётка инженера (не сопоставлен)
  prof_o uuid := gen_random_uuid(); prof_e uuid := gen_random_uuid();
  url text := 'https://api.rbi-q.ru/storage/v1/object/public/';
  r record; res text := ''; n bigint; n2 bigint; ntab int := 0; j jsonb; s text;
begin
  insert into auth.users(id, email) values (uo, 'owner-031@test.invalid'), (ux, 'x-031@test.invalid'),
    (old_o, 'kondratiev@rbi-quality.local'), (old_e, 'ivanov@rbi-quality.local');
  insert into core.companies(id, name, is_test) values (c, 'RBI 031', true), (cx, 'Чужая 031', true);
  insert into core.company_members(company_id, user_id) values (c, uo), (cx, ux);
  insert into core.projects(id, company_id, name) values (p, c, 'RBI — объекты'), (px, cx, 'Чужой объект');
  insert into core.company_modules(company_id, module, enabled)
    select x, m, true from unnest(array[c, cx]) x, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.role_assignments(company_id, user_id, role_id)
    select x.c, x.u, (select id from core.company_roles where company_id = x.c and template_code = 'company_admin')
      from (values (c, uo), (cx, ux)) x(c, u);

  perform pg_temp.pins('contractors', 'rbi-test', 'm31kontr');   -- подрядчик договора (FK contracts → contractors)
  -- старые данные РБИ: по строке в каждой переносимой таблице (проект rbi-test) + записи двух объектов РБИ
  for r in select quality.rbi_transfer_tables() t loop
    if r.t not in ('rbi_engineer_profiles', 'rbi_inspections', 'rbi_inspection_items', 'rbi_inspection_photos', 'rbi_tasks') then
      perform pg_temp.pins(r.t, 'rbi-test', 'm31' || r.t);
    end if;
    ntab := ntab + 1;
  end loop;
  insert into public.allowed_projects(code, name) values ('rbi-work', 'пустой');
  insert into public.rbi_engineer_profiles(id, inspector_id, inspector_name, engineer_name, project_code, pin_hash, role, auth_user_id)
    values (prof_o, 'rbi-test_Кондратьев', 'Кондратьев И. Н.', 'Кондратьев И. Н.', 'rbi-test', 'hash-o', 'manager', old_o),
           (prof_e, 'rbi-test_Иванов', 'Иванов А.И.', 'Иванов А.И.', 'rbi-test', 'hash-e', 'engineer', old_e);
  insert into public.rbi_inspections(id, project_code, engineer_name, inspector_name, project_canonical_key, photos, created_by_auth_user_id)
    values ('i1', 'rbi-test', 'Кондратьев И. Н.', 'Кондратьев И. Н.', 'obj-a', jsonb_build_array(url || 'inspection-photos/rbi-test/inspections/i1/1_0/photo_a'), old_o),
           ('i2', 'rbi-test', 'Иванов А.И.', 'Иванов А.И.', 'obj-a', '[]', old_e),
           ('i3', 'rbi-test', 'Иванов А.И.', 'Иванов А.И.', 'obj-b', jsonb_build_array(url || 'inspection-photos/rbi-test/inspections/i3/1_0/photo_b'), old_e),
           ('i9', 'N/A', 'кто-то', 'кто-то', 'obj-a', '[]', null);
  insert into public.rbi_inspection_items(id, project_code, inspection_id, item_id) values ('i1_1', 'rbi-test', 'i1', '1'), ('i2_1', 'rbi-test', 'i2', '1'), ('i3_1', 'rbi-test', 'i3', '1');
  insert into public.rbi_inspection_photos(id, project_code, inspection_id, bucket_name, storage_path, public_url)
    values ('i1_1_0', 'rbi-test', 'i1', 'inspection-photos', 'rbi-test/inspections/i1/1_0/photo_a', url || 'inspection-photos/rbi-test/inspections/i1/1_0/photo_a'),
           ('i3_1_0', 'rbi-test', 'i3', 'inspection-photos', 'rbi-test/inspections/i3/1_0/photo_b', url || 'inspection-photos/rbi-test/inspections/i3/1_0/photo_b'),
           -- 031a: ссылка только в строке фото (не в JSON проверки) — в тексте записи за ней идёт запятая
           ('i2_1_0', 'rbi-test', 'i2', 'inspection-photos', 'rbi-test/inspections/i2/1_0/photo_c.jpg', url || 'inspection-photos/rbi-test/inspections/i2/1_0/photo_c.jpg');
  insert into public.rbi_tasks(id, project_code, engineer_name, project_canonical_key, task_data, title)
    values ('t1', 'rbi-test', 'Кондратьев И. Н.', 'OBJ-A', '{"project_code": "rbi-test", "project": "OBJ-A", "note": "rbi-test"}', '{"projectCode":"rbi-test"}'),
           ('t3', 'rbi-test', 'Иванов А.И.', 'obj-b', '{}', null);
  insert into public.shared_reports(id, project_code, report_type, title, generated_at, file_url, created_by)
    values ('rep1', 'rbi-test', 'pdf', 'Отчёт', now(), url || 'reports/rbi-test/r1.pdf', 'Кондратьев И. Н.');
  insert into storage.objects(bucket_id, name, metadata) values
    ('inspection-photos', 'rbi-test/inspections/i1/1_0/photo_a', '{"size": 100}'), ('inspection-photos', 'rbi-test/inspections/i3/1_0/photo_b', '{"size": 200}'),
    ('inspection-photos', 'rbi-test/inspections/i2/1_0/photo_c.jpg', '{"size": 50}'),
    ('library-docs', 'docs/d1.pdf', '{"size": 300}'), ('reports', 'rbi-test/r1.pdf', '{"size": 400}');
  res := res || pg_temp.t(ntab >= 50, 'переносимых таблиц ≥ 50 (есть ' || ntab || ')');
  res := res || pg_temp.t((select count(*) from quality.rbi_transfer_tables() t where t in ('shared_reports', 'shared_report_snapshots')) = 2, 'отчёты в списке (036)');

  create temp table fp_before as select * from quality.rbi_transfer_public_fingerprint();

  -- без сопоставления — отказ
  res := res || pg_temp.t(pg_temp.err(format('select * from quality.rbi_transfer_run(%L)', c)) = 'P0001', 'run без сопоставления — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select * from quality.rbi_transfer_clear(%L)', cx)) = 'P0001', 'clear чужой компании — отказ');
  insert into quality.rbi_transfer_projects(core_company_id, old_code, core_project_id) values (c, 'rbi-test', p);
  insert into quality.rbi_transfer_people(core_company_id, old_profile_id, email, user_id) values (c, prof_o, 'owner-031@test.invalid', uo);

  -- 1) один объект
  perform * from quality.rbi_transfer_run(c, 'obj-a');
  res := res || pg_temp.t((select count(*) from quality.rbi_inspections where core_company_id = c) = 2, 'объект: 2 проверки');
  res := res || pg_temp.t((select count(*) from quality.rbi_inspection_items where core_company_id = c) = 2, 'объект: 2 пункта');
  res := res || pg_temp.t((select count(*) from quality.rbi_inspection_photos where core_company_id = c) = 2, 'объект: 2 фото');
  res := res || pg_temp.t((select count(*) from quality.rbi_tasks where core_company_id = c) = 1, 'объект: 1 задача');
  res := res || pg_temp.t((select count(*) from quality.sk_records where core_company_id = c) = 0, 'объект: прочие таблицы не тронуты');
  res := res || pg_temp.t((select array_agg(old_name order by old_name) from quality.rbi_transfer_files where core_company_id = c)
    = array['rbi-test/inspections/i1/1_0/photo_a', 'rbi-test/inspections/i2/1_0/photo_c.jpg'], 'объект: в списке только его фото (и из строки фото)');
  res := res || pg_temp.t(not exists (select 1 from quality.rbi_transfer_verify(c, 'obj-a') where not ok and t not like 'файлы%'), 'объект: сверка старое = новое');
  res := res || pg_temp.t((select not ok from quality.rbi_transfer_verify(c, 'obj-a') where t like 'файлы (%'), 'объект: файлы не скопированы — сверка не ok');
  perform * from quality.rbi_transfer_run(c, 'obj-a');
  select sum(inserted) into n from quality.rbi_transfer_run(c, 'obj-a');
  res := res || pg_temp.t(n = 0, 'повтор объекта: 0 новых строк (есть ' || n || ')');

  -- проверка i1: ссылки, код проекта, объект ядра, автор
  select to_jsonb(q) into j from quality.rbi_inspections q where core_company_id = c and id = 'i1';
  res := res || pg_temp.t(j ->> 'project_code' = p::text and (j ->> 'core_project_id')::uuid = p, 'код проекта → объект ядра');
  res := res || pg_temp.t(j -> 'photos' ->> 0 = url || 'quality-inspection-photos/' || c || '/rbi-test/inspections/i1/1_0/photo_a', 'ссылка фото → бакет компании');
  res := res || pg_temp.t((j ->> 'core_created_by')::uuid = uo and (j ->> 'created_by_auth_user_id')::uuid = uo, 'автор = учётка владельца');
  select to_jsonb(q) into j from quality.rbi_tasks q where core_company_id = c and id = 't1';
  res := res || pg_temp.t(j #>> '{task_data,project_code}' = p::text and j #>> '{task_data,note}' = 'rbi-test'
    and j ->> 'title' = '{"projectCode":"' || p || '"}', 'код проекта внутри данных (JSON и текст) → объект; прочий текст не тронут');
  res := res || pg_temp.t((select core_created_by from quality.rbi_inspections where core_company_id = c and id = 'i2') is null, 'несопоставленный автор — пусто, имя сохранено');
  res := res || pg_temp.t((select storage_path from quality.rbi_inspection_photos where core_company_id = c and id = 'i1_1_0') = c || '/rbi-test/inspections/i1/1_0/photo_a', 'путь фото — с компанией');

  -- клиент: владелец видит, чужая компания — нет; служебные таблицы закрыты
  perform pg_temp.as_user(uo, c);
  select count(*) into n from quality.rbi_inspections;
  res := res || pg_temp.t(n = 2, 'владелец видит 2 проверки (видит ' || n || ')');
  res := res || pg_temp.t(pg_temp.err('select * from quality.rbi_transfer_people') = '42501', 'клиенту закрыты служебные таблицы');
  res := res || pg_temp.t(pg_temp.err(format('select * from quality.rbi_transfer_run(%L)', c)) = '42501', 'клиенту закрыт запуск переноса');
  perform pg_temp.as_user(ux, cx);
  select count(*) into n from quality.rbi_inspections;
  res := res || pg_temp.t(n = 0, 'чужая компания не видит перенесённое');
  reset role;

  -- 2) очистка
  perform * from quality.rbi_transfer_clear(c);
  n := 0;
  for r in select table_name from information_schema.columns where table_schema = 'quality' and column_name = 'core_company_id'
             and table_name not like 'rbi\_transfer\_%' loop
    execute format('select count(*) from quality.%I where core_company_id = $1', r.table_name) using c into n2;
    n := n + n2;
  end loop;
  res := res || pg_temp.t(n = 0, 'очистка: 0 строк компании (есть ' || n || ')');

  -- 3) полный перенос; владелец уже входил в новое приложение — у него свой профиль в компании (031b)
  insert into quality.rbi_engineer_profiles(id, inspector_id, engineer_name, project_code, auth_user_id, core_company_id)
    values (gen_random_uuid(), p || '_owner-031@test.invalid', 'owner-031@test.invalid', p::text, uo, c);
  select count(*) into n from quality.rbi_transfer_run(c) where inserted > 0;
  -- как после files.mjs copy (036: сверка по бакетам проверяет и наличие копии)
  insert into storage.objects(bucket_id, name, metadata) select 'quality-' || l.old_bucket, c || '/' || l.old_name, o.metadata
    from quality.rbi_transfer_files l join storage.objects o on o.bucket_id = l.old_bucket and o.name = l.old_name where l.core_company_id = c;
  update quality.rbi_transfer_files set copied_at = now() where core_company_id = c;
  for r in select * from quality.rbi_transfer_verify(c) where not ok loop
    res := res || 'FAIL сверка ' || r.t || ': ' || coalesce(r.old_eligible::text, '-') || ' ≠ ' || coalesce(r.new_rows::text, '-') || E'\n';
  end loop;
  res := res || pg_temp.t((select old_all - old_eligible from quality.rbi_transfer_verify(c) where t = 'rbi_inspections') = 1, 'проверка с чужим кодом проекта (N/A) не переносится');
  res := res || pg_temp.t((select count(*) from quality.allowed_projects where core_company_id = c) = 1
    and (select code from quality.allowed_projects where core_company_id = c) = p::text, 'проект rbi-work (без сопоставления) не переносится; код = объект');
  res := res || pg_temp.t(exists (select 1 from quality.shared_reports where core_company_id = c and id = 'rep1'), 'отчёт перенесён (036)');
  res := res || pg_temp.t((select pin_hash from quality.rbi_engineer_profiles where core_company_id = c and id = prof_o) is null
    and (select auth_user_id from quality.rbi_engineer_profiles where core_company_id = c and id = prof_o) = old_o,
    'профиль: PIN не перенесён; старый профиль перенесён рядом с профилем нового приложения (учётка — старая)');
  res := res || pg_temp.t((select count(*) from quality.rbi_transfer_files where core_company_id = c) = 5, 'файлы: все, с 036 — и reports (5)');
  res := res || pg_temp.t((select count(*) from quality.contracts where core_company_id = c) = 1, 'договор перенесён (после подрядчика)');
  select sum(inserted) into n from quality.rbi_transfer_run(c);
  res := res || pg_temp.t(n = 0, 'повтор полного: 0 новых строк (есть ' || n || ')');

  -- public и бакеты РБИ не изменились
  select count(*) into n from (select * from fp_before except select * from quality.rbi_transfer_public_fingerprint()) d;
  res := res || pg_temp.t(n = 0, 'public до = после (различий ' || n || ')');

  raise exception 'FAIL всего: % · переносимых таблиц % %', (length(res) - length(replace(res, 'FAIL', ''))) / 4, ntab, E'\n' || res
    using errcode = 'P0001';
end $$;
