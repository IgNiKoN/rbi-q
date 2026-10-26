-- P2-0043 (ТД №241, №242): старые бакеты Storage РБИ закрыты от доступа без входа. Опись — ai-dev/reports/P2-0043/inventory-server.md:
-- все файлы старых бакетов скопированы в quality-<бакет>/<компания>/… (P2-0027, P2-0036), ссылок из данных quality на них нет.
-- Файлы и бакеты не удаляются; правила Качества quality_files_* и функции quality.storage_* не трогаются.
-- Что было — в p2_backup.p2_0043_* (для отката 042_close_rbi_storage_down.sql).
--  1. Старые бакеты (все, кроме quality-*) — public = false: файл больше не отдаётся по /object/public/… в обход правил.
--  2. Правила storage.objects, кроме quality_files_*, удалены (старые правила РБИ: «для всех», anon, переходные, админ РБИ).
--  3. ТД №242: SELECT authenticated на таблицы public, выданный 041 ради правил Storage, снят, если их больше не читает
--     ни одно правило вне public.
begin;
-- выражения правил сохраняются с полными именами (uid → auth.uid и т.д.), чтобы откат не зависел от search_path
set local search_path = pg_catalog;
do $$
begin
  if to_regclass('p2_backup.p2_0043_policies') is not null then
    raise exception '042: уже применена (есть p2_backup.p2_0043_policies)' using errcode = 'P0001';
  end if;
  if to_regclass('p2_backup.p2_0042_grants') is null then
    raise exception '042: сначала 041_close_public_anon (нет p2_backup.p2_0042_grants)' using errcode = 'P0001';
  end if;
end $$;

create table p2_backup.p2_0043_buckets (id text not null, public boolean not null);
create table p2_backup.p2_0043_policies (
  tbl text not null, name text not null, permissive text not null, roles text[] not null,
  cmd text not null, qual text, with_check text
);
create table p2_backup.p2_0043_grants (obj text not null, grantee text not null, privilege text not null);
revoke all on all tables in schema p2_backup from public, anon, authenticated;

-- 1. Старые бакеты — закрытые
insert into p2_backup.p2_0043_buckets(id, public)
select id, public from storage.buckets where id not like 'quality-%' and public;
update storage.buckets b set public = false from p2_backup.p2_0043_buckets x where b.id = x.id;

-- 2. Правила Storage, кроме Качества
insert into p2_backup.p2_0043_policies(tbl, name, permissive, roles, cmd, qual, with_check)
select tablename, policyname, permissive, roles::text[], cmd, qual, with_check
  from pg_catalog.pg_policies
 where schemaname = 'storage' and policyname not like 'quality\_files\_%';

do $$
declare r record;
begin
  for r in select tbl, name from p2_backup.p2_0043_policies loop
    execute format('drop policy %I on storage.%I', r.name, r.tbl);
  end loop;
end $$;

-- 3. ТД №242: права, выданные 041 (added), которые больше не нужны правилам других схем
-- obj в копиях 041 — regclass текстом при обычном search_path (без схемы для public): дописываем схему
insert into p2_backup.p2_0043_grants(obj, grantee, privilege)
select q.obj, g.grantee, g.privilege
  from p2_backup.p2_0042_grants g
  cross join lateral (select case when g.obj like '%.%' then g.obj else 'public.' || g.obj end as obj) q
 where g.kind = 'table' and g.added
   and has_table_privilege(g.grantee, q.obj::regclass, g.privilege)
   and not exists (
     select 1 from pg_depend d
       join pg_policy pol on d.classid = 'pg_policy'::regclass and d.objid = pol.oid
       join pg_class pt on pt.oid = pol.polrelid join pg_namespace pn on pn.oid = pt.relnamespace
      where d.refclassid = 'pg_class'::regclass and d.refobjid = q.obj::regclass and pn.nspname <> 'public');

do $$
declare r record;
begin
  for r in select obj, grantee, privilege from p2_backup.p2_0043_grants loop
    execute format('revoke %s on table %s from %I', r.privilege, r.obj, r.grantee);
  end loop;
end $$;

-- Сторожа
do $$
declare n int;
begin
  select count(*) into n from storage.buckets where id not like 'quality-%' and public;
  if n > 0 then raise exception '042: открытых старых бакетов: %', n using errcode = 'P0001'; end if;
  select count(*) into n from pg_catalog.pg_policies where schemaname = 'storage' and policyname not like 'quality\_files\_%';
  if n > 0 then raise exception '042: в Storage остались правила не Качества: %', n using errcode = 'P0001'; end if;
  select count(*) into n from pg_catalog.pg_policies where schemaname = 'storage' and policyname like 'quality\_files\_%';
  if n <> 8 then raise exception '042: правил Качества % (ждали 8)', n using errcode = 'P0001'; end if;
end $$;
commit;
