-- P2-0031 этап 5 (037a, ТД №206): сторож очередей заявок. Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
-- Запуск: после 037b_queue_guard_project_up.sql (P2-0031 доработка 1: + перенос в два шага, не-UUID код объекта). Пользователи и компании — тестовые (@test.invalid, is_test).
-- Альфа, объекты X и Y. Админ (всё + справочник объектов), Зам. (quality.manage без справочника объектов), Инженер СК (edit),
-- «Рук. объекта X» (manage только на X, edit на Y), «Стройконтроль-админ» (construction.* без quality.*), подрядчик (scope.contractor).
-- Действие и проверка результата — отдельными операторами.
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate; end $f$;
create or replace function pg_temp.rows(q text) returns int language plpgsql as $f$
declare n int; begin execute q; get diagnostics n = row_count; return n; exception when others then return -1; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
create or replace function pg_temp.val(q text) returns text language plpgsql as $f$
declare v text; begin reset role; execute q into v; return v; exception when others then return 'ERR:' || sqlstate; end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); udep uuid := gen_random_uuid(); ueng uuid := gen_random_uuid(); umx uuid := gen_random_uuid();
  ucm uuid := gen_random_uuid(); ucon uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); px uuid := gen_random_uuid(); py uuid := gen_random_uuid();
  r_adm uuid; r_dep uuid; r_eng uuid; r_mx uuid; r_my uuid; r_cm uuid; r_con uuid;
  res text := ''; n int;
  base text[] := array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company',
                       'construction.view', 'construction.edit', 'construction.manage'];
  q_c text := $q$select status || '|' || raw_name || '|' || coalesce(suggested_canonical_key, '') || '|' || coalesce(source_table, '') || '|' || coalesce(admin_comment, '') from quality.contractor_normalization_queue where id = %L$q$;
  q_o text := $q$select status || '|' || coalesce(core_project_id::text, '') from quality.object_normalization_queue where id = %L$q$;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, udep, ueng, umx, ucm, ucon]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 037a', true);
  insert into core.company_members(company_id, user_id) select ca, u from unnest(array[uadm, udep, ueng, umx, ucm, ucon]) u;
  insert into core.company_modules(company_id, module, enabled)
    select ca, m, true from unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.projects(id, company_id, name) values (px, ca, 'Объект X 037a'), (py, ca, 'Объект Y 037a');
  insert into core.company_roles(company_id, name) values (ca, 'Админ 037a') returning id into r_adm;
  insert into core.company_roles(company_id, name) values (ca, 'Зам. 037a') returning id into r_dep;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер 037a') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (ca, 'Рук. объекта 037a') returning id into r_mx;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер объекта 037a') returning id into r_my;
  insert into core.company_roles(company_id, name) values (ca, 'Стройконтроль-админ 037a') returning id into r_cm;
  insert into core.company_roles(company_id, name) values (ca, 'Подрядчик 037a') returning id into r_con;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_adm, ca, a from unnest(base || array['quality.objects.manage', 'construction.objects.manage']) a
  union all select r_dep, ca, a from unnest(base) a
  union all select r_eng, ca, a from unnest(array['quality.view', 'quality.edit', 'quality.scope.company', 'construction.view', 'construction.edit']) a
  union all select r_mx, ca, a from unnest(array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company']) a
  union all select r_my, ca, a from unnest(array['quality.view', 'quality.edit', 'quality.scope.company']) a
  union all select r_cm, ca, a from unnest(array['construction.view', 'construction.edit', 'construction.manage']) a
  union all select r_con, ca, a from unnest(array['quality.view', 'quality.scope.contractor', 'construction.view', 'construction.edit']) a;
  insert into core.role_assignments(company_id, user_id, role_id) values
    (ca, uadm, r_adm), (ca, udep, r_dep), (ca, ueng, r_eng), (ca, ucm, r_cm), (ca, ucon, r_con);
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values (ca, umx, r_mx, px), (ca, umx, r_my, py);

  insert into quality.contractor_normalization_queue(id, project_code, raw_name, suggested_canonical_key, source_table, status, admin_comment, core_company_id) values
    ('037a0000-0000-4000-8000-000000000001', px::text, 'Новострой', 'новострой', 'rbi_inspections', 'pending', null, ca),
    ('037a0000-0000-4000-8000-000000000002', px::text, 'Разобран', 'разобран', 'rbi_inspections', 'approved', 'ок', ca),
    ('037a0000-0000-4000-8000-000000000003', py::text, 'Игрек', 'игрек', 'rbi_inspections', 'pending', null, ca);
  insert into quality.object_normalization_queue(id, project_code, raw_name, status, core_company_id) values
    ('o-1', px::text, 'Дом 5', 'pending', ca), ('o-2', px::text, 'Дом 6', 'pending', ca);

  -- M1: «Рук. объекта X» (manage на X, edit на Y) переносит заявку с Y на X и пытается решить — решение не проходит
  perform pg_temp.as_user(umx, ca);
  n := pg_temp.rows(format($q$update quality.contractor_normalization_queue set project_code = %L, status = 'approved', admin_comment = 'взлом' where id = '037a0000-0000-4000-8000-000000000003'$q$, px::text));
  res := res || pg_temp.t(pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000003')) like 'pending|%|', 'M1: перенос Y→X не даёт решить заявку (' || pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000003')) || ')');
  perform pg_temp.as_user(umx, ca);
  n := pg_temp.rows($q$update quality.contractor_normalization_queue set status = 'approved' where id = '037a0000-0000-4000-8000-000000000001'$q$);
  res := res || pg_temp.t(pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000001')) like 'approved|%', 'M1: на своём объекте X решает (как раньше)');
  reset role;
  update quality.contractor_normalization_queue set status = 'pending' where id = '037a0000-0000-4000-8000-000000000001';

  -- M1 в два шага (ревью P2-0031 review-1 M1): перенос отдельным запросом — объект не меняется, затем решить нельзя
  perform pg_temp.as_user(umx, ca);
  n := pg_temp.rows(format($q$update quality.contractor_normalization_queue set project_code = %L where id = '037a0000-0000-4000-8000-000000000003'$q$, px::text));
  res := res || pg_temp.t(pg_temp.val($q$select core_project_id::text from quality.contractor_normalization_queue where id = '037a0000-0000-4000-8000-000000000003'$q$) = py::text,
                          'M1-2: перенос Y→X не-админом отдельным запросом — объект остался Y');
  perform pg_temp.as_user(umx, ca);
  n := pg_temp.rows($q$update quality.contractor_normalization_queue set status = 'approved' where id = '037a0000-0000-4000-8000-000000000003'$q$);
  res := res || pg_temp.t(pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000003')) like 'pending|%', 'M1-2: после попытки переноса решить чужую заявку нельзя');
  -- не-UUID код объекта: объект не обнуляется, решить нельзя
  perform pg_temp.as_user(umx, ca);
  n := pg_temp.rows($q$update quality.contractor_normalization_queue set project_code = 'мусор' where id = '037a0000-0000-4000-8000-000000000003'$q$);
  res := res || pg_temp.t(pg_temp.val($q$select core_project_id::text || '|' || project_code from quality.contractor_normalization_queue where id = '037a0000-0000-4000-8000-000000000003'$q$) = py::text || '|' || py::text,
                          'не-UUID код у не-админа — объект и код прежние (' || pg_temp.val($q$select coalesce(core_project_id::text, 'NULL') || '|' || project_code from quality.contractor_normalization_queue where id = '037a0000-0000-4000-8000-000000000003'$q$) || ')');
  perform pg_temp.as_user(umx, ca);
  n := pg_temp.rows($q$update quality.contractor_normalization_queue set status = 'approved' where id = '037a0000-0000-4000-8000-000000000003'$q$);
  res := res || pg_temp.t(pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000003')) like 'pending|%', 'не-UUID код: решить нельзя');
  -- инженер уточняет текст своей заявки как раньше (без ошибки), объект прежний
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.err(format($q$update quality.contractor_normalization_queue set project_code = %L, raw_name = 'Игрек ООО' where id = '037a0000-0000-4000-8000-000000000003'$q$, px::text)) = 'OK',
                          'инженер: повторная подача с другим объектом — без ошибки');
  res := res || pg_temp.t(pg_temp.val($q$select core_project_id::text || '|' || raw_name from quality.contractor_normalization_queue where id = '037a0000-0000-4000-8000-000000000003'$q$) = py::text || '|Игрек ООО',
                          'инженер: текст уточнён, объект прежний');
  -- Админ переносит заявку, как раньше
  perform pg_temp.as_user(uadm, ca);
  n := pg_temp.rows(format($q$update quality.contractor_normalization_queue set project_code = %L where id = '037a0000-0000-4000-8000-000000000003'$q$, px::text));
  res := res || pg_temp.t(pg_temp.val($q$select core_project_id::text from quality.contractor_normalization_queue where id = '037a0000-0000-4000-8000-000000000003'$q$) = px::text,
                          'Админ переносит заявку на другой объект');

  -- M2: разобранную заявку инженер не переписывает (без ошибки); заявку «на рассмотрении» — уточняет, как раньше
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.err($q$update quality.contractor_normalization_queue set raw_name = 'Подмена', suggested_canonical_key = 'подмена', source_table = 'x', status = 'pending', admin_comment = null where id = '037a0000-0000-4000-8000-000000000002'$q$) = 'OK',
                          'M2: повторная подача разобранной — без ошибки');
  res := res || pg_temp.t(pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000002')) = 'approved|Разобран|разобран|rbi_inspections|ок', 'M2: разобранная не изменилась (' || pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000002')) || ')');
  perform pg_temp.as_user(ueng, ca);
  n := pg_temp.rows($q$update quality.contractor_normalization_queue set raw_name = 'Новострой ООО', status = 'approved' where id = '037a0000-0000-4000-8000-000000000001'$q$);
  res := res || pg_temp.t(pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000001')) like 'pending|Новострой ООО|%', 'M2: заявку «на рассмотрении» инженер уточняет, решить не может');
  perform pg_temp.as_user(uadm, ca);
  n := pg_temp.rows($q$update quality.contractor_normalization_queue set raw_name = 'Разобран-2', admin_comment = 'исправил' where id = '037a0000-0000-4000-8000-000000000002'$q$);
  res := res || pg_temp.t(pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000002')) like 'approved|Разобран-2|%|исправил', 'M2: Админ правит разобранную');

  -- L4: заявку на объект решает и удаляет только справочник объектов (Админ), не Зам. и не Стройконтроль-админ
  perform pg_temp.as_user(udep, ca);
  n := pg_temp.rows($q$update quality.object_normalization_queue set status = 'approved' where id = 'o-1'$q$);
  res := res || pg_temp.t(pg_temp.val(format(q_o, 'o-1')) like 'pending|%', 'L4: Зам. не решает заявку на объект');
  perform pg_temp.as_user(udep, ca);
  res := res || pg_temp.t(pg_temp.rows($q$delete from quality.object_normalization_queue where id = 'o-1'$q$) = 0, 'L4: Зам. не удаляет заявку на объект');
  perform pg_temp.as_user(ucm, ca);
  n := pg_temp.rows($q$update quality.object_normalization_queue set status = 'approved' where id = 'o-1'$q$);
  res := res || pg_temp.t(pg_temp.val(format(q_o, 'o-1')) like 'pending|%', 'L4: construction.manage без справочника объектов — не решает');
  perform pg_temp.as_user(uadm, ca);
  n := pg_temp.rows($q$update quality.object_normalization_queue set status = 'approved' where id = 'o-1'$q$);
  res := res || pg_temp.t(pg_temp.val(format(q_o, 'o-1')) like 'approved|%', 'L4: Админ решает заявку на объект');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.rows($q$delete from quality.object_normalization_queue where id = 'o-2'$q$) = 1, 'L4: Админ удаляет заявку на объект');
  perform pg_temp.as_user(udep, ca);
  n := pg_temp.rows($q$update quality.contractor_normalization_queue set status = 'rejected' where id = '037a0000-0000-4000-8000-000000000001'$q$);
  res := res || pg_temp.t(pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000001')) like 'rejected|%', 'Зам. решает заявку на подрядчика (как в 037)');
  reset role;
  update quality.contractor_normalization_queue set status = 'pending' where id = '037a0000-0000-4000-8000-000000000001';

  -- construction.manage без quality.manage: заявку на подрядчика решает (как справочник подрядчиков, 037)
  perform pg_temp.as_user(ucm, ca);
  n := pg_temp.rows($q$update quality.contractor_normalization_queue set status = 'approved' where id = '037a0000-0000-4000-8000-000000000001'$q$);
  res := res || pg_temp.t(pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000001')) like 'approved|%', 'construction.manage решает заявку на подрядчика');
  reset role;
  update quality.contractor_normalization_queue set status = 'pending' where id = '037a0000-0000-4000-8000-000000000001';

  -- L6: инженер добавляет подрядчика в contractors (как раньше), не правит; подрядчик — не добавляет; заявка подрядчика — на рассмотрении
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.contractors(id, "displayName", core_company_id) values ('k-eng', 'Новый', %L)$q$, ca)) = 'OK',
                          'инженер добавляет подрядчика в contractors');
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.rows($q$update quality.contractors set "displayName" = 'Взлом' where id = 'k-eng'$q$) = 0, 'инженер не правит подрядчика');
  perform pg_temp.as_user(ucon, ca);
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.contractors(id, "displayName", core_company_id) values ('k-con', 'Свой', %L)$q$, ca)) <> 'OK',
                          'роль-подрядчик не добавляет в справочник подрядчиков');
  perform pg_temp.as_user(ucon, ca);
  n := pg_temp.rows(format($q$insert into quality.contractor_normalization_queue(id, project_code, raw_name, status, core_company_id) values ('037a0000-0000-4000-8000-000000000004', %L, 'От подрядчика', 'approved', %L)$q$, px::text, ca));
  res := res || pg_temp.t(coalesce(pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000004')), 'pending|') like 'pending|%', 'роль-подрядчик: заявка (если принята) — на рассмотрении (' || coalesce(pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000004')), 'нет строки') || ')');
  perform pg_temp.as_user(ucon, ca);
  n := pg_temp.rows($q$update quality.contractor_normalization_queue set status = 'approved' where id = '037a0000-0000-4000-8000-000000000001'$q$);
  res := res || pg_temp.t(pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000001')) like 'pending|%', 'роль-подрядчик не решает заявку');

  -- anon: ни прочитать, ни изменить, ни подать (сторож не нужен — нет прав)
  perform pg_temp.as_user(null, ca);
  res := res || pg_temp.t(pg_temp.err($q$update quality.contractor_normalization_queue set status = 'approved' where id = '037a0000-0000-4000-8000-000000000001'$q$) <> 'OK', 'anon: изменение заявки — отказ');
  perform pg_temp.as_user(null, ca);
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.object_normalization_queue(id, project_code, raw_name, status, core_company_id) values ('o-anon', %L, 'x', 'approved', %L)$q$, px::text, ca)) <> 'OK',
                          'anon: подача заявки — отказ');
  res := res || pg_temp.t(pg_temp.val(format(q_c, '037a0000-0000-4000-8000-000000000001')) like 'pending|%', 'anon: заявка не изменилась');

  reset role;
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
