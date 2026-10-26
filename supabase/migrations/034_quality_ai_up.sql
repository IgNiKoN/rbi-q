-- P2-0034 (CRITICAL — права): право «Качество: ИИ-помощник» (quality.ai). Его проверяет серверная функция pf-ai
-- (quality.can от имени пользователя); галочка появляется в конструкторе ролей из справочника прав.
-- По умолчанию (решение владельца 25.10.2026): шаблоны и роли, где есть quality.edit, и 4 роли РБИ (Админ, Зам. руководителя,
-- Директор, Инженер СК — в старом РБИ ИИ был у всех четырёх; перенос ролей quality.rbi_role_actions тоже выдаёт его).
-- Только добавление. Применять после 033c, одним запросом. Откат — 034_quality_ai_down.sql.
begin;

do $$
begin
  if not exists (select 1 from core.permission_catalog where action = 'quality.objects.manage') then
    raise exception '034: сначала 033c_objects_manage_up.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from core.permission_catalog where action = 'quality.ai') then
    raise exception '034 уже применена (повтор — только после 034_quality_ai_down.sql)' using errcode = 'P0001';
  end if;
end $$;

insert into core.permission_catalog(action, description) values ('quality.ai', 'Качество: ИИ-помощник');

insert into core.role_template_permissions(template_code, action)
select distinct template_code, 'quality.ai' from core.role_template_permissions where action = 'quality.edit'
on conflict do nothing;

insert into core.company_role_permissions(role_id, company_id, action)
select rp.role_id, rp.company_id, 'quality.ai' from core.company_role_permissions rp where rp.action = 'quality.edit'
union
select r.id, r.company_id, 'quality.ai' from core.company_roles r
 where r.template_code is null and r.deleted_at is null
   and r.name in (select quality.rbi_role_name(x) from unnest(array['manager', 'deputy_manager', 'director', 'engineer']) x)
on conflict do nothing;

-- Перенос ролей РБИ (день переключения) выравнивает права роли по этому списку — quality.ai у всех четырёх.
create or replace function quality.rbi_role_actions(p_role text)
returns text[] language sql immutable set search_path = pg_catalog as $$
  select case p_role
    when 'manager' then array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company',
                              'construction.view', 'construction.edit', 'construction.manage', 'security.roles.assign',
                              'quality.objects.manage', 'construction.objects.manage', 'quality.ai']
    when 'deputy_manager' then array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company',
                              'construction.view', 'construction.edit', 'construction.manage', 'security.roles.assign', 'quality.ai']
    when 'director' then array['quality.view', 'quality.scope.company', 'construction.view', 'quality.ai']
    when 'engineer' then array['quality.view', 'quality.edit', 'construction.view', 'construction.edit', 'quality.ai']
  end
$$;

commit;
