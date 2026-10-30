-- P2-0071 этап 1: проба на боевой базе ДО миграции 053 (ТОЛЬКО ЧТЕНИЕ — только select, ничего не меняет).
-- Запуск: панель SQL Editor, вставить целиком, Run. Таблицы ответа — в отчёт Исполнителя / release-plan.
-- 1) перенос назначений: кто получит участие на объекты (и на сколько), кто станет «без объектов», что не перенесётся;
-- 2) записи Качества без объекта («не разобрано») — их увидят только автор и назначенные на всю компанию;
-- 3) роли: сколько ролей получит какой набор новых действий Качества (перенос по прежним).

-- 1. Перенос назначений (решения владельца 30.10.2026)
with a as (
  select ra.*, array(select rp.action from core.company_role_permissions rp
                      where rp.role_id = ra.role_id and rp.company_id = ra.company_id) acts
    from core.role_assignments ra
   where ra.project_id is null and ra.location_id is null
     and ra.revoked_at is null and (ra.valid_to is null or ra.valid_to > now())
)
select c.name as "компания", coalesce(up.full_name, u.email::text) as "сотрудник", cr.name as "роль",
       case
         when cardinality(a.quality_objects) > 0 and 'quality.scope.company' = any(a.acts) then 'вся компания (роль «вся компания», без изменений)'
         when cardinality(a.quality_objects) > 0 then
           'объекты: ' || coalesce((select string_agg(distinct p.name, ', ' order by p.name) from quality.project_objects po
                                     join core.projects p on p.id = po.core_object_id and not p.quality_container
                                    where po.core_company_id = a.company_id and po.id = any (a.quality_objects) and quality.object_alive(po)),
                                   '— не найдены → «без объектов»')
         when 'quality.edit' = any(a.acts) and not (a.acts && array['quality.manage', 'quality.scope.company', 'quality.scope.contractor'])
           then 'без объектов (сейчас видит только свои записи)'
       end as "после 053",
       case when not exists (select 1 from core.projects p where p.company_id = a.company_id and p.quality_container and p.archived_at is null)
            then 'нет контейнера — назначение не изменится' end as "внимание"
  from a
  join core.companies c on c.id = a.company_id
  join core.company_roles cr on cr.id = a.role_id and cr.company_id = a.company_id
  left join core.user_profiles up on up.user_id = a.user_id
  left join auth.users u on u.id = a.user_id
 where (cardinality(a.quality_objects) > 0 and exists (select 1 from unnest(a.acts) x where x like 'quality.%'))
    or ('quality.edit' = any(a.acts) and a.quality_objects is null
        and not (a.acts && array['quality.manage', 'quality.scope.company', 'quality.scope.contractor']))
 order by 1, 4, 2;

-- 2. Записи Качества без объекта («не разобрано»)
select t as "таблица", count(*) filter (where o is null and not coalesce(del, false)) as "живых без объекта",
       count(*) filter (where not coalesce(del, false)) as "живых всего"
  from (select 'проверки' t, core_object_id o, is_deleted del from quality.rbi_inspections
        union all select 'задачи', core_object_id, is_deleted from quality.rbi_tasks
        union all select 'совещания', core_object_id, is_deleted from quality.project_meetings
        union all select 'мероприятия', core_object_id, is_deleted from quality.project_interventions
        union all select 'FMEA', core_object_id, is_deleted from quality.project_fmea
        union all select 'этапы', core_object_id, is_deleted from quality.project_schedule_stages
        union all select 'отчёты', core_object_id, is_deleted from quality.shared_reports
        union all select 'замечания внешнего СК', core_object_id, is_deleted from quality.sk_records) x
 group by 1 order by 1;

-- 3. Роли: какой набор новых действий Качества получат (по прежним ключам)
select case when 'quality.edit' = any(acts) and acts && array['quality.manage', 'quality.scope.company', 'quality.scope.contractor']
              then 'всё, включая «Править чужие»'
            when 'quality.edit' = any(acts) then 'видеть все, проводить, ставить, выполнять, вести, удалять свои'
            when 'quality.view' = any(acts) then 'только видеть'
            else 'ничего (нет прежних ключей Качества)' end as "новые действия",
       count(*) as "ролей", string_agg(name, ', ' order by name) as "роли"
  from (select cr.name, array_agg(rp.action) acts from core.company_roles cr
          join core.company_role_permissions rp on rp.role_id = cr.id and rp.company_id = cr.company_id
         group by cr.id, cr.name) r
 where exists (select 1 from unnest(acts) x where x like 'quality.%')
 group by 1 order by 1;
