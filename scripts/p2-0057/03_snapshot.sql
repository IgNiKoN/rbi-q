-- P2-0057 этап 4: снимок планов «до / после» переноса (ТОЛЬКО ЧТЕНИЕ). Запустить до 02_transfer.sql и после — сравнить строки:
-- module_* должны совпасть (ссылки в Качестве / СК не менялись), core_current после = числу перенесённых мест (+ что было).
select 'module_floors' as k, count(*) as n, md5(coalesce(string_agg(core_company_id || '|' || id || '|' || pdf_url, ',' order by core_company_id, id), '')) as v
  from quality.construction_floors_v2 where not is_deleted and coalesce(pdf_url, '') <> ''
union all
select 'module_units', count(*), md5(coalesce(string_agg(core_company_id || '|' || id || '|' || pdf_url, ',' order by core_company_id, id), ''))
  from quality.construction_units_v2 where not is_deleted and coalesce(pdf_url, '') <> ''
union all
select 'core_current', count(*), md5(coalesce(string_agg(location_id || '|' || file_url, ',' order by location_id), ''))
  from core.place_documents where is_current and deleted_at is null
union all
select 'core_all', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from core.place_documents;
