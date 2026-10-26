-- P2-0014: проверка сторожа создания профиля Качества (015). Всё внутри одной транзакции и ОТКАТЫВАЕТСЯ:
-- отчёт приходит как ERROR P0001 «… FAIL всего: N». Тестовые профили — только с метками p2-0014-*, проект TEST-P2; тестовые учётки auth.users @p2-0014.invalid — тоже откатываются.
-- PGlite: 015_rbi_model.pglite.sql → (015_rbi_guard_up.sql) → этот файл. До 015 ожидаются FAIL (дыра), после — FAIL 0.
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then 'OK ' || l else 'FAIL ' || l end || E'\n' $f$;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
end $f$;

do $$
declare
  res text := ''; r record; e text;
  mgr uuid := 'f0140000-0000-4000-8000-0000000000a1';
  eng uuid := 'f0140000-0000-4000-8000-0000000000e1';
  s1 uuid := 'f0140000-0000-4000-8000-000000000051';
  s2 uuid := 'f0140000-0000-4000-8000-000000000052';
  s3 uuid := 'f0140000-0000-4000-8000-000000000053';
begin
  -- тестовые учётки Auth (только внутри этой транзакции, откатываются)
  insert into auth.users (id, email, aud, role)
  select u, 'p2-0014-' || right(u::text, 2) || '@p2-0014.invalid', 'authenticated', 'authenticated'
  from unnest(array[mgr, eng, s1, s2, s3]) as u;
  -- свои руководитель и инженер TEST-P2 (служебной ролью, как одобряет администратор)
  insert into public.rbi_engineer_profiles (inspector_id, engineer_name, project_code, role, cloud_status, assigned_projects, auth_user_id, settings)
  values ('p2-0014-mgr', 'P2-0014 руководитель', 'TEST-P2', 'manager', 'approved', '{TEST-P2}', mgr, '{}'),
         ('p2-0014-eng', 'P2-0014 инженер', 'TEST-P2', 'engineer', 'approved', '{TEST-P2}', eng, '{"v":1}');
  res := res || pg_temp.t((select role = 'manager' and cloud_status = 'approved' from public.rbi_engineer_profiles where inspector_id = 'p2-0014-mgr'),
                          '0. служебная роль создаёт одобренного руководителя как есть');

  set local role authenticated;

  -- 1. посторонний вставляет себе «руководитель, одобрен» — должен стать гостем
  perform pg_temp.as_user(s1);
  insert into public.rbi_engineer_profiles (inspector_id, engineer_name, project_code, role, cloud_status, assigned_projects, assigned_contractor, contractor_name, auth_user_id)
  values ('p2-0014-s1', 'P2-0014 посторонний', 'TEST-P2', 'manager', 'approved', '{TEST-P2}', 'X', 'X', s1);
  select role, cloud_status, assigned_projects, assigned_contractor, contractor_name into r
    from public.rbi_engineer_profiles where inspector_id = 'p2-0014-s1';
  res := res || pg_temp.t(r.role = 'guest' and r.cloud_status = 'pending', '1. самоназначение «руководитель, одобрен» → гость / ожидает');
  res := res || pg_temp.t(r.assigned_projects = '{}' and r.assigned_contractor = '' and r.contractor_name = '', '1а. назначения сброшены');
  res := res || pg_temp.t(not public.rbi_can_manage_profiles('TEST-P2') and public.rbi_current_role() = 'guest' and not public.rbi_is_approved(),
                          '1б. посторонний не руководитель и не одобрен');

  -- 2. обычная заявка приложения (guest / pending) — без изменений
  perform pg_temp.as_user(s2);
  insert into public.rbi_engineer_profiles (inspector_id, engineer_name, project_code, role, cloud_status, assigned_projects, auth_user_id, settings)
  values ('p2-0014-s2', 'P2-0014 новичок', 'TEST-P2', 'guest', 'pending', '{}', s2, '{"createdFromApp":true}')
  on conflict (inspector_id) do update set settings = excluded.settings;
  res := res || pg_temp.t((select role = 'guest' and cloud_status = 'pending' and settings ->> 'createdFromApp' = 'true'
                           from public.rbi_engineer_profiles where inspector_id = 'p2-0014-s2'), '2. заявка приложения создаётся как раньше');

  -- 3. одобренный инженер повторно отправляет свой профиль (upsert приложения) — роль и статус не теряются
  perform pg_temp.as_user(eng);
  insert into public.rbi_engineer_profiles (inspector_id, engineer_name, project_code, role, cloud_status, assigned_projects, settings, updated_at, auth_user_id)
  values ('p2-0014-eng', 'P2-0014 инженер', 'TEST-P2', 'engineer', 'approved', '{TEST-P2}', '{"v":2}', now(), eng)
  on conflict (inspector_id) do update set role = excluded.role, cloud_status = excluded.cloud_status,
    assigned_projects = excluded.assigned_projects, settings = excluded.settings, updated_at = excluded.updated_at;
  select role, cloud_status, assigned_projects into r from public.rbi_engineer_profiles where inspector_id = 'p2-0014-eng';
  res := res || pg_temp.t(r.role = 'engineer' and r.cloud_status = 'approved' and r.assigned_projects = '{TEST-P2}',
                          '3. повторная отправка своего профиля инженером — роль и статус те же');

  -- 4. руководитель TEST-P2 заводит одобренного инженера своего проекта — как раньше
  perform pg_temp.as_user(mgr);
  insert into public.rbi_engineer_profiles (inspector_id, engineer_name, project_code, role, cloud_status, assigned_projects)
  values ('p2-0014-new', 'P2-0014 заведён руководителем', 'TEST-P2', 'engineer', 'approved', '{TEST-P2}');
  res := res || pg_temp.t((select role = 'engineer' and cloud_status = 'approved' from public.rbi_engineer_profiles where inspector_id = 'p2-0014-new'),
                          '4. руководитель проекта создаёт одобренного инженера своего проекта');

  -- 5. руководитель TEST-P2 не может создать профиль чужого проекта (прежняя политика)
  begin
    insert into public.rbi_engineer_profiles (inspector_id, engineer_name, project_code, role, cloud_status)
    values ('p2-0014-other', 'P2-0014 чужой', 'P2-0014-OTHER', 'manager', 'approved');
    e := 'вставлено';
  exception when others then e := sqlstate;
  end;
  res := res || pg_temp.t(e = '42501', '5. профиль чужого проекта — отказ (' || e || ')');

  -- 6. посторонний не может вставить профиль на чужой auth_user_id (прежняя политика)
  perform pg_temp.as_user(s3);
  begin
    insert into public.rbi_engineer_profiles (inspector_id, engineer_name, project_code, auth_user_id)
    values ('p2-0014-s3', 'P2-0014 подмена', 'TEST-P2', mgr);
    e := 'вставлено';
  exception when others then e := sqlstate;
  end;
  res := res || pg_temp.t(e in ('42501', '23505'), '6. профиль на чужую учётку — отказ (' || e || ')');

  -- 7. аноним ничего не создаёт
  perform pg_temp.as_user(null);
  set local role anon;
  begin
    insert into public.rbi_engineer_profiles (inspector_id, engineer_name, project_code, role, cloud_status)
    values ('p2-0014-anon', 'P2-0014 аноним', 'TEST-P2', 'manager', 'approved');
    e := 'вставлено';
  exception when others then e := sqlstate;
  end;
  res := res || pg_temp.t(e = '42501', '7. аноним — отказ (' || e || ')');

  reset role;
  raise exception '%FAIL всего: %', res, (length(res) - length(replace(res, 'FAIL ', ''))) / 5;
end $$;
