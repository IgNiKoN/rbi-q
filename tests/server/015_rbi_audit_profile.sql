-- P2-0014: точные правила профиля Качества для копии на PGlite (ТОЛЬКО ЧТЕНИЕ).
select 'policy' as kind, policyname::text as name,
       permissive || ' ' || cmd || ' ' || array_to_string(roles, ',') || E'\nUSING ' || coalesce(qual, '-') || E'\nCHECK ' || coalesce(with_check, '-') as body
from pg_policies where schemaname = 'public' and tablename = 'rbi_engineer_profiles'
union all
select 'function', p.proname::text, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('rbi_can_manage_profiles', 'rbi_can_view_profiles', 'set_updated_at')
union all
select 'index', indexname::text, indexdef from pg_indexes where schemaname = 'public' and tablename = 'rbi_engineer_profiles'
order by 1, 2;
