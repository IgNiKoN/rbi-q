-- P2-0042: отпечаток прав схемы public (ТОЛЬКО ЧТЕНИЕ) для проверки «откат 041 побайтно»: запуск до 041 и после up → down,
-- строки должны совпасть. Права — набор (получатель, право, передача) из ACL (пустой ACL = права по умолчанию), без «кто выдал».
select 'rel_acl' as k, md5(coalesce(string_agg(x, E'\n' order by x), '')) as v, count(*) as n from (
  select c.oid::regclass::text || '|' || a.grantee::text || '|' || a.privilege_type || '|' || a.is_grantable as x
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner))) a
   where s.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')) q
union all
select 'func_acl', md5(coalesce(string_agg(x, E'\n' order by x), '')), count(*) from (
  select p.oid::regprocedure::text || '|' || a.grantee::text || '|' || a.privilege_type || '|' || a.is_grantable as x
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where s.nspname = 'public') q
union all
select 'policies', md5(coalesce(string_agg(concat_ws('|', tablename, policyname, permissive, roles::text, cmd, qual, with_check), E'\n'
                                  order by tablename, policyname), '')), count(*)
  from pg_policies where schemaname = 'public'
union all
select 'default_acl', md5(coalesce(string_agg(x, E'\n' order by x), '')), count(*) from (
  select a.defaclrole::regrole::text || '|' || a.defaclobjtype::text || '|' || g.grantee::text || '|' || g.privilege_type as x
    from pg_default_acl a join pg_namespace s on s.oid = a.defaclnamespace
    cross join lateral aclexplode(a.defaclacl) g
   where s.nspname = 'public') q
union all
select 'p2_backup_tables', string_agg(c.relname, ',' order by c.relname), count(*)
  from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'p2_backup' and c.relname like 'p2\_0042\_%';
