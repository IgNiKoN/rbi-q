-- P2-0057 этап 4 (ТОЛЬКО PGlite, после засева 048_core_places.seed.pglite.sql и миграций до 055): планы «как RBI» перед переносом.
-- Ссылки — как у приложения (…/object/public/quality-custom-assets/<компания>/…); квартира с планом; две строки плана на один
-- этаж (дубль); план узла без места ядра; проекты компании «Снимок 048» переведены на «места ведёт ядро» (как 03_switch P2-0054),
-- кроме ЖК Юг (остаётся за Качеством). Снимок «до» — в public.p57_before.
set p2_0057.company = 'Снимок 048';
do $$
declare c uuid := '00000000-0000-4000-8000-000000548100'; u text := 'https://api.rbi-q.ru/storage/v1/object/public/quality-custom-assets/00000000-0000-4000-8000-000000548100/';
begin
  update quality.construction_floors_v2 set pdf_url = u || 'location_plans/' || "locationId" || '/plan_1.pdf', pdf_size = '120345' where core_company_id = c;
  insert into quality.construction_floors_v2(id, "locationId", name, sort_order, pdf_url, pdf_name, pdf_size, is_active, core_company_id, updated_at) values
    ('p548-dup', 'n548-n-b1s1f1', 'План 1 (старый)', 1, u || 'location_plans/n548-n-b1s1f1/plan_0.pdf', 'p0.pdf', '1 КБ', true, c, now() - interval '30 days');
  update quality.construction_units_v2 set pdf_url = u || 'unit_plans/' || id || '/plan_1.pdf', pdf_name = 'кв1.pdf', pdf_size = '5000'
   where core_company_id = c and id = 'u548-1';
  -- план этажа ЖК Юг (места ведёт Качество — не переносится)
  insert into quality.construction_floors_v2(id, "locationId", name, sort_order, pdf_url, pdf_name, pdf_size, is_active, core_company_id)
  select 'p548-south', n.id, 'План Юг', 1, u || 'location_plans/' || n.id || '/plan_1.pdf', 'south.pdf', '777', true, c
    from quality.location_nodes n where n.core_company_id = c and n.id = 'n548-s-3' and n.core_location_id is not null;
  -- план узла без места ядра
  insert into quality.construction_floors_v2(id, "locationId", name, sort_order, pdf_url, pdf_name, pdf_size, is_active, core_company_id) values
    ('p548-orphan', 'нет-такого-узла', 'Сирота', 1, u || 'location_plans/x/plan_1.pdf', 'x.pdf', '1', true, c);
  update core.projects pr set places_master = 'core'
   where pr.company_id = c and pr.places_master = 'quality' and pr.name <> 'ЖК Юг';
end $$;
create table public.p57_before as
select 'module_floors' as k, count(*) as n, md5(coalesce(string_agg(core_company_id || '|' || id || '|' || pdf_url, ',' order by core_company_id, id), '')) as v
  from quality.construction_floors_v2 where not is_deleted and coalesce(pdf_url, '') <> ''
union all
select 'module_units', count(*), md5(coalesce(string_agg(core_company_id || '|' || id || '|' || pdf_url, ',' order by core_company_id, id), ''))
  from quality.construction_units_v2 where not is_deleted and coalesce(pdf_url, '') <> '';
