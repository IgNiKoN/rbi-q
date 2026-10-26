-- P2-0042 (ТД №95): старые таблицы РБИ в схеме public закрыты от чтения без входа.
-- Опись сервера — ai-dev/reports/P2-0042/inventory-server.md. Данные и таблицы не удаляются; схемы quality/core/planfact,
-- функции pf_* и вход не трогаются. Что было — в p2_backup.p2_0042_* (для отката 041_close_public_anon_down.sql).
--  1. Таблицы, представления, последовательности public: все права anon, authenticated и PUBLIC сняты
--     (новое приложение работает со схемами quality/core/planfact и функциями pf_*; потребителей public нет).
--  2. Правила RLS «для всех» (using(true) / with check(true) для anon/public) удалены.
--  3. Функции public, кроме pf_*: выполнение снято у anon и PUBLIC; у authenticated — как было.
--  4. Права по умолчанию (схема public; владельцы postgres и supabase_admin — на сервере объекты создаёт supabase_admin):
--     новые объекты больше не получают права anon.
begin;
do $$
begin
  if to_regclass('p2_backup.p2_0042_grants') is not null then
    raise exception '041: уже применена (есть p2_backup.p2_0042_grants)' using errcode = 'P0001';
  end if;
end $$;

create schema if not exists p2_backup;
revoke all on schema p2_backup from public, anon, authenticated;

create table p2_backup.p2_0042_grants (
  kind text not null,          -- table | sequence | function
  obj text not null,           -- regclass / regprocedure текстом
  grantee text not null,       -- anon | authenticated | public
  privilege text not null,
  grantable boolean not null,
  added boolean not null default false  -- true: право выдано этой миграцией (снять при откате)
);
create table p2_backup.p2_0042_policies (
  tbl text not null, name text not null, permissive text not null, roles text[] not null,
  cmd text not null, qual text, with_check text
);
create table p2_backup.p2_0042_defaults (
  owner text not null, objtype "char" not null, grantee text not null, privilege text not null
);
revoke all on all tables in schema p2_backup from public, anon, authenticated;

-- 1. Таблицы и последовательности (кроме объектов расширений)
insert into p2_backup.p2_0042_grants(kind, obj, grantee, privilege, grantable)
select case when c.relkind = 'S' then 'sequence' else 'table' end, c.oid::regclass::text,
       case when a.grantee = 0 then 'public' else a.grantee::regrole::text end, a.privilege_type, a.is_grantable
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner))) a
 where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')
   and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole)
   and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e');

do $$
declare r record;
begin
  for r in select distinct kind, obj from p2_backup.p2_0042_grants where kind in ('table', 'sequence') loop
    execute format('revoke all on %s %s from anon, authenticated, public', r.kind, r.obj);
  end loop;
end $$;

-- 2. Правила «для всех»
insert into p2_backup.p2_0042_policies(tbl, name, permissive, roles, cmd, qual, with_check)
select tablename, policyname, permissive, roles::text[], cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and roles && array['anon', 'public']::name[]
   and (qual = 'true' or with_check = 'true');

do $$
declare r record;
begin
  for r in select tbl, name from p2_backup.p2_0042_policies loop
    execute format('drop policy %I on public.%I', r.name, r.tbl);
  end loop;
end $$;

-- 3. Функции public, кроме pf_* (и кроме функций расширений)
insert into p2_backup.p2_0042_grants(kind, obj, grantee, privilege, grantable)
select 'function', p.oid::regprocedure::text,
       case when a.grantee = 0 then 'public' else a.grantee::regrole::text end, a.privilege_type, a.is_grantable
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
 where n.nspname = 'public' and p.proname not like 'pf\_%' and p.prokind in ('f', 'p')
   and a.grantee in (0, 'anon'::regrole)
   and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');

-- authenticated сохраняет выполнение, если имел его (в т.ч. через PUBLIC): выдаётся явно и помечается added
insert into p2_backup.p2_0042_grants(kind, obj, grantee, privilege, grantable, added)
select distinct 'function', g.obj, 'authenticated', 'EXECUTE', false, true
  from p2_backup.p2_0042_grants g
 where g.kind = 'function' and g.grantee = 'public'
   and not exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where p.oid = g.obj::regprocedure and a.grantee = 'authenticated'::regrole);

do $$
declare r record;
begin
  for r in select distinct obj from p2_backup.p2_0042_grants where kind = 'function' and not added loop
    execute format('revoke execute on function %s from anon, public', r.obj);
  end loop;
  for r in select obj from p2_backup.p2_0042_grants where kind = 'function' and added loop
    execute format('grant execute on function %s to authenticated', r.obj);
  end loop;
end $$;

-- 4. Права по умолчанию для новых объектов (все владельцы, у кого они есть: postgres, supabase_admin)
insert into p2_backup.p2_0042_defaults(owner, objtype, grantee, privilege)
select a.defaclrole::regrole::text, a.defaclobjtype, 'anon', x.privilege_type
  from pg_default_acl a join pg_namespace n on n.oid = a.defaclnamespace
  cross join lateral aclexplode(a.defaclacl) x
 where n.nspname = 'public' and x.grantee = 'anon'::regrole and a.defaclobjtype in ('r', 'S', 'f');

do $$
declare r record;
begin
  for r in select distinct owner, objtype from p2_backup.p2_0042_defaults loop
    execute format('alter default privileges for role %I in schema public revoke all on %s from anon', r.owner,
                   case r.objtype when 'r' then 'tables' when 'S' then 'sequences' else 'functions' end);
  end loop;
end $$;

-- Сторож: в public ни одна таблица/последовательность не доступна anon
do $$
declare n int;
begin
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
     and has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  if n > 0 then raise exception '041: у anon остались права на % таблиц public', n using errcode = 'P0001'; end if;
end $$;
commit;
