-- P2-0072: проба на боевой базе ДО миграции 054 (ТОЛЬКО ЧТЕНИЕ — один select, ничего не меняет).
-- Запуск: панель SQL Editor, вставить целиком, Run. Таблица ответа — в release-plan (шаг 1 выкладки).
-- Строки «таблица»: сколько записей, сколько из них уже с uuid-номером (core_id = id), сколько uuid-номеров повторяется в
-- другой компании (такие получат новый core_id). Строки «связь»: ссылок всего, совпадёт (связь по uuid заполнится), не совпадёт
-- (висячая или в другую компанию — связь останется пустой, строка на месте), пусто.
with t(name) as (values ('allowed_projects'), ('app_assistant_kb'), ('construction_acceptance'), ('construction_acceptance_v2'),
    ('construction_buildings'), ('construction_defects'), ('construction_defects_v2'), ('construction_floors'), ('construction_floors_v2'),
    ('construction_objects'), ('construction_units'), ('construction_units_v2'), ('contractor_directory'), ('contractor_normalization_queue'),
    ('contractors'), ('contracts'), ('file_registry'), ('location_nodes'), ('object_normalization_queue'), ('project_fmea'),
    ('project_interventions'), ('project_meetings'), ('project_objects'), ('project_schedule_stages'), ('rbi_draft_sessions'),
    ('rbi_engineer_profiles'), ('rbi_engineer_ratings'), ('rbi_inspection_items'), ('rbi_inspection_photos'), ('rbi_inspections'), ('rbi_tasks'),
    ('shared_checklists'), ('shared_docs'), ('shared_etalons'), ('shared_feedback'), ('shared_nodes'), ('shared_practices'),
    ('shared_report_snapshots'), ('shared_report_templates'), ('shared_reports'), ('shared_twi_cards')),
l(child, ref, parent) as (values
    ('rbi_inspection_items', 'inspection_id', 'rbi_inspections'), ('rbi_inspection_photos', 'inspection_id', 'rbi_inspections'),
    ('shared_report_snapshots', 'report_id', 'shared_reports'), ('location_nodes', 'parentId', 'location_nodes'),
    ('construction_buildings', 'object_id', 'construction_objects'), ('construction_acceptance', 'object_id', 'construction_objects'),
    ('construction_floors', 'building_id', 'construction_buildings'), ('construction_units', 'building_id', 'construction_buildings'),
    ('construction_units', 'floor_id', 'construction_floors'), ('construction_acceptance', 'floor_id', 'construction_floors'),
    ('construction_defects', 'floor_id', 'construction_floors'), ('construction_floors_v2', 'locationId', 'location_nodes'),
    ('construction_units_v2', 'locationId', 'location_nodes'), ('construction_defects_v2', 'locationId', 'location_nodes'),
    ('construction_acceptance_v2', 'locationId', 'location_nodes'), ('contracts', 'contractorId', 'contractors')),
q(sort, kind, name, sql) as (
  select 1, 'таблица', t.name, case when t.name = 'allowed_projects'
      then 'select count(*) a, 0 b, 0 c, null::bigint d from quality.allowed_projects'
      else format($s$select count(*) a,
                     count(*) filter (where id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') b,
                     (select count(*) from (select lower(id::text) from quality.%1$I
                        where id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        group by 1 having count(*) > 1) x) c, null::bigint d from quality.%1$I$s$, t.name) end
    from t
  union all
  select 2, 'связь', l.child || '.' || l.ref || ' → ' || l.parent,
         format($s$select count(*) filter (where nullif(c.%2$I, '') is not null) a,
                       count(*) filter (where p.id is not null) b,
                       count(*) filter (where nullif(c.%2$I, '') is not null and p.id is null) c,
                       count(*) filter (where nullif(c.%2$I, '') is null) d
                  from quality.%1$I c left join quality.%3$I p on p.core_company_id = c.core_company_id and p.id = c.%2$I$s$,
                l.child, l.ref, l.parent)
    from l),
r as (select q.sort, q.kind, q.name, query_to_xml(q.sql, false, true, '') x from q)
select kind as "что", name as "таблица / связь",
       (xpath('/row/a/text()', x))[1]::text::bigint as "строк / ссылок",
       (xpath('/row/b/text()', x))[1]::text::bigint as "uuid-номеров / совпадёт",
       (xpath('/row/c/text()', x))[1]::text::bigint as "uuid в двух компаниях / не совпадёт",
       (xpath('/row/d/text()', x))[1]::text::bigint as "пусто"
  from r order by sort, name;
