-- P2-0035b этап 5 (040d, ТД №189 п. 1): компания Б добавляет почту, учётку на которую создала компания А → новый временный
-- пароль Б, старый пароль не действует, сеансы закрыты, учётка личная (А не сбрасывает пароль); своя учётка человека — без смены.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 040d_foreign_email_up.sql (PGlite — модель 032_auth_model).
begin;
create function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  if u is null then execute 'reset role'; else execute 'set local role authenticated'; end if;
end $f$;
create function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;

do $$
declare res text := ''; ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); uadm uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid();
  uself uuid := gen_random_uuid(); r record; v_user uuid; v_hash text; e text; ra uuid; rb uuid;
begin
  insert into auth.users(id, email, email_confirmed_at) select u, u || '@test.invalid', now() from unnest(array[uadm, ubadm, uself]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 040d', true), (cb, 'Бета 040d', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (cb, ubadm);
  select id into ra from core.company_roles where company_id = ca and template_code = 'company_admin';
  select id into rb from core.company_roles where company_id = cb and template_code = 'company_admin';
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values (ca, uadm, ra, null), (cb, ubadm, rb, null);

  -- 1. А заводит учётку на «чужую» почту — знает временный пароль
  perform pg_temp.as_user(uadm);
  select * into r from public.pf_company_add_member(ca, 'ivanov@beta040d.test', 'Иванов И.И.', ra);
  perform pg_temp.as_user(null);
  v_user := r.user_id;
  if not r.created or r.temp_password is null then res := res || 'FAIL А создала учётку с временным паролем' || E'\n'; end if;
  select encrypted_password into v_hash from auth.users where id = v_user;
  insert into auth.sessions(id, user_id) values (gen_random_uuid(), v_user);   -- А вошла под этой учёткой

  -- 2. Б добавляет ту же почту — новый временный пароль, старый не действует, сеансы закрыты, учётка личная
  perform pg_temp.as_user(ubadm);
  select * into r from public.pf_company_add_member(cb, 'ivanov@beta040d.test', 'Иванов И.И.', rb);
  perform pg_temp.as_user(null);
  if r.created then res := res || 'FAIL учётка не новая (created = false)' || E'\n'; end if;
  if r.temp_password is null then res := res || 'FAIL Б получила новый временный пароль' || E'\n'; end if;
  if (select encrypted_password from auth.users where id = v_user) = v_hash then res := res || 'FAIL старый пароль не действует' || E'\n'; end if;
  if exists (select 1 from auth.sessions where user_id = v_user) then res := res || 'FAIL сеансы закрыты' || E'\n'; end if;
  if (select managed_company_id from core.user_profiles where user_id = v_user) is not null then res := res || 'FAIL учётка личная' || E'\n'; end if;
  if not (select must_change_password from core.user_profiles where user_id = v_user) then res := res || 'FAIL при входе — сменить пароль' || E'\n'; end if;
  if not exists (select 1 from core.audit_log a where a.company_id = ca and a.action = 'ACCOUNT_RELEASED' and a.record_id::text = v_user::text) then
    res := res || 'FAIL журнал компании А: ACCOUNT_RELEASED' || E'\n'; end if;

  -- 3. А больше не сбрасывает пароль этой учётке
  perform pg_temp.as_user(uadm);
  e := pg_temp.err(format('select public.pf_company_reset_password(%L, %L)', ca, v_user));
  perform pg_temp.as_user(null);
  if e = 'OK' then res := res || 'FAIL А не сбрасывает пароль после ухода учётки' || E'\n'; end if;

  -- 4. Своя учётка человека (не создана компанией) — Б добавляет, пароль не трогается
  select encrypted_password into v_hash from auth.users where id = uself;
  perform pg_temp.as_user(ubadm);
  select * into r from public.pf_company_add_member(cb, uself || '@test.invalid', 'Сам Себе', rb);
  perform pg_temp.as_user(null);
  if r.temp_password is not null or (select encrypted_password from auth.users where id = uself) <> v_hash then
    res := res || 'FAIL своя учётка — пароль прежний' || E'\n'; end if;

  raise exception 'P2-0035b 040d (чужая почта)%FAIL всего: %', E'\n' || res, (length(res) - length(replace(res, 'FAIL', ''))) / 4 using errcode = 'P0001';
end $$;
