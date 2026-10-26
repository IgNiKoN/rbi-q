-- Откат P2-0035 этапа 1 (039_quality_objects_by_id_up.sql): правила таблиц с объектом записи и функции пунктов/фото — снова
-- по тексту объекта (как 033/033b); колонки core_object_id, триггеры и функции 039 удаляются.
-- Объекты ядра, созданные для объектов Качества, и синонимы, дописанные при переименовании, остаются (данные компании;
-- при повторном применении 039 объекты ядра находятся по названию, новые не создаются).
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = 'project_objects'
                  and column_name = 'core_object_id') then
    raise exception '039 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
end $$;

-- 1. Правила таблиц с объектом записи — как 033 (функция quality.row_visible 033b).
do $$
declare r record; v_vis text; v_edit text;
begin
  for r in select * from (values
    ('rbi_inspections',
       '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), null, contractor_canonical_key, contractor_name',
       'array["projectId", project_canonical_key, project_display_name]'),
    ('rbi_tasks',
       '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, contractor_canonical_key, contractor_name',
       'array[null, project_canonical_key, project_display_name]'),
    ('sk_records',              '''contractor'', core_created_by, null, contractor_canonical_key, contractor_name',
       'array["projectId", project_canonical_key, project_display_name]'),
    ('project_fmea',            '''contractor'', core_created_by, null, null, contractor_name', 'array[null, project_canonical_key, project_display_name]'),
    ('project_interventions',   '''contractor'', core_created_by, null, null, contractor_name', 'array[null, project_canonical_key, project_display_name]'),
    ('project_meetings',        '''contractor'', core_created_by, null, null, contractor_name', 'array[null, project_canonical_key, project_display_name]'),
    ('project_schedule_stages', '''contractor'', core_created_by, null, null, contractor_name', 'array[null, project_canonical_key, project_display_name]'),
    ('shared_reports',          '''contractor'', core_created_by, null, contractor_canonical_key, null', 'array[null, project_canonical_key, project_display_name]'),
    ('shared_report_snapshots', '''contractor'', core_created_by, null, contractor_canonical_key, null', 'array[null, project_canonical_key]')
  ) v(t, args, obj) loop
    v_vis  := format('quality.row_visible(core_company_id, core_project_id, %L, %s, %s)', '{quality.view}', r.args, r.obj);
    v_edit := format('quality.row_visible(core_company_id, core_project_id, %L, %s, %s)', '{quality.edit}', r.args, r.obj);
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (%s)', r.t || '_select', r.t, v_vis);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
end $$;

-- 2. Пункты и фото проверки — как 033.
create or replace function quality.inspection_child_visible(p_company uuid, p_project uuid, p_actions text[], p_inspection text, p_author uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, contractor_canonical_key, contractor_name,
         "projectId", project_canonical_key, project_display_name into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.row_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.contractor_canonical_key, i.contractor_name,
      array[i."projectId", i.project_canonical_key, i.project_display_name]);
  end if;
  return quality.row_visible(p_company, p_project, p_actions, 'author', p_author, null, null, null);
end $$;

create or replace function quality.inspection_child_writable(p_company uuid, p_project uuid, p_actions text[], p_inspection text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, contractor_canonical_key, contractor_name,
         "projectId", project_canonical_key, project_display_name into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.row_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.contractor_canonical_key, i.contractor_name,
      array[i."projectId", i.project_canonical_key, i.project_display_name]);
  end if;
  return quality.can(p_company, p_project, array(select replace(x, '.edit', '.manage') from unnest(p_actions) x));
end $$;

-- 3. Колонки, триггеры, функции 039.
do $$
declare t text;
begin
  foreach t in array array['rbi_inspections', 'rbi_inspection_items', 'rbi_inspection_photos', 'rbi_tasks', 'sk_records', 'sk_volumes',
                           'sk_data_bundles', 'sk_import_batches', 'project_fmea', 'project_interventions', 'project_meetings',
                           'project_schedule_stages', 'shared_reports', 'shared_report_snapshots'] loop
    execute format('drop trigger %I on quality.%I', t || '_record_object', t);
    execute format('alter table quality.%I drop column core_object_id', t);
  end loop;
end $$;
drop trigger project_objects_core_object on quality.project_objects;
alter table quality.project_objects drop column core_object_id;

drop function quality.object_link_report(uuid);
drop function quality.object_row_visible(uuid, uuid, text[], text, uuid, uuid, text, text, uuid);
drop function quality.set_record_object();
drop function quality.object_of(uuid, text, text, text);
drop function quality.object_candidates(uuid, text, text, text);
drop function quality.project_object_core();
drop function quality.ensure_core_object(quality.project_objects);
drop function quality.object_alive(quality.project_objects);

commit;
