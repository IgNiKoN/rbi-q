-- P2-0047 этап 2: проба перед 045 (ТОЛЬКО ЧТЕНИЕ). Сколько корней дерева мест станет объектами «корпус» и «прочее»,
-- корней другого типа (roots_bad — станут объектом «прочее», исходный тип — в p2_backup), сколько из них ведёт Качество; часовой пояс по умолчанию есть на сервере.
select c.name company,
       count(*) filter (where l.parent_id is null and l.deleted_at is null)                                  roots_alive,
       count(*) filter (where l.parent_id is null and l.node_type = 'building')                              to_building,
       count(*) filter (where l.parent_id is null and l.node_type = 'other')                                 to_other,
       count(*) filter (where l.parent_id is null and l.node_type not in ('building', 'other'))              roots_bad,
       count(*) filter (where l.parent_id is null and quality.places_led_by_quality(l.project_id))           roots_quality,
       count(*) filter (where l.deleted_at is null)                                                           places_alive,
       count(distinct l.project_id)                                                                           projects
  from core.locations l join core.companies c on c.id = l.company_id
 group by c.name
union all
select 'ИТОГО', count(*) filter (where parent_id is null and deleted_at is null), count(*) filter (where parent_id is null and node_type = 'building'),
       count(*) filter (where parent_id is null and node_type = 'other'), count(*) filter (where parent_id is null and node_type not in ('building', 'other')),
       count(*) filter (where parent_id is null and quality.places_led_by_quality(project_id)), count(*) filter (where deleted_at is null),
       (select count(*) from pg_timezone_names where name = 'Europe/Moscow')
  from core.locations
order by 1;
