-- P2-0033 доработка 1, решение владельца 25.10.2026: «дерево локаций может править только админ … только админ без зама».
-- Отдельное право «справочник объектов и дерево локаций» (у Зам. руководителя остальные права Админа сохраняются —
-- отличие от ROLE_MATRIX canManageObjects по решению владельца): quality.objects.manage / construction.objects.manage
-- (два ключа — правило проверяет включённый модуль компании: достаточно любого). Получают: шаблон «Администратор компании»
-- (и его роли во всех компаниях), роль РБИ «Админ» (перенос ролей, quality.rbi_role_actions). Правят справочник объектов
-- и дерево локаций (project_objects, object_aliases, location_nodes, location_node_aliases, construction_floors_v2) только с ним.
-- Применять после 033b, одним запросом. Откат — 033c_objects_manage_down.sql (правила — как 033b: *.manage).
begin;

do $$
begin
  if to_regprocedure('quality.record_foreign_object(uuid,text[],text[])') is null then
    raise exception '033c: сначала 033b_rbi_roles_review_up.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from core.permission_catalog where action = 'quality.objects.manage') then
    raise exception '033c уже применена (повтор — только после 033c_objects_manage_down.sql)' using errcode = 'P0001';
  end if;
end $$;

insert into core.permission_catalog(action, description) values
  ('quality.objects.manage', 'Качество: справочник объектов и дерево локаций (только администратор)'),
  ('construction.objects.manage', 'Стройконтроль: справочник объектов и дерево локаций (только администратор)');
insert into core.role_template_permissions(template_code, action) values
  ('company_admin', 'quality.objects.manage'), ('company_admin', 'construction.objects.manage');
insert into core.company_role_permissions(role_id, company_id, action)
select r.id, r.company_id, a from core.company_roles r, unnest(array['quality.objects.manage', 'construction.objects.manage']) a
 where r.template_code = 'company_admin'
on conflict do nothing;

-- Роль РБИ «Админ»: + право справочника (следующий запуск scripts/rbi-transfer/11_roles.sql выравнивает права роли).
create or replace function quality.rbi_role_actions(p_role text)
returns text[] language sql immutable set search_path = pg_catalog as $$
  select case p_role
    when 'manager' then array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company',
                              'construction.view', 'construction.edit', 'construction.manage', 'security.roles.assign',
                              'quality.objects.manage', 'construction.objects.manage']
    when 'deputy_manager' then array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company',
                              'construction.view', 'construction.edit', 'construction.manage', 'security.roles.assign']
    when 'director' then array['quality.view', 'quality.scope.company', 'construction.view']
    when 'engineer' then array['quality.view', 'quality.edit', 'construction.view', 'construction.edit']
  end
$$;

do $$
declare r record; v_edit text := 'quality.can(core_company_id, core_project_id, ''{quality.objects.manage,construction.objects.manage}'')';
begin
  for r in select unnest(array['project_objects', 'object_aliases', 'location_nodes', 'location_node_aliases', 'construction_floors_v2']) t loop
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
end $$;

commit;
