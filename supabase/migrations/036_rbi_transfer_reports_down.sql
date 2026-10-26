-- P2-0036. Откат 036: функции переноса — как после 031c (тексты 031 — бакеты, таблицы, отбор, сверка; 031a — перенос), отчёты снова
-- не переносятся. Перенесённые строки и файлы не удаляет (очистка — quality.rbi_transfer_clear и scripts/rbi-transfer/files.mjs clear до отката).
begin;

create or replace function quality.rbi_transfer_buckets() returns text[] language sql immutable as $$
  select array['construction-defects', 'construction-plans', 'custom-assets', 'inspection-photos', 'library-checklists',
               'library-docs', 'library-etalons', 'library-nodes', 'library-practices', 'library-twi']
$$;

create or replace function quality.rbi_transfer_tables() returns setof text language sql stable as $$
  select q.table_name::text from information_schema.tables q
    join information_schema.tables p on p.table_schema = 'public' and p.table_name = q.table_name and p.table_type = 'BASE TABLE'
   where q.table_schema = 'quality' and q.table_type = 'BASE TABLE'
     and q.table_name not in ('shared_reports', 'shared_report_snapshots') and q.table_name not like 'rbi\_transfer\_%'
   order by (q.table_name = 'contractors') desc, q.table_name
$$;

create or replace function quality.rbi_transfer_filter(p_company uuid, p_table text, p_object text) returns text language plpgsql stable as $$
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

  -- файлы: все файлы переносимых бакетов; для одного объекта — только файлы, на которые ссылаются его записи
  insert into quality.rbi_transfer_files (core_company_id, old_bucket, old_name, size_bytes)
  select p_company, o.bucket_id, o.name, (o.metadata ->> 'size')::bigint from storage.objects o
   where o.bucket_id = any (quality.rbi_transfer_buckets())
     and (p_object is null or (o.bucket_id, o.name) in (
           select m[1], m[2] from (
             select to_jsonb(x)::text s from public.rbi_inspections x where lower(project_canonical_key) = lower(p_object)
             union all select to_jsonb(x)::text from public.rbi_tasks x where lower(project_canonical_key) = lower(p_object)
             union all select to_jsonb(x)::text from public.rbi_inspection_photos x
              where inspection_id in (select id from public.rbi_inspections where lower(project_canonical_key) = lower(p_object))) r,
           regexp_matches(r.s, '/storage/v1/object/public/([a-z-]+)/([^"\\?#[:space:]]+)', 'g') m))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  t := 'файлы к копированию'; inserted := v_n; return next;
  insert into quality.rbi_transfer_runs (core_company_id, action, scope, result)
  values (p_company, 'run', coalesce(p_object, 'all'), v_res || jsonb_build_object('files', v_n));
end $$;

create or replace function quality.rbi_transfer_verify(p_company uuid, p_object text default null)
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

revoke all on function quality.rbi_transfer_buckets(), quality.rbi_transfer_tables(), quality.rbi_transfer_filter(uuid, text, text),
  quality.rbi_transfer_run(uuid, text), quality.rbi_transfer_verify(uuid, text)
  from public, anon, authenticated;

commit;
