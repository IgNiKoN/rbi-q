-- P2-0036 этап 2 (CRITICAL, перенос данных). Полный перенос с отчётами одним запросом SQL Editor оборвался через ~6–7 мин и откатился
-- (25.10.2026: панель/шлюз не держат запрос дольше; P2-0027 без снимков укладывался в ~6 мин). Перенос пачками (карточка §8):
-- quality.rbi_transfer_run_part(компания, таблицы, файлы) — то же, что rbi_transfer_run(компания, null), но только для перечисленных таблиц
-- (порядок — как в rbi_transfer_tables: подрядчики раньше договоров, отчёты раньше снимков) и, если p_files, — список файлов всех бакетов.
-- Повтор безопасен (только новые строки). Неизвестная таблица — отказ. Только новая функция в quality; public.* — только чтение.
-- Применять после 036. Откат — 036a_rbi_transfer_parts_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.rbi_transfer_run(uuid,text)') is null or not ('reports' = any (quality.rbi_transfer_buckets())) then
    raise exception '036a: сначала 036' using errcode = 'P0001';
  end if;
end $$;

create function quality.rbi_transfer_run_part(p_company uuid, p_tables text[], p_files boolean default false)
returns table (t text, inserted bigint) language plpgsql as $$
declare
  v_projects jsonb;
  v_auth jsonb;
  v_names jsonb;
  v_n bigint;
  v_res jsonb := '{}';
  v_bad text;
begin
  if not exists (select 1 from quality.rbi_transfer_projects where core_company_id = p_company) then
    raise exception 'Компания не подготовлена к переносу: нет сопоставления проектов (rbi_transfer_projects)' using errcode = 'P0001';
  end if;
  select string_agg(x, ', ') into v_bad from unnest(coalesce(p_tables, '{}')) x where x not in (select quality.rbi_transfer_tables());
  if v_bad is not null then
    raise exception 'Таблицы не переносятся: %', v_bad using errcode = 'P0001';
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

  for t in select x from quality.rbi_transfer_tables() x where x = any (p_tables) loop
    execute format('insert into quality.%1$I select (jsonb_populate_record(null::quality.%1$I, '
                   'quality.rbi_transfer_row($1, %1$L, to_jsonb(p), $2, $3, $4))).* from public.%1$I p where %2$s on conflict do nothing',
                   t, quality.rbi_transfer_filter(p_company, t, null))
      using p_company, v_projects, v_auth, v_names;
    get diagnostics v_n = row_count;
    inserted := v_n;
    v_res := v_res || jsonb_build_object(t, v_n);
    return next;
  end loop;

  if p_files then
    insert into quality.rbi_transfer_files (core_company_id, old_bucket, old_name, size_bytes)
    select p_company, o.bucket_id, o.name, (o.metadata ->> 'size')::bigint from storage.objects o
     where o.bucket_id = any (quality.rbi_transfer_buckets())
    on conflict do nothing;
    get diagnostics v_n = row_count;
    t := 'файлы к копированию'; inserted := v_n; return next;
    v_res := v_res || jsonb_build_object('files', v_n);
  end if;
  insert into quality.rbi_transfer_runs (core_company_id, action, scope, result)
  values (p_company, 'run', 'part', v_res);
end $$;

revoke all on function quality.rbi_transfer_run_part(uuid, text[], boolean) from public, anon, authenticated;

commit;
