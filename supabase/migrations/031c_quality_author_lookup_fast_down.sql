-- P2-0027. Откат 031c: quality.member_by_email — как в 024_quality_contractor_dirs_up.sql.
begin;
create or replace function quality.member_by_email(p_company uuid, p_email text)
returns uuid language sql stable security definer set search_path = pg_catalog, core as $$
  select m.user_id from core.company_members m join auth.users u on u.id = m.user_id
   where m.company_id = p_company and p_company = quality.request_company()   -- только своя текущая компания
     and quality.has_actions(p_company, null, array['quality.view', 'construction.view'])
     and nullif(btrim(coalesce(p_email, '')), '') is not null
     and lower(u.email::text) = lower(btrim(p_email)) limit 1;
$$;
revoke all on function quality.member_by_email(uuid, text) from public, anon, authenticated;
grant execute on function quality.member_by_email(uuid, text) to authenticated;
commit;
