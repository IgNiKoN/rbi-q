-- P2-0035b этап 4 (040c, ТД №189 п. 2–3): однофамилец на объекте — переименование одного не трогает рейтинг другого,
-- привязка старого профиля не удаляет профиль однофамильца. Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N».
-- Запуск: после 040c_people_rename_by_id_up.sql (PGlite — суперпользователь; на 032d тот же тест даёт FAIL — так и задумано).
begin;
create temp table ids(k text primary key, v uuid);
insert into ids select k, gen_random_uuid() from unnest(array['ca','pa','ua','ub','uold','pold','pb']) k;
create function pg_temp.i(k text) returns uuid language sql as $f$ select v from ids where ids.k = i.k $f$;
insert into auth.users(id, email) select v, v || '@test.invalid' from ids where k in ('ua','ub','uold');
insert into core.companies(id, name, is_test) values (pg_temp.i('ca'), 'Альфа 040c', true);
insert into core.projects(id, company_id, name) values (pg_temp.i('pa'), pg_temp.i('ca'), 'Объект 040c');
insert into core.company_members(company_id, user_id) values (pg_temp.i('ca'), pg_temp.i('ua')), (pg_temp.i('ca'), pg_temp.i('ub'));
insert into core.user_profiles(user_id, full_name) values (pg_temp.i('ua'), 'Петров П.П.'), (pg_temp.i('ub'), 'Петров П.П.');
-- рейтинги двух Петровых: у А — на объекте с именем «Петров-А П.П.» (уже переименован раньше), у Б — «Петров П.П.»
insert into quality.rbi_engineer_ratings(id, project_code, core_company_id, engineer_name, pi, auth_user_id) values
  ('ra', pg_temp.i('pa')::text, pg_temp.i('ca'), 'Петров-А П.П.', 10, pg_temp.i('ua')),
  ('rb', pg_temp.i('pa')::text, pg_temp.i('ca'), 'Петров П.П.', 20, pg_temp.i('ub'));
-- профиль А на объекте и профиль Б (однофамилец) на том же объекте
insert into quality.rbi_engineer_profiles(id, inspector_id, project_code, core_company_id, engineer_name, inspector_name, auth_user_id, profile_data) values
  (gen_random_uuid(), 'a-key', pg_temp.i('pa')::text, pg_temp.i('ca'), 'Петров-А П.П.', 'Петров-А П.П.', pg_temp.i('ua'), '{}'),
  (pg_temp.i('pb'), 'b-key', pg_temp.i('pa')::text, pg_temp.i('ca'), 'Петров П.П.', 'Петров П.П.', pg_temp.i('ub'), '{"gameLogs":[{"id":"b"}]}');

do $$
declare res text := ''; ca uuid := pg_temp.i('ca');
begin
  -- 1. А переименовывают: старое имя «Петров П.П.» (его синоним) → «Петров-Альфа П.П.»; рейтинг Б с таким же именем — не трогать
  perform core.staff_rename_quality(ca, pg_temp.i('ua'), array['петров п.п.', 'петров-а п.п.'], 'Петров-Альфа П.П.');
  if (select engineer_name from quality.rbi_engineer_ratings where id = 'rb') <> 'Петров П.П.' then res := res || 'FAIL рейтинг однофамильца Б не переименован' || E'\n'; end if;
  if (select engineer_name from quality.rbi_engineer_ratings where id = 'ra') <> 'Петров-Альфа П.П.' then res := res || 'FAIL рейтинг А переименован' || E'\n'; end if;

  -- 2. Привязка старого профиля РБИ к Б: у профиля А подпись совпадает с ФИО Б («Петров П.П.») — 032d считала его дублем
  --    и удаляла; теперь дубль — только профиль той же учётки
  delete from quality.rbi_engineer_profiles where id = pg_temp.i('pb');   -- у Б своего профиля ещё нет — привяжется старый
  update quality.rbi_engineer_profiles set engineer_name = 'Петров П.П.', inspector_name = 'Петров П.П.' where core_company_id = ca and auth_user_id = pg_temp.i('ua');
  insert into quality.rbi_engineer_profiles(id, inspector_id, project_code, core_company_id, engineer_name, inspector_name, auth_user_id, profile_data)
    values (pg_temp.i('pold'), 'old-key', pg_temp.i('pa')::text, ca, 'Петров Старый', 'Петров Старый', pg_temp.i('uold'), '{"gameLogs":[{"id":"old"}]}');
  insert into quality.rbi_transfer_people(core_company_id, old_profile_id, email, user_id) values (ca, pg_temp.i('pold'), 'x@test.invalid', pg_temp.i('ub'));
  begin
    perform * from quality.rbi_transfer_attach_profiles(ca);
  exception when unique_violation then null;   -- имя Б на объекте занято профилем А — подпись не меняется (проверяем только, что А не удалён)
  end;
  if not exists (select 1 from quality.rbi_engineer_profiles where core_company_id = ca and auth_user_id = pg_temp.i('ua')) then
    res := res || 'FAIL профиль однофамильца А не удалён привязкой' || E'\n'; end if;
  raise exception 'P2-0035b 040c (однофамильцы)%FAIL всего: %', E'\n' || res, (length(res) - length(replace(res, 'FAIL', ''))) / 4 using errcode = 'P0001';
end $$;
