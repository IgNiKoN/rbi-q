-- P2-0072 (054), часть 1 из 2 — засев ДО миграции. Запуск — на схеме 053 (run-pglite.mjs --upto 053), затем
-- 054_quality_ids_up.sql, затем 054_quality_ids_backfill.check.sql. Помечено «-m72».
-- В каждой из 41 таблицы Качества: в компаниях А и Б — запись с одинаковым текстовым номером «x1-m72» и запись с одинаковым
-- uuid-номером (у А номер компании меньше — номер достаётся ей); у таблиц с id uuid — то же для uuid. Время правки — 01.01.2026.
-- Связи (16 пар «ребёнок → родитель»): у ребёнка в А — ссылки на запись А (текст и uuid), висячая, пустая и на запись только Б
-- (у договоров и снимков отчёта — только совпадающие: там уже есть внешний ключ по тексту).
create or replace function pg_temp.ins(t text, v jsonb) returns void language plpgsql as $f$
declare c record; cols text := ''; v_all jsonb := v;
begin
  for c in select column_name, data_type from information_schema.columns
            where table_schema = 'quality' and table_name = t and is_nullable = 'NO' and column_default is null and not (v ? column_name) loop
    v_all := v_all || jsonb_build_object(c.column_name, case
      when c.data_type in ('text', 'character varying') then to_jsonb('m72-' || substr(md5(random()::text), 1, 8))
      when c.data_type in ('integer', 'bigint', 'numeric', 'smallint', 'double precision', 'real') then to_jsonb(0)
      when c.data_type = 'boolean' then to_jsonb(false)
      when c.data_type in ('jsonb', 'json') then '{}'::jsonb
      when c.data_type = 'uuid' then to_jsonb(gen_random_uuid())
      when c.data_type like 'timestamp%' or c.data_type = 'date' then to_jsonb('2026-01-01T00:00:00Z'::text)
      when c.data_type = 'ARRAY' then '[]'::jsonb
      else to_jsonb(''::text) end);
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = t and column_name = 'updated_at') then
    v_all := v_all || '{"updated_at": "2026-01-01T00:00:00Z"}';
  end if;
  select string_agg(quote_ident(k), ', ') into cols from jsonb_object_keys(v_all) k;
  -- строки «как на сервере»: без сторожей таблицы (привязка объекта, автор, справочник подрядчиков)
  execute format('alter table quality.%I disable trigger user', t);
  execute format('insert into quality.%I (%s) select %s from jsonb_populate_record(null::quality.%I, $1)', t, cols, cols, t) using v_all;
  execute format('alter table quality.%I enable trigger user', t);
end $f$;

do $$
declare
  ca constant uuid := '00000000-0000-4000-8000-0000000072a1';
  cb constant uuid := '00000000-0000-4000-8000-0000000072b1';
  u1 constant text := '72000000-0000-4000-8000-000000000001';   -- uuid-номер в А и Б
  u2 constant text := '72000000-0000-4000-8000-000000000002';   -- uuid-номер только в Б
  t text; r record; uid boolean; ex jsonb;
begin
  insert into core.companies(id, name, is_test) values (ca, 'Альфа-m72', true), (cb, 'Бета-m72', true);
  for t in select table_name from information_schema.tables where table_schema = 'quality' and table_type = 'BASE TABLE'
             and table_name in ('allowed_projects', 'app_assistant_kb', 'construction_acceptance', 'construction_acceptance_v2',
               'construction_buildings', 'construction_defects', 'construction_defects_v2', 'construction_floors', 'construction_floors_v2',
               'construction_objects', 'construction_units', 'construction_units_v2', 'contractor_directory', 'contractor_normalization_queue',
               'contractors', 'contracts', 'file_registry', 'location_nodes', 'object_normalization_queue', 'project_fmea',
               'project_interventions', 'project_meetings', 'project_objects', 'project_schedule_stages', 'rbi_draft_sessions',
               'rbi_engineer_profiles', 'rbi_engineer_ratings', 'rbi_inspection_items', 'rbi_inspection_photos', 'rbi_inspections', 'rbi_tasks',
               'shared_checklists', 'shared_docs', 'shared_etalons', 'shared_feedback', 'shared_nodes', 'shared_practices',
               'shared_report_snapshots', 'shared_report_templates', 'shared_reports', 'shared_twi_cards')
           order by table_name = 'shared_report_snapshots', table_name loop
    -- ссылки с внешним ключом по тексту (договор → подрядчик, снимок → отчёт) — на запись «x1-m72» той же компании
    ex := case t when 'contracts' then '{"contractorId": "x1-m72"}' when 'shared_report_snapshots' then '{"report_id": "x1-m72"}' else '{}' end;
    if t = 'allowed_projects' then
      perform pg_temp.ins(t, jsonb_build_object('core_company_id', ca, 'code', 'x1-m72'));
      perform pg_temp.ins(t, jsonb_build_object('core_company_id', cb, 'code', 'x1-m72'));
      continue;
    end if;
    select data_type = 'uuid' into uid from information_schema.columns where table_schema = 'quality' and table_name = t and column_name = 'id';
    if not uid then
      perform pg_temp.ins(t, jsonb_build_object('core_company_id', ca, 'id', 'x1-m72') || ex);
      perform pg_temp.ins(t, jsonb_build_object('core_company_id', cb, 'id', 'x1-m72') || ex);
      perform pg_temp.ins(t, jsonb_build_object('core_company_id', cb, 'id', 'y1-m72') || ex);
    end if;
    perform pg_temp.ins(t, jsonb_build_object('core_company_id', ca, 'id', u1) || ex);
    perform pg_temp.ins(t, jsonb_build_object('core_company_id', cb, 'id', u1) || ex);
    perform pg_temp.ins(t, jsonb_build_object('core_company_id', cb, 'id', u2) || ex);
  end loop;
  -- связи: ребёнок в А ссылается на запись А (текст / uuid), висячая ссылка, пустая, ссылка на запись только Б
  for r in select * from (values
      ('rbi_inspection_items', 'inspection_id'), ('rbi_inspection_photos', 'inspection_id'), ('shared_report_snapshots', 'report_id'),
      ('location_nodes', 'parentId'), ('construction_buildings', 'object_id'), ('construction_acceptance', 'object_id'),
      ('construction_floors', 'building_id'), ('construction_units', 'building_id'), ('construction_units', 'floor_id'),
      ('construction_acceptance', 'floor_id'), ('construction_defects', 'floor_id'), ('construction_floors_v2', 'locationId'),
      ('construction_units_v2', 'locationId'), ('construction_defects_v2', 'locationId'), ('construction_acceptance_v2', 'locationId'),
      ('contracts', 'contractorId')) v(child, ref) loop
    perform pg_temp.ins(r.child, jsonb_build_object('core_company_id', ca, 'id', 'ok-' || r.ref || '-m72', r.ref, 'x1-m72'));
    perform pg_temp.ins(r.child, jsonb_build_object('core_company_id', ca, 'id', 'uu-' || r.ref || '-m72', r.ref, u1));
    -- у договоров и снимков отчёта ссылка уже с внешним ключом (текст + компания): висячих и чужих не бывает
    continue when r.child in ('contracts', 'shared_report_snapshots');
    perform pg_temp.ins(r.child, jsonb_build_object('core_company_id', ca, 'id', 'dg-' || r.ref || '-m72', r.ref, 'nope-m72'));
    perform pg_temp.ins(r.child, jsonb_build_object('core_company_id', ca, 'id', 'em-' || r.ref || '-m72', r.ref, ''));
    perform pg_temp.ins(r.child, jsonb_build_object('core_company_id', ca, 'id', 'cx-' || r.ref || '-m72', r.ref, 'y1-m72'));
  end loop;
end $$;
