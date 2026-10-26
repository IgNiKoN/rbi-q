-- P2-0031 (CRITICAL — права): выключатели модулей компании при входе по почте.
-- 1) «База знаний» (knowledge) — управляемый модуль: включается/выключается у компании в «Админ платформы» (pf_platform_set_module).
--    Её документы лежат в хранилище Качества (quality.shared_docs, shared_nodes, shared_twi_cards — право quality.view, 018),
--    поэтому модуль доступен человеку по праву quality.view и только при включённом у компании Качестве.
--    Включена у компаний, где включено Качество (у RBI — как было: документы видны в Качестве).
-- 2) «ИИ-помощник» (ai) — новый управляемый модуль: доступен по праву quality.ai (034) при включённом Качестве; включён у всех
--    существующих компаний (доступ к ИИ не меняется). Функция pf-ai отказывает, если модуля нет в pf_my_platform.
-- 3) core.module_catalog.access_action — право, по которому модуль доступен человеку, если у модуля нет своих прав «<код>.*»;
--    модуль этого права (часть до точки) тоже должен быть включён у компании — как в quality.can (018).
--    pf_my_platform: модуль доступен, если включён у компании и (админ платформы или есть действующее назначение с правом
--    «<код>.*» — либо, при access_action, с этим правом). Для planfact, quality, construction — без изменений.
-- Только добавление. Применять после 037, одним запросом. Откат — 038_company_modules_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.queue_guard()') is null then
    raise exception '038: сначала 037_quality_admin_up.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'module_catalog' and column_name = 'access_action') then
    raise exception '038 уже применена (повтор — только после 038_company_modules_down.sql)' using errcode = 'P0001';
  end if;
end $$;

alter table core.module_catalog add column access_action text references core.permission_catalog(action);

update core.module_catalog set managed = true, access_action = 'quality.view' where code = 'knowledge';

insert into core.company_modules(company_id, module, enabled)
select cm.company_id, 'knowledge', true from core.company_modules cm where cm.module = 'quality' and cm.enabled
on conflict (company_id, module) do nothing;

insert into core.module_catalog(code, name, managed, sort, access_action) values ('ai', 'ИИ-помощник', true, 50, 'quality.ai');
insert into core.company_modules(company_id, module, enabled)
select c.id, 'ai', true from core.companies c
on conflict (company_id, module) do nothing;

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
          where mc.managed
            and (mc.access_action is null or exists (
              select 1 from core.company_modules am
              where am.company_id = comp.id and am.module = split_part(mc.access_action, '.', 1) and am.enabled))
            and ((select adm from me) or exists (
              select 1 from act join core.company_role_permissions rp on rp.role_id = act.role_id and rp.company_id = act.company_id
              where act.company_id = comp.id
                and case when mc.access_action is null then rp.action like mc.code || '.%' else rp.action = mc.access_action end))),
          '[]'::jsonb),
        'can_manage_company', planfact.has_company_permission(comp.id, 'security.roles.assign')
      ) order by comp.name) from comp), '[]'::jsonb));
$$;

commit;
