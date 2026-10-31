-- P2-0078: откат 059_rls_fast_up.sql — правила чтения как до 059 (quality.can / quality.rec_ok / quality.row_visible /
-- core.row_allowed / quality.inspection_child_ok на строке), функции и типы 059 снимаются. Данные не меняются.
-- Применять одним запросом.
begin;

do $$
begin
  if to_regprocedure('quality.readable_projects(text[])') is null then
    raise exception '059 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
end $$;

drop policy file_registry_select on quality.file_registry;
create policy file_registry_select on quality.file_registry for select to authenticated using (
  quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'::text[]));

drop policy sk_records_select on quality.sk_records;
create policy sk_records_select on quality.sk_records for select to authenticated using (
  quality.rec_ok(core_company_id, core_project_id, core_object_id, '{quality.sk.view}'::text[], '{quality.sk.view,quality.sk.import}'::text[],
                 core_created_by, NULL::uuid, core_counterparty_id));

do $$
declare r record;
begin
  for r in select * from (values
      ('allowed_projects', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('contractor_aliases', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('contractor_directory', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('contractor_normalization_queue', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('contractors', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('object_aliases', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('object_normalization_queue', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('project_objects', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('project_settings', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('rbi_company_settings', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('rbi_engineer_profiles', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('rbi_error_logs', 'core_company_id', 'core_project_id', '{quality.view,construction.view}'),
      ('construction_buildings', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('construction_floors', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('construction_floors_v2', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('construction_objects', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('construction_units', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('construction_units_v2', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('contracts', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('location_node_aliases', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('location_nodes', 'core_company_id', 'core_project_id', '{construction.view}'),
      ('rbi_engineer_ratings', 'core_company_id', 'core_project_id', '{quality.view}'),
      ('sk_category_map', 'core_company_id', 'core_project_id', '{quality.sk.view}'),
      ('sk_contractor_map', 'core_company_id', 'core_project_id', '{quality.sk.view}'),
      ('sk_data_bundles', 'core_company_id', 'core_project_id', '{quality.sk.view}'),
      ('sk_import_batches', 'core_company_id', 'core_project_id', '{quality.sk.view}'),
      ('sk_mapping', 'core_company_id', 'core_project_id', '{quality.sk.view}'),
      ('sk_volumes', 'core_company_id', 'core_project_id', '{quality.sk.view}'),
      ('sk_links', 'company_id', 'project_id', '{quality.sk.view}'),
      ('shared_report_templates', 'core_company_id', 'core_project_id', '{quality.reports.view}'),
      ('app_assistant_kb', 'core_company_id', null, '{quality.view}'),
      ('shared_checklists', 'core_company_id', null, '{quality.view}'),
      ('shared_docs', 'core_company_id', null, '{quality.view}'),
      ('shared_etalons', 'core_company_id', null, '{quality.view}'),
      ('shared_feedback', 'core_company_id', null, '{quality.view}'),
      ('shared_nodes', 'core_company_id', null, '{quality.view}'),
      ('shared_practices', 'core_company_id', null, '{quality.view}'),
      ('shared_twi_cards', 'core_company_id', null, '{quality.view}')) v(t, c, p, acts) loop
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (quality.can(%I, %s, %s))',
                   r.t || '_select', r.t, r.c, coalesce(quote_ident(r.p), 'NULL::uuid'),
                   case when r.t = 'sk_links' then 'ARRAY[''quality.sk.view''::text]' else quote_literal(r.acts) || '::text[]' end);
  end loop;
  for r in select * from (values
      ('project_fmea', '{quality.method.view}', '{quality.method.view,quality.method.edit}', 'core_created_by', 'NULL::uuid'),
      ('project_schedule_stages', '{quality.method.view}', '{quality.method.view,quality.method.edit}', 'core_created_by', 'NULL::uuid'),
      ('project_meetings', '{quality.meetings.view}', '{quality.meetings.view,quality.meetings.edit}', 'core_created_by', 'NULL::uuid'),
      ('project_interventions', '{quality.meetings.view}', '{quality.meetings.view,quality.meetings.edit}', 'core_created_by', 'NULL::uuid'),
      ('shared_reports', '{quality.reports.view}', '{quality.reports.view,quality.reports.edit}', 'core_created_by', 'NULL::uuid'),
      ('shared_report_snapshots', '{quality.reports.view}', '{quality.reports.view,quality.reports.edit}', 'core_created_by', 'NULL::uuid'),
      ('rbi_inspections', '{quality.inspections.view}', '{quality.inspections.view,quality.inspections.create}',
       'COALESCE(core_created_by, quality.member_by_email(core_company_id, engineer_name))', 'NULL::uuid'),
      ('rbi_tasks', '{quality.tasks.view}', '{quality.tasks.view,quality.tasks.create,quality.tasks.work}',
       'COALESCE(core_created_by, quality.member_by_email(core_company_id, engineer_name))', 'assigned_to_auth_user_id')) v(t, a_any, a_own, author, assignee) loop
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using '
                   '(quality.rec_ok(core_company_id, core_project_id, core_object_id, %L::text[], %L::text[], %s, %s, core_counterparty_id))',
                   r.t || '_select', r.t, r.a_any, r.a_own, r.author, r.assignee);
  end loop;
  for r in select * from (values
      ('construction_acceptance', '{construction.view}', 'contractor', 'core_created_by', 'contractor'),
      ('construction_defects', '{construction.view}', 'contractor', 'core_created_by', 'contractor'),
      ('rbi_draft_sessions', '{quality.view}', 'owner',
       'COALESCE(core_created_by, owner_auth_user_id, quality.member_by_email(core_company_id, engineer_name))', 'NULL::text'),
      ('rbi_sync_queue', '{quality.view,construction.view}', 'owner',
       'COALESCE(core_created_by, quality.member_by_email(core_company_id, engineer_name))', 'NULL::text')) v(t, acts, kind, author, cname) loop
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using '
                   '(quality.row_visible(core_company_id, core_project_id, %L::text[], %L::text, %s, NULL::uuid, NULL::text, %s))',
                   r.t || '_select', r.t, r.acts, r.kind, r.author, r.cname);
  end loop;
  for r in select * from (values
      ('construction_acceptance_v2', '{construction.acceptance.view}'),
      ('construction_defects_v2', '{construction.defects.view}')) v(t, acts) loop
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using ((core_company_id = quality.request_company()) '
                   'and core.row_allowed(core_company_id, core_project_id, core_location_id, %L::text[], core_created_by, core_counterparty_id))',
                   r.t || '_select', r.t, r.acts);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['rbi_inspection_items', 'rbi_inspection_photos'] loop
    execute format('drop policy %I on quality.%I', t || '_select', t);
    execute format('create policy %I on quality.%I for select to authenticated using '
                   '(quality.inspection_child_ok(core_company_id, core_project_id, inspection_id, core_created_by, false))', t || '_select', t);
  end loop;
end $$;

drop policy quality_files_select on storage.objects;
create policy quality_files_select on storage.objects for select to authenticated using (
  bucket_id like 'quality-%' and quality.storage_can(bucket_id, name, false));
drop policy quality_files_guard_select on storage.objects;
create policy quality_files_guard_select on storage.objects as restrictive for select to authenticated using (
  case when bucket_id like 'quality-%' then quality.storage_can(bucket_id, name, false) else true end);
drop function quality.storage_companies(text[]);
drop function public.pf_my_permissions_all(uuid[]);

drop function quality.area_ok(quality.area_scope, uuid, uuid, uuid, uuid);
drop function quality.area_scope(text[]);
drop type quality.area_scope;
drop function quality.visible_ok(quality.visible_scope, uuid, uuid, uuid, text);
drop function quality.visible_scope(text[], text);
drop type quality.visible_scope;
drop function quality.read_ok(quality.read_scope, uuid, uuid, uuid, uuid, uuid);
drop function quality.read_scope(text[], text[]);
drop type quality.read_scope;
drop function quality.readable_projects(text[]);
drop function quality.no_project();
drop function quality.any_project();

commit;
