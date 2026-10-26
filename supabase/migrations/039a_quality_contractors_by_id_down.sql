-- Откат P2-0035 этапа 2 (039a_quality_contractors_by_id_up.sql): правила таблиц с объектом записи и функции пунктов/фото —
-- снова как 039 (подрядчик — по ключу и названию, quality.object_row_visible); колонки core_counterparty_id, триггеры и
-- функции 039a удаляются. Связи ключей прежних названий контрагентов остаются (данные компании).
begin;

do $$
begin
  if to_regprocedure('quality.record_visible(uuid,uuid,text[],text,uuid,uuid,uuid,uuid)') is null then
    raise exception '039a не применена — откатывать нечего' using errcode = 'P0001';
  end if;
end $$;

-- 1. Правила — как 039.
do $$
declare r record; v_vis text; v_edit text;
begin
  for r in select * from (values
    ('rbi_inspections',
       '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), null, contractor_canonical_key, contractor_name'),
    ('rbi_tasks',
       '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, contractor_canonical_key, contractor_name'),
    ('sk_records',              '''contractor'', core_created_by, null, contractor_canonical_key, contractor_name'),
    ('project_fmea',            '''contractor'', core_created_by, null, null, contractor_name'),
    ('project_interventions',   '''contractor'', core_created_by, null, null, contractor_name'),
    ('project_meetings',        '''contractor'', core_created_by, null, null, contractor_name'),
    ('project_schedule_stages', '''contractor'', core_created_by, null, null, contractor_name'),
    ('shared_reports',          '''contractor'', core_created_by, null, contractor_canonical_key, null'),
    ('shared_report_snapshots', '''contractor'', core_created_by, null, contractor_canonical_key, null')
  ) v(t, args) loop
    v_vis  := format('quality.object_row_visible(core_company_id, core_project_id, %L, %s, core_object_id)', '{quality.view}', r.args);
    v_edit := format('quality.object_row_visible(core_company_id, core_project_id, %L, %s, core_object_id)', '{quality.edit}', r.args);
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

-- 2. Пункты и фото проверки — как 039.
create or replace function quality.inspection_child_visible(p_company uuid, p_project uuid, p_actions text[], p_inspection text, p_author uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, contractor_canonical_key, contractor_name, core_object_id into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.object_row_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.contractor_canonical_key, i.contractor_name,
      i.core_object_id);
  end if;
  return quality.row_visible(p_company, p_project, p_actions, 'author', p_author, null, null, null);
end $$;

create or replace function quality.inspection_child_writable(p_company uuid, p_project uuid, p_actions text[], p_inspection text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, contractor_canonical_key, contractor_name, core_object_id into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.object_row_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.contractor_canonical_key, i.contractor_name,
      i.core_object_id);
  end if;
  return quality.can(p_company, p_project, array(select replace(x, '.edit', '.manage') from unnest(p_actions) x));
end $$;

-- 3. Колонки, триггеры, функции 039a.
do $$
declare t text;
begin
  foreach t in array array['rbi_inspections', 'rbi_tasks', 'sk_records', 'project_fmea', 'project_interventions', 'project_meetings',
                           'project_schedule_stages', 'shared_reports', 'shared_report_snapshots'] loop
    execute format('drop trigger %I on quality.%I', t || '_record_counterparty', t);
    execute format('alter table quality.%I drop column core_counterparty_id', t);
  end loop;
end $$;
drop trigger counterparties_rename_link on core.counterparties;

drop function quality.counterparty_link_report(uuid);
drop function quality.record_visible(uuid, uuid, text[], text, uuid, uuid, uuid, uuid);
drop function quality.assignment_sees_id(core.role_assignments, text, uuid, text, uuid, uuid, uuid);
drop function quality.counterparty_rename_link();
drop function quality.set_record_counterparty();
drop function quality.counterparty_of(uuid, text, text);

commit;
