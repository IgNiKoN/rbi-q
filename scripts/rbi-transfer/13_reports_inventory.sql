-- P2-0036 этап 1. Опись готовых отчётов РБИ (только чтение): коды проектов, объекты, снимки без отчёта, ссылки в HTML снимков,
-- отчёты без файла в бакете reports и файлы без отчёта (почему файлов 382 на 384 отчёта), объём по объекту «ГБДОУ Детский сад №3».
with c as (select id from core.companies where name = 'RBI'),
codes as (select old_code from quality.rbi_transfer_projects where core_company_id = (select id from c)),
r as (select r.*, substring(r.file_url from '/storage/v1/object/public/reports/([^?#]+)') path from public.shared_reports r),
lines as (
  select 1 n, 'отчёты: всего / удалённых / с сопоставленным кодом' k,
         count(*) || ' / ' || count(*) filter (where is_deleted) || ' / ' || count(*) filter (where project_code in (select old_code from codes)) v from r
  union all select 2, 'отчёты: коды проектов', string_agg(project_code || ' ' || n, ', ' order by project_code)
    from (select project_code, count(*) n from r group by 1) x
  union all select 3, 'отчёты: без ключа объекта / без названия объекта',
    count(*) filter (where nullif(project_canonical_key, '') is null) || ' / ' || count(*) filter (where nullif(project_display_name, '') is null) from r
  union all select 4, 'отчёты: ссылка не на бакет reports', count(*) filter (where path is null) || ' (' || coalesce(string_agg(left(file_url, 60), '; ') filter (where path is null), '') || ')' from r
  union all select 5, 'отчёты: файла нет в бакете (id: удалён?)', count(*) || ' (' || coalesce(string_agg(r.id || ':' || coalesce(r.is_deleted::text, '-'), ', '), '') || ')'
    from r where path is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'reports' and o.name = r.path)
  union all select 6, 'отчёты: две записи на один файл', count(*)::text from (select path from r where path is not null group by 1 having count(*) > 1) x
  union all select 7, 'бакет reports: файлов / МБ / без записи отчёта',
    count(*) || ' / ' || round(sum((metadata ->> 'size')::numeric) / 1048576) || ' / ' || count(*) filter (where not exists (select 1 from r where r.path = o.name))
    from storage.objects o where o.bucket_id = 'reports'
  union all select 8, 'снимки: всего / без отчёта (report_id пуст) / коды',
    count(*) || ' / ' || count(*) filter (where report_id is null) || ' / ' || (select string_agg(project_code || ' ' || n, ', ') from (select project_code, count(*) n from public.shared_report_snapshots group by 1) x)
    from public.shared_report_snapshots
  union all select 9, 'снимки: МБ HTML / самый большой МБ', round(sum(length(html_content)) / 1048576.0) || ' / ' || round(max(length(html_content)) / 1048576.0, 1)
    from public.shared_report_snapshots
  union all select 10, 'снимки: со ссылками на бакеты / на какие бакеты', count(*) filter (where html_content like '%/storage/v1/object/%') || ' / '
    || coalesce((select string_agg(distinct b, ', ') from public.shared_report_snapshots s,
                 regexp_matches(s.html_content, '/storage/v1/object/(?:public|sign)/([a-z-]+)/', 'g') m(b0), unnest(m.b0) b), '—')
    from public.shared_report_snapshots
  union all select 11, 'снимки: с картинками внутри (data:image)', count(*) filter (where html_content like '%data:image%')::text from public.shared_report_snapshots
  union all select 12, 'объект «гбдоу детский сад №3»: отчётов / снимков / МБ HTML / МБ файлов',
    (select count(*) from r where lower(coalesce(project_canonical_key, project_display_name)) = 'гбдоу детский сад №3') || ' / '
    || count(*) || ' / ' || round(coalesce(sum(length(s.html_content)), 0) / 1048576.0, 1) || ' / '
    || (select round(coalesce(sum((o.metadata ->> 'size')::numeric), 0) / 1048576.0, 1) from r join storage.objects o on o.bucket_id = 'reports' and o.name = r.path
         where lower(coalesce(r.project_canonical_key, r.project_display_name)) = 'гбдоу детский сад №3')
    from public.shared_report_snapshots s
   where s.report_id in (select id from r where lower(coalesce(project_canonical_key, project_display_name)) = 'гбдоу детский сад №3')
  union all select 13, 'эталоны / практики: строк; файлов в бакетах library-etalons / library-practices',
    (select count(*) from public.shared_etalons) || ' / ' || (select count(*) from public.shared_practices) || '; '
    || (select count(*) from storage.objects where bucket_id = 'library-etalons') || ' / ' || (select count(*) from storage.objects where bucket_id = 'library-practices')
  union all select 14, 'база: размер', pg_size_pretty(pg_database_size(current_database()))
)
select n, k, v from lines order by n;
