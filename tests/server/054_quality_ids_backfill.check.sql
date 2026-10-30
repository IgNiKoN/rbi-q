-- P2-0072 (054), часть 2 из 2 — после засева 054_quality_ids.seed.pglite.sql и 054_quality_ids_up.sql: у всех строк 41 таблицы
-- core_id заполнен и уникален; uuid-номер → core_id = id (у первой компании), тот же uuid в другой компании → другой core_id;
-- одинаковый текстовый номер в двух компаниях → разные core_id; время правки строк не изменилось; связи: совпавшие заполнены
-- (текст и uuid), висячие, пустые и ведущие в другую компанию — пусты, строки на месте. Отчёт — ERROR P0001 «FAIL всего: N»
-- и сводка «связи: совпало / не совпало / пусто».
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
do $$
declare
  ca constant uuid := '00000000-0000-4000-8000-0000000072a1';
  cb constant uuid := '00000000-0000-4000-8000-0000000072b1';
  u1 constant text := '72000000-0000-4000-8000-000000000001';
  res text := ''; t text; k text; n int; m int; a uuid; b uuid; r record; summary text := ''; v_ok int; v_bad int; v_empty int;
begin
  res := res || pg_temp.t((select count(*) from information_schema.columns where table_schema = 'quality' and column_name = 'core_id') = 41,
                          'core_id у 41 таблицы');
  for t in select table_name from information_schema.columns where table_schema = 'quality' and column_name = 'core_id' order by 1 loop
    k := case when t = 'allowed_projects' then 'code' else 'id' end;
    execute format('select count(*), count(distinct core_id) from quality.%I', t) into n, m;
    res := res || pg_temp.t(n > 0 and n = m, t || ': core_id заполнен и уникален — строк ' || n || ', номеров ' || m);
    execute format('select count(*) from quality.%I where core_id is null', t) into n;
    res := res || pg_temp.t(n = 0, t || ': строк без core_id ' || n);
    if k = 'id' and t not in ('contractor_directory', 'contractor_normalization_queue', 'file_registry', 'rbi_engineer_profiles',
                              'shared_report_templates') then
      execute format('select (select core_id from quality.%1$I where core_company_id = $1 and id = %2$L),
                             (select core_id from quality.%1$I where core_company_id = $2 and id = %2$L)', t, 'x1-m72') into a, b using ca, cb;
      res := res || pg_temp.t(a is not null and b is not null and a <> b, t || ': одинаковый текстовый номер в двух компаниях — разные core_id');
    end if;
    if k = 'id' then
      execute format('select (select core_id from quality.%1$I where core_company_id = $1 and id::text = %2$L),
                             (select core_id from quality.%1$I where core_company_id = $2 and id::text = %2$L)', t, u1) into a, b using ca, cb;
      res := res || pg_temp.t(a = u1::uuid, t || ': uuid-номер у первой компании — core_id = id (' || coalesce(a::text, 'пусто') || ')');
      res := res || pg_temp.t(b is not null and b <> u1::uuid, t || ': тот же uuid-номер у другой компании — новый core_id');
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = t and column_name = 'updated_at') then
      execute format('select count(*) from quality.%I where core_company_id in ($1, $2) and updated_at <> %L::timestamptz', t,
                     '2026-01-01T00:00:00Z') into n using ca, cb;
      res := res || pg_temp.t(n = 0, t || ': заполнение не тронуло время правки — изменено строк ' || n);
    end if;
  end loop;

  for r in select * from (values
      ('rbi_inspection_items', 'inspection_id', 'rbi_inspections', 'core_inspection_id'),
      ('rbi_inspection_photos', 'inspection_id', 'rbi_inspections', 'core_inspection_id'),
      ('shared_report_snapshots', 'report_id', 'shared_reports', 'core_report_id'),
      ('location_nodes', 'parentId', 'location_nodes', 'core_parent_id'),
      ('construction_buildings', 'object_id', 'construction_objects', 'core_construction_object_id'),
      ('construction_acceptance', 'object_id', 'construction_objects', 'core_construction_object_id'),
      ('construction_floors', 'building_id', 'construction_buildings', 'core_building_id'),
      ('construction_units', 'building_id', 'construction_buildings', 'core_building_id'),
      ('construction_units', 'floor_id', 'construction_floors', 'core_floor_id'),
      ('construction_acceptance', 'floor_id', 'construction_floors', 'core_floor_id'),
      ('construction_defects', 'floor_id', 'construction_floors', 'core_floor_id'),
      ('construction_floors_v2', 'locationId', 'location_nodes', 'core_location_node_id'),
      ('construction_units_v2', 'locationId', 'location_nodes', 'core_location_node_id'),
      ('construction_defects_v2', 'locationId', 'location_nodes', 'core_location_node_id'),
      ('construction_acceptance_v2', 'locationId', 'location_nodes', 'core_location_node_id'),
      ('contracts', 'contractorId', 'contractors', 'core_contractor_id')) v(child, ref, parent, col) loop
    execute format('select (select %2$I from quality.%1$I where core_company_id = $1 and id = %3$L),
                           (select core_id from quality.%4$I where core_company_id = $1 and id = %5$L)',
                   r.child, r.col, 'ok-' || r.ref || '-m72', r.parent, 'x1-m72') into a, b using ca;
    res := res || pg_temp.t(a is not null and a = b, r.child || '.' || r.ref || ': текстовая ссылка → core_id родителя той же компании');
    execute format('select %2$I from quality.%1$I where core_company_id = $1 and id = %3$L', r.child, r.col, 'uu-' || r.ref || '-m72')
      into a using ca;
    res := res || pg_temp.t(a = u1::uuid, r.child || '.' || r.ref || ': ссылка uuid-номером → тот же uuid');
    if r.child not in ('contracts', 'shared_report_snapshots') then
      execute format('select count(*) filter (where %2$I is null), count(*) from quality.%1$I where core_company_id = $1 and id in (%3$L, %4$L, %5$L)',
                     r.child, r.col, 'dg-' || r.ref || '-m72', 'em-' || r.ref || '-m72', 'cx-' || r.ref || '-m72') into n, m using ca;
      res := res || pg_temp.t(n = 3 and m = 3, r.child || '.' || r.ref || ': висячая, пустая и ведущая в другую компанию — пусто, строки на месте (' || n || '/' || m || ')');
    end if;
    -- сводка по всем строкам засева (для отчёта): совпало / не совпало / пусто
    execute format('select count(*) filter (where %2$I is not null), count(*) filter (where %2$I is null and nullif(%3$I, %4$L) is not null),
                           count(*) filter (where nullif(%3$I, %4$L) is null) from quality.%1$I where core_company_id in ($1, $2)',
                   r.child, r.col, r.ref, '') into v_ok, v_bad, v_empty using ca, cb;
    summary := summary || format('%s.%s: совпало %s, не совпало %s, пусто %s', r.child, r.ref, v_ok, v_bad, v_empty) || E'\n';
  end loop;
  raise exception E'%связи (засев):\n%FAIL всего: %', res, summary, (length(res) - length(replace(res, 'FAIL ', ''))) / 5 using errcode = 'P0001';
end $$;
