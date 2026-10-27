-- P2-0054: снимок «до / после» (ТОЛЬКО ЧТЕНИЕ). Запустить до шага (048 или 03_switch.sql) и сразу после — строки должны
-- совпасть (048 добавляет в Качество узлы мест проектов ядра, у которых их не было, — отличаются только строки «узлы Качества»
-- таких проектов; 03_switch меняет только признак проекта).
--   места        — по проектам: живых мест ядра + отпечаток (id, путь, тип, вид объекта, номера, порядок);
--   узлы         — по проектам (узел-проект и всё под ним): живых / всего + отпечаток (id, родитель, название, тип, удалён,
--                  место ядра, синонимы, порядок);
--   СК 2.0       — по компаниям: замечания, приёмки, планы этажей, помещения, синонимы мест — отпечаток (id, место, проект, статус);
--   проверки     — по компаниям: проверки Качества (id, объект, место, этаж);
--   назначения, Качество, видят — как scripts/p2-0048/01_snapshot.sql (привязки и видимость инженеров).
with nodes as (
  select n.*, quality.node_object_project(n.core_company_id, n.id) p from quality.location_nodes n
), v2 as (
  select d.core_company_id c, d.core_project_id p, d.core_counterparty_id cp from quality.construction_defects_v2 d where not d.is_deleted
  union all
  select a.core_company_id, a.core_project_id, a.core_counterparty_id from quality.construction_acceptance_v2 a where not a.is_deleted
), act as (
  select a.* from core.role_assignments a
   where a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
), qasg as (
  select a, a.company_id c, a.user_id u, coalesce(cr.name, '') role, coalesce(pr.name, 'вся компания') scope
    from core.role_assignments a
    join core.company_roles cr on cr.id = a.role_id and cr.company_id = a.company_id
    left join core.projects pr on pr.id = a.project_id
   where a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()) and exists (select 1 from core.company_role_permissions p where p.role_id = a.role_id and p.company_id = a.company_id and p.action = 'construction.view')
), qvis as (
  select s.c, s.u, s.role, s.scope, count(v2.*) filter (where quality.assignment_sees_id(s.a, 'construction', v2.p, 'contractor', null, null, v2.cp)) n
    from qasg s left join v2 on v2.c = s.c group by s.a, s.c, s.u, s.role, s.scope
), qobj as (
  select a.company_id c, a.user_id u,
         case when bool_or(a.quality_objects is null) then 'все'
              else (select string_agg(distinct x, ',' order by x) from act b, unnest(b.quality_objects) x
                     where b.company_id = a.company_id and b.user_id = a.user_id) end objs
    from act a group by 1, 2
)
select string_agg(line, E'\n' order by line) lines from (
  select 'места ' || co.name || ' / ' || pr.name || ': живых ' || count(l.id)
         || ', отпечаток ' || coalesce(md5(string_agg(l.id || '|' || planfact.location_path(l.id) || '|' || l.node_type || '|'
                                                      || coalesce(l.object_kind, '') || '|' || coalesce(l.build_no, '') || '|'
                                                      || coalesce(l.bti_no, '') || '|' || l.sort_order, ',' order by l.id)), '-') line
    from core.projects pr join core.companies co on co.id = pr.company_id
    left join core.locations l on l.project_id = pr.id and l.deleted_at is null
   where not pr.quality_container and pr.deleted_at is null
   group by co.name, pr.name
  union all
  select 'узлы Качества ' || co.name || ' / ' || coalesce(pr.name, 'без проекта') || ': живых ' || count(*) filter (where not n.is_deleted)
         || ', всего ' || count(*) || ', отпечаток '
         || md5(string_agg(n.id || '|' || coalesce(n."parentId", '') || '|' || coalesce(n."displayName", '') || '|' || coalesce(n."nodeType", '')
                           || '|' || n.is_deleted || '|' || coalesce(n.core_location_id::text, '') || '|' || coalesce(n.synonyms::text, '')
                           || '|' || n.sort_order, ',' order by n.id))
    from nodes n join core.companies co on co.id = n.core_company_id left join core.projects pr on pr.id = n.p
   group by co.name, pr.name
  union all
  select 'замечания СК 2.0 ' || co.name || ': ' || count(*) || ', отпечаток '
         || md5(string_agg(d.id || '|' || coalesce(d."locationId", '') || '|' || coalesce(d.core_project_id::text, '') || '|'
                           || coalesce(d.status, '') || '|' || coalesce(d.is_deleted, false), ',' order by d.id))
    from quality.construction_defects_v2 d join core.companies co on co.id = d.core_company_id group by co.name
  union all
  select 'приёмки СК 2.0 ' || co.name || ': ' || count(*) || ', отпечаток '
         || md5(string_agg(a.id || '|' || coalesce(a."locationId", '') || '|' || coalesce(a.core_project_id::text, '') || '|'
                           || coalesce(a.status, '') || '|' || coalesce(a.is_deleted, false), ',' order by a.id))
    from quality.construction_acceptance_v2 a join core.companies co on co.id = a.core_company_id group by co.name
  union all
  select 'планы этажей ' || co.name || ': ' || count(*) || ', отпечаток '
         || md5(string_agg(f.id || '|' || coalesce(f."locationId", '') || '|' || coalesce(f.is_deleted, false) || '|' || coalesce(f.pdf_url, ''), ',' order by f.id))
    from quality.construction_floors_v2 f join core.companies co on co.id = f.core_company_id group by co.name
  union all
  select 'помещения СК 2.0 ' || co.name || ': ' || count(*) || ', отпечаток '
         || md5(string_agg(u.id || '|' || coalesce(u."locationId", '') || '|' || coalesce(u.core_project_id::text, '') || '|'
                           || coalesce(u.is_deleted, false), ',' order by u.id))
    from quality.construction_units_v2 u join core.companies co on co.id = u.core_company_id group by co.name
  union all
  select 'синонимы мест ' || co.name || ': ' || count(*) || ', отпечаток ' || md5(string_agg(to_jsonb(s)::text, ',' order by s.id))
    from quality.location_node_aliases s join core.companies co on co.id = s.core_company_id group by co.name
  union all
  select 'проверки Качества ' || co.name || ': ' || count(*) || ', отпечаток '
         || md5(string_agg(i.id || '|' || coalesce(i.core_project_id::text, '') || '|' || coalesce(to_jsonb(i) ->> 'location', '') || '|'
                           || coalesce(to_jsonb(i) ->> 'floor', ''), ',' order by i.id))
    from quality.rbi_inspections i join core.companies co on co.id = i.core_company_id group by co.name
  union all
  select 'назначения ' || co.name || ': действующих ' || count(*) filter (where a.revoked_at is null) || ', всего ' || count(*)
         || ', отпечаток ' || md5(string_agg(a.id || '|' || a.user_id || '|' || a.role_id || '|' || coalesce(a.project_id::text, '') || '|'
                                             || coalesce(a.valid_to::text, '') || '|' || coalesce(a.revoked_at::text, '') || '|'
                                             || coalesce(a.counterparty_id::text, '') || '|' || coalesce(a.quality_objects::text, '') || '|'
                                             || coalesce(to_jsonb(a) ->> 'quality_object_keys', ''), ',' order by a.id))
    from core.role_assignments a join core.companies co on co.id = a.company_id group by co.name
  union all
  select 'Качество ' || co.name || ': сотрудников ' || count(*) || ', отпечаток ' || md5(string_agg(q.u || '|' || q.objs, ',' order by q.u))
    from qobj q join core.companies co on co.id = q.c group by co.name
  union all
  select 'видят ' || co.name || ': назначений со стройконтролем ' || count(*) || ', отпечаток '
         || md5(string_agg(q.u || '|' || q.role || '|' || q.scope || '|' || q.n, ',' order by q.u, q.role, q.scope, q.n))
    from qvis q join core.companies co on co.id = q.c group by co.name
) s;
