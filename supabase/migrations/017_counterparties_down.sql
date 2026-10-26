-- P2-0015: откат 017_counterparties_up.sql (контрагенты, право, updated_at/deleted_at ядра). Применять до 016_core_down.sql.
-- Удаляет контрагентов. Записи журнала о них остаются (журнал неизменяем).

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'projects' and column_name = 'customer_id') then
    raise exception 'Сначала откатите 017_project_links' using errcode = 'P0001';
  end if;
end $$;

drop function if exists public.pf_counterparties_list(uuid, boolean);
drop function if exists public.pf_counterparties_save(uuid, uuid, text, text, text, text[], jsonb);
drop function if exists public.pf_counterparties_archive(uuid, boolean);
drop function if exists core.require_counterparties_manage(uuid);
drop function if exists core.counterparty_snapshot(core.counterparties);
drop table if exists core.counterparties;

delete from core.company_role_permissions where action = 'core.counterparties.manage';
delete from core.role_template_permissions where action = 'core.counterparties.manage';
delete from core.permission_catalog where action = 'core.counterparties.manage';

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'company_members', 'platform_admins', 'module_catalog', 'company_modules',
    'permission_catalog', 'role_templates', 'role_template_permissions',
    'company_roles', 'company_role_permissions', 'role_assignments',
    'projects', 'locations', 'units', 'work_types'
  ] loop
    execute format('drop trigger if exists %I on core.%I', t || '_touch', t);
    execute format('alter table core.%I drop column if exists updated_at', t);
  end loop;
  foreach t in array array['companies', 'projects', 'company_roles'] loop
    execute format('alter table core.%I drop column if exists deleted_at', t);
  end loop;
end $$;
drop function if exists core.touch_updated_at();

-- pf_my_company_access и pf_list_company_audit — как после 016 (014 / 010 + путь core).
drop function if exists public.pf_my_company_access();
CREATE OR REPLACE FUNCTION public.pf_list_company_audit(p_company uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(at timestamp with time zone, actor_email text, action text, record_id uuid, subject_email text, old_data jsonb, new_data jsonb, table_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select a.at, u.email::text, a.action, a.record_id, su.email::text, a.old_data, a.new_data, a.table_name
  from core.audit_log a
  left join auth.users u on u.id = a.actor
  left join auth.users su on su.id = (coalesce(a.new_data, a.old_data) ->> 'user_id')::uuid
  where a.company_id = p_company and a.table_name in ('company_roles', 'role_assignments', 'projects', 'locations', 'units',
                                                       'vor_imports', 'vor_profiles', 'work_types', 'vor_dictionary',
                                                       'price_items', 'overhead_templates', 'estimates', 'kp_revisions',
                                                       'brigades', 'fact_entries', 'ks2_settings', 'ks2_acts')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $function$
;

CREATE OR REPLACE FUNCTION public.pf_my_company_access()
 RETURNS TABLE(company_id uuid, company_name text, can_manage_projects boolean, can_manage_units boolean, can_manage_roles boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
  select c.id, c.name,
         planfact.has_company_permission(c.id, 'planfact.projects.manage'),
         planfact.has_company_permission(c.id, 'planfact.units.manage'),
         planfact.has_company_permission(c.id, 'security.roles.assign')
  from core.companies c
  where auth.uid() is not null and exists (
    select 1 from core.company_modules cm
    where cm.company_id = c.id and cm.module = 'planfact' and cm.enabled
      and (planfact.is_platform_admin() or exists (
        select 1 from core.role_assignments a
        where a.company_id = cm.company_id and a.user_id = auth.uid()
          and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))))
  order by c.name;
$function$
;

revoke all on function public.pf_my_company_access(), public.pf_list_company_audit(uuid, int) from public, anon;
grant execute on function public.pf_my_company_access(), public.pf_list_company_audit(uuid, int) to authenticated;
