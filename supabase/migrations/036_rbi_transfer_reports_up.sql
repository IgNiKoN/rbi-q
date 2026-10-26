-- P2-0036 этап 1 (CRITICAL, перенос данных). Готовые отчёты РБИ переносятся в компанию (решение владельца 25.10.2026, пересмотр P2-0027):
-- shared_reports, shared_report_snapshots — в списке переносимых таблиц, бакет reports — в списке бакетов (файлы → quality-reports/<компания>/…).
-- Отчёты — раньше снимков (снимок ссылается на отчёт: report_id → shared_reports(id, компания)); снимок переносится вместе со своим отчётом
-- (без отчёта — если код проекта сопоставлен). Один объект: отчёты по ключу объекта, снимки — его отчётов; файлы — и из ссылок отчётов и снимков.
-- Сверка — дополнительно по каждому бакету: файлов в бакете РБИ / в списке / скопировано (есть в бакете компании), размер старое = новое, ошибок 0.
-- Только create or replace функций P2-0027 (031, 031a) в quality; public.* и бакеты РБИ — только чтение; правило видимости 033 не меняется.
-- Применять после 033c, одним запросом. Откат — 036_rbi_transfer_reports_down.sql (функции как после 031c).
begin;

do $$
begin
  if to_regprocedure('quality.rbi_transfer_run(uuid,text)') is null or to_regclass('quality.shared_report_snapshots') is null then
    raise exception '036: сначала 031–031c (перенос РБИ)' using errcode = 'P0001';
  end if;
end $$;

-- 2. Бакеты, файлы которых переносятся (с 036 — и reports)
create or replace function quality.rbi_transfer_buckets() returns text[] language sql immutable as $$
  select array['construction-defects', 'construction-plans', 'custom-assets', 'inspection-photos', 'library-checklists',
               'library-docs', 'library-etalons', 'library-nodes', 'library-practices', 'library-twi', 'reports']
$$;

-- 3. Переносимые таблицы: есть в public и в quality; contractors — раньше contracts, shared_reports — раньше shared_report_snapshots
create or replace function quality.rbi_transfer_tables() returns setof text language sql stable as $$
  select q.table_name::text from information_schema.tables q
    join information_schema.tables p on p.table_schema = 'public' and p.table_name = q.table_name and p.table_type = 'BASE TABLE'
   where q.table_schema = 'quality' and q.table_type = 'BASE TABLE' and q.table_name not like 'rbi\_transfer\_%'
   order by (q.table_name = 'contractors') desc, (q.table_name = 'shared_report_snapshots'), q.table_name
$$;

-- 4. Условие отбора строк public.<таблица>: код проекта — только сопоставленный; p_object — один объект (ключ объекта РБИ)
create or replace function quality.rbi_transfer_filter(p_company uuid, p_table text, p_object text) returns text language plpgsql stable as $$
declare
  v_codes text := format('(select old_code from quality.rbi_transfer_projects where core_company_id = %L)', p_company);
  v_pc boolean := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = 'project_code');
  v_where text := 'true';
  v_rep text;
begin
  if p_table = 'allowed_projects' then v_where := format('p.code in %s', v_codes);
  elsif p_table = 'shared_report_snapshots' then
    -- снимок — вместе со своим отчётом (внешний ключ); без отчёта — по коду проекта
    v_rep := format('select r.id from public.shared_reports r where r.project_code in %s', v_codes);
    if p_object is not null then
      v_rep := v_rep || format(' and lower(coalesce(r.project_canonical_key, r.project_display_name)) = lower(%L)', p_object);
    end if;
    v_where := format('(p.report_id in (%s) or (p.report_id is null and p.project_code in %s', v_rep, v_codes)
               || case when p_object is null then '))' else format(' and lower(p.project_canonical_key) = lower(%L)))', p_object) end;
    return v_where;
  elsif v_pc then v_where := format('(p.project_code is null or p.project_code in %s)', v_codes);
  end if;
  if p_object is not null then
    -- ключ объекта у задач записан с заглавными буквами (= название), у проверок — строчными
    if p_table in ('rbi_inspections', 'rbi_tasks') then
      v_where := v_where || format(' and lower(p.project_canonical_key) = lower(%L)', p_object);
    elsif p_table in ('rbi_inspection_items', 'rbi_inspection_photos') then
      v_where := v_where || format(' and p.inspection_id in (select id from public.rbi_inspections where lower(project_canonical_key) = lower(%L))', p_object);
    elsif p_table = 'shared_reports' then
      v_where := v_where || format(' and lower(coalesce(p.project_canonical_key, p.project_display_name)) = lower(%L)', p_object);
    else
      v_where := 'false';
    end if;
  end if;
  return v_where;
end $$;

-- 6. Перенос: строки всех таблиц (или одного объекта) + список файлов к копированию. Повтор — только новые строки.
create or replace function quality.rbi_transfer_run(p_company uuid, p_object text default null)
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

  -- файлы: все файлы переносимых бакетов; для одного объекта — только файлы, на которые ссылаются его записи (с 036 — и отчёты, снимки)
  insert into quality.rbi_transfer_files (core_company_id, old_bucket, old_name, size_bytes)
  select p_company, o.bucket_id, o.name, (o.metadata ->> 'size')::bigint from storage.objects o
   where o.bucket_id = any (quality.rbi_transfer_buckets())
     and (p_object is null or (o.bucket_id, o.name) in (
           select m[1], m[2] from (
             select to_jsonb(x)::text s from public.rbi_inspections x where lower(project_canonical_key) = lower(p_object)
             union all select to_jsonb(x)::text from public.rbi_tasks x where lower(project_canonical_key) = lower(p_object)
             union all select to_jsonb(x)::text from public.rbi_inspection_photos x
              where inspection_id in (select id from public.rbi_inspections where lower(project_canonical_key) = lower(p_object))
             union all select to_jsonb(x)::text from public.shared_reports x
              where x.project_code in (select old_code from quality.rbi_transfer_projects where core_company_id = p_company)
                and lower(coalesce(x.project_canonical_key, x.project_display_name)) = lower(p_object)
             union all select to_jsonb(x)::text from public.shared_report_snapshots x
              where x.report_id in (select r.id from public.shared_reports r
                                     where r.project_code in (select old_code from quality.rbi_transfer_projects where core_company_id = p_company)
                                       and lower(coalesce(r.project_canonical_key, r.project_display_name)) = lower(p_object))) r,
           regexp_matches(r.s, '/storage/v1/object/public/([a-z-]+)/([^"\\?#[:space:]]+)', 'g') m))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  t := 'файлы к копированию'; inserted := v_n; return next;
  insert into quality.rbi_transfer_runs (core_company_id, action, scope, result)
  values (p_company, 'run', coalesce(p_object, 'all'), v_res || jsonb_build_object('files', v_n));
end $$;

-- 7. Сверка (только чтение): строк в public (все / подходящих) и в quality компании; для одного объекта — по его записям;
-- с 036 — по каждому бакету: файлов в бакете РБИ (old_all) / в списке (old_eligible) / скопировано и есть в бакете компании (new_rows);
-- ok — всё из бакета в списке (для одного объекта — не требуется), всё скопировано, ошибок 0, размер старое = новое.
create or replace function quality.rbi_transfer_verify(p_company uuid, p_object text default null)
returns table (t text, old_all bigint, old_eligible bigint, new_rows bigint, ok boolean) language plpgsql stable as $$
declare
  v_key text;
  v_err bigint;
  v_size_old numeric;
  v_size_new numeric;
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
  -- файлы по бакетам
  for v_key in select unnest(quality.rbi_transfer_buckets()) loop
    select count(*), coalesce(sum((o.metadata ->> 'size')::numeric), 0) into old_all, v_size_old
      from storage.objects o where o.bucket_id = v_key;
    select count(*), count(*) filter (where l.copied_at is not null and n.name is not null), count(*) filter (where l.error is not null),
           coalesce(sum((o.metadata ->> 'size')::numeric), 0), coalesce(sum((n.metadata ->> 'size')::numeric), 0)
      into old_eligible, new_rows, v_err, v_size_old, v_size_new
      from quality.rbi_transfer_files l
      left join storage.objects o on o.bucket_id = l.old_bucket and o.name = l.old_name
      left join storage.objects n on n.bucket_id = 'quality-' || l.old_bucket and n.name = p_company || '/' || l.old_name
     where l.core_company_id = p_company and l.old_bucket = v_key;
    if p_object is null then
      select coalesce(sum((o.metadata ->> 'size')::numeric), 0) into v_size_old from storage.objects o where o.bucket_id = v_key;
    end if;
    t := format('файлы %s (в бакете / в списке / скопировано; МБ %s = %s; ошибок %s)', v_key,
                round(v_size_old / 1048576, 1), round(v_size_new / 1048576, 1), v_err);
    ok := (p_object is not null or old_all = old_eligible) and old_eligible = new_rows and v_err = 0 and v_size_old = v_size_new;
    return next;
  end loop;
end $$;

revoke all on function quality.rbi_transfer_buckets(), quality.rbi_transfer_tables(), quality.rbi_transfer_filter(uuid, text, text),
  quality.rbi_transfer_run(uuid, text), quality.rbi_transfer_verify(uuid, text)
  from public, anon, authenticated;

commit;
