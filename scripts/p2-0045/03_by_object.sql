-- P2-0045 этап 1: места к созданию по объектам и типам (ТОЛЬКО ЧТЕНИЕ; правило — как 01_dryrun.sql).
with recursive n as (select n.*, quality.node_names(n) nm from quality.location_nodes n where not n.is_deleted),
obj as (
  select n.core_company_id c, n.id, n."displayName" name,
         (select array_agg(distinct po.core_object_id) from quality.project_objects po
           where po.core_company_id = n.core_company_id and quality.object_alive(po) and quality.po_names(po) && n.nm
             and po.core_object_id is not null) core
    from n where n."nodeType" = 'object' and coalesce(n."parentId", '') = ''
), t as (
  select n.core_company_id c, n.id, n."nodeType" nt, o.name obj, o.core, 1 depth
    from n join obj o on o.c = n.core_company_id and n."parentId" = o.id
  union all
  select n.core_company_id, n.id, n."nodeType", t.obj, t.core, t.depth + 1
    from n join t on t.c = n.core_company_id and n."parentId" = t.id
)
select string_agg(format('%s | %s → %s | корп %s, секц %s, эт %s, кв %s, всего %s, глуб %s',
         company, object, coalesce(core_object, '(нет)'), buildings, sections, floors, apartments, total, max_depth), E'\n' order by company, object) lines
  from (
select co.name company, o.name object, pr.name core_object,
       count(t.id) filter (where t.nt = 'building') buildings, count(t.id) filter (where t.nt = 'section') sections,
       count(t.id) filter (where t.nt = 'floor') floors, count(t.id) filter (where t.nt = 'apartment') apartments,
       count(t.id) total, max(t.depth) max_depth
  from obj o join core.companies co on co.id = o.c
  left join core.projects pr on pr.id = o.core[1]
  left join t on t.c = o.c and t.obj = o.name and t.core = o.core
 group by 1, 2, 3) z;
