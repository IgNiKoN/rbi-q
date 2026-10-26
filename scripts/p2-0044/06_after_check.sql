-- P2-0044 этап 4: после 043 (ТОЛЬКО ЧТЕНИЕ)
select 'defects_v2' t, count(*) filter (where coalesce("contractorId",'')<>'') with_contractor, count(core_counterparty_id) bound from quality.construction_defects_v2
union all select 'acceptance_v2', count(*) filter (where coalesce("contractorId",'')<>''), count(core_counterparty_id) from quality.construction_acceptance_v2
union all select 'guards', (select count(*) from pg_trigger where tgname = 'zz_contractor_defect_guard')::bigint, (select count(*) from pg_policies where schemaname='quality' and tablename like 'construction_%_v2' and qual like '%row_visible_id%')::bigint
union all select 'app_errors_1h', (select count(*) from quality.rbi_error_logs where created_at > now() - interval '1 hour'), null;
