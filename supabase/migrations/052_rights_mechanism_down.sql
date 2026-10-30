-- P2-0070: откат 052_rights_mechanism_up.sql — правила строк и «кто я» Стройконтроля как после 043 / 039b, сняты сторож действий,
-- место записи (core_location_id) и проверка ядра (core.*); новые действия Стройконтроля убраны из каталога, шаблонов и ролей
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

drop function core.require_action(uuid, uuid, uuid, text, uuid, uuid);
drop function core.row_allowed(uuid, uuid, uuid, text[], uuid, uuid);
drop function core.assignment_allows(core.role_assignments, text, uuid, uuid[], uuid, uuid);
drop function core.can_at(uuid, uuid, uuid, text);
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
