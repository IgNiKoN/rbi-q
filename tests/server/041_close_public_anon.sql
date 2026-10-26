-- P2-0042: после 041_close_public_anon_up.sql — схема public без входа закрыта, вход (pf_*) и данные на месте.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: PGlite — модель + 041_close_public_anon.seed.pglite.sql + 041 up.
begin;
create function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate; end $f$;

do $$
declare res text := ''; fails int := 0; u uuid := gen_random_uuid(); t text; e text; n int;
begin
  -- 1. Без входа: чтение старых таблиц — отказ
  perform pg_temp.as_user(null);
  foreach t in array array['location_nodes', 'contracts', 'contractors', 'construction_floors_v2', 'construction_units_v2',
                           'construction_defects_v2', 'construction_acceptance_v2', 'rbi_company_settings', 'allowed_projects',
                           'shared_report_snapshots', 'rbi_engineer_profiles', 'rbi_inspections', 'rbi_tasks'] loop
    e := pg_temp.err(format('select 1 from public.%I limit 1', t));
    if e <> '42501' then fails := fails + 1; res := res || format('FAIL anon читает public.%s (%s); ', t, e); end if;
  end loop;
  e := pg_temp.err($q$insert into storage.objects(bucket_id, name) values ('inspection-photos', 'P041/anon.jpg')$q$);
  if e = 'OK' then fails := fails + 1; res := res || 'FAIL anon загружает файл в старый бакет; '; end if;
  -- 2. Без входа: запись и последовательность — отказ
  e := pg_temp.err($q$insert into public.rbi_sync_queue(project_code, engineer_name, action_type, payload) values ('x', 'x', 'x', '{}')$q$);
  if e <> '42501' then fails := fails + 1; res := res || 'FAIL anon пишет rbi_sync_queue (' || e || '); '; end if;
  e := pg_temp.err($q$select nextval('public.plan_fact_audit_id_seq')$q$);
  if e <> '42501' then fails := fails + 1; res := res || 'FAIL anon — последовательность (' || e || '); '; end if;
  -- 3. Без входа: старые функции — отказ
  e := pg_temp.err($q$select * from public.get_public_report_by_token('tok-041')$q$);
  if e <> '42501' then fails := fails + 1; res := res || 'FAIL anon — get_public_report_by_token (' || e || '); '; end if;
  e := pg_temp.err($q$select public.rbi_current_role()$q$);
  if e <> '42501' then fails := fails + 1; res := res || 'FAIL anon — rbi_current_role (' || e || '); '; end if;
  -- 4. С входом: старые таблицы — тоже отказ (потребителей нет); вход pf_* и старые функции — как было
  perform pg_temp.as_user(u);
  e := pg_temp.err('select 1 from public.location_nodes limit 1');
  if e <> '42501' then fails := fails + 1; res := res || 'FAIL authenticated читает public.location_nodes (' || e || '); '; end if;
  e := pg_temp.err('select public.pf_my_context()');
  if e <> 'OK' then fails := fails + 1; res := res || 'FAIL authenticated — pf_my_context (' || e || '); '; end if;
  e := pg_temp.err('select * from public.pf_my_projects()');
  if e <> 'OK' then fails := fails + 1; res := res || 'FAIL authenticated — pf_my_projects (' || e || '); '; end if;
  e := pg_temp.err('select public.rbi_current_role()');
  if e <> 'OK' then fails := fails + 1; res := res || 'FAIL authenticated — rbi_current_role (' || e || '); '; end if;
  -- Storage: старые правила загрузки читают public.rbi_engineer_profiles — загрузка вошедшим работает
  e := pg_temp.err($q$insert into storage.objects(bucket_id, name) values ('inspection-photos', 'P041/photo.jpg')$q$);
  if e <> 'OK' then fails := fails + 1; res := res || 'FAIL authenticated не загружает файл в Storage (' || e || '); '; end if;
  e := pg_temp.err($q$update storage.objects set metadata = '{}' where name = 'P041/photo.jpg'$q$);
  if e <> 'OK' then fails := fails + 1; res := res || 'FAIL authenticated не правит файл в Storage (' || e || '); '; end if;
  e := pg_temp.err('select 1 from p2_backup.p2_0042_grants limit 1');
  if e <> '42501' then fails := fails + 1; res := res || 'FAIL authenticated читает p2_backup (' || e || '); '; end if;
  reset role;

  -- 5. Правил «для всех» не осталось; правило ссылок на отчёты (не true) — на месте
  select count(*) into n from pg_policies where schemaname = 'public' and roles && array['anon', 'public']::name[]
     and (qual = 'true' or with_check = 'true');
  if n <> 0 then fails := fails + 1; res := res || format('FAIL правил «для всех»: %s; ', n); end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'temp report snapshots public read by token') then
    fails := fails + 1; res := res || 'FAIL удалено правило не «для всех»; ';
  end if;
  -- 6. Новая таблица в public (владелец postgres) не получает прав anon
  create table public.p2_0042_probe(id int);
  if has_table_privilege('anon', 'public.p2_0042_probe', 'SELECT') then fails := fails + 1; res := res || 'FAIL новая таблица — anon по умолчанию; '; end if;
  create function public.p2_0042_probe_fn() returns int language sql as 'select 1';
  if exists (select 1 from aclexplode((select proacl from pg_proc where oid = 'public.p2_0042_probe_fn()'::regprocedure)) a
              where a.grantee = 'anon'::regrole) then
    fails := fails + 1; res := res || 'FAIL новая функция — anon по умолчанию; ';
  end if;
  set local role supabase_admin;
  create table public.p2_0042_probe_sa(id int);
  reset role;
  if has_table_privilege('anon', 'public.p2_0042_probe_sa', 'SELECT') then fails := fails + 1; res := res || 'FAIL новая таблица supabase_admin — anon по умолчанию; '; end if;
  -- 7. Данные на месте
  select count(*) into n from public.location_nodes where id = 'ln-041';
  if n <> 1 then fails := fails + 1; res := res || 'FAIL данные location_nodes; '; end if;
  select count(*) into n from public.shared_report_snapshots where id = 'rs-041';
  if n <> 1 then fails := fails + 1; res := res || 'FAIL данные shared_report_snapshots; '; end if;
  -- 8. Копии для отката заполнены
  select count(*) into n from p2_backup.p2_0042_policies;
  if n <> 10 then fails := fails + 1; res := res || format('FAIL копий правил %s (ждали 10); ', n); end if;
  if not exists (select 1 from p2_backup.p2_0042_grants where kind = 'function' and obj = 'get_public_report_by_token(text)' and grantee = 'anon') then
    fails := fails + 1; res := res || 'FAIL нет копии права anon на get_public_report_by_token; ';
  end if;
  raise exception 'FAIL всего: % %', fails, res using errcode = 'P0001';
end $$;
rollback;
