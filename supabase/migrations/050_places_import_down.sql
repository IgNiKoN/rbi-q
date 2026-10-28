-- P2-0056: откат 050_places_import_up.sql — функции загрузки, отмены загрузки и «площадь / комнаты» сняты; pf_project_places
-- и обе pf_copy_place — как в 045 / 049; столбцы rooms и import_batch сняты ВМЕСТЕ С ДАННЫМИ (число комнат пропадёт;
-- площадь — прежний столбец area — остаётся). Места, созданные загрузкой, остаются как есть.
-- Проверка на PGlite: schema_fingerprint до up и после down совпадает.
begin;
do $$
begin
  if to_regprocedure('public.pf_import_places(uuid, uuid, jsonb, boolean)') is null then
    raise exception '050 down: 050 не применена' using errcode = 'P0001';
  end if;
end $$;

drop function public.pf_save_place_info(uuid, numeric, int);
drop function public.pf_import_undo(uuid);
drop function public.pf_import_places(uuid, uuid, jsonb, boolean);
drop function core.import_pattern(uuid, uuid, text);
drop function core.import_find(uuid, uuid, text, text, text);
drop function core.place_num(text);

drop function public.pf_project_places(uuid, uuid);
create function public.pf_project_places(p_project uuid, p_parent uuid default null)
returns table(id uuid, parent_id uuid, node_type text, object_kind text, name text, build_no text, bti_no text,
              sort_order int, depth int, path text, child_count int, apartment_count int)
language plpgsql stable security definer set search_path = pg_catalog as $$
#variable_conflict use_column
declare v_company uuid; v_prefix text;
begin
  select company_id into v_company from core.projects where id = p_project and deleted_at is null and not quality_container;
  if v_company is null or auth.uid() is null or not (core.can_manage_projects(v_company) or core.is_project_participant(p_project)) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  if p_parent is not null then
    if not exists (select 1 from core.locations l where l.id = p_parent and l.project_id = p_project and l.deleted_at is null) then
      raise exception 'Место не найдено' using errcode = '22023';
    end if;
    v_prefix := planfact.location_path(p_parent) || ' · ';
  end if;
  return query
  select l.id, l.parent_id, l.node_type, l.object_kind, l.name, l.build_no, l.bti_no, l.sort_order, l.depth,
         coalesce(v_prefix, '') || l.name,
         (select count(*)::int from core.locations c where c.parent_id = l.id and c.deleted_at is null),
         case when l.node_type in ('object', 'section') then
           (with recursive sub(id) as (select x.id from core.locations x where x.parent_id = l.id and x.deleted_at is null
                                       union all select x.id from core.locations x join sub on x.parent_id = sub.id where x.deleted_at is null)
            select count(*)::int from sub join core.locations a on a.id = sub.id where a.node_type = 'apartment') end
    from core.locations l
   where l.project_id = p_project and l.deleted_at is null and l.parent_id is not distinct from p_parent
   order by l.sort_order, l.name, l.id;
end $$;
revoke all on function public.pf_project_places(uuid, uuid) from public, anon;
grant execute on function public.pf_project_places(uuid, uuid) to authenticated;

create or replace function public.pf_copy_place(p_source uuid, p_new_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_src core.locations; v_company uuid; v_name text := btrim(coalesce(p_name, '')); v_order int; v_cnt int; v_obj uuid; v_no int;
begin
  if p_new_id is null then raise exception 'Нет идентификатора записи' using errcode = '22023'; end if;
  select * into v_src from core.locations where id = p_source and deleted_at is null;
  if exists (select 1 from core.locations where id = p_new_id) then
    -- повтор того же запроса — та же копия; чужой id — отказ
    if exists (select 1 from core.locations x where x.id = p_new_id and x.project_id = v_src.project_id and x.parent_id is not distinct from v_src.parent_id) then
      perform core.require_places_manage(v_src.project_id);
      return p_new_id;
    end if;
    raise exception 'Идентификатор записи уже занят' using errcode = '22023';
  end if;
  if v_src.id is null or v_src.node_type = 'object' then raise exception 'Копировать можно секцию, этаж или помещение' using errcode = '22023'; end if;
  v_company := core.require_places_manage(v_src.project_id);
  if v_name = '' then raise exception 'Введите название копии' using errcode = '22023'; end if;
  if exists (select 1 from core.locations where project_id = v_src.project_id and parent_id = v_src.parent_id
             and canonical_key = planfact.canon_name(v_name) and deleted_at is null) then
    raise exception 'Место с таким названием уже есть на этом уровне' using errcode = '23505';
  end if;
  with recursive sub(id) as (select id from core.locations where id = v_src.id
                             union all select c.id from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
  select count(*) into v_cnt from sub;
  if v_cnt > 5000 then raise exception 'Слишком много мест за раз (максимум 5000)' using errcode = '22023'; end if;
  -- объект, в котором копия (для нумерации квартир)
  with recursive up(id, parent_id) as (select id, parent_id from core.locations where id = v_src.id
                                       union all select l.id, l.parent_id from core.locations l join up on l.id = up.parent_id)
  select id into v_obj from up where parent_id is null;
  perform pg_advisory_xact_lock(hashtextextended('p2_0047_object:' || v_obj::text, 0));
  v_no := core.next_build_no(v_obj);
  select coalesce(max(sort_order), 0) + 1 into v_order from core.locations where parent_id = v_src.parent_id and deleted_at is null;
  create temp table if not exists m045_copy(old_id uuid primary key, new_id uuid, parent_old uuid, rn int, k int) on commit drop;
  delete from pg_temp.m045_copy;
  with recursive sub(id, parent_id, path) as (
    select id, parent_id, array[sort_order, 0] from core.locations where id = v_src.id
    union all select c.id, c.parent_id, sub.path || array[c.sort_order, 0] from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
  insert into pg_temp.m045_copy(old_id, new_id, parent_old, rn)
  select sub.id, case when sub.id = v_src.id then p_new_id else gen_random_uuid() end, sub.parent_id,
         (row_number() over (order by sub.path))::int from sub;
  update pg_temp.m045_copy m set k = s.k
    from (select m2.old_id, (sum(case when l.node_type = 'apartment' and l.build_no is not null then 1 else 0 end)
                               over (order by m2.rn))::int - 1 as k
            from pg_temp.m045_copy m2 join core.locations l on l.id = m2.old_id) s
   where s.old_id = m.old_id;
  insert into core.locations(id, company_id, project_id, parent_id, node_type, name, sort_order, area, canonical_key, depth, build_no, bti_no)
  select m.new_id, v_company, l.project_id,
         case when l.id = v_src.id then l.parent_id else (select p.new_id from pg_temp.m045_copy p where p.old_id = l.parent_id) end,
         l.node_type,
         case when l.id = v_src.id then v_name when l.node_type = 'apartment' and l.build_no is not null then 'кв. ' || (v_no + m.k) else l.name end,
         case when l.id = v_src.id then v_order else l.sort_order end, l.area,
         case when l.id = v_src.id then planfact.canon_name(v_name)
              when l.node_type = 'apartment' and l.build_no is not null then planfact.canon_name('кв. ' || (v_no + m.k)) else l.canonical_key end,
         l.depth,
         case when l.node_type = 'apartment' and l.build_no is not null then (v_no + m.k)::text end, null
    from pg_temp.m045_copy m join core.locations l on l.id = m.old_id
   order by m.rn;
  perform planfact.log_admin_change(v_company, v_src.project_id, 'locations', p_new_id, 'INSERT', null,
    jsonb_build_object('copy_of', v_src.id, 'name', v_name, 'nodes', v_cnt));
  return p_new_id;
end $$;

create or replace function public.pf_copy_place(p_source uuid, p_new_id uuid, p_name text, p_target_parent uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_src core.locations; v_t core.locations; v_company uuid; v_name text := btrim(coalesce(p_name, '')); v_order int; v_cnt int;
        v_obj uuid; v_no int; v_max int; v_shift int;
begin
  if p_new_id is null then raise exception 'Нет идентификатора записи' using errcode = '22023'; end if;
  select * into v_src from core.locations where id = p_source and deleted_at is null;
  if exists (select 1 from core.locations where id = p_new_id) then
    -- повтор того же запроса — та же копия; чужой id — отказ
    if exists (select 1 from core.locations x where x.id = p_new_id and x.project_id = v_src.project_id
                and x.parent_id is not distinct from coalesce(p_target_parent, v_src.parent_id)) then
      perform core.require_places_manage(v_src.project_id);
      return p_new_id;
    end if;
    raise exception 'Идентификатор записи уже занят' using errcode = '22023';
  end if;
  if v_src.id is null or v_src.node_type = 'object' then raise exception 'Копировать можно секцию, этаж или помещение' using errcode = '22023'; end if;
  v_company := core.require_places_manage(v_src.project_id);
  if v_name = '' then raise exception 'Введите название копии' using errcode = '22023'; end if;
  if p_target_parent is null then
    select * into v_t from core.locations where id = v_src.parent_id;
  else
    select * into v_t from core.locations where id = p_target_parent and deleted_at is null;
    if v_t.id is null then raise exception 'Место, куда вставить, не найдено' using errcode = '22023'; end if;
    if v_t.project_id <> v_src.project_id then
      raise exception 'Вставить можно только в этот же проект' using errcode = '22023';
    end if;
    if exists (with recursive up(id, parent_id) as (select id, parent_id from core.locations where id = p_target_parent
                                                    union all select l.id, l.parent_id from core.locations l join up on l.id = up.parent_id)
               select 1 from up where up.id = v_src.id) then
      raise exception 'Нельзя вставить место внутрь самого себя' using errcode = '22023';
    end if;
  end if;
  if exists (select 1 from core.locations where project_id = v_src.project_id and parent_id = v_t.id
             and canonical_key = planfact.canon_name(v_name) and deleted_at is null) then
    raise exception 'Место с таким названием уже есть на этом уровне' using errcode = '23505';
  end if;
  with recursive sub(id, depth) as (select id, depth from core.locations where id = v_src.id
                                    union all select c.id, c.depth from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
  select count(*), max(depth) into v_cnt, v_max from sub;
  if v_cnt > 5000 then raise exception 'Слишком много мест за раз (максимум 5000)' using errcode = '22023'; end if;
  v_shift := v_t.depth + 1 - v_src.depth;
  if v_max + v_shift > 6 then raise exception 'Слишком глубокая вложенность (максимум 6 уровней)' using errcode = '22023'; end if;
  -- объект-получатель (для нумерации квартир)
  v_obj := core.place_object(v_t.id);
  perform pg_advisory_xact_lock(hashtextextended('p2_0047_object:' || v_obj::text, 0));
  v_no := core.next_build_no(v_obj);
  select coalesce(max(sort_order), 0) + 1 into v_order from core.locations where parent_id = v_t.id and deleted_at is null;
  create temp table if not exists m049_copy(old_id uuid primary key, new_id uuid, parent_old uuid, rn int, k int) on commit drop;
  delete from pg_temp.m049_copy;
  with recursive sub(id, parent_id, path) as (
    select id, parent_id, array[sort_order, 0] from core.locations where id = v_src.id
    union all select c.id, c.parent_id, sub.path || array[c.sort_order, 0] from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
  insert into pg_temp.m049_copy(old_id, new_id, parent_old, rn)
  select sub.id, case when sub.id = v_src.id then p_new_id else gen_random_uuid() end, sub.parent_id,
         (row_number() over (order by sub.path))::int from sub;
  update pg_temp.m049_copy m set k = s.k
    from (select m2.old_id, (sum(case when l.node_type = 'apartment' and l.build_no is not null then 1 else 0 end)
                               over (order by m2.rn))::int - 1 as k
            from pg_temp.m049_copy m2 join core.locations l on l.id = m2.old_id) s
   where s.old_id = m.old_id;
  insert into core.locations(id, company_id, project_id, parent_id, node_type, name, sort_order, area, canonical_key, depth, build_no, bti_no)
  select m.new_id, v_company, l.project_id,
         case when l.id = v_src.id then v_t.id else (select p.new_id from pg_temp.m049_copy p where p.old_id = l.parent_id) end,
         l.node_type,
         case when l.id = v_src.id then v_name when l.node_type = 'apartment' and l.build_no is not null then 'кв. ' || (v_no + m.k) else l.name end,
         case when l.id = v_src.id then v_order else l.sort_order end, l.area,
         case when l.id = v_src.id then planfact.canon_name(v_name)
              when l.node_type = 'apartment' and l.build_no is not null then planfact.canon_name('кв. ' || (v_no + m.k)) else l.canonical_key end,
         l.depth + v_shift,
         case when l.node_type = 'apartment' and l.build_no is not null then (v_no + m.k)::text end, null
    from pg_temp.m049_copy m join core.locations l on l.id = m.old_id
   order by m.rn;
  perform planfact.log_admin_change(v_company, v_src.project_id, 'locations', p_new_id, 'INSERT', null,
    jsonb_build_object('copy_of', v_src.id, 'name', v_name, 'nodes', v_cnt, 'parent_id', v_t.id));
  return p_new_id;
end $$;

drop index core.locations_import_batch_idx;
alter table core.locations drop constraint locations_rooms_apartment_chk;
alter table core.locations drop column import_batch, drop column rooms;

commit;
