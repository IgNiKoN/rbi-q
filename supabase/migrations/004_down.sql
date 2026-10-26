-- Откат этапа 4: журнал и сумма удаляются, чтение работ возвращается к варианту после 001/002.
drop function if exists public.pf_list_audit(uuid, int);
drop function if exists public.pf_list_works(uuid);
drop trigger if exists works_audit on planfact.works;
drop function if exists planfact.log_works_change();
drop table if exists planfact.audit_log;
drop function if exists planfact.audit_immutable();
alter table planfact.works drop column if exists plan_amount;
grant select on planfact.works to authenticated;
create or replace function public.pf_list_works(p_project uuid)
returns setof planfact.works language sql stable security invoker set search_path = pg_catalog, planfact as $$
  select * from planfact.works where project_id = p_project order by created_at, id;
$$;
revoke all on function public.pf_list_works(uuid) from public, anon;
grant execute on function public.pf_list_works(uuid) to authenticated;
