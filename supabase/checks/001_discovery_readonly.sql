-- P2-0004 этап 1(а): ТОЛЬКО ЧТЕНИЕ. Ничего не меняет. Выполнить в SQL Editor сервера, результат прислать в чат.
select 'postgres_version' k, version() v
union all select 'schemas', string_agg(nspname, ', ' order by nspname) from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema'
union all select 'planfact_schema_exists', (exists(select 1 from pg_namespace where nspname='planfact'))::text
union all select 'public_tables_count', count(*)::text from pg_tables where schemaname='public'
union all select 'public_functions_count', count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'pf_objects_in_public', coalesce(string_agg(proname, ', '),'нет') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'pf\_%'
union all select 'db_size', pg_size_pretty(pg_database_size(current_database()))
union all select 'extensions', string_agg(extname, ', ' order by extname) from pg_extension
union all select 'postgrest_exposed_schemas_role_config', coalesce((select array_to_string(rolconfig, ' | ') from pg_roles where rolname='authenticator'),'—');
