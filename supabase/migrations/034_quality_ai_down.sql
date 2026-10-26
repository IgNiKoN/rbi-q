-- Откат 034_quality_ai_up.sql: право quality.ai снимается со всех ролей и шаблонов и удаляется из справочника;
-- права ролей РБИ — как 033c. После отката функция pf-ai отказывает всем (403) — откатывать вместе с функцией (docs/EDGE_FUNCTIONS.md).
begin;

delete from core.company_role_permissions where action = 'quality.ai';
delete from core.role_template_permissions where action = 'quality.ai';
delete from core.permission_catalog where action = 'quality.ai';

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

commit;
