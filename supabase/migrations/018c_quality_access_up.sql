-- P2-0016 этап 3–4 (ADR-068 п.4). Права экрана Качества из ролей компании: quality.my_access(объект) → действия quality.* /
-- construction.* пользователя в текущей компании (заголовок x-company-id) и коды шаблонов его ролей. Те же правила, что RLS
-- (quality.can); клиент по ним выбирает роль экрана Качества. Применять после 018. Повторное применение безопасно.
-- Откат — 018c_quality_access_down.sql.
begin;

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
revoke all on function quality.my_access(uuid) from public, anon, authenticated;
grant execute on function quality.my_access(uuid) to authenticated;

commit;
