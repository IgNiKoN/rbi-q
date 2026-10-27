-- P2-0047 этап 6: снимок «до / после» 045 (ТОЛЬКО ЧТЕНИЕ). Запустить ДО выкладки и сразу ПОСЛЕ — все строки должны совпасть
-- (045 меняет только тип верхних мест на «объект» и добавляет поля; места, ссылки на них и видимость не меняются).
--   места          — по компаниям: живых / всего / квартир / верхнего уровня + отпечаток (id, родитель, проект, название, глубина, удаление)
--   ссылки         — каждая таблица со ссылкой на core.locations: сколько строк указывает на живое место
--   Качество       — узлов Качества с живым местом ядра; проекты, места которых ведёт Качество
--   видят          — Стройконтроль 2.0: сколько замечаний и приёмок видит каждое действующее назначение (по ролям, людей в группе)
with fk as (
  select c.conrelid::regclass::text tbl, a.attname::text col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f' and c.confrelid = 'core.locations'::regclass and c.conrelid <> 'core.locations'::regclass
), v2 as (
  select d.core_company_id c, d.core_project_id p, d.core_counterparty_id cp from quality.construction_defects_v2 d where not d.is_deleted
  union all
  select a.core_company_id, a.core_project_id, a.core_counterparty_id from quality.construction_acceptance_v2 a where not a.is_deleted
), asg as (
  select a, a.company_id c, coalesce(cr.name, '') role, coalesce(pr.name, 'вся компания') scope
    from core.role_assignments a
    join core.company_roles cr on cr.id = a.role_id and cr.company_id = a.company_id
    left join core.projects pr on pr.id = a.project_id
   where a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
     and exists (select 1 from core.company_role_permissions p where p.role_id = a.role_id and p.company_id = a.company_id and p.action = 'construction.view')
), vis as (
  select s.c, s.role, s.scope, count(v2.*) filter (where quality.assignment_sees_id(s.a, 'construction', v2.p, 'contractor', null, null, v2.cp)) n
    from asg s left join v2 on v2.c = s.c group by s.a, s.c, s.role, s.scope
)
select string_agg(line, E'\n' order by line) lines from (
  select 'места ' || co.name || ': живых ' || count(*) filter (where l.deleted_at is null) || ', всего ' || count(*)
         || ', квартир ' || count(*) filter (where l.node_type = 'apartment' and l.deleted_at is null)
         || ', верхних ' || count(*) filter (where l.parent_id is null and l.deleted_at is null)
         || ', отпечаток ' || md5(string_agg(l.id::text || '|' || coalesce(l.parent_id::text, '') || '|' || l.project_id::text || '|' || l.name || '|' || l.depth
                                             || '|' || coalesce(l.deleted_at::text, ''), ',' order by l.id)) line
    from core.locations l join core.companies co on co.id = l.company_id group by co.name
  union all
  select 'ссылки ' || fk.tbl || '.' || fk.col || ': ' || (xpath('/row/n/text()', query_to_xml(format(
           'select count(*) n from %s x join core.locations l on l.id = x.%I where l.deleted_at is null', fk.tbl, fk.col), false, true, '')))[1]::text
    from fk
  union all
  select 'Качество: узлов с живым местом ядра ' || count(*) from quality.location_nodes n join core.locations l on l.id = n.core_location_id and l.deleted_at is null
  union all
  select 'Качество ведёт места: ' || co.name || ' | ' || pr.name from core.projects pr join core.companies co on co.id = pr.company_id
   where pr.deleted_at is null and quality.places_led_by_quality(pr.id)
  union all
  select 'видят ' || co.name || ' | ' || v.role || ' / ' || v.scope || ' — ' || v.n || ' (назначений: ' || count(*) || ')'
    from vis v join core.companies co on co.id = v.c group by co.name, v.role, v.scope, v.n
) z;
