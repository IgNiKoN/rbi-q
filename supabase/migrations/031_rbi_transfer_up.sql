-- P2-0027 этап 1 (ADR-068 п. 5, CRITICAL). Перенос данных РБИ (public.*) в хранилище компании (quality.*).
-- Только новые объекты в разделе quality: 4 служебные таблицы переноса (клиенту закрыты: RLS без правил, права отозваны)
-- и функции, которые вызывает владелец в SQL Editor (роль postgres). public.* и бакеты РБИ — только чтение.
-- Связка «старая ↔ новая запись»: id записей сохраняются (ключи quality — по компании, 021); старый код проекта → объект ядра —
-- quality.rbi_transfer_projects; старый профиль → учётка по почте — quality.rbi_transfer_people; файлы — quality.rbi_transfer_files.
-- Переносятся таблицы, которые есть и в public, и в quality (= TABLES из scripts/gen-quality-schema.mjs), кроме готовых отчётов
-- (shared_reports, shared_report_snapshots — решение владельца 25.10.2026). Ссылки на файлы (…/object/public/<бакет>/…) →
-- закрытый бакет компании (…/object/public/quality-<бакет>/<компания>/…, правило 018d); сами файлы копирует scripts/rbi-transfer/files.mjs.
-- Повторный запуск — без дублей (on conflict do nothing по ключу компании). Откат данных — quality.rbi_transfer_clear(компания).
-- Применять после 030, одним запросом. Откат миграции — 031_rbi_transfer_down.sql.
begin;

do $$
begin
  if to_regclass('quality.rbi_inspections') is null or to_regprocedure('quality.set_author()') is null then
    raise exception '031: сначала 018–026 (раздел quality)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Служебные таблицы переноса
create table quality.rbi_transfer_projects (
  core_company_id uuid not null references core.companies(id) on delete cascade,
  old_code text not null,
  core_project_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (core_company_id, old_code),
  foreign key (core_project_id, core_company_id) references core.projects(id, company_id) on delete cascade
);
create table quality.rbi_transfer_people (
  core_company_id uuid not null references core.companies(id) on delete cascade,
  old_profile_id uuid not null,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (core_company_id, old_profile_id)
);
create table quality.rbi_transfer_files (
  core_company_id uuid not null references core.companies(id) on delete cascade,
  old_bucket text not null,
  old_name text not null,
  size_bytes bigint,
  copied_at timestamptz,
  error text,
  primary key (core_company_id, old_bucket, old_name)
);
create table quality.rbi_transfer_runs (
  id bigint generated always as identity primary key,
  core_company_id uuid not null,
  action text not null,
  scope text,
  at timestamptz not null default now(),
  result jsonb
);
alter table quality.rbi_transfer_projects enable row level security;
alter table quality.rbi_transfer_people enable row level security;
alter table quality.rbi_transfer_files enable row level security;
alter table quality.rbi_transfer_runs enable row level security;
revoke all on quality.rbi_transfer_projects, quality.rbi_transfer_people, quality.rbi_transfer_files, quality.rbi_transfer_runs
  from public, anon, authenticated;
-- Копирование файлов (scripts/rbi-transfer/files.mjs, ключ сервиса из переменной окружения): только список файлов.
grant usage on schema quality to service_role;
grant select, update, delete on quality.rbi_transfer_files to service_role;

-- 2. Бакеты, файлы которых переносятся (reports — нет)
create function quality.rbi_transfer_buckets() returns text[] language sql immutable as $$
  select array['construction-defects', 'construction-plans', 'custom-assets', 'inspection-photos', 'library-checklists',
               'library-docs', 'library-etalons', 'library-nodes', 'library-practices', 'library-twi']
$$;

-- 3. Переносимые таблицы: есть в public и в quality; contractors — раньше contracts (внешний ключ)
create function quality.rbi_transfer_tables() returns setof text language sql stable as $$
  select q.table_name::text from information_schema.tables q
    join information_schema.tables p on p.table_schema = 'public' and p.table_name = q.table_name and p.table_type = 'BASE TABLE'
   where q.table_schema = 'quality' and q.table_type = 'BASE TABLE'
     and q.table_name not in ('shared_reports', 'shared_report_snapshots') and q.table_name not like 'rbi\_transfer\_%'
   order by (q.table_name = 'contractors') desc, q.table_name
$$;

-- 4. Условие отбора строк public.<таблица>: код проекта — только сопоставленный; p_object — один объект (ключ объекта РБИ)
create function quality.rbi_transfer_filter(p_company uuid, p_table text, p_object text) returns text language plpgsql stable as $$
declare
  v_codes text := format('(select old_code from quality.rbi_transfer_projects where core_company_id = %L)', p_company);
  v_pc boolean := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = 'project_code');
  v_where text := 'true';
begin
  if p_table = 'allowed_projects' then v_where := format('p.code in %s', v_codes);
  elsif v_pc then v_where := format('(p.project_code is null or p.project_code in %s)', v_codes);
  end if;
  if p_object is not null then
    -- ключ объекта у задач записан с заглавными буквами (= название), у проверок — строчными
    if p_table in ('rbi_inspections', 'rbi_tasks') then
      v_where := v_where || format(' and lower(p.project_canonical_key) = lower(%L)', p_object);
    elsif p_table in ('rbi_inspection_items', 'rbi_inspection_photos') then
      v_where := v_where || format(' and p.inspection_id in (select id from public.rbi_inspections where lower(project_canonical_key) = lower(%L))', p_object);
    else
      v_where := 'false';
    end if;
  end if;
  return v_where;
end $$;

-- 5. Строка public → строка quality: ссылки на файлы, код проекта, люди, компания; PIN не переносится
create function quality.rbi_transfer_row(p_company uuid, p_table text, p_row jsonb, p_projects jsonb, p_auth jsonb, p_names jsonb)
returns jsonb language plpgsql stable as $$
declare
  v text := p_row::text;
  b text;
  j jsonb;
  k text;
  u text;
begin
  foreach b in array quality.rbi_transfer_buckets() loop
    v := replace(v, '/storage/v1/object/public/' || b || '/', '/storage/v1/object/public/quality-' || b || '/' || p_company || '/');
  end loop;
  -- код проекта внутри данных записи (task_data, inspection_data …; и в JSON, сохранённом текстом): "project_code"/"projectCode"
  for k, u in select key, value from jsonb_each_text(p_projects) loop
    v := regexp_replace(v, '(\\?"(project_code|projectCode)\\?"\s*:\s*\\?")' || regexp_replace(k, '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
                           || '(\\?")', '\1' || u || '\3', 'g');
  end loop;
  j := v::jsonb;
  foreach k in array array['project_code', case when p_table = 'allowed_projects' then 'code' end] loop
    if k is not null and p_projects ? (j ->> k) then j := j || jsonb_build_object(k, p_projects ->> (j ->> k)); end if;
  end loop;
  -- путь файла в бакете компании начинается с компании (018d); отчёты не переносятся — их пути не трогаем
  if j ? 'storage_path' and coalesce(j ->> 'bucket', j ->> 'bucket_name', '') = any (quality.rbi_transfer_buckets())
     and nullif(j ->> 'storage_path', '') is not null and j ->> 'storage_path' not like p_company || '/%' then
    j := j || jsonb_build_object('storage_path', p_company || '/' || ltrim(j ->> 'storage_path', '/'));
  end if;
  foreach k in array array['auth_user_id', 'owner_auth_user_id', 'assigned_to_auth_user_id', 'created_by_auth_user_id',
                           'updated_by_auth_user_id', 'deleted_by_auth_user_id'] loop
    if p_auth ? (j ->> k) then j := j || jsonb_build_object(k, p_auth ->> (j ->> k)); end if;
  end loop;
  -- автор записи (core_created_by): учётка старого автора — по старой учётке, иначе по имени
  u := coalesce(p_auth ->> (p_row ->> 'created_by_auth_user_id'), p_auth ->> (p_row ->> 'owner_auth_user_id'),
                p_names ->> (p_row ->> 'engineer_name'), p_names ->> (p_row ->> 'inspector_name'),
                p_names ->> (p_row ->> 'created_by_name'), p_names ->> (p_row ->> 'owner_name'));
  j := j || jsonb_build_object('core_company_id', p_company, 'core_project_id', null, 'core_created_by', u);
  if p_table = 'rbi_engineer_profiles' then j := j || jsonb_build_object('pin_hash', null); end if;
  return j;
end $$;

-- 6. Перенос: строки всех таблиц (или одного объекта) + список файлов к копированию. Повтор — только новые строки.
create function quality.rbi_transfer_run(p_company uuid, p_object text default null)
returns table (t text, inserted bigint) language plpgsql as $$
declare
  v_projects jsonb;
  v_auth jsonb;
  v_names jsonb;
  v_n bigint;
  v_res jsonb := '{}';
begin
  if not exists (select 1 from quality.rbi_transfer_projects where core_company_id = p_company) then
    raise exception 'Компания не подготовлена к переносу: нет сопоставления проектов (rbi_transfer_projects)' using errcode = 'P0001';
  end if;
  select jsonb_object_agg(old_code, core_project_id::text) into v_projects
    from quality.rbi_transfer_projects where core_company_id = p_company;
  select coalesce(jsonb_object_agg(p.auth_user_id::text, m.user_id::text) filter (where p.auth_user_id is not null), '{}')
    into v_auth from quality.rbi_transfer_people m join public.rbi_engineer_profiles p on p.id = m.old_profile_id
   where m.core_company_id = p_company and m.user_id is not null;
  select coalesce(jsonb_object_agg(n, user_id::text), '{}') into v_names from (
    select distinct on (n) n, m.user_id from quality.rbi_transfer_people m join public.rbi_engineer_profiles p on p.id = m.old_profile_id,
           unnest(array[p.inspector_name, p.engineer_name]) n
     where m.core_company_id = p_company and m.user_id is not null and nullif(btrim(n), '') is not null order by n) x;

  for t in select quality.rbi_transfer_tables() loop
    execute format('insert into quality.%1$I select (jsonb_populate_record(null::quality.%1$I, '
                   'quality.rbi_transfer_row($1, %1$L, to_jsonb(p), $2, $3, $4))).* from public.%1$I p where %2$s on conflict do nothing',
                   t, quality.rbi_transfer_filter(p_company, t, p_object))
      using p_company, v_projects, v_auth, v_names;
    get diagnostics v_n = row_count;
    inserted := v_n;
    v_res := v_res || jsonb_build_object(t, v_n);
    return next;
  end loop;

  -- файлы: все файлы переносимых бакетов; для одного объекта — только файлы, на которые ссылаются его записи
  insert into quality.rbi_transfer_files (core_company_id, old_bucket, old_name, size_bytes)
  select p_company, o.bucket_id, o.name, (o.metadata ->> 'size')::bigint from storage.objects o
   where o.bucket_id = any (quality.rbi_transfer_buckets())
     and (p_object is null or (o.bucket_id, o.name) in (
           select m[1], m[2] from (
             select x::text s from public.rbi_inspections x where lower(project_canonical_key) = lower(p_object)
             union all select x::text from public.rbi_tasks x where lower(project_canonical_key) = lower(p_object)
             union all select x::text from public.rbi_inspection_photos x
              where inspection_id in (select id from public.rbi_inspections where lower(project_canonical_key) = lower(p_object))) r,
           regexp_matches(r.s, '/storage/v1/object/public/([a-z-]+)/([^"\\?#[:space:]]+)', 'g') m))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  t := 'файлы к копированию'; inserted := v_n; return next;
  insert into quality.rbi_transfer_runs (core_company_id, action, scope, result)
  values (p_company, 'run', coalesce(p_object, 'all'), v_res || jsonb_build_object('files', v_n));
end $$;

-- 7. Сверка (только чтение): строк в public (все / подходящих) и в quality компании; для одного объекта — по его записям
create function quality.rbi_transfer_verify(p_company uuid, p_object text default null)
returns table (t text, old_all bigint, old_eligible bigint, new_rows bigint, ok boolean) language plpgsql stable as $$
declare v_key text;
begin
  for t in select quality.rbi_transfer_tables() loop
    v_key := case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'id')
                  then 'id' end;
    execute format('select count(*) from public.%I', t) into old_all;
    execute format('select count(*) from public.%I p where %s', t, quality.rbi_transfer_filter(p_company, t, p_object)) into old_eligible;
    if v_key is not null then
      execute format('select count(*) from quality.%1$I q where q.core_company_id = $1 and q.id in (select p.id from public.%1$I p where %2$s)',
                     t, quality.rbi_transfer_filter(p_company, t, p_object)) using p_company into new_rows;
    elsif p_object is null then
      execute format('select count(*) from quality.%I q where q.core_company_id = $1', t) using p_company into new_rows;
    else new_rows := 0;
    end if;
    ok := old_eligible = new_rows;
    return next;
  end loop;
  -- ссылки на старые бакеты, оставшиеся в перенесённых строках (должно быть 0)
  t := 'ссылки на старые бакеты'; old_all := null; old_eligible := 0; new_rows := 0;
  for v_key in select quality.rbi_transfer_tables() loop
    execute format($q$select count(*) from quality.%I q where q.core_company_id = $1
                     and q::text ~ ('/storage/v1/(object|render/image)/(public|sign|authenticated)/(' || array_to_string($2, '|') || ')/')$q$, v_key)
      using p_company, quality.rbi_transfer_buckets() into old_all;
    new_rows := new_rows + old_all;
  end loop;
  old_all := null; ok := new_rows = 0; return next;
  -- файлы: в списке / скопировано / ошибок
  t := 'файлы (в списке / скопировано / ошибок)';
  select count(*), count(*) filter (where copied_at is not null), count(*) filter (where error is not null)
    into old_all, new_rows, old_eligible from quality.rbi_transfer_files where core_company_id = p_company;
  ok := old_all = new_rows; return next;
end $$;

-- 8. Отпечаток public (до = после): строк и md5 по каждой таблице РБИ (снимки отчётов — по id и времени изменения)
create function quality.rbi_transfer_public_fingerprint() returns table (t text, n bigint, md5 text) language plpgsql stable as $$
begin
  for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1 loop
    if t = 'shared_report_snapshots' then
      execute format('select count(*), md5(coalesce(string_agg(id || coalesce(updated_at::text, %L), %L order by id), %L)) from public.%I',
                     '', ',', '', t) into n, md5;
    else
      execute format('select count(*), md5(coalesce(string_agg(x::text, %L order by x::text), %L)) from public.%I x', E'\n', '', t) into n, md5;
    end if;
    return next;
  end loop;
  t := 'storage.objects (бакеты РБИ)';
  select count(*), md5(coalesce(string_agg(bucket_id || '/' || name || coalesce(o.updated_at::text, ''), ',' order by bucket_id, name), ''))
    into n, md5 from storage.objects o where bucket_id not like 'quality-%';
  return next;
end $$;

-- 9. Очистка переноса компании: все строки компании в quality (до дня переключения в компании работает только перенос) и
-- сопоставления; список файлов остаётся — файлы удаляет scripts/rbi-transfer/files.mjs clear (затем строки списка).
create function quality.rbi_transfer_clear(p_company uuid)
returns table (t text, deleted bigint) language plpgsql as $$
declare v_n bigint;
begin
  if not exists (select 1 from quality.rbi_transfer_projects where core_company_id = p_company) then
    raise exception 'Компания не участвует в переносе — очистка запрещена' using errcode = 'P0001';
  end if;
  for t in select c.table_name from information_schema.columns c join information_schema.tables x
             on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
            where c.table_schema = 'quality' and c.column_name = 'core_company_id' and c.table_name not like 'rbi\_transfer\_%'
            order by (c.table_name = 'contractors'), c.table_name loop
    execute format('delete from quality.%I where core_company_id = $1', t) using p_company;
    get diagnostics v_n = row_count;
    if v_n > 0 then deleted := v_n; return next; end if;
  end loop;
  insert into quality.rbi_transfer_runs (core_company_id, action) values (p_company, 'clear');
end $$;

revoke all on function quality.rbi_transfer_buckets(), quality.rbi_transfer_tables(), quality.rbi_transfer_filter(uuid, text, text),
  quality.rbi_transfer_row(uuid, text, jsonb, jsonb, jsonb, jsonb), quality.rbi_transfer_run(uuid, text),
  quality.rbi_transfer_verify(uuid, text), quality.rbi_transfer_public_fingerprint(), quality.rbi_transfer_clear(uuid)
  from public, anon, authenticated;

commit;
