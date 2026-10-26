-- P2-0045 этап 4: после 044 на сервере (ТОЛЬКО ЧТЕНИЕ): места из Качества по компаниям/объектам, объекты v2, русские тексты.
select string_agg(line, E'\n' order by line) lines from (
  select 'места ' || co.name || ' | ' || pr.name || ' — ' || count(*) || ' (глуб ' || max(l.depth) || ')' line
    from quality.location_nodes n join core.locations l on l.id = n.core_location_id and l.deleted_at is null
    join core.projects pr on pr.id = l.project_id join core.companies co on co.id = l.company_id group by co.name, pr.name
  union all
  select 'ИТОГО мест из Качества: ' || count(*) from quality.location_nodes n join core.locations l on l.id = n.core_location_id and l.deleted_at is null
  union all
  select 'ведёт Качество объектов RBI: ' || count(*) filter (where quality.places_led_by_quality(pr.id)) || ' из ' || count(*)
    from core.projects pr join core.companies co on co.id = pr.company_id where co.name = 'RBI' and not pr.quality_container and pr.archived_at is null
  union all
  select 'ведёт Качество (тест): ' || co.name || ' ' || pr.name from core.projects pr join core.companies co on co.id = pr.company_id
   where co.name in ('Демо-компания', 'Альфа') and pr.name in ('ЖК «Спутник» (демо)', 'REST-автопроверки') and quality.places_led_by_quality(pr.id)
  union all
  select 'v2 ' || t || ': ' || coalesce(pr.name, '(без объекта)') || ' — ' || count(*) from (
    select 'замечания' t, core_project_id p from quality.construction_defects_v2 where not is_deleted
    union all select 'приёмки', core_project_id from quality.construction_acceptance_v2 where not is_deleted) z
    left join core.projects pr on pr.id = z.p group by t, pr.name
  union all
  select 'текст: ' || substring(pg_get_functiondef('quality.places_guard()'::regprocedure) from 'Места этого объекта[^'']*')
) x;
