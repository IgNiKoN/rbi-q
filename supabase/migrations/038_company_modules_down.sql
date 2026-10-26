-- Откат 038 (P2-0031): «База знаний» снова по старому входу (без выключателя), pf_my_platform — как в 014 (после 016 — таблицы core).
-- Строки выключателей «База знаний» у компаний удаляются (до 038 их не было: модуль не управлялся); модуль «ИИ-помощник» — тоже.
begin;

create or replace function public.pf_my_platform()
returns jsonb language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  with me as (select auth.uid() as uid, planfact.is_platform_admin() as adm),
  act as (
    select a.company_id, a.role_id from core.role_assignments a, me
    where a.user_id = me.uid and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
  ),
  comp as (
    select c.id, c.name, c.is_test from core.companies c, me
    where me.uid is not null and (me.adm or exists (select 1 from act where act.company_id = c.id))
  )
  select jsonb_build_object(
    'is_platform_admin', coalesce((select adm from me), false),
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', comp.id, 'name', comp.name, 'is_test', comp.is_test,
        'roles', coalesce((select jsonb_agg(distinct r.name) from act join core.company_roles r on r.id = act.role_id
                           where act.company_id = comp.id), '[]'::jsonb),
        'modules', coalesce((
          select jsonb_agg(mc.code order by mc.sort) from core.module_catalog mc
          join core.company_modules cm on cm.company_id = comp.id and cm.module = mc.code and cm.enabled
          where mc.managed and ((select adm from me) or exists (
            select 1 from act join core.company_role_permissions rp on rp.role_id = act.role_id and rp.company_id = act.company_id
            where act.company_id = comp.id and rp.action like mc.code || '.%'))), '[]'::jsonb),
        'can_manage_company', planfact.has_company_permission(comp.id, 'security.roles.assign')
      ) order by comp.name) from comp), '[]'::jsonb));
$$;

delete from core.company_modules where module in ('knowledge', 'ai');
delete from core.module_catalog where code = 'ai';
update core.module_catalog set managed = false where code = 'knowledge';
alter table core.module_catalog drop column if exists access_action;

commit;
