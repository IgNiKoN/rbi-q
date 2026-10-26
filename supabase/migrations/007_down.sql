-- Откат P2-0006 (007). Удаляет функции ВОР, таблицы загрузок, строк, позиций, связок, профилей, словаря и видов работ
-- (ДАННЫЕ ВОР ТЕРЯЮТСЯ), действие planfact.vor.manage (вместе с выдачей ролям). Строки журнала (audit_log) остаются —
-- они неизменяемы; pf_list_company_audit возвращается к версии 006.
drop function if exists public.pf_vor_positions(uuid, uuid);
drop function if exists public.pf_vor_confirm(uuid);
drop function if exists public.pf_vor_resolve_rows(uuid, jsonb);
drop function if exists public.pf_vor_learn(uuid, jsonb);
drop function if exists public.pf_vor_dictionary(uuid);
drop function if exists public.pf_vor_add_work_types(uuid, jsonb);
drop function if exists public.pf_vor_add_work_type(uuid, text, uuid, text);
drop function if exists public.pf_vor_list_work_types(uuid);
drop function if exists public.pf_vor_save_profile(uuid, text, text, jsonb, jsonb);
drop function if exists public.pf_vor_list_profiles(uuid);
drop function if exists public.pf_vor_delete_import(uuid);
drop function if exists public.pf_vor_import_rows(uuid);
drop function if exists public.pf_vor_list_imports(uuid);
drop function if exists public.pf_vor_add_rows(uuid, jsonb);
drop function if exists public.pf_vor_create_import(uuid, text, text, text, uuid, jsonb);

drop function if exists public.pf_list_company_audit(uuid, int);
create function public.pf_list_company_audit(p_company uuid, p_limit int default 50)
returns table(at timestamptz, actor_email text, action text, record_id uuid, subject_email text, old_data jsonb, new_data jsonb,
              table_name text)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select a.at, u.email::text, a.action, a.record_id, su.email::text, a.old_data, a.new_data, a.table_name
  from planfact.audit_log a
  left join auth.users u on u.id = a.actor
  left join auth.users su on su.id = (coalesce(a.new_data, a.old_data) ->> 'user_id')::uuid
  where a.company_id = p_company and a.table_name in ('company_roles', 'role_assignments', 'projects', 'locations', 'units')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke all on function public.pf_list_company_audit(uuid, int) from public, anon;
grant execute on function public.pf_list_company_audit(uuid, int) to authenticated;

drop function if exists planfact.unit_allowed(uuid, uuid);
drop function if exists planfact.require_vor_draft(uuid);
drop function if exists planfact.require_vor_manage(uuid);

-- Триггеры неизменяемости снимаются вместе с таблицами; сначала — чтобы удаление подтверждённых загрузок прошло.
drop trigger if exists vor_links_guard on planfact.vor_links;
drop trigger if exists vor_positions_guard on planfact.vor_positions;
drop trigger if exists vor_source_rows_guard on planfact.vor_source_rows;
drop trigger if exists vor_imports_guard on planfact.vor_imports;
drop table if exists planfact.vor_links;
drop table if exists planfact.vor_positions;
drop table if exists planfact.vor_source_rows;
drop table if exists planfact.vor_imports;
drop table if exists planfact.vor_dictionary;
drop table if exists planfact.vor_profiles;
drop table if exists planfact.work_types;

drop function if exists planfact.vor_guard_confirmed();

delete from planfact.company_role_permissions where action = 'planfact.vor.manage';
delete from planfact.role_template_permissions where action = 'planfact.vor.manage';
delete from planfact.permission_catalog where action = 'planfact.vor.manage';
