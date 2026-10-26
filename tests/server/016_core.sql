-- P2-0015 этап 1: проверка переноса таблиц ядра в схему core (016). Только чтение; отчёт приходит как ERROR P0001.
create or replace function pg_temp.t(ok boolean, msg text) returns text language sql as $f$
  select case when ok then 'OK ' else 'FAIL ' end || msg || E'\n' $f$;

do $$
declare
  v_core text[] := array['companies', 'company_members', 'platform_admins', 'module_catalog', 'company_modules',
    'permission_catalog', 'role_templates', 'role_template_permissions', 'company_roles', 'company_role_permissions',
    'role_assignments', 'projects', 'locations', 'units', 'work_types', 'audit_log'];
  v_module text[] := array['works', 'vor_imports', 'vor_source_rows', 'vor_positions', 'vor_links', 'vor_profiles', 'vor_dictionary',
    'price_items', 'price_history', 'estimates', 'estimate_rows', 'estimate_overheads', 'overhead_templates', 'overhead_lines',
    'kp_revisions', 'fact_entries', 'brigades', 'ks2_settings', 'ks2_acts', 'ks2_revisions'];
  n int; res text := '';
begin
  select count(*) into n from unnest(v_core) t where to_regclass('core.' || t) is not null and to_regclass('planfact.' || t) is null;
  res := res || pg_temp.t(n = cardinality(v_core), 'таблицы ядра — в core, в planfact их нет (' || n || ' из ' || cardinality(v_core) || ')');
  select count(*) into n from unnest(v_module) t where to_regclass('planfact.' || t) is not null;
  res := res || pg_temp.t(n = cardinality(v_module), 'модульные таблицы остались в planfact (' || n || ')');
  res := res || pg_temp.t((select bool_and(rowsecurity) from pg_tables where schemaname = 'core'), 'RLS включена у всех таблиц core');
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname in ('public', 'planfact') and p.prokind = 'f'
     and pg_get_functiondef(p.oid) ~ '(?<![''A-Za-z0-9_])planfact\.(companies|company_members|platform_admins|module_catalog|company_modules|permission_catalog|role_templates|role_template_permissions|company_roles|company_role_permissions|role_assignments|projects|locations|units|work_types|audit_log)(?![A-Za-z0-9_])';
  res := res || pg_temp.t(n = 0, 'в телах функций нет ссылок planfact.<таблица ядра> (' || n || ')');
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname in ('public', 'planfact') and p.prokind = 'f' and array_to_string(p.proconfig, ',') ~ 'search_path=[^,]*planfact'
     and array_to_string(p.proconfig, ',') !~ 'search_path=[^=]*core';
  res := res || pg_temp.t(n = 0, 'у функций с planfact в пути поиска есть и core (без core: ' || n || ')');
  -- как до переноса: authenticated — только SELECT (под RLS) у 10 таблиц, записи напрямую нет; anon — ничего
  select count(*) into n from information_schema.role_table_grants where table_schema = 'core'
     and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type <> 'SELECT'));
  res := res || pg_temp.t(n = 0, 'клиенту запись в таблицы core напрямую не выдана, anon — ничего (' || n || ')');
  res := res || pg_temp.t(not has_schema_privilege('anon', 'core', 'usage'), 'anon не видит схему core');
  raise exception E'ОТЧЁТ (только чтение):\n%\nFAIL всего: %', res, (length(res) - length(replace(res, 'FAIL', ''))) / 4;
end $$;
