-- P2-0054: проба перед переводом компании на «места ведёт ядро» (ТОЛЬКО ЧТЕНИЕ). Запускать после 048.
-- По каждой компании и проекту: кто ведёт места, живых мест ядра, живых узлов Качества под узлом-проектом, узлов без места ядра
-- (глубина ≤ 6 — их дозальёт 03_switch; глубже 6 — останутся без места, как сейчас), мест ядра без узла (у проекта Качества
-- таких быть не должно), замечаний и приёмок СК 2.0 по местам проекта.
with recursive tree as (
  select n.core_company_id c, n.id, pr.id p, 0 lvl, n.core_location_id loc, n.is_deleted del
    from quality.location_nodes n join core.projects pr on pr.id = quality.node_root_project(n)
   where n."nodeType" = 'object' and coalesce(n."parentId", '') = '' and not n.is_deleted
  union all
  select x.core_company_id, x.id, t.p, t.lvl + 1, x.core_location_id, x.is_deleted or t.del
    from quality.location_nodes x join tree t on t.c = x.core_company_id and x."parentId" = t.id
   where t.lvl < 20
)
select co.name || ' / ' || pr.name || ': ведёт ' || pr.places_master
       || '; мест ядра ' || (select count(*) from core.locations l where l.project_id = pr.id and l.deleted_at is null)
       || '; узлов ' || count(t.id) filter (where t.lvl > 0 and not t.del)
       || '; без места (≤6) ' || count(t.id) filter (where t.lvl between 1 and 6 and not t.del and t.loc is null)
       || '; без места (>6) ' || count(t.id) filter (where t.lvl > 6 and not t.del and t.loc is null)
       || '; мест ядра без узла ' || (select count(*) from core.locations l where l.project_id = pr.id and l.deleted_at is null
                                       and not exists (select 1 from quality.location_nodes x where x.core_location_id = l.id))
       || '; замечаний ' || (select count(*) from quality.construction_defects_v2 d where d.core_project_id = pr.id and not coalesce(d.is_deleted, false))
       || '; приёмок ' || (select count(*) from quality.construction_acceptance_v2 a where a.core_project_id = pr.id and not coalesce(a.is_deleted, false)) line
  from core.projects pr join core.companies co on co.id = pr.company_id
  left join tree t on t.p = pr.id
 where not pr.quality_container and pr.deleted_at is null
 group by co.name, pr.id, pr.name, pr.places_master
 order by 1;
