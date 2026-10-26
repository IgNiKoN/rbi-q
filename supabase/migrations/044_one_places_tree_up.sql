-- P2-0045 (одно дерево мест, шаг 1; решения владельца 26.10.2026). Места Качества — в общем дереве платформы core.locations.
--   1) quality.location_nodes.core_location_id — место ядра узла Качества (узел-объект — это объект ядра, а не место);
--   2) места объекта ведёт Качество, если объект ядра связан с узлом-объектом Качества (039b) и у него нет своих мест План/Факта
--      (quality.places_led_by_quality) — тогда в План/Факте правка мест этого объекта — отказ сервера;
--   3) Качество → ядро: создание, переименование, перенос, удаление узла (и его ветки) — то же в core.locations; глубина > 6,
--      узлы под удалённым узлом и под объектом с местами План/Факта — не переносятся; одинаковые названия у одного родителя —
--      ключ места с номером узла (название то же); ошибка переноса не мешает сохранению в Качестве (предупреждение в журнале);
--   4) разовый перенос дерева (с узлов-объектов вниз);
--   5) замечания и приёмки Стройконтроля 2.0 — объект (core_project_id) по месту "locationId" (узел-объект над ним), ТД №246.
-- Применять после 043, одним запросом. Откат — 044_one_places_tree_down.sql (перенесённые места помечаются удалёнными).
begin;

do $$
begin
  if to_regprocedure('quality.contractor_defect_guard()') is null then
    raise exception '044: сначала 043_contractor_cabinet_up.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = 'location_nodes' and column_name = 'core_location_id') then
    raise exception '044 уже применена (повтор — только после 044_one_places_tree_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Связь узла Качества с местом ядра.
alter table quality.location_nodes add column core_location_id uuid references core.locations(id) on delete set null;
comment on column quality.location_nodes.core_location_id is 'P2-0045: место core.locations этого узла (дерево ведёт Качество)';
create unique index location_nodes_core_location_uq on quality.location_nodes (core_company_id, core_location_id) where core_location_id is not null;
create index location_nodes_core_location_idx on quality.location_nodes (core_location_id) where core_location_id is not null;

-- 2. Объект ядра узла-объекта (живой корневой узел "nodeType" = 'object'; объект Качества с тем же названием — как 039b).
create function quality.node_root_project(n quality.location_nodes)
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select case when count(distinct po.core_object_id) = 1 then min(po.core_object_id::text)::uuid end
    from quality.project_objects po
   where n."nodeType" = 'object' and not coalesce(n.is_deleted, false) and coalesce(n."parentId", '') = ''
     and po.core_company_id = n.core_company_id and quality.object_alive(po) and po.core_object_id is not null
     and quality.po_names(po) && quality.node_names(n)
$$;

-- Объект ядра места Качества: вверх по дереву до корня; корень — живой узел-объект (иначе null).
create function quality.node_object_project(p_company uuid, p_node text)
returns uuid language plpgsql stable security definer set search_path = pg_catalog as $$
declare n quality.location_nodes; i int := 0;
begin
  if p_company is null or nullif(btrim(coalesce(p_node, '')), '') is null then return null; end if;
  select * into n from quality.location_nodes where core_company_id = p_company and id = p_node;
  while n.id is not null and coalesce(n."parentId", '') <> '' and i < 20 loop
    select * into n from quality.location_nodes where core_company_id = p_company and id = n."parentId";
    i := i + 1;
  end loop;
  if n.id is null then return null; end if;
  return quality.node_root_project(n);
end $$;

-- Места объекта ведёт Качество: объект связан с узлом-объектом Качества и у него нет своих мест План/Факта.
create function quality.places_led_by_quality(p_project uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select p_project is not null
     and exists (select 1 from quality.project_objects po
                  where po.core_object_id = p_project and quality.object_alive(po)
                    and exists (select 1 from quality.location_nodes n
                                 where n.core_company_id = po.core_company_id and n."nodeType" = 'object' and not n.is_deleted
                                   and coalesce(n."parentId", '') = '' and quality.node_names(n) && quality.po_names(po)))
     and not exists (select 1 from core.locations l
                      where l.project_id = p_project and l.deleted_at is null
                        and not exists (select 1 from quality.location_nodes n where n.core_location_id = l.id))
$$;

-- 3. Перенос узла (и, при p_deep, его ветки) в core.locations.
create function quality.place_sync(p_company uuid, p_node text, p_deep boolean, p_lvl int default 0)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare
  n quality.location_nodes; par quality.location_nodes; ploc core.locations; cur core.locations;
  v_proj uuid; v_parent uuid; v_depth int; v_name text; v_key text; v_type text; v_id uuid; c record;
  v_prev text := coalesce(current_setting('quality.place_sync', true), '');
begin
  if p_lvl > 12 then return; end if;
  select * into n from quality.location_nodes where core_company_id = p_company and id = p_node;
  if n.id is null then return; end if;
  perform set_config('quality.place_sync', '1', true);
  if not (n."nodeType" = 'object' and coalesce(n."parentId", '') = '') then
    if not n.is_deleted and coalesce(n."parentId", '') <> '' then
      select * into par from quality.location_nodes where core_company_id = p_company and id = n."parentId";
      if par.id is not null and not par.is_deleted then
        if par."nodeType" = 'object' and coalesce(par."parentId", '') = '' then
          v_proj := quality.node_root_project(par); v_parent := null; v_depth := 1;
        elsif par.core_location_id is not null then
          select * into ploc from core.locations where id = par.core_location_id and deleted_at is null;
          if ploc.id is not null then v_proj := ploc.project_id; v_parent := ploc.id; v_depth := ploc.depth + 1; end if;
        end if;
      end if;
    end if;
    if v_proj is not null and (v_depth > 6 or not quality.places_led_by_quality(v_proj)) then v_proj := null; end if;
    if n.core_location_id is not null then select * into cur from core.locations where id = n.core_location_id; end if;
    if v_proj is null then
      if cur.id is not null and cur.deleted_at is null then update core.locations set deleted_at = now() where id = cur.id; end if;
    else
      v_name := coalesce(nullif(btrim(n."displayName"), ''), nullif(btrim(n.canonical_key), ''), 'Без названия');
      v_type := case when n."nodeType" in ('building', 'section', 'floor', 'apartment') then n."nodeType" else 'other' end;
      v_key := planfact.canon_name(v_name);
      if exists (select 1 from core.locations l where l.project_id = v_proj and l.parent_id is not distinct from v_parent
                    and l.canonical_key = v_key and l.deleted_at is null and l.id is distinct from cur.id) then
        v_key := v_key || ' #' || n.id;
      end if;
      if cur.id is not null and cur.project_id = v_proj then
        update core.locations set parent_id = v_parent, name = v_name, canonical_key = v_key, node_type = v_type, depth = v_depth,
                                  sort_order = n.sort_order, deleted_at = null
         where id = cur.id
           and (parent_id, name, canonical_key, node_type, depth, sort_order, deleted_at)
               is distinct from (v_parent, v_name, v_key, v_type, v_depth, n.sort_order, null::timestamptz);
      else
        if cur.id is not null and cur.deleted_at is null then update core.locations set deleted_at = now() where id = cur.id; end if;
        insert into core.locations(company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth)
        values (n.core_company_id, v_proj, v_parent, v_type, v_name, n.sort_order, v_key, v_depth) returning id into v_id;
        update quality.location_nodes set core_location_id = v_id where core_company_id = p_company and id = n.id;
      end if;
    end if;
  end if;
  if p_deep then
    for c in select x.id from quality.location_nodes x where x.core_company_id = p_company and x."parentId" = n.id order by x.sort_order, x.id loop
      perform quality.place_sync(p_company, c.id, true, p_lvl + 1);
    end loop;
  end if;
  perform set_config('quality.place_sync', v_prev, true);
end $$;

create function quality.node_place_sync()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare c record;
begin
  if coalesce(current_setting('quality.place_sync', true), '') = '1' then return null; end if;
  begin
    if tg_op = 'DELETE' then
      if old.core_location_id is not null then
        perform set_config('quality.place_sync', '1', true);
        update core.locations set deleted_at = now() where id = old.core_location_id and deleted_at is null;
        perform set_config('quality.place_sync', '', true);
      end if;
      for c in select x.id from quality.location_nodes x where x.core_company_id = old.core_company_id and x."parentId" = old.id loop
        perform quality.place_sync(old.core_company_id, c.id, true);
      end loop;
    else
      perform quality.place_sync(new.core_company_id, new.id,
        tg_op = 'INSERT' or (new."parentId", new.is_deleted, new."nodeType", new.canonical_key, new.synonyms)
                            is distinct from (old."parentId", old.is_deleted, old."nodeType", old.canonical_key, old.synonyms));
    end if;
  exception when others then
    perform set_config('quality.place_sync', '', true);
    raise warning 'P2-0045: место узла % не перенесено в общее дерево: % (%)', coalesce(new.id, old.id), sqlerrm, sqlstate;
  end;
  return null;
end $$;
create trigger location_nodes_place_sync
  after insert or delete or update of "parentId", "displayName", canonical_key, synonyms, "nodeType", is_deleted, sort_order
  on quality.location_nodes for each row execute function quality.node_place_sync();

-- 2б. План/Факт: места объекта, которые ведёт Качество, меняет только перенос из Качества.
create function quality.places_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if coalesce(current_setting('quality.place_sync', true), '') = '1' then return coalesce(new, old); end if;
  if (tg_op <> 'INSERT' and quality.places_led_by_quality(old.project_id))
     or (tg_op <> 'DELETE' and quality.places_led_by_quality(new.project_id)) then
    raise exception 'Места этого объекта ведутся в Качестве — меняйте их там' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger zz_locations_quality_guard before insert or update or delete on core.locations
  for each row execute function quality.places_guard();

-- Для экрана «Места» План/Факта: места объекта ведёт Качество (только просмотр).
create function public.pf_locations_from_quality(p_project uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
begin
  if p_project is null or auth.uid() is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  return quality.places_led_by_quality(p_project);
end $$;

-- 4. Разовый перенос: с каждого живого узла-объекта вниз.
do $$
declare r record;
begin
  for r in select n.core_company_id c, n.id from quality.location_nodes n
            where n."nodeType" = 'object' and not n.is_deleted and coalesce(n."parentId", '') = ''
            order by n.core_company_id, n.sort_order, n.id loop
    perform quality.place_sync(r.c, r.id, true);
  end loop;
end $$;

-- 5. Замечания и приёмки Стройконтроля 2.0 — объект по месту (после bind_company, который обнуляет core_project_id).
create function quality.v2_bind_object()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  new.core_project_id := quality.node_object_project(new.core_company_id, new."locationId");
  return new;
end $$;
create trigger construction_defects_v2_bind_object before insert or update on quality.construction_defects_v2
  for each row execute function quality.v2_bind_object();
create trigger construction_acceptance_v2_bind_object before insert or update on quality.construction_acceptance_v2
  for each row execute function quality.v2_bind_object();
update quality.construction_defects_v2 set core_project_id = quality.node_object_project(core_company_id, "locationId")
 where core_project_id is distinct from quality.node_object_project(core_company_id, "locationId");
update quality.construction_acceptance_v2 set core_project_id = quality.node_object_project(core_company_id, "locationId")
 where core_project_id is distinct from quality.node_object_project(core_company_id, "locationId");

revoke all on function quality.node_root_project(quality.location_nodes), quality.node_object_project(uuid, text),
  quality.places_led_by_quality(uuid), quality.place_sync(uuid, text, boolean, int), quality.node_place_sync(),
  quality.places_guard(), quality.v2_bind_object() from public, anon, authenticated;
revoke all on function public.pf_locations_from_quality(uuid) from public, anon;
grant execute on function public.pf_locations_from_quality(uuid) to authenticated;

commit;
