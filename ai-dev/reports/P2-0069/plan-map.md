<!-- создано plan-map.mjs: красных 145, все с шагом -->
| Таблица | Правило | Что не так | Шаг |
|---|---|---|---|
| `core.companies` | Автор created_by uuid | нет created_by uuid | Я1 |
| `core.company_roles` | Автор created_by uuid | нет created_by uuid | Я1 |
| `core.counterparties` | Автор created_by uuid | нет created_by uuid | Я1 |
| `core.divisions` | Удаление — пометка deleted_at | нет deleted_at; есть archived_at — это не удаление | Я1 |
| `core.projects` | Автор created_by uuid | нет created_by uuid | Я1 |
| `planfact.brigades` | Время с часовым поясом | нет updated_at | ПФ4 |
| `planfact.brigades` | Удаление — пометка deleted_at | нет deleted_at; есть archived_at — это не удаление | ПФ4 |
| `planfact.estimate_rows` | Деньги — numeric и валюта | нет валюты (суммы: price_labor, price_material) | ПФ3 |
| `planfact.estimates` | Удаление — пометка deleted_at | нет deleted_at | ПФ2 |
| `planfact.fact_submissions` | Ссылки — uuid с внешним ключом | нет внешнего ключа (company_id, project_id) | ПФ4 |
| `planfact.kp_revisions` | Ссылки — uuid с внешним ключом | нет внешнего ключа (company_id) | ПФ2 |
| `planfact.kp_revisions` | Деньги — numeric и валюта | нет валюты (суммы: total) | ПФ3 |
| `planfact.ks2_acts` | Время с часовым поясом | нет updated_at | ПФ2 |
| `planfact.ks2_acts` | Удаление — пометка deleted_at | нет deleted_at | ПФ2 |
| `planfact.ks2_revisions` | Ссылки — uuid с внешним ключом | нет внешнего ключа (company_id) | ПФ2 |
| `planfact.ks2_revisions` | Деньги — numeric и валюта | нет валюты (суммы: total) | ПФ3 |
| `planfact.ks2_settings` | Время с часовым поясом | нет created_at | ПФ2 |
| `planfact.overhead_lines` | Ссылки — uuid с внешним ключом | нет внешнего ключа (company_id) | ПФ2 |
| `planfact.overhead_templates` | Автор created_by uuid | нет created_by uuid (есть updated_by) | ПФ2 |
| `planfact.overhead_templates` | Время с часовым поясом | нет created_at | ПФ2 |
| `planfact.overhead_templates` | Удаление — пометка deleted_at | нет deleted_at | ПФ2 |
| `planfact.price_history` | Деньги — numeric и валюта | нет валюты (суммы: old_labor, new_labor, old_material, new_material) | ПФ3 |
| `planfact.price_items` | Деньги — numeric и валюта | нет валюты (суммы: price_labor, price_material) | ПФ3 |
| `planfact.vor_dictionary` | Автор created_by uuid | нет created_by uuid (есть confirmed_by) | ПФ1 |
| `planfact.vor_dictionary` | Время с часовым поясом | нет created_at; нет updated_at | ПФ1 |
| `planfact.vor_dictionary` | Удаление — пометка deleted_at | нет deleted_at | ПФ1 |
| `planfact.vor_heads` | Время с часовым поясом | нет created_at; нет updated_at | ПФ1 |
| `planfact.vor_imports` | Время с часовым поясом | нет updated_at | ПФ1 |
| `planfact.vor_imports` | Удаление — пометка deleted_at | нет deleted_at | ПФ1 |
| `planfact.vor_links` | Ссылки — uuid с внешним ключом | нет внешнего ключа (project_id) | ПФ1 |
| `planfact.vor_positions` | Время с часовым поясом | нет updated_at | ПФ1 |
| `planfact.vor_positions` | Удаление — пометка deleted_at | нет deleted_at | ПФ1 |
| `planfact.vor_positions` | Ссылки — uuid с внешним ключом | нет внешнего ключа (company_id) | ПФ1 |
| `planfact.vor_profiles` | Удаление — пометка deleted_at | нет deleted_at | ПФ1 |
| `planfact.works` | Время с часовым поясом | нет updated_at | ПФ4 |
| `planfact.works` | Удаление — пометка deleted_at | нет deleted_at | ПФ4 |
| `planfact.works` | Деньги — numeric и валюта | нет валюты (суммы: plan_amount) | ПФ3 |
| `quality.allowed_projects` | Ключ id uuid | составной ключ (core_company_id uuid, code text) | К1 |
| `quality.allowed_projects` | Автор created_by uuid | нет created_by uuid | К2 |
| `quality.allowed_projects` | Удаление — пометка deleted_at | нет deleted_at | К5 |
| `quality.app_assistant_kb` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.construction_acceptance` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.construction_acceptance` | Проект и место — по id | место только текстом (object_id, floor_id, location, section, floor, room) | С2 |
| `quality.construction_acceptance` | Ссылки — uuid с внешним ключом | фирма только названием (contractor, contractorId) | С2 |
| `quality.construction_acceptance_v2` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.construction_acceptance_v2` | Проект и место — по id | место только текстом (locationId) | С1 |
| `quality.construction_buildings` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.construction_buildings` | Проект и место — по id | место только текстом (object_id) | С2 |
| `quality.construction_buildings` | Автор created_by uuid | автор только текстом (created_by, owner) | С2 |
| `quality.construction_defects` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.construction_defects` | Проект и место — по id | место только текстом (floor_id) | С2 |
| `quality.construction_defects` | Ссылки — uuid с внешним ключом | ссылка текстом (item_id); фирма только названием (contractor, contractorId) | С2 |
| `quality.construction_defects_v2` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.construction_defects_v2` | Проект и место — по id | место только текстом (locationId) | С1 |
| `quality.construction_defects_v2` | Ссылки — uuid с внешним ключом | ссылка текстом (item_id) | С1 |
| `quality.construction_floors` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.construction_floors` | Проект и место — по id | место только текстом (building_id) | С2 |
| `quality.construction_floors` | Автор created_by uuid | автор только текстом (created_by, owner) | С2 |
| `quality.construction_floors_v2` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.construction_floors_v2` | Проект и место — по id | место только текстом (locationId) | С1 |
| `quality.construction_floors_v2` | Автор created_by uuid | автор только текстом (created_by) | С1 |
| `quality.construction_objects` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.construction_objects` | Автор created_by uuid | автор только текстом (created_by, owner) | С2 |
| `quality.construction_units` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.construction_units` | Проект и место — по id | место только текстом (building_id, floor_id) | С2 |
| `quality.construction_units` | Автор created_by uuid | нет created_by uuid | С2 |
| `quality.construction_units_v2` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.construction_units_v2` | Проект и место — по id | место только текстом (locationId) | С1 |
| `quality.construction_units_v2` | Автор created_by uuid | автор только текстом (created_by) | С1 |
| `quality.contractor_directory` | Ключ id uuid | составной ключ (core_company_id uuid, id uuid) | К1 |
| `quality.contractor_normalization_queue` | Ключ id uuid | составной ключ (core_company_id uuid, id uuid) | К1 |
| `quality.contractors` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.contractors` | Проект и место — по id | место только текстом (locationId) | К3 |
| `quality.contractors` | Автор created_by uuid | автор только текстом (created_by) | К2 |
| `quality.contracts` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.contracts` | Автор created_by uuid | автор только текстом (created_by) | К2 |
| `quality.contracts` | Ссылки — uuid с внешним ключом | фирма только названием (contractorId) | К4 |
| `quality.file_registry` | Ключ id uuid | составной ключ (core_company_id uuid, id uuid) | К1 |
| `quality.file_registry` | Автор created_by uuid | автор только текстом (uploaded_by) | К2 |
| `quality.file_registry` | Удаление — пометка deleted_at | удаление флагом (is_deleted) | К5 |
| `quality.location_nodes` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.location_nodes` | Автор created_by uuid | автор только текстом (created_by) | К2 |
| `quality.location_nodes` | Ссылки — uuid с внешним ключом | ссылка текстом (parentId) | К6 |
| `quality.object_normalization_queue` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.project_fmea` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.project_fmea` | Время с часовым поясом | нет created_at | К5 |
| `quality.project_interventions` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.project_interventions` | Время с часовым поясом | нет created_at | К5 |
| `quality.project_meetings` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.project_meetings` | Время с часовым поясом | нет created_at | К5 |
| `quality.project_objects` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.project_schedule_stages` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.project_schedule_stages` | Время с часовым поясом | нет created_at | К5 |
| `quality.project_settings` | Время с часовым поясом | нет created_at | К5 |
| `quality.rbi_company_settings` | Время с часовым поясом | нет created_at | К5 |
| `quality.rbi_draft_sessions` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.rbi_draft_sessions` | Проект и место — по id | место только текстом (location, section, floor, room) | К3 |
| `quality.rbi_draft_sessions` | Ссылки — uuid с внешним ключом | фирма только названием (contractor_name) | К4 |
| `quality.rbi_engineer_profiles` | Ключ id uuid | составной ключ (core_company_id uuid, id uuid) | К1 |
| `quality.rbi_engineer_profiles` | Автор created_by uuid | нет created_by uuid | К2 |
| `quality.rbi_engineer_profiles` | Удаление — пометка deleted_at | нет deleted_at | К5 |
| `quality.rbi_engineer_profiles` | Ссылки — uuid с внешним ключом | ссылка текстом (inspector_id); фирма только названием (assigned_contractor, contractor_name) | К4 |
| `quality.rbi_engineer_ratings` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.rbi_engineer_ratings` | Автор created_by uuid | нет created_by uuid | К2 |
| `quality.rbi_engineer_ratings` | Время с часовым поясом | нет created_at | К5 |
| `quality.rbi_error_logs` | Автор created_by uuid | нет created_by uuid | К2 |
| `quality.rbi_inspection_items` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.rbi_inspection_items` | Ссылки — uuid с внешним ключом | ссылка текстом (inspection_id, item_id) | К4 |
| `quality.rbi_inspection_photos` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.rbi_inspection_photos` | Ссылки — uuid с внешним ключом | ссылка текстом (inspection_id, item_id) | К4 |
| `quality.rbi_inspections` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.rbi_inspections` | Проект и место — по id | место только текстом (location, section, floor, room) | К3 |
| `quality.rbi_tasks` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.shared_checklists` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.shared_docs` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.shared_etalons` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.shared_feedback` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.shared_nodes` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.shared_practices` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.shared_report_snapshots` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.shared_report_snapshots` | Ссылки — uuid с внешним ключом | ссылка текстом (report_id) | К6 |
| `quality.shared_report_templates` | Ключ id uuid | составной ключ (core_company_id uuid, id uuid) | К1 |
| `quality.shared_reports` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.shared_twi_cards` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | К1 |
| `quality.sk_category_map` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | СК |
| `quality.sk_category_map` | Автор created_by uuid | автор только текстом (created_by) | СК |
| `quality.sk_category_map` | Удаление — пометка deleted_at | нет deleted_at | СК |
| `quality.sk_contractor_map` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | СК |
| `quality.sk_contractor_map` | Автор created_by uuid | автор только текстом (created_by) | СК |
| `quality.sk_contractor_map` | Удаление — пометка deleted_at | нет deleted_at | СК |
| `quality.sk_contractor_map` | Ссылки — uuid с внешним ключом | фирма только названием (contractor_name) | СК |
| `quality.sk_data_bundles` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | СК |
| `quality.sk_data_bundles` | Автор created_by uuid | нет created_by uuid | СК |
| `quality.sk_data_bundles` | Время с часовым поясом | нет created_at | СК |
| `quality.sk_data_bundles` | Ссылки — uuid с внешним ключом | фирма только названием (contractor_name) | СК |
| `quality.sk_import_batches` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | СК |
| `quality.sk_mapping` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | СК |
| `quality.sk_mapping` | Автор created_by uuid | автор только текстом (created_by) | СК |
| `quality.sk_mapping` | Удаление — пометка deleted_at | нет deleted_at | СК |
| `quality.sk_records` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | СК |
| `quality.sk_records` | Ссылки — uuid с внешним ключом | ссылка текстом (import_batch_id) | СК |
| `quality.sk_volumes` | Ключ id uuid | составной ключ (core_company_id uuid, id text) | СК |
| `quality.sk_volumes` | Автор created_by uuid | автор только текстом (created_by) | СК |
| `quality.sk_volumes` | Удаление — пометка deleted_at | нет deleted_at | СК |
| `quality.sk_volumes` | Ссылки — uuid с внешним ключом | фирма только названием (contractor_name) | СК |
