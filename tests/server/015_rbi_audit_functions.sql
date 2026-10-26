-- P2-0014 этап 1 (дополнение): тексты функций-признаков Качества и триггеры профилей (ТОЛЬКО ЧТЕНИЕ).
select 'function' as kind, p.proname::text as name, pg_get_functiondef(p.oid) as body
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('rbi_current_profile', 'rbi_current_role', 'rbi_current_project_code', 'rbi_is_approved',
                    'rbi_is_blocked', 'rbi_guard_profile_update', 'rbi_can_write_storage', 'auth_role')
union all
select 'trigger', t.tgname::text, c.relname || ': ' || pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'rbi_engineer_profiles' and not t.tgisinternal
union all
select 'rows', c.relname::text, coalesce(c.reltuples::bigint, 0)::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('construction_acceptance_v2', 'construction_buildings_v2', 'construction_defects_v2', 'construction_floors_v2',
                    'construction_objects_v2', 'construction_units_v2', 'contractor_aliases_v2', 'contractors', 'contracts',
                    'issue_items', 'issues', 'location_node_aliases', 'location_nodes', 'sk_records_v2')
order by 1, 2;
