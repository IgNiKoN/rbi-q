-- Откат P2-0008b (010). Удаляет функции и таблицы КС-2 (ДАННЫЕ АКТОВ, РЕДАКЦИЙ, НАСТРОЕК И БЛАНКОВ КС-2 ТЕРЯЮТСЯ),
-- действие planfact.ks2.view (вместе с выдачей ролям). planfact.fact_totals возвращается к версии 009 (без периода),
-- pf_list_company_audit — к версии 009. Факт, ВОР, цены, сметы и КП не затрагивает. Строки журнала (audit_log) остаются.
drop function if exists public.pf_ks2_revision(uuid);
drop function if exists public.pf_ks2_revisions(uuid);
drop function if exists public.pf_ks2_annul(uuid, text);
drop function if exists public.pf_ks2_issue(uuid);
drop function if exists public.pf_ks2_save(uuid, jsonb, jsonb, text);
drop function if exists public.pf_ks2_act(uuid);
drop function if exists public.pf_ks2_act_create(uuid, text, date, date, date);
drop function if exists public.pf_ks2_acts(uuid);
drop function if exists public.pf_ks2_template(uuid);
drop function if exists public.pf_ks2_template_save(uuid, text, text);
drop function if exists public.pf_ks2_set_contract(uuid, uuid);
drop function if exists public.pf_ks2_settings(uuid);

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
  where a.company_id = p_company and a.table_name in ('company_roles', 'role_assignments', 'projects', 'locations', 'units',
                                                       'vor_imports', 'vor_profiles', 'work_types', 'vor_dictionary',
                                                       'price_items', 'overhead_templates', 'estimates', 'kp_revisions',
                                                       'brigades', 'fact_entries')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke all on function public.pf_list_company_audit(uuid, int) from public, anon;
grant execute on function public.pf_list_company_audit(uuid, int) to authenticated;

drop table if exists planfact.ks2_settings;
alter table if exists planfact.ks2_acts drop constraint if exists ks2_acts_issued_revision_fk;
drop table if exists planfact.ks2_revisions;
drop table if exists planfact.ks2_acts;
drop function if exists planfact.ks2_header(jsonb);
drop function if exists planfact.ks2_rows(uuid, date, uuid, uuid);
drop function if exists planfact.ks2_contract_kp(uuid);
drop function if exists planfact.require_ks2_edit(uuid);
drop function if exists planfact.require_ks2_view(uuid);
drop function if exists planfact.can_ks2_view(uuid);
drop function if exists planfact.ks2_act_guard();
drop function if exists planfact.ks2_revision_guard();

-- fact_totals — как в 009
drop function if exists planfact.fact_totals(uuid, date, date);
create or replace function planfact.fact_totals(p_project uuid)
returns table(position_id uuid, plan_qty numeric, fact_qty numeric, pending_qty numeric, pending_count int)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  select p.id, p.qty,
         coalesce(sum(e.qty) filter (where e.status = 'accepted'), 0),
         coalesce(sum(e.qty) filter (where e.status = 'pending_approval'), 0),
         (count(e.id) filter (where e.status = 'pending_approval'))::int
  from planfact.vor_positions p
  left join planfact.fact_entries e on e.position_id = p.id
  where p.project_id = p_project
  group by p.id, p.qty;
$$;
revoke all on function planfact.fact_totals(uuid) from public, anon, authenticated;

delete from planfact.company_role_permissions where action = 'planfact.ks2.view';
delete from planfact.role_template_permissions where action = 'planfact.ks2.view';
delete from planfact.permission_catalog where action = 'planfact.ks2.view';
