-- P2-0042 этап 1: опись доступа anon/authenticated к объектам схемы public. ТОЛЬКО ЧТЕНИЕ.
-- Один набор строк: вид | объект | подробности. Запуск — SQL Editor сервера (или PGlite-модель).
with rel as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','v','m','p','f','S')
), t as (
  select 'table' as kind, relname as obj,
    'kind=' || relkind::text || ' rls=' || relrowsecurity
    || ' anon=' || concat_ws(',', case when has_table_privilege('anon', oid, 'SELECT') then 'S' end,
         case when has_table_privilege('anon', oid, 'INSERT') then 'I' end,
         case when has_table_privilege('anon', oid, 'UPDATE') then 'U' end,
         case when has_table_privilege('anon', oid, 'DELETE') then 'D' end)
    || ' auth=' || concat_ws(',', case when has_table_privilege('authenticated', oid, 'SELECT') then 'S' end,
         case when has_table_privilege('authenticated', oid, 'INSERT') then 'I' end,
         case when has_table_privilege('authenticated', oid, 'UPDATE') then 'U' end,
         case when has_table_privilege('authenticated', oid, 'DELETE') then 'D' end)
    || ' rows~' || coalesce((select reltuples::bigint from pg_class where oid = rel.oid), 0) as info
  from rel
  where relkind <> 'S' and (has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE'))
), s(kind, obj, info) as (
  select 'sequence', relname, 'anon_usage=' || has_sequence_privilege('anon', oid, 'USAGE,SELECT,UPDATE')
    || ' auth_usage=' || has_sequence_privilege('authenticated', oid, 'USAGE,SELECT,UPDATE')
  from rel where relkind = 'S'
    and (has_sequence_privilege('anon', oid, 'USAGE,SELECT,UPDATE') or has_sequence_privilege('authenticated', oid, 'USAGE,SELECT,UPDATE'))
), p(kind, obj, info) as (
  select 'policy', tablename || '.' || policyname,
    cmd || ' to ' || array_to_string(roles, ',') || ' using(' || coalesce(qual, '-') || ') check(' || coalesce(with_check, '-') || ')'
  from pg_policies where schemaname = 'public'
), f(kind, obj, info) as (
  select 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') || ' auth=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
    || ' secdef=' || p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f','p')
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
), d(kind, obj, info) as (
  select 'default_acl', pg_get_userbyid(defaclrole) || ' ' || defaclobjtype::text, defaclacl::text
  from pg_default_acl a join pg_namespace n on n.oid = a.defaclnamespace where n.nspname = 'public'
), sch(kind, obj, info) as (
  select 'schema', 'public', 'anon_usage=' || has_schema_privilege('anon', 'public', 'USAGE') || ' anon_create=' || has_schema_privilege('anon', 'public', 'CREATE')
)
-- функции pf_* только для authenticated — норма (вход и новое приложение), в сводку не выводятся
, allrows as (select * from t union all select * from s union all select * from p
  union all select * from f where not (obj like 'pf\_%' and info like 'anon=false%') union all select * from d union all select * from sch)
select kind, count(*) as n, string_agg(obj || ' ' || info, E' ;\n' order by obj) as items
from allrows group by kind order by kind;
