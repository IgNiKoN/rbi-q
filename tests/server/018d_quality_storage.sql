-- P2-0016 этап 5: файлы компаний (018d). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N». Запуск: после 018d.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', '{}', true);   -- Storage заголовка компании не передаёт: компания — из пути
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate; end $f$;
create or replace function pg_temp.cnt(q text) returns int language plpgsql as $f$
declare n int; begin execute q into n; return n; exception when others then return -1; end $f$;
create or replace function pg_temp.rows(q text) returns int language plpgsql as $f$
declare n int; begin execute q; get diagnostics n = row_count; return n; exception when others then return -1; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;

do $$
declare
  ua uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); ueco uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); urbi uuid := gen_random_uuid();
  b text; n int; s text; res text := ''; v_before text;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[ua, ufor, ueco, ub]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 018d', true), (cb, 'Бета 018d', true);
  insert into core.company_members(company_id, user_id) values (ca, ua), (ca, ufor), (ca, ueco), (cb, ub);
  insert into core.projects(id, company_id, name) values (pa, ca, 'Спутник');
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, ua,   (select id from core.company_roles where company_id = ca and template_code = 'company_admin'), null),
    (ca, ufor, (select id from core.company_roles where company_id = ca and template_code = 'foreman'), pa),
    (ca, ueco, (select id from core.company_roles where company_id = ca and template_code = 'economist'), null),
    (cb, ub,   (select id from core.company_roles where company_id = cb and template_code = 'company_admin'), null);

  select count(*) into n from storage.buckets where id like 'quality-%' and not public;
  res := res || pg_temp.t(n = 11, 'закрытых бакетов quality-*: ' || n || ' из 11');
  select count(*) into n from storage.buckets where id like 'quality-%' and public;
  res := res || pg_temp.t(n = 0, 'публичных бакетов quality-* нет');
  select count(*) into n from pg_policies where schemaname = 'storage' and policyname like 'quality\_%'
     and (qual not like '%bucket_id ~~ ''quality-%' and coalesce(with_check, '') not like '%bucket_id ~~ ''quality-%');
  res := res || pg_temp.t(n = 0, 'каждая политика quality_* ограничена бакетами quality-* (' || n || ')');
  select count(*) into n from pg_policies where schemaname = 'storage' and policyname like 'quality\_%' and not (roles = '{authenticated}');
  res := res || pg_temp.t(n = 0, 'политики quality_* — только для authenticated (' || n || ')');

  foreach b in array array['inspection-photos', 'reports', 'construction-defects', 'custom-assets', 'library-docs'] loop
    -- своя компания: запись и чтение
    perform pg_temp.as_user(ua);
    s := pg_temp.err(format('insert into storage.objects(bucket_id, name) values (%L, %L)', 'quality-' || b, ca || '/T018d/' || b || '.jpg'));
    res := res || pg_temp.t(s = 'OK', b || ': своя компания загружает (' || s || ')');
    n := pg_temp.cnt(format('select count(*) from storage.objects where bucket_id = %L and name like ''%s/T018d/%%''', 'quality-' || b, ca));
    res := res || pg_temp.t(n = 1, b || ': своя компания видит файл (' || n || ')');
    -- путь не своей компании / без компании — отказ
    s := pg_temp.err(format('insert into storage.objects(bucket_id, name) values (%L, %L)', 'quality-' || b, cb || '/T018d/x.jpg'));
    res := res || pg_temp.t(s <> 'OK', b || ': загрузка в папку чужой компании — отказ (' || s || ')');
    s := pg_temp.err(format('insert into storage.objects(bucket_id, name) values (%L, %L)', 'quality-' || b, 'hashed_assets/x.jpg'));
    res := res || pg_temp.t(s <> 'OK', b || ': путь без компании — отказ (' || s || ')');
    -- чужая компания
    perform pg_temp.as_user(ub);
    n := pg_temp.cnt(format('select count(*) from storage.objects where bucket_id = %L', 'quality-' || b));
    res := res || pg_temp.t(n = 0, b || ': чужая компания видит 0 (' || n || ')');
    n := pg_temp.rows(format('delete from storage.objects where bucket_id = %L', 'quality-' || b));
    res := res || pg_temp.t(n = 0, b || ': чужая компания не удаляет (' || n || ')');
    n := pg_temp.rows(format('update storage.objects set metadata = ''{}'' where bucket_id = %L', 'quality-' || b));
    res := res || pg_temp.t(n = 0, b || ': чужая компания не меняет (' || n || ')');
    -- без права модуля
    perform pg_temp.as_user(ueco);
    n := pg_temp.cnt(format('select count(*) from storage.objects where bucket_id = %L', 'quality-' || b));
    res := res || pg_temp.t(n = 0, b || ': без права модуля 0 (' || n || ')');
    -- anon
    perform pg_temp.as_user(null);
    n := pg_temp.cnt(format('select count(*) from storage.objects where bucket_id = %L', 'quality-' || b));
    res := res || pg_temp.t(n <= 0, b || ': anon — ничего (' || n || ')');
  end loop;

  -- прораб: Стройконтроль — пишет; Качество — только смотрит
  perform pg_temp.as_user(ufor);
  s := pg_temp.err(format('insert into storage.objects(bucket_id, name) values (''quality-construction-defects'', %L)', ca || '/T018d/f.jpg'));
  -- после 020 прораб — только просмотр
  res := res || pg_temp.t((s = 'OK') = not (to_regprocedure('quality.row_visible(uuid,uuid,text[],text,uuid,uuid,text,text)') is not null), 'прораб загружает фото замечания Стройконтроля (' || s || ')');
  s := pg_temp.err(format('insert into storage.objects(bucket_id, name) values (''quality-inspection-photos'', %L)', ca || '/T018d/f.jpg'));
  res := res || pg_temp.t(s <> 'OK', 'прораб не загружает фото проверки Качества (' || s || ')');
  n := pg_temp.cnt('select count(*) from storage.objects where bucket_id = ''quality-inspection-photos''');
  res := res || pg_temp.t(n = 1, 'прораб видит фото проверки (' || n || ')');

  -- руководитель РБИ (широкая политика rbi_admin_storage_access) — к файлам компаний доступа нет, к бакетам РБИ — как раньше
  reset role;
  insert into auth.users(id, email) values (urbi, urbi || '@test.invalid');
  insert into public.rbi_engineer_profiles(project_code, role, cloud_status, auth_user_id) values ('RBI-018D', 'manager', 'approved', urbi);
  perform pg_temp.as_user(urbi);
  n := pg_temp.cnt('select count(*) from storage.objects where bucket_id like ''quality-%''');
  res := res || pg_temp.t(n = 0, 'руководитель РБИ не видит файлы компаний (' || n || ')');
  s := pg_temp.err(format('insert into storage.objects(bucket_id, name) values (''quality-inspection-photos'', %L)', ca || '/T018d/rbi.jpg'));
  res := res || pg_temp.t(s <> 'OK', 'руководитель РБИ не загружает в папку компании (' || s || ')');
  n := pg_temp.rows('update storage.objects set metadata = ''{}'' where bucket_id like ''quality-%''');
  res := res || pg_temp.t(n = 0, 'руководитель РБИ не меняет файлы компаний (' || n || ')');
  n := pg_temp.rows('delete from storage.objects where bucket_id like ''quality-%''');
  res := res || pg_temp.t(n = 0, 'руководитель РБИ не удаляет файлы компаний (' || n || ')');
  s := pg_temp.err('insert into storage.objects(bucket_id, name) values (''library-docs'', ''RBI-018D/x.pdf'')');
  res := res || pg_temp.t(s = 'OK', 'руководитель РБИ работает с бакетом РБИ как раньше (' || s || ')');

  -- своя компания удаляет
  perform pg_temp.as_user(ua);
  n := pg_temp.rows('delete from storage.objects where bucket_id = ''quality-reports''');
  res := res || pg_temp.t(n = 1, 'своя компания удаляет файл (' || n || ')');

  -- модуль выключен
  reset role; update core.company_modules set enabled = false where company_id = ca and module = 'quality';
  perform pg_temp.as_user(ua);
  n := pg_temp.cnt('select count(*) from storage.objects where bucket_id = ''quality-inspection-photos''');
  res := res || pg_temp.t(n = 0, 'Качество выключено — фото не видно (' || n || ')');
  reset role;

  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res, 'FAIL', ''))) / 4;
end $$;
