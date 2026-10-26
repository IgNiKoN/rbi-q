-- P2-0035b: сквозная проверка записей Качества после 040a–040d (как пишет приложение, от имени инженера стройконтроля):
-- проверка, эталон, совещание, TWI-карта, задача — сохраняются; профиль и рейтинг — старым ключом (приложение до выкладки)
-- и новым (по учётке) — без ошибок и без второго профиля. Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N».
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

do $$
declare res text := ''; ca uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); ue uuid := gen_random_uuid(); p text; e text; n int;
begin
  p := pa::text;
  insert into auth.users(id, email) values (ue, ue || '@test.invalid');
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 040', true);
  insert into core.projects(id, company_id, name) values (pa, ca, 'Объект 040');
  insert into core.company_modules(company_id, module, enabled) select ca, m, true from unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_members(company_id, user_id) values (ca, ue);
  insert into core.user_profiles(user_id, full_name) values (ue, 'Инженер И.И.');
  insert into core.role_assignments(company_id, user_id, role_id, project_id)
    values (ca, ue, (select id from core.company_roles where company_id = ca and template_code = 'qc_engineer'), null);

  perform pg_temp.as_user(ue, ca);
  -- записи модулей (как upsert приложения: onConflict core_company_id,id)
  e := pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, engineer_name, inspector_name) values ('i1', %L, 'Инженер И.И.', 'Инженер И.И.')
                            on conflict (core_company_id, id) do update set engineer_name = excluded.engineer_name$q$, p));
  if e <> 'OK' then res := res || 'FAIL проверка сохраняется: ' || e || E'\n'; end if;
  e := pg_temp.err(format($q$insert into quality.shared_etalons(id, project_code) values ('et1', %L) on conflict (core_company_id, id) do update set project_code = excluded.project_code$q$, p));
  if e <> 'OK' then res := res || 'FAIL акт эталона сохраняется: ' || e || E'\n'; end if;
  e := pg_temp.err(format($q$insert into quality.project_meetings(id, project_code, engineer_name) values ('m1', %L, 'Инженер И.И.') on conflict (core_company_id, id) do update set engineer_name = excluded.engineer_name$q$, p));
  if e <> 'OK' then res := res || 'FAIL совещание сохраняется: ' || e || E'\n'; end if;
  e := pg_temp.err(format($q$insert into quality.shared_twi_cards(id, project_code) values ('twi1', %L) on conflict (core_company_id, id) do update set project_code = excluded.project_code$q$, p));
  if e <> 'OK' then res := res || 'FAIL TWI-карта сохраняется: ' || e || E'\n'; end if;
  e := pg_temp.err(format($q$insert into quality.rbi_tasks(id, project_code, engineer_name, inspector_name) values ('t1', %L, 'Инженер И.И.', 'Инженер И.И.') on conflict (core_company_id, id) do update set engineer_name = excluded.engineer_name$q$, p));
  if e <> 'OK' then res := res || 'FAIL задача сохраняется: ' || e || E'\n'; end if;
  -- повторная отправка тех же записей (обновление) — без ошибок
  e := pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, engineer_name) values ('i1', %L, 'Инженер И.И.') on conflict (core_company_id, id) do update set engineer_name = excluded.engineer_name$q$, p));
  if e <> 'OK' then res := res || 'FAIL проверка — повторная отправка: ' || e || E'\n'; end if;
  -- профиль: старое приложение (ключ «объект_ФИО»), затем новое (по учётке) — одна строка
  e := pg_temp.err(format($q$insert into quality.rbi_engineer_profiles(inspector_id, project_code, engineer_name, inspector_name, auth_user_id, profile_data)
                            values (%L, %L, 'Инженер И.И.', 'Инженер И.И.', %L, '{"gameLogs":[1]}') on conflict (core_company_id, inspector_id) do update set profile_data = excluded.profile_data$q$, p || '_Инженер_И.И.', p, ue));
  if e <> 'OK' then res := res || 'FAIL профиль — старое приложение: ' || e || E'\n'; end if;
  e := pg_temp.err(format($q$insert into quality.rbi_engineer_profiles(inspector_id, project_code, engineer_name, inspector_name, auth_user_id, profile_data)
                            values (%L, %L, 'Инженер И.И.', 'Инженер И.И.', %L, '{"gameLogs":[1,2]}') on conflict (core_company_id, auth_user_id) do update set profile_data = excluded.profile_data$q$, p || '_Инженер_И.И.', p, ue));
  if e <> 'OK' then res := res || 'FAIL профиль — новое приложение: ' || e || E'\n'; end if;
  -- рейтинг: старый ключ и новый
  e := pg_temp.err(format($q$insert into quality.rbi_engineer_ratings(id, project_code, engineer_name, pi, is_deleted) values (%L, %L, 'Инженер И.И.', 5, false)
                            on conflict (core_company_id, project_code, engineer_name) do update set pi = excluded.pi$q$, p || '_Инженер_И.И.', p));
  if e <> 'OK' then res := res || 'FAIL рейтинг — старое приложение: ' || e || E'\n'; end if;
  e := pg_temp.err(format($q$insert into quality.rbi_engineer_ratings(id, project_code, engineer_name, pi, is_deleted) values (%L, %L, 'Инженер И.И.', 7, false)
                            on conflict (core_company_id, auth_user_id) do update set pi = excluded.pi$q$, p || '_Инженер_И.И.', p));
  if e <> 'OK' then res := res || 'FAIL рейтинг — новое приложение: ' || e || E'\n'; end if;
  perform pg_temp.as_user(null, null);

  select count(*) into n from quality.rbi_engineer_profiles where core_company_id = ca and auth_user_id = ue;
  if n <> 1 then res := res || 'FAIL один профиль: ' || n || E'\n'; end if;
  if (select jsonb_array_length(profile_data->'gameLogs') from quality.rbi_engineer_profiles where core_company_id = ca and auth_user_id = ue) <> 2 then res := res || 'FAIL очки обновились' || E'\n'; end if;
  if (select pi from quality.rbi_engineer_ratings where core_company_id = ca and auth_user_id = ue) <> 7 then res := res || 'FAIL рейтинг обновился' || E'\n'; end if;
  if (select core_created_by from quality.rbi_inspections where core_company_id = ca and id = 'i1') is distinct from ue then res := res || 'FAIL автор проверки — инженер' || E'\n'; end if;
  if (select assigned_to_auth_user_id from quality.rbi_tasks where core_company_id = ca and id = 't1') is distinct from ue then res := res || 'FAIL задача — кому: инженер' || E'\n'; end if;
  raise exception 'P2-0035b: записи Качества после 040a–040d%FAIL всего: %', E'\n' || res, (length(res) - length(replace(res, 'FAIL', ''))) / 4 using errcode = 'P0001';
end $$;
