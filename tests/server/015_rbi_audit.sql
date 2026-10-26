-- P2-0014 этап 1: аудит доступа к таблицам и файлам Качества (ТОЛЬКО ЧТЕНИЕ, ничего не меняет).
-- Почты и имена не выводятся — только счётчики по типам учёток.
-- Один набор строк: раздел | объект | подробности.
with pol as (
  select tablename,
         string_agg(policyname || ' [' || permissive || ' ' || cmd || ' ' || array_to_string(roles, ',') || '] '
                    || left(coalesce('USING ' || qual, '') || coalesce(' CHECK ' || with_check, ''), 160),
                    E' ‖ ' order by policyname) as p
  from pg_policies where schemaname = 'public' group by tablename
), gr as (
  select table_name,
         string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type) as g
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
  group by table_name
), u as (
  select case when email like '%@rbi-quality.local' then 'pin_technical'
              when email like '%@test.invalid' then 'p2_test'
              when email like '%@demo.invalid' then 'p2_demo'
              when email is null then 'no_email'
              else 'other_email' end as kind, id, raw_user_meta_data
  from auth.users
)
select 1 as ord, 'table' as section, c.relname::text as object,
       'rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity
       || ' | grants: ' || coalesce(gr.g, '-') || ' | policies: ' || coalesce(pol.p, '-') as details
from pg_class c join pg_namespace n on n.oid = c.relnamespace
left join pol on pol.tablename = c.relname
left join gr on gr.table_name = c.relname
where n.nspname = 'public' and c.relkind in ('r', 'p')
union all
select 2, 'bucket', b.id::text, 'public=' || b.public
       || ' objects=' || (select count(*) from storage.objects o where o.bucket_id = b.id)
from storage.buckets b
union all
select 3, 'storage_policy', policyname::text,
       '[' || permissive || ' ' || cmd || ' ' || array_to_string(roles, ',') || '] '
       || left(coalesce('USING ' || qual, '') || coalesce(' CHECK ' || with_check, ''), 200)
from pg_policies where schemaname = 'storage' and tablename = 'objects'
union all
select 4, 'users', kind, 'count=' || count(*)
       || ' with_meta_project_code=' || count(*) filter (where raw_user_meta_data ? 'project_code')
from u group by kind
union all
-- не-PIN учётки, связанные с профилем инженера Качества (= законно работают в старом Quality?)
select 5, 'users_in_quality_profiles', u.kind, 'count=' || count(distinct u.id)
from u join public.rbi_engineer_profiles p on p.auth_user_id = u.id
group by u.kind
union all
-- не-PIN учётки, оставившие записи в таблицах Качества (по полям-авторам, если есть)
select 6, 'author_columns', table_name::text, string_agg(column_name::text, ',')
from information_schema.columns
where table_schema = 'public' and column_name in ('auth_user_id', 'user_id', 'created_by', 'owner_id', 'author_id')
group by table_name
union all
select 7, 'helper_function', p.proname::text,
       'secdef=' || p.prosecdef || ' args=' || pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.proname like 'rbi\_%' or p.proname like '%role%')
order by 1, 3;
