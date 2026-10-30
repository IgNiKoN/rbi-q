-- P2-0057 этап 1: опись PDF-планов этажей и квартир (ТОЛЬКО ЧТЕНИЕ — ничего не пишет). Запуск на сервере (SQL Editor) или в PGlite.
-- Что выводит (по компаниям): сколько этажей и квартир с планом в Качестве / СК 2.0; кто ведёт места их проекта (ядро — будут
-- перенесены этапом 4; Качество — остаются как есть; без места ядра — не переносятся); в каком бакете файлы; есть ли файл в
-- Storage; дубли (две строки плана на одно место); место ядра другого вида (этаж ↔ квартира).
with plans as (
  select 'floor' as lvl, f.core_company_id as company_id, f."locationId" as node_id, f.id as row_id, f.pdf_url
    from quality.construction_floors_v2 f where not f.is_deleted and coalesce(f.pdf_url, '') <> ''
  union all
  select 'apartment', u.core_company_id, u."locationId", u.id, u.pdf_url
    from quality.construction_units_v2 u where not u.is_deleted and coalesce(u.pdf_url, '') <> ''
), marked as (
  select p.*,
         substring(p.pdf_url from '/storage/v1/object/public/([^/]+)/') as bucket,
         substring(p.pdf_url from '/storage/v1/object/public/[^/]+/(.*)$') as path,
         l.id as place_id, l.node_type as place_type, pr.places_master
    from plans p
    left join quality.location_nodes n on n.core_company_id = p.company_id and n.id = p.node_id
    left join core.locations l on l.id = n.core_location_id and l.deleted_at is null
    left join core.projects pr on pr.id = l.project_id
)
select c.name as company, m.lvl as level,
       coalesce(m.places_master, 'нет места ядра') as places_led_by,
       coalesce(m.bucket, 'не Storage') as bucket,
       count(*) as plans,
       count(*) filter (where exists (select 1 from storage.objects o where o.bucket_id = m.bucket and o.name = m.path)) as file_found,
       count(distinct m.node_id) as places,
       count(*) - count(distinct m.node_id) as duplicates,
       count(*) filter (where m.place_type is not null and m.place_type <> m.lvl) as type_mismatch
  from marked m join core.companies c on c.id = m.company_id
 group by c.name, m.lvl, coalesce(m.places_master, 'нет места ядра'), coalesce(m.bucket, 'не Storage')
 order by c.name, m.lvl, 3, 4;
