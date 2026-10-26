-- P2-0027 (ветка perf-debug). ТОЛЬКО ДЛЯ PGlite: объём одной пачки загрузки РБИ в компании RBI — 200 проверок, 2277 пунктов,
-- автор записан фамилией (как у перенесённых записей). После — perf/01_rls_cost.sql.
insert into quality.rbi_inspections(id, project_code, engineer_name, core_company_id)
select 'p' || lpad(g::text, 4, '0'), tp.core_project_id::text, 'Иванов А.И.', tp.core_company_id
  from generate_series(1, 200) g, quality.rbi_transfer_projects tp;
insert into quality.rbi_inspection_items(id, project_code, inspection_id, item_id, core_company_id)
select 'p' || lpad(g::text, 4, '0') || '_' || k, tp.core_project_id::text, 'p' || lpad(g::text, 4, '0'), k::text, tp.core_company_id
  from generate_series(1, 200) g, generate_series(1, 12) k, quality.rbi_transfer_projects tp
 where (g * 12 + k) % 200 <> 0 or k < 4
 limit 2277;
