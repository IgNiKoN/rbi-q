-- P2-0043 этап 1: опись Storage РБИ (ТОЛЬКО ЧТЕНИЕ). Один набор строк: вид | объект | подробности.
with legacy as (
  select id from storage.buckets where id not like 'quality-%'
), b as (
  select 'bucket' kind, bk.id obj,
    'public=' || bk.public || ' files=' || (select count(*) from storage.objects o where o.bucket_id = bk.id)
    || ' mb=' || coalesce(round((select sum(coalesce((o.metadata ->> 'size')::bigint, 0)) from storage.objects o where o.bucket_id = bk.id) / 1048576.0, 1), 0)
    || case when bk.id not like 'quality-%' then
         ' not_copied=' || (select count(*) from storage.objects o where o.bucket_id = bk.id
           and not exists (select 1 from storage.objects q where q.bucket_id = 'quality-' || bk.id
                            and substr(q.name, strpos(q.name, '/') + 1) = o.name))
       else '' end info
  from storage.buckets bk
), p as (
  select 'policy', tablename || '.' || policyname,
    permissive || ' ' || cmd || ' to ' || array_to_string(roles, ',') || ' using(' || coalesce(qual, '-') || ') check(' || coalesce(with_check, '-') || ')'
  from pg_policies where schemaname = 'storage'
), refs as (
  select 'quality_refs', t.table_name, 'rows_with_old_url=' || x.n
  from information_schema.tables t
  cross join lateral (select (xpath('//n/text()', query_to_xml(format(
      'select count(*) n from quality.%I r where to_jsonb(r)::text ~ %L', t.table_name,
      '/object/(public|authenticated|sign)/(' || (select string_agg(id, '|') from legacy) || ')/'), false, true, '')))[1]::text::int n) x
  where t.table_schema = 'quality' and t.table_type = 'BASE TABLE' and x.n > 0
), deps as (
  select 'policy_dep_public', pol.polname, c.oid::regclass::text
  from pg_policy pol join pg_class pt on pt.oid = pol.polrelid join pg_namespace pn on pn.oid = pt.relnamespace
  join pg_depend d on d.classid = 'pg_policy'::regclass and d.objid = pol.oid and d.refclassid = 'pg_class'::regclass
  join pg_class c on c.oid = d.refobjid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and pn.nspname <> 'public'
)
select * from b union all select * from p union all select * from refs union all select * from deps
order by 1, 2;
