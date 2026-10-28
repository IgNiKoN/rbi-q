-- P2-0055 (редактор структуры «Компания → Объекты и места»; решения владельца 28.10.2026). Только новые функции ядра:
--   1) pf_move_place — перенос ветки и порядок мест ТОЛЬКО внутри своего объекта (в другой объект — копировать и вставить);
--      объект — только порядок среди объектов проекта; пересчёт глубины ветки и порядка на новом уровне, журнал MOVE;
--   2) pf_copy_place(…, p_target_parent) — копия ветки в любое подходящее место того же проекта (в т.ч. в другой корпус),
--      квартиры получают строительные номера объекта-получателя; прежний pf_copy_place(3 арг.) не меняется;
--   3) pf_restore_place — вернуть ветку, удалённую одним действием (та же пометка deleted_at), журнал RESTORE;
--   4) pf_next_build_no — следующий строительный номер помещения в объекте (для «+ Кв.» без окна, только чтение).
-- Зеркало ядро → Качество (048) отражает родителя, порядок и снятие пометки удаления само — его не трогаем.
-- Права — core.require_places_manage (как у прочих функций мест). Применять после 048, одним запросом. Откат — 049_structure_editor_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.mirror_place(uuid, integer)') is null then
    raise exception '049: сначала 048_core_places_up.sql' using errcode = 'P0001';
  end if;
  if to_regprocedure('public.pf_move_place(uuid, uuid, uuid)') is not null then
    raise exception '049 уже применена (повтор — только после 049_structure_editor_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Перенос и порядок. p_new_parent — новый родитель (тот же объект или место внутри него; у объекта — null);
--    p_before — место-сосед на новом уровне, перед которым встать (null — в конец). Повтор того же запроса — без изменений.
--    Возвращает прежнее положение (для «Отменить»): {changed, old_parent, old_before}.
create function public.pf_move_place(p_location uuid, p_new_parent uuid, p_before uuid default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_l core.locations; v_p core.locations; v_company uuid; v_obj uuid; v_max int; v_ids uuid[]; v_old uuid[];
        v_i int; v_old_before uuid; v_moved boolean := false; v_n int := 0; v_depth int := 1;
begin
  select * into v_l from core.locations where id = p_location and deleted_at is null;
  if v_l.id is null then raise exception 'Место не найдено' using errcode = '22023'; end if;
  v_company := core.require_places_manage(v_l.project_id);
  if v_l.node_type = 'object' then
    if p_new_parent is not null then
      raise exception 'Объект не переносится — меняется только его порядок среди объектов' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('p2_0055_project:' || v_l.project_id::text, 0));
  else
    if p_new_parent is null then
      raise exception 'Переносить можно только внутри объекта; в другой объект — копировать и вставить' using errcode = '22023';
    end if;
    select * into v_p from core.locations where id = p_new_parent and deleted_at is null;
    if v_p.id is null then raise exception 'Место не найдено' using errcode = '22023'; end if;
    v_obj := core.place_object(p_location);
    if v_p.project_id <> v_l.project_id or core.place_object(p_new_parent) <> v_obj then
      raise exception 'Переносить можно только внутри объекта; в другой объект — копировать и вставить' using errcode = '22023';
    end if;
    if exists (with recursive up(id, parent_id) as (select id, parent_id from core.locations where id = p_new_parent
                                                    union all select l.id, l.parent_id from core.locations l join up on l.id = up.parent_id)
               select 1 from up where up.id = p_location) then
      raise exception 'Нельзя перенести место внутрь самого себя' using errcode = '22023';
    end if;
    with recursive sub(id, depth) as (select id, depth from core.locations where id = p_location
                                      union all select c.id, c.depth from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
    select max(depth) into v_max from sub;
    v_depth := v_p.depth + 1;
    if v_depth + (v_max - v_l.depth) > 6 then
      raise exception 'Слишком глубокая вложенность (максимум 6 уровней)' using errcode = '22023';
    end if;
    if v_p.id <> v_l.parent_id and exists (select 1 from core.locations where project_id = v_l.project_id and parent_id = v_p.id
                                           and canonical_key = v_l.canonical_key and deleted_at is null) then
      raise exception 'Место с таким названием уже есть на этом уровне' using errcode = '23505';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('p2_0047_object:' || v_obj::text, 0));
  end if;
  if p_before is not null and p_before <> p_location and not exists (
       select 1 from core.locations where id = p_before and project_id = v_l.project_id
          and parent_id is not distinct from p_new_parent and deleted_at is null) then
    raise exception 'Место-сосед не найдено на этом уровне' using errcode = '22023';
  end if;
  if p_before = p_location and v_l.parent_id is distinct from p_new_parent then
    raise exception 'Место-сосед не найдено на этом уровне' using errcode = '22023';
  end if;

  -- прежнее положение: следующий сосед на старом уровне
  v_old := array(select id from core.locations where project_id = v_l.project_id and parent_id is not distinct from v_l.parent_id
                   and deleted_at is null order by sort_order, name, id);
  v_i := array_position(v_old, p_location);
  v_old_before := v_old[v_i + 1];

  -- новый порядок уровня: соседи без переносимого, переносимое — перед p_before или в конце
  v_ids := array(select id from core.locations where project_id = v_l.project_id and parent_id is not distinct from p_new_parent
                   and deleted_at is null and id <> p_location order by sort_order, name, id);
  v_i := case when p_before is null or p_before = p_location then null else array_position(v_ids, p_before) end;
  if p_before = p_location then
    v_ids := v_old;                                        -- «перед самим собой» — остаётся на месте
  elsif v_i is null then
    v_ids := v_ids || p_location;
  else
    v_ids := v_ids[1:v_i - 1] || p_location || v_ids[v_i:];
  end if;

  if v_l.parent_id is distinct from p_new_parent then
    update core.locations set parent_id = p_new_parent, depth = v_depth where id = p_location;
    with recursive sub(id) as (select id from core.locations where parent_id = p_location and deleted_at is null
                               union all select c.id from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
    update core.locations l set depth = l.depth + (v_depth - v_l.depth) from sub where l.id = sub.id;
    v_moved := true;
  end if;
  update core.locations l set sort_order = x.ord
    from unnest(v_ids) with ordinality as x(id, ord)
   where l.id = x.id and l.sort_order <> x.ord;
  get diagnostics v_n = row_count;

  if v_moved or v_n > 0 then
    perform planfact.log_admin_change(v_company, v_l.project_id, 'locations', p_location, 'MOVE',
      jsonb_build_object('parent_id', v_l.parent_id, 'before', v_old_before, 'sort_order', v_l.sort_order),
      jsonb_build_object('parent_id', p_new_parent, 'before', p_before, 'reordered', v_n));
  end if;
  return jsonb_build_object('changed', v_moved or v_n > 0, 'old_parent', v_l.parent_id, 'old_before', v_old_before);
end $$;

-- 2. Копия ветки в выбранное место того же проекта (p_target_parent; в т.ч. другой корпус). id копии — с устройства;
--    повтор — та же копия. Квартиры копии получают строительные номера дальше по объекту-получателю.
create function public.pf_copy_place(p_source uuid, p_new_id uuid, p_name text, p_target_parent uuid)
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

-- 3. Вернуть удалённую ветку (для «Отменить»): то же место и всё, что удалено вместе с ним (та же пометка deleted_at);
--    места, удалённые раньше отдельно, остаются удалёнными. Повтор — 0.
create function public.pf_restore_place(p_location uuid)
returns int language plpgsql security definer set search_path = pg_catalog as $$
declare v_l core.locations; v_company uuid; v_pdepth int := 0; v_max int; v_n int; v_obj uuid;
begin
  select * into v_l from core.locations where id = p_location;
  if v_l.id is null then raise exception 'Место не найдено' using errcode = '22023'; end if;
  v_company := core.require_places_manage(v_l.project_id);
  if v_l.deleted_at is null then return 0; end if;   -- уже на месте (повтор запроса)
  if v_l.parent_id is not null then
    select depth into v_pdepth from core.locations where id = v_l.parent_id and deleted_at is null;
    if v_pdepth is null then raise exception 'Место выше удалено — сначала верните его' using errcode = '22023'; end if;
  end if;
  if exists (select 1 from core.locations where project_id = v_l.project_id and parent_id is not distinct from v_l.parent_id
             and canonical_key = v_l.canonical_key and deleted_at is null) then
    raise exception 'На этом уровне уже есть «%» — переименуйте его и повторите', v_l.name using errcode = '23505';
  end if;
  v_obj := coalesce(core.place_object(p_location), p_location);
  perform pg_advisory_xact_lock(hashtextextended('p2_0047_object:' || v_obj::text, 0));
  -- глубина — от нынешнего родителя (ветку могли перенести, пока место было удалено)
  with recursive sub(id, depth) as (select id, v_pdepth + 1 from core.locations where id = p_location
                                    union all select c.id, sub.depth + 1 from core.locations c join sub on c.parent_id = sub.id
                                               where c.deleted_at = v_l.deleted_at)
  select max(depth) into v_max from sub;
  if v_max > 6 then raise exception 'Слишком глубокая вложенность (максимум 6 уровней)' using errcode = '22023'; end if;
  with recursive sub(id, depth) as (select id, v_pdepth + 1 from core.locations where id = p_location
                                    union all select c.id, sub.depth + 1 from core.locations c join sub on c.parent_id = sub.id
                                               where c.deleted_at = v_l.deleted_at)
  update core.locations l set deleted_at = null, depth = sub.depth from sub where l.id = sub.id;
  get diagnostics v_n = row_count;
  perform planfact.log_admin_change(v_company, v_l.project_id, 'locations', p_location, 'RESTORE',
    jsonb_build_object('deleted_at', v_l.deleted_at), jsonb_build_object('name', v_l.name, 'node_type', v_l.node_type, 'nodes', v_n));
  return v_n;
end $$;

-- 4. Следующий строительный номер помещения в объекте места (для «+ Кв.» без окна; только чтение, право — управлять местами).
create function public.pf_next_build_no(p_location uuid)
returns int language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_l core.locations;
begin
  select * into v_l from core.locations where id = p_location and deleted_at is null;
  if v_l.id is null then raise exception 'Место не найдено' using errcode = '22023'; end if;
  perform core.require_places_manage(v_l.project_id);
  return core.next_build_no(core.place_object(p_location));
end $$;

-- 5. Доступ: только вошедшим, права проверяет каждая функция.
revoke all on function public.pf_move_place(uuid, uuid, uuid), public.pf_copy_place(uuid, uuid, text, uuid),
  public.pf_restore_place(uuid), public.pf_next_build_no(uuid) from public, anon;
grant execute on function public.pf_move_place(uuid, uuid, uuid), public.pf_copy_place(uuid, uuid, text, uuid),
  public.pf_restore_place(uuid), public.pf_next_build_no(uuid) to authenticated;

commit;
