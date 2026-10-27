-- P2-0054 (места ведёт ядро; решения владельца 27.10.2026). Дерево мест проекта правится только в «Компания → Объекты и места»
-- (core.locations); Качество и Стройконтроль 2.0 получают места зеркалом и только выбирают их.
--   1) core.projects.places_master — кто ведёт места проекта: 'core' (по умолчанию) или 'quality' (проекты, чьи места сейчас
--      ведёт Качество и уже есть хотя бы одно место Качества, — RBI, Альфа; до перевода скриптом scripts/p2-0054/03_switch.sql);
--   2) quality.places_led_by_quality — правило 044 только для проектов 'quality' (для них всё как было);
--   3) ядро → Качество: создание, переименование, порядок, перенос, удаление места ядра — то же в quality.location_nodes
--      (новый узел: id = id места ядра текстом, core_location_id = тот же id; объект ядра — узел "building" под узлом-проектом);
--      компания без узла-проекта Качества (нет Качества) — зеркала нет; Качество → ядро для проектов ядра не идёт (нет петли);
--   4) защита: в проекте ядра запись структуры мест в quality.location_nodes (создание, родитель, название, тип, удаление,
--      связь с местом ядра) — отказ сервера; синонимы, порядок и узел-проект ("nodeType" = 'object', корень) — как сейчас;
--   5) виды объектов «Детский сад», «Школа»;
--   6) места уже существующих проектов ядра — в Качество (у кого есть узел-проект).
-- Применять после 047, одним запросом. Откат — 048_core_places_down.sql.
begin;

do $$
begin
  if to_regprocedure('planfact.my_area(uuid)') is null then
    raise exception '048: сначала 047_project_participation_up.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'projects' and column_name = 'places_master') then
    raise exception '048 уже применена (повтор — только после 048_core_places_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Кто ведёт места проекта.
alter table core.projects add column places_master text not null default 'core'
  constraint projects_places_master_chk check (places_master in ('core', 'quality'));
comment on column core.projects.places_master is
  'P2-0054: кто ведёт дерево мест — core («Компания → Объекты и места», Качество только читает) или quality (до перевода, правило 044)';

-- Проекты, чьи места ведёт Качество (правило 044, функция ещё прежняя) и у которых есть хотя бы одно место Качества.
-- Без пометки «изменено»: меняется только признак.
alter table core.projects disable trigger projects_touch;
update core.projects pr set places_master = 'quality'
 where quality.places_led_by_quality(pr.id)
   and (exists (select 1 from core.locations l join quality.location_nodes n on n.core_location_id = l.id
                 where l.project_id = pr.id and l.deleted_at is null)
        or exists (select 1 from quality.location_nodes n
                    where n.core_company_id = pr.company_id and not n.is_deleted and coalesce(n."parentId", '') <> ''
                      and quality.node_object_project(n.core_company_id, n.id) = pr.id));
alter table core.projects enable trigger projects_touch;

-- 2. Правило 044 — только для проектов 'quality'.
create or replace function quality.places_led_by_quality(p_project uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select p_project is not null
     and exists (select 1 from core.projects pr where pr.id = p_project and pr.places_master = 'quality')
     and exists (select 1 from quality.project_objects po
                  where po.core_object_id = p_project and quality.object_alive(po)
                    and exists (select 1 from quality.location_nodes n
                                 where n.core_company_id = po.core_company_id and n."nodeType" = 'object' and not n.is_deleted
                                   and coalesce(n."parentId", '') = '' and quality.node_names(n) && quality.po_names(po)))
     and not exists (select 1 from core.locations l
                      where l.project_id = p_project and l.deleted_at is null
                        and not exists (select 1 from quality.location_nodes n where n.core_location_id = l.id))
$$;

-- Проект ядра (places_master = 'core'), в котором узел Качества: по его месту ядра или вверх по дереву до узла-проекта.
create function quality.node_core_project(p_company uuid, p_node text)
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select pr.id from core.projects pr
   where pr.places_master = 'core'
     and pr.id in ((select l.project_id from quality.location_nodes n join core.locations l on l.id = n.core_location_id
                     where n.core_company_id = p_company and n.id = p_node),
                   quality.node_object_project(p_company, p_node))
   limit 1
$$;

-- Узел-проект Качества (живой корневой "nodeType" = 'object' того же объекта, 039b); нет — null.
create function quality.project_root_node(p_project uuid)
returns text language sql stable security definer set search_path = pg_catalog as $$
  select n.id from core.projects pr join quality.location_nodes n on n.core_company_id = pr.company_id
   where pr.id = p_project and n."nodeType" = 'object' and not n.is_deleted and coalesce(n."parentId", '') = ''
     and quality.node_root_project(n) = p_project
   order by n.sort_order, n.created_at, n.id
   limit 1
$$;

-- 3а. Качество → ядро (044): узлы проектов ядра не переносятся (их источник — ядро).
create or replace function quality.place_sync(p_company uuid, p_node text, p_deep boolean, p_lvl int default 0)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare
  n quality.location_nodes; par quality.location_nodes; ploc core.locations; cur core.locations;
  v_proj uuid; v_parent uuid; v_depth int; v_name text; v_key text; v_type text; v_id uuid; c record;
  v_prev text := coalesce(current_setting('quality.place_sync', true), '');
begin
  if p_lvl > 12 then return; end if;
  select * into n from quality.location_nodes where core_company_id = p_company and id = p_node;
  if n.id is null then return; end if;
  if quality.node_core_project(p_company, p_node) is not null then return; end if;   -- P2-0054: места ведёт ядро
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

create or replace function quality.node_place_sync()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare c record;
begin
  if coalesce(current_setting('quality.place_sync', true), '') = '1' then return null; end if;
  begin
    if tg_op = 'DELETE' then
      if old.core_location_id is not null
         and not exists (select 1 from core.locations l join core.projects pr on pr.id = l.project_id
                          where l.id = old.core_location_id and pr.places_master = 'core') then   -- P2-0054: места ведёт ядро
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

-- 3б. Ядро → Качество: место ядра (и, если нужно, места выше) — узел Качества; возвращает id узла или null.
create function quality.mirror_place(p_location uuid, p_lvl int default 0)
returns text language plpgsql security definer set search_path = pg_catalog as $$
declare
  l core.locations; n quality.location_nodes; v_parent text; v_del boolean;
  v_prev text := coalesce(current_setting('quality.place_sync', true), '');
begin
  if p_lvl > 12 then return null; end if;
  select * into l from core.locations where id = p_location;
  if l.id is null or not exists (select 1 from core.projects pr where pr.id = l.project_id and pr.places_master = 'core') then
    return null;
  end if;
  select * into n from quality.location_nodes where core_company_id = l.company_id and core_location_id = l.id;
  v_del := l.deleted_at is not null;
  if l.parent_id is null then
    v_parent := quality.project_root_node(l.project_id);
  else
    select x.id into v_parent from quality.location_nodes x where x.core_company_id = l.company_id and x.core_location_id = l.parent_id;
    if v_parent is null and not v_del then v_parent := quality.mirror_place(l.parent_id, p_lvl + 1); end if;
  end if;
  if n.id is null and (v_del or v_parent is null) then return null; end if;   -- нечего отражать или у компании нет узла-проекта
  perform set_config('quality.place_sync', '1', true);
  if n.id is null then
    insert into quality.location_nodes as x (id, canonical_key, "displayName", synonyms, "nodeType", "parentId", sort_order,
                                             core_company_id, core_location_id, created_by)
    values (l.id::text, '', l.name, '[]', case when l.node_type = 'object' then 'building' else l.node_type end, v_parent, l.sort_order,
            l.company_id, l.id, 'Компания → Объекты и места')
    on conflict (core_company_id, id) do update
      set "displayName" = excluded."displayName", "nodeType" = excluded."nodeType", "parentId" = excluded."parentId",
          sort_order = excluded.sort_order, core_location_id = excluded.core_location_id, is_deleted = false, deleted_at = null,
          updated_at = now(), version = x.version + 1;
    n.id := l.id::text;
  elsif (n."parentId", n."displayName", n.sort_order, n.is_deleted) is distinct from (coalesce(v_parent, n."parentId"), l.name, l.sort_order, v_del) then
    update quality.location_nodes
       set "parentId" = coalesce(v_parent, "parentId"), "displayName" = l.name, sort_order = l.sort_order, is_deleted = v_del,
           deleted_at = case when v_del then coalesce(deleted_at, l.deleted_at) end, updated_at = now(), version = version + 1
     where core_company_id = n.core_company_id and id = n.id;
  end if;
  perform set_config('quality.place_sync', v_prev, true);
  return n.id;
end $$;

create function quality.core_place_mirror()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if coalesce(current_setting('quality.place_sync', true), '') = '1' then return null; end if;   -- запись пришла из Качества (044)
  if tg_op = 'DELETE' then
    if exists (select 1 from core.projects pr where pr.id = old.project_id and pr.places_master = 'core') then
      perform set_config('quality.place_sync', '1', true);
      update quality.location_nodes set is_deleted = true, deleted_at = now(), updated_at = now(), version = version + 1
       where core_company_id = old.company_id and core_location_id = old.id and not is_deleted;
      perform set_config('quality.place_sync', '', true);
    end if;
  else
    perform quality.mirror_place(new.id);
  end if;
  return null;
end $$;
create trigger locations_quality_mirror after insert or update or delete on core.locations
  for each row execute function quality.core_place_mirror();

-- 4. Защита: структуру мест проекта ядра в Качестве не правят (кроме зеркала).
create function quality.nodes_core_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_old uuid; v_new uuid;
begin
  if coalesce(current_setting('quality.place_sync', true), '') = '1' then return coalesce(new, old); end if;
  -- повтор узла с устройства (upsert): вставка станет правкой — её и проверит правило ниже
  if tg_op = 'INSERT' and exists (select 1 from quality.location_nodes x where x.core_company_id = new.core_company_id and x.id = new.id) then
    return new;
  end if;
  if tg_op <> 'INSERT' and not (old."nodeType" = 'object' and coalesce(old."parentId", '') = '') then
    v_old := quality.node_core_project(old.core_company_id, old.id);
  end if;
  if tg_op <> 'DELETE' and not (new."nodeType" = 'object' and coalesce(new."parentId", '') = '') then
    v_new := coalesce(quality.node_core_project(new.core_company_id, new."parentId"),
                      (select pr.id from core.locations l join core.projects pr on pr.id = l.project_id
                        where l.id = new.core_location_id and pr.places_master = 'core'));
  end if;
  if (tg_op = 'INSERT' and v_new is not null) or (tg_op = 'DELETE' and v_old is not null)
     or (tg_op = 'UPDATE' and coalesce(v_old, v_new) is not null
         and (new."parentId", new."displayName", new.canonical_key, new."nodeType", new.is_deleted, new.core_location_id)
             is distinct from (old."parentId", old."displayName", old.canonical_key, old."nodeType", old.is_deleted, old.core_location_id)) then
    raise exception 'Места ведутся в «Компания → Объекты и места»' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger location_nodes_core_guard before insert or update or delete on quality.location_nodes
  for each row execute function quality.nodes_core_guard();

-- 5. Виды объектов (по примеру владельца): детский сад, школа; «Прочее» — последним.
insert into core.object_kinds(code, name, sort_order) values ('kindergarten', 'Детский сад', 5), ('school', 'Школа', 6);
update core.object_kinds set sort_order = 7 where code = 'other';

-- 6. Места существующих проектов ядра — в Качество (у компании есть узел-проект); родители — раньше детей.
do $$
declare r record;
begin
  for r in select l.id from core.locations l join core.projects pr on pr.id = l.project_id
            where pr.places_master = 'core' and l.deleted_at is null
              and not exists (select 1 from quality.location_nodes n where n.core_company_id = l.company_id and n.core_location_id = l.id)
            order by l.depth, l.sort_order, l.id loop
    perform quality.mirror_place(r.id);
  end loop;
end $$;

revoke all on function quality.node_core_project(uuid, text), quality.project_root_node(uuid), quality.mirror_place(uuid, int),
  quality.core_place_mirror(), quality.nodes_core_guard() from public, anon, authenticated;

commit;
