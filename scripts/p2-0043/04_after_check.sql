-- P2-0043 этап 3: проверка после 042 на сервере (ТОЛЬКО ЧТЕНИЕ).
select 'open_old_buckets' k, count(*)::text v from storage.buckets where id not like 'quality-%' and public
union all select 'storage_policies_non_quality', count(*)::text from pg_policies where schemaname = 'storage' and policyname not like 'quality\_files\_%'
union all select 'storage_policies_quality', count(*)::text from pg_policies where schemaname = 'storage' and policyname like 'quality\_files\_%'
union all select 'auth_reads_profiles', has_table_privilege('authenticated', 'public.rbi_engineer_profiles', 'SELECT')::text
union all select 'old_files', count(*)::text from storage.objects where bucket_id not like 'quality-%'
union all select 'backup', (select count(*) from p2_backup.p2_0043_buckets) || ' buckets / ' || (select count(*) from p2_backup.p2_0043_policies) || ' policies / ' || (select count(*) from p2_backup.p2_0043_grants) || ' grants'
union all select 'app_errors_1h', (select count(*) from quality.rbi_error_logs where created_at > now() - interval '1 hour')::text;
