-- P2-0018 доработка 1 (ревью Архитектора, reports/P2-0018/architect-review-1.md). Исправления области видимости 020:
--   1) ещё 4 таблицы с записями: замечания и приёмка Стройконтроля 2.0 (construction_defects_v2, construction_acceptance_v2) —
--      «свой подрядчик» по "contractorId" → quality.contractors (ключ / название); черновики проверок (rbi_draft_sessions) и
--      очередь отправки (rbi_sync_queue) — только свои (автор core_created_by ставит сервер; для старых строк — по почте
--      engineer_name / owner_auth_user_id) или с правом *.manage;
--   2) подрядчик (quality.scope.contractor без manage и core.counterparties.manage) не создаёт связей «ключ → контрагент»;
--   3) пункты и фото проверки — запись только к существующей проверке той же компании (без проверки — только *.manage);
--   4) старые проверки и задачи без автора — «свои» для инженера по engineer_name = почта сотрудника компании.
-- Объекты RBI не затрагивает. Применять после 022, одним запросом. Откат — 023_quality_scope_fix_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.row_visible(uuid,uuid,text[],text,uuid,uuid,text,text)') is null
     or not exists (select 1 from pg_proc where proname = 'on_directory_insert' and pronamespace = 'quality'::regnamespace
                    and prosrc like '%20 новых подрядчиков%') then
    raise exception '023: сначала 020, 021, 022' using errcode = 'P0001';
  end if;
  if to_regprocedure('quality.member_by_email(uuid,text)') is not null then
    raise exception '023 уже применена (повтор — только после 023_quality_scope_fix_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- Сотрудник компании по почте (для старых строк без автора) — только в текущей компании запроса (нужна правилам RLS).
create function quality.member_by_email(p_company uuid, p_email text)
returns uuid language sql stable security definer set search_path = pg_catalog, core as $$
  select m.user_id from core.company_members m join auth.users u on u.id = m.user_id
   where m.company_id = p_company and p_company = quality.request_company()   -- только своя текущая компания
     and nullif(btrim(coalesce(p_email, '')), '') is not null
     and lower(u.email::text) = lower(btrim(p_email)) limit 1;
$$;

-- Подрядчик записи Стройконтроля 2.0: "contractorId" → quality.contractors той же компании (p_what: 'key' | 'name').
create function quality.contractor_ref(p_company uuid, p_id text, p_what text)
returns text language sql stable security definer set search_path = pg_catalog as $$
  select case when p_what = 'key' then c.canonical_key else c."displayName" end
    from quality.contractors c where c.id = p_id and c.core_company_id = p_company and p_company = quality.request_company();
$$;

-- Что видит одно назначение: + вид 'owner' (черновики, очередь) — только своё или *.manage (вся компания — не повод).
create or replace function quality.assignment_sees(a core.role_assignments, m text, p_project uuid, p_kind text,
  p_author uuid, p_assignee uuid, p_ckey text, p_cname text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
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
end $$;

-- Запись пунктов и фото — только к существующей проверке той же компании; без проверки — только *.manage.
create function quality.inspection_child_writable(p_company uuid, p_project uuid, p_actions text[], p_inspection text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, contractor_canonical_key, contractor_name into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.row_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.contractor_canonical_key, i.contractor_name);
  end if;
  return quality.can(p_company, p_project, array(select replace(x, '.edit', '.manage') from unnest(p_actions) x));
end $$;

-- Чтение пунктов и фото — по своей проверке (автор старой проверки — по почте).
create or replace function quality.inspection_child_visible(p_company uuid, p_project uuid, p_actions text[], p_inspection text, p_author uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, contractor_canonical_key, contractor_name into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.row_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.contractor_canonical_key, i.contractor_name);
  end if;
  return quality.row_visible(p_company, p_project, p_actions, 'author', p_author, null, null, null);
end $$;

revoke all on function quality.member_by_email(uuid, text), quality.contractor_ref(uuid, text, text),
  quality.inspection_child_writable(uuid, uuid, text[], text) from public, anon, authenticated;
grant execute on function quality.inspection_child_writable(uuid, uuid, text[], text), quality.contractor_ref(uuid, text, text),
  quality.member_by_email(uuid, text) to authenticated;

-- Автор черновиков и очереди — сервер (как у проверок); старые черновики — владелец из owner_auth_user_id.
alter table quality.rbi_draft_sessions add column core_created_by uuid;
update quality.rbi_draft_sessions set core_created_by = owner_auth_user_id;
alter table quality.rbi_sync_queue add column core_created_by uuid;
create trigger rbi_draft_sessions_set_author before insert or update on quality.rbi_draft_sessions for each row execute function quality.set_author();
create trigger rbi_sync_queue_set_author before insert or update on quality.rbi_sync_queue for each row execute function quality.set_author();

do $$
declare r record; v_vis text; v_edit text;
begin
  for r in select * from (values
    ('rbi_inspections', '{quality.view}', '{quality.edit}',
       '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), null, contractor_canonical_key, contractor_name'),
    ('rbi_tasks', '{quality.view}', '{quality.edit}',
       '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, contractor_canonical_key, contractor_name'),
    ('construction_defects_v2', '{construction.view}', '{construction.edit}',
       '''contractor'', core_created_by, null, quality.contractor_ref(core_company_id, "contractorId", ''key''), quality.contractor_ref(core_company_id, "contractorId", ''name'')'),
    ('construction_acceptance_v2', '{construction.view}', '{construction.edit}',
       '''contractor'', core_created_by, null, quality.contractor_ref(core_company_id, "contractorId", ''key''), quality.contractor_ref(core_company_id, "contractorId", ''name'')'),
    ('rbi_draft_sessions', '{quality.view}', '{quality.edit}',
       '''owner'', coalesce(core_created_by, owner_auth_user_id, quality.member_by_email(core_company_id, engineer_name)), null, null, null'),
    ('rbi_sync_queue', '{quality.view,construction.view}', '{quality.edit,construction.edit}',
       '''owner'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), null, null, null')
  ) v(t, va, ea, args) loop
    if r.t like 'construction_%_v2' then
      execute format('alter table quality.%I add column core_created_by uuid', r.t);
      execute format('create trigger %I before insert or update on quality.%I for each row execute function quality.set_author()', r.t || '_set_author', r.t);
    end if;
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
  for r in select unnest(array['rbi_inspection_items', 'rbi_inspection_photos']) t loop
    v_edit := 'quality.inspection_child_writable(core_company_id, core_project_id, ''{quality.edit}'', inspection_id)';
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
end $$;

-- 2. Справочник подрядчиков: подрядчик связей не создаёт.
create or replace function quality.on_directory_insert()
returns trigger language plpgsql security definer set search_path = pg_catalog, core, planfact as $$
declare
  v_id uuid;
  v_inn text := nullif(regexp_replace(coalesce(new.inn, ''), '\s', '', 'g'), '');
  v_new core.counterparties;
begin
  if new.is_deleted then return null; end if;
  -- 023: подрядчик (своя фирма) связей «ключ → контрагент» и черновиков не создаёт (иначе мог бы привязать чужой ключ к своей фирме)
  if quality.has_actions(new.core_company_id, null, array['quality.scope.contractor'])
     and not quality.has_actions(new.core_company_id, null, array['quality.manage', 'construction.manage'])
     and not planfact.has_company_permission(new.core_company_id, 'core.counterparties.manage') then
    return null;
  end if;
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

revoke all on function quality.on_directory_insert() from public, anon, authenticated;

commit;
