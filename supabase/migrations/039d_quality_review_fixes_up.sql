-- P2-0035 доработка 1 (ревью `reports/P2-0035/review-1.md`). Применять после 039c, одним запросом. Откат — 039d_…_down.sql.
--   M1: объект Качества, созданный сервером, уступает пришедшему с тем же ключом — закрепления сотрудников (core.role_assignments.
--       quality_objects) переходят на пришедший (журнал изменений), видимость не теряется;
--   M3: «не разобрано» узнаётся заново один раз на запрос (в конце оператора — quality.reresolve_flush), а не на каждую строку;
--       синоним или связь подрядчика, присланные устройством без изменений, пересчёт не вызывают;
--   L6: переименование узла-объекта дерева меняет объект Качества и ядра, только если узел однозначно указывает на объект
--       по ключу или названию (не по синониму).
begin;

do $$
begin
  if to_regprocedure('quality.sync_company_objects(uuid)') is null then
    raise exception '039d: сначала 039c_quality_objects_backfill_up.sql' using errcode = 'P0001';
  end if;
  if to_regprocedure('quality.reresolve_later(uuid)') is not null then
    raise exception '039d уже применена (повтор — только после 039d_quality_review_fixes_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- M3. Отложенный пересчёт: компания — в список запроса; в конце оператора — один пересчёт на компанию.
create function quality.reresolve_later(p_company uuid)
returns void language sql security definer set search_path = pg_catalog as $$
  select set_config('quality.reresolve_pending',
    case when p_company is null or position(p_company::text in coalesce(current_setting('quality.reresolve_pending', true), '')) > 0
         then coalesce(current_setting('quality.reresolve_pending', true), '')
         else coalesce(current_setting('quality.reresolve_pending', true), '') || p_company::text || ',' end, true);
$$;

create function quality.reresolve_flush()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v text := coalesce(current_setting('quality.reresolve_pending', true), ''); x text;
begin
  if v = '' then return null; end if;
  perform set_config('quality.reresolve_pending', '', true);
  foreach x in array string_to_array(rtrim(v, ','), ',') loop
    perform quality.reresolve(x::uuid);
  end loop;
  return null;
end $$;

create or replace function quality.node_object_sync()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_po quality.project_objects; v_names text[]; v_old text[];
begin
  if new."nodeType" is distinct from 'object' or coalesce(new.is_deleted, false) or coalesce(new."parentId", '') <> ''
     or coalesce(current_setting('quality.object_sync', true), '') = '1' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old."nodeType" = 'object' and not coalesce(old.is_deleted, false) and coalesce(old."parentId", '') = ''
     and array(select unnest(quality.node_names(new)) order by 1) = array(select unnest(quality.node_names(old)) order by 1) then
    return null;   -- устройство переслало узел без изменения названий
  end if;
  v_names := array[quality.object_clean(coalesce(nullif(new.canonical_key, ''), new."displayName")), quality.object_clean(new."displayName")];
  if tg_op = 'UPDATE' and quality.object_clean(new."displayName") is distinct from quality.object_clean(old."displayName") then
    v_old := array[quality.object_clean(coalesce(nullif(old.canonical_key, ''), old."displayName")), quality.object_clean(old."displayName")];
  end if;
  if v_old is null then
    select * into v_po from quality.project_objects po
     where po.core_company_id = new.core_company_id and quality.object_alive(po) and quality.po_names(po) && v_names
     order by po.created_at, po.id limit 1;
  else
    -- 039d (ревью L6): переименование — объект Качества, созданный из этого узла, или единственный с тем же названием
    -- (не ключом и не синонимом: ключ после переименования остаётся прежним и мог перейти к другому узлу)
    select * into v_po from quality.project_objects po
     where po.core_company_id = new.core_company_id and quality.object_alive(po) and po.id = 'obj_' || replace(new.id, '-', '');
    if v_po.id is null then
      select * into v_po from quality.project_objects po
       where po.core_company_id = new.core_company_id and quality.object_alive(po)
         and quality.object_clean(po.display_name) = quality.object_clean(old."displayName")
         and (select count(*) from quality.project_objects p2 where p2.core_company_id = new.core_company_id and quality.object_alive(p2)
                and quality.object_clean(p2.display_name) = quality.object_clean(old."displayName")) = 1;
    end if;
    if v_po.id is null then   -- неоднозначно или не найдено: как новый узел, объект ядра не переименовывается
      v_old := null;
      select * into v_po from quality.project_objects po
       where po.core_company_id = new.core_company_id and quality.object_alive(po) and quality.po_names(po) && v_names
       order by po.created_at, po.id limit 1;
    end if;
  end if;
  perform set_config('quality.object_sync', '1', true);
  if v_po.id is null then
    insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id, created_by_name)
    values ('obj_' || replace(new.id, '-', ''), coalesce(nullif(btrim(new.canonical_key), ''), quality.object_clean(new."displayName")),
            coalesce(nullif(btrim(new."displayName"), ''), new.canonical_key), '{}', new.core_company_id, 'P2-0035 узел дерева Качества')
    on conflict do nothing;
  elsif v_old is not null then
    update quality.project_objects set display_name = new."displayName" where id = v_po.id;
    if v_po.core_object_id is not null and exists (select 1 from core.projects where id = v_po.core_object_id and name is distinct from btrim(new."displayName")) then
      update core.projects set name = btrim(new."displayName") where id = v_po.core_object_id;
      perform planfact.log_admin_change(new.core_company_id, v_po.core_object_id, 'projects', v_po.core_object_id, 'UPDATE', null,
        jsonb_build_object('name', btrim(new."displayName"), 'source', 'P2-0035 узел дерева Качества ' || new.id));
    end if;
  end if;
  perform set_config('quality.object_sync', '', true);
  perform quality.reresolve_later(new.core_company_id);
  return null;
end $$;

create or replace function quality.reresolve_trigger()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  -- 039d (ревью M3): устройство переслало синоним или связь без изменений — пересчёт не нужен
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at' - 'updated_by_auth_user_id' - 'sync_status') = (to_jsonb(old) - 'updated_at' - 'updated_by_auth_user_id' - 'sync_status') then
    return null;
  end if;
  if coalesce(current_setting('quality.object_sync', true), '') <> '1' then
    perform quality.reresolve_later(coalesce(to_jsonb(new) ->> 'core_company_id', to_jsonb(old) ->> 'core_company_id')::uuid);
  end if;
  return null;
end $$;

create or replace function quality.project_objects_reresolve()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if tg_op = 'UPDATE' and array(select unnest(quality.po_names(new)) order by 1) = array(select unnest(quality.po_names(old)) order by 1)
     and quality.object_alive(new) = quality.object_alive(old) and new.core_object_id is not distinct from old.core_object_id then
    return null;
  end if;
  if coalesce(current_setting('quality.object_sync', true), '') <> '1' then
    perform quality.reresolve_later(new.core_company_id);
  end if;
  return null;
end $$;

create or replace function quality.core_project_sync()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.quality_container or coalesce(current_setting('quality.object_sync', true), '') = '1' then return null; end if;
  if not exists (select 1 from core.company_modules cm where cm.company_id = new.company_id and cm.module = 'quality' and cm.enabled) then
    return null;
  end if;
  perform set_config('quality.object_sync', '1', true);
  if tg_op = 'INSERT' then
    perform quality.project_to_quality(new);
  elsif new.name is distinct from old.name then
    update quality.project_objects set display_name = new.name where core_company_id = new.company_id and core_object_id = new.id;
    update quality.location_nodes n set "displayName" = new.name,
           synonyms = case when quality.object_clean(old.name) = any (quality.node_names(n)) and quality.object_clean(old.name) <> quality.object_clean(n."displayName")
                           then n.synonyms else coalesce(case when jsonb_typeof(n.synonyms) = 'array' then n.synonyms end, '[]') || to_jsonb(old.name) end,
           updated_at = now()
     where n.core_company_id = new.company_id and n."nodeType" = 'object' and not coalesce(n.is_deleted, false)
       and quality.object_clean(n."displayName") = quality.object_clean(old.name);
  end if;
  perform set_config('quality.object_sync', '', true);
  perform quality.reresolve_later(new.company_id);
  return null;
end $$;

-- M1.
create or replace function quality.project_object_core()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare x text; v_core uuid; v_old_id text; a core.role_assignments;
begin
  if coalesce(current_setting('quality.object_bind', true), '') <> '1' then
    new.core_object_id := case when tg_op = 'UPDATE' then old.core_object_id end;
  end if;
  if tg_op = 'INSERT' then
    delete from quality.project_objects po
     where po.core_company_id = new.core_company_id and po.canonical_key = new.canonical_key and po.id <> new.id
       and po.created_by_name in ('P2-0035 узел дерева Качества', 'P2-0035 объект компании')
    returning po.core_object_id, po.id into v_core, v_old_id;
    new.core_object_id := coalesce(new.core_object_id, v_core);
    -- 039d (ревью M1): закрепления сотрудников за убранным объектом — на пришедший
    if v_old_id is not null then
      for a in select * from core.role_assignments ra where ra.company_id = new.core_company_id and ra.quality_objects @> array[v_old_id] loop
        update core.role_assignments set quality_objects = array_replace(quality_objects, v_old_id, new.id) where id = a.id;
        perform planfact.log_admin_change(new.core_company_id, null, 'role_assignments', a.id, 'UPDATE',
          jsonb_build_object('quality_objects', a.quality_objects),
          jsonb_build_object('quality_objects', array_replace(a.quality_objects, v_old_id, new.id), 'source', 'P2-0035 039d: объект Качества ' || v_old_id || ' → ' || new.id));
      end loop;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    foreach x in array array[old.display_name, old.canonical_key] loop
      if quality.object_clean(x) <> '' and quality.object_clean(x) not in (quality.object_clean(new.display_name), quality.object_clean(new.canonical_key))
         and not exists (select 1 from unnest(coalesce(new.synonyms, '{}')) y where quality.object_clean(y) = quality.object_clean(x)) then
        new.synonyms := coalesce(new.synonyms, '{}') || x;
      end if;
    end loop;
  end if;
  if new.core_object_id is null and quality.object_alive(new) then
    new.core_object_id := quality.ensure_core_object(new);
  end if;
  return new;
end $$;

create trigger project_objects_reresolve_flush after insert or update on quality.project_objects
  for each statement execute function quality.reresolve_flush();
create trigger object_aliases_reresolve_flush after insert or update on quality.object_aliases
  for each statement execute function quality.reresolve_flush();
create trigger contractor_core_links_reresolve_flush after insert or update on quality.contractor_core_links
  for each statement execute function quality.reresolve_flush();
create trigger location_nodes_reresolve_flush after insert or update on quality.location_nodes
  for each statement execute function quality.reresolve_flush();
create trigger projects_reresolve_flush after insert or update on core.projects
  for each statement execute function quality.reresolve_flush();

revoke all on function quality.reresolve_later(uuid), quality.reresolve_flush() from public, anon, authenticated;

commit;
