-- P2-0028: старый профиль РБИ → учётка (032b, 032c — имя к ФИО учётки без учёта регистра). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
-- Запуск: после 032c_staff_profiles_case_up.sql (PGlite — после модели 032_auth_model.pglite.sql). Почты — только @test.invalid.
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
  uadm uuid := gen_random_uuid(); ueng uuid := gen_random_uuid(); uold uuid := gen_random_uuid(); uoth uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); prof uuid := gen_random_uuid(); poth uuid := gen_random_uuid();
  upet uuid := gen_random_uuid(); ppet uuid := gen_random_uuid(); pb2 uuid := gen_random_uuid(); prof2 uuid := gen_random_uuid(); uold2 uuid := gen_random_uuid();
  k text; n int; res text := ''; r record;
begin
  perform pg_temp.as_owner();
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, ueng, uold, uoth, upet, uold2]) u;
  update auth.users set email_confirmed_at = now() where id in (uadm, ueng, uold, uoth, upet, uold2);
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 032b', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, ueng), (ca, upet);
  insert into core.projects(id, company_id, name) values (pa, ca, 'Объект А 032b'), (pb2, ca, 'Объект Б 032b');
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, uadm, (select id from core.company_roles where company_id = ca and template_code = 'company_admin'), null);
  insert into core.user_profiles(user_id, full_name, managed_company_id) values (ueng, 'Иванов А.И.', ca), (upet, 'Петрушко Д.М.', ca);
  k := core.staff_profile_key(pa::text, 'Иванов А.И.');
  -- старый профиль (перенос): старый ключ, старая учётка PIN, 2 записи очков
  insert into quality.rbi_engineer_profiles(id, inspector_id, project_code, core_company_id, engineer_name, inspector_name, auth_user_id, profile_data) values
    (prof, 'rbi-test_Иванов_А.И.', pa::text, ca, 'Иванов А.И.', 'Иванов А.И.', uold, '{"gameLogs":[{"id":1},{"id":2}],"plan":{"w":1}}'),
    (gen_random_uuid(), pa::text || '_' || ueng || '@test.invalid', pa::text, ca, ueng || '@test.invalid', ueng || '@test.invalid', ueng, '{"gameLogs":[{"id":3}]}'),   -- дубль нового приложения (имя = почта)
    (poth, 'rbi-test_Петров_П.П.', pa::text, ca, 'Петров П.П.', 'Петров П.П.', uoth, '{"gameLogs":[{"id":9}]}'),                                         -- чужой профиль
    (ppet, 'rbi-test_ПЕТРУШКО_Д.М.', pa::text, ca, 'ПЕТРУШКО Д.М.', 'ПЕТРУШКО Д.М.', null, '{"gameLogs":[{"id":7}]}');                                 -- имя заглавными
  insert into quality.rbi_inspections(id, project_code, core_company_id, engineer_name, inspector_name, core_created_by) values
    ('pi1-' || ppet, pa::text, ca, 'ПЕТРУШКО Д.М.', 'ПЕТРУШКО Д.М.', upet);
  -- H2: у инженера второй старый профиль на другом объекте
  insert into quality.rbi_engineer_profiles(id, inspector_id, project_code, core_company_id, engineer_name, inspector_name, auth_user_id, profile_data) values
    (prof2, 'rbi-test2_Иванов_А.И.', pb2::text, ca, 'Иванов А.И.', 'Иванов А.И.', uold2, '{"gameLogs":[{"id":5}]}');
  insert into quality.rbi_transfer_people(core_company_id, old_profile_id, email, user_id) values (ca, prof, ueng || '@test.invalid', ueng),
    (ca, prof2, ueng || '@test.invalid', ueng),
    (ca, ppet, upet || '@test.invalid', upet);
  insert into quality.rbi_engineer_ratings(id, project_code, core_company_id, engineer_name, pi) values
    (k, pa::text, ca, 'Иванов А.И.', 100), ('x-' || poth, pa::text, ca, 'Петров П.П.', 50), ('x-' || ppet, pa::text, ca, 'ПЕТРУШКО Д.М.', 70);

  -- 1. Клиенту функция привязки закрыта
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(pg_temp.err(format('select * from quality.rbi_transfer_attach_profiles(%L)', ca)) like '42501%', 'клиент не вызывает привязку профилей');
  perform pg_temp.as_owner();

  -- 2. Привязка
  select * into r from quality.rbi_transfer_attach_profiles(ca) a where a.old_key like '%Иванов%';
  res := res || pg_temp.t(r.old_key = 'rbi-test_Иванов_А.И.' and r.new_key = k and r.merged_duplicates = 1 and r.game_logs = 3, 'итог: старый → новый ключ, дубль 1, очков 3');
  res := res || pg_temp.t((select inspector_id = k and auth_user_id = ueng and auth_email = ueng || '@test.invalid'
                           and jsonb_array_length(profile_data -> 'gameLogs') = 3 and profile_data -> 'plan' = '{"w":1}'
                           from quality.rbi_engineer_profiles where id = prof), 'старый профиль: ключ объекта, учётка, очки слиты, остальное на месте');
  res := res || pg_temp.t((select count(*) from quality.rbi_engineer_profiles where core_company_id = ca and auth_user_id = ueng and project_code = pa::text) = 1, 'дубль удалён — у учётки один профиль на объекте');
  res := res || pg_temp.t((select inspector_id = 'rbi-test_Петров_П.П.' and auth_user_id = uoth and jsonb_array_length(profile_data -> 'gameLogs') = 1
                           from quality.rbi_engineer_profiles where id = poth), 'чужой профиль не тронут');
  res := res || pg_temp.t(k = pa::text || '_Иванов_А.И.', 'ключ как в sync-engine (пробелы → _)');
  -- имя заглавными → ФИО учётки: профиль, ключ, рейтинг, записи автора
  res := res || pg_temp.t((select engineer_name = 'Петрушко Д.М.' and inspector_name = 'Петрушко Д.М.' and inspector_id = core.staff_profile_key(pa::text, 'Петрушко Д.М.')
                           and auth_user_id = upet from quality.rbi_engineer_profiles where id = ppet), 'ПЕТРУШКО → «Петрушко Д.М.»: профиль и ключ');
  res := res || pg_temp.t((select engineer_name from quality.rbi_engineer_ratings where id = 'x-' || ppet) = 'Петрушко Д.М.', 'ПЕТРУШКО → рейтинг');
  res := res || pg_temp.t((select engineer_name = 'Петрушко Д.М.' and inspector_name = engineer_name from quality.rbi_inspections where id = 'pi1-' || ppet), 'ПЕТРУШКО → записи автора');
  res := res || pg_temp.t(exists (select 1 from quality.rbi_engineer_profiles where id = prof2 and auth_user_id = uold2
                                  and jsonb_array_length(profile_data -> 'gameLogs') = 1)
                          and (select jsonb_array_length(profile_data -> 'gameLogs') from quality.rbi_engineer_profiles where id = prof) = 3,
                          'H2: профиль на другом объекте сохранён (не удалён, не привязан), очки не перемешаны');
  -- повтор — без изменений
  select * into r from quality.rbi_transfer_attach_profiles(ca) a where a.old_key like '%Иванов%' or a.new_key like '%Иванов%';
  res := res || pg_temp.t(r.merged_duplicates = 0 and r.game_logs = 3 and r.new_key = k, 'повтор: дублей 0, очков 3');

  -- 3. Смена ФИО: ключ профиля и рейтинг — за именем
  perform pg_temp.as_user(uadm);
  n := public.pf_set_full_name(ueng, 'Иванов Алексей Игоревич');
  perform pg_temp.as_owner();
  res := res || pg_temp.t((select inspector_id = core.staff_profile_key(pa::text, 'Иванов Алексей Игоревич') and engineer_name = 'Иванов Алексей Игоревич'
                           from quality.rbi_engineer_profiles where id = prof), 'ФИО сменили: ключ профиля новый');
  res := res || pg_temp.t((select engineer_name from quality.rbi_engineer_ratings where id = k) = 'Иванов Алексей Игоревич'
                          and (select engineer_name from quality.rbi_engineer_ratings where id = 'x-' || poth) = 'Петров П.П.', 'рейтинг переименован, чужой — нет');

  -- 4. M5: на том же объекте однофамилец с будущим ФИО — смена ФИО не падает, профили не конфликтуют
  insert into quality.rbi_engineer_profiles(id, inspector_id, project_code, core_company_id, engineer_name, inspector_name, auth_user_id) values
    (gen_random_uuid(), core.staff_profile_key(pa::text, 'Иванов Третий'), pa::text, ca, 'Иванов Третий', 'Иванов Третий', null);
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_set_full_name(%L, %L)', ueng, 'Иванов Третий')) = 'OK', 'M5: однофамилец на объекте — смена ФИО не падает');
  perform pg_temp.as_owner();
  res := res || pg_temp.t((select engineer_name from quality.rbi_engineer_profiles where id = prof) = 'Иванов Алексей Игоревич'
                          and (select full_name from core.user_profiles where user_id = ueng) = 'Иванов Третий', 'M5: ФИО сохранено, профиль при конфликте не переименован');

  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res, 'FAIL', ''))) / 4;
end $$;
