-- P2-0018: отпечаток структуры (ТОЛЬКО ЧТЕНИЕ) для проверки «откат побайтно»: запуск до миграции и после up → down,
-- строки должны совпасть. Функции, правила RLS, колонки, ограничения, индексы, триггеры схем quality/core/planfact/storage,
-- функции public.pf_*, справочник прав и права шаблонов.
select 'functions' as k, md5(string_agg(pg_get_functiondef(p.oid), E'\n' order by p.oid::regprocedure::text)) as v
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname in ('quality', 'core', 'planfact') or (n.nspname = 'public' and p.proname like 'pf\_%')) and p.prokind = 'f'
union all
select 'grants', md5(string_agg(p.oid::regprocedure::text || coalesce(p.proacl::text, ''), E'\n' order by p.oid::regprocedure::text))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('quality', 'core', 'planfact') or (n.nspname = 'public' and p.proname like 'pf\_%')
union all
select 'policies', md5(string_agg(concat_ws('|', schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check), E'\n'
                                  order by schemaname, tablename, policyname))
  from pg_policies where schemaname in ('quality', 'core', 'planfact', 'storage')
union all
select 'columns', md5(string_agg(concat_ws('|', table_schema, table_name, column_name, data_type, is_nullable, column_default), E'\n'
                                 order by table_schema, table_name, column_name))
  from information_schema.columns where table_schema in ('quality', 'core', 'planfact')
union all
select 'constraints', md5(string_agg(concat_ws('|', n.nspname, c.conrelid::regclass::text, c.conname, pg_get_constraintdef(c.oid)), E'\n'
                                     order by n.nspname, c.conrelid::regclass::text, c.conname))
  from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname in ('quality', 'core', 'planfact')
union all
select 'indexes', md5(string_agg(indexdef, E'\n' order by schemaname, indexname)) from pg_indexes where schemaname in ('quality', 'core', 'planfact')
union all
select 'triggers', md5(string_agg(t.tgrelid::regclass::text || '|' || pg_get_triggerdef(t.oid), E'\n' order by t.tgrelid::regclass::text, t.tgname))
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
 where not t.tgisinternal and n.nspname in ('quality', 'core', 'planfact', 'storage', 'public')
union all
select 'permission_catalog', md5(string_agg(action || '|' || coalesce(description, ''), E'\n' order by action)) from core.permission_catalog
union all
select 'template_permissions', md5(string_agg(template_code || '|' || action, E'\n' order by template_code, action)) from core.role_template_permissions
union all
select 'role_permissions', md5(string_agg(r.template_code || '|' || rp.action, E'\n' order by r.template_code, rp.action))
  from core.company_role_permissions rp join core.company_roles r on r.id = rp.role_id
order by 1;
