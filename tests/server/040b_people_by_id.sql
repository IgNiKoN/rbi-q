-- P2-0035b этап 2 (040b): профиль и рейтинг — по номеру учётки (ставит сервер, подмена не работает), один на человека
-- в компании; переименование не плодит профили; задача «кому» — по однозначному ФИО, однофамильцы — пусто.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 040b_people_by_id_up.sql (PGlite — суперпользователь).
begin;
create function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'reset role'; else execute 'set local role authenticated'; end if;
end $f$;
create function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
create temp table ids(k text primary key, v uuid);
insert into ids select k, gen_random_uuid() from unnest(array['ca','pa','piv','piv2','uiv','up1','up2','uadm']) k;
create function pg_temp.i(k text) returns uuid language sql as $f$ select v from ids where ids.k = i.k $f$;
grant select on ids to authenticated;
insert into auth.users(id, email) select v, v || '@test.invalid' from ids where k like 'u%';
insert into core.companies(id, name, is_test) values (pg_temp.i('ca'), 'Альфа 040b', true);
insert into core.projects(id, company_id, name) values (pg_temp.i('pa'), pg_temp.i('ca'), 'Объект 040b');
insert into core.company_modules(company_id, module, enabled) select pg_temp.i('ca'), m, true from unnest(array['quality', 'construction']) m
  on conflict (company_id, module) do update set enabled = true;
insert into core.company_members(company_id, user_id) select pg_temp.i('ca'), pg_temp.i(k) from unnest(array['uiv','up1','up2','uadm']) k;
insert into core.user_profiles(user_id, full_name) values (pg_temp.i('uiv'), 'Иванов И.И.'), (pg_temp.i('up1'), 'Петров П.П.'),
  (pg_temp.i('up2'), 'Петров П.П.'), (pg_temp.i('uadm'), 'Админ А.А.');
insert into core.role_assignments(company_id, user_id, role_id, project_id)
  select pg_temp.i('ca'), pg_temp.i(k), (select id from core.company_roles where company_id = pg_temp.i('ca') and template_code = 'company_admin'), null
    from unnest(array['uiv','up1','up2','uadm']) k;

do $$
declare res text := ''; pa text := pg_temp.i('pa')::text; ca uuid := pg_temp.i('ca'); n int; v uuid; e text;
begin
  -- 1. Иванов пишет свой профиль, подсовывая чужой номер — сервер ставит его собственный
  perform pg_temp.as_user(pg_temp.i('uiv'), ca);
  insert into quality.rbi_engineer_profiles(id, inspector_id, project_code, engineer_name, inspector_name, auth_user_id, profile_data)
    values (pg_temp.i('piv'), pa || '_Иванов_И.И.', pa, 'Иванов И.И.', 'Иванов И.И.', pg_temp.i('up1'), '{"gameLogs":[{"id":1},{"id":2}]}');
  perform pg_temp.as_user(null, null);
  if (select auth_user_id from quality.rbi_engineer_profiles where id = pg_temp.i('piv')) is distinct from pg_temp.i('uiv') then res := res || 'FAIL профиль — номер из токена, не из запроса' || E'\n'; end if;

  -- 2. Переименовали (новое ФИО) — приложение пишет профиль по номеру: та же строка, ключ и имя обновились, очки на месте
  perform pg_temp.as_user(pg_temp.i('uiv'), ca);
  insert into quality.rbi_engineer_profiles(id, inspector_id, project_code, engineer_name, inspector_name, profile_data)
    values (pg_temp.i('piv2'), pa || '_Иванов-Строй_И.И.', pa, 'Иванов-Строй И.И.', 'Иванов-Строй И.И.', '{"gameLogs":[{"id":1},{"id":2},{"id":3}]}')
    on conflict (core_company_id, auth_user_id) do update set inspector_id = excluded.inspector_id, engineer_name = excluded.engineer_name,
      inspector_name = excluded.inspector_name, profile_data = excluded.profile_data;
  perform pg_temp.as_user(null, null);
  select count(*) into n from quality.rbi_engineer_profiles where core_company_id = ca and auth_user_id = pg_temp.i('uiv');
  if n <> 1 then res := res || 'FAIL переименование — один профиль, не два: ' || n || E'\n'; end if;
  if (select jsonb_array_length(profile_data->'gameLogs') from quality.rbi_engineer_profiles where id = pg_temp.i('piv')) <> 3 then res := res || 'FAIL очки обновились в той же строке' || E'\n'; end if;

  -- 3. Админ меняет чужой профиль — номер владельца не меняется
  perform pg_temp.as_user(pg_temp.i('uadm'), ca);
  update quality.rbi_engineer_profiles set role = 'engineer', auth_user_id = pg_temp.i('uadm') where id = pg_temp.i('piv');
  perform pg_temp.as_user(null, null);
  if (select auth_user_id from quality.rbi_engineer_profiles where id = pg_temp.i('piv')) is distinct from pg_temp.i('uiv') then res := res || 'FAIL админ не переписывает номер владельца' || E'\n'; end if;

  -- 4. Рейтинг: номер из токена; второй рейтинг той же учётки — запрещён (один на человека)
  perform pg_temp.as_user(pg_temp.i('uiv'), ca);
  insert into quality.rbi_engineer_ratings(id, project_code, engineer_name, pi) values ('r-iv', pa, 'Иванов И.И.', 100);
  e := pg_temp.err(format('insert into quality.rbi_engineer_ratings(id, project_code, engineer_name, pi) values (%L, %L, %L, 5)', 'r-iv2', pa, 'Иванов дубль'));
  perform pg_temp.as_user(null, null);
  if (select auth_user_id from quality.rbi_engineer_ratings where id = 'r-iv') is distinct from pg_temp.i('uiv') then res := res || 'FAIL рейтинг — номер из токена' || E'\n'; end if;
  if e not like '23505%' then res := res || 'FAIL второй рейтинг учётки — отказ 23505: ' || e || E'\n'; end if;

  -- 5. Однофамильцы Петровы — у каждого свой профиль и рейтинг
  perform pg_temp.as_user(pg_temp.i('up1'), ca);
  insert into quality.rbi_engineer_ratings(id, project_code, engineer_name, pi) values ('r-p1', pa, 'Петров П.П.', 10);
  perform pg_temp.as_user(pg_temp.i('up2'), ca);
  e := pg_temp.err(format('insert into quality.rbi_engineer_ratings(id, project_code, engineer_name, pi) values (%L, %L, %L, 20) on conflict (core_company_id, auth_user_id) do update set pi = excluded.pi', 'r-p2', pa, 'Петров П.П. '));
  perform pg_temp.as_user(null, null);
  if (select pi from quality.rbi_engineer_ratings where id = 'r-p1') <> 10 then res := res || 'FAIL рейтинг первого Петрова не тронут вторым' || E'\n'; end if;

  -- 6. Задачи: «кому» — по однозначному ФИО; однофамилец — пусто; смена исполнителя по ФИО — новый номер
  perform pg_temp.as_user(pg_temp.i('uadm'), ca);
  insert into quality.rbi_tasks(id, project_code, engineer_name, inspector_name) values
    ('t1', pa, 'Иванов И.И.', 'Иванов И.И.'), ('t2', pa, 'Петров П.П.', 'Петров П.П.'), ('t3', pa, 'Админ А.А.', 'Админ А.А.');
  update quality.rbi_tasks set engineer_name = 'Админ А.А.' where id = 't1';
  perform pg_temp.as_user(null, null);
  if (select assigned_to_auth_user_id from quality.rbi_tasks where id = 't3') is distinct from pg_temp.i('uadm') then res := res || 'FAIL задача → по ФИО' || E'\n'; end if;
  if (select assigned_to_auth_user_id from quality.rbi_tasks where id = 't2') is not null then res := res || 'FAIL задача однофамильцу — пусто' || E'\n'; end if;
  if (select assigned_to_auth_user_id from quality.rbi_tasks where id = 't1') is distinct from pg_temp.i('uadm') then res := res || 'FAIL смена исполнителя по ФИО → новый номер' || E'\n'; end if;

  -- 7. Клиенту функция поиска по ФИО закрыта
  perform pg_temp.as_user(pg_temp.i('uiv'), ca);
  e := pg_temp.err(format('select quality.person_by_name(%L, %L)', ca, 'Иванов И.И.'));
  perform pg_temp.as_user(null, null);
  if e not like '42501%' then res := res || 'FAIL person_by_name закрыта от клиента: ' || e || E'\n'; end if;

  raise exception 'P2-0035b 040b (люди по номеру)%FAIL всего: %', E'\n' || res, (length(res) - length(replace(res, 'FAIL', ''))) / 4 using errcode = 'P0001';
end $$;
