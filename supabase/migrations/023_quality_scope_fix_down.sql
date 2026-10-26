-- P2-0018: откат 023_quality_scope_fix_up.sql — правила 020/022: проверки и задачи без запасного автора по почте,
-- пункты и фото — запись по своей проверке (как в 020), Стройконтроль 2.0 / черновики / очередь — как в 018 (quality.can),
-- справочник подрядчиков — как в 022. Применять до 022_quality_contractors_fix_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.member_by_email(uuid,text)') is null then
    raise exception '023 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
  if to_regprocedure('quality.contractor_only(uuid)') is not null then
    raise exception 'Сначала откатите 024: 024_quality_contractor_dirs_down.sql' using errcode = 'P0001';
  end if;
end $$;

do $$
declare r record; v_vis text; v_edit text;
begin
  for r in select * from (values
    ('rbi_inspections', '{quality.view}', '{quality.edit}', '''author'', core_created_by, null, contractor_canonical_key, contractor_name'),
    ('rbi_tasks', '{quality.view}', '{quality.edit}', '''author'', core_created_by, assigned_to_auth_user_id, contractor_canonical_key, contractor_name')
  ) v(t, va, ea, args) loop
    v_vis  := format('quality.row_visible(core_company_id, core_project_id, %L, %s)', r.va, r.args);
    v_edit := format('quality.row_visible(core_company_id, core_project_id, %L, %s)', r.ea, r.args);
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (%s)', r.t || '_select', r.t, v_vis);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
  for r in select * from (values
    ('construction_defects_v2', '{construction.view}', '{construction.edit}'), ('construction_acceptance_v2', '{construction.view}', '{construction.edit}'),
    ('rbi_draft_sessions', '{quality.view}', '{quality.edit}'), ('rbi_sync_queue', '{quality.view,construction.view}', '{quality.edit,construction.edit}')
  ) v(t, va, ea) loop
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (quality.can(core_company_id, core_project_id, %L))', r.t || '_select', r.t, r.va);
    execute format('create policy %I on quality.%I for insert to authenticated with check (quality.can(core_company_id, core_project_id, %L))', r.t || '_insert', r.t, r.ea);
    execute format('create policy %I on quality.%I for update to authenticated using (quality.can(core_company_id, core_project_id, %L))
  with check (quality.can(core_company_id, core_project_id, %L))', r.t || '_update', r.t, r.ea, r.ea);
    execute format('create policy %I on quality.%I for delete to authenticated using (quality.can(core_company_id, core_project_id, %L))', r.t || '_delete', r.t, r.ea);
    execute format('drop trigger %I on quality.%I', r.t || '_set_author', r.t);
    execute format('alter table quality.%I drop column core_created_by', r.t);
  end loop;
  for r in select unnest(array['rbi_inspection_items', 'rbi_inspection_photos']) t loop
    v_edit := 'quality.inspection_child_visible(core_company_id, core_project_id, ''{quality.edit}'', inspection_id, core_created_by)';
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
end $$;

drop function quality.inspection_child_writable(uuid, uuid, text[], text);
drop function quality.contractor_ref(uuid, text, text);

-- Как в 020.
create or replace function quality.assignment_sees(a core.role_assignments, m text, p_project uuid, p_kind text,
  p_author uuid, p_assignee uuid, p_ckey text, p_cname text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare
  v_acts text[] := array(select rp.action from core.company_role_permissions rp where rp.role_id = a.role_id and rp.company_id = a.company_id);
begin
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
end $$;

create or replace function quality.inspection_child_visible(p_company uuid, p_project uuid, p_actions text[], p_inspection text, p_author uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, contractor_canonical_key, contractor_name into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.row_visible(i.core_company_id, i.core_project_id, p_actions, 'author', i.core_created_by, null,
                               i.contractor_canonical_key, i.contractor_name);
  end if;
  return quality.row_visible(p_company, p_project, p_actions, 'author', p_author, null, null, null);
end $$;

drop function quality.member_by_email(uuid, text);

-- Как в 022.
create or replace function quality.on_directory_insert()
returns trigger language plpgsql security definer set search_path = pg_catalog, core, planfact as $$
declare
  v_id uuid;
  v_inn text := nullif(regexp_replace(coalesce(new.inn, ''), '\s', '', 'g'), '');
  v_new core.counterparties;
begin
  if new.is_deleted then return null; end if;
  if exists (select 1 from quality.contractor_core_links where core_company_id = new.core_company_id and canonical_key = new.canonical_key) then
    return null;
  end if;
  if v_inn !~ '^([0-9]{10}|[0-9]{12})$' then v_inn := null; end if;
  select id into v_id from core.counterparties
   where company_id = new.core_company_id and deleted_at is null and v_inn is not null and inn = v_inn limit 1;
  if v_id is null then
    select id into v_id from core.counterparties
     where company_id = new.core_company_id and deleted_at is null
       and quality.contractor_key(name) = new.canonical_key limit 1;
  end if;
  if v_id is null then
    if auth.uid() is not null and (select count(*) from core.audit_log a
         where a.company_id = new.core_company_id and a.table_name = 'counterparties' and a.action = 'INSERT' and a.actor = auth.uid()
           and a.new_data ->> 'source' = 'quality' and a.at > now() - interval '1 day') >= 20 then
      raise exception 'За сутки добавлено уже 20 новых подрядчиков — следующих добавит администратор в «Контрагентах»' using errcode = '42501';
    end if;
    perform set_config('quality.from_directory', '1', true);
    insert into core.counterparties(company_id, name, inn, kinds, draft)
    values (new.core_company_id, left(btrim(coalesce(nullif(new.display_name, ''), new.canonical_key)), 300), v_inn, array['contractor'], v_inn is null)
    returning * into v_new;
    perform set_config('quality.from_directory', '', true);
    v_id := v_new.id;
    perform planfact.log_admin_change(new.core_company_id, null, 'counterparties', v_id, 'INSERT', null,
      core.counterparty_snapshot(v_new) || jsonb_build_object('source', 'quality', 'draft', v_new.draft, 'by', auth.uid(),
        'via', jsonb_build_object('project_code', new.project_code, 'canonical_key', new.canonical_key)));
  else
    perform set_config('quality.from_directory', '1', true);
    update core.counterparties set kinds = array(select distinct k from unnest(kinds || array['contractor']) k order by 1)
     where id = v_id and not ('contractor' = any(kinds));
    perform set_config('quality.from_directory', '', true);
  end if;
  insert into quality.contractor_core_links(core_company_id, canonical_key, counterparty_id) values (new.core_company_id, new.canonical_key, v_id)
  on conflict (core_company_id, canonical_key) do nothing;
  perform quality.push_contractor((select c from core.counterparties c where c.id = v_id));
  return null;
end $$;

revoke all on function quality.assignment_sees(core.role_assignments, text, uuid, text, uuid, uuid, text, text),
  quality.inspection_child_visible(uuid, uuid, text[], text, uuid), quality.on_directory_insert() from public, anon, authenticated;
grant execute on function quality.inspection_child_visible(uuid, uuid, text[], text, uuid) to authenticated;

commit;
