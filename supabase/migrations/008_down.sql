-- Откат P2-0006c (008). Удаляет функции и таблицы цен, истории цен, шаблона надбавок, смет, строк смет, надбавок смет
-- и редакций КП (ДАННЫЕ ЦЕН, СМЕТ И КП ТЕРЯЮТСЯ), действие planfact.estimate.manage (вместе с выдачей ролям).
-- Таблицы и данные ВОР (007) не затрагивает. Строки журнала (audit_log) остаются — они неизменяемы;
-- pf_list_company_audit возвращается к версии 007.
drop function if exists public.pf_kp_get(uuid);
drop function if exists public.pf_kp_list(uuid);
drop function if exists public.pf_kp_create(uuid, text, jsonb, numeric, text);
drop function if exists public.pf_estimate_save_overheads(uuid, jsonb);
drop function if exists public.pf_estimate_overheads(uuid);
drop function if exists public.pf_estimate_refill(uuid);
drop function if exists public.pf_estimate_set_prices(uuid, jsonb);
drop function if exists public.pf_estimate_rows(uuid);
drop function if exists public.pf_estimate_list(uuid);
drop function if exists public.pf_estimate_update(uuid, text, numeric);
drop function if exists public.pf_estimate_create(uuid, text, uuid[], numeric);
drop function if exists public.pf_overhead_save_template(uuid, jsonb);
drop function if exists public.pf_overhead_template(uuid);
drop function if exists public.pf_price_history(uuid);
drop function if exists public.pf_price_delete(uuid);
drop function if exists public.pf_price_upsert(uuid, jsonb, text);
drop function if exists public.pf_price_list(uuid);

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
                                                       'vor_imports', 'vor_profiles', 'work_types', 'vor_dictionary')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke all on function public.pf_list_company_audit(uuid, int) from public, anon;
grant execute on function public.pf_list_company_audit(uuid, int) to authenticated;

-- require_estimate возвращает тип таблицы estimates — снимается до таблиц.
drop function if exists planfact.require_estimate(uuid, boolean);

-- Триггер неизменяемости снимается первым — иначе удаление редакций КП не пройдёт.
drop trigger if exists kp_revisions_guard on planfact.kp_revisions;
drop table if exists planfact.kp_revisions;
drop table if exists planfact.estimate_overheads;
drop table if exists planfact.estimate_rows;
drop table if exists planfact.estimates;
drop table if exists planfact.overhead_lines;
drop table if exists planfact.overhead_templates;
drop table if exists planfact.price_history;
drop table if exists planfact.price_items;

-- Остальные служебные функции (политики RLS ссылаются на can_estimate_company — после таблиц).
drop function if exists planfact.estimate_fill_reference(uuid, uuid, uuid[]);
drop function if exists planfact.ensure_overhead_template(uuid);
drop function if exists planfact.overhead_default_lines();
drop function if exists planfact.check_overhead_lines(jsonb);
drop function if exists planfact.require_estimate_manage(uuid);
drop function if exists planfact.require_estimate_company(uuid);
drop function if exists planfact.can_estimate_company(uuid);
drop function if exists planfact.kp_guard_immutable();

delete from planfact.company_role_permissions where action = 'planfact.estimate.manage';
delete from planfact.role_template_permissions where action = 'planfact.estimate.manage';
delete from planfact.permission_catalog where action = 'planfact.estimate.manage';
