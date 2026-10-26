-- Откат P2-0007 (009). Удаляет функции, таблицы бригад и записей факта (ДАННЫЕ ФАКТА И БРИГАД ТЕРЯЮТСЯ), колонку
-- projects.fact_tolerance_pct, действия planfact.fact.approve и planfact.brigades.manage (вместе с выдачей ролям).
-- ВОР, цены, сметы и КП (007–008) не затрагивает. Строки журнала (audit_log) остаются — они неизменяемы;
-- pf_list_company_audit возвращается к версии 008.
drop function if exists public.pf_fact_pending(uuid);
drop function if exists public.pf_fact_history(uuid);
drop function if exists public.pf_fact_positions(uuid, uuid);
drop function if exists public.pf_fact_position_totals(uuid);
drop function if exists public.pf_fact_decide(uuid, boolean, text);
drop function if exists public.pf_fact_correct(uuid, numeric, text, text);
drop function if exists public.pf_fact_add_batch(uuid, uuid, date, jsonb, int, text);
drop function if exists public.pf_fact_add(uuid, uuid, date, numeric, int, numeric, text);
drop function if exists public.pf_brigade_archive(uuid, boolean);
drop function if exists public.pf_brigade_save(uuid, uuid, text, text, text);
drop function if exists public.pf_brigade_list(uuid, boolean);
drop function if exists public.pf_list_company_audit(uuid, int);

drop table if exists planfact.fact_entries;
drop table if exists planfact.brigades;
drop function if exists planfact.fact_insert(uuid, uuid, uuid, uuid, date, numeric, int, numeric, text, uuid, uuid, text);
drop function if exists planfact.fact_today();
drop function if exists planfact.fact_totals(uuid);
drop function if exists planfact.can_brigades_company(uuid);
drop function if exists planfact.require_fact_approve(uuid);
drop function if exists planfact.require_fact_create(uuid);
drop function if exists planfact.fact_guard();

alter table planfact.projects drop column if exists fact_tolerance_pct;

delete from planfact.company_role_permissions rp using planfact.company_roles r
  where rp.role_id = r.id and r.template_code = 'company_admin' and rp.action = 'planfact.fact.view';
delete from planfact.role_template_permissions where template_code = 'company_admin' and action = 'planfact.fact.view';
delete from planfact.company_role_permissions where action in ('planfact.fact.approve', 'planfact.brigades.manage');
delete from planfact.role_template_permissions where action in ('planfact.fact.approve', 'planfact.brigades.manage');
delete from planfact.permission_catalog where action in ('planfact.fact.approve', 'planfact.brigades.manage');

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
  where a.company_id = p_company and a.table_name in ('company_roles', 'role_assignments', 'projects', 'locations', 'units',
                                                       'vor_imports', 'vor_profiles', 'work_types', 'vor_dictionary',
                                                       'price_items', 'overhead_templates', 'estimates', 'kp_revisions')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke all on function public.pf_list_company_audit(uuid, int) from public, anon;
grant execute on function public.pf_list_company_audit(uuid, int) to authenticated;
