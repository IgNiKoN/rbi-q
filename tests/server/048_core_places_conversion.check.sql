-- P2-0054 (048): разметка проектов засева 048_core_places.seed.pglite.sql после 048 (ТОЛЬКО ЧТЕНИЕ). Отчёт — «FAIL всего: N».
-- Места ведёт Качество: ЖК Север, ЖК Юг, ЖК Восток (дерево Качества); ядро: ЖК Пустой (узел-проект без мест), ЖК План/Факт
-- (свои места; их узлы — в Качестве под узлом-проектом, id = id места).
with pm as (
  select pr.name, pr.places_master m from core.projects pr join core.companies co on co.id = pr.company_id where co.name like '% 048'
), chk as (
  select (select string_agg(name || '=' || m, ',' order by name) from pm)
           = 'ЖК Восток=quality,ЖК План/Факт=core,ЖК Пустой=core,ЖК Север=quality,ЖК Юг=quality' ok, 'признак проектов засева' l
  union all
  select (select count(*) from quality.location_nodes n join core.locations l on l.id = n.core_location_id
           where n.id = l.id::text and l.project_id = '00000000-0000-4000-8000-000000548209'
             and n."parentId" = quality.project_root_node('00000000-0000-4000-8000-000000548209') is not distinct from (l.parent_id is null)) = 2,
         'ЖК План/Факт: места — узлами Качества'
  union all
  select (select count(*) from quality.location_nodes n where n.core_company_id = '00000000-0000-4000-8000-000000548100'
           and n.id like 'n548-%' and n.core_location_id::text = n.id) = 0, 'узлы RBI: id не менялись'
  union all
  select quality.places_led_by_quality(pr.id) = (pr.places_master = 'quality'), 'правило 044 по признаку: ' || pr.name
    from core.projects pr join core.companies co on co.id = pr.company_id where co.name like '% 048'
)
select coalesce(string_agg('FAIL ' || l, E'\n') || E'\n', '') || 'FAIL всего: ' || count(*) r from chk where not coalesce(ok, false);
