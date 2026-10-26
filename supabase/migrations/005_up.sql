-- P2-0004b этап 1. Конструктор ролей: функции «Компания → Роли / Сотрудники», правила защиты на сервере,
-- аудит ролей и назначений, закрыт прямой SELECT журнала (суммы — только через pf_list_audit).
-- Только planfact.* и public.pf_*. Объекты RBI/Quality и настройки Auth/PostgREST не затрагивает. Применять после 004.
-- Решение владельца 21.10.2026: обладатель security.roles.assign может отметить любое действие каталога.

-- 1. Журнал: события уровня компании (роли, назначения на всю компанию) — без проекта.
alter table planfact.audit_log alter column project_id drop not null;
create index if not exists audit_log_company_idx on planfact.audit_log(company_id, at desc);
revoke select on planfact.audit_log from authenticated;   -- техдолг P2-0004: чтение только через pf_list_audit / pf_list_company_audit

-- 2. Служебные функции (вызываются только из pf_*; клиенту не выдаются)
create or replace function planfact.require_roles_admin(p_company uuid)
returns void language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_company is null or auth.uid() is null or not planfact.has_company_permission(p_company, 'security.roles.assign') then
    raise exception 'Нет права управлять ролями этой компании' using errcode = '42501';
  end if;
end $$;

-- После изменения в компании должно остаться действующее назначение «на всю компанию» с security.roles.assign.
create or replace function planfact.assert_company_has_admin(p_company uuid)
returns void language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if not exists (
    select 1 from planfact.role_assignments a
    join planfact.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id
         and rp.action = 'security.roles.assign'
    where a.company_id = p_company and a.project_id is null and a.revoked_at is null
      and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())) then
    raise exception 'Нельзя: в компании не останется ни одного администратора ролей' using errcode = '42501';
  end if;
end $$;

create or replace function planfact.log_admin_change(p_company uuid, p_project uuid, p_table text, p_record uuid,
                                                     p_action text, p_old jsonb, p_new jsonb)
returns void language sql security definer set search_path = pg_catalog, planfact as $$
  insert into planfact.audit_log(company_id, project_id, table_name, record_id, action, actor, old_data, new_data)
  values (p_company, p_project, p_table, p_record, p_action, auth.uid(), p_old, p_new);
$$;

create or replace function planfact.role_snapshot(p_role uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, planfact as $$
  select jsonb_build_object('name', r.name, 'template_code', r.template_code,
           'actions', coalesce((select jsonb_agg(rp.action order by rp.action) from planfact.company_role_permissions rp
                                where rp.role_id = r.id), '[]'::jsonb))
  from planfact.company_roles r where r.id = p_role;
$$;

-- Роль для изменения: существует, своя компания (право проверено), не шаблон.
create or replace function planfact.editable_role(p_role uuid)
returns uuid language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_tpl text;
begin
  select company_id, template_code into v_company, v_tpl from planfact.company_roles where id = p_role;
  perform planfact.require_roles_admin(v_company);
  if v_tpl is not null then
    raise exception 'Роль-шаблон не меняется — сделайте копию' using errcode = '42501';
  end if;
  return v_company;
end $$;

create or replace function planfact.check_role_name(p_company uuid, p_name text, p_except uuid)
returns text language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v text := btrim(coalesce(p_name, ''));
begin
  if length(v) = 0 or length(v) > 100 then
    raise exception 'Название роли: от 1 до 100 символов' using errcode = '22023';
  end if;
  if exists (select 1 from planfact.company_roles where company_id = p_company and lower(name) = lower(v)
             and id is distinct from p_except) then
    raise exception 'Роль с таким названием уже есть' using errcode = '22023';
  end if;
  return v;
end $$;

revoke all on function planfact.require_roles_admin(uuid), planfact.assert_company_has_admin(uuid),
  planfact.log_admin_change(uuid, uuid, text, uuid, text, jsonb, jsonb), planfact.role_snapshot(uuid),
  planfact.editable_role(uuid), planfact.check_role_name(uuid, text, uuid) from public, anon, authenticated;

-- 3. Точки входа для раздела «Компания»
-- Компании, где пользователь может управлять ролями (видимость раздела «Компания»).
create or replace function public.pf_my_admin_companies()
returns table(company_id uuid, company_name text)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  select c.id, c.name from planfact.companies c
  where planfact.has_company_permission(c.id, 'security.roles.assign')
  order by c.name;
$$;

-- Каталог действий (ключи и описания) — источник для галочек.
create or replace function public.pf_permission_catalog()
returns table(action text, description text)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  select action, description from planfact.permission_catalog where auth.uid() is not null order by action;
$$;

create or replace function public.pf_list_company_roles(p_company uuid)
returns table(id uuid, name text, template_code text, actions text[], active_assignments int)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select r.id, r.name, r.template_code,
         coalesce((select array_agg(rp.action order by rp.action) from planfact.company_role_permissions rp where rp.role_id = r.id), '{}'),
         (select count(*)::int from planfact.role_assignments a where a.role_id = r.id and a.revoked_at is null
            and (a.valid_to is null or a.valid_to > now()))
  from planfact.company_roles r where r.company_id = p_company
  order by (r.template_code is null), r.name;
end $$;

-- Участники компании и их неотозванные назначения (строка на назначение; участник без назначений — одна строка с null).
create or replace function public.pf_list_company_members(p_company uuid)
returns table(user_id uuid, email text, assignment_id uuid, role_id uuid, role_name text,
              project_id uuid, project_name text, valid_from timestamptz, valid_to timestamptz, is_active boolean)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select m.user_id, u.email::text, a.id, a.role_id, r.name, a.project_id, p.name, a.valid_from, a.valid_to,
         case when a.id is null then null else (a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())) end
  from planfact.company_members m
  left join auth.users u on u.id = m.user_id
  left join planfact.role_assignments a on a.company_id = m.company_id and a.user_id = m.user_id and a.revoked_at is null
  left join planfact.company_roles r on r.id = a.role_id
  left join planfact.projects p on p.id = a.project_id
  where m.company_id = p_company
  order by u.email, r.name, p.name nulls first;
end $$;

-- Новая роль — копия шаблона или своей роли (той же компании).
create or replace function public.pf_create_role(p_source_role uuid, p_name text)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_name text; v_id uuid;
begin
  select company_id into v_company from planfact.company_roles where id = p_source_role;
  perform planfact.require_roles_admin(v_company);
  v_name := planfact.check_role_name(v_company, p_name, null);
  insert into planfact.company_roles(company_id, name, template_code) values (v_company, v_name, null) returning id into v_id;
  insert into planfact.company_role_permissions(role_id, company_id, action)
    select v_id, v_company, action from planfact.company_role_permissions where role_id = p_source_role;
  perform planfact.log_admin_change(v_company, null, 'company_roles', v_id, 'ROLE_CREATE',
            jsonb_build_object('source_role', p_source_role), planfact.role_snapshot(v_id));
  return v_id;
end $$;

create or replace function public.pf_rename_role(p_role uuid, p_name text)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_old jsonb;
begin
  v_company := planfact.editable_role(p_role);
  v_old := planfact.role_snapshot(p_role);
  update planfact.company_roles set name = planfact.check_role_name(v_company, p_name, p_role) where id = p_role;
  perform planfact.log_admin_change(v_company, null, 'company_roles', p_role, 'ROLE_RENAME', v_old, planfact.role_snapshot(p_role));
end $$;

-- Полный набор действий роли. Ключ вне каталога → отказ.
create or replace function public.pf_set_role_actions(p_role uuid, p_actions text[])
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_old jsonb; v_bad text;
begin
  v_company := planfact.editable_role(p_role);
  select x into v_bad from unnest(coalesce(p_actions, '{}')) x
   where not exists (select 1 from planfact.permission_catalog c where c.action = x) limit 1;
  if v_bad is not null then
    raise exception 'Неизвестное действие: %', v_bad using errcode = '22023';
  end if;
  v_old := planfact.role_snapshot(p_role);
  delete from planfact.company_role_permissions where role_id = p_role;
  insert into planfact.company_role_permissions(role_id, company_id, action)
    select distinct p_role, v_company, x from unnest(coalesce(p_actions, '{}')) x;
  perform planfact.assert_company_has_admin(v_company);
  perform planfact.log_admin_change(v_company, null, 'company_roles', p_role, 'ROLE_ACTIONS', v_old, planfact.role_snapshot(p_role));
end $$;

create or replace function public.pf_delete_role(p_role uuid)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_old jsonb;
begin
  v_company := planfact.editable_role(p_role);
  if exists (select 1 from planfact.role_assignments where role_id = p_role and revoked_at is null) then
    raise exception 'Роль назначена сотрудникам — сначала отзовите назначения' using errcode = '42501';
  end if;
  v_old := planfact.role_snapshot(p_role);
  delete from planfact.company_roles where id = p_role;
  perform planfact.log_admin_change(v_company, null, 'company_roles', p_role, 'ROLE_DELETE', v_old, null);
end $$;

-- Назначение: только своей компании, участнику компании, не себе, проект своей компании, срок в будущем, без дубля.
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
  if not exists (select 1 from planfact.company_members where company_id = v_company and user_id = p_user) then
    raise exception 'Сотрудник не состоит в этой компании' using errcode = '42501';
  end if;
  if p_project is not null and not exists (select 1 from planfact.projects where id = p_project and company_id = v_company) then
    raise exception 'Проект не принадлежит этой компании' using errcode = '42501';
  end if;
  if p_valid_to is not null and p_valid_to <= now() then
    raise exception 'Срок окончания уже прошёл' using errcode = '22023';
  end if;
  if exists (select 1 from planfact.role_assignments where user_id = p_user and role_id = p_role
             and project_id is not distinct from p_project and revoked_at is null
             and (valid_to is null or valid_to > now())) then
    raise exception 'Такое назначение уже действует' using errcode = '22023';
  end if;
  insert into planfact.role_assignments(company_id, user_id, role_id, project_id, valid_to, created_by)
  values (v_company, p_user, p_role, p_project, p_valid_to, auth.uid())
  returning id into v_id;
  perform planfact.log_admin_change(v_company, p_project, 'role_assignments', v_id, 'ASSIGN', null,
            jsonb_build_object('user_id', p_user, 'role_id', p_role, 'role_name', (select name from planfact.company_roles where id = p_role),
                               'project_id', p_project, 'valid_to', p_valid_to));
  return v_id;
end $$;

create or replace function public.pf_revoke_assignment(p_assignment uuid)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare a planfact.role_assignments;
begin
  select * into a from planfact.role_assignments where id = p_assignment;
  if a.company_id is null or not planfact.has_company_permission(a.company_id, 'security.roles.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if a.revoked_at is not null then return; end if;
  update planfact.role_assignments set revoked_at = now(), revoked_by = auth.uid() where id = p_assignment;
  perform planfact.assert_company_has_admin(a.company_id);
  perform planfact.log_admin_change(a.company_id, a.project_id, 'role_assignments', a.id, 'REVOKE',
            jsonb_build_object('user_id', a.user_id, 'role_id', a.role_id, 'role_name', (select name from planfact.company_roles where id = a.role_id),
                               'project_id', a.project_id, 'valid_to', a.valid_to), null);
end $$;

-- Журнал проекта «План/Факт» — только работы (события ролей/назначений теперь тоже пишутся с project_id, их показывает
-- журнал компании). Тело как в 004, добавлен фильтр table_name = 'works'.
create or replace function public.pf_list_audit(p_project uuid, p_limit int default 50)
returns table(at timestamptz, actor_email text, action text, record_id uuid, old_data jsonb, new_data jsonb)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  select a.at, u.email::text, a.action, a.record_id,
         case when planfact.has_permission(p_project, 'planfact.money.view') then a.old_data else a.old_data - 'plan_amount' end,
         case when planfact.has_permission(p_project, 'planfact.money.view') then a.new_data else a.new_data - 'plan_amount' end
  from planfact.audit_log a left join auth.users u on u.id = a.actor
  where a.project_id = p_project and a.table_name = 'works' and planfact.has_permission(p_project, 'planfact.audit.view')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Журнал изменений ролей и назначений компании (кто, что, когда).
create or replace function public.pf_list_company_audit(p_company uuid, p_limit int default 50)
returns table(at timestamptz, actor_email text, action text, record_id uuid, subject_email text, old_data jsonb, new_data jsonb)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select a.at, u.email::text, a.action, a.record_id, su.email::text, a.old_data, a.new_data
  from planfact.audit_log a
  left join auth.users u on u.id = a.actor
  left join auth.users su on su.id = (coalesce(a.new_data, a.old_data) ->> 'user_id')::uuid
  where a.company_id = p_company and a.table_name in ('company_roles', 'role_assignments')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

revoke all on function public.pf_my_admin_companies(), public.pf_permission_catalog(), public.pf_list_company_roles(uuid),
  public.pf_list_company_members(uuid), public.pf_create_role(uuid, text), public.pf_rename_role(uuid, text),
  public.pf_set_role_actions(uuid, text[]), public.pf_delete_role(uuid), public.pf_list_company_audit(uuid, int),
  public.pf_assign_role(uuid, uuid, uuid, timestamptz), public.pf_revoke_assignment(uuid) from public, anon;
grant execute on function public.pf_my_admin_companies(), public.pf_permission_catalog(), public.pf_list_company_roles(uuid),
  public.pf_list_company_members(uuid), public.pf_create_role(uuid, text), public.pf_rename_role(uuid, text),
  public.pf_set_role_actions(uuid, text[]), public.pf_delete_role(uuid), public.pf_list_company_audit(uuid, int),
  public.pf_assign_role(uuid, uuid, uuid, timestamptz), public.pf_revoke_assignment(uuid) to authenticated;
