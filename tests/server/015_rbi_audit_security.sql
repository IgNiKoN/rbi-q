-- P2-0014: расширенный аудит безопасности сервера (ТОЛЬКО ЧТЕНИЕ). Почты/имена/ключи не выводятся — только счётчики и имена объектов.
-- Одна строка на раздел (удобно читать в SQL Editor целиком).
select min(ord) as ord, section, count(*) as n, string_agg(object || ' = ' || coalesce(details, ''), E'\n' order by object) as items from (
select 1 as ord, 'profile_trigger' as section, t.tgname::text as object,
       pg_get_triggerdef(t.oid) || ' → ' || p.proname as details
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
where c.relname = 'rbi_engineer_profiles' and not t.tgisinternal
union all
-- профили: по статусу/роли и «ничьи» (можно «забрать»)
select 2, 'profiles', coalesce(cloud_status, '∅') || ' / ' || coalesce(role, '∅'),
       'count=' || count(*) || ' no_auth_user=' || count(*) filter (where auth_user_id is null)
from public.rbi_engineer_profiles group by cloud_status, role
union all
-- таблицы/представления без RLS, доступные anon (в любой схеме)
select 3, 'anon_no_rls', n.nspname || '.' || c.relname,
       'kind=' || c.relkind::text || ' rls=' || c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'v', 'm', 'p') and n.nspname not in ('pg_catalog', 'information_schema')
  and has_schema_privilege('anon', n.oid, 'USAGE')
  and has_table_privilege('anon', c.oid, 'SELECT')
  and (c.relkind <> 'r' or not c.relrowsecurity)
union all
-- функции SECURITY DEFINER, которые может вызвать anon (обходят RLS)
select 4, 'anon_secdef_fn', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'returns ' || pg_get_function_result(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef and n.nspname in ('public', 'planfact', 'storage')
  and has_function_privilege('anon', p.oid, 'EXECUTE')
union all
-- точные числа строк в открытых таблицах Стройконтроля v2
select 5, 'open_rows', x.t, 'rows=' || (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.' || x.t, false, true, '')))[1]::text
from unnest(array['construction_acceptance_v2', 'construction_buildings_v2', 'construction_defects_v2', 'construction_floors_v2',
                  'construction_objects_v2', 'construction_units_v2', 'contractor_aliases_v2', 'contractors', 'contracts',
                  'issue_items', 'issues', 'location_node_aliases', 'location_nodes', 'sk_records_v2',
                  'rbi_company_settings', 'allowed_projects', 'rbi_sync_queue']) as x(t)
union all
-- Realtime: какие таблицы транслируются
select 6, 'realtime', pt.schemaname || '.' || pt.tablename, pt.pubname
from pg_publication_tables pt
union all
-- Auth: признаки автоподтверждения и самостоятельной регистрации (счётчики)
select 7, 'auth_users', 'all', 'total=' || count(*)
       || ' unconfirmed=' || count(*) filter (where email_confirmed_at is null)
       || ' created_30d=' || count(*) filter (where created_at > now() - interval '30 days')
       || ' pin_created_30d=' || count(*) filter (where created_at > now() - interval '30 days' and email like '%@rbi-quality.local')
       || ' never_signed_in=' || count(*) filter (where last_sign_in_at is null)
from auth.users
union all
-- самозаведённые профили: строка профиля, созданная той же учёткой (если есть created_by/auth поля)
select 8, 'profile_columns', 'rbi_engineer_profiles', string_agg(column_name || ':' || data_type || coalesce(' default ' || left(column_default, 30), ''), ', ' order by ordinal_position)
from information_schema.columns where table_schema = 'public' and table_name = 'rbi_engineer_profiles'
union all
-- права PostgREST-ролей на схемы
select 9, 'schema_usage', n.nspname,
       'anon=' || has_schema_privilege('anon', n.oid, 'USAGE') || ' authenticated=' || has_schema_privilege('authenticated', n.oid, 'USAGE')
from pg_namespace n where n.nspname not like 'pg\_%' and n.nspname <> 'information_schema'
) a group by section order by 1;
