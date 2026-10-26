-- Откат этапа 2: возвращает состояние после 001 (project_members пустая; назначения ролей теряются).
create table if not exists planfact.project_members (
  project_id uuid not null,
  company_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (project_id, company_id) references planfact.projects(id, company_id) on delete cascade,
  foreign key (company_id, user_id) references planfact.company_members(company_id, user_id) on delete cascade
);
alter table planfact.project_members enable row level security;
create or replace function planfact.is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (select 1 from planfact.project_members m
                 where m.project_id = p_project and m.user_id = auth.uid());
$$;
drop policy if exists project_members_select on planfact.project_members;
create policy project_members_select on planfact.project_members for select to authenticated using (user_id = auth.uid());
drop policy if exists works_select on planfact.works;
create policy works_select on planfact.works for select to authenticated using (planfact.is_project_member(project_id));
drop policy if exists works_insert on planfact.works;
create policy works_insert on planfact.works for insert to authenticated
  with check (created_by = auth.uid() and planfact.is_project_member(project_id));
grant select on planfact.project_members to authenticated;

drop function if exists public.pf_revoke_assignment(uuid);
drop function if exists public.pf_assign_role(uuid, uuid, uuid, timestamptz);
drop function if exists public.pf_my_permissions(uuid);
drop trigger if exists companies_init_defaults on planfact.companies;
drop function if exists planfact.init_company_defaults();
drop function if exists planfact.has_company_permission(uuid, text);
drop function if exists planfact.has_permission(uuid, text);
drop table if exists planfact.role_assignments;
drop table if exists planfact.company_role_permissions;
drop table if exists planfact.company_roles;
drop table if exists planfact.company_modules;
drop table if exists planfact.role_template_permissions;
drop table if exists planfact.role_templates;
drop table if exists planfact.permission_catalog;
