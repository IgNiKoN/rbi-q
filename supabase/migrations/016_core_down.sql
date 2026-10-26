-- P2-0015: откат 016_core_up.sql — таблицы ядра обратно в `planfact`, функции — как до 016.
-- Перед откатом 016 нужно откатить 017a → 017_project_links → 017_counterparties (схема `core` должна остаться пустой).

do $$
begin
  if to_regclass('core.counterparties') is not null then
    raise exception 'Сначала откатите 017a, 017_project_links и 017_counterparties' using errcode = 'P0001';
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'company_members', 'platform_admins', 'module_catalog', 'company_modules',
    'permission_catalog', 'role_templates', 'role_template_permissions',
    'company_roles', 'company_role_permissions', 'role_assignments',
    'projects', 'locations', 'units', 'work_types', 'audit_log'
  ] loop
    if to_regclass('core.' || t) is not null and to_regclass('planfact.' || t) is null then
      execute format('alter table core.%I set schema planfact', t);
    end if;
  end loop;
end $$;

-- Функции: после возврата таблиц (типы строк planfact.<таблица> должны существовать).
do $$
declare
  r record;
  v_path text;
  v_def text;
  v_new text;
  v_re constant text := '(?<![''A-Za-z0-9_])core\.(companies|company_members|platform_admins|module_catalog|company_modules|permission_catalog|role_templates|role_template_permissions|company_roles|company_role_permissions|role_assignments|projects|locations|units|work_types|audit_log)(?![A-Za-z0-9_])';
begin
  for r in
    select p.oid, (select c from unnest(p.proconfig) c where c like 'search_path=%') sp
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prokind = 'f'
       and (n.nspname = 'planfact'
            or (n.nspname = 'public' and (array_to_string(p.proconfig, ',') like '%planfact%' or p.prosrc ~ '(?<![''A-Za-z0-9_])core\.(companies|company_members|platform_admins|module_catalog|company_modules|permission_catalog|role_templates|role_template_permissions|company_roles|company_role_permissions|role_assignments|projects|locations|units|work_types|audit_log)(?![A-Za-z0-9_])')))
  loop
    v_path := substr(r.sp, length('search_path=') + 1);
    if v_path is not null and v_path ~ ', core$' then
      execute format('alter function %s set search_path = %s', r.oid::regprocedure, regexp_replace(v_path, ', core$', ''));
    end if;
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, v_re, 'planfact.\1', 'g');
    if v_new is distinct from v_def then
      execute v_new;
    end if;
  end loop;
end $$;

revoke usage on schema core from authenticated;
drop schema if exists core;
