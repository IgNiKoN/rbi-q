-- Откат P2-0005 этап 1 (006). Удаляет функции экранов, таблицы локаций и единиц (ДАННЫЕ ПРОЕКТОВ-ЛОКАЦИЙ И СВОИХ ЕДИНИЦ ТЕРЯЮТСЯ),
-- два новых действия каталога (вместе с их выдачей ролям) и колонки projects.code / archived_at.
-- Строки журнала (audit_log) остаются — они неизменяемы; pf_list_company_audit возвращается к версии 005.
drop function if exists public.pf_delete_unit(uuid);
drop function if exists public.pf_add_unit(uuid, text, text);
drop function if exists public.pf_list_units(uuid);
drop function if exists public.pf_generate_building(uuid, uuid, text, int, int, int, int);
drop function if exists public.pf_delete_location(uuid, boolean);
drop function if exists public.pf_move_location(uuid, uuid);
drop function if exists public.pf_rename_location(uuid, text);
drop function if exists public.pf_add_location(uuid, uuid, text, text, numeric);
drop function if exists public.pf_location_path(uuid);
drop function if exists public.pf_list_locations(uuid, uuid);
drop function if exists public.pf_update_project(uuid, text, text, boolean);
drop function if exists public.pf_create_project(uuid, text, text);
drop function if exists public.pf_company_projects(uuid);
drop function if exists public.pf_my_company_access();

drop function if exists public.pf_list_company_audit(uuid, int);
create function public.pf_list_company_audit(p_company uuid, p_limit int default 50)
returns table(at timestamptz, actor_email text, action text, record_id uuid, subject_email text, old_data jsonb, new_data jsonb)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select a.at, u.email::text, a.action, a.record_id, su.email::text, a.old_data, a.new_data
  from planfact.audit_log a
  left join auth.users u on u.id = a.actor
  left join auth.users su on su.id = (coalesce(a.new_data, a.old_data) ->> 'user_id')::uuid
  where a.company_id = p_company and a.table_name in ('company_roles', 'role_assignments')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke all on function public.pf_list_company_audit(uuid, int) from public, anon;
grant execute on function public.pf_list_company_audit(uuid, int) to authenticated;

drop function if exists planfact.location_path(uuid);
drop function if exists planfact.require_units_manage(uuid);
drop function if exists planfact.require_project_manage(uuid, boolean);
drop function if exists planfact.canon_name(text);

drop table if exists planfact.locations;
drop table if exists planfact.units;

delete from planfact.company_role_permissions where action in ('planfact.projects.manage', 'planfact.units.manage');
delete from planfact.role_template_permissions where action in ('planfact.projects.manage', 'planfact.units.manage');
delete from planfact.permission_catalog where action in ('planfact.projects.manage', 'planfact.units.manage');

alter table planfact.projects drop column if exists archived_at;
alter table planfact.projects drop column if exists code;
