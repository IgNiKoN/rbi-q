-- P2-0048: снимок «до / после» 047 (ТОЛЬКО ЧТЕНИЕ). Запустить ДО выкладки и сразу ПОСЛЕ — все строки должны совпасть
-- (047 добавляет поля и функции; у действующих назначений нет места — права, видимость Качества и факт не меняются).
--   назначения — по компаниям: действующих / всего + отпечаток (сотрудник, роль, проект, срок, отзыв, фирма, объекты Качества);
--   права      — по компаниям: отпечаток «сотрудник × проект × действие План/Факта» по правилу has_permission
--                (после 047 — с учётом места: назначение на часть проекта даёт только права «по местам»);
--   Качество   — по компаниям: отпечаток «сотрудник → объекты Качества» (как quality.my_access: есть назначение без объектов — все);
--   факт       — по компаниям: записей и отпечаток (id, статус, объём, автор);
--   видят      — Стройконтроль 2.0: сколько замечаний и приёмок видит каждое действующее назначение с правом стройконтроля
--                (как scripts/p2-0047/02_snapshot.sql — правило Качества quality.assignment_sees_id, без входа пользователя).
with act as (
  select a.*, (to_jsonb(a) ->> 'location_id') loc
    from core.role_assignments a
   where a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
), perms as (
  select pr.company_id c, a.user_id u, pr.id p, rp.action
    from core.projects pr
    join core.company_modules cm on cm.company_id = pr.company_id and cm.module = 'planfact' and cm.enabled
    join act a on a.company_id = pr.company_id and (a.project_id = pr.id or a.project_id is null)
    join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action like 'planfact.%'
    join core.permission_catalog pc on pc.action = rp.action
   where a.loc is null or coalesce((to_jsonb(pc) ->> 'area_scoped')::boolean, false)
   group by 1, 2, 3, 4
), v2 as (
  select d.core_company_id c, d.core_project_id p, d.core_counterparty_id cp from quality.construction_defects_v2 d where not d.is_deleted
  union all
  select a.core_company_id, a.core_project_id, a.core_counterparty_id from quality.construction_acceptance_v2 a where not a.is_deleted
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
  select 'назначения ' || co.name || ': действующих ' || count(*) filter (where a.revoked_at is null) || ', всего ' || count(*)
         || ', отпечаток ' || md5(string_agg(a.id || '|' || a.user_id || '|' || a.role_id || '|' || coalesce(a.project_id::text, '') || '|'
                                             || coalesce(a.valid_to::text, '') || '|' || coalesce(a.revoked_at::text, '') || '|'
                                             || coalesce(a.counterparty_id::text, '') || '|' || coalesce(a.quality_objects::text, ''), ',' order by a.id)) line
    from core.role_assignments a join core.companies co on co.id = a.company_id group by co.name
  union all
  select 'права План/Факта ' || co.name || ': ' || count(*) || ', отпечаток ' || md5(string_agg(x.u || '|' || x.p || '|' || x.action, ',' order by x.u, x.p, x.action))
    from perms x join core.companies co on co.id = x.c group by co.name
  union all
  select 'Качество ' || co.name || ': сотрудников ' || count(*) || ', отпечаток ' || md5(string_agg(q.u || '|' || q.objs, ',' order by q.u))
    from qobj q join core.companies co on co.id = q.c group by co.name
  union all
  select 'факт ' || co.name || ': записей ' || count(*) || ', отпечаток ' || md5(string_agg(e.id || '|' || e.status || '|' || e.qty || '|' || coalesce(e.created_by::text, ''), ',' order by e.id))
    from planfact.fact_entries e join core.companies co on co.id = e.company_id group by co.name
  union all
  select 'видят ' || co.name || ': назначений со стройконтролем ' || count(*) || ', отпечаток ' || md5(string_agg(q.u || '|' || q.role || '|' || q.scope || '|' || q.n, ',' order by q.u, q.role, q.scope, q.n))
    from qvis q join core.companies co on co.id = q.c group by co.name
) s;
