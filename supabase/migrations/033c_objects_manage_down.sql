-- Откат 033c_objects_manage_up.sql: правила справочника объектов и дерева локаций — как 033b (*.manage), права
-- quality.objects.manage / construction.objects.manage снимаются со всех ролей и удаляются из справочника прав; права роли РБИ
-- «Админ» — как 033a.
begin;

do $$
declare r record; v_edit text;
begin
  for r in select * from (values
    ('project_objects', '{quality.manage,construction.manage}'), ('object_aliases', '{quality.manage,construction.manage}'),
    ('location_nodes', '{construction.manage}'), ('location_node_aliases', '{construction.manage}'),
    ('construction_floors_v2', '{construction.manage}')
  ) v(t, ea) loop
    v_edit := format('quality.can(core_company_id, core_project_id, %L)', r.ea);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
end $$;

create or replace function quality.rbi_role_actions(p_role text)
returns text[] language sql immutable set search_path = pg_catalog as $$
  select case p_role
    when 'manager' then array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company',
                              'construction.view', 'construction.edit', 'construction.manage', 'security.roles.assign']
    when 'deputy_manager' then array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company',
                              'construction.view', 'construction.edit', 'construction.manage', 'security.roles.assign']
    when 'director' then array['quality.view', 'quality.scope.company', 'construction.view']
    when 'engineer' then array['quality.view', 'quality.edit', 'construction.view', 'construction.edit']
  end
$$;

delete from core.company_role_permissions where action in ('quality.objects.manage', 'construction.objects.manage');
delete from core.role_template_permissions where action in ('quality.objects.manage', 'construction.objects.manage');
delete from core.permission_catalog where action in ('quality.objects.manage', 'construction.objects.manage');

commit;
