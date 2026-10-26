-- P2-0045 этап 2: кто видит замечания/приёмки Стройконтроля 2.0 сейчас (объект пуст) и после 044 (объект по месту "locationId")
-- (ТОЛЬКО ЧТЕНИЕ). Видимость — как политика v2 (043: quality.row_visible_id, вид 'contractor'), по каждому действующему
-- назначению с construction.view: до — p_project = null, после — объект ядра узла-объекта над местом записи.
with recursive r as (
  select 'замечание' t, d.core_company_id c, d.id, d."locationId" loc, d.core_counterparty_id cp from quality.construction_defects_v2 d where not d.is_deleted
  union all
  select 'приёмка', a.core_company_id, a.id, a."locationId", a.core_counterparty_id from quality.construction_acceptance_v2 a where not a.is_deleted
), up as (                                     -- вверх по дереву Качества до корневого узла
  select r.t, r.c, r.id rid, n.id, n."parentId" pid, n."nodeType" nt, n, 0 lvl
    from r join quality.location_nodes n on n.core_company_id = r.c and n.id = r.loc
  union all
  select up.t, up.c, up.rid, p.id, p."parentId", p."nodeType", p, up.lvl + 1
    from up join quality.location_nodes p on p.core_company_id = up.c and p.id = up.pid where up.lvl < 20
), root as (
  select distinct on (t, c, rid) t, c, rid, n root_node from up
   where coalesce(pid, '') = '' order by t, c, rid, lvl desc
), rp as (                                     -- запись → объект ядра (пусто: место не найдено / корень не объект / объект без объекта ядра)
  select r.t, r.c, r.id, r.cp,
         (select min(po.core_object_id::text)::uuid from quality.project_objects po
           where (x.root_node)."nodeType" = 'object' and not (x.root_node).is_deleted
             and po.core_company_id = r.c and quality.object_alive(po) and quality.po_names(po) && quality.node_names(x.root_node)
             and po.core_object_id is not null
          having count(distinct po.core_object_id) = 1) proj
    from r left join root x on x.t = r.t and x.c = r.c and x.rid = r.id
), asg as (
  select a, a.company_id c, u.email,
         coalesce(cr.name, '') role, coalesce(pr.name, 'вся компания') scope
    from core.role_assignments a
    join core.company_roles cr on cr.id = a.role_id and cr.company_id = a.company_id
    left join core.projects pr on pr.id = a.project_id
    left join auth.users u on u.id = a.user_id
   where a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
     and exists (select 1 from core.company_role_permissions p where p.role_id = a.role_id and p.company_id = a.company_id and p.action = 'construction.view')
), vis as (
  select s.c, s.email, s.role, s.scope,
         count(*) filter (where quality.assignment_sees_id(s.a, 'construction', null, 'contractor', null, null, rp.cp)) before_n,
         count(*) filter (where quality.assignment_sees_id(s.a, 'construction', rp.proj, 'contractor', null, null, rp.cp)) after_n
    from asg s join rp on rp.c = s.c group by 1, 2, 3, 4
)
select string_agg(line, E'\n' order by line) lines from (
select co.name || ' | записи: ' || coalesce(pr.name, '(без объекта)') || ' — ' || count(*) line
  from rp join core.companies co on co.id = rp.c left join core.projects pr on pr.id = rp.proj group by co.name, pr.name
union all
select co.name || ' | видят: ' || v.role || ' / ' || v.scope || ' — ' || v.before_n || ' → ' || v.after_n || ' (людей: ' || count(*) || ')'
  from vis v join core.companies co on co.id = v.c group by co.name, v.role, v.scope, v.before_n, v.after_n) z;
