-- P2-0044 этап 1 (CRITICAL — правила доступа): кабинет подрядчика на замечаниях Стройконтроля.
--  1) замечания и приёмки Стройконтроля 2.0 (construction_defects_v2, construction_acceptance_v2) — фирма по id контрагента ядра,
--     как записи Качества с 039a: колонка core_counterparty_id, её пишет сервер (триггер) из "contractorId" → справочник фирм
--     объекта quality.contractor_directory (или quality.contractors) → ключ и название → quality.counterparty_of (одна фирма — id,
--     две или ни одной — пусто, не угадывать). Правка без смены подрядчика сохраняет прежний id. Проба на сервере 26.10.2026:
--     25 из 25 строк с подрядчиком привязываются однозначно (scripts/p2-0044/01_dryrun.sql);
--  2) «только своя фирма» в этих таблицах — по id (quality.row_visible_id: как row_visible, сравнение фирмы — assignment_sees_id);
--  3) подрядчик (назначение с quality.scope.contractor, без назначений правки без этого ограничения) в замечаниях
--     (construction_defects, construction_defects_v2): не создаёт и не удаляет; меняет только статус и историю —
--     переходы issued|rejected → in_progress → fixed, история только дописывается; прочие поля строки сервер оставляет
--     прежними (приложение присылает строку целиком). Принять/отклонить — инженер.
-- Приёмки (construction_acceptance*) — только п. 1–2: заявку на приёмку подрядчик подаёт сам (acceptance-form), как раньше.
-- Применять после 042, одним запросом. Откат — 043_contractor_cabinet_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.assignment_sees_id(core.role_assignments,text,uuid,text,uuid,uuid,uuid)') is null then
    raise exception '043: сначала 039a_quality_contractors_by_id_up.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = 'construction_defects_v2'
              and column_name = 'core_counterparty_id') then
    raise exception '043 уже применена (повтор — только после 043_contractor_cabinet_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Контрагент записи Стройконтроля 2.0: "contractorId" → справочник фирм → ключ/название → одна фирма ядра.
create function quality.construction_counterparty(p_company uuid, p_contractor text)
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select quality.counterparty_of(p_company, coalesce(d.canonical_key, k.canonical_key), coalesce(d.display_name, k."displayName"))
    from (select 1) one
    left join quality.contractor_directory d on d.id::text = p_contractor and d.core_company_id = p_company
    left join quality.contractors k on k.id = p_contractor and k.core_company_id = p_company
   where nullif(btrim(coalesce(p_contractor, '')), '') is not null and coalesce(d.id::text, k.id) is not null;
$$;
revoke all on function quality.construction_counterparty(uuid, text) from public, anon, authenticated;

create function quality.set_construction_counterparty()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if tg_op = 'UPDATE' and (new."contractorId", new.core_company_id) is not distinct from (old."contractorId", old.core_company_id) then
    new.core_counterparty_id := old.core_counterparty_id;
    return new;
  end if;
  new.core_counterparty_id := quality.construction_counterparty(new.core_company_id, new."contractorId");
  return new;
end $$;
revoke all on function quality.set_construction_counterparty() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['construction_defects_v2', 'construction_acceptance_v2'] loop
    execute format('alter table quality.%I add column core_counterparty_id uuid', t);
    execute format('alter table quality.%I add constraint %I foreign key (core_counterparty_id, core_company_id) references core.counterparties(id, company_id)',
                   t, t || '_core_counterparty_fk');
    execute format('create index %I on quality.%I (core_company_id, core_counterparty_id)', t || '_core_counterparty_idx', t);
    execute format('comment on column quality.%I.core_counterparty_id is %L', t,
                   'P2-0044: контрагент ядра (подрядчик) записи (пишет сервер; пусто — без подрядчика или «не разобрано»)');
    execute format('update quality.%I set core_counterparty_id = quality.construction_counterparty(core_company_id, "contractorId") '
                   'where nullif(btrim(coalesce("contractorId", %L)), %L) is not null', t, '', '');
    execute format('create trigger %I before insert or update on quality.%I for each row execute function quality.set_construction_counterparty()',
                   t || '_construction_counterparty', t);
  end loop;
end $$;

-- 2. Видимость по id фирмы (как row_visible без объектов — права Стройконтроля по объектам не менялись).
create function quality.row_visible_id(p_company uuid, p_project uuid, p_actions text[], p_kind text, p_author uuid,
  p_assignee uuid, p_counterparty uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  select p_company is not null and p_company = quality.request_company() and exists (
    select 1 from unnest(p_actions) act
    join core.company_modules cm on cm.company_id = p_company and cm.module = split_part(act, '.', 1) and cm.enabled
    where planfact.is_platform_admin() or exists (
      select 1 from core.role_assignments a
      join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = act
      where a.company_id = p_company and a.user_id = auth.uid()
        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
        and quality.assignment_sees_id(a, split_part(act, '.', 1), p_project, p_kind, p_author, p_assignee, p_counterparty)));
$$;
revoke all on function quality.row_visible_id(uuid, uuid, text[], text, uuid, uuid, uuid) from public, anon;
grant execute on function quality.row_visible_id(uuid, uuid, text[], text, uuid, uuid, uuid) to authenticated;

do $$
declare t text; v_vis text; v_edit text;
begin
  foreach t in array array['construction_defects_v2', 'construction_acceptance_v2'] loop
    v_vis  := 'quality.row_visible_id(core_company_id, core_project_id, ''{construction.view}'', ''contractor'', core_created_by, null, core_counterparty_id)';
    v_edit := 'quality.row_visible_id(core_company_id, core_project_id, ''{construction.edit}'', ''contractor'', core_created_by, null, core_counterparty_id)';
    execute format('drop policy %I on quality.%I', t || '_select', t);
    execute format('drop policy %I on quality.%I', t || '_insert', t);
    execute format('drop policy %I on quality.%I', t || '_update', t);
    execute format('drop policy %I on quality.%I', t || '_delete', t);
    execute format('create policy %I on quality.%I for select to authenticated using (%s)', t || '_select', t, v_vis);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', t || '_insert', t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', t || '_update', t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', t || '_delete', t, v_edit);
  end loop;
end $$;

-- 3. Подрядчик в замечаниях: только «В работу» / «Устранено» (статус и дописанная история).
-- Подрядчик = есть действующее назначение с construction.edit и quality.scope.contractor на этот объект и нет назначения
-- с construction.edit без этого ограничения (инженер, руководитель); администратор платформы — не подрядчик.
create function quality.contractor_limited(p_company uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  with a as (
    select array(select rp.action from core.company_role_permissions rp where rp.role_id = x.role_id and rp.company_id = x.company_id) acts
      from core.role_assignments x
     where x.company_id = p_company and x.user_id = auth.uid()
       and x.revoked_at is null and x.valid_from <= now() and (x.valid_to is null or x.valid_to > now())
       and (p_project is null or x.project_id is null or x.project_id = p_project))
  select auth.uid() is not null and not planfact.is_platform_admin()
     and exists (select 1 from a where 'construction.edit' = any(acts) and 'quality.scope.contractor' = any(acts))
     and not exists (select 1 from a where 'construction.edit' = any(acts) and not 'quality.scope.contractor' = any(acts));
$$;
revoke all on function quality.contractor_limited(uuid, uuid) from public, anon, authenticated;

create function quality.contractor_defect_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  n jsonb; o jsonb; v_old text; v_new text; v_oh jsonb; v_nh jsonb; v_exists boolean;
begin
  if tg_op = 'DELETE' then
    if not quality.contractor_limited(old.core_company_id, old.core_project_id) then return old; end if;
    raise exception 'Подрядчик не удаляет замечания' using errcode = '42501';
  end if;
  if not quality.contractor_limited(new.core_company_id, new.core_project_id) then return new; end if;
  if tg_op = 'INSERT' then
    -- приложение отправляет правку как upsert: для существующего замечания проверка — в BEFORE UPDATE (тот же сторож)
    execute format('select exists (select 1 from %I.%I where id = $1 and core_company_id = $2)', tg_table_schema, tg_table_name)
      into v_exists using new.id, new.core_company_id;
    if v_exists then return new; end if;
    raise exception 'Подрядчик не создаёт замечания' using errcode = '42501';
  end if;
  n := to_jsonb(new); o := to_jsonb(old);
  if (n -> 'contractorId', n -> 'contractor') is distinct from (o -> 'contractorId', o -> 'contractor') then
    raise exception 'Подрядчик не переводит замечание на другую фирму' using errcode = '42501';
  end if;
  v_old := coalesce(nullif(o ->> 'status', ''), 'issued');
  v_new := coalesce(nullif(n ->> 'status', ''), 'issued');
  if v_new is distinct from v_old and not ((v_old, v_new) in (('issued', 'in_progress'), ('issued', 'fixed'), ('in_progress', 'fixed'),
                                                              ('rejected', 'in_progress'), ('rejected', 'fixed'))) then
    raise exception 'Подрядчик не переводит замечание из «%» в «%»', v_old, v_new using errcode = '42501';
  end if;
  -- история только дописывается: прежние записи — без изменений и в том же порядке
  v_oh := case when jsonb_typeof(o -> 'history') = 'array' then o -> 'history' else '[]'::jsonb end;
  v_nh := case when jsonb_typeof(n -> 'history') = 'array' then n -> 'history' else '[]'::jsonb end;
  if jsonb_array_length(v_nh) < jsonb_array_length(v_oh)
     or coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(v_nh) with ordinality h(e, i)
                   where i <= jsonb_array_length(v_oh)), '[]'::jsonb) <> v_oh then
    raise exception 'Подрядчик не меняет историю замечания (только дописывает)' using errcode = '42501';
  end if;
  -- остальные поля (текст, срок, фирма, место, пометка удаления …) — как были: приложение присылает строку целиком
  new := jsonb_populate_record(new, o - array['status', 'history', 'updated_at', 'version', 'sync_status']);
  return new;
end $$;
revoke all on function quality.contractor_defect_guard() from public, anon, authenticated;

-- «zz_» — последним из триггеров BEFORE: сторож видит строку после привязки компании, автора и фирмы
create trigger zz_contractor_defect_guard before insert or update or delete on quality.construction_defects
  for each row execute function quality.contractor_defect_guard();
create trigger zz_contractor_defect_guard before insert or update or delete on quality.construction_defects_v2
  for each row execute function quality.contractor_defect_guard();
commit;
