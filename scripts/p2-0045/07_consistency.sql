-- P2-0045: согласие дерева (ТОЛЬКО ЧТЕНИЕ; запускать после 044 и через час). Живые узлы под живым узлом-объектом объекта, который ведёт
-- Качество (глубина ≤ 6), без живого места того же объекта; места из Качества с другим названием; v2 с объектом ≠ объекту места.
with recursive t as (
  select n.core_company_id c, n.id, quality.node_root_project(o) proj, 1 depth
    from quality.location_nodes n join quality.location_nodes o on o.core_company_id = n.core_company_id and o.id = n."parentId"
   where not n.is_deleted and o."nodeType" = 'object' and not o.is_deleted and coalesce(o."parentId", '') = ''
  union all
  select n.core_company_id, n.id, t.proj, t.depth + 1 from quality.location_nodes n join t on t.c = n.core_company_id and n."parentId" = t.id
   where not n.is_deleted)
select 'узлов без места: ' || (select count(*) from t where t.depth <= 6 and quality.places_led_by_quality(t.proj)
          and not exists (select 1 from quality.location_nodes x join core.locations l on l.id = x.core_location_id
                           where x.core_company_id = t.c and x.id = t.id and l.deleted_at is null and l.project_id = t.proj and l.depth = t.depth))
    || ' | название расходится: ' || (select count(*) from quality.location_nodes n join core.locations l on l.id = n.core_location_id
          where l.deleted_at is null and l.name <> coalesce(nullif(btrim(n."displayName"), ''), nullif(btrim(n.canonical_key), ''), 'Без названия'))
    || ' | v2 объект расходится: ' || (select count(*) from quality.construction_defects_v2 d
          where core_project_id is distinct from quality.node_object_project(core_company_id, "locationId"))
    || ' | узлов изменено за час: ' || (select count(*) from quality.location_nodes where updated_at > now() - interval '1 hour') lines;
