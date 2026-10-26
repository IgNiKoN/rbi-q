-- P2-0004 этап 1. Схема planfact: компании, проекты, участники, работы + RLS (deny-by-default).
-- Только добавляет объекты (схема planfact и функции public.pf_*). Объекты RBI/Quality не меняет.
-- Повторное применение безопасно.

create schema if not exists planfact;

create table if not exists planfact.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists planfact.company_members (
  company_id uuid not null references planfact.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table if not exists planfact.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references planfact.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (id, company_id)
);

create table if not exists planfact.project_members (
  project_id uuid not null,
  company_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (project_id, company_id) references planfact.projects(id, company_id) on delete cascade,
  foreign key (company_id, user_id) references planfact.company_members(company_id, user_id) on delete cascade
);

create table if not exists planfact.works (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  project_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  unit text not null default '',
  plan_qty numeric,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (project_id, company_id) references planfact.projects(id, company_id) on delete cascade
);
create index if not exists works_project_idx on planfact.works(project_id);

-- Проверки членства. SECURITY DEFINER, чтобы политики не зацикливались; видят только auth.uid().
create or replace function planfact.is_company_member(p_company uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (select 1 from planfact.company_members m
                 where m.company_id = p_company and m.user_id = auth.uid());
$$;

create or replace function planfact.is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (select 1 from planfact.project_members m
                 where m.project_id = p_project and m.user_id = auth.uid());
$$;

alter table planfact.companies       enable row level security;
alter table planfact.company_members enable row level security;
alter table planfact.projects        enable row level security;
alter table planfact.project_members enable row level security;
alter table planfact.works           enable row level security;

drop policy if exists companies_select on planfact.companies;
create policy companies_select on planfact.companies for select to authenticated
  using (planfact.is_company_member(id));

drop policy if exists company_members_select on planfact.company_members;
create policy company_members_select on planfact.company_members for select to authenticated
  using (user_id = auth.uid());

drop policy if exists projects_select on planfact.projects;
create policy projects_select on planfact.projects for select to authenticated
  using (planfact.is_project_member(id));

drop policy if exists project_members_select on planfact.project_members;
create policy project_members_select on planfact.project_members for select to authenticated
  using (user_id = auth.uid());

drop policy if exists works_select on planfact.works;
create policy works_select on planfact.works for select to authenticated
  using (planfact.is_project_member(project_id));

-- Этап 1: вставку разрешаем участнику проекта; на этапе 2 заменяется проверкой права planfact.works.edit.
drop policy if exists works_insert on planfact.works;
create policy works_insert on planfact.works for insert to authenticated
  with check (created_by = auth.uid() and planfact.is_project_member(project_id));

-- Права: никаких для anon/public.
revoke all on schema planfact from public, anon;
revoke all on all tables in schema planfact from public, anon, authenticated;
revoke all on all functions in schema planfact from public, anon;
grant usage on schema planfact to authenticated;
grant select on planfact.companies, planfact.company_members, planfact.projects,
                planfact.project_members, planfact.works to authenticated;
grant insert on planfact.works to authenticated;
grant execute on function planfact.is_company_member(uuid), planfact.is_project_member(uuid) to authenticated;

-- Точки входа для приложения (схема planfact в PostgREST не открывается). SECURITY INVOKER: RLS действует.
create or replace function public.pf_my_projects()
returns setof planfact.projects language sql stable security invoker set search_path = pg_catalog, planfact as $$
  select * from planfact.projects order by name;
$$;

create or replace function public.pf_list_works(p_project uuid)
returns setof planfact.works language sql stable security invoker set search_path = pg_catalog, planfact as $$
  select * from planfact.works where project_id = p_project order by created_at, id;
$$;

create or replace function public.pf_add_work(p_project uuid, p_name text, p_unit text default '', p_plan_qty numeric default null)
returns uuid language plpgsql security invoker set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_id uuid;
begin
  select company_id into v_company from planfact.projects where id = p_project;
  if v_company is null then
    raise exception 'project not found or no access' using errcode = '42501';
  end if;
  insert into planfact.works(company_id, project_id, name, unit, plan_qty)
  values (v_company, p_project, p_name, coalesce(p_unit, ''), p_plan_qty)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.pf_my_projects(), public.pf_list_works(uuid), public.pf_add_work(uuid, text, text, numeric) from public, anon;
grant execute on function public.pf_my_projects(), public.pf_list_works(uuid), public.pf_add_work(uuid, text, text, numeric) to authenticated;
