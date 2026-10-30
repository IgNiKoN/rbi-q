-- P2-0071 (053) откат: Качество — прежние правила (мост «объекты Качества», quality.record_visible), назначения — как до 053
-- (перенесённые на объекты и «без объектов» — удаляются, прежние — снова действуют, по журналу p2_backup.m053_assignments),
-- каталог и роли — без тонких действий Качества, ядро — правило записи без места как 052.
-- Применять одним запросом. Назначения, сделанные после 053 вручную, остаются (ролям без прежних ключей Качество не откроется).
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'permission_catalog'
                   and column_name = 'unplaced') then
    raise exception '053 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
end $$;

-- 1. Назначения — как до 053. Прежнее назначение снова действует, только если ни одно из перенесённых не отозвано вручную после
-- 053 (администратор снял доступ — откат его не возвращает); перенесённые удаляются; созданный контейнер — удаляется (есть
-- ссылки — в архив).
update core.role_assignments set revoked_at = null, revoked_by = null
 where id in (select j.old_id from p2_backup.m053_assignments j where j.kind <> 'container')
   and not exists (select 1 from p2_backup.m053_assignments j join core.role_assignments n on n.id = j.new_id
                    where j.old_id = core.role_assignments.id and j.kind <> 'container' and n.revoked_by is not null);
delete from core.role_assignments
 where id in (select new_id from p2_backup.m053_assignments where kind <> 'container' and new_id is not null);
do $$
declare c uuid;
begin
  for c in select new_id from p2_backup.m053_assignments where kind = 'container' loop
    begin
      delete from core.projects where id = c;
    exception when foreign_key_violation then
      update core.projects set archived_at = coalesce(archived_at, now()) where id = c;
    end;
  end loop;
end $$;
drop table p2_backup.m053_assignments;

-- 2. Правила строк, сторож, функции Качества.
drop trigger rbi_inspections_zzz_rights_guard on quality.rbi_inspections;
drop trigger rbi_tasks_zzz_rights_guard on quality.rbi_tasks;
drop policy rbi_inspection_items_delete on quality.rbi_inspection_items;
drop policy rbi_inspection_items_insert on quality.rbi_inspection_items;
drop policy rbi_inspection_items_select on quality.rbi_inspection_items;
drop policy rbi_inspection_items_update on quality.rbi_inspection_items;
drop policy rbi_inspection_photos_delete on quality.rbi_inspection_photos;
drop policy rbi_inspection_photos_insert on quality.rbi_inspection_photos;
drop policy rbi_inspection_photos_select on quality.rbi_inspection_photos;
drop policy rbi_inspection_photos_update on quality.rbi_inspection_photos;
drop policy rbi_inspections_delete on quality.rbi_inspections;
drop policy rbi_inspections_insert on quality.rbi_inspections;
drop policy rbi_inspections_select on quality.rbi_inspections;
drop policy rbi_inspections_update on quality.rbi_inspections;
drop policy rbi_tasks_delete on quality.rbi_tasks;
drop policy rbi_tasks_insert on quality.rbi_tasks;
drop policy rbi_tasks_select on quality.rbi_tasks;
drop policy rbi_tasks_update on quality.rbi_tasks;
create policy rbi_inspection_items_delete on quality.rbi_inspection_items for delete to authenticated
  using (quality.inspection_child_writable(core_company_id, core_project_id, '{quality.edit}'::text[], inspection_id));
create policy rbi_inspection_items_insert on quality.rbi_inspection_items for insert to authenticated
  with check (quality.inspection_child_writable(core_company_id, core_project_id, '{quality.edit}'::text[], inspection_id));
create policy rbi_inspection_items_select on quality.rbi_inspection_items for select to authenticated
  using (quality.inspection_child_visible(core_company_id, core_project_id, '{quality.view}'::text[], inspection_id, core_created_by));
create policy rbi_inspection_items_update on quality.rbi_inspection_items for update to authenticated
  using (quality.inspection_child_writable(core_company_id, core_project_id, '{quality.edit}'::text[], inspection_id))
  with check (quality.inspection_child_writable(core_company_id, core_project_id, '{quality.edit}'::text[], inspection_id));
create policy rbi_inspection_photos_delete on quality.rbi_inspection_photos for delete to authenticated
  using (quality.inspection_child_writable(core_company_id, core_project_id, '{quality.edit}'::text[], inspection_id));
create policy rbi_inspection_photos_insert on quality.rbi_inspection_photos for insert to authenticated
  with check (quality.inspection_child_writable(core_company_id, core_project_id, '{quality.edit}'::text[], inspection_id));
create policy rbi_inspection_photos_select on quality.rbi_inspection_photos for select to authenticated
  using (quality.inspection_child_visible(core_company_id, core_project_id, '{quality.view}'::text[], inspection_id, core_created_by));
create policy rbi_inspection_photos_update on quality.rbi_inspection_photos for update to authenticated
  using (quality.inspection_child_writable(core_company_id, core_project_id, '{quality.edit}'::text[], inspection_id))
  with check (quality.inspection_child_writable(core_company_id, core_project_id, '{quality.edit}'::text[], inspection_id));
create policy rbi_inspections_delete on quality.rbi_inspections for delete to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'author'::text, COALESCE(core_created_by, quality.member_by_email(core_company_id, engineer_name)), NULL::uuid, core_counterparty_id, core_object_id));
create policy rbi_inspections_insert on quality.rbi_inspections for insert to authenticated
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'author'::text, COALESCE(core_created_by, quality.member_by_email(core_company_id, engineer_name)), NULL::uuid, core_counterparty_id, core_object_id));
create policy rbi_inspections_select on quality.rbi_inspections for select to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.view}'::text[], 'author'::text, COALESCE(core_created_by, quality.member_by_email(core_company_id, engineer_name)), NULL::uuid, core_counterparty_id, core_object_id));
create policy rbi_inspections_update on quality.rbi_inspections for update to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'author'::text, COALESCE(core_created_by, quality.member_by_email(core_company_id, engineer_name)), NULL::uuid, core_counterparty_id, core_object_id))
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'author'::text, COALESCE(core_created_by, quality.member_by_email(core_company_id, engineer_name)), NULL::uuid, core_counterparty_id, core_object_id));
create policy rbi_tasks_delete on quality.rbi_tasks for delete to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'author'::text, COALESCE(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, core_counterparty_id, core_object_id));
create policy rbi_tasks_insert on quality.rbi_tasks for insert to authenticated
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'author'::text, COALESCE(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, core_counterparty_id, core_object_id));
create policy rbi_tasks_select on quality.rbi_tasks for select to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.view}'::text[], 'author'::text, COALESCE(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, core_counterparty_id, core_object_id));
create policy rbi_tasks_update on quality.rbi_tasks for update to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'author'::text, COALESCE(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, core_counterparty_id, core_object_id))
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'author'::text, COALESCE(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, core_counterparty_id, core_object_id));
-- Остальные записи Качества и общие таблицы внешнего СК / шаблоны отчётов — прежние правила.
drop policy project_fmea_delete on quality.project_fmea;
drop policy project_fmea_insert on quality.project_fmea;
drop policy project_fmea_select on quality.project_fmea;
drop policy project_fmea_update on quality.project_fmea;
drop policy project_interventions_delete on quality.project_interventions;
drop policy project_interventions_insert on quality.project_interventions;
drop policy project_interventions_select on quality.project_interventions;
drop policy project_interventions_update on quality.project_interventions;
drop policy project_meetings_delete on quality.project_meetings;
drop policy project_meetings_insert on quality.project_meetings;
drop policy project_meetings_select on quality.project_meetings;
drop policy project_meetings_update on quality.project_meetings;
drop policy project_schedule_stages_delete on quality.project_schedule_stages;
drop policy project_schedule_stages_insert on quality.project_schedule_stages;
drop policy project_schedule_stages_select on quality.project_schedule_stages;
drop policy project_schedule_stages_update on quality.project_schedule_stages;
drop policy shared_report_snapshots_delete on quality.shared_report_snapshots;
drop policy shared_report_snapshots_insert on quality.shared_report_snapshots;
drop policy shared_report_snapshots_select on quality.shared_report_snapshots;
drop policy shared_report_snapshots_update on quality.shared_report_snapshots;
drop policy shared_report_templates_delete on quality.shared_report_templates;
drop policy shared_report_templates_insert on quality.shared_report_templates;
drop policy shared_report_templates_select on quality.shared_report_templates;
drop policy shared_report_templates_update on quality.shared_report_templates;
drop policy shared_reports_delete on quality.shared_reports;
drop policy shared_reports_insert on quality.shared_reports;
drop policy shared_reports_select on quality.shared_reports;
drop policy shared_reports_update on quality.shared_reports;
drop policy sk_category_map_delete on quality.sk_category_map;
drop policy sk_category_map_insert on quality.sk_category_map;
drop policy sk_category_map_select on quality.sk_category_map;
drop policy sk_category_map_update on quality.sk_category_map;
drop policy sk_contractor_map_delete on quality.sk_contractor_map;
drop policy sk_contractor_map_insert on quality.sk_contractor_map;
drop policy sk_contractor_map_select on quality.sk_contractor_map;
drop policy sk_contractor_map_update on quality.sk_contractor_map;
drop policy sk_data_bundles_delete on quality.sk_data_bundles;
drop policy sk_data_bundles_insert on quality.sk_data_bundles;
drop policy sk_data_bundles_select on quality.sk_data_bundles;
drop policy sk_data_bundles_update on quality.sk_data_bundles;
drop policy sk_import_batches_delete on quality.sk_import_batches;
drop policy sk_import_batches_insert on quality.sk_import_batches;
drop policy sk_import_batches_select on quality.sk_import_batches;
drop policy sk_import_batches_update on quality.sk_import_batches;
drop policy sk_mapping_delete on quality.sk_mapping;
drop policy sk_mapping_insert on quality.sk_mapping;
drop policy sk_mapping_select on quality.sk_mapping;
drop policy sk_mapping_update on quality.sk_mapping;
drop policy sk_records_delete on quality.sk_records;
drop policy sk_records_insert on quality.sk_records;
drop policy sk_records_select on quality.sk_records;
drop policy sk_records_update on quality.sk_records;
drop policy sk_volumes_delete on quality.sk_volumes;
drop policy sk_volumes_insert on quality.sk_volumes;
drop policy sk_volumes_select on quality.sk_volumes;
drop policy sk_volumes_update on quality.sk_volumes;
create policy project_fmea_delete on quality.project_fmea for delete to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_fmea_insert on quality.project_fmea for insert to authenticated
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_fmea_select on quality.project_fmea for select to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.view}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_fmea_update on quality.project_fmea for update to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id))
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_interventions_delete on quality.project_interventions for delete to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_interventions_insert on quality.project_interventions for insert to authenticated
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_interventions_select on quality.project_interventions for select to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.view}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_interventions_update on quality.project_interventions for update to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id))
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_meetings_delete on quality.project_meetings for delete to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_meetings_insert on quality.project_meetings for insert to authenticated
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_meetings_select on quality.project_meetings for select to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.view}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_meetings_update on quality.project_meetings for update to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id))
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_schedule_stages_delete on quality.project_schedule_stages for delete to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_schedule_stages_insert on quality.project_schedule_stages for insert to authenticated
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_schedule_stages_select on quality.project_schedule_stages for select to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.view}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy project_schedule_stages_update on quality.project_schedule_stages for update to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id))
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy shared_report_snapshots_delete on quality.shared_report_snapshots for delete to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy shared_report_snapshots_insert on quality.shared_report_snapshots for insert to authenticated
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy shared_report_snapshots_select on quality.shared_report_snapshots for select to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.view}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy shared_report_snapshots_update on quality.shared_report_snapshots for update to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id))
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy shared_report_templates_delete on quality.shared_report_templates for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_report_templates_insert on quality.shared_report_templates for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_report_templates_select on quality.shared_report_templates for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy shared_report_templates_update on quality.shared_report_templates for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_reports_delete on quality.shared_reports for delete to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy shared_reports_insert on quality.shared_reports for insert to authenticated
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy shared_reports_select on quality.shared_reports for select to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.view}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy shared_reports_update on quality.shared_reports for update to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id))
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy sk_category_map_delete on quality.sk_category_map for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_category_map_insert on quality.sk_category_map for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_category_map_select on quality.sk_category_map for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy sk_category_map_update on quality.sk_category_map for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_contractor_map_delete on quality.sk_contractor_map for delete to authenticated
  using ((quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]) AND (NOT quality.contractor_only(core_company_id, core_project_id))));
create policy sk_contractor_map_insert on quality.sk_contractor_map for insert to authenticated
  with check ((quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]) AND (NOT quality.contractor_only(core_company_id, core_project_id))));
create policy sk_contractor_map_select on quality.sk_contractor_map for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy sk_contractor_map_update on quality.sk_contractor_map for update to authenticated
  using ((quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]) AND (NOT quality.contractor_only(core_company_id, core_project_id))))
  with check ((quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]) AND (NOT quality.contractor_only(core_company_id, core_project_id))));
create policy sk_data_bundles_delete on quality.sk_data_bundles for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_data_bundles_insert on quality.sk_data_bundles for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_data_bundles_select on quality.sk_data_bundles for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy sk_data_bundles_update on quality.sk_data_bundles for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_import_batches_delete on quality.sk_import_batches for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_import_batches_insert on quality.sk_import_batches for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_import_batches_select on quality.sk_import_batches for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy sk_import_batches_update on quality.sk_import_batches for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_mapping_delete on quality.sk_mapping for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_mapping_insert on quality.sk_mapping for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_mapping_select on quality.sk_mapping for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy sk_mapping_update on quality.sk_mapping for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_records_delete on quality.sk_records for delete to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy sk_records_insert on quality.sk_records for insert to authenticated
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy sk_records_select on quality.sk_records for select to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.view}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy sk_records_update on quality.sk_records for update to authenticated
  using (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id))
  with check (quality.record_visible(core_company_id, core_project_id, '{quality.edit}'::text[], 'contractor'::text, core_created_by, NULL::uuid, core_counterparty_id, core_object_id));
create policy sk_volumes_delete on quality.sk_volumes for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_volumes_insert on quality.sk_volumes for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy sk_volumes_select on quality.sk_volumes for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy sk_volumes_update on quality.sk_volumes for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
-- Библиотека компании — прежние правила (проект записи сверяется с назначением).
drop policy app_assistant_kb_delete on quality.app_assistant_kb;
drop policy app_assistant_kb_insert on quality.app_assistant_kb;
drop policy app_assistant_kb_select on quality.app_assistant_kb;
drop policy app_assistant_kb_update on quality.app_assistant_kb;
drop policy shared_checklists_delete on quality.shared_checklists;
drop policy shared_checklists_insert on quality.shared_checklists;
drop policy shared_checklists_select on quality.shared_checklists;
drop policy shared_checklists_update on quality.shared_checklists;
drop policy shared_docs_delete on quality.shared_docs;
drop policy shared_docs_insert on quality.shared_docs;
drop policy shared_docs_select on quality.shared_docs;
drop policy shared_docs_update on quality.shared_docs;
drop policy shared_etalons_delete on quality.shared_etalons;
drop policy shared_etalons_insert on quality.shared_etalons;
drop policy shared_etalons_select on quality.shared_etalons;
drop policy shared_etalons_update on quality.shared_etalons;
drop policy shared_feedback_delete on quality.shared_feedback;
drop policy shared_feedback_insert on quality.shared_feedback;
drop policy shared_feedback_select on quality.shared_feedback;
drop policy shared_feedback_update on quality.shared_feedback;
drop policy shared_nodes_delete on quality.shared_nodes;
drop policy shared_nodes_insert on quality.shared_nodes;
drop policy shared_nodes_select on quality.shared_nodes;
drop policy shared_nodes_update on quality.shared_nodes;
drop policy shared_practices_delete on quality.shared_practices;
drop policy shared_practices_insert on quality.shared_practices;
drop policy shared_practices_select on quality.shared_practices;
drop policy shared_practices_update on quality.shared_practices;
drop policy shared_twi_cards_delete on quality.shared_twi_cards;
drop policy shared_twi_cards_insert on quality.shared_twi_cards;
drop policy shared_twi_cards_select on quality.shared_twi_cards;
drop policy shared_twi_cards_update on quality.shared_twi_cards;
create policy app_assistant_kb_delete on quality.app_assistant_kb for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy app_assistant_kb_insert on quality.app_assistant_kb for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy app_assistant_kb_select on quality.app_assistant_kb for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy app_assistant_kb_update on quality.app_assistant_kb for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_checklists_delete on quality.shared_checklists for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_checklists_insert on quality.shared_checklists for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_checklists_select on quality.shared_checklists for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy shared_checklists_update on quality.shared_checklists for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_docs_delete on quality.shared_docs for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_docs_insert on quality.shared_docs for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_docs_select on quality.shared_docs for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy shared_docs_update on quality.shared_docs for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_etalons_delete on quality.shared_etalons for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_etalons_insert on quality.shared_etalons for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_etalons_select on quality.shared_etalons for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy shared_etalons_update on quality.shared_etalons for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_feedback_delete on quality.shared_feedback for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_feedback_insert on quality.shared_feedback for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_feedback_select on quality.shared_feedback for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy shared_feedback_update on quality.shared_feedback for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_nodes_delete on quality.shared_nodes for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_nodes_insert on quality.shared_nodes for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_nodes_select on quality.shared_nodes for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy shared_nodes_update on quality.shared_nodes for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_practices_delete on quality.shared_practices for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_practices_insert on quality.shared_practices for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_practices_select on quality.shared_practices for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy shared_practices_update on quality.shared_practices for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_twi_cards_delete on quality.shared_twi_cards for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_twi_cards_insert on quality.shared_twi_cards for insert to authenticated
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
create policy shared_twi_cards_select on quality.shared_twi_cards for select to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.view}'::text[]));
create policy shared_twi_cards_update on quality.shared_twi_cards for update to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'::text[]));
drop function quality.quality_rights_guard();
drop function quality.row_exists(text, text, uuid);
drop function quality.is_platform_admin();
drop function quality.deny(uuid, text);
drop function quality.inspection_child_ok(uuid, uuid, text, uuid, boolean);
drop function quality.rec_ok(uuid, uuid, uuid, text[], text[], uuid, uuid, uuid);
drop function quality.record_object(uuid, uuid);
drop function quality.has_anywhere(uuid, text[], uuid);

create or replace function quality.has_actions(p_company uuid, p_project uuid, p_actions text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core', 'planfact'
AS $function$
  select p_company is not null and auth.uid() is not null and exists (
    select 1 from unnest(p_actions) act
    join core.permission_catalog pc on pc.action = act
    join core.company_modules cm on cm.company_id = p_company and cm.module = split_part(act, '.', 1) and cm.enabled
    where planfact.is_platform_admin() or exists (
      select 1 from core.role_assignments a
      join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = act
      where a.company_id = p_company and a.user_id = auth.uid()
        and (p_project is null or a.project_id is null or a.project_id = p_project)
        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())));
$function$;

create or replace function quality.assigned_with(p_company uuid, p_project uuid, p_actions text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core'
AS $function$
  select auth.uid() is not null and exists (
    select 1 from core.role_assignments a
    join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = any(p_actions)
    where a.company_id = p_company and a.user_id = auth.uid()
      and (p_project is null or a.project_id is null or a.project_id = p_project)
      and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()));
$function$;

create or replace function quality.contractor_limited(p_company uuid, p_project uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core', 'planfact'
AS $function$
  with a as (
    select array(select rp.action from core.company_role_permissions rp where rp.role_id = x.role_id and rp.company_id = x.company_id) acts
      from core.role_assignments x
     where x.company_id = p_company and x.user_id = auth.uid()
       and x.revoked_at is null and x.valid_from <= now() and (x.valid_to is null or x.valid_to > now())
       and (p_project is null or x.project_id is null or x.project_id = p_project))
  select auth.uid() is not null and not planfact.is_platform_admin()
     and exists (select 1 from a where 'construction.edit' = any(acts) and 'quality.scope.contractor' = any(acts))
     and not exists (select 1 from a where 'construction.edit' = any(acts) and not 'quality.scope.contractor' = any(acts));
$function$;

create or replace function quality.assignment_sees(a core.role_assignments, m text, p_project uuid, p_kind text, p_author uuid, p_assignee uuid, p_ckey text, p_cname text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core'
AS $function$
declare
  v_acts text[] := array(select rp.action from core.company_role_permissions rp where rp.role_id = a.role_id and rp.company_id = a.company_id);
begin
  if p_kind = 'owner' then
    if not (p_project is null or a.project_id is null or a.project_id = p_project) then return false; end if;
    return (m || '.manage') = any(v_acts) or (auth.uid() is not null and p_author = auth.uid());
  end if;
  if 'quality.scope.company' = any(v_acts) then return true; end if;
  if not (p_project is null or a.project_id is null or a.project_id = p_project) then return false; end if;
  if (m || '.manage') = any(v_acts) then return true; end if;
  if 'quality.scope.contractor' = any(v_acts) then
    return quality.contractor_matches(a.company_id, a.counterparty_id, p_ckey, p_cname);
  end if;
  if p_kind = 'author' and (m || '.edit') = any(v_acts) then
    return auth.uid() is not null and (p_author = auth.uid() or p_assignee = auth.uid());
  end if;
  return true;
end $function$;

create or replace function quality.set_record_object()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare n jsonb := to_jsonb(new); o jsonb; v uuid[];
begin
  if coalesce(current_setting('quality.object_bind', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    if (n ->> 'projectId', n ->> 'project_canonical_key', n ->> 'project_display_name', n ->> 'core_company_id')
       is not distinct from (o ->> 'projectId', o ->> 'project_canonical_key', o ->> 'project_display_name', o ->> 'core_company_id') then
      new.core_object_id := old.core_object_id;
      return new;
    end if;
  end if;
  v := quality.object_candidates(new.core_company_id, n ->> 'projectId', n ->> 'project_canonical_key', n ->> 'project_display_name');
  if cardinality(v) > 1 and auth.uid() is not null and not planfact.is_platform_admin()
     and not exists (select 1 from core.role_assignments a
                      where a.company_id = new.core_company_id and a.user_id = auth.uid() and a.quality_objects is null
                        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))
     and exists (select 1 from unnest(v) c where c is null or not exists (
                   select 1 from core.role_assignments a
                     join quality.project_objects po on po.core_company_id = a.company_id and po.id = any (a.quality_objects) and quality.object_alive(po)
                    where a.company_id = new.core_company_id and a.user_id = auth.uid() and po.core_object_id = c
                      and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))) then
    raise exception 'Объект записи указывает на объект, который за вами не закреплён' using errcode = '42501';
  end if;
  new.core_object_id := case when cardinality(v) = 1 then v[1] end;
  return new;
end $function$;

create or replace function public.pf_set_participation(p_users uuid[], p_role uuid, p_project uuid DEFAULT NULL::uuid, p_locations uuid[] DEFAULT NULL::uuid[], p_fact_owner boolean DEFAULT false, p_valid_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_objects text[] DEFAULT NULL::text[], p_counterparty uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_company uuid; v_users uuid[]; v_locs uuid[]; v_objs text[]; v_owner boolean := coalesce(p_fact_owner, false);
        v_q boolean; v_pf boolean; u uuid; t uuid; a core.role_assignments; v_id uuid; v_add int := 0; v_chg int := 0; v_rev int := 0;
        v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  select company_id into v_company from core.company_roles where id = p_role;
  if v_company is null or not planfact.has_company_permission(v_company, 'security.roles.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_users := array(select distinct x from unnest(coalesce(p_users, '{}')) x where x is not null);
  if cardinality(v_users) = 0 then raise exception 'Выберите сотрудников' using errcode = '22023'; end if;
  if cardinality(v_users) > 200 then raise exception 'Не больше 200 сотрудников за раз' using errcode = '22023'; end if;
  if p_project is not null and not exists (select 1 from core.projects where id = p_project and company_id = v_company) then
    raise exception 'Проект не принадлежит этой компании' using errcode = '42501';
  end if;
  v_locs := array(select distinct x from unnest(coalesce(p_locations, '{}')) x where x is not null);
  if cardinality(v_locs) = 0 then v_locs := null; end if;
  if v_locs is not null and p_project is null then raise exception 'Места выбираются внутри проекта' using errcode = '22023'; end if;
  if cardinality(v_locs) > 200 then raise exception 'Не больше 200 мест за раз' using errcode = '22023'; end if;
  if v_locs is not null and exists (select 1 from unnest(v_locs) x where not exists (
       select 1 from core.locations l where l.id = x and l.project_id = p_project and l.deleted_at is null)) then
    raise exception 'Место не найдено в проекте' using errcode = '22023';
  end if;
  if v_owner and p_project is null then
    raise exception '«Ответственный за факт» назначается на проект или его часть' using errcode = '22023';
  end if;
  if p_valid_to is not null and p_valid_to <= now() then raise exception 'Срок окончания уже прошёл' using errcode = '22023'; end if;
  if p_counterparty is not null and not exists (select 1 from core.counterparties where id = p_counterparty and company_id = v_company
       and deleted_at is null and archived_at is null and 'contractor' = any(kinds)) then
    raise exception 'Фирма не найдена среди подрядчиков компании («Контрагенты», вид «подрядчик»)' using errcode = '22023';
  end if;
  select bool_or(rp.action like 'quality.%' or rp.action like 'construction.%'), bool_or(rp.action like 'planfact.%') into v_q, v_pf
    from core.company_role_permissions rp where rp.role_id = p_role and rp.company_id = v_company;
  if p_project is not null and coalesce(v_q, false) and not coalesce(v_pf, false) then
    raise exception 'Роль Качества назначается на всю компанию — с выбором объектов Качества' using errcode = '22023';
  end if;
  -- объекты Качества: назначение на компанию — выбранные (пусто — все); на проект — объекты Качества этого проекта (мост)
  v_objs := array(select distinct btrim(x) from unnest(coalesce(p_objects, '{}')) x where nullif(btrim(coalesce(x, '')), '') is not null order by 1);
  if cardinality(v_objs) = 0 then v_objs := null; end if;
  if v_objs is not null and p_project is not null then
    raise exception 'Объекты Качества выбираются при назначении на всю компанию' using errcode = '22023';
  end if;
  if v_objs is not null and exists (select 1 from unnest(v_objs) x where not exists (
       select 1 from quality.project_objects o where o.core_company_id = v_company and o.id = x
          and not coalesce(o.is_deleted, false) and not coalesce(o._deleted, false) and o.deleted_at is null)) then
    raise exception 'Объект не найден среди объектов Качества компании' using errcode = '22023';
  end if;
  if p_project is not null then
    v_objs := (select array_agg(o.id order by o.id) from quality.project_objects o
                where o.core_company_id = v_company and o.core_object_id = p_project
                  and not coalesce(o.is_deleted, false) and not coalesce(o._deleted, false) and o.deleted_at is null);
  end if;

  foreach u in array v_users loop
    if u = auth.uid() then raise exception 'Нельзя назначить роль самому себе' using errcode = '42501'; end if;
    if not exists (select 1 from core.company_members where company_id = v_company and user_id = u) then
      raise exception 'Сотрудник не состоит в этой компании' using errcode = '42501';
    end if;
    if exists (select 1 from core.company_members where company_id = v_company and user_id = u and disabled_at is not null) then
      raise exception 'Сотрудник отключён — роль не назначается' using errcode = '42501';
    end if;
    foreach t in array coalesce(v_locs, array[null::uuid]) loop
      select * into a from core.role_assignments ra
       where ra.company_id = v_company and ra.user_id = u and ra.role_id = p_role and ra.project_id is not distinct from p_project
         and ra.location_id is not distinct from t and ra.revoked_at is null and (ra.valid_to is null or ra.valid_to > now())
       order by ra.created_at, ra.id limit 1 for update;
      if a.id is null then
        insert into core.role_assignments(company_id, user_id, role_id, project_id, location_id, fact_owner, valid_to, created_by,
                                          counterparty_id, quality_objects)
        values (v_company, u, p_role, p_project, t, v_owner, p_valid_to, auth.uid(), p_counterparty, v_objs)
        returning id into v_id;
        perform planfact.log_admin_change(v_company, p_project, 'role_assignments', v_id, 'ASSIGN', null,
                  jsonb_build_object('user_id', u, 'role_id', p_role, 'role_name', (select name from core.company_roles where id = p_role),
                                     'project_id', p_project, 'location_id', t, 'fact_owner', v_owner, 'valid_to', p_valid_to,
                                     'counterparty_id', p_counterparty, 'quality_objects', v_objs));
        v_add := v_add + 1;
      elsif (a.fact_owner, a.valid_to, a.quality_objects, a.counterparty_id) is distinct from (v_owner, p_valid_to, v_objs, p_counterparty) then
        update core.role_assignments set fact_owner = v_owner, valid_to = p_valid_to, quality_objects = v_objs, counterparty_id = p_counterparty
         where id = a.id;
        perform planfact.log_admin_change(v_company, p_project, 'role_assignments', a.id, 'CHANGE',
                  jsonb_build_object('fact_owner', a.fact_owner, 'valid_to', a.valid_to, 'quality_objects', a.quality_objects,
                                     'counterparty_id', a.counterparty_id),
                  jsonb_build_object('fact_owner', v_owner, 'valid_to', p_valid_to, 'quality_objects', v_objs, 'counterparty_id', p_counterparty));
        v_chg := v_chg + 1;
      end if;
      a := null;
    end loop;
    for a in select * from core.role_assignments ra
              where ra.company_id = v_company and ra.user_id = u and ra.role_id = p_role and ra.project_id is not distinct from p_project
                and ra.revoked_at is null and (ra.valid_to is null or ra.valid_to > now())
                and not coalesce(ra.location_id, v_zero) = any (array(select coalesce(x, v_zero) from unnest(coalesce(v_locs, array[null::uuid])) x))
              order by ra.id for update loop
      update core.role_assignments set revoked_at = now(), revoked_by = auth.uid() where id = a.id;
      perform planfact.log_admin_change(v_company, a.project_id, 'role_assignments', a.id, 'REVOKE',
                jsonb_build_object('user_id', a.user_id, 'role_id', a.role_id, 'role_name', (select name from core.company_roles where id = a.role_id),
                                   'project_id', a.project_id, 'location_id', a.location_id, 'valid_to', a.valid_to), null);
      v_rev := v_rev + 1;
    end loop;
  end loop;
  perform planfact.assert_company_has_admin(v_company);
  return jsonb_build_object('added', v_add, 'changed', v_chg, 'revoked', v_rev);
end $function$;

create or replace function public.pf_assign_role(p_user uuid, p_role uuid, p_project uuid DEFAULT NULL::uuid, p_valid_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_counterparty uuid DEFAULT NULL::uuid, p_objects text[] DEFAULT NULL::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_company uuid; v_id uuid; v_objects text[];
begin
  select company_id into v_company from core.company_roles where id = p_role;
  if v_company is null or not planfact.has_company_permission(v_company, 'security.roles.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot assign a role to yourself' using errcode = '42501';
  end if;
  if not exists (select 1 from core.company_members where company_id = v_company and user_id = p_user) then
    raise exception 'Сотрудник не состоит в этой компании' using errcode = '42501';
  end if;
  if exists (select 1 from core.company_members where company_id = v_company and user_id = p_user and disabled_at is not null) then
    raise exception 'Сотрудник отключён — роль не назначается' using errcode = '42501';   -- ревью M3 (P2-0028)
  end if;
  if p_project is not null and not exists (select 1 from core.projects where id = p_project and company_id = v_company) then
    raise exception 'Проект не принадлежит этой компании' using errcode = '42501';
  end if;
  if p_counterparty is not null and not exists (select 1 from core.counterparties where id = p_counterparty and company_id = v_company
       and deleted_at is null and archived_at is null and 'contractor' = any(kinds)) then
    raise exception 'Фирма не найдена среди подрядчиков компании («Контрагенты», вид «подрядчик»)' using errcode = '22023';
  end if;
  if p_valid_to is not null and p_valid_to <= now() then
    raise exception 'Срок окончания уже прошёл' using errcode = '22023';
  end if;
  -- 033: объекты — только действующие объекты Качества этой компании, по id (ADR-070)
  v_objects := array(select distinct btrim(x) from unnest(coalesce(p_objects, '{}')) x where nullif(btrim(coalesce(x, '')), '') is not null order by 1);
  if cardinality(v_objects) = 0 then v_objects := null; end if;
  if v_objects is not null and exists (select 1 from unnest(v_objects) x where not exists (
       select 1 from quality.project_objects o where o.core_company_id = v_company and o.id = x
          and not coalesce(o.is_deleted, false) and not coalesce(o._deleted, false) and o.deleted_at is null)) then
    raise exception 'Объект не найден среди объектов Качества компании' using errcode = '22023';
  end if;
  if exists (select 1 from core.role_assignments where user_id = p_user and role_id = p_role
             and project_id is not distinct from p_project and revoked_at is null
             and (valid_to is null or valid_to > now())) then
    raise exception 'Такое назначение уже действует' using errcode = '22023';
  end if;
  insert into core.role_assignments(company_id, user_id, role_id, project_id, valid_to, created_by, counterparty_id, quality_objects)
  values (v_company, p_user, p_role, p_project, p_valid_to, auth.uid(), p_counterparty, v_objects)
  returning id into v_id;
  perform planfact.log_admin_change(v_company, p_project, 'role_assignments', v_id, 'ASSIGN', null,
            jsonb_build_object('user_id', p_user, 'role_id', p_role, 'role_name', (select name from core.company_roles where id = p_role),
                               'project_id', p_project, 'valid_to', p_valid_to, 'counterparty_id', p_counterparty,
                               'quality_objects', v_objects));
  return v_id;
end $function$;

create or replace function core.assignment_allows(a core.role_assignments, p_action text, p_project uuid, p_up uuid[], p_author uuid, p_counterparty uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_acts text[] := array(select rp.action from core.company_role_permissions rp where rp.role_id = a.role_id and rp.company_id = a.company_id);
  m constant text := split_part(p_action, '.', 1);
begin
  if 'quality.scope.company' = any(v_acts) then return true; end if;
  if not (p_project is null or a.project_id is null or a.project_id = p_project) then return false; end if;
  if a.location_id is not null then
    -- запись без места участник части проекта только видит, и только свою; с местом — место участия или выше него
    if cardinality(p_up) = 0 then return p_action like '%.view' and auth.uid() is not null and p_author = auth.uid(); end if;
    if not a.location_id = any(p_up) then return false; end if;
  end if;
  if (m || '.manage') = any(v_acts) then return true; end if;
  if 'quality.scope.contractor' = any(v_acts) then
    return a.counterparty_id is not null and p_counterparty is not null and a.counterparty_id = p_counterparty;
  end if;
  return true;
end $function$;

create or replace function quality.my_access(p_project uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core', 'planfact'
AS $function$
  with asg as (
    select a.*, r.template_code from core.role_assignments a
    join core.company_roles r on r.id = a.role_id and r.company_id = a.company_id
    where a.company_id = quality.request_company() and a.user_id = auth.uid()
      and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))
  select jsonb_build_object(
    'company_id', quality.request_company(),
    'actions', coalesce((select jsonb_agg(pc.action order by pc.action) from core.permission_catalog pc
                          where (pc.action like 'quality.%' or pc.action like 'construction.%')
                            and quality.can(quality.request_company(), p_project, array[pc.action])), '[]'::jsonb),
    'templates', coalesce((select jsonb_agg(distinct template_code) from asg
                            where (p_project is null or project_id is null or project_id = p_project)
                              and template_code is not null), '[]'::jsonb),
    'projects', case when exists (select 1 from asg where project_id is null) then null
                     else coalesce((select jsonb_agg(distinct project_id) from asg), '[]'::jsonb) end,
    'objects', case when not exists (select 1 from asg) or exists (select 1 from asg where quality_objects is null) then null
                    else coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'key', o.canonical_key, 'name', o.display_name)
                                                    order by o.display_name)
                                     from quality.project_objects o
                                    where o.core_company_id = quality.request_company()
                                      and o.id in (select unnest(quality_objects) from asg)), '[]'::jsonb) end,
    'contractor', (select jsonb_build_object('id', c.id, 'name', c.name,
                            'keys', coalesce((select jsonb_agg(l.canonical_key order by l.canonical_key) from quality.contractor_core_links l
                                               where l.counterparty_id = c.id), '[]'::jsonb))
                     from asg join core.counterparties c on c.id = asg.counterparty_id and c.company_id = asg.company_id
                    where c.deleted_at is null order by c.name limit 1),
    'container', case when exists (select 1 from asg) or planfact.is_platform_admin() then quality.request_container() end,
    -- P2-0070: участие × действия Стройконтроля (place — место участия, places — оно и всё под ним; null — весь проект)
    'construction', jsonb_build_object(
      'admin', planfact.is_platform_admin(),
      'enabled', exists (select 1 from core.company_modules cm where cm.company_id = quality.request_company()
                                                              and cm.module = 'construction' and cm.enabled),
      'grants', core.my_grants(quality.request_company(), null, 'construction'),
      'object_nodes', coalesce((select jsonb_object_agg(n.id, quality.node_root_project(n)) from quality.location_nodes n
                                 where n.core_company_id = quality.request_company() and n."nodeType" = 'object'
                                   and not coalesce(n.is_deleted, false) and coalesce(n."parentId", '') = ''
                                   and quality.node_root_project(n) is not null), '{}'::jsonb)));
$function$;

drop function public.pf_quality_container(uuid);
drop function quality.no_object();
drop function quality.is_container(uuid);

-- 3. Каталог и роли — как 052.
delete from core.company_role_permissions where action in (select action from core.permission_catalog where unplaced is not null
  or action in ('quality.inspections.edit_any', 'quality.tasks.edit_any'));
delete from core.role_template_permissions where action in (select action from core.permission_catalog where unplaced is not null
  or action in ('quality.inspections.edit_any', 'quality.tasks.edit_any'));
delete from core.permission_catalog where unplaced is not null or action in ('quality.inspections.edit_any', 'quality.tasks.edit_any');
update core.permission_catalog c set group_name = v.grp, sort = v.sort, label = v.label
  from (values
    ('quality.view', 'Доступ', 2010, 'Просмотр'),
    ('quality.edit', 'Доступ', 2020, 'Проверки, задачи, отчёты'),
    ('quality.manage', 'Доступ', 2030, 'Настройки, справочники, роли'),
    ('quality.objects.manage', 'Доступ', 2040, 'Справочник объектов и дерево локаций (только администратор)'),
    ('quality.ai', 'Доступ', 2050, 'ИИ-помощник')
  ) v(action, grp, sort, label)
 where c.action = v.action;
alter table core.permission_catalog drop column unplaced;

commit;
