-- P2-0037 этап 1 (037): справочники и настройки Качества пишет только администратор компании; обычная работа инженера —
-- без изменений. Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N». Запуск: после 037_quality_admin_up.sql.
-- Пользователи и компании — тестовые (@test.invalid, is_test). Роли — как у РБИ (033a/033c/034): Админ (+ справочник объектов),
-- Зам. руководителя, Директор, Инженер СК (добавляет подрядчика — да, править — нет: решение владельца 25.10.2026); отключённый сотрудник — Админ с отозванным назначением; Бета — свой Админ.
-- Действие и проверка результата — отдельными операторами (в «a and b» порядок вычисления не гарантирован).
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
declare v text; begin execute q into v; return v; exception when others then return 'ERR:' || sqlstate; end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); udep uuid := gen_random_uuid(); udir uuid := gen_random_uuid(); ueng uuid := gen_random_uuid();
  uoff uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  r_adm uuid; r_dep uuid; r_dir uuid; r_eng uuid; r_badm uuid;
  pc text; pcb text; s text; n int; res text := '';
  base text[] := array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company', 'quality.ai',
                       'construction.view', 'construction.edit', 'construction.manage', 'security.roles.assign'];
  ins_dir text := $q$insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id) values (%L, %L, %L, %L)$q$;
  q_cq text := $q$select status || '|' || coalesce(admin_comment, '') || '|' || coalesce(is_deleted, false) from quality.contractor_normalization_queue where raw_name = %L$q$;
  q_oq text := $q$select status || '|' || coalesce(admin_comment, '') from quality.object_normalization_queue where id = %L$q$;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, udep, udir, ueng, uoff, ub]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 037', true), (cb, 'Бета 037', true);
  insert into core.company_members(company_id, user_id)
    select ca, u from unnest(array[uadm, udep, udir, ueng, uoff]) u union all select cb, ub;
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.projects(id, company_id, name) values (pa, ca, 'Объекты Альфы 037'), (pb, cb, 'Объекты Беты 037');
  pc := pa::text; pcb := pb::text;
  insert into core.company_roles(company_id, name) values (ca, 'Админ 037') returning id into r_adm;
  insert into core.company_roles(company_id, name) values (ca, 'Зам. руководителя 037') returning id into r_dep;
  insert into core.company_roles(company_id, name) values (ca, 'Директор 037') returning id into r_dir;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер СК 037') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (cb, 'Админ Б 037') returning id into r_badm;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_adm, ca, a from unnest(base || array['quality.objects.manage', 'construction.objects.manage']) a
  union all select r_dep, ca, a from unnest(base) a
  union all select r_dir, ca, a from unnest(array['quality.view', 'quality.scope.company', 'construction.view']) a
  union all select r_eng, ca, a from unnest(array['quality.view', 'quality.edit', 'quality.ai', 'construction.view', 'construction.edit']) a
  union all select r_badm, cb, a from unnest(base || array['quality.objects.manage', 'construction.objects.manage']) a;
  insert into core.role_assignments(company_id, user_id, role_id) values
    (ca, uadm, r_adm), (ca, udep, r_dep), (ca, udir, r_dir), (ca, ueng, r_eng), (cb, ub, r_badm);
  insert into core.role_assignments(company_id, user_id, role_id, revoked_at) values (ca, uoff, r_adm, now());

  -- данные Альфы: подрядчик, синоним, заявки (одна уже разобрана); Беты — свой подрядчик
  insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id) values (pc, 'стройка', 'Стройка', ca);
  insert into quality.contractor_aliases(project_code, raw_name, canonical_key, core_company_id) values (pc, 'Стройка ООО', 'стройка', ca);
  insert into quality.contractors(id, "displayName", core_company_id) values ('k1-m37', 'Стройка', ca);
  insert into quality.contractor_normalization_queue(project_code, raw_name, status, core_company_id) values
    (pc, 'Новострой', 'pending', ca), (pc, 'Разобран', 'approved', ca);
  insert into quality.object_normalization_queue(id, project_code, raw_name, status, core_company_id) values
    ('oq1-m37', pc, 'Дом 5', 'pending', ca);
  insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id) values (pcb, 'бета', 'Бета', cb);

  -- 1. Инженер: справочник подрядчиков — отказ сервера
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.err(format(ins_dir, pc, 'новый', 'Новый', ca)) = 'OK', 'инженер добавляет нового подрядчика (как раньше, ADR-068 п. 6)');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.contractor_directory set display_name = 'Взлом' where canonical_key = 'стройка'$q$) = 0,
                          'инженер не переименовывает подрядчика');
  res := res || pg_temp.t(pg_temp.rows($q$delete from quality.contractor_directory where canonical_key = 'стройка'$q$) = 0,
                          'инженер не удаляет подрядчика');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.contractor_aliases(project_code, raw_name, canonical_key, core_company_id)
    values (%L, 'Взлом', 'стройка', %L)$q$, pc, ca)) = '42501', 'инженер не добавляет синоним подрядчика');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.contractor_aliases set canonical_key = 'взлом' where raw_name = 'Стройка ООО'$q$) = 0,
                          'инженер не перепривязывает синоним');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.contractor_directory set display_name = 'Взлом' where canonical_key = 'новый'$q$) = 0,
                          'инженер не правит даже добавленного им подрядчика');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id)
    values (%L, 'стройка', 'Взлом', %L) on conflict (core_company_id, project_code, canonical_key) do update set display_name = excluded.display_name$q$, pc, ca)) = '42501',
                          'инженер не переписывает подрядчика повторной подачей');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.contractors set "displayName" = 'Взлом' where id = 'k1-m37'$q$) = 0,
                          'инженер не правит подрядчика платформы');
  -- настройки и справочник объектов (018/033c) — по-прежнему отказ
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_company_settings(core_company_id, official_templates) values (%L, '{}')$q$, ca)) = '42501',
                          'инженер не публикует официальные чек-листы');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.project_settings(project_code, core_company_id) values (%L, %L)$q$, pc, ca)) = '42501',
                          'инженер не меняет оформление');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.project_objects(id, canonical_key, display_name, core_company_id)
    values ('obj-9-m37', 'x', 'y', %L)$q$, ca)) = '42501', 'инженер не добавляет объект в справочник');

  -- 2. Инженер: заявки подаёт как раньше, но не решает их
  s := pg_temp.err(format($q$insert into quality.contractor_normalization_queue(project_code, raw_name, status, core_company_id)
    values (%L, 'Свой подрядчик', 'approved', %L)$q$, pc, ca));
  res := res || pg_temp.t(s = 'OK', 'инженер подаёт заявку на подрядчика');
  res := res || pg_temp.t(pg_temp.val(format(q_cq, 'Свой подрядчик')) = 'pending||false', 'заявка инженера — всегда «на рассмотрении»');
  s := pg_temp.err(format($q$insert into quality.contractor_normalization_queue(project_code, raw_name, status, core_company_id)
    values (%L, 'Разобран', 'pending', %L) on conflict (core_company_id, project_code, raw_name) do update set status = excluded.status, updated_at = now()$q$, pc, ca));
  res := res || pg_temp.t(s = 'OK', 'повторная подача разобранной заявки не ломает синхронизацию');
  res := res || pg_temp.t(pg_temp.val(format(q_cq, 'Разобран')) = 'approved||false', 'повторная подача не возвращает разобранную заявку');
  n := pg_temp.rows($q$update quality.contractor_normalization_queue set status = 'approved', admin_comment = 'сам' where raw_name = 'Новострой'$q$);
  res := res || pg_temp.t(n = 1 and pg_temp.val(format(q_cq, 'Новострой')) = 'pending||false', 'инженер не одобряет заявку на подрядчика');
  n := pg_temp.rows($q$update quality.contractor_normalization_queue set is_deleted = true where raw_name = 'Новострой'$q$);
  res := res || pg_temp.t(n = 1 and pg_temp.val(format(q_cq, 'Новострой')) = 'pending||false', 'инженер не скрывает заявку');
  res := res || pg_temp.t(pg_temp.rows($q$delete from quality.contractor_normalization_queue where raw_name = 'Новострой'$q$) = 0,
                          'инженер не удаляет заявку на подрядчика');
  s := pg_temp.err(format($q$insert into quality.object_normalization_queue(id, project_code, raw_name, status, admin_comment, core_company_id)
    values ('oq2-m37', %L, 'Дом 7', 'approved', 'Новый объект найден при загрузке ПК СК', %L)$q$, pc, ca));
  res := res || pg_temp.t(s = 'OK' and pg_temp.val(format(q_oq, 'oq2-m37')) = 'pending|Новый объект найден при загрузке ПК СК',
                          'инженер подаёт заявку на объект (всегда «на рассмотрении», комментарий сохраняется)');
  n := pg_temp.rows($q$update quality.object_normalization_queue set status = 'approved' where id = 'oq1-m37'$q$);
  res := res || pg_temp.t(n = 1 and pg_temp.val(format(q_oq, 'oq1-m37')) = 'pending|', 'инженер не одобряет заявку на объект');
  res := res || pg_temp.t(pg_temp.rows($q$delete from quality.object_normalization_queue where id = 'oq1-m37'$q$) = 0,
                          'инженер не удаляет заявку на объект');
  -- обычная работа: проверка
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, core_company_id) values ('i1-m37', %L, %L)$q$, pc, ca)) = 'OK',
                          'инженер проводит проверку');

  -- 3. Директор и отключённый сотрудник — отказ; Зам. руководителя — подрядчики да, справочник объектов нет (033c)
  perform pg_temp.as_user(udir, ca);
  res := res || pg_temp.t(pg_temp.err(format(ins_dir, pc, 'дир', 'Дир', ca)) = '42501', 'Директор не правит справочник подрядчиков');
  perform pg_temp.as_user(uoff, ca);
  res := res || pg_temp.t(pg_temp.err(format(ins_dir, pc, 'офф', 'Офф', ca)) = '42501', 'отключённый Админ не правит справочник подрядчиков');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.contractor_normalization_queue set status = 'approved' where raw_name = 'Новострой'$q$) = 0,
                          'отключённый Админ не решает заявки');
  perform pg_temp.as_user(udep, ca);
  res := res || pg_temp.t(pg_temp.err(format(ins_dir, pc, 'зам', 'Зам', ca)) = 'OK', 'Зам. руководителя ведёт справочник подрядчиков');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.project_objects(id, canonical_key, display_name, core_company_id)
    values ('obj-8-m37', 'x', 'y', %L)$q$, ca)) = '42501', 'Зам. руководителя — справочник объектов нет (033c)');

  -- 4. Админ: всё
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.rows($q$update quality.contractor_directory set display_name = 'Стройка-1' where canonical_key = 'стройка'$q$) = 1,
                          'Админ правит подрядчика');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.contractor_aliases(project_code, raw_name, canonical_key, core_company_id)
    values (%L, 'Стройка-1 ООО', 'стройка', %L)$q$, pc, ca)) = 'OK', 'Админ добавляет синоним (слияние дублей)');
  res := res || pg_temp.t(pg_temp.rows($q$delete from quality.contractor_directory where canonical_key = 'зам'$q$) = 1, 'Админ удаляет дубль');
  n := pg_temp.rows($q$update quality.contractor_normalization_queue set status = 'approved', admin_comment = 'ок' where raw_name = 'Новострой'$q$);
  res := res || pg_temp.t(n = 1 and pg_temp.val(format(q_cq, 'Новострой')) = 'approved|ок|false', 'Админ одобряет заявку на подрядчика');
  n := pg_temp.rows($q$update quality.object_normalization_queue set status = 'approved' where id = 'oq1-m37'$q$);
  res := res || pg_temp.t(n = 1 and pg_temp.val(format(q_oq, 'oq1-m37')) = 'approved|', 'Админ одобряет заявку на объект');
  res := res || pg_temp.t(pg_temp.rows($q$delete from quality.object_normalization_queue where id = 'oq2-m37'$q$) = 1, 'Админ удаляет заявку на объект');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_company_settings(core_company_id, official_templates) values (%L, '{}')$q$, ca)) = 'OK',
                          'Админ публикует официальные чек-листы');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.project_settings(project_code, core_company_id) values (%L, %L)$q$, pc, ca)) = 'OK',
                          'Админ меняет оформление');
  -- этап 4: оформление при почте — одна запись на компанию (project_code = id компании), повторная публикация — обновление
  s := pg_temp.err(format($q$insert into quality.project_settings(project_code, logo_url, brand_color, core_company_id) values (%L, 'l1', '#111111', %L)
    on conflict (core_company_id, project_code) do update set logo_url = excluded.logo_url, brand_color = excluded.brand_color$q$, ca::text, ca));
  res := res || pg_temp.t(s = 'OK', 'Админ публикует оформление компании');
  s := pg_temp.err(format($q$insert into quality.project_settings(project_code, logo_url, brand_color, core_company_id) values (%L, 'l2', '#222222', %L)
    on conflict (core_company_id, project_code) do update set logo_url = excluded.logo_url, brand_color = excluded.brand_color$q$, ca::text, ca));
  res := res || pg_temp.t(s = 'OK' and pg_temp.val(format('select logo_url || brand_color || coalesce(core_project_id::text, ''-'') from quality.project_settings where project_code = %L', ca::text)) = 'l2#222222-',
                          'оформление компании — одна запись без объекта, повторная публикация обновляет');

  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.val(format('select logo_url from quality.project_settings where project_code = %L', ca::text)) = 'l2',
                          'инженер видит оформление компании');
  res := res || pg_temp.t(pg_temp.rows(format($q$update quality.project_settings set logo_url = 'взлом' where project_code = %L$q$, ca::text)) = 0,
                          'инженер не меняет оформление компании');

  -- 5. Чужая компания: Админ Беты не видит и не меняет справочник Альфы
  perform pg_temp.as_user(ub, cb);
  res := res || pg_temp.t(pg_temp.val(format('select count(*) from quality.project_settings where core_company_id = %L', ca)) = '0',
                          'Бета не видит оформление Альфы');
  res := res || pg_temp.t(pg_temp.rows(format($q$update quality.project_settings set logo_url = 'взлом' where core_company_id = %L$q$, ca)) = 0,
                          'Бета не меняет оформление Альфы');
  res := res || pg_temp.t(pg_temp.val(format('select count(*) from quality.contractor_directory where core_company_id = %L', ca)) = '0',
                          'Бета не видит подрядчиков Альфы');
  res := res || pg_temp.t(pg_temp.rows(format($q$update quality.contractor_directory set display_name = 'Взлом' where core_company_id = %L$q$, ca)) = 0,
                          'Бета не правит подрядчиков Альфы');
  res := res || pg_temp.t(pg_temp.rows(format($q$update quality.contractor_normalization_queue set status = 'rejected' where core_company_id = %L$q$, ca)) = 0,
                          'Бета не решает заявки Альфы');
  res := res || pg_temp.t(pg_temp.err(format(ins_dir, pc, 'взлом', 'Взлом', ca)) <> 'OK', 'Бета не добавляет подрядчика в Альфу');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.contractor_directory set display_name = 'Бета-1' where canonical_key = 'бета'$q$) = 1,
                          'Админ Беты ведёт свой справочник');
  -- anon
  perform pg_temp.as_user(null, null);
  res := res || pg_temp.t(pg_temp.err('select quality.queue_guard()') <> 'OK', 'anon: сторож закрыт');

  reset role;
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
