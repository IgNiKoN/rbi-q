-- P2-0043: после 042_close_rbi_storage_up.sql — старые бакеты закрыты, правила Качества на месте, файлы целы, ТД №242 снят.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: PGlite — модель + 041 (seed, up) + 042_close_rbi_storage.seed.pglite.sql + 042 up.
-- Доступ Качества к бакетам quality-* — регрессия tests/server/018d_quality_storage.sql.
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
declare res text := ''; fails int := 0; u uuid := gen_random_uuid(); e text; n int; who text;
begin
  foreach who in array array['anon', 'authenticated'] loop
    perform pg_temp.as_user(case when who = 'anon' then null else u end);
    select count(*) into n from storage.objects where bucket_id not like 'quality-%';
    if n <> 0 then fails := fails + 1; res := res || format('FAIL %s видит %s файлов старых бакетов; ', who, n); end if;
    e := pg_temp.err($q$insert into storage.objects(bucket_id, name) values ('inspection-photos', 'RBI/new.jpg')$q$);
    if e = 'OK' then fails := fails + 1; res := res || format('FAIL %s загружает в inspection-photos; ', who); end if;
    e := pg_temp.err($q$insert into storage.objects(bucket_id, name) values ('reports', 'new.pdf')$q$);
    if e = 'OK' then fails := fails + 1; res := res || format('FAIL %s загружает в reports; ', who); end if;
    e := pg_temp.err($q$insert into storage.objects(bucket_id, name) values ('construction-plans', 'RBI/new.pdf')$q$);
    if e = 'OK' then fails := fails + 1; res := res || format('FAIL %s загружает в construction-plans; ', who); end if;
    e := pg_temp.err($q$delete from storage.objects where bucket_id = 'library-twi'$q$);
    reset role;
    select count(*) into n from storage.objects where bucket_id = 'library-twi';
    if n <> 1 then fails := fails + 1; res := res || format('FAIL %s удалил файл library-twi; ', who); end if;
  end loop;
  -- ТД №242: вошедший больше не читает public.rbi_engineer_profiles
  perform pg_temp.as_user(u);
  e := pg_temp.err('select 1 from public.rbi_engineer_profiles limit 1');
  if e <> '42501' then fails := fails + 1; res := res || 'FAIL authenticated читает rbi_engineer_profiles (' || e || '); '; end if;
  reset role;

  select count(*) into n from storage.buckets where id not like 'quality-%' and public;
  if n <> 0 then fails := fails + 1; res := res || format('FAIL открытых старых бакетов %s; ', n); end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and policyname like 'quality\_files\_%';
  if n <> 8 then fails := fails + 1; res := res || format('FAIL правил Качества %s; ', n); end if;
  select count(*) into n from storage.objects where bucket_id not like 'quality-%';
  if n <> 4 then fails := fails + 1; res := res || format('FAIL файлов старых бакетов %s (ждали 4); ', n); end if;
  select count(*) into n from p2_backup.p2_0043_policies;
  if n <> 30 then fails := fails + 1; res := res || format('FAIL копий правил %s (ждали 30); ', n); end if;
  select count(*) into n from p2_backup.p2_0043_buckets;
  if n <> 12 then fails := fails + 1; res := res || format('FAIL копий бакетов %s (ждали 12); ', n); end if;
  select count(*) into n from p2_backup.p2_0043_grants where obj = 'public.rbi_engineer_profiles';
  if n <> 1 then fails := fails + 1; res := res || 'FAIL нет копии права на rbi_engineer_profiles; '; end if;
  raise exception 'FAIL всего: % %', fails, res using errcode = 'P0001';
end $$;
rollback;
