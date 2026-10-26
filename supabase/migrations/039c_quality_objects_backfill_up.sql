-- P2-0035 этап 3 (дополнение к 039b, решение владельца №7). Объекты ядра, заведённые до 039b, и объекты компании, у которой
-- Качество включили позже, — в Качестве: объект Качества и узел-объект дерева (как новый объект ядра, 039b п. 4).
--   1) quality.project_to_quality(объект ядра) — общая часть «объект ядра → Качество» (из quality.core_project_sync 039b);
--   2) quality.sync_company_objects(компания) — все неархивные объекты ядра компании без объекта Качества (кроме контейнера);
--   3) Качество у компании включено (core.company_modules) — п. 2 для неё; сейчас — для всех компаний с Качеством.
-- Применять после 039b, одним запросом. Откат — 039c_quality_objects_backfill_down.sql (созданные объекты и узлы остаются).
begin;

do $$
begin
  if to_regprocedure('quality.core_project_sync()') is null then
    raise exception '039c: сначала 039b_quality_one_object_list_up.sql' using errcode = 'P0001';
  end if;
  if to_regprocedure('quality.sync_company_objects(uuid)') is not null then
    raise exception '039c уже применена (повтор — только после 039c_quality_objects_backfill_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Объект ядра → объект Качества и узел-объект дерева (если таких ещё нет). Служебная: флаги — у вызывающего.
create function quality.project_to_quality(p core.projects)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_po quality.project_objects; v_names text[];
begin
  v_names := array[quality.object_clean(p.name)];
  select * into v_po from quality.project_objects po
   where po.core_company_id = p.company_id and quality.object_alive(po) and quality.po_names(po) && v_names
   order by po.created_at, po.id limit 1;
  perform set_config('quality.object_bind', '1', true);
  if v_po.id is null then
    insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id, core_object_id, created_by_name)
    values ('obj_' || replace(p.id::text, '-', ''), quality.object_clean(p.name), p.name, '{}', p.company_id, p.id, 'P2-0035 объект компании')
    on conflict do nothing;
  elsif v_po.core_object_id is null then
    update quality.project_objects set core_object_id = p.id where id = v_po.id;
  end if;
  perform set_config('quality.object_bind', '', true);
  if not exists (select 1 from quality.location_nodes n where n.core_company_id = p.company_id and n."nodeType" = 'object'
                  and not coalesce(n.is_deleted, false) and quality.node_names(n) && v_names) then
    insert into quality.location_nodes(id, canonical_key, "displayName", synonyms, "nodeType", "parentId", core_company_id, created_by)
    values (gen_random_uuid()::text, quality.object_clean(p.name), p.name, '[]', 'object', null, p.company_id, 'P2-0035 объект компании');
  end if;
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
  perform quality.reresolve(new.company_id);
  return null;
end $$;

-- 2. Все объекты ядра компании (неархивные, не контейнер), у которых нет объекта Качества.
create function quality.sync_company_objects(p_company uuid)
returns int language plpgsql security definer set search_path = pg_catalog as $$
declare pr core.projects; n int := 0;
begin
  if not exists (select 1 from core.company_modules cm where cm.company_id = p_company and cm.module = 'quality' and cm.enabled) then
    return 0;
  end if;
  perform set_config('quality.object_sync', '1', true);
  for pr in select * from core.projects x
             where x.company_id = p_company and x.archived_at is null and not x.quality_container
               and not exists (select 1 from quality.project_objects po where po.core_company_id = x.company_id and po.core_object_id = x.id
                                 and quality.object_alive(po))
             order by x.created_at, x.id loop
    perform quality.project_to_quality(pr);
    n := n + 1;
  end loop;
  perform set_config('quality.object_sync', '', true);
  perform quality.reresolve(p_company);
  return n;
end $$;

-- 3. Качество включили у компании — её объекты в Качестве.
create function quality.company_module_sync()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if coalesce(current_setting('quality.object_sync', true), '') = '1' then return null; end if;
  if new.module = 'quality' and new.enabled and (tg_op = 'INSERT' or not coalesce(old.enabled, false)) then
    perform quality.sync_company_objects(new.company_id);
  end if;
  return null;
end $$;
create trigger company_modules_quality_sync after insert or update of enabled on core.company_modules
  for each row execute function quality.company_module_sync();

do $$
declare c uuid;
begin
  for c in select cm.company_id from core.company_modules cm where cm.module = 'quality' and cm.enabled order by 1 loop
    perform quality.sync_company_objects(c);
  end loop;
end $$;

revoke all on function quality.project_to_quality(core.projects), quality.sync_company_objects(uuid), quality.company_module_sync()
  from public, anon, authenticated;

commit;
