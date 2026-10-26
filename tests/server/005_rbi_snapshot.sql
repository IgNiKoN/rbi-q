-- P2-0004b: снимок объектов RBI/Quality до и после миграции (только чтение). Значения «до» и «после» должны совпасть,
-- кроме pf_functions. 21.10.2026 до 005: 74 | 43 | f926b2db… | a920ba97… | d09a3113… | 8; после: те же | 17.
-- P2-0015: политики ядра (схема core) исключены так же, как planfact; до 016 значение то же, что раньше.
-- P2-0016: так же исключены политики хранилища компаний (схема quality и quality_files_* в storage); до 018 значение то же.
select (select count(*) from pg_tables where schemaname='public') as public_tables,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname not like 'pf\_%') as rbi_functions,
 (select md5(string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||md5(p.prosrc), ',' order by p.proname, pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname not like 'pf\_%') as rbi_functions_md5,
 (select md5(string_agg(table_name||'.'||column_name||':'||data_type, ',' order by table_name, column_name)) from information_schema.columns where table_schema='public') as public_columns_md5,
 (select md5(string_agg(schemaname||tablename||policyname||coalesce(qual,'')||coalesce(with_check,''), ',' order by schemaname, tablename, policyname)) from pg_policies where schemaname not in ('planfact', 'core', 'quality') and policyname not like 'quality\_%') as non_planfact_policies_md5,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pf\_%') as pf_functions;
