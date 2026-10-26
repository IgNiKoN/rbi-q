-- P2-0027 этап 1, доработка 031 (применена на сервере 25.10.2026). Список файлов одного объекта: ссылки ищутся в строке как JSON
-- (to_jsonb), а не как текст записи — в тексте записи ссылка без кавычек захватывала соседнюю запятую («…jpg,»), файл не находился
-- (сверка объекта: 0 файлов вместо 54). Остальное — как в 031. Откат — 031a_rbi_transfer_fix_down.sql (прежняя функция 031).
begin;
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
revoke all on function quality.rbi_transfer_run(uuid, text) from public, anon, authenticated;
commit;
