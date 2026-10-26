-- P2-0034: ТОЛЬКО ДЛЯ PGlite — данные «до 034» (компании @test.invalid, is_test). Порядок: миграции до 033c → этот файл →
-- 034_quality_ai_up.sql → 034_quality_ai.pglite.sql. Боевой сервер этот файл не выполняет.
do $$
declare
  ca uuid := '03400000-0000-4000-8000-00000000000a'; cb uuid := '03400000-0000-4000-8000-00000000000b';
  udir uuid := '03400000-0000-4000-8000-000000000001'; uobs uuid := '03400000-0000-4000-8000-000000000002';
  uqc uuid := '03400000-0000-4000-8000-000000000003'; ucus uuid := '03400000-0000-4000-8000-000000000004';
  ueng uuid := '03400000-0000-4000-8000-000000000005'; ub uuid := '03400000-0000-4000-8000-000000000006';
  r_dir uuid; r_eng uuid; r_obs uuid; r_beng uuid;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[udir, uobs, uqc, ucus, ueng, ub]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 034', true), (cb, 'Бета 034', true);
  insert into core.company_members(company_id, user_id)
    select ca, u from unnest(array[udir, uobs, uqc, ucus, ueng]) u union all select cb, ub;
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  -- роли РБИ (без шаблона, имена как у переноса) + своя роль без шаблона только с просмотром
  insert into core.company_roles(company_id, name) values (ca, 'Директор') returning id into r_dir;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер СК') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (ca, 'Наблюдатель 034') returning id into r_obs;
  insert into core.company_roles(company_id, name) values (cb, 'Инженер СК') returning id into r_beng;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_dir, ca, a from unnest(array['quality.view', 'quality.scope.company', 'construction.view']) a
  union all select r_eng, ca, a from unnest(array['quality.view', 'quality.edit', 'construction.view', 'construction.edit']) a
  union all select r_obs, ca, 'quality.view'
  union all select r_beng, cb, a from unnest(array['quality.view', 'quality.edit']) a;
  insert into core.role_assignments(company_id, user_id, role_id) values
    (ca, udir, r_dir), (ca, uobs, r_obs), (ca, ueng, r_eng), (cb, ub, r_beng);
  insert into core.role_assignments(company_id, user_id, role_id)
    select ca, uqc, id from core.company_roles where company_id = ca and template_code = 'qc_engineer';
  insert into core.role_assignments(company_id, user_id, role_id)
    select ca, ucus, id from core.company_roles where company_id = ca and template_code = 'customer';
end $$;
