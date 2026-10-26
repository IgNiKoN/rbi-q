-- P2-0028: откат 032_company_staff_up.sql. Функции и список сотрудников — как в 020; is_company_member — как после 016.
-- Учётки, созданные функцией (auth.users / auth.identities), участники и назначения ОСТАЮТСЯ (это данные компании);
-- ФИО, флаг «сменить пароль» и отметка «отключён» удаляются вместе с таблицей и столбцами. Вход отключённым
-- (banned_until) не возвращается — снять вручную, если нужно.
begin;
drop function if exists public.pf_company_add_member(uuid, text, text, uuid, uuid);
drop function if exists public.pf_company_reset_password(uuid, uuid);
drop function if exists public.pf_company_disable_member(uuid, uuid);
drop function if exists public.pf_password_changed();
drop function if exists public.pf_my_profile();
drop function if exists core.staff_target(uuid, uuid);
drop function if exists core.staff_set_temp_password(uuid);
drop function if exists core.staff_kill_sessions(uuid);
drop function if exists core.staff_temp_password();
drop function if exists core.staff_email(text);
drop function if exists core.staff_full_name(text);

drop function public.pf_list_company_members(uuid);
create function public.pf_list_company_members(p_company uuid)
returns table(user_id uuid, email text, assignment_id uuid, role_id uuid, role_name text, project_id uuid, project_name text,
              valid_from timestamptz, valid_to timestamptz, is_active boolean, counterparty_id uuid, counterparty_name text)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select m.user_id, u.email::text, a.id, a.role_id, r.name, a.project_id, p.name, a.valid_from, a.valid_to,
         case when a.id is null then null else (a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())) end,
         a.counterparty_id, c.name
  from core.company_members m
  left join auth.users u on u.id = m.user_id
  left join core.role_assignments a on a.company_id = m.company_id and a.user_id = m.user_id and a.revoked_at is null
  left join core.company_roles r on r.id = a.role_id
  left join core.projects p on p.id = a.project_id
  left join core.counterparties c on c.id = a.counterparty_id
  where m.company_id = p_company
  order by u.email, r.name, p.name nulls first;
end $$;
revoke all on function public.pf_list_company_members(uuid) from public, anon;
grant execute on function public.pf_list_company_members(uuid) to authenticated;

create or replace function planfact.is_company_member(p_company uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  select exists (select 1 from core.company_members m
                 where m.company_id = p_company and m.user_id = auth.uid())
      or (planfact.is_platform_admin() and exists (select 1 from core.companies c where c.id = p_company));
$$;

alter table core.company_members drop column if exists disabled_by;
alter table core.company_members drop column if exists disabled_at;
drop table if exists core.user_profiles;
commit;
