-- P2-0054: откат 048_core_places_up.sql — признак «кто ведёт места», зеркало ядро → Качество и защита узлов сняты; функции 044
-- (правило «места ведёт Качество», перенос Качество → ядро) — как после 047. Объекты видов «Детский сад» / «Школа» становятся
-- «прочее» (прежний вид — в закрытой копии p2_backup.p2_0054_kinds). Узлы Качества, созданные зеркалом, остаются (ссылки
-- замечаний и приёмок на них не теряются); у проектов ядра без узлов из Качества они отвязываются от мест ядра (ниже).
-- Проверка на PGlite: schema_fingerprint до up и после down совпадает.
begin;
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'projects' and column_name = 'places_master') then
    raise exception '048 down: 048 не применена' using errcode = 'P0001';
  end if;
  if to_regclass('p2_backup.p2_0054_kinds') is not null then
    raise exception '048 down: осталась копия p2_backup.p2_0054_kinds от прошлого отката — сначала разобрать' using errcode = 'P0001';
  end if;
end $$;

drop trigger location_nodes_core_guard on quality.location_nodes;
drop trigger locations_quality_mirror on core.locations;

-- Проекты ядра без узлов, пришедших из Качества: узлы-зеркала отвязываются от мест ядра (узлы и ссылки на них остаются),
-- иначе правило 044 сочло бы, что места проекта ведёт Качество. Переведённые проекты (узлы из Качества есть) — связи остаются.
select set_config('quality.place_sync', '1', true);
update quality.location_nodes n set core_location_id = null
  from core.locations l join core.projects pr on pr.id = l.project_id
 where n.core_location_id = l.id and n.id = l.id::text and pr.places_master = 'core'
   and not exists (select 1 from quality.location_nodes q join core.locations ql on ql.id = q.core_location_id
                    where ql.project_id = pr.id and q.id <> ql.id::text);
select set_config('quality.place_sync', '', true);

create schema if not exists p2_backup;
revoke all on schema p2_backup from public, anon, authenticated;
create table p2_backup.p2_0054_kinds as select id, object_kind from core.locations where object_kind in ('kindergarten', 'school');
revoke all on p2_backup.p2_0054_kinds from public, anon, authenticated;
alter table core.locations disable trigger user;
update core.locations set object_kind = 'other' where object_kind in ('kindergarten', 'school');
alter table core.locations enable trigger user;
delete from core.object_kinds where code in ('kindergarten', 'school');
update core.object_kinds set sort_order = 5 where code = 'other';

-- Функции 044 — как были.
create or replace function quality.places_led_by_quality(p_project uuid)
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

drop function quality.nodes_core_guard();
drop function quality.core_place_mirror();
drop function quality.mirror_place(uuid, int);
drop function quality.project_root_node(uuid);
drop function quality.node_core_project(uuid, text);
alter table core.projects drop column places_master;

commit;
