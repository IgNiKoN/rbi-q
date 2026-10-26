-- P2-0042 этап 3: проверка после 041 на сервере (ТОЛЬКО ЧТЕНИЕ).
select 'anon_tables' k, count(*)::text v from pg_class c join pg_namespace s on s.oid = c.relnamespace
 where s.nspname = 'public' and c.relkind in ('r','v','m','p','f') and has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
union all select 'auth_tables', count(*)::text from pg_class c join pg_namespace s on s.oid = c.relnamespace
 where s.nspname = 'public' and c.relkind in ('r','v','m','p','f') and has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
union all select 'anon_functions_non_pf', count(*)::text from pg_proc p join pg_namespace s on s.oid = p.pronamespace
 where s.nspname = 'public' and p.proname not like 'pf\_%' and has_function_privilege('anon', p.oid, 'EXECUTE')
   and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
union all select 'auth_pf_functions', count(*)::text from pg_proc p join pg_namespace s on s.oid = p.pronamespace
 where s.nspname = 'public' and p.proname like 'pf\_%' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
union all select 'true_policies', count(*)::text from pg_policies where schemaname = 'public' and roles && array['anon','public']::name[] and (qual = 'true' or with_check = 'true')
union all select 'anon_defaults', count(*)::text from pg_default_acl a join pg_namespace n on n.oid = a.defaclnamespace, aclexplode(a.defaclacl) x
 where n.nspname = 'public' and x.grantee = 'anon'::regrole and a.defaclobjtype in ('r','S','f')
union all select 'backup', (select count(*) from p2_backup.p2_0042_grants) || ' grants / ' || (select count(*) from p2_backup.p2_0042_policies) || ' policies / ' || (select count(*) from p2_backup.p2_0042_defaults) || ' defaults'
union all select 'rows_public', (select count(*) from public.location_nodes) || ' places / ' || (select count(*) from public.shared_report_snapshots) || ' snapshots / ' || (select count(*) from public.rbi_inspections) || ' inspections'
union all select 'app_errors_1h', (select count(*) from quality.rbi_error_logs where created_at > now() - interval '1 hour')::text;
