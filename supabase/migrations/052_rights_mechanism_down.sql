-- P2-0070: откат 052_rights_mechanism_up.sql — правила строк и «кто я» Стройконтроля как после 043 / 039b, сняты сторож действий,
-- место записи (core_location_id) и проверка ядра (core.*); функции прав План/Факта — прежние определения (047 / 016); новые действия Стройконтроля убраны из каталога, шаблонов и ролей
-- компаний (вместе с галочками, поставленными после выкладки); у каталога сняты модуль, группа, порядок, подпись.
-- Прежние ключи construction.view / edit / manage — без изменений.
-- Телефоны новой версии после отката покажут кнопки по прежним правам — откатывать вместе с приложением.
-- Проверка на PGlite: schema_fingerprint до up и после down совпадает.
begin;
do $$
begin
  if to_regprocedure('quality.construction_action_guard()') is null then
    raise exception '052 down: 052 не применена' using errcode = 'P0001';
  end if;
end $$;

drop trigger zzz_construction_action_guard on quality.construction_defects_v2;
drop trigger zzz_construction_action_guard on quality.construction_acceptance_v2;
drop function quality.construction_action_guard();
drop function quality.defect_status_action(text);

do $$
declare t text; v_vis text; v_edit text;
begin
  foreach t in array array['construction_defects_v2', 'construction_acceptance_v2'] loop
    v_vis  := 'quality.row_visible_id(core_company_id, core_project_id, ''{construction.view}'', ''contractor'', core_created_by, null, core_counterparty_id)';
    v_edit := 'quality.row_visible_id(core_company_id, core_project_id, ''{construction.edit}'', ''contractor'', core_created_by, null, core_counterparty_id)';
    execute format('drop policy %I on quality.%I', t || '_select', t);
    execute format('drop policy %I on quality.%I', t || '_insert', t);
    execute format('drop policy %I on quality.%I', t || '_update', t);
    execute format('drop policy %I on quality.%I', t || '_delete', t);
    execute format('create policy %I on quality.%I for select to authenticated using (%s)', t || '_select', t, v_vis);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', t || '_insert', t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', t || '_update', t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', t || '_delete', t, v_edit);
    execute format('drop trigger %I on quality.%I', t || '_bind_place', t);
    execute format('alter table quality.%I drop column core_location_id', t);
  end loop;
end $$;

drop function quality.v2_bind_place();
drop function quality.node_core_place(uuid, text, uuid);

-- «Кто я» — как 039b
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
    'objects', case when not exists (select 1 from asg) or exists (select 1 from asg where quality_objects is null) then null
                    else coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'key', o.canonical_key, 'name', o.display_name)
                                                    order by o.display_name)
                                     from quality.project_objects o
                                    where o.core_company_id = quality.request_company()
                                      and o.id in (select unnest(quality_objects) from asg)), '[]'::jsonb) end,
    'contractor', (select jsonb_build_object('id', c.id, 'name', c.name,
                            'keys', coalesce((select jsonb_agg(l.canonical_key order by l.canonical_key) from quality.contractor_core_links l
                                               where l.counterparty_id = c.id), '[]'::jsonb))
                     from asg join core.counterparties c on c.id = asg.counterparty_id and c.company_id = asg.company_id
                    where c.deleted_at is null order by c.name limit 1),
    'container', case when exists (select 1 from asg) or planfact.is_platform_admin() then quality.request_container() end);
$$;

-- План/Факт — прежние определения (047 / 016), до снятия функций ядра
CREATE OR REPLACE FUNCTION planfact.has_permission(p_project uuid, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
  select exists (
    select 1 from core.projects pr
    join core.company_modules cm on cm.company_id = pr.company_id and cm.module = 'planfact' and cm.enabled
    join core.permission_catalog c on c.action = p_action
    where pr.id = p_project
      and (planfact.is_platform_admin() or exists (
        select 1 from core.role_assignments a
        join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = p_action
        where a.company_id = pr.company_id and a.user_id = auth.uid()
          and (a.project_id = pr.id or a.project_id is null)
          and (a.location_id is null or c.area_scoped)
          and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))));
$function$;

CREATE OR REPLACE FUNCTION planfact.has_company_permission(p_company uuid, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
  select exists (
    select 1 from core.company_modules cm
    join core.permission_catalog c on c.action = p_action
    where cm.company_id = p_company and cm.module = 'planfact' and cm.enabled
      and (planfact.is_platform_admin() or exists (
        select 1 from core.role_assignments a
        join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = p_action
        where a.company_id = cm.company_id and a.user_id = auth.uid() and a.project_id is null
          and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))));
$function$;

CREATE OR REPLACE FUNCTION planfact.my_area(p_project uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_company uuid; v_roots uuid[];
begin
  if v_uid is null or p_project is null then return null; end if;
  select company_id into v_company from core.projects where id = p_project;
  if v_company is null or planfact.is_platform_admin() then return null; end if;
  if exists (select 1 from core.role_assignments a
              where a.company_id = v_company and a.user_id = v_uid
                and (a.project_id is null or (a.project_id = p_project and a.location_id is null))
                and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())) then
    return null;
  end if;
  select array_agg(distinct a.location_id) into v_roots from core.role_assignments a
   where a.company_id = v_company and a.user_id = v_uid and a.project_id = p_project and a.location_id is not null
     and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now());
  if v_roots is null then return null; end if;
  return array(
    with recursive sub(id) as (
      select l.id from core.locations l where l.id = any (v_roots) and l.project_id = p_project and l.deleted_at is null
      union
      select c.id from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
    select sub.id from sub);
end $function$;

CREATE OR REPLACE FUNCTION planfact.my_area_nodes(p_project uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  with a as (select planfact.my_area(p_project) ids)
  select case when a.ids is null then null else array(
    with recursive up(id, parent_id) as (
      select l.id, l.parent_id from core.locations l where l.id = any (a.ids)
      union
      select p.id, p.parent_id from core.locations p join up on p.id = up.parent_id)
    select up.id from up) end
  from a
$function$;

CREATE OR REPLACE FUNCTION planfact.in_area(p_location uuid, p_area uuid[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select p_area is null or p_location = any (p_area)
$function$;

CREATE OR REPLACE FUNCTION public.pf_my_area(p_project uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if p_project is null or v_uid is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'full', planfact.my_area(p_project) is null,
    'locations', coalesce((select jsonb_agg(distinct a.location_id) from core.role_assignments a
                            where a.user_id = v_uid and a.project_id = p_project and a.location_id is not null
                              and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())), '[]'::jsonb),
    'fact_owner', coalesce((select jsonb_agg(distinct coalesce(a.location_id::text, 'project')) from core.role_assignments a
                             where a.user_id = v_uid and a.project_id = p_project and a.fact_owner
                               and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())), '[]'::jsonb),
    'can_on_behalf', planfact.has_permission(p_project, 'planfact.fact.approve'));
end $function$;

drop function core.require_action(uuid, uuid, uuid, text, uuid, uuid);
drop function core.my_grants(uuid, uuid, text);
drop function core.row_allowed(uuid, uuid, uuid, text[], uuid, uuid);
drop function core.assignment_allows(core.role_assignments, text, uuid, uuid[], uuid, uuid);
drop function core.can_at(uuid, uuid, uuid, text);
drop function core.has_grant(uuid, uuid, uuid, text);
drop function core.in_area(uuid, uuid[]);
drop function core.my_area_nodes(uuid);
drop function core.my_area(uuid);
drop function core.place_subtree(uuid);
drop function core.place_up(uuid);

-- Каталог для галочек — как 005 / 016
drop function public.pf_permission_catalog();
create function public.pf_permission_catalog()
returns table(action text, description text)
language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  select action, description from core.permission_catalog where auth.uid() is not null order by action;
$$;
revoke all on function public.pf_permission_catalog() from public, anon;
grant execute on function public.pf_permission_catalog() to authenticated;

delete from core.company_role_permissions where action like 'construction.defects.%' or action like 'construction.acceptance.%'
   or action = 'construction.transfer.edit';
delete from core.role_template_permissions where action like 'construction.defects.%' or action like 'construction.acceptance.%'
   or action = 'construction.transfer.edit';
delete from core.permission_catalog where action like 'construction.defects.%' or action like 'construction.acceptance.%'
   or action = 'construction.transfer.edit';
alter table core.permission_catalog drop column label, drop column sort, drop column group_name, drop column module;

commit;
