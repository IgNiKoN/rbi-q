-- P2-0043: откат 042_close_rbi_storage_up.sql — бакеты, правила Storage и права из p2_backup.p2_0043_*, затем копии удаляются.
-- Проверка на PGlite: tests/server/042_storage_fingerprint.sql и schema_fingerprint.pglite.sql до up и после down совпадают.
begin;
set local search_path = pg_catalog;
do $$
begin
  if to_regclass('p2_backup.p2_0043_policies') is null then
    raise exception '042 down: нет p2_backup.p2_0043_policies (042 не применена)' using errcode = 'P0001';
  end if;
end $$;

do $$
declare r record;
begin
  update storage.buckets b set public = x.public from p2_backup.p2_0043_buckets x where b.id = x.id;
  for r in select * from p2_backup.p2_0043_policies loop
    execute format('create policy %I on storage.%I as %s for %s to %s%s%s', r.name, r.tbl, r.permissive, r.cmd,
                   (select string_agg(case when x = 'public' then 'public' else quote_ident(x) end, ', ') from unnest(r.roles) x),
                   case when r.qual is not null then ' using (' || r.qual || ')' else '' end,
                   case when r.with_check is not null then ' with check (' || r.with_check || ')' else '' end);
  end loop;
  for r in select * from p2_backup.p2_0043_grants loop
    execute format('grant %s on table %s to %I', r.privilege, r.obj, r.grantee);
  end loop;
end $$;

drop table p2_backup.p2_0043_buckets;
drop table p2_backup.p2_0043_policies;
drop table p2_backup.p2_0043_grants;
commit;
