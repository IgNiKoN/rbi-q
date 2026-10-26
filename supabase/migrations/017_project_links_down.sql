-- P2-0015: откат 017_project_links_up.sql (заказчик/генподрядчик объекта). Применять до 017_counterparties_down.sql.

do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'core.projects'::regclass and conname = 'projects_customer_fk' and confdeltype = 'a') then
    raise exception 'Сначала откатите 017a_core_review' using errcode = 'P0001';
  end if;
end $$;


drop function if exists public.pf_project_set_counterparties(uuid, uuid, uuid);
drop function if exists public.pf_project_counterparties(uuid);
drop function if exists core.counterparty_card(uuid);
alter table core.projects drop constraint if exists projects_customer_fk;
alter table core.projects drop constraint if exists projects_general_contractor_fk;
drop index if exists core.projects_customer_idx;
drop index if exists core.projects_general_contractor_idx;
alter table core.projects drop column if exists customer_id;
alter table core.projects drop column if exists general_contractor_id;

-- pf_company_projects — как после 016 (006 + путь core).
drop function if exists public.pf_company_projects(uuid);
CREATE OR REPLACE FUNCTION public.pf_company_projects(p_company uuid)
 RETURNS TABLE(id uuid, name text, code text, archived_at timestamp with time zone, created_at timestamp with time zone, can_manage boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
  select pr.id, pr.name, pr.code, pr.archived_at, pr.created_at, planfact.has_permission(pr.id, 'planfact.projects.manage')
  from core.projects pr
  where pr.company_id = p_company and auth.uid() is not null and planfact.is_project_member(pr.id)
  order by (pr.archived_at is not null), pr.name;
$function$
;

revoke all on function public.pf_company_projects(uuid) from public, anon;
grant execute on function public.pf_company_projects(uuid) to authenticated;
