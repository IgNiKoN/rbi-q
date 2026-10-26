-- P2-0018: откат 020_quality_scope_up.sql. Правила 13 таблиц с записями — как в 018 (quality.can), автор записи
-- (core_created_by) удаляется, фирма у назначений роли удаляется, шаблоны ролей и роли из шаблонов — как до 020,
-- quality.my_access — как в 018c, pf_assign_role / pf_list_company_members — как до 020. Применять до 018e_quality_contractors_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.row_visible(uuid,uuid,text[],text,uuid,uuid,text,text)') is null then
    raise exception '020 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_constraint where conname = 'allowed_projects_pkey' and conrelid = 'quality.allowed_projects'::regclass
             and pg_get_constraintdef(oid) like '%core_company_id%') then
    raise exception 'Сначала откатите 021: 021_quality_keys_down.sql' using errcode = 'P0001';
  end if;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('rbi_inspections', '{quality.view}', '{quality.edit}'), ('rbi_tasks', '{quality.view}', '{quality.edit}'),
    ('rbi_inspection_items', '{quality.view}', '{quality.edit}'), ('rbi_inspection_photos', '{quality.view}', '{quality.edit}'),
    ('sk_records', '{quality.view}', '{quality.edit}'), ('project_fmea', '{quality.view}', '{quality.edit}'),
    ('project_interventions', '{quality.view}', '{quality.edit}'), ('project_meetings', '{quality.view}', '{quality.edit}'),
    ('project_schedule_stages', '{quality.view}', '{quality.edit}'), ('shared_reports', '{quality.view}', '{quality.edit}'),
    ('shared_report_snapshots', '{quality.view}', '{quality.edit}'),
    ('construction_defects', '{construction.view}', '{construction.edit}'), ('construction_acceptance', '{construction.view}', '{construction.edit}')
  ) v(t, va, ea) loop
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (quality.can(core_company_id, core_project_id, %L))', r.t || '_select', r.t, r.va);
    execute format('create policy %I on quality.%I for insert to authenticated with check (quality.can(core_company_id, core_project_id, %L))', r.t || '_insert', r.t, r.ea);
    execute format('create policy %I on quality.%I for update to authenticated using (quality.can(core_company_id, core_project_id, %L))
  with check (quality.can(core_company_id, core_project_id, %L))', r.t || '_update', r.t, r.ea, r.ea);
    execute format('create policy %I on quality.%I for delete to authenticated using (quality.can(core_company_id, core_project_id, %L))', r.t || '_delete', r.t, r.ea);
    execute format('drop trigger %I on quality.%I', r.t || '_set_author', r.t);
    execute format('alter table quality.%I drop column core_created_by', r.t);
  end loop;
end $$;

drop function quality.inspection_child_visible(uuid, uuid, text[], text, uuid);
drop function quality.row_visible(uuid, uuid, text[], text, uuid, uuid, text, text);
drop function quality.assignment_sees(core.role_assignments, text, uuid, text, uuid, uuid, text, text);
drop function quality.contractor_matches(uuid, uuid, text, text);
drop function quality.set_author();

-- quality.my_access — как в 018c.
create or replace function quality.my_access(p_project uuid default null)
returns jsonb language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  select jsonb_build_object(
    'company_id', quality.request_company(),
    'actions', coalesce((select jsonb_agg(pc.action order by pc.action) from core.permission_catalog pc
                          where (pc.action like 'quality.%' or pc.action like 'construction.%')
                            and quality.can(quality.request_company(), p_project, array[pc.action])), '[]'::jsonb),
    'templates', coalesce((select jsonb_agg(distinct r.template_code) from core.role_assignments a
                            join core.company_roles r on r.id = a.role_id and r.company_id = a.company_id
                            where a.company_id = quality.request_company() and a.user_id = auth.uid()
                              and (p_project is null or a.project_id is null or a.project_id = p_project)
                              and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
                              and r.template_code is not null), '[]'::jsonb));
$$;

-- pf_assign_role, pf_list_company_members — как до 020.
drop function public.pf_assign_role(uuid, uuid, uuid, timestamptz, uuid);
create function public.pf_assign_role(p_user uuid, p_role uuid, p_project uuid default null, p_valid_to timestamptz default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact, core as $function$
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
  if p_project is not null and not exists (select 1 from core.projects where id = p_project and company_id = v_company) then
    raise exception 'Проект не принадлежит этой компании' using errcode = '42501';
  end if;
  if p_valid_to is not null and p_valid_to <= now() then
    raise exception 'Срок окончания уже прошёл' using errcode = '22023';
  end if;
  if exists (select 1 from core.role_assignments where user_id = p_user and role_id = p_role
             and project_id is not distinct from p_project and revoked_at is null
             and (valid_to is null or valid_to > now())) then
    raise exception 'Такое назначение уже действует' using errcode = '22023';
  end if;
  insert into core.role_assignments(company_id, user_id, role_id, project_id, valid_to, created_by)
  values (v_company, p_user, p_role, p_project, p_valid_to, auth.uid())
  returning id into v_id;
  perform planfact.log_admin_change(v_company, p_project, 'role_assignments', v_id, 'ASSIGN', null,
            jsonb_build_object('user_id', p_user, 'role_id', p_role, 'role_name', (select name from core.company_roles where id = p_role),
                               'project_id', p_project, 'valid_to', p_valid_to));
  return v_id;
end $function$;
revoke all on function public.pf_assign_role(uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.pf_assign_role(uuid, uuid, uuid, timestamptz) to authenticated;

drop function public.pf_list_company_members(uuid);
create function public.pf_list_company_members(p_company uuid)
returns table(user_id uuid, email text, assignment_id uuid, role_id uuid, role_name text, project_id uuid, project_name text,
              valid_from timestamptz, valid_to timestamptz, is_active boolean)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $function$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select m.user_id, u.email::text, a.id, a.role_id, r.name, a.project_id, p.name, a.valid_from, a.valid_to,
         case when a.id is null then null else (a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())) end
  from core.company_members m
  left join auth.users u on u.id = m.user_id
  left join core.role_assignments a on a.company_id = m.company_id and a.user_id = m.user_id and a.revoked_at is null
  left join core.company_roles r on r.id = a.role_id
  left join core.projects p on p.id = a.project_id
  where m.company_id = p_company
  order by u.email, r.name, p.name nulls first;
end $function$;
revoke all on function public.pf_list_company_members(uuid) from public, anon;
grant execute on function public.pf_list_company_members(uuid) to authenticated;

alter table core.role_assignments drop column counterparty_id;

-- Шаблоны ролей и роли из шаблонов — как до 020.
delete from core.company_role_permissions where action in ('quality.scope.company', 'quality.scope.contractor');
delete from core.role_template_permissions where action in ('quality.scope.company', 'quality.scope.contractor');
delete from core.permission_catalog where action in ('quality.scope.company', 'quality.scope.contractor');
insert into core.role_template_permissions(template_code, action) values
  ('project_manager', 'quality.edit'), ('project_manager', 'quality.manage'),
  ('project_manager', 'construction.edit'), ('project_manager', 'construction.manage'), ('foreman', 'construction.edit')
on conflict do nothing;
insert into core.company_role_permissions(role_id, company_id, action)
select r.id, r.company_id, tp.action
from core.company_roles r join core.role_template_permissions tp on tp.template_code = r.template_code
where (r.template_code, tp.action) in (('project_manager', 'quality.edit'), ('project_manager', 'quality.manage'),
  ('project_manager', 'construction.edit'), ('project_manager', 'construction.manage'), ('foreman', 'construction.edit'))
on conflict do nothing;

commit;
