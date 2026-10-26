-- P2-0035 этап 2 (ADR-070 п. 1–4, ADR-068 п. 6; CRITICAL — правила доступа). Подрядчик записи Качества — по id контрагента ядра.
--   1) у записей с подрядчиком — колонка core_counterparty_id (контрагент ядра). Её пишет только сервер (триггер) из ключа
--      подрядчика записи, а если ключа нет — из названия (ключ как в Качестве, quality.contractor_key) — как правило 020:
--      связь «ключ Качества → контрагент» (quality.contractor_core_links) или контрагент с тем же ключом названия.
--      Ключ указывает на две фирмы или ни на одну — пусто («не разобрано», не угадывать). Правка записи без изменения
--      подрядчика сохраняет прежний id (переименование контрагента не отрывает записи);
--   2) «только своя фирма» (quality.scope.contractor) — по id: фирма назначения = контрагент записи;
--   3) переименование контрагента: ключ прежнего названия остаётся связью с ним (устройства со старым справочником узнаются).
-- Остальное — как 039. Применять после 039, одним запросом. Откат — 039a_quality_contractors_by_id_down.sql (дописанные
-- связи ключей остаются — данные компании).
begin;

do $$
begin
  if to_regprocedure('quality.object_row_visible(uuid,uuid,text[],text,uuid,uuid,text,text,uuid)') is null then
    raise exception '039a: сначала 039_quality_objects_by_id_up.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = 'rbi_inspections'
              and column_name = 'core_counterparty_id') then
    raise exception '039a уже применена (повтор — только после 039a_quality_contractors_by_id_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Контрагент записи: ключ (нет ключа — ключ названия) → одна фирма — её id; две или ни одной — null.
create function quality.counterparty_of(p_company uuid, p_key text, p_name text)
returns uuid language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_key text := nullif(btrim(coalesce(p_key, '')), ''); v uuid[];
begin
  if p_company is null then return null; end if;
  if v_key is null and nullif(btrim(coalesce(p_name, '')), '') is not null then v_key := quality.contractor_key(p_name); end if;
  if v_key is null or v_key = 'unknown_contractor' then return null; end if;
  select array_agg(distinct x) into v from (
    select l.counterparty_id x from quality.contractor_core_links l where l.core_company_id = p_company and l.canonical_key = v_key
    union all
    select c.id from core.counterparties c where c.company_id = p_company and c.deleted_at is null and quality.contractor_key(c.name) = v_key) s;
  return case when cardinality(v) = 1 then v[1] end;
end $$;

-- Триггер записи: id контрагента считает сервер; правка без изменения подрядчика записи — прежний id.
create function quality.set_record_counterparty()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare n jsonb := to_jsonb(new); o jsonb;
begin
  if coalesce(current_setting('quality.object_bind', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    if (n ->> 'contractor_canonical_key', n ->> 'contractor_name', n ->> 'core_company_id')
       is not distinct from (o ->> 'contractor_canonical_key', o ->> 'contractor_name', o ->> 'core_company_id') then
      new.core_counterparty_id := old.core_counterparty_id;
      return new;
    end if;
  end if;
  new.core_counterparty_id := quality.counterparty_of(new.core_company_id, n ->> 'contractor_canonical_key', n ->> 'contractor_name');
  return new;
end $$;

-- Таблицы с подрядчиком записи: колонка, ссылка на контрагента (той же компании), индекс, триггер, заполнение существующих.
do $$
declare t text; v_key text; v_nm text;
begin
  perform set_config('quality.object_bind', '1', true);
  foreach t in array array['rbi_inspections', 'rbi_tasks', 'sk_records', 'project_fmea', 'project_interventions', 'project_meetings',
                           'project_schedule_stages', 'shared_reports', 'shared_report_snapshots'] loop
    execute format('alter table quality.%I add column core_counterparty_id uuid', t);
    execute format('alter table quality.%I add constraint %I foreign key (core_counterparty_id, core_company_id) references core.counterparties(id, company_id)',
                   t, t || '_core_counterparty_fk');
    execute format('create index %I on quality.%I (core_company_id, core_counterparty_id)', t || '_core_counterparty_idx', t);
    execute format('comment on column quality.%I.core_counterparty_id is %L', t, 'P2-0035: контрагент ядра (подрядчик) записи (пишет сервер; пусто — без подрядчика или «не разобрано»)');
    execute format('create trigger %I before insert or update on quality.%I for each row execute function quality.set_record_counterparty()',
                   t || '_record_counterparty', t);
    v_key := case when exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = t and column_name = 'contractor_canonical_key')
                  then 'r.contractor_canonical_key' else 'null::text' end;
    v_nm := case when exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = t and column_name = 'contractor_name')
                 then 'r.contractor_name' else 'null::text' end;
    -- различные сочетания — один раз (materialized: узнавание не повторяется на каждую строку)
    execute format($q$
      with m as materialized (
        select c, k, nm, quality.counterparty_of(c, k, nm) cid
          from (select distinct r.core_company_id c, %2$s k, %3$s nm from quality.%1$I r) d)
      update quality.%1$I r set core_counterparty_id = m.cid from m
       where m.cid is not null and r.core_company_id = m.c and %2$s is not distinct from m.k and %3$s is not distinct from m.nm$q$,
      t, v_key, v_nm);
  end loop;
  perform set_config('quality.object_bind', '', true);
end $$;

-- 2. Переименование контрагента: ключ прежнего названия остаётся связью с ним (если ключ не занят другой фирмой).
create function quality.counterparty_rename_link()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.name is distinct from old.name and quality.contractor_key(old.name) <> 'unknown_contractor'
     and quality.contractor_key(old.name) <> quality.contractor_key(new.name) then
    insert into quality.contractor_core_links(core_company_id, canonical_key, counterparty_id)
    values (new.company_id, quality.contractor_key(old.name), new.id)
    on conflict (core_company_id, canonical_key) do nothing;
  end if;
  return null;
end $$;
create trigger counterparties_rename_link after update of name on core.counterparties
  for each row execute function quality.counterparty_rename_link();

-- 3. Видимость строки: как 039, «только своя фирма» — по id контрагента записи (p_counterparty).
create function quality.assignment_sees_id(a core.role_assignments, m text, p_project uuid, p_kind text,
  p_author uuid, p_assignee uuid, p_counterparty uuid)
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
    return a.counterparty_id is not null and p_counterparty is not null and a.counterparty_id = p_counterparty;
  end if;
  if p_kind = 'author' and (m || '.edit') = any(v_acts) then
    return auth.uid() is not null and (p_author = auth.uid() or p_assignee = auth.uid());
  end if;
  return true;
end $$;

create function quality.record_visible(p_company uuid, p_project uuid, p_actions text[], p_kind text,
  p_author uuid, p_assignee uuid, p_counterparty uuid, p_object uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  select p_company is not null and p_company = quality.request_company() and exists (
    select 1 from unnest(p_actions) act
    join core.company_modules cm on cm.company_id = p_company and cm.module = split_part(act, '.', 1) and cm.enabled
    where planfact.is_platform_admin() or exists (
      select 1 from core.role_assignments a
      join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = act
      where a.company_id = p_company and a.user_id = auth.uid()
        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
        and case
          when p_kind not in ('author', 'contractor') or a.quality_objects is null then
            quality.assignment_sees_id(a, split_part(act, '.', 1), p_project, p_kind, p_author, p_assignee, p_counterparty)
          when p_object is null then
            coalesce(auth.uid() = p_author or auth.uid() = p_assignee, false)
            and quality.assignment_sees_id(a, split_part(act, '.', 1), p_project, p_kind, p_author, p_assignee, p_counterparty)
          when exists (select 1 from quality.project_objects po
                        where po.core_object_id = p_object and po.core_company_id = p_company
                          and po.id = any (a.quality_objects) and quality.object_alive(po)) then
            quality.assignment_sees_id(a, split_part(act, '.', 1), p_project,
              case when split_part(act, '.', 2) = 'view' then 'contractor' else p_kind end, p_author, p_assignee, p_counterparty)
          else false end));
$$;

create or replace function quality.inspection_child_visible(p_company uuid, p_project uuid, p_actions text[], p_inspection text, p_author uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, core_counterparty_id, core_object_id into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.record_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.core_counterparty_id, i.core_object_id);
  end if;
  return quality.row_visible(p_company, p_project, p_actions, 'author', p_author, null, null, null);
end $$;

create or replace function quality.inspection_child_writable(p_company uuid, p_project uuid, p_actions text[], p_inspection text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, core_counterparty_id, core_object_id into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.record_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.core_counterparty_id, i.core_object_id);
  end if;
  return quality.can(p_company, p_project, array(select replace(x, '.edit', '.manage') from unnest(p_actions) x));
end $$;

do $$
declare r record; v_vis text; v_edit text;
begin
  for r in select * from (values
    ('rbi_inspections',         '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), null'),
    ('rbi_tasks',               '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id'),
    ('sk_records',              '''contractor'', core_created_by, null'),
    ('project_fmea',            '''contractor'', core_created_by, null'),
    ('project_interventions',   '''contractor'', core_created_by, null'),
    ('project_meetings',        '''contractor'', core_created_by, null'),
    ('project_schedule_stages', '''contractor'', core_created_by, null'),
    ('shared_reports',          '''contractor'', core_created_by, null'),
    ('shared_report_snapshots', '''contractor'', core_created_by, null')
  ) v(t, args) loop
    v_vis  := format('quality.record_visible(core_company_id, core_project_id, %L, %s, core_counterparty_id, core_object_id)', '{quality.view}', r.args);
    v_edit := format('quality.record_visible(core_company_id, core_project_id, %L, %s, core_counterparty_id, core_object_id)', '{quality.edit}', r.args);
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

-- 4. Сводка (только чтение; SQL Editor): по таблицам — строк, с контрагентом, «не разобрано» (подрядчик в тексте есть, фирмы нет).
create function quality.counterparty_link_report(p_company uuid)
returns table (t text, total bigint, linked bigint, unresolved bigint) language plpgsql stable security definer set search_path = pg_catalog as $$
declare x text; v_key text; v_nm text;
begin
  foreach x in array array['rbi_inspections', 'rbi_tasks', 'sk_records', 'project_fmea', 'project_interventions', 'project_meetings',
                           'project_schedule_stages', 'shared_reports', 'shared_report_snapshots'] loop
    v_key := case when exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = x and column_name = 'contractor_canonical_key')
                  then 'contractor_canonical_key' else 'null::text' end;
    v_nm := case when exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = x and column_name = 'contractor_name')
                 then 'contractor_name' else 'null::text' end;
    return query execute format($q$
      select %1$L::text, count(*), count(core_counterparty_id),
             count(*) filter (where core_counterparty_id is null
               and coalesce(nullif(btrim(%2$s), ''), quality.contractor_key(nullif(btrim(%3$s), ''))) not in ('', 'unknown_contractor'))
        from quality.%1$I where core_company_id = $1$q$, x, v_key, v_nm) using p_company;
  end loop;
end $$;

revoke all on function quality.counterparty_of(uuid, text, text), quality.set_record_counterparty(), quality.counterparty_rename_link(),
  quality.assignment_sees_id(core.role_assignments, text, uuid, text, uuid, uuid, uuid),
  quality.record_visible(uuid, uuid, text[], text, uuid, uuid, uuid, uuid), quality.counterparty_link_report(uuid)
  from public, anon, authenticated;
grant execute on function quality.record_visible(uuid, uuid, text[], text, uuid, uuid, uuid, uuid) to authenticated;

commit;
