-- P2-0070 этап 1: проба на боевой базе ДО миграции 052 (ТОЛЬКО ЧТЕНИЕ — только select, ничего не меняет).
-- Запуск: панель SQL Editor, вставить целиком, Run. Три таблицы ответа — в отчёт Исполнителя / release-plan.
-- 1) места записей: как посчитает 052 (quality.v2_bind_place) — "locationId" → узел Качества → место ядра того же объекта;
-- 2) участие на часть проекта у людей с правами Стройконтроля — их видимость сузится до своей части (решение плана п. 3);
-- 3) роли: сколько ролей получит какой набор новых действий (перенос по прежним, без потерь).

-- 1. Места записей Стройконтроля 2.0
with r as (
  select 'замечания' t, d.core_company_id c, d.core_project_id p, d."locationId" loc, d.is_deleted del from quality.construction_defects_v2 d
  union all
  select 'приёмки', a.core_company_id, a.core_project_id, a."locationId", a.is_deleted from quality.construction_acceptance_v2 a
)
select r.t as "таблица",
       case when r.p is null then 'без объекта (видят участники на весь проект и автор)'
            when nullif(btrim(coalesce(r.loc, '')), '') is null then 'объект, узла нет (весь объект)'
            when exists (select 1 from quality.location_nodes n join core.locations l on l.id = n.core_location_id
                          where n.core_company_id = r.c and n.id = r.loc and l.project_id = r.p and l.deleted_at is null) then 'место найдено'
            when exists (select 1 from quality.location_nodes n where n.core_company_id = r.c and n.id = r.loc
                          and n."nodeType" = 'object' and coalesce(n."parentId", '') = '') then 'на узле-объекте (весь объект)'
            else 'место не найдено (весь объект)' end as "место",
       count(*) filter (where not r.del) as "живых", count(*) filter (where r.del) as "удалённых"
  from r group by 1, 2 order by 1, 2;

-- 2. Участие на часть проекта у людей с правами Стройконтроля (их видимость в Стройконтроле 2.0 сузится до этой части)
select c.name as "компания", p.name as "объект", coalesce(up.full_name, u.email::text) as "сотрудник", cr.name as "роль",
       planfact.location_path(a.location_id) as "место участия"
  from core.role_assignments a
  join core.companies c on c.id = a.company_id
  join core.company_roles cr on cr.id = a.role_id and cr.company_id = a.company_id
  left join core.projects p on p.id = a.project_id
  left join auth.users u on u.id = a.user_id
  left join core.user_profiles up on up.user_id = a.user_id
 where a.location_id is not null and a.revoked_at is null and (a.valid_to is null or a.valid_to > now())
   and exists (select 1 from core.company_role_permissions rp where rp.role_id = a.role_id and rp.company_id = a.company_id
                  and rp.action in ('construction.view', 'construction.edit'))
 order by 1, 2, 3;

-- 3. Роли: прежние права Стройконтроля → какой набор новых действий получит роль
select case when 'construction.edit' = any(acts) and 'quality.scope.contractor' = any(acts) then 'подрядчик: видеть, в работу, устранено, записаться'
            when 'construction.edit' = any(acts) then 'все 13 действий (замечания, приёмка, передача)'
            when 'construction.view' = any(acts) then 'только видеть замечания и приёмки'
            else 'без Стройконтроля' end as "получит",
       count(*) filter (where template_code is not null) as "ролей-шаблонов", count(*) filter (where template_code is null) as "своих ролей",
       count(*) filter (where users > 0) as "с сотрудниками"
  from (select r.id, r.template_code, array_agg(rp.action) acts,
               (select count(distinct a.user_id) from core.role_assignments a where a.role_id = r.id and a.revoked_at is null) users
          from core.company_roles r join core.company_role_permissions rp on rp.role_id = r.id and rp.company_id = r.company_id
         group by r.id, r.template_code) x
 group by 1 order by 1;
