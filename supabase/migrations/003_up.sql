-- P2-0004 этап 3: контекст пользователя для шапки («компания · роль»). Только добавляет функцию public.pf_my_context.
create or replace function public.pf_my_context()
returns table(company_id uuid, company_name text, role_name text, project_id uuid)
language sql stable security invoker set search_path = pg_catalog, planfact as $$
  select c.id, c.name, r.name, a.project_id
  from planfact.role_assignments a
  join planfact.company_roles r on r.id = a.role_id and r.company_id = a.company_id
  join planfact.companies c on c.id = a.company_id
  where a.user_id = auth.uid() and a.revoked_at is null and a.valid_from <= now()
    and (a.valid_to is null or a.valid_to > now())
  order by c.name, r.name;
$$;
revoke all on function public.pf_my_context() from public, anon;
grant execute on function public.pf_my_context() to authenticated;
