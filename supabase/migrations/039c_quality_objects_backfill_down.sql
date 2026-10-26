-- Откат 039c_quality_objects_backfill_up.sql: триггер модулей и функции 039c удаляются, quality.core_project_sync — как 039b.
-- Созданные объекты Качества и узлы дерева остаются (данные компании).
begin;

do $$
begin
  if to_regprocedure('quality.sync_company_objects(uuid)') is null then
    raise exception '039c не применена — откатывать нечего' using errcode = 'P0001';
  end if;
end $$;

drop trigger company_modules_quality_sync on core.company_modules;
drop function quality.company_module_sync();
drop function quality.sync_company_objects(uuid);

create or replace function quality.core_project_sync()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_po quality.project_objects; v_names text[];
begin
  if new.quality_container or coalesce(current_setting('quality.object_sync', true), '') = '1' then return null; end if;
  if not exists (select 1 from core.company_modules cm where cm.company_id = new.company_id and cm.module = 'quality' and cm.enabled) then
    return null;
  end if;
  perform set_config('quality.object_sync', '1', true);
  if tg_op = 'INSERT' then
    v_names := array[quality.object_clean(new.name)];
    select * into v_po from quality.project_objects po
     where po.core_company_id = new.company_id and quality.object_alive(po) and quality.po_names(po) && v_names
     order by po.created_at, po.id limit 1;
    perform set_config('quality.object_bind', '1', true);
    if v_po.id is null then
      insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id, core_object_id, created_by_name)
      values ('obj_' || replace(new.id::text, '-', ''), quality.object_clean(new.name), new.name, '{}', new.company_id, new.id, 'P2-0035 объект компании')
      on conflict do nothing;
    elsif v_po.core_object_id is null then
      update quality.project_objects set core_object_id = new.id where id = v_po.id;
    end if;
    perform set_config('quality.object_bind', '', true);
    if not exists (select 1 from quality.location_nodes n where n.core_company_id = new.company_id and n."nodeType" = 'object'
                    and not coalesce(n.is_deleted, false) and quality.node_names(n) && v_names) then
      insert into quality.location_nodes(id, canonical_key, "displayName", synonyms, "nodeType", "parentId", core_company_id, created_by)
      values (gen_random_uuid()::text, quality.object_clean(new.name), new.name, '[]', 'object', null, new.company_id, 'P2-0035 объект компании');
    end if;
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

drop function quality.project_to_quality(core.projects);

commit;
