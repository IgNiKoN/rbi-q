-- P2-0013 этап 1. Администратор платформы и модули компаний (ADR-064 п. 2, 6).
-- Только planfact.* и public.pf_*. Объекты RBI/Quality, настройки Auth/JWT, PostgREST и Storage не затрагивает. Применять после 013a — ФАЙЛОМ.
-- Признак «администратор платформы» — ОДНОЙ проверкой planfact.is_platform_admin() внутри единой проверки прав
-- (is_company_member, is_project_member, has_permission, has_company_permission и pf_my_permissions — её отражение для экрана).
-- Админ платформы на период разработки видит всё (ADR-064 п. 6), но только в компаниях с включённым модулем — выключенный модуль
-- закрыт для всех одинаково. Управление компаниями и модулями — только через pf_platform_*, каждое изменение — в audit_log.
-- Назначение администратора платформы — отдельный SQL владельца (scripts/platform-admin.sql), функции для этого нет.
-- Откат — 014_down.sql.

-- 1. Администраторы платформы: клиент не читает и не пишет (политик и грантов нет)
create table if not exists planfact.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table planfact.platform_admins enable row level security;
revoke all on planfact.platform_admins from public, anon, authenticated;

-- 2. Каталог модулей — один источник для списка модулей компании.
-- managed = true: модуль Platform 2.0, включается/выключается у компании (company_modules) и проверяется сервером;
-- managed = false: старый модуль оболочки, работает по старому входу (PIN), выключателя нет.
create table if not exists planfact.module_catalog (
  code text primary key,
  name text not null,
  managed boolean not null,
  sort int not null default 0
);
insert into planfact.module_catalog(code, name, managed, sort) values
  ('planfact',     'План/Факт',     true,  10),
  ('quality',      'Качество',      false, 20),
  ('construction', 'Стройконтроль', false, 30),
  ('knowledge',    'База знаний',   false, 40)
on conflict (code) do nothing;
alter table planfact.module_catalog enable row level security;
revoke all on planfact.module_catalog from public, anon, authenticated;

-- 3. Признак администратора платформы
create or replace function planfact.is_platform_admin()
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select auth.uid() is not null and exists (select 1 from planfact.platform_admins where user_id = auth.uid());
$$;

-- 4. Единая проверка прав: прежнее условие ИЛИ администратор платформы (модуль компании включён, действие есть в каталоге)
create or replace function planfact.is_company_member(p_company uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (select 1 from planfact.company_members m
                 where m.company_id = p_company and m.user_id = auth.uid())
      or (planfact.is_platform_admin() and exists (select 1 from planfact.companies c where c.id = p_company));
$$;

create or replace function planfact.is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (
    select 1 from planfact.projects pr
    join planfact.company_modules cm on cm.company_id = pr.company_id and cm.module = 'planfact' and cm.enabled
    where pr.id = p_project
      and (planfact.is_platform_admin() or exists (
        select 1 from planfact.role_assignments a
        where a.company_id = pr.company_id and a.user_id = auth.uid()
          and (a.project_id = pr.id or a.project_id is null)
          and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))));
$$;

create or replace function planfact.has_permission(p_project uuid, p_action text)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (
    select 1 from planfact.projects pr
    join planfact.company_modules cm on cm.company_id = pr.company_id and cm.module = 'planfact' and cm.enabled
    join planfact.permission_catalog c on c.action = p_action
    where pr.id = p_project
      and (planfact.is_platform_admin() or exists (
        select 1 from planfact.role_assignments a
        join planfact.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = p_action
        where a.company_id = pr.company_id and a.user_id = auth.uid()
          and (a.project_id = pr.id or a.project_id is null)
          and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))));
$$;

-- Право на уровне компании: только назначения «на всю компанию» (project_id is null) или администратор платформы.
create or replace function planfact.has_company_permission(p_company uuid, p_action text)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (
    select 1 from planfact.company_modules cm
    join planfact.permission_catalog c on c.action = p_action
    where cm.company_id = p_company and cm.module = 'planfact' and cm.enabled
      and (planfact.is_platform_admin() or exists (
        select 1 from planfact.role_assignments a
        join planfact.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = p_action
        where a.company_id = cm.company_id and a.user_id = auth.uid() and a.project_id is null
          and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))));
$$;

-- Права на проект для экрана — то же правило, что has_permission (admin платформы — весь каталог).
create or replace function public.pf_my_permissions(p_project uuid)
returns text[] language sql stable security definer set search_path = pg_catalog, planfact as $$
  select coalesce(array_agg(c.action order by c.action), '{}')
  from planfact.permission_catalog c
  where planfact.has_permission(p_project, c.action);
$$;

-- Компании для раздела «Компания» / выбора проекта: админ платформы — все компании с включённым модулем.
create or replace function public.pf_my_company_access()
returns table(company_id uuid, company_name text, can_manage_projects boolean, can_manage_units boolean, can_manage_roles boolean)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  select c.id, c.name,
         planfact.has_company_permission(c.id, 'planfact.projects.manage'),
         planfact.has_company_permission(c.id, 'planfact.units.manage'),
         planfact.has_company_permission(c.id, 'security.roles.assign')
  from planfact.companies c
  where auth.uid() is not null and exists (
    select 1 from planfact.company_modules cm
    where cm.company_id = c.id and cm.module = 'planfact' and cm.enabled
      and (planfact.is_platform_admin() or exists (
        select 1 from planfact.role_assignments a
        where a.company_id = cm.company_id and a.user_id = auth.uid()
          and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))))
  order by c.name;
$$;

-- 5. Кто я: администратор платформы ли, мои компании, мои роли и ДОСТУПНЫЕ мне модули по каждой (модули компании ∩ права).
-- Модуль доступен, если включён у компании и (админ платформы или есть действующее назначение с правом этого модуля «<код>.*»).
create or replace function public.pf_my_platform()
returns jsonb language sql stable security definer set search_path = pg_catalog, planfact as $$
  with me as (select auth.uid() as uid, planfact.is_platform_admin() as adm),
  act as (
    select a.company_id, a.role_id from planfact.role_assignments a, me
    where a.user_id = me.uid and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
  ),
  comp as (
    select c.id, c.name, c.is_test from planfact.companies c, me
    where me.uid is not null and (me.adm or exists (select 1 from act where act.company_id = c.id))
  )
  select jsonb_build_object(
    'is_platform_admin', coalesce((select adm from me), false),
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', comp.id, 'name', comp.name, 'is_test', comp.is_test,
        'roles', coalesce((select jsonb_agg(distinct r.name) from act join planfact.company_roles r on r.id = act.role_id
                           where act.company_id = comp.id), '[]'::jsonb),
        'modules', coalesce((
          select jsonb_agg(mc.code order by mc.sort) from planfact.module_catalog mc
          join planfact.company_modules cm on cm.company_id = comp.id and cm.module = mc.code and cm.enabled
          where mc.managed and ((select adm from me) or exists (
            select 1 from act join planfact.company_role_permissions rp on rp.role_id = act.role_id and rp.company_id = act.company_id
            where act.company_id = comp.id and rp.action like mc.code || '.%'))), '[]'::jsonb),
        'can_manage_company', planfact.has_company_permission(comp.id, 'security.roles.assign')
      ) order by comp.name) from comp), '[]'::jsonb));
$$;

-- 6. Администрирование платформы (только админ платформы; сервер проверяет каждый вызов)
create or replace function planfact.require_platform_admin()
returns void language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if not planfact.is_platform_admin() then
    raise exception 'Только для администратора платформы' using errcode = '42501';
  end if;
end $$;

create or replace function public.pf_platform_companies()
returns table(id uuid, name text, is_test boolean, created_at timestamptz, people int, modules jsonb)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  perform planfact.require_platform_admin();
  return query
  select c.id, c.name, c.is_test, c.created_at,
         (select count(*)::int from planfact.company_members m where m.company_id = c.id),
         (select jsonb_agg(jsonb_build_object('code', mc.code, 'name', mc.name, 'managed', mc.managed,
                                              'enabled', case when mc.managed then coalesce(cm.enabled, false) end) order by mc.sort)
          from planfact.module_catalog mc
          left join planfact.company_modules cm on cm.company_id = c.id and cm.module = mc.code)
  from planfact.companies c
  order by c.is_test, c.name;
end $$;

create or replace function public.pf_platform_create_company(p_name text, p_is_test boolean default false)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  perform planfact.require_platform_admin();
  if v_name = '' then raise exception 'Введите название компании' using errcode = '22023'; end if;
  if exists (select 1 from planfact.companies where lower(name) = lower(v_name)) then
    raise exception 'Компания с таким названием уже есть' using errcode = '23505';
  end if;
  insert into planfact.companies(name, is_test) values (v_name, coalesce(p_is_test, false)) returning id into v_id;
  perform planfact.log_admin_change(v_id, null, 'companies', v_id, 'platform.company.create', null,
                                    jsonb_build_object('name', v_name, 'is_test', coalesce(p_is_test, false)));
  return v_id;
end $$;

create or replace function public.pf_platform_set_module(p_company uuid, p_module text, p_enabled boolean)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_managed boolean; v_old boolean;
begin
  perform planfact.require_platform_admin();
  if not exists (select 1 from planfact.companies where id = p_company) then
    raise exception 'Компания не найдена' using errcode = '22023';
  end if;
  select managed into v_managed from planfact.module_catalog where code = p_module;
  if v_managed is null then raise exception 'Неизвестный модуль' using errcode = '22023'; end if;
  if not v_managed then
    raise exception 'Этот модуль работает по старому входу (PIN) — управление после переноса в Platform 2.0' using errcode = '22023';
  end if;
  if p_enabled is null then raise exception 'Не указано: включить или выключить' using errcode = '22023'; end if;
  select enabled into v_old from planfact.company_modules where company_id = p_company and module = p_module;
  if v_old is not distinct from p_enabled then return; end if;
  insert into planfact.company_modules(company_id, module, enabled) values (p_company, p_module, p_enabled)
    on conflict (company_id, module) do update set enabled = excluded.enabled;
  perform planfact.log_admin_change(p_company, null, 'company_modules', p_company, 'platform.module.set',
                                    jsonb_build_object('module', p_module, 'enabled', v_old),
                                    jsonb_build_object('module', p_module, 'enabled', p_enabled));
end $$;

-- Администратор компании — роль «Администратор компании» на всю компанию существующей учётке (по почте).
create or replace function public.pf_platform_set_company_admin(p_company uuid, p_email text)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_user uuid; v_role uuid; v_id uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform planfact.require_platform_admin();
  if not exists (select 1 from planfact.companies where id = p_company) then
    raise exception 'Компания не найдена' using errcode = '22023';
  end if;
  if v_email = '' then raise exception 'Введите почту' using errcode = '22023'; end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    raise exception 'Учётка с такой почтой не найдена — сначала её нужно завести' using errcode = '22023';
  end if;
  select id into v_role from planfact.company_roles
   where company_id = p_company and template_code = 'company_admin' order by created_at limit 1;
  if v_role is null then raise exception 'В компании нет роли «Администратор компании»' using errcode = '22023'; end if;
  select a.id into v_id from planfact.role_assignments a
   where a.company_id = p_company and a.user_id = v_user and a.role_id = v_role and a.project_id is null
     and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now());
  if v_id is not null then return v_id; end if;
  insert into planfact.company_members(company_id, user_id) values (p_company, v_user) on conflict do nothing;
  insert into planfact.role_assignments(company_id, user_id, role_id, project_id, created_by)
    values (p_company, v_user, v_role, null, auth.uid()) returning id into v_id;
  perform planfact.log_admin_change(p_company, null, 'role_assignments', v_id, 'platform.company_admin.set', null,
                                    jsonb_build_object('user_id', v_user, 'email', v_email, 'role_id', v_role));
  return v_id;
end $$;

-- 7. Права доступа
revoke all on function planfact.is_platform_admin(), planfact.require_platform_admin() from public, anon, authenticated;
revoke all on function public.pf_my_platform(), public.pf_platform_companies(), public.pf_platform_create_company(text, boolean),
  public.pf_platform_set_module(uuid, text, boolean), public.pf_platform_set_company_admin(uuid, text) from public, anon;
grant execute on function public.pf_my_platform(), public.pf_platform_companies(), public.pf_platform_create_company(text, boolean),
  public.pf_platform_set_module(uuid, text, boolean), public.pf_platform_set_company_admin(uuid, text) to authenticated;
