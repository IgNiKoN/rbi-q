-- P2-0028 этап 1: сотрудники компании — учётка функцией (032). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
-- Запуск: после 032_company_staff_up.sql (PGlite — после модели 032_auth_model.pglite.sql). Почты — только @test.invalid.
-- Пароль проверяется как в GoTrue: encrypted_password = crypt(пароль, encrypted_password).
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then 'OK ' || l else 'FAIL ' || l end || E'\n' $f$;
create or replace function pg_temp.pw_ok(u uuid, pw text) returns boolean language sql as $f$
  select encrypted_password = extensions.crypt(pw, encrypted_password) from auth.users where id = u $f$;

do $$
declare
  uplat uuid := gen_random_uuid(); uadm uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); pa uuid := gen_random_uuid();
  r_eng uuid; r_adm uuid; r_bpto uuid;
  unew uuid; pw text; pw2 text; created boolean; s text; n int; b boolean; j jsonb; res text := '';
  e_new text := 'p2-0028-new-' || substr(md5(random()::text), 1, 8) || '@test.invalid';
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uplat, uadm, ufor, ubadm]) u;
  update auth.users set email_confirmed_at = now() where id in (uplat, uadm, ufor, ubadm);   -- 032d: добавляется только подтверждённая
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 032', true), (cb, 'Бета 032', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, ufor), (cb, ubadm);
  insert into core.projects(id, company_id, name) values (pa, ca, 'Объект А 032');
  select id into r_adm from core.company_roles where company_id = ca and template_code = 'company_admin';
  select id into r_eng from core.company_roles where company_id = ca and template_code = 'foreman';
  select id into r_bpto from core.company_roles where company_id = cb and template_code = 'pto';
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, uadm, r_adm, null), (ca, ufor, r_eng, pa),
    (cb, ubadm, (select id from core.company_roles where company_id = cb and template_code = 'company_admin'), null);
  insert into core.platform_admins(user_id) values (uplat);

  -- 1. Права: прораб, чужой админ, anon — отказ
  perform pg_temp.as_user(ufor);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_add_member(%L, %L, %L, %L)', ca, e_new, 'Прораб Добавил', r_eng)) like '42501%', 'прораб: добавить — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_list_company_members(%L)', ca)) like '42501%', 'прораб: список — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_reset_password(%L, %L)', ca, uadm)) like '42501%', 'прораб: сброс — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_disable_member(%L, %L)', ca, uadm)) like '42501%', 'прораб: отключить — отказ');
  res := res || pg_temp.t(pg_temp.err('select * from core.user_profiles') like '42501%', 'клиент: таблица профилей закрыта');
  perform pg_temp.as_user(ubadm);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_add_member(%L, %L, %L, %L)', ca, e_new, 'Чужой Админ', r_eng)) like '42501%', 'админ другой компании: добавить — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_add_member(%L, %L, %L, %L)', cb, e_new, 'Чужая Роль', r_eng)) like '22023%', 'роль другой компании — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_reset_password(%L, %L)', ca, ufor)) like '42501%', 'админ другой компании: сброс — отказ');
  reset role;
  perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon';
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_add_member(%L, %L, %L, %L)', ca, e_new, 'Аноним', r_eng)) like '42501%', 'anon: добавить — отказ');
  res := res || pg_temp.t(pg_temp.err('select public.pf_password_changed()') like '42501%', 'anon: pf_password_changed — отказ');
  res := res || pg_temp.t(pg_temp.err('select public.pf_my_profile()') like '42501%', 'anon: pf_my_profile — отказ');
  reset role;

  -- 2. Формат почты и ФИО
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_add_member(%L, %L, %L, %L)', ca, 'не почта', 'Иванов И.И.', r_eng)) like '22023%', 'почта без @ — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_add_member(%L, %L, %L, %L)', ca, 'x@rbi-quality.local', 'Иванов И.И.', r_eng)) like '22023%', 'служебная почта PIN — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_add_member(%L, %L, %L, %L)', ca, e_new, ' 1 ', r_eng)) like '22023%', 'ФИО без букв — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_add_member(%L, %L, %L, %L)', ca, e_new, repeat('я', 121), r_eng)) like '22023%', 'ФИО длиннее 120 — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_add_member(%L, %L, %L, %L)', ca, e_new, 'Иванов', null)) like '22023%', 'без роли — отказ');

  -- 3. Добавить нового: учётка, участник, роль на объект, временный пароль один раз, флаг
  select a.user_id, a.temp_password, a.created into unew, pw, created
    from public.pf_company_add_member(ca, upper(e_new), '  Новиков   Н.Н. ', r_eng, pa) a;
  reset role;
  res := res || pg_temp.t(created and unew is not null, 'новая учётка создана');
  res := res || pg_temp.t(length(pw) = 14 and pw ~ '^[A-HJ-NP-Za-km-np-z2-9]+$', 'временный пароль: 14 знаков без похожих');
  res := res || pg_temp.t((select email from auth.users where id = unew) = e_new, 'почта сохранена в нижнем регистре');
  res := res || pg_temp.t(pg_temp.pw_ok(unew, pw), 'вход временным паролем: хэш совпадает');
  res := res || pg_temp.t((select email_confirmed_at is not null and aud = 'authenticated' and role = 'authenticated'
                           and raw_app_meta_data ->> 'provider' = 'email' from auth.users where id = unew), 'учётка подтверждена, aud/role');
  res := res || pg_temp.t((select count(*) from auth.identities where user_id = unew and provider = 'email'
                           and identity_data ->> 'email' = e_new) = 1, 'identity email');
  res := res || pg_temp.t((select full_name = 'Новиков Н.Н.' and must_change_password and managed_company_id = ca
                           and temp_password_hash = (select encrypted_password from auth.users where id = unew)
                           from core.user_profiles where user_id = unew), 'профиль: ФИО (пробелы убраны), флаг, учётка компании');
  res := res || pg_temp.t(exists (select 1 from core.company_members where company_id = ca and user_id = unew and disabled_at is null), 'участник компании');
  res := res || pg_temp.t(exists (select 1 from core.role_assignments where company_id = ca and user_id = unew and role_id = r_eng
                                  and project_id = pa and revoked_at is null), 'роль на объект назначена');
  res := res || pg_temp.t(exists (select 1 from core.audit_log where company_id = ca and record_id = unew and action = 'MEMBER_ADD'
                                  and actor = uadm and new_data ->> 'full_name' = 'Новиков Н.Н.'), 'журнал: MEMBER_ADD');
  res := res || pg_temp.t(not exists (select 1 from core.audit_log where strpos(coalesce(old_data::text, '') || coalesce(new_data::text, ''), pw) > 0)
                          and not exists (select 1 from core.user_profiles p where strpos(p::text, pw) > 0)
                          and not exists (select 1 from auth.users u where strpos(u::text, pw) > 0)
                          and not exists (select 1 from auth.identities i where strpos(i::text, pw) > 0), 'пароль открыто нигде не сохранён');
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_add_member(%L, %L, %L, %L)', ca, e_new, 'Повтор', r_eng)) like '22023%', 'повтор почты — отказ');

  -- 4. Список сотрудников: ФИО, флаг, учётка компании
  select count(*) into n from public.pf_list_company_members(ca) l
   where l.user_id = unew and l.full_name = 'Новиков Н.Н.' and l.must_change_password and l.managed and l.disabled_at is null and l.role_id = r_eng;
  res := res || pg_temp.t(n = 1, 'список: новый с ФИО, флагом, ролью');

  -- 5. Кто я / смена пароля
  perform pg_temp.as_user(unew);
  j := public.pf_my_profile();
  res := res || pg_temp.t(j ->> 'email' = e_new and j ->> 'full_name' = 'Новиков Н.Н.' and (j ->> 'must_change_password')::boolean, 'pf_my_profile: почта, ФИО, флаг');
  res := res || pg_temp.t(pg_temp.err('select public.pf_password_changed()') like '22023%', 'пароль не сменён — флаг не снять');
  reset role;
  update auth.users set encrypted_password = extensions.crypt('Своя-Пароль-032', extensions.gen_salt('bf')) where id = unew;   -- так делает GoTrue (PUT /user)
  perform pg_temp.as_user(unew);
  perform public.pf_password_changed();
  reset role;
  res := res || pg_temp.t((select not must_change_password and temp_password_hash is null from core.user_profiles where user_id = unew), 'после смены пароля флаг снят');
  res := res || pg_temp.t(exists (select 1 from core.audit_log where company_id = ca and record_id = unew and action = 'PASSWORD_CHANGED' and actor = unew), 'журнал: PASSWORD_CHANGED');
  perform pg_temp.as_user(unew);
  perform public.pf_password_changed();   -- повтор без флага — без ошибки
  reset role;

  -- 6. Сбросить пароль: старый не работает, новый работает, флаг снова, сеансы закрыты
  insert into auth.sessions(id, user_id) values (gen_random_uuid(), unew);
  insert into auth.refresh_tokens(user_id, token) values (unew::text, 'tok-032');
  perform pg_temp.as_user(uadm);
  pw2 := public.pf_company_reset_password(ca, unew);
  reset role;
  res := res || pg_temp.t(pw2 is not null and pw2 <> pw, 'сброс: новый временный пароль');
  res := res || pg_temp.t(not pg_temp.pw_ok(unew, 'Своя-Пароль-032') and pg_temp.pw_ok(unew, pw2), 'сброс: старый пароль не подходит, новый — да');
  res := res || pg_temp.t((select must_change_password from core.user_profiles where user_id = unew), 'сброс: флаг «сменить пароль» снова');
  res := res || pg_temp.t((select count(*) from auth.sessions where user_id = unew) = 0
                          and (select count(*) from auth.refresh_tokens where user_id = unew::text) = 0, 'сброс: сеансы закрыты');
  res := res || pg_temp.t(exists (select 1 from core.audit_log where company_id = ca and record_id = unew and action = 'PASSWORD_RESET' and actor = uadm), 'журнал: PASSWORD_RESET');
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_reset_password(%L, %L)', ca, uadm)) like '42501%', 'сброс себе — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_reset_password(%L, %L)', ca, ubadm)) like '42501%', 'сброс не участнику — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_reset_password(%L, %L)', ca, ufor)) like '42501%', 'сброс учётке, созданной не компанией — отказ');

  -- 7. Существующая учётка (другой компании): участник + роль, пароль не трогается, сбросить нельзя
  select a.temp_password, a.created into pw, created
    from public.pf_company_add_member(ca, ubadm || '@test.invalid', 'Бетов Б.Б.', r_eng, null) a;
  res := res || pg_temp.t(not created and pw is null, 'существующая почта: без новой учётки и пароля');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_reset_password(%L, %L)', ca, ubadm)) like '42501%', 'чужая учётка: сброс — отказ');
  perform public.pf_company_disable_member(ca, ubadm);
  reset role;
  res := res || pg_temp.t((select banned_until is null from auth.users where id = ubadm)
                          and exists (select 1 from core.company_members where company_id = cb and user_id = ubadm and disabled_at is null)
                          and exists (select 1 from core.role_assignments where company_id = cb and user_id = ubadm and revoked_at is null),
                          'чужая учётка: отключена только здесь, вход и другая компания не тронуты');

  -- 8. Администратор платформы: из компании не сбрасывается и не отключается
  perform pg_temp.as_user(uadm);
  perform public.pf_company_add_member(ca, uplat || '@test.invalid', 'Платформа П.П.', r_eng, null);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_reset_password(%L, %L)', ca, uplat)) like '42501%', 'админ платформы: сброс — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_disable_member(%L, %L)', ca, uplat)) like '42501%', 'админ платформы: отключить — отказ');

  -- 9. Отключить доступ: назначения отозваны, вход закрыт, сеансы закрыты, записи на месте
  reset role;
  insert into planfact.works(company_id, project_id, name, created_by) values (ca, pa, 'Работа нового 032', unew);
  insert into auth.sessions(id, user_id) values (gen_random_uuid(), unew);
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_disable_member(%L, %L)', ca, uadm)) like '42501%', 'отключить себя — отказ');
  perform public.pf_company_disable_member(ca, unew);
  reset role;
  res := res || pg_temp.t(not exists (select 1 from core.role_assignments where company_id = ca and user_id = unew and revoked_at is null), 'отключён: назначения отозваны');
  res := res || pg_temp.t((select disabled_at is not null and disabled_by = uadm from core.company_members where company_id = ca and user_id = unew), 'отключён: отметка');
  res := res || pg_temp.t((select banned_until > now() + interval '50 years' from auth.users where id = unew), 'отключён: вход закрыт');
  res := res || pg_temp.t((select count(*) from auth.sessions where user_id = unew) = 0, 'отключён: сеансы закрыты');
  res := res || pg_temp.t(exists (select 1 from planfact.works where created_by = unew), 'отключён: записи на месте');
  res := res || pg_temp.t(exists (select 1 from core.audit_log where company_id = ca and record_id = unew and action = 'MEMBER_DISABLE'
                                  and (new_data ->> 'login_blocked')::boolean), 'журнал: MEMBER_DISABLE');
  perform pg_temp.as_user(unew);
  res := res || pg_temp.t(not planfact.is_company_member(ca) and not planfact.has_permission(pa, 'planfact.works.view'), 'отключён: не участник, прав нет');
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_reset_password(%L, %L)', ca, unew)) like '22023%', 'отключённому сброс — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_add_member(%L, %L, %L, %L)', ca, e_new, 'Снова', r_eng)) like '22023%', 'отключённого добавить снова — отказ');
  select count(*) into n from public.pf_list_company_members(ca) l where l.user_id = unew and l.disabled_at is not null and l.assignment_id is null;
  res := res || pg_temp.t(n = 1, 'список: отключённый виден без ролей');
  perform public.pf_company_disable_member(ca, unew);   -- повтор — без ошибки

  -- 9а. 032d (ревью): H1 — человек в другой компании; M3 — роль отключённому; M4 — неподтверждённая почта
  reset role;
  e_new := 'p2-0028-unconf-' || substr(md5(random()::text), 1, 6) || '@test.invalid';
  insert into auth.users(id, email) values (gen_random_uuid(), e_new);
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_add_member(%L, %L, %L, %L)',
                          ca, e_new, 'Неподтверждённый Н.Н.', r_eng)) like '22023%', 'M4: неподтверждённую почту добавить нельзя');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_assign_role(%L, %L)', unew, r_eng)) like '42501%', 'M3: отключённому роль не назначается');
  select a.user_id, a.temp_password into unew, pw from public.pf_company_add_member(ca, 'p2-0028-h1-' || substr(md5(random()::text), 1, 6) || '@test.invalid',
                                                                                   'Общий О.О.', r_eng, null) a;
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_reset_password(%L, %L)', ca, unew)) = 'OK', 'H1: пока только в своей компании — сброс можно');
  reset role;
  select email into e_new from auth.users where id = unew;
  perform pg_temp.as_user(ubadm);
  perform public.pf_company_add_member(cb, e_new, 'Общий О.О.', r_bpto, null);
  perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_reset_password(%L, %L)', ca, unew)) like '42501%', 'H1: человек в другой компании — сброс нельзя');
  select count(*) into n from public.pf_list_company_members(ca) l where l.user_id = unew and not l.managed;
  res := res || pg_temp.t(n = 1, 'H1: в списке — уже не «учётка компании»');
  perform public.pf_company_disable_member(ca, unew);
  reset role;
  res := res || pg_temp.t((select banned_until is null from auth.users where id = unew), 'H1: отключение в одной компании вход не закрывает');

  -- 10. Последнего администратора отключить нельзя (админ платформы пробует)
  perform pg_temp.as_user(uplat);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_company_disable_member(%L, %L)', ca, uadm)) like '42501%', 'последний админ компании — отказ');
  -- админ платформы добавляет сотрудника в любую компанию
  select a.created into created from public.pf_company_add_member(cb, 'p2-0028-plat-' || substr(md5(random()::text), 1, 8) || '@test.invalid',
                                                                      'Платформенный Д.Д.', r_bpto, null) a;
  res := res || pg_temp.t(created, 'админ платформы: добавить в другую компанию');
  reset role;

  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res, 'FAIL', ''))) / 4;
end $$;
