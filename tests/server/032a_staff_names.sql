-- P2-0028 этап 3: ФИО везде (032a). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
-- Запуск: после 032a_staff_names_up.sql (PGlite — после модели 032_auth_model.pglite.sql). Почты — только @test.invalid.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
create or replace function pg_temp.as_owner() returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then 'OK ' || l else 'FAIL ' || l end || E'\n' $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); ueng uuid := gen_random_uuid(); uoth uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid();
  umulti uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  e_eng text; n int; res text := ''; s text := substr(md5(random()::text), 1, 8);
begin
  perform pg_temp.as_owner();
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, ueng, uoth, ubadm, umulti]) u;
  update auth.users set email_confirmed_at = now() where id in (uadm, ueng, uoth, ubadm, umulti);
  e_eng := ueng || '@test.invalid';
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 032a', true), (cb, 'Бета 032a', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, ueng), (ca, uoth), (cb, ubadm), (ca, umulti), (cb, umulti);
  insert into core.projects(id, company_id, name) values (pa, ca, 'Объект А 032a'), (pb, cb, 'Объект Б 032a');
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, uadm, (select id from core.company_roles where company_id = ca and template_code = 'company_admin'), null),
    (ca, ueng, (select id from core.company_roles where company_id = ca and template_code = 'foreman'), pa),
    (cb, ubadm, (select id from core.company_roles where company_id = cb and template_code = 'company_admin'), null);
  insert into core.user_profiles(user_id, full_name, managed_company_id) values (ueng, 'Иванов А.И.', ca), (uoth, 'Петров П.П.', ca);
  -- записи Качества: старые (имя), новые (почта), задача назначена инженеру, чужая запись с тем же именем, без автора, другая компания
  insert into quality.rbi_inspections(id, project_code, core_company_id, engineer_name, inspector_name, created_by_name, core_created_by) values
    ('i1-' || s, pa::text, ca, 'Иванов А.И.', 'Иванов А.И.', 'Иванов А.И.', ueng),
    ('i2-' || s, pa::text, ca, e_eng, e_eng, null, ueng),
    ('i3-' || s, pa::text, ca, 'Иванов А.И.', 'Петров П.П.', null, ueng),        -- проверяющий другой человек
    ('i4-' || s, pa::text, ca, 'Иванов А.И.', 'Иванов А.И.', null, uoth),        -- чужая запись с тем же именем
    ('i5-' || s, pa::text, ca, 'Иванов А.И.', 'Иванов А.И.', null, null),        -- без автора
    ('i6-' || s, pb::text, cb, 'Иванов А.И.', 'Иванов А.И.', null, ueng);        -- другая компания (не участник)
  insert into quality.rbi_tasks(id, project_code, core_company_id, engineer_name, assigned_to_name, assigned_to_auth_user_id, core_created_by) values
    ('t1-' || s, pa::text, ca, 'Иванов А.И.', 'Иванов А.И.', ueng, uadm),        -- назначена инженеру админом
    ('t2-' || s, pa::text, ca, 'Петров П.П.', 'Петров П.П.', uoth, uadm),
    ('t3-' || s, pa::text, ca, 'Иванов А.И.', 'Иванов А.И.', uoth, ueng);        -- M2: автор — инженер, назначена однофамильцу-«Иванову» (учётка uoth)
  insert into quality.rbi_engineer_profiles(project_code, core_company_id, engineer_name, inspector_name, auth_user_id) values
    (ca::text, ca, 'Иванов А.И.', 'Иванов А.И.', ueng);

  -- 1. Права
  perform pg_temp.as_user(uoth);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_set_full_name(%L, %L)', ueng, 'Взлом В.В.')) like '42501%', 'сотрудник не меняет чужое ФИО');
  perform pg_temp.as_user(ubadm);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_set_full_name(%L, %L)', ueng, 'Взлом В.В.')) like '42501%', 'админ другой компании — отказ');
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_set_full_name(%L, %L)', umulti, 'Мульти М.М.')) like '42501%', 'человек и в чужой компании, учётка не наша — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_set_full_name(%L, %L)', ueng, ' 1 ')) like '22023%', 'ФИО без букв — отказ');
  perform pg_temp.as_owner();
  perform set_config('request.jwt.claims', '', true); execute 'set local role anon';
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_set_full_name(%L, %L)', ueng, 'Аноним')) like '42501%', 'anon — отказ');

  -- 2. Админ компании меняет ФИО инженера
  perform pg_temp.as_user(uadm);
  n := public.pf_set_full_name(ueng, '  Иванов   Алексей Игоревич ');
  perform pg_temp.as_owner();
  res := res || pg_temp.t((select full_name from core.user_profiles where user_id = ueng) = 'Иванов Алексей Игоревич', 'ФИО сохранено (пробелы убраны)');
  res := res || pg_temp.t((select engineer_name = 'Иванов Алексей Игоревич' and inspector_name = engineer_name and created_by_name = engineer_name
                           from quality.rbi_inspections where id = 'i1-' || s), 'старая запись (имя) — новое ФИО во всех полях');
  res := res || pg_temp.t((select engineer_name = 'Иванов Алексей Игоревич' and inspector_name = engineer_name from quality.rbi_inspections where id = 'i2-' || s), 'новая запись (почта) — ФИО');
  res := res || pg_temp.t((select engineer_name = 'Иванов Алексей Игоревич' and inspector_name = 'Петров П.П.' from quality.rbi_inspections where id = 'i3-' || s), 'чужое имя в записи автора не тронуто');
  res := res || pg_temp.t((select engineer_name = 'Иванов А.И.' from quality.rbi_inspections where id = 'i4-' || s), 'запись другого автора не тронута');
  res := res || pg_temp.t((select engineer_name = 'Иванов А.И.' from quality.rbi_inspections where id = 'i5-' || s), 'запись без автора не тронута');
  res := res || pg_temp.t((select engineer_name = 'Иванов А.И.' from quality.rbi_inspections where id = 'i6-' || s), 'другая компания не тронута');
  res := res || pg_temp.t((select engineer_name = 'Иванов Алексей Игоревич' and assigned_to_name = engineer_name from quality.rbi_tasks where id = 't1-' || s), 'задача, назначенная учётке, — ФИО');
  res := res || pg_temp.t((select engineer_name = 'Петров П.П.' from quality.rbi_tasks where id = 't2-' || s), 'чужая задача не тронута');
  res := res || pg_temp.t((select engineer_name = 'Иванов Алексей Игоревич' from quality.rbi_engineer_profiles where auth_user_id = ueng), 'профиль Качества учётки — ФИО');
  res := res || pg_temp.t(n = 6, 'изменено строк: ' || n || ' (ожидается 6: i1, i2, i3, t1, t3, профиль)');
  res := res || pg_temp.t((select engineer_name = 'Иванов Алексей Игоревич' and assigned_to_name = 'Иванов А.И.' from quality.rbi_tasks where id = 't3-' || s),
                          'M2: в своей задаче назначенный другой человек — его имя не тронуто');
  res := res || pg_temp.t(exists (select 1 from core.audit_log where company_id = ca and record_id = ueng and action = 'FULL_NAME' and actor = uadm
                                  and old_data ->> 'full_name' = 'Иванов А.И.' and (new_data ->> 'quality_rows')::int = 6), 'журнал: FULL_NAME, было/стало, строк');
  res := res || pg_temp.t(not exists (select 1 from core.audit_log where company_id = cb and record_id = ueng), 'журнал другой компании пуст');

  -- 2а. M1: админ платформы добавил инженера во вторую компанию (учётка — Альфы, но человек и в Бете) → админ Альфы меняет ФИО:
  --     имена переписываются только в Альфе, в Бете — нет; админ Альфы больше не «владелец» учётки (в двух компаниях)
  perform pg_temp.as_owner();
  insert into core.company_members(company_id, user_id) values (cb, ueng);
  update quality.rbi_inspections set engineer_name = 'Иванов Алексей Игоревич' where id = 'i6-' || s;   -- запись в Бете
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_set_full_name(%L, %L)', ueng, 'Иванов Бета')) like '42501%',
                          'M1/H1: человек в чужой компании — админ Альфы ФИО не меняет');
  perform pg_temp.as_owner();
  delete from core.company_members where company_id = cb and user_id = ueng;

  -- 3. Сам сотрудник меняет своё ФИО; прежнее ФИО — тоже «старое имя»
  perform pg_temp.as_user(ueng);
  n := public.pf_set_full_name(ueng, 'Иванов А. И.');
  perform pg_temp.as_owner();
  res := res || pg_temp.t((select engineer_name from quality.rbi_inspections where id = 'i1-' || s) = 'Иванов А. И.'
                          and (select engineer_name from quality.rbi_inspections where id = 'i4-' || s) = 'Иванов А.И.', 'сам себе: свои записи — новое ФИО, чужие — нет');
  perform pg_temp.as_user(ueng);
  res := res || pg_temp.t(public.pf_set_full_name(ueng, 'Иванов А. И.') = 0, 'то же ФИО — ничего не меняется');
  res := res || pg_temp.t((public.pf_my_profile() ->> 'full_name') = 'Иванов А. И.', 'pf_my_profile — новое ФИО');
  perform pg_temp.as_owner();

  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res, 'FAIL', ''))) / 4;
end $$;
