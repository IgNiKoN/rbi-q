-- Откат P2-0013 (014). Возвращает единую проверку прав, pf_my_permissions и pf_my_company_access как в 001/002/006,
-- удаляет функции администрирования платформы, каталог модулей и список администраторов платформы.
-- company_modules (в т.ч. выключенные модули) и созданные компании остаются; строки журнала (audit_log) остаются.
drop function if exists public.pf_platform_set_company_admin(uuid, text);
drop function if exists public.pf_platform_set_module(uuid, text, boolean);
drop function if exists public.pf_platform_create_company(text, boolean);
drop function if exists public.pf_platform_companies();
drop function if exists public.pf_my_platform();
drop function if exists planfact.require_platform_admin();

create or replace function planfact.is_company_member(p_company uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (select 1 from planfact.company_members m
                 where m.company_id = p_company and m.user_id = auth.uid());
$$;

create or replace function planfact.is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (
    select 1 from planfact.projects pr
    join planfact.company_modules cm on cm.company_id = pr.company_id and cm.module = 'planfact' and cm.enabled
    join planfact.role_assignments a on a.company_id = pr.company_id and a.user_id = auth.uid()
         and (a.project_id = pr.id or a.project_id is null)
         and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
    where pr.id = p_project);
$$;

create or replace function planfact.has_permission(p_project uuid, p_action text)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (
    select 1 from planfact.projects pr
    join planfact.company_modules cm on cm.company_id = pr.company_id and cm.module = 'planfact' and cm.enabled
    join planfact.role_assignments a on a.company_id = pr.company_id and a.user_id = auth.uid()
         and (a.project_id = pr.id or a.project_id is null)
         and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
    join planfact.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = p_action
    join planfact.permission_catalog c on c.action = rp.action
    where pr.id = p_project);
$$;

create or replace function planfact.has_company_permission(p_company uuid, p_action text)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (
    select 1 from planfact.company_modules cm
    join planfact.role_assignments a on a.company_id = cm.company_id and a.user_id = auth.uid() and a.project_id is null
         and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
    join planfact.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = p_action
    join planfact.permission_catalog c on c.action = rp.action
    where cm.company_id = p_company and cm.module = 'planfact' and cm.enabled);
$$;

create or replace function public.pf_my_permissions(p_project uuid)
returns text[] language sql stable security definer set search_path = pg_catalog, planfact as $$
  select coalesce(array_agg(distinct rp.action order by rp.action), '{}')
  from planfact.projects pr
  join planfact.company_modules cm on cm.company_id = pr.company_id and cm.module = 'planfact' and cm.enabled
  join planfact.role_assignments a on a.company_id = pr.company_id and a.user_id = auth.uid()
       and (a.project_id = pr.id or a.project_id is null)
       and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
  join planfact.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id
  join planfact.permission_catalog c on c.action = rp.action
  where pr.id = p_project;
$$;

create or replace function public.pf_my_company_access()
returns table(company_id uuid, company_name text, can_manage_projects boolean, can_manage_units boolean, can_manage_roles boolean)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  select c.id, c.name,
         planfact.has_company_permission(c.id, 'planfact.projects.manage'),
         planfact.has_company_permission(c.id, 'planfact.units.manage'),
         planfact.has_company_permission(c.id, 'security.roles.assign')
  from planfact.companies c
  where auth.uid() is not null and exists (
    select 1 from planfact.company_modules cm
    join planfact.role_assignments a on a.company_id = cm.company_id and a.user_id = auth.uid()
         and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
    where cm.company_id = c.id and cm.module = 'planfact' and cm.enabled)
  order by c.name;
$$;

drop function if exists planfact.is_platform_admin();
drop table if exists planfact.module_catalog;
drop table if exists planfact.platform_admins;
