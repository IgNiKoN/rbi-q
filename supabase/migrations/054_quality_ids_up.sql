-- P2-0072 (CRITICAL — синхронизация; миграция только добавляющая): номера Качества по стандарту — мост «uuid рядом».
--  1) у 41 таблицы Качества (карта P2-0069, шаг К1) рядом со старым номером — колонка core_id uuid not null, уникальная.
--     Заполнение: номер уже вида uuid (новые записи с телефона, таблицы с id uuid, места из ядра) — он же; иначе gen_random_uuid().
--     Один и тот же uuid-номер в двух компаниях — первой компании он же, остальным — новый (core_id уникален во всей таблице);
--  2) связи (шаг К6 и опись этапа 2) — рядом core_<связь>_id uuid: заполнение по совпадению текстовой ссылки в той же компании;
--     несовпавшие ссылки не стираются (core_<связь>_id пуст), их число — в пробе scripts/p2-0072/01_dryrun.sql;
--     внешний ключ на core_id родителя (on delete set null) — у всех 16 связей: связь заполнена только при совпадении, поэтому
--     строки не теряются, удаление родителя связь очищает (места в приложении физически не удаляются — §9 п. 2);
--  3) сторож quality.core_ids_stamp (последним из BEFORE): вставка без core_id — заполняет (повтор upsert существующей записи —
--     её прежний core_id; новая запись с уже занятым core_id — копия записи — получает свой); правка — core_id не меняется: пусто → прежний, другой → отказ 22023 с текстом; id вида uuid и
--     другой core_id → отказ (кроме uuid-номера, занятого записью другой компании); связи держит в согласии с текстовой ссылкой;
--  4) родитель появился позже ребёнка (пакет мест в любом порядке) — quality.core_ids_children дописывает связь детям
--     (сбой дозаписи не мешает записи родителя: связь заполнится при следующей правке ребёнка).
-- Старый текстовый id остаётся ключом синхронизации (onConflict) до «Уборки» P2-0063. Индексы, правила RLS, права и функции
-- 052/053 не меняются. Применять одним запросом, ДО выкладки приложения. Откат — 054_quality_ids_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.quality_rights_guard()') is null then
    raise exception '054: сначала 053_quality_rights_up.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = 'rbi_inspections'
               and column_name = 'core_id') then
    raise exception '054 уже применена (повтор — только после 054_quality_ids_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Сторож номеров: core_id и связи по uuid. Аргументы триггера: ключ строки ('id' | 'code'), затем тройки
--    (колонка-ссылка текстом, таблица Качества, колонка связи uuid).
create function quality.core_ids_stamp()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_code constant boolean := tg_argv[0] = 'code';
  v_key text; v_prev uuid; v_taken boolean; v_ref text; v_link uuid; v_patch jsonb := '{}'; n jsonb; o jsonb; i int := 1;
begin
  if tg_op = 'UPDATE' then
    if new.core_id is null then
      new.core_id := old.core_id;
    elsif new.core_id <> old.core_id then
      raise exception 'Номер записи менять нельзя (core_id % → %)', old.core_id, new.core_id using errcode = '22023';
    end if;
  else
    -- повтор существующей записи (upsert): её прежний номер
    if v_code then
      execute format('select core_id from %I.%I where core_company_id = $1 and code = $2', tg_table_schema, tg_table_name)
        into v_prev using new.core_company_id, new.code;
    else
      v_key := new.id::text;
      execute format('select core_id from %I.%I where core_company_id = $1 and id = $2', tg_table_schema, tg_table_name)
        into v_prev using new.core_company_id, new.id;
    end if;
    if v_prev is not null then
      new.core_id := coalesce(new.core_id, v_prev);
    else
      -- новая запись с чужим (уже занятым) номером — копия записи в другую компанию или «копировать» на телефоне: свой номер
      if new.core_id is not null then
        execute format('select exists (select 1 from %I.%I where core_id = $1)', tg_table_schema, tg_table_name)
          into v_taken using new.core_id;
        if v_taken then new.core_id := null; end if;
      end if;
      if not v_code and v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        execute format('select exists (select 1 from %I.%I where core_id = $1)', tg_table_schema, tg_table_name)
          into v_taken using v_key::uuid;
        if new.core_id is null then
          new.core_id := case when v_taken then gen_random_uuid() else v_key::uuid end;
        elsif new.core_id <> v_key::uuid and not v_taken then
          raise exception 'Номер записи (core_id %) не совпадает с её uuid-номером %', new.core_id, v_key using errcode = '22023';
        end if;
      elsif new.core_id is null then
        new.core_id := gen_random_uuid();
      end if;
    end if;
  end if;
  -- связи: текстовая ссылка → core_id записи той же компании (нет такой — пусто)
  if tg_nargs > 1 then
    n := to_jsonb(new);
    if tg_op = 'UPDATE' then o := to_jsonb(old); end if;
    while i + 2 < tg_nargs loop
      v_ref := nullif(n ->> tg_argv[i], '');
      if tg_op = 'INSERT' or (n -> tg_argv[i]) is distinct from (o -> tg_argv[i]) or n ->> tg_argv[i + 2] is null
         or (n -> tg_argv[i + 2]) is distinct from (o -> tg_argv[i + 2]) then
        v_link := null;
        if v_ref is not null then
          execute format('select core_id from quality.%I where core_company_id = $1 and id = $2', tg_argv[i + 1])
            into v_link using new.core_company_id, v_ref;
        end if;
        if (n ->> tg_argv[i + 2])::uuid is distinct from v_link then
          v_patch := v_patch || jsonb_build_object(tg_argv[i + 2], v_link);
        end if;
      end if;
      i := i + 3;
    end loop;
    if v_patch <> '{}' then new := jsonb_populate_record(new, v_patch); end if;
  end if;
  return new;
end $$;
comment on function quality.core_ids_stamp() is 'P2-0072: core_id записи Качества (uuid рядом со старым номером) и связи по uuid; core_id не меняется';

-- Родитель записан позже ребёнка: дописать связь детям. Аргументы — тройки (таблица ребёнка, колонка-ссылка, колонка связи).
create function quality.core_ids_children()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare i int := 0;
begin
  while i + 2 < tg_nargs loop
    begin
      execute format('update quality.%I set %I = $1 where core_company_id = $2 and %I = $3 and %I is null',
                     tg_argv[i], tg_argv[i + 2], tg_argv[i + 1], tg_argv[i + 2])
        using new.core_id, new.core_company_id, new.id::text;
    exception when others then
      null;   -- ребёнка охраняет сторож прав: связь заполнится при следующей правке ребёнка (quality.core_ids_stamp)
    end;
    i := i + 3;
  end loop;
  return null;
end $$;
comment on function quality.core_ids_children() is 'P2-0072: родитель записан позже ребёнка — дописать детям связь по uuid';
revoke all on function quality.core_ids_stamp(), quality.core_ids_children() from public, anon, authenticated;

-- 2. core_id у 41 таблицы: заполнение без сторожей таблицы (время правки и автор строк не меняются).
do $$
declare
  t text; k text; v_uuid boolean;
  tabs constant text[] := array['allowed_projects', 'app_assistant_kb', 'construction_acceptance', 'construction_acceptance_v2',
    'construction_buildings', 'construction_defects', 'construction_defects_v2', 'construction_floors', 'construction_floors_v2',
    'construction_objects', 'construction_units', 'construction_units_v2', 'contractor_directory', 'contractor_normalization_queue',
    'contractors', 'contracts', 'file_registry', 'location_nodes', 'object_normalization_queue', 'project_fmea',
    'project_interventions', 'project_meetings', 'project_objects', 'project_schedule_stages', 'rbi_draft_sessions',
    'rbi_engineer_profiles', 'rbi_engineer_ratings', 'rbi_inspection_items', 'rbi_inspection_photos', 'rbi_inspections', 'rbi_tasks',
    'shared_checklists', 'shared_docs', 'shared_etalons', 'shared_feedback', 'shared_nodes', 'shared_practices',
    'shared_report_snapshots', 'shared_report_templates', 'shared_reports', 'shared_twi_cards'];
begin
  foreach t in array tabs loop
    k := case when t = 'allowed_projects' then 'code' else 'id' end;
    execute format('alter table quality.%I add column core_id uuid', t);
    execute format('alter table quality.%I disable trigger user', t);
    if k = 'id' then
      -- uuid-номер: первой компании (по номеру компании) — он же, повтор того же номера в другой компании — новый
      execute format($q$
        update quality.%1$I x set core_id = x.id::text::uuid
          from (select distinct on (lower(id::text)) core_company_id, id from quality.%1$I
                 where id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 order by lower(id::text), core_company_id) f
         where x.core_company_id = f.core_company_id and x.id = f.id$q$, t);
    end if;
    execute format('update quality.%I set core_id = gen_random_uuid() where core_id is null', t);
    execute format('alter table quality.%I alter column core_id set not null', t);
    execute format('alter table quality.%I add constraint %I unique (core_id)', t, t || '_core_id_key');
    execute format('comment on column quality.%I.core_id is %L', t,
                   'P2-0072: устойчивый номер записи (uuid) рядом со старым ' || k || ' — ключ после «Уборки» P2-0063; не меняется');
    execute format('alter table quality.%I enable trigger user', t);
  end loop;
end $$;

-- 3. Связи по uuid рядом с текстовыми ссылками (опись — reports/P2-0072/executor-1.md).
do $$
declare
  r record;
begin
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
    execute format('alter table quality.%I add column %I uuid', r.child, r.col);
    execute format('alter table quality.%I disable trigger user', r.child);
    execute format('update quality.%I c set %I = p.core_id from quality.%I p
                     where p.core_company_id = c.core_company_id and p.id = c.%I and nullif(c.%I, %L) is not null',
                   r.child, r.col, r.parent, r.ref, r.ref, '');
    execute format('alter table quality.%I enable trigger user', r.child);
    execute format('create index %I on quality.%I (%I) where %I is not null', r.child || '_' || r.col || '_idx', r.child, r.col, r.col);
    execute format('alter table quality.%I add constraint %I foreign key (%I) references quality.%I (core_id) on delete set null',
                   r.child, r.child || '_' || r.col || '_fk', r.col, r.parent);
    execute format('comment on column quality.%I.%I is %L', r.child, r.col,
                   format('P2-0072: связь по uuid рядом с %s (core_id записи %s той же компании; не совпало — пусто)', r.ref, r.parent));
  end loop;
end $$;

-- 4. Сторожа: «zzzz_» — последним из BEFORE (после привязки компании и сторожей прав: они не видят служебных колонок моста).
do $$
declare
  t text;
  links constant jsonb := jsonb_build_object(
    'rbi_inspection_items', jsonb_build_array('inspection_id', 'rbi_inspections', 'core_inspection_id'),
    'rbi_inspection_photos', jsonb_build_array('inspection_id', 'rbi_inspections', 'core_inspection_id'),
    'shared_report_snapshots', jsonb_build_array('report_id', 'shared_reports', 'core_report_id'),
    'location_nodes', jsonb_build_array('parentId', 'location_nodes', 'core_parent_id'),
    'construction_buildings', jsonb_build_array('object_id', 'construction_objects', 'core_construction_object_id'),
    'construction_acceptance', jsonb_build_array('object_id', 'construction_objects', 'core_construction_object_id',
                                                 'floor_id', 'construction_floors', 'core_floor_id'),
    'construction_floors', jsonb_build_array('building_id', 'construction_buildings', 'core_building_id'),
    'construction_units', jsonb_build_array('building_id', 'construction_buildings', 'core_building_id',
                                            'floor_id', 'construction_floors', 'core_floor_id'),
    'construction_defects', jsonb_build_array('floor_id', 'construction_floors', 'core_floor_id'),
    'construction_floors_v2', jsonb_build_array('locationId', 'location_nodes', 'core_location_node_id'),
    'construction_units_v2', jsonb_build_array('locationId', 'location_nodes', 'core_location_node_id'),
    'construction_defects_v2', jsonb_build_array('locationId', 'location_nodes', 'core_location_node_id'),
    'construction_acceptance_v2', jsonb_build_array('locationId', 'location_nodes', 'core_location_node_id'),
    'contracts', jsonb_build_array('contractorId', 'contractors', 'core_contractor_id'));
  kids constant jsonb := jsonb_build_object(
    'rbi_inspections', jsonb_build_array('rbi_inspection_items', 'inspection_id', 'core_inspection_id',
                                         'rbi_inspection_photos', 'inspection_id', 'core_inspection_id'),
    'shared_reports', jsonb_build_array('shared_report_snapshots', 'report_id', 'core_report_id'),
    'location_nodes', jsonb_build_array('location_nodes', 'parentId', 'core_parent_id',
                                        'construction_floors_v2', 'locationId', 'core_location_node_id',
                                        'construction_units_v2', 'locationId', 'core_location_node_id',
                                        'construction_defects_v2', 'locationId', 'core_location_node_id',
                                        'construction_acceptance_v2', 'locationId', 'core_location_node_id'),
    'construction_objects', jsonb_build_array('construction_buildings', 'object_id', 'core_construction_object_id',
                                              'construction_acceptance', 'object_id', 'core_construction_object_id'),
    'construction_buildings', jsonb_build_array('construction_floors', 'building_id', 'core_building_id',
                                                'construction_units', 'building_id', 'core_building_id'),
    'construction_floors', jsonb_build_array('construction_units', 'floor_id', 'core_floor_id',
                                             'construction_acceptance', 'floor_id', 'core_floor_id',
                                             'construction_defects', 'floor_id', 'core_floor_id'),
    'contractors', jsonb_build_array('contracts', 'contractorId', 'core_contractor_id'));
  args text;
begin
  for t in select c.table_name from information_schema.columns c
            where c.table_schema = 'quality' and c.column_name = 'core_id' order by 1 loop
    select string_agg(quote_literal(a), ', ' order by o) into args
      from jsonb_array_elements_text(jsonb_build_array(case when t = 'allowed_projects' then 'code' else 'id' end)
                                     || coalesce(links -> t, '[]')) with ordinality e(a, o);
    execute format('create trigger zzzz_core_ids before insert or update on quality.%I for each row execute function quality.core_ids_stamp(%s)',
                   t, args);
    if kids ? t then
      select string_agg(quote_literal(a), ', ' order by o) into args from jsonb_array_elements_text(kids -> t) with ordinality e(a, o);
      execute format('create trigger zzzz_core_ids_children after insert on quality.%I for each row execute function quality.core_ids_children(%s)',
                     t, args);
    end if;
  end loop;
end $$;

do $$
begin
  if (select count(*) from information_schema.columns where table_schema = 'quality' and column_name = 'core_id') <> 41 then
    raise exception '054: core_id должен появиться у 41 таблицы Качества' using errcode = 'P0001';
  end if;
end $$;

commit;
