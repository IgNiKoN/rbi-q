-- Откат P2-0033 этап 1 (033_rbi_roles_objects_up.sql): правила таблиц, функции пунктов/фото, my_access, pf_assign_role и
-- pf_list_company_members — как до 033 (020/023/032d); новые функции и столбец закреплённых объектов удаляются.
-- Порядок: 033b_down → 033a_down → 033_down; при действующих назначениях с объектами откат останавливается.
begin;

-- 033b (ревью M2, L6): откат не открывает доступ молча — при действующих назначениях с объектами стоп (иначе инженеры
-- получили бы записи всех объектов компании); перед 033 — откат 033b и 033a.
do $$
begin
  if to_regprocedure('quality.record_foreign_object(uuid,text[],text[])') is not null
     or to_regprocedure('quality.rbi_transfer_roles(uuid,boolean)') is not null then
    raise exception 'Откат 033: сначала 033b_rbi_roles_review_down.sql и 033a_rbi_roles_transfer_down.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from core.role_assignments where quality_objects is not null and revoked_at is null) then
    raise exception 'Откат 033: есть действующие назначения с закреплёнными объектами (%) — без объектов эти люди увидят записи всех объектов компании. Сначала отзовите их («Сотрудники») или назначьте без объектов',
      (select count(*) from core.role_assignments where quality_objects is not null and revoked_at is null) using errcode = 'P0001';
  end if;
end $$;

do $$
declare r record; v_vis text; v_edit text;
begin
  for r in select * from (values
    ('rbi_inspections', '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), null, contractor_canonical_key, contractor_name'),
    ('rbi_tasks', '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, contractor_canonical_key, contractor_name'),
    ('sk_records',              '''contractor'', core_created_by, null, contractor_canonical_key, contractor_name'),
    ('project_fmea',            '''contractor'', core_created_by, null, null, contractor_name'),
    ('project_interventions',   '''contractor'', core_created_by, null, null, contractor_name'),
    ('project_meetings',        '''contractor'', core_created_by, null, null, contractor_name'),
    ('project_schedule_stages', '''contractor'', core_created_by, null, null, contractor_name'),
    ('shared_reports',          '''contractor'', core_created_by, null, contractor_canonical_key, null'),
    ('shared_report_snapshots', '''contractor'', core_created_by, null, contractor_canonical_key, null')
  ) v(t, args) loop
    v_vis  := format('quality.row_visible(core_company_id, core_project_id, %L, %s)', '{quality.view}', r.args);
    v_edit := format('quality.row_visible(core_company_id, core_project_id, %L, %s)', '{quality.edit}', r.args);
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (%s)', r.t || '_select', r.t, v_vis);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
end $$;

create or replace function quality.inspection_child_visible(p_company uuid, p_project uuid, p_actions text[], p_inspection text, p_author uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, contractor_canonical_key, contractor_name into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.row_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.contractor_canonical_key, i.contractor_name);
  end if;
  return quality.row_visible(p_company, p_project, p_actions, 'author', p_author, null, null, null);
end $$;

create or replace function quality.inspection_child_writable(p_company uuid, p_project uuid, p_actions text[], p_inspection text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, contractor_canonical_key, contractor_name into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.row_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.contractor_canonical_key, i.contractor_name);
  end if;
  return quality.can(p_company, p_project, array(select replace(x, '.edit', '.manage') from unnest(p_actions) x));
end $$;

create or replace function quality.my_access(p_project uuid default null)
returns jsonb language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  with asg as (
    select a.*, r.template_code from core.role_assignments a
    join core.company_roles r on r.id = a.role_id and r.company_id = a.company_id
    where a.company_id = quality.request_company() and a.user_id = auth.uid()
      and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))
  select jsonb_build_object(
    'company_id', quality.request_company(),
    'actions', coalesce((select jsonb_agg(pc.action order by pc.action) from core.permission_catalog pc
                          where (pc.action like 'quality.%' or pc.action like 'construction.%')
                            and quality.can(quality.request_company(), p_project, array[pc.action])), '[]'::jsonb),
    'templates', coalesce((select jsonb_agg(distinct template_code) from asg
                            where (p_project is null or project_id is null or project_id = p_project)
                              and template_code is not null), '[]'::jsonb),
    'projects', case when exists (select 1 from asg where project_id is null) then null
                     else coalesce((select jsonb_agg(distinct project_id) from asg), '[]'::jsonb) end,
    'contractor', (select jsonb_build_object('id', c.id, 'name', c.name,
                            'keys', coalesce((select jsonb_agg(l.canonical_key order by l.canonical_key) from quality.contractor_core_links l
                                               where l.counterparty_id = c.id), '[]'::jsonb))
                     from asg join core.counterparties c on c.id = asg.counterparty_id and c.company_id = asg.company_id
                    where c.deleted_at is null order by c.name limit 1));
$$;

drop function public.pf_list_quality_objects(uuid);
drop function public.pf_assign_role(uuid, uuid, uuid, timestamptz, uuid, text[]);
create function public.pf_assign_role(p_user uuid, p_role uuid, p_project uuid default null, p_valid_to timestamptz default null,
  p_counterparty uuid default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_company uuid; v_id uuid;
begin
  select company_id into v_company from core.company_roles where id = p_role;
  if v_company is null or not planfact.has_company_permission(v_company, 'security.roles.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot assign a role to yourself' using errcode = '42501';
  end if;
  if not exists (select 1 from core.company_members where company_id = v_company and user_id = p_user) then
    raise exception 'Сотрудник не состоит в этой компании' using errcode = '42501';
  end if;
  if exists (select 1 from core.company_members where company_id = v_company and user_id = p_user and disabled_at is not null) then
    raise exception 'Сотрудник отключён — роль не назначается' using errcode = '42501';   -- ревью M3 (P2-0028)
  end if;
  if p_project is not null and not exists (select 1 from core.projects where id = p_project and company_id = v_company) then
    raise exception 'Проект не принадлежит этой компании' using errcode = '42501';
  end if;
  if p_counterparty is not null and not exists (select 1 from core.counterparties where id = p_counterparty and company_id = v_company
       and deleted_at is null and archived_at is null and 'contractor' = any(kinds)) then
    raise exception 'Фирма не найдена среди подрядчиков компании («Контрагенты», вид «подрядчик»)' using errcode = '22023';
  end if;
  if p_valid_to is not null and p_valid_to <= now() then
    raise exception 'Срок окончания уже прошёл' using errcode = '22023';
  end if;
  if exists (select 1 from core.role_assignments where user_id = p_user and role_id = p_role
             and project_id is not distinct from p_project and revoked_at is null
             and (valid_to is null or valid_to > now())) then
    raise exception 'Такое назначение уже действует' using errcode = '22023';
  end if;
  insert into core.role_assignments(company_id, user_id, role_id, project_id, valid_to, created_by, counterparty_id)
  values (v_company, p_user, p_role, p_project, p_valid_to, auth.uid(), p_counterparty)
  returning id into v_id;
  perform planfact.log_admin_change(v_company, p_project, 'role_assignments', v_id, 'ASSIGN', null,
            jsonb_build_object('user_id', p_user, 'role_id', p_role, 'role_name', (select name from core.company_roles where id = p_role),
                               'project_id', p_project, 'valid_to', p_valid_to, 'counterparty_id', p_counterparty));
  return v_id;
end $$;

drop function public.pf_list_company_members(uuid);
create function public.pf_list_company_members(p_company uuid)
returns table(user_id uuid, email text, assignment_id uuid, role_id uuid, role_name text, project_id uuid, project_name text,
              valid_from timestamptz, valid_to timestamptz, is_active boolean, counterparty_id uuid, counterparty_name text,
              full_name text, disabled_at timestamptz, must_change_password boolean, managed boolean)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select m.user_id, u.email::text, a.id, a.role_id, r.name, a.project_id, p.name, a.valid_from, a.valid_to,
         case when a.id is null then null else (a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())) end,
         a.counterparty_id, c.name,
         up.full_name, m.disabled_at, coalesce(up.must_change_password, false), core.staff_owned_by(p_company, m.user_id)
  from core.company_members m
  left join auth.users u on u.id = m.user_id
  left join core.user_profiles up on up.user_id = m.user_id
  left join core.role_assignments a on a.company_id = m.company_id and a.user_id = m.user_id and a.revoked_at is null
  left join core.company_roles r on r.id = a.role_id
  left join core.projects p on p.id = a.project_id
  left join core.counterparties c on c.id = a.counterparty_id
  where m.company_id = p_company
  order by (m.disabled_at is not null), coalesce(up.full_name, u.email::text), r.name, p.name nulls first;
end $$;

revoke all on function public.pf_assign_role(uuid, uuid, uuid, timestamptz, uuid), public.pf_list_company_members(uuid) from public, anon;
grant execute on function public.pf_assign_role(uuid, uuid, uuid, timestamptz, uuid), public.pf_list_company_members(uuid) to authenticated;

drop trigger project_objects_refresh_object_keys on quality.project_objects;
drop trigger location_nodes_refresh_object_keys on quality.location_nodes;
drop trigger role_assignments_quality_object_keys on core.role_assignments;
drop function quality.row_visible(uuid, uuid, text[], text, uuid, uuid, text, text, text[]);
drop function quality.refresh_object_keys();
drop function quality.assignment_object_keys();
drop function quality.objects_keys(uuid, text[]);
drop function quality.record_keys(text[]);
drop function quality.object_clean(text);
alter table core.role_assignments drop column quality_object_keys;
alter table core.role_assignments drop column quality_objects;

commit;
