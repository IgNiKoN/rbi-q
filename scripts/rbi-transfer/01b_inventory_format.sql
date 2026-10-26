-- P2-0027 этап 1. Формат ссылок на файлы у записей, созданных новым приложением (quality.*), и у старых (public.*) — ТОЛЬКО ЧТЕНИЕ.
select 'quality_photo' s, bucket_name || ' | ' || left(storage_path, 90) || ' | ' || left(public_url, 140) v
  from (select * from quality.rbi_inspection_photos order by created_at desc nulls last limit 3) a
union all
select 'quality_file', bucket || ' | ' || left(storage_path, 90) || ' | ' || left(public_url, 140)
  from (select * from quality.file_registry order by created_at desc nulls last limit 3) b
union all
select 'quality_object', bucket_id || ' | ' || left(name, 120) from (select * from storage.objects where bucket_id like 'quality-%' limit 3) c
union all
select 'public_file', bucket || ' | ' || left(storage_path, 90) || ' | ' || left(public_url, 140)
  from (select * from public.file_registry order by created_at desc nulls last limit 3) d
union all
select 'public_url_hosts', h || ' × ' || n from (
  select substring(m[1] from '^https?://[^/]+') h, count(*) n
    from public.file_registry, regexp_matches(public_url, '^(https?://[^/]+/storage/v1/object/public/)') m group by 1) e
union all
select 'cols_file_registry', string_agg(column_name, ',') from information_schema.columns where table_schema = 'public' and table_name = 'file_registry'
union all
select 'core_projects', count(*)::text || ' объектов ядра всего' from core.projects
union all
select 'platform_admins', count(*)::text from core.platform_admins;
