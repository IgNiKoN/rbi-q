-- P2-0072 (054) откат: снять мост «uuid рядом» у 41 таблицы Качества — сторожа номеров, колонки core_id и
-- core_<связь>_id (с их внешними ключами и индексами), функции quality.core_ids_stamp / core_ids_children. Старые номера и данные записей не меняются.
-- Номера-uuid новых записей с телефона остаются в старой колонке id (текстом) — приложение до P2-0072 их принимает.
-- Применять одним запросом, после возврата прежнего сайта.
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = 'rbi_inspections'
                   and column_name = 'core_id') then
    raise exception '054 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
end $$;

do $$
declare r record;
begin
  for r in select c.relname from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'quality' and g.tgname in ('zzzz_core_ids', 'zzzz_core_ids_children') group by c.relname loop
    execute format('drop trigger if exists zzzz_core_ids on quality.%I', r.relname);
    execute format('drop trigger if exists zzzz_core_ids_children on quality.%I', r.relname);
  end loop;
end $$;

-- связи (с их внешними ключами и индексами) — раньше core_id: на core_id ссылаются внешние ключи
do $$
declare r record;
begin
  for r in select table_name, column_name from information_schema.columns
            where table_schema = 'quality'
              and column_name in ('core_inspection_id', 'core_report_id', 'core_parent_id', 'core_construction_object_id',
                                  'core_building_id', 'core_floor_id', 'core_location_node_id', 'core_contractor_id', 'core_id')
            order by (column_name = 'core_id'), table_name, column_name loop
    execute format('alter table quality.%I drop column %I', r.table_name, r.column_name);
  end loop;
end $$;

drop function quality.core_ids_stamp();
drop function quality.core_ids_children();

commit;
