-- P2-0004 этап 2. Роли и права на сервере: каталог действий, шаблоны ролей, роли компании, назначения,
-- модули компании, функция проверки права. Заменяет project_members (источник истины доступа к проекту — назначения).
-- Объекты RBI/Quality не затрагивает. Применять после 001.

-- 1. Каталог действий (ключ существует ≠ право выдано)
create table if not exists planfact.permission_catalog (
  action text primary key,
  description text not null
);
insert into planfact.permission_catalog(action, description) values
  ('planfact.works.view',          'Просмотр работ плана'),
  ('planfact.works.edit',          'Добавление и правка работ (ВОР, ГПР)'),
  ('planfact.wor.import',          'Импорт ВОР'),
  ('planfact.plan.approve',        'Согласование и изменение утверждённого плана'),
  ('planfact.plan.change_request', 'Заявка на изменение утверждённого плана'),
  ('planfact.fact.view',           'Просмотр фактических объёмов'),
  ('planfact.fact.create',         'Ввод фактического объёма'),
  ('planfact.checklist.view',      'Просмотр чек-листа заказчика'),
  ('planfact.checklist.create',    'Создание и загрузка чек-листа заказчика'),
  ('planfact.money.view',          'Просмотр денежных сумм'),
  ('planfact.rates.plan.edit',     'Плановые расценки (ФОТ-план)'),
  ('planfact.rates.fact.edit',     'Фактические расценки по бригаде'),
  ('planfact.payments.review',     'Проверка реестра выплат'),
  ('planfact.payments.prepare',    'Формирование реестра выплат'),
  ('planfact.payments.sign',       'Подписание реестра выплат'),
  ('planfact.ks2.edit',            'Проект КС-2'),
  ('planfact.thresholds.edit',     'Смена порогов уведомлений'),
  ('planfact.audit.view',          'Просмотр журнала аудита'),
  ('security.roles.assign',        'Назначение и отзыв ролей пользователей')
on conflict (action) do nothing;

-- 2. Шаблоны ролей (определены один раз; копируются в каждую новую компанию)
create table if not exists planfact.role_templates (
  code text primary key,
  name text not null
);
create table if not exists planfact.role_template_permissions (
  template_code text not null references planfact.role_templates(code) on delete cascade,
  action text not null references planfact.permission_catalog(action),
  primary key (template_code, action)
);
insert into planfact.role_templates(code, name) values
  ('company_admin',  'Администратор компании'),
  ('project_manager','Руководитель проекта'),
  ('pto',            'Инженер ПТО'),
  ('foreman',        'Прораб / мастер'),
  ('qc_engineer',    'Инженер строительного контроля'),
  ('economist',      'Экономист'),
  ('management',     'Руководство'),
  ('customer',       'Заказчик (только чтение, без сумм)'),
  ('contractor_rep', 'Представитель подрядчика')
on conflict (code) do nothing;
insert into planfact.role_template_permissions(template_code, action) values
  ('company_admin','planfact.works.view'),('company_admin','planfact.audit.view'),('company_admin','security.roles.assign'),
  ('project_manager','planfact.works.view'),('project_manager','planfact.plan.approve'),('project_manager','planfact.fact.view'),
  ('project_manager','planfact.checklist.view'),('project_manager','planfact.money.view'),('project_manager','planfact.rates.plan.edit'),
  ('project_manager','planfact.rates.fact.edit'),('project_manager','planfact.payments.sign'),('project_manager','planfact.ks2.edit'),
  ('project_manager','planfact.thresholds.edit'),
  ('pto','planfact.works.view'),('pto','planfact.works.edit'),('pto','planfact.wor.import'),('pto','planfact.plan.change_request'),
  ('pto','planfact.fact.view'),('pto','planfact.checklist.view'),('pto','planfact.money.view'),('pto','planfact.rates.plan.edit'),
  ('pto','planfact.payments.review'),('pto','planfact.ks2.edit'),
  ('foreman','planfact.works.view'),('foreman','planfact.fact.view'),('foreman','planfact.fact.create'),
  ('foreman','planfact.checklist.view'),('foreman','planfact.checklist.create'),('foreman','planfact.rates.fact.edit'),
  ('qc_engineer','planfact.works.view'),('qc_engineer','planfact.fact.view'),('qc_engineer','planfact.checklist.view'),
  ('economist','planfact.works.view'),('economist','planfact.fact.view'),('economist','planfact.checklist.view'),
  ('economist','planfact.money.view'),('economist','planfact.rates.plan.edit'),('economist','planfact.rates.fact.edit'),
  ('economist','planfact.payments.prepare'),('economist','planfact.ks2.edit'),
  ('management','planfact.works.view'),('management','planfact.fact.view'),('management','planfact.checklist.view'),
  ('management','planfact.money.view'),('management','planfact.thresholds.edit'),
  ('customer','planfact.works.view'),('customer','planfact.fact.view'),('customer','planfact.checklist.view'),
  ('contractor_rep','planfact.works.view'),('contractor_rep','planfact.fact.view'),('contractor_rep','planfact.checklist.view')
on conflict do nothing;

-- 3. Роли компании, их действия, назначения, модули компании
create table if not exists planfact.company_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references planfact.companies(id) on delete cascade,
  name text not null,
  template_code text references planfact.role_templates(code),
  created_at timestamptz not null default now(),
  unique (id, company_id)
);
create table if not exists planfact.company_role_permissions (
  role_id uuid not null,
  company_id uuid not null,
  action text not null references planfact.permission_catalog(action),
  primary key (role_id, action),
  foreign key (role_id, company_id) references planfact.company_roles(id, company_id) on delete cascade
);
create table if not exists planfact.role_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  project_id uuid,                      -- null = все проекты компании
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  revoked_by uuid,
  revoked_at timestamptz,
  foreign key (role_id, company_id) references planfact.company_roles(id, company_id) on delete cascade,
  foreign key (company_id, user_id) references planfact.company_members(company_id, user_id) on delete cascade,
  foreign key (project_id, company_id) references planfact.projects(id, company_id) on delete cascade
);
create index if not exists role_assignments_user_idx on planfact.role_assignments(user_id);
create table if not exists planfact.company_modules (
  company_id uuid not null references planfact.companies(id) on delete cascade,
  module text not null,
  enabled boolean not null default true,
  primary key (company_id, module)
);

-- 4. При создании компании: копия 9 шаблонов ролей и включённый модуль planfact
create or replace function planfact.init_company_defaults()
returns trigger language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare t record; v_role uuid;
begin
  insert into planfact.company_modules(company_id, module, enabled) values (new.id, 'planfact', true)
    on conflict do nothing;
  for t in select code, name from planfact.role_templates loop
    insert into planfact.company_roles(company_id, name, template_code) values (new.id, t.name, t.code) returning id into v_role;
    insert into planfact.company_role_permissions(role_id, company_id, action)
      select v_role, new.id, action from planfact.role_template_permissions where template_code = t.code;
  end loop;
  return new;
end $$;
drop trigger if exists companies_init_defaults on planfact.companies;
create trigger companies_init_defaults after insert on planfact.companies
  for each row execute function planfact.init_company_defaults();

-- 5. Проверки. Единственное место, где решается право.
create or replace function planfact.is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (
    select 1 from planfact.projects pr
    join planfact.company_modules cm on cm.company_id = pr.company_id and cm.module = 'planfact' and cm.enabled
    join planfact.role_assignments a on a.company_id = pr.company_id and a.user_id = auth.uid()
         and (a.project_id = pr.id or a.project_id is null)
         and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
    where pr.id = p_project);
$$;

create or replace function planfact.has_permission(p_project uuid, p_action text)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (
    select 1 from planfact.projects pr
    join planfact.company_modules cm on cm.company_id = pr.company_id and cm.module = 'planfact' and cm.enabled
    join planfact.role_assignments a on a.company_id = pr.company_id and a.user_id = auth.uid()
         and (a.project_id = pr.id or a.project_id is null)
         and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
    join planfact.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = p_action
    join planfact.permission_catalog c on c.action = rp.action
    where pr.id = p_project);
$$;

-- Право на уровне компании: только назначения «на всю компанию» (project_id is null).
create or replace function planfact.has_company_permission(p_company uuid, p_action text)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (
    select 1 from planfact.company_modules cm
    join planfact.role_assignments a on a.company_id = cm.company_id and a.user_id = auth.uid() and a.project_id is null
         and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
    join planfact.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = p_action
    join planfact.permission_catalog c on c.action = rp.action
    where cm.company_id = p_company and cm.module = 'planfact' and cm.enabled);
$$;

-- 6. Политики: права по действию, а не по названию роли
drop policy if exists project_members_select on planfact.project_members;
-- (project_members удаляется ниже; зависимости на неё нет)

drop policy if exists works_select on planfact.works;
create policy works_select on planfact.works for select to authenticated
  using (planfact.has_permission(project_id, 'planfact.works.view'));
drop policy if exists works_insert on planfact.works;
create policy works_insert on planfact.works for insert to authenticated
  with check (created_by = auth.uid() and planfact.has_permission(project_id, 'planfact.works.edit'));

alter table planfact.permission_catalog          enable row level security;
alter table planfact.role_templates              enable row level security;
alter table planfact.role_template_permissions   enable row level security;
alter table planfact.company_roles               enable row level security;
alter table planfact.company_role_permissions    enable row level security;
alter table planfact.role_assignments            enable row level security;
alter table planfact.company_modules             enable row level security;

drop policy if exists company_roles_select on planfact.company_roles;
create policy company_roles_select on planfact.company_roles for select to authenticated
  using (planfact.is_company_member(company_id));
drop policy if exists company_role_permissions_select on planfact.company_role_permissions;
create policy company_role_permissions_select on planfact.company_role_permissions for select to authenticated
  using (planfact.is_company_member(company_id));
drop policy if exists role_assignments_select on planfact.role_assignments;
create policy role_assignments_select on planfact.role_assignments for select to authenticated
  using (user_id = auth.uid() or planfact.has_company_permission(company_id, 'security.roles.assign'));
drop policy if exists company_modules_select on planfact.company_modules;
create policy company_modules_select on planfact.company_modules for select to authenticated
  using (planfact.is_company_member(company_id));
-- permission_catalog, role_templates, role_template_permissions: политик и грантов нет — читает только сервер (postgres/definer).

drop table if exists planfact.project_members;

-- 7. Права доступа
revoke all on all tables in schema planfact from public, anon, authenticated;
revoke all on all functions in schema planfact from public, anon;
grant select on planfact.companies, planfact.company_members, planfact.projects, planfact.works,
                planfact.company_roles, planfact.company_role_permissions, planfact.role_assignments,
                planfact.company_modules to authenticated;
grant insert on planfact.works to authenticated;
grant execute on function planfact.is_company_member(uuid), planfact.is_project_member(uuid),
                          planfact.has_permission(uuid, text), planfact.has_company_permission(uuid, text) to authenticated;

-- 8. Точки входа приложения
create or replace function public.pf_my_permissions(p_project uuid)
returns text[] language sql stable security definer set search_path = pg_catalog, planfact as $$
  select coalesce(array_agg(distinct rp.action order by rp.action), '{}')
  from planfact.projects pr
  join planfact.company_modules cm on cm.company_id = pr.company_id and cm.module = 'planfact' and cm.enabled
  join planfact.role_assignments a on a.company_id = pr.company_id and a.user_id = auth.uid()
       and (a.project_id = pr.id or a.project_id is null)
       and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
  join planfact.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id
  join planfact.permission_catalog c on c.action = rp.action
  where pr.id = p_project;
$$;

create or replace function public.pf_assign_role(p_user uuid, p_role uuid, p_project uuid default null, p_valid_to timestamptz default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_id uuid;
begin
  select company_id into v_company from planfact.company_roles where id = p_role;
  if v_company is null or not planfact.has_company_permission(v_company, 'security.roles.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot assign a role to yourself' using errcode = '42501';
  end if;
  insert into planfact.role_assignments(company_id, user_id, role_id, project_id, valid_to, created_by)
  values (v_company, p_user, p_role, p_project, p_valid_to, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.pf_revoke_assignment(p_assignment uuid)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid;
begin
  select company_id into v_company from planfact.role_assignments where id = p_assignment;
  if v_company is null or not planfact.has_company_permission(v_company, 'security.roles.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update planfact.role_assignments set revoked_at = now(), revoked_by = auth.uid()
   where id = p_assignment and revoked_at is null;
end $$;

revoke all on function public.pf_my_permissions(uuid), public.pf_assign_role(uuid, uuid, uuid, timestamptz),
                       public.pf_revoke_assignment(uuid) from public, anon;
grant execute on function public.pf_my_permissions(uuid), public.pf_assign_role(uuid, uuid, uuid, timestamptz),
                          public.pf_revoke_assignment(uuid) to authenticated;
