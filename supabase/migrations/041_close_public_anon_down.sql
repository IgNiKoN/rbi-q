-- P2-0042: откат 041_close_public_anon_up.sql — права, правила «для всех» и права по умолчанию возвращаются из p2_backup.p2_0042_*,
-- затем копии удаляются. Проверка на PGlite: tests/server/041_public_acl_fingerprint.sql до up и после down совпадает.
begin;
do $$
begin
  if to_regclass('p2_backup.p2_0042_grants') is null then
    raise exception '041 down: нет p2_backup.p2_0042_grants (041 не применена)' using errcode = 'P0001';
  end if;
end $$;

do $$
declare r record;
begin
  -- права, выданные миграцией, — снять
  for r in select kind, obj, privilege from p2_backup.p2_0042_grants where added loop
    execute format('revoke %s on %s %s from authenticated', r.privilege, r.kind, r.obj);
  end loop;
  -- прежние права — вернуть
  for r in select kind, obj, grantee, privilege, grantable from p2_backup.p2_0042_grants where not added loop
    execute format('grant %s on %s %s to %s%s', r.privilege, r.kind, r.obj,
                   case when r.grantee = 'public' then 'public' else quote_ident(r.grantee) end,
                   case when r.grantable then ' with grant option' else '' end);
  end loop;
  for r in select * from p2_backup.p2_0042_policies loop
    execute format('create policy %I on public.%I as %s for %s to %s%s%s', r.name, r.tbl, r.permissive, r.cmd,
                   (select string_agg(case when x = 'public' then 'public' else quote_ident(x) end, ', ') from unnest(r.roles) x),
                   case when r.qual is not null then ' using (' || r.qual || ')' else '' end,
                   case when r.with_check is not null then ' with check (' || r.with_check || ')' else '' end);
  end loop;
  for r in select distinct owner, objtype from p2_backup.p2_0042_defaults loop
    execute format('alter default privileges for role %I in schema public grant %s on %s to anon', r.owner,
                   (select string_agg(privilege, ', ') from p2_backup.p2_0042_defaults d where d.owner = r.owner and d.objtype = r.objtype),
                   case r.objtype when 'r' then 'tables' when 'S' then 'sequences' else 'functions' end);
  end loop;
end $$;

drop table p2_backup.p2_0042_grants;
drop table p2_backup.p2_0042_policies;
drop table p2_backup.p2_0042_defaults;
commit;
