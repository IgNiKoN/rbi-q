-- P2-0015 этап 1 (ADR-066 вариант A). Ядро платформы — свой раздел базы `core`.
-- Таблицы ядра (компании, люди и роли, модули, объекты, локации, ЕИ, виды работ, журнал) переносятся
-- из `planfact` в `core` командой `alter table … set schema`: данные, ключи, RLS, политики, триггеры и права
-- переезжают вместе с таблицей. Модульные таблицы (ВОР, цены, сметы, КП, факт, бригады, КС-2) остаются в `planfact`.
-- Имена таблиц, колонок и RPC не меняются. Функции: search_path += core; явные `planfact.<таблица ядра>`
-- в телах переписываются на `core.` (коды прав вида 'planfact.projects.manage' — в кавычках — не трогаются).
-- Объекты RBI/Quality не затрагиваются. Повторное применение безопасно. Откат — 016_core_down.sql.

create schema if not exists core;
grant usage on schema core to authenticated;

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
    if to_regclass('planfact.' || t) is not null and to_regclass('core.' || t) is null then
      execute format('alter table planfact.%I set schema core', t);
    end if;
  end loop;
end $$;

-- Функции План/Факта: путь поиска и явные ссылки на таблицы ядра.
do $$
declare
  r record;
  v_path text;
  v_def text;
  v_new text;
  v_re constant text := '(?<![''A-Za-z0-9_])planfact\.(companies|company_members|platform_admins|module_catalog|company_modules|permission_catalog|role_templates|role_template_permissions|company_roles|company_role_permissions|role_assignments|projects|locations|units|work_types|audit_log)(?![A-Za-z0-9_])';
begin
  for r in
    select p.oid, (select c from unnest(p.proconfig) c where c like 'search_path=%') sp
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prokind = 'f'
       and (n.nspname = 'planfact'
            or (n.nspname = 'public' and (array_to_string(p.proconfig, ',') like '%planfact%' or p.prosrc ~ 'planfact\.')))
  loop
    v_path := substr(r.sp, length('search_path=') + 1);
    if v_path is not null and v_path ~ '(^|, )planfact(,|$)' and v_path !~ '(^|, )core(,|$)' then
      execute format('alter function %s set search_path = %s', r.oid::regprocedure, v_path || ', core');
    end if;
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, v_re, 'core.\1', 'g');
    if v_new is distinct from v_def then
      execute v_new;
    end if;
  end loop;
end $$;
