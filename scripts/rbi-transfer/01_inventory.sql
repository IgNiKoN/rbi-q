-- P2-0027 этап 1. Инвентаризация данных РБИ перед переносом — ТОЛЬКО ЧТЕНИЕ (ни одной записи).
-- Запуск: SQL Editor общего сервера (по разрешению владельца). Результат — таблица (раздел, ключ, значение) в отчёт.
-- Список таблиц — из information_schema (public, без plan_fact_*); переносимые = quality ∩ public (= TABLES из gen-quality-schema.mjs).
with tabs as (
  select table_name t from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not like 'plan\_fact\_%'
),
cnt as (
  select t, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', t), false, true, '')))[1]::text::bigint n
    from tabs
),
links as (   -- строки со ссылками на файлы (полный адрес Storage или имя бакета в тексте строки); снимки отчётов не сканируются
  select t,
    (xpath('/row/c/text()', query_to_xml(format($q$select count(*) c from public.%I x where x::text like '%%/storage/v1/object/%%'$q$, t), false, true, '')))[1]::text::bigint url_rows,
    (xpath('/row/c/text()', query_to_xml(format($q$select count(*) c from public.%I x where x::text ~ '(inspection-photos|library-(etalons|docs|twi|nodes|practices|checklists)|custom-assets|construction-(plans|defects))/'$q$, t), false, true, '')))[1]::text::bigint path_rows
    from tabs where t not in ('shared_report_snapshots')
)
select * from (
  select 1 o, 'table' section, c.t k,
         c.n || ' строк' || coalesce(', ссылок URL ' || l.url_rows || ', путей ' || l.path_rows, '') v
    from cnt c left join links l using (t) where c.n > 0
  union all
  select 2, 'table_empty', string_agg(t, ', ' order by t), count(*)::text from cnt where n = 0
  union all
  select 3, 'project', coalesce(ap.code, '—'), coalesce(ap.name, ap.title, '') || ' · активен ' || coalesce(ap.is_active::text, '?')
         || ' · проверок ' || (select count(*) from public.rbi_inspections i where i.project_code = ap.code)
         || ' · СК ' || (select count(*) from public.sk_records s where s.project_code = ap.code)
    from public.allowed_projects ap
  union all
  select 4, 'project_other', coalesce(project_code, 'null'), count(*) || ' проверок без allowed_projects'
    from public.rbi_inspections where project_code is null or project_code not in (select code from public.allowed_projects) group by project_code
  union all
  select 5, 'profile', p.project_code || ' / ' || coalesce(p.inspector_name, p.engineer_name, '?'),
         'роль ' || coalesce(p.role, '?') || coalesce(' · подрядчик ' || nullif(p.assigned_contractor, ''), '')
         || ' · auth ' || case when p.auth_user_id is null then 'нет' else coalesce('@' || split_part(coalesce(u.email, p.auth_email), '@', 2), 'без почты') end
         || ' · объекты ' || coalesce(array_to_string(p.assigned_projects, ','), '—')
         || ' · проверок ' || (select count(*) from public.rbi_inspections i where i.engineer_name = p.engineer_name or i.inspector_name = p.inspector_name)
    from public.rbi_engineer_profiles p left join auth.users u on u.id = p.auth_user_id
  union all
  select 6, 'bucket', b.id, case when b.public then 'ПУБЛИЧНЫЙ' else 'закрытый' end || ' · файлов ' || count(o.id)
         || ' · ' || pg_size_pretty(coalesce(sum((o.metadata ->> 'size')::bigint), 0))
    from storage.buckets b left join storage.objects o on o.bucket_id = b.id group by b.id, b.public
  union all
  select 7, 'photo_sample', 'rbi_inspection_photos', coalesce(bucket_name, '?') || ' | ' || left(coalesce(storage_path, ''), 80) || ' | ' || left(coalesce(public_url, ''), 100)
    from (select * from public.rbi_inspection_photos order by created_at desc nulls last limit 2) s
  union all
  select 8, 'photo_json', 'rbi_inspections.photos', jsonb_typeof(photos) || ' · ' || left(photos::text, 160)
    from (select photos from public.rbi_inspections where photos is not null and photos::text not in ('[]', '{}', 'null') order by created_at desc nulls last limit 2) s
  union all
  select 9, 'core', 'company', c.name || ' · ' || c.id || ' · тест ' || c.is_test
    from core.companies c where c.name ilike any (array['rbi', 'рби', '%rbi%', '%рби%'])
  union all
  select 10, 'quality_rows', 'всего строк в quality.*',
         (select sum((xpath('/row/c/text()', query_to_xml(format('select count(*) c from quality.%I', table_name), false, true, '')))[1]::text::bigint)
            from information_schema.tables where table_schema = 'quality' and table_type = 'BASE TABLE')::text
  union all
  select 11, 'size', 'база / public', pg_size_pretty(pg_database_size(current_database())) || ' / '
         || pg_size_pretty((select sum(pg_total_relation_size(format('public.%I', t)::regclass)) from tabs))
) r order by o, k;
