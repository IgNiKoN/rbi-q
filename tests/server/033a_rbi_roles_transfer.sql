-- P2-0033 этап 2: роли и закрепления из старых профилей РБИ (033a). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
-- Запуск: после 033a_rbi_roles_transfer_up.sql (PGlite — модели public и auth). Почты — только @test.invalid.
-- Люди: адм (manager, у него уже «Администратор компании»), зам (deputy_manager), дир (director, сейчас «Руководство»),
-- инж1 (engineer, название объекта другим регистром), инж2 (engineer, UUID двух узлов: один — объект справочника,
-- другой — только в дереве локаций), инж3 (engineer, объект не найден), гость (guest).
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate; end $f$;

do $$
declare
  ca uuid := gen_random_uuid(); pa uuid := gen_random_uuid();
  uadm uuid := gen_random_uuid(); udep uuid := gen_random_uuid(); udir uuid := gen_random_uuid();
  ue1 uuid := gen_random_uuid(); ue2 uuid := gen_random_uuid(); ue3 uuid := gen_random_uuid(); ug uuid := gen_random_uuid();
  n1 text := gen_random_uuid()::text; n2 text := gen_random_uuid()::text;
  r record; s text; n int; res text := '';
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, udep, udir, ue1, ue2, ue3, ug]) u;
  insert into core.companies(id, name, is_test) values (ca, 'РБИ 033a', true);
  insert into core.company_members(company_id, user_id) select ca, u from unnest(array[uadm, udep, udir, ue1, ue2, ue3, ug]) u;
  perform set_config('quality.object_sync', '1', true);   -- данные «как до 039b»: без синхронизации объектов ядра и Качества
  insert into core.projects(id, company_id, name) values (pa, ca, 'Объекты 033a');
  insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id) values
    ('obj_a33', 'большевиков,22 (гений)', 'Большевиков,22 (Гений)', '{}', ca),
    ('obj_b33', 'лиговский 240', 'Лиговский 240', '{}', ca);
  insert into quality.location_nodes(id, canonical_key, "displayName", "nodeType", core_company_id) values
    (n1, 'лиговский 240', 'Лиговский 240', 'object', ca),
    (n2, 'ул. правды, д 15 (типография)', 'ул. Правды, д 15 (ТИПОГРАФИЯ)', 'object', ca);
  perform set_config('quality.object_sync', '', true);
  insert into core.role_assignments(company_id, user_id, role_id)
  select ca, x.u, (select id from core.company_roles where company_id = ca and template_code = x.tpl)
    from (values (uadm, 'company_admin'), (udir, 'management'), (ue1, 'qc_engineer'), (ue2, 'qc_engineer')) x(u, tpl);
  insert into public.rbi_engineer_profiles(id, project_code, engineer_name, role, assigned_projects, settings) values
    ('00000000-0000-0000-0000-0000000033a1', 'rbi', 'Админ А.', 'manager', '{}', '{}'),
    ('00000000-0000-0000-0000-0000000033a2', 'rbi', 'Зам З.', 'deputy_manager', '{}', '{}'),
    ('00000000-0000-0000-0000-0000000033a3', 'rbi', 'Директор Д.', 'director', '{}', '{}'),
    ('00000000-0000-0000-0000-0000000033a4', 'rbi', 'Инженер 1', 'engineer', array['Большевиков,22 (ГЕНИЙ)'], '{"assignedProjects": []}'),
    ('00000000-0000-0000-0000-0000000033a5', 'rbi', 'Инженер 2', 'engineer', array['старое'], jsonb_build_object('assignedProjects', jsonb_build_array(n1, n2))),
    ('00000000-0000-0000-0000-0000000033a6', 'rbi', 'Инженер 3', 'engineer', array['нет такого объекта'], '{}'),
    ('00000000-0000-0000-0000-0000000033a7', 'rbi', 'Гость Г.', 'guest', '{}', '{}');
  insert into quality.rbi_transfer_people(core_company_id, old_profile_id, email, user_id)
  select ca, ('00000000-0000-0000-0000-0000000033a' || k)::uuid, 'p' || k || '@test.invalid', u
    from unnest(array[uadm, udep, udir, ue1, ue2, ue3, ug]) with ordinality x(u, k);

  -- Показ: ничего не меняет
  n := (select count(*) from core.role_assignments where company_id = ca and revoked_at is null);
  select string_agg(format('%s:%s:%s:%s', email, coalesce(new_role, '-'), coalesce(problem, '-'), action), ' | ' order by email) into s
    from quality.rbi_transfer_roles(ca, false);
  res := res || pg_temp.t(s like '%p4@test.invalid:Инженер СК:-:будет назначено%', 'показ: инженер 1 будет назначен ' || s);
  res := res || pg_temp.t(s like '%p6@test.invalid:Инженер СК:не найден объект: нет такого объекта:пропущен%', 'показ: нерасшифрованный объект — пропуск');
  res := res || pg_temp.t(s like '%p7@test.invalid:-:роль старого профиля не из 4 ролей РБИ: guest:пропущен%', 'показ: гость — пропуск');
  res := res || pg_temp.t(s like '%p5@test.invalid:Инженер СК:-:будет назначено%', 'показ (033b): объект из дерева локаций — без проблемы ' || s);
  res := res || pg_temp.t((select objects from quality.rbi_transfer_roles(ca, false) where email = 'p5@test.invalid') like '%ул. Правды, д 15 (ТИПОГРАФИЯ) [будет добавлен]%',
                          'показ (033b): «будет добавлен»');
  res := res || pg_temp.t((select count(*) from core.role_assignments where company_id = ca and revoked_at is null) = n
                          and not exists (select 1 from core.company_roles where company_id = ca and name = 'Инженер СК')
                          and not exists (select 1 from quality.project_objects where core_company_id = ca and display_name like 'ул. Правды%'),
                          'показ: ничего не изменено');

  -- Применение
  select string_agg(format('%s:%s', email, action), ' | ' order by email) into s from quality.rbi_transfer_roles(ca, true);
  res := res || pg_temp.t(s = 'p1@test.invalid:назначено | p2@test.invalid:назначено | p3@test.invalid:назначено | p4@test.invalid:назначено | '
                          || 'p5@test.invalid:назначено | p6@test.invalid:пропущен | p7@test.invalid:пропущен', 'применение: ' || s);
  res := res || pg_temp.t((select string_agg(r2.name || '=' || (select string_agg(rp.action, ',' order by rp.action) from core.company_role_permissions rp where rp.role_id = r2.id), ' ; ' order by r2.name)
                             from core.company_roles r2 where r2.company_id = ca and r2.template_code is null)
     = 'Админ=construction.edit,construction.manage,construction.objects.manage,construction.view,quality.ai,quality.edit,quality.manage,quality.objects.manage,quality.scope.company,quality.view,security.roles.assign'
       || ' ; Директор=construction.view,quality.ai,quality.scope.company,quality.view'
       || ' ; Зам. руководителя=construction.edit,construction.manage,construction.view,quality.ai,quality.edit,quality.manage,quality.scope.company,quality.view,security.roles.assign'
       || ' ; Инженер СК=construction.edit,construction.view,quality.ai,quality.edit,quality.view', '4 роли — права ROLE_MATRIX (после 034 — с quality.ai)');
  res := res || pg_temp.t((select string_agg(coalesce(r2.template_code, r2.name), ',' order by coalesce(r2.template_code, r2.name)) from core.role_assignments a join core.company_roles r2 on r2.id = a.role_id
                             where a.user_id = uadm and a.revoked_at is null) = 'company_admin,Админ', 'адм: Администратор компании остался + Админ');
  res := res || pg_temp.t((select string_agg(r2.name, ',') from core.role_assignments a join core.company_roles r2 on r2.id = a.role_id
                             where a.user_id = udir and a.revoked_at is null) = 'Директор', 'дир: «Руководство» отозвано, назначен Директор');
  res := res || pg_temp.t((select quality_objects from core.role_assignments a where a.user_id = ue1 and a.revoked_at is null) = array['obj_a33'],
                          'инж1: объект по названию (другой регистр) → id');
  s := (select id from quality.project_objects where core_company_id = ca and display_name = 'ул. Правды, д 15 (ТИПОГРАФИЯ)');
  res := res || pg_temp.t(s is not null, 'объект только из дерева локаций добавлен в справочник');
  res := res || pg_temp.t((select quality_objects from core.role_assignments a where a.user_id = ue2 and a.revoked_at is null) = (select array_agg(x order by x) from unnest(array['obj_b33', s]) x),
                          'инж2: UUID узлов → id объектов (оба)');
  res := res || pg_temp.t((select count(*) from core.role_assignments where user_id = ue3 and revoked_at is null) = 0
                          and (select count(*) from core.role_assignments where user_id = ug and revoked_at is null) = 0, 'пропущенные — без изменений');
  res := res || pg_temp.t((select count(*) from core.audit_log where company_id = ca and new_data ->> 'source' = 'rbi_transfer_roles' and action = 'ASSIGN') = 5,
                          'журнал: 5 назначений');
  -- Повтор — без изменений
  n := (select count(*) from core.role_assignments where company_id = ca);
  select string_agg(distinct action, ',') into s from quality.rbi_transfer_roles(ca, true) where problem is null;
  res := res || pg_temp.t(s = 'уже так' and (select count(*) from core.role_assignments where company_id = ca) = n, 'повтор: «уже так», новых назначений нет');
  -- 033b (L5): чужая роль с тем же названием не перезаписывается
  update core.company_roles set name = 'Директор (перенос)' where company_id = ca and name = 'Директор';
  insert into core.company_roles(company_id, name) values (ca, 'Директор');
  res := res || pg_temp.t(pg_temp.err(format('select * from quality.rbi_transfer_roles(%L, false)', ca)) = 'P0001', 'чужая роль «Директор» — стоп');
  delete from core.company_roles where company_id = ca and name = 'Директор';
  update core.company_roles set name = 'Директор' where company_id = ca and name = 'Директор (перенос)';
  -- Клиенту закрыто
  perform set_config('request.jwt.claim.sub', uadm::text, true);
  execute 'set local role authenticated';
  res := res || pg_temp.t(pg_temp.err(format('select * from quality.rbi_transfer_roles(%L, true)', ca)) = '42501', 'клиенту функция закрыта');
  reset role;

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
