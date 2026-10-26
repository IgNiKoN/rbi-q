-- P2-0018 этап 3 (ТД №120). Ключи записей Качества — по компании: в каждый первичный ключ, уникальное ограничение
-- и уникальный индекс раздела quality без компании добавлен первым столбец core_company_id (как у sk_records:
-- (core_company_id, sk_unique_key)). Одинаковый id / project_code / code в двух компаниях больше не мешает друг другу
-- и не выдаёт факт существования чужой записи. Затронуто 55 таблиц: 58 ключей и ограничений, 17 уникальных индексов
-- (список — из структуры 018). Данные не меняются. Клиент: мост Качества дописывает core_company_id в цель upsert
-- (onConflict) — quality-bridge.ts. Серверная вставка справочника подрядчиков (push_contractor, 018e) — по новому ключу.
-- Применять после 020, одним запросом. Откат — 021_quality_keys_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.row_visible(uuid,uuid,text[],text,uuid,uuid,text,text)') is null then
    raise exception '021: сначала 020_quality_scope_up.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_constraint where conname = 'allowed_projects_pkey' and conrelid = 'quality.allowed_projects'::regclass
             and pg_get_constraintdef(oid) like '%core_company_id%') then
    raise exception '021 уже применена (повтор — только после 021_quality_keys_down.sql)' using errcode = 'P0001';
  end if;
end $$;

alter table quality.allowed_projects drop constraint allowed_projects_pkey, add constraint allowed_projects_pkey PRIMARY KEY (core_company_id, code);
alter table quality.app_assistant_kb drop constraint app_assistant_kb_pkey, add constraint app_assistant_kb_pkey PRIMARY KEY (core_company_id, id);
alter table quality.construction_acceptance drop constraint construction_acceptance_pkey, add constraint construction_acceptance_pkey PRIMARY KEY (core_company_id, id);
alter table quality.construction_acceptance_v2 drop constraint construction_acceptance_v2_pkey, add constraint construction_acceptance_v2_pkey PRIMARY KEY (core_company_id, id);
alter table quality.construction_buildings drop constraint construction_buildings_pkey, add constraint construction_buildings_pkey PRIMARY KEY (core_company_id, id);
alter table quality.construction_defects drop constraint construction_defects_pkey, add constraint construction_defects_pkey PRIMARY KEY (core_company_id, id);
alter table quality.construction_defects_v2 drop constraint construction_defects_v2_pkey, add constraint construction_defects_v2_pkey PRIMARY KEY (core_company_id, id);
alter table quality.construction_floors drop constraint construction_floors_pkey, add constraint construction_floors_pkey PRIMARY KEY (core_company_id, id);
alter table quality.construction_floors_v2 drop constraint construction_floors_v2_pkey, add constraint construction_floors_v2_pkey PRIMARY KEY (core_company_id, id);
alter table quality.construction_objects drop constraint construction_objects_pkey, add constraint construction_objects_pkey PRIMARY KEY (core_company_id, id);
alter table quality.construction_units drop constraint construction_units_pkey, add constraint construction_units_pkey PRIMARY KEY (core_company_id, id);
alter table quality.construction_units_v2 drop constraint construction_units_v2_pkey, add constraint construction_units_v2_pkey PRIMARY KEY (core_company_id, id);
alter table quality.contractor_aliases drop constraint contractor_aliases_pkey, add constraint contractor_aliases_pkey PRIMARY KEY (core_company_id, id);
alter table quality.contractor_directory drop constraint contractor_directory_pkey, add constraint contractor_directory_pkey PRIMARY KEY (core_company_id, id);
alter table quality.contractor_normalization_queue drop constraint contractor_normalization_queue_pkey, add constraint contractor_normalization_queue_pkey PRIMARY KEY (core_company_id, id);
alter table quality.contractors drop constraint contractors_pkey, add constraint contractors_pkey PRIMARY KEY (core_company_id, id);
alter table quality.contracts drop constraint contracts_pkey, add constraint contracts_pkey PRIMARY KEY (core_company_id, id);
alter table quality.file_registry drop constraint file_registry_bucket_storage_path_key, add constraint file_registry_bucket_storage_path_key UNIQUE (core_company_id, bucket, storage_path);
alter table quality.file_registry drop constraint file_registry_pkey, add constraint file_registry_pkey PRIMARY KEY (core_company_id, id);
alter table quality.location_node_aliases drop constraint location_node_aliases_pkey, add constraint location_node_aliases_pkey PRIMARY KEY (core_company_id, id);
alter table quality.location_nodes drop constraint location_nodes_pkey, add constraint location_nodes_pkey PRIMARY KEY (core_company_id, id);
alter table quality.object_aliases drop constraint object_aliases_pkey, add constraint object_aliases_pkey PRIMARY KEY (core_company_id, id);
alter table quality.object_normalization_queue drop constraint object_normalization_queue_pkey, add constraint object_normalization_queue_pkey PRIMARY KEY (core_company_id, id);
alter table quality.project_fmea drop constraint project_fmea_pkey, add constraint project_fmea_pkey PRIMARY KEY (core_company_id, id);
alter table quality.project_interventions drop constraint project_interventions_pkey, add constraint project_interventions_pkey PRIMARY KEY (core_company_id, id);
alter table quality.project_meetings drop constraint project_meetings_pkey, add constraint project_meetings_pkey PRIMARY KEY (core_company_id, id);
alter table quality.project_objects drop constraint project_objects_pkey, add constraint project_objects_pkey PRIMARY KEY (core_company_id, id);
alter table quality.project_schedule_stages drop constraint project_schedule_stages_pkey, add constraint project_schedule_stages_pkey PRIMARY KEY (core_company_id, id);
alter table quality.project_settings drop constraint project_settings_pkey, add constraint project_settings_pkey PRIMARY KEY (core_company_id, project_code);
alter table quality.rbi_company_settings drop constraint rbi_company_settings_pkey, add constraint rbi_company_settings_pkey PRIMARY KEY (core_company_id, company_id);
alter table quality.rbi_draft_sessions drop constraint rbi_draft_sessions_pkey, add constraint rbi_draft_sessions_pkey PRIMARY KEY (core_company_id, id);
alter table quality.rbi_engineer_profiles drop constraint rbi_engineer_profiles_inspector_id_key, add constraint rbi_engineer_profiles_inspector_id_key UNIQUE (core_company_id, inspector_id);
alter table quality.rbi_engineer_profiles drop constraint rbi_engineer_profiles_pkey, add constraint rbi_engineer_profiles_pkey PRIMARY KEY (core_company_id, id);
alter table quality.rbi_engineer_ratings drop constraint rbi_engineer_ratings_pkey, add constraint rbi_engineer_ratings_pkey PRIMARY KEY (core_company_id, id);
alter table quality.rbi_engineer_ratings drop constraint rbi_engineer_ratings_project_code_engineer_name_key, add constraint rbi_engineer_ratings_project_code_engineer_name_key UNIQUE (core_company_id, project_code, engineer_name);
alter table quality.rbi_error_logs drop constraint rbi_error_logs_pkey, add constraint rbi_error_logs_pkey PRIMARY KEY (core_company_id, id);
alter table quality.rbi_inspection_items drop constraint rbi_inspection_items_pkey, add constraint rbi_inspection_items_pkey PRIMARY KEY (core_company_id, id);
alter table quality.rbi_inspection_photos drop constraint rbi_inspection_photos_pkey, add constraint rbi_inspection_photos_pkey PRIMARY KEY (core_company_id, id);
alter table quality.rbi_inspections drop constraint rbi_inspections_pkey, add constraint rbi_inspections_pkey PRIMARY KEY (core_company_id, id);
alter table quality.rbi_sync_queue drop constraint rbi_sync_queue_pkey, add constraint rbi_sync_queue_pkey PRIMARY KEY (core_company_id, id);
alter table quality.rbi_tasks drop constraint rbi_tasks_pkey, add constraint rbi_tasks_pkey PRIMARY KEY (core_company_id, id);
alter table quality.shared_checklists drop constraint shared_checklists_pkey, add constraint shared_checklists_pkey PRIMARY KEY (core_company_id, id);
alter table quality.shared_docs drop constraint shared_docs_pkey, add constraint shared_docs_pkey PRIMARY KEY (core_company_id, id);
alter table quality.shared_etalons drop constraint shared_etalons_pkey, add constraint shared_etalons_pkey PRIMARY KEY (core_company_id, id);
alter table quality.shared_feedback drop constraint shared_feedback_pkey, add constraint shared_feedback_pkey PRIMARY KEY (core_company_id, id);
alter table quality.shared_nodes drop constraint shared_nodes_pkey, add constraint shared_nodes_pkey PRIMARY KEY (core_company_id, id);
alter table quality.shared_practices drop constraint shared_practices_pkey, add constraint shared_practices_pkey PRIMARY KEY (core_company_id, id);
alter table quality.shared_report_snapshots drop constraint shared_report_snapshots_pkey, add constraint shared_report_snapshots_pkey PRIMARY KEY (core_company_id, id);
alter table quality.shared_report_templates drop constraint shared_report_templates_pkey, add constraint shared_report_templates_pkey PRIMARY KEY (core_company_id, id);
alter table quality.shared_reports drop constraint shared_reports_pkey, add constraint shared_reports_pkey PRIMARY KEY (core_company_id, id);
alter table quality.shared_twi_cards drop constraint shared_twi_cards_pkey, add constraint shared_twi_cards_pkey PRIMARY KEY (core_company_id, id);
alter table quality.sk_category_map drop constraint sk_category_map_pkey, add constraint sk_category_map_pkey PRIMARY KEY (core_company_id, id);
alter table quality.sk_contractor_map drop constraint sk_contractor_map_pkey, add constraint sk_contractor_map_pkey PRIMARY KEY (core_company_id, id);
alter table quality.sk_data_bundles drop constraint sk_data_bundles_pkey, add constraint sk_data_bundles_pkey PRIMARY KEY (core_company_id, id);
alter table quality.sk_import_batches drop constraint sk_import_batches_pkey, add constraint sk_import_batches_pkey PRIMARY KEY (core_company_id, id);
alter table quality.sk_mapping drop constraint sk_mapping_pkey, add constraint sk_mapping_pkey PRIMARY KEY (core_company_id, id);
alter table quality.sk_records drop constraint sk_records_pkey, add constraint sk_records_pkey PRIMARY KEY (core_company_id, id);
alter table quality.sk_volumes drop constraint sk_volumes_pkey, add constraint sk_volumes_pkey PRIMARY KEY (core_company_id, id);
drop index quality.contractor_aliases_project_code_raw_name_uidx; CREATE UNIQUE INDEX contractor_aliases_project_code_raw_name_uidx ON quality.contractor_aliases USING btree (core_company_id, project_code, raw_name);
drop index quality.idx_contractor_aliases_unique; CREATE UNIQUE INDEX idx_contractor_aliases_unique ON quality.contractor_aliases USING btree (core_company_id, project_code, raw_name);
drop index quality.contractor_directory_project_code_canonical_key_uidx; CREATE UNIQUE INDEX contractor_directory_project_code_canonical_key_uidx ON quality.contractor_directory USING btree (core_company_id, project_code, canonical_key);
drop index quality.idx_contractor_directory_key; CREATE UNIQUE INDEX idx_contractor_directory_key ON quality.contractor_directory USING btree (core_company_id, project_code, canonical_key) WHERE (is_deleted = false);
drop index quality.contractor_queue_project_code_raw_name_uidx; CREATE UNIQUE INDEX contractor_queue_project_code_raw_name_uidx ON quality.contractor_normalization_queue USING btree (core_company_id, project_code, raw_name);
drop index quality.idx_contractor_queue_project_raw_name; CREATE UNIQUE INDEX idx_contractor_queue_project_raw_name ON quality.contractor_normalization_queue USING btree (core_company_id, project_code, raw_name);
drop index quality.idx_object_aliases_project_raw; CREATE UNIQUE INDEX idx_object_aliases_project_raw ON quality.object_aliases USING btree (core_company_id, project_code, raw_name);
drop index quality.idx_object_aliases_unique; CREATE UNIQUE INDEX idx_object_aliases_unique ON quality.object_aliases USING btree (core_company_id, project_code, raw_name);
drop index quality.object_queue_project_code_raw_name_uidx; CREATE UNIQUE INDEX object_queue_project_code_raw_name_uidx ON quality.object_normalization_queue USING btree (core_company_id, project_code, raw_name);
drop index quality.idx_project_objects_project_key; CREATE UNIQUE INDEX idx_project_objects_project_key ON quality.project_objects USING btree (core_company_id, project_code, canonical_key) WHERE (COALESCE(is_deleted, false) = false);
drop index quality.idx_project_objects_unique_key; CREATE UNIQUE INDEX idx_project_objects_unique_key ON quality.project_objects USING btree (core_company_id, project_code, canonical_key) WHERE (is_deleted = false);
drop index quality.idx_rbi_profiles_inspector_id; CREATE UNIQUE INDEX idx_rbi_profiles_inspector_id ON quality.rbi_engineer_profiles USING btree (core_company_id, inspector_id);
drop index quality.idx_rbi_profiles_project_engineer; CREATE UNIQUE INDEX idx_rbi_profiles_project_engineer ON quality.rbi_engineer_profiles USING btree (core_company_id, project_code, engineer_name);
drop index quality.rbi_engineer_profiles_inspector_id_uidx; CREATE UNIQUE INDEX rbi_engineer_profiles_inspector_id_uidx ON quality.rbi_engineer_profiles USING btree (core_company_id, inspector_id);
drop index quality.rbi_engineer_profiles_project_inspector_uidx; CREATE UNIQUE INDEX rbi_engineer_profiles_project_inspector_uidx ON quality.rbi_engineer_profiles USING btree (core_company_id, project_code, inspector_id);
drop index quality.idx_rbi_ratings_project_engineer; CREATE UNIQUE INDEX idx_rbi_ratings_project_engineer ON quality.rbi_engineer_ratings USING btree (core_company_id, project_code, engineer_name);
drop index quality.idx_sk_records_project_number; CREATE UNIQUE INDEX idx_sk_records_project_number ON quality.sk_records USING btree (core_company_id, project_code, sk_number);

-- Ядро → Качество: строка справочника подрядчиков — по ключу (компания, объект, ключ подрядчика).
create or replace function quality.push_contractor(p_cp core.counterparties)
returns void language plpgsql security definer set search_path = pg_catalog, core as $$
declare v_key text;
begin
  if p_cp.id is null or not ('contractor' = any(p_cp.kinds)) or p_cp.deleted_at is not null or p_cp.archived_at is not null then return; end if;
  select canonical_key into v_key from quality.contractor_core_links where counterparty_id = p_cp.id limit 1;
  if v_key is null then
    v_key := quality.contractor_key(p_cp.name);
    insert into quality.contractor_core_links(core_company_id, canonical_key, counterparty_id) values (p_cp.company_id, v_key, p_cp.id)
    on conflict (core_company_id, canonical_key) do nothing;
    select canonical_key into v_key from quality.contractor_core_links where counterparty_id = p_cp.id limit 1;
    if v_key is null then return; end if;   -- ключ уже занят другим контрагентом (тёзка) — без справочника Качества
  end if;
  insert into quality.contractor_directory(project_code, canonical_key, display_name, inn, created_by, core_company_id)
  select pr.id::text, v_key, p_cp.name, p_cp.inn, 'Контрагенты', p_cp.company_id
  from core.projects pr where pr.company_id = p_cp.company_id and pr.archived_at is null
  on conflict (core_company_id, project_code, canonical_key) do update set display_name = excluded.display_name, inn = excluded.inn,
    is_deleted = false, updated_at = now();
end $$;

commit;
