-- P2-0056 (Excel со списком помещений → структура мест; решения владельца 28.10.2026). Ядро, места:
--   1) у помещения — «комнат» (rooms; 0 — студия); площадь — прежний столбец area (006), новый не заводится;
--      import_batch — метка загрузки, которой место создано (для «Отменить»);
--   2) pf_import_places — загрузка списка помещений одним действием: недостающие объекты / секции / этажи / помещения
--      создаются, существующие не трогаются («добавить недостающие»); ошибка хоть в одной строке — не пишется ничего;
--      p_dry_run — тот же расчёт без записи (предпросмотр); повтор с той же меткой — прежний ответ, ничего нового;
--   3) pf_import_undo — снять загрузку (пометка удаления созданного вместе с тем, что потом добавили внутрь);
--   4) pf_save_place_info — площадь и комнаты помещения; pf_project_places — отдаёт площадь и комнаты;
--   5) pf_copy_place (обе) — копия переносит и комнаты (площадь переносила и раньше).
-- Зеркало ядро → Качество (048) отражает новые места само — его не трогаем. Права — core.require_places_manage.
-- Применять после 049, одним запросом. Откат — 050_places_import_down.sql (снимает «комнат» вместе с данными).
begin;

do $$
begin
  if to_regprocedure('public.pf_move_place(uuid, uuid, uuid)') is null then
    raise exception '050: сначала 049_structure_editor_up.sql' using errcode = 'P0001';
  end if;
  if to_regprocedure('public.pf_import_places(uuid, uuid, jsonb, boolean)') is not null then
    raise exception '050 уже применена (повтор — только после 050_places_import_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Комнаты и метка загрузки
alter table core.locations
  add column rooms smallint check (rooms between 0 and 20),
  add column import_batch uuid;
alter table core.locations add constraint locations_rooms_apartment_chk check (rooms is null or node_type = 'apartment');
comment on column core.locations.rooms is 'P2-0056: число комнат помещения (0 — студия)';
comment on column core.locations.import_batch is 'P2-0056: загрузка из Excel, которой место создано (pf_import_places / pf_import_undo)';
create index locations_import_batch_idx on core.locations(import_batch) where import_batch is not null;

-- 2. Номер в конце названия («эт. 3», «Секция 2», «5 этаж», «эт. -1»); «кв. 45а» — номера нет (буква вплотную к цифрам).
create function core.place_num(p_name text)
returns int language sql immutable set search_path = pg_catalog as $$
  select case when m is not null and length(m[1]) <= 9 then m[1]::int end
    from (select regexp_match(btrim(coalesce(p_name, '')), '(-?[0-9]+)(\s+[^0-9]*)?$') m) x
$$;

-- Место уровня для загрузки: то же название; иначе единственное того же вида с тем же номером («3 этаж» = «эт. 3»);
-- у помещения ещё — единственное с тем же строительным номером.
create function core.import_find(p_project uuid, p_parent uuid, p_type text, p_name text, p_build_no text default null)
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(
    (select l.id from core.locations l where l.project_id = p_project and coalesce(l.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_parent, '00000000-0000-0000-0000-000000000000'::uuid)
        and l.canonical_key = planfact.canon_name(p_name) and l.deleted_at is null),
    (select (array_agg(l.id))[1] from core.locations l where l.project_id = p_project and coalesce(l.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_parent, '00000000-0000-0000-0000-000000000000'::uuid)
        and l.deleted_at is null and l.node_type = p_type and core.place_num(p_name) is not null
        and core.place_num(l.name) = core.place_num(p_name) having count(*) = 1),
    (select (array_agg(l.id))[1] from core.locations l where p_type = 'apartment' and p_build_no is not null
        and l.project_id = p_project and coalesce(l.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_parent, '00000000-0000-0000-0000-000000000000'::uuid) and l.deleted_at is null and l.node_type = 'apartment'
        and l.build_no = p_build_no having count(*) = 1))
$$;

-- Образец названия новых мест вида p_type под p_parent — у соседей того же вида («1 этаж» → {'', ' этаж'}, «Кв. 1» → {'Кв. ', ''}):
-- сначала соседи, затем места того же вида у соседей родителя, затем последнее такое место проекта; нет — null (как в файле).
create function core.import_pattern(p_project uuid, p_parent uuid, p_type text)
returns text[] language plpgsql stable security definer set search_path = pg_catalog as $$
declare m text[]; v_gp uuid; re constant text := '^(.*?)(-?[0-9]+)(\s+[^0-9]*)?$';
begin
  select regexp_match(l.name, re) into m from core.locations l
   where l.project_id = p_project and l.parent_id = p_parent and l.deleted_at is null and l.node_type = p_type and l.name ~ re
   order by l.sort_order desc limit 1;
  if m is null then
    select parent_id into v_gp from core.locations where id = p_parent;
    if v_gp is not null then
      select regexp_match(l.name, re) into m
        from core.locations c join core.locations l on l.project_id = p_project and l.parent_id = c.id
       where c.project_id = p_project and c.parent_id = v_gp and c.deleted_at is null
         and l.deleted_at is null and l.node_type = p_type and l.name ~ re order by l.created_at desc limit 1;
    end if;
  end if;
  if m is null then
    select regexp_match(l.name, re) into m from core.locations l
     where l.project_id = p_project and l.deleted_at is null and l.node_type = p_type and l.name ~ re order by l.created_at desc limit 1;
  end if;
  return case when m is not null and (m[1] <> '' or m[3] is not null) then array[m[1], coalesce(m[3], '')] end;
end $$;

-- 3. Загрузка списка помещений. p_rows — [{row_no, object, section, floor, name, build_no, bti_no, area, rooms}] (названия
--    приведены экраном: «Корпус 1», «Секция 1», «эт. 3», «кв. 45»). Ответ: {ok, created: {objects, sections, floors, apartments},
--    existing_rows: [№], differs: [{row_no, name, fields}], errors: [{row_no, msg}], roots: [id]}.
create function public.pf_import_places(p_project uuid, p_batch uuid, p_rows jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_company uuid; v_res jsonb; v_err jsonb; v_map jsonb := '{}'::jsonb; v_bno jsonb := '{}'::jsonb; r record;
        v_o uuid; v_s uuid; v_f uuid; v_a uuid; v_par uuid; v_par_new boolean; v_new boolean; v_type text; v_found text;
        v_depth int; v_no int; v_b text; v_diff jsonb; x core.locations; v_nm text; v_key text;
        n_obj int := 0; n_sec int := 0; n_flr int := 0; n_apt int := 0;
        v_existing int[] := '{}'; v_differs jsonb := '[]'; v_roots uuid[] := '{}'; v_loop_err jsonb := '[]';
begin
  v_company := core.require_places_manage(p_project);
  if p_batch is null then raise exception 'Нет метки загрузки' using errcode = '22023'; end if;
  if not coalesce(p_dry_run, false) then
    select a.new_data into v_res from core.audit_log a
     where a.company_id = v_company and a.record_id = p_batch and a.action = 'IMPORT' order by a.id desc limit 1;
    if v_res is not null then return v_res || jsonb_build_object('repeat', true); end if;   -- повтор запроса
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'В файле нет строк для загрузки' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Слишком много строк (максимум 5000)' using errcode = '22023'; end if;

  create temp table if not exists m050_rows(row_no int, obj text, sec text, flr text, name text, build_no text, bti_no text,
                                            area numeric, rooms int, err text) on commit drop;
  delete from pg_temp.m050_rows;
  insert into pg_temp.m050_rows(row_no, obj, sec, flr, name, build_no, bti_no, area, rooms, err)
  select coalesce(t.row_no, 0), nullif(btrim(coalesce(t.object, '')), ''), nullif(btrim(coalesce(t.section, '')), ''),
         nullif(btrim(coalesce(t.floor, '')), ''), nullif(btrim(coalesce(t.name, '')), ''),
         nullif(btrim(coalesce(t.build_no, '')), ''), nullif(btrim(coalesce(t.bti_no, '')), ''),
         case when btrim(coalesce(t.area, '')) ~ '^[0-9]{1,6}([.,][0-9]+)?$' then round(replace(btrim(t.area), ',', '.')::numeric, 2) end,
         case when btrim(coalesce(t.rooms, '')) ~ '^[0-9]{1,3}$' then btrim(t.rooms)::int end,
         case
           when nullif(btrim(coalesce(t.object, '')), '') is null then 'Не указан корпус (объект)'
           when nullif(btrim(coalesce(t.name, '')), '') is not null and nullif(btrim(coalesce(t.floor, '')), '') is null
             then 'У помещения не указан этаж'
           when greatest(length(btrim(coalesce(t.object, ''))), length(btrim(coalesce(t.section, ''))),
                         length(btrim(coalesce(t.floor, ''))), length(btrim(coalesce(t.name, '')))) > 200
             then 'Слишком длинное название (больше 200 знаков)'
           when greatest(length(btrim(coalesce(t.build_no, ''))), length(btrim(coalesce(t.bti_no, '')))) > 40
             then 'Слишком длинный номер (больше 40 знаков)'
           when nullif(btrim(coalesce(t.name, '')), '') is null and (nullif(btrim(coalesce(t.build_no, '')), '') is not null
                or nullif(btrim(coalesce(t.bti_no, '')), '') is not null or nullif(btrim(coalesce(t.area, '')), '') is not null
                or nullif(btrim(coalesce(t.rooms, '')), '') is not null)
             then 'Номера, площадь и комнаты — только у помещения'
           when nullif(btrim(coalesce(t.area, '')), '') is not null and (btrim(t.area) !~ '^[0-9]{1,6}([.,][0-9]+)?$'
                or replace(btrim(t.area), ',', '.')::numeric <= 0 or replace(btrim(t.area), ',', '.')::numeric >= 100000)
             then 'Площадь — положительное число меньше 100 000 м²'
           when nullif(btrim(coalesce(t.rooms, '')), '') is not null and (btrim(t.rooms) !~ '^[0-9]{1,3}$' or btrim(t.rooms)::int > 20)
             then 'Комнат — целое число от 0 до 20'
         end
    from jsonb_to_recordset(p_rows) as t(row_no int, object text, section text, floor text, name text, build_no text, bti_no text,
                                          area text, rooms text);
  -- одно и то же помещение в файле дважды
  update pg_temp.m050_rows m set err = 'Повтор в файле: строки ' || d.nos
    from (select planfact.canon_name(obj) o, planfact.canon_name(coalesce(sec, '')) s, planfact.canon_name(flr) f,
                 planfact.canon_name(name) n, string_agg(row_no::text, ', ' order by row_no) nos
            from pg_temp.m050_rows where err is null and name is not null group by 1, 2, 3, 4 having count(*) > 1) d
   where m.err is null and m.name is not null and planfact.canon_name(m.obj) = d.o and planfact.canon_name(coalesce(m.sec, '')) = d.s
     and planfact.canon_name(m.flr) = d.f and planfact.canon_name(m.name) = d.n;

  -- Расчёт — одним путём и для предпросмотра, и для записи: при p_dry_run или ошибке всё внутри блока откатывается.
  begin
    for r in select * from pg_temp.m050_rows where err is null order by row_no loop
      -- объект
      v_o := (v_map ->> ('o|' || planfact.canon_name(r.obj)))::uuid;
      if v_o is null then
        v_o := core.import_find(p_project, null, 'object', r.obj);
        if v_o is null then
          v_o := gen_random_uuid();
          insert into core.locations(id, company_id, project_id, parent_id, node_type, object_kind, name, sort_order, canonical_key, depth, import_batch)
          values (v_o, v_company, p_project, null, 'object', 'building', r.obj,
                  (select coalesce(max(sort_order), 0) + 1 from core.locations where project_id = p_project and parent_id is null and deleted_at is null),
                  planfact.canon_name(r.obj), 1, p_batch);
          n_obj := n_obj + 1; v_roots := v_roots || v_o; v_map := v_map || jsonb_build_object('n|' || v_o, true);
        else
          perform pg_advisory_xact_lock(hashtextextended('p2_0047_object:' || v_o::text, 0));
        end if;
        v_map := v_map || jsonb_build_object('o|' || planfact.canon_name(r.obj), v_o);
      end if;
      v_par := v_o; v_new := v_map ? ('n|' || v_o);
      -- секция и этаж
      foreach v_type in array array['section', 'floor'] loop
        v_found := case v_type when 'section' then r.sec else r.flr end;
        continue when v_found is null;
        v_a := (v_map ->> ('p|' || v_par || '|' || planfact.canon_name(v_found)))::uuid;
        if v_a is null then
          v_a := core.import_find(p_project, v_par, v_type, v_found);
          if v_a is not null and (select node_type from core.locations where id = v_a) <> v_type then
            raise exception using errcode = 'PI056', message = r.row_no || '|На этом уровне уже есть «' || v_found || '» другого вида';
          end if;
          if v_a is null then
            v_a := gen_random_uuid();
            select depth + 1 into v_depth from core.locations where id = v_par;
            -- название — по образцу соседей (образец уровня считается один раз)
            v_key := 'f|' || v_par || '|' || v_type;
            if not v_map ? v_key then v_map := v_map || jsonb_build_object(v_key, to_jsonb(core.import_pattern(p_project, v_par, v_type))); end if;
            v_nm := case when v_found ~ '^(Секция|эт\.|кв\.) -?[0-9]+$' and jsonb_typeof(v_map -> v_key) = 'array'
                         then (v_map -> v_key ->> 0) || core.place_num(v_found)::text || (v_map -> v_key ->> 1) else v_found end;
            if v_nm <> v_found and exists (select 1 from core.locations where project_id = p_project and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_par, '00000000-0000-0000-0000-000000000000'::uuid)
                       and canonical_key = planfact.canon_name(v_nm) and deleted_at is null) then
              raise exception using errcode = 'PI056', message = r.row_no || '|На этом уровне несколько мест с таким номером — уточните название в файле';
            end if;
            insert into core.locations(id, company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth, import_batch)
            values (v_a, v_company, p_project, v_par, v_type, v_nm,
                    (select coalesce(max(sort_order), 0) + 1 from core.locations where project_id = p_project and parent_id = v_par and deleted_at is null),
                    planfact.canon_name(v_nm), v_depth, p_batch);
            if v_type = 'section' then n_sec := n_sec + 1; else n_flr := n_flr + 1; end if;
            if not v_new then v_roots := v_roots || v_a; end if;
            v_map := v_map || jsonb_build_object('n|' || v_a, true);
          end if;
          v_map := v_map || jsonb_build_object('p|' || v_par || '|' || planfact.canon_name(v_found), v_a);
        end if;
        v_par := v_a; v_new := v_map ? ('n|' || v_a);
      end loop;
      -- помещение
      if r.name is null then
        if not v_new then v_existing := v_existing || r.row_no; end if;
        continue;
      end if;
      v_a := core.import_find(p_project, v_par, 'apartment', r.name, r.build_no);
      if v_a is not null then
        select * into x from core.locations where id = v_a;
        if x.node_type <> 'apartment' then
          raise exception using errcode = 'PI056', message = r.row_no || '|На этом уровне уже есть «' || x.name || '» другого вида';
        end if;
        v_diff := '[]';
        if r.build_no is not null and r.build_no is distinct from x.build_no then v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', 'build_no', 'now', x.build_no, 'file', r.build_no)); end if;
        if r.bti_no is not null and r.bti_no is distinct from x.bti_no then v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', 'bti_no', 'now', x.bti_no, 'file', r.bti_no)); end if;
        if r.area is not null and r.area is distinct from x.area then v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', 'area', 'now', x.area, 'file', r.area)); end if;
        if r.rooms is not null and r.rooms is distinct from x.rooms then v_diff := v_diff || jsonb_build_array(jsonb_build_object('field', 'rooms', 'now', x.rooms, 'file', r.rooms)); end if;
        if jsonb_array_length(v_diff) > 0 then
          v_differs := v_differs || jsonb_build_array(jsonb_build_object('row_no', r.row_no, 'name', x.name, 'fields', v_diff));
        else
          v_existing := v_existing || r.row_no;
        end if;
        continue;
      end if;
      v_b := r.build_no;
      if v_b is null then
        v_no := (v_bno ->> v_o::text)::int;
        if v_no is null then
          select greatest(core.next_build_no(v_o), coalesce(max(m.build_no::int) + 1, 1)) into v_no from pg_temp.m050_rows m
           where m.err is null and planfact.canon_name(m.obj) = planfact.canon_name(r.obj) and m.build_no ~ '^[0-9]{1,9}$';
        end if;
        v_b := v_no::text;
        v_bno := v_bno || jsonb_build_object(v_o::text, v_no + 1);
      end if;
      v_a := gen_random_uuid();
      -- название — по образцу соседей (образец уровня считается один раз)
      v_key := 'f|' || v_par || '|' || 'apartment';
      if not v_map ? v_key then v_map := v_map || jsonb_build_object(v_key, to_jsonb(core.import_pattern(p_project, v_par, 'apartment'))); end if;
      v_nm := case when r.name ~ '^(Секция|эт\.|кв\.) -?[0-9]+$' and jsonb_typeof(v_map -> v_key) = 'array'
                   then (v_map -> v_key ->> 0) || core.place_num(r.name)::text || (v_map -> v_key ->> 1) else r.name end;
      if v_nm <> r.name and exists (select 1 from core.locations where project_id = p_project and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_par, '00000000-0000-0000-0000-000000000000'::uuid)
                 and canonical_key = planfact.canon_name(v_nm) and deleted_at is null) then
        raise exception using errcode = 'PI056', message = r.row_no || '|На этом уровне несколько мест с таким номером — уточните название в файле';
      end if;
      insert into core.locations(id, company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth,
                                 build_no, bti_no, area, rooms, import_batch)
      values (v_a, v_company, p_project, v_par, 'apartment', v_nm,
              (select coalesce(max(sort_order), 0) + 1 from core.locations where project_id = p_project and parent_id = v_par and deleted_at is null),
              planfact.canon_name(v_nm), (select depth + 1 from core.locations where id = v_par), v_b, r.bti_no, r.area, r.rooms, p_batch);
      n_apt := n_apt + 1;
      if not v_new then v_roots := v_roots || v_a; end if;
    end loop;
    if coalesce(p_dry_run, false) or exists (select 1 from pg_temp.m050_rows where err is not null) then
      raise exception using errcode = 'PI056', message = '0|';   -- откат блока: предпросмотр или ошибки в строках
    end if;
  exception when sqlstate 'PI056' then
    if split_part(sqlerrm, '|', 2) <> '' then
      v_loop_err := jsonb_build_array(jsonb_build_object('row_no', split_part(sqlerrm, '|', 1)::int,
                                                         'msg', substr(sqlerrm, strpos(sqlerrm, '|') + 1)));
      v_roots := '{}';
    end if;
  end;

  select coalesce(jsonb_agg(jsonb_build_object('row_no', row_no, 'msg', err) order by row_no), '[]') into v_err
    from pg_temp.m050_rows where err is not null;
  v_err := v_err || v_loop_err;
  v_res := jsonb_build_object('ok', jsonb_array_length(v_err) = 0, 'dry_run', coalesce(p_dry_run, false),
    'created', jsonb_build_object('objects', n_obj, 'sections', n_sec, 'floors', n_flr, 'apartments', n_apt),
    'existing_rows', to_jsonb(v_existing), 'differs', v_differs, 'errors', v_err,
    'roots', case when coalesce(p_dry_run, false) or jsonb_array_length(v_err) > 0 then '[]'::jsonb else to_jsonb(v_roots) end);
  if jsonb_array_length(v_loop_err) > 0 then
    -- строка, найденная только при расчёте (вид места не тот): счётчики до неё неполные — не показываем
    v_res := v_res || jsonb_build_object('created', jsonb_build_object('objects', 0, 'sections', 0, 'floors', 0, 'apartments', 0));
  end if;
  if not coalesce(p_dry_run, false) and jsonb_array_length(v_err) = 0 then
    perform planfact.log_admin_change(v_company, p_project, 'locations', p_batch, 'IMPORT', null, v_res);
  end if;
  return v_res;
end $$;

-- 4. Снять загрузку: места этой загрузки и всё, что потом добавили внутрь, — пометкой удаления одним действием. Повтор — 0.
create function public.pf_import_undo(p_batch uuid)
returns int language plpgsql security definer set search_path = pg_catalog as $$
declare v_project uuid; v_company uuid; v_n int;
begin
  select project_id into v_project from core.locations where import_batch = p_batch limit 1;
  if v_project is null then raise exception 'Загрузка не найдена' using errcode = '22023'; end if;
  v_company := core.require_places_manage(v_project);
  with recursive sub(id) as (select id from core.locations where import_batch = p_batch and deleted_at is null
                             union select c.id from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
  update core.locations l set deleted_at = now() from sub where l.id = sub.id and l.deleted_at is null;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform planfact.log_admin_change(v_company, v_project, 'locations', p_batch, 'IMPORT_UNDO', null, jsonb_build_object('nodes', v_n));
  end if;
  return v_n;
end $$;

-- 5. Площадь и комнаты помещения (null — стереть).
create function public.pf_save_place_info(p_location uuid, p_area numeric, p_rooms int)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_l core.locations; v_company uuid; v_area numeric := round(p_area, 2);
begin
  select * into v_l from core.locations where id = p_location and deleted_at is null;
  if v_l.id is null then raise exception 'Место не найдено' using errcode = '22023'; end if;
  v_company := core.require_places_manage(v_l.project_id);
  if v_l.node_type <> 'apartment' then raise exception 'Площадь и комнаты — только у помещения' using errcode = '22023'; end if;
  if v_area is not null and (v_area <= 0 or v_area >= 100000) then
    raise exception 'Площадь — положительное число меньше 100 000 м²' using errcode = '22023';
  end if;
  if p_rooms is not null and (p_rooms < 0 or p_rooms > 20) then raise exception 'Комнат — целое число от 0 до 20' using errcode = '22023'; end if;
  if (v_l.area, v_l.rooms::int) is distinct from (v_area, p_rooms) then
    update core.locations set area = v_area, rooms = p_rooms where id = p_location;
    perform planfact.log_admin_change(v_company, v_l.project_id, 'locations', p_location, 'UPDATE',
      jsonb_build_object('area', v_l.area, 'rooms', v_l.rooms), jsonb_build_object('area', v_area, 'rooms', p_rooms));
  end if;
  return p_location;
end $$;

-- 6. Места проекта — с площадью и комнатами (столбцы добавлены в конец; прочее как в 045).
drop function public.pf_project_places(uuid, uuid);
create function public.pf_project_places(p_project uuid, p_parent uuid default null)
returns table(id uuid, parent_id uuid, node_type text, object_kind text, name text, build_no text, bti_no text,
              sort_order int, depth int, path text, child_count int, apartment_count int, area numeric, rooms int)
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
            select count(*)::int from sub join core.locations a on a.id = sub.id where a.node_type = 'apartment') end,
         l.area, l.rooms::int
    from core.locations l
   where l.project_id = p_project and l.deleted_at is null and l.parent_id is not distinct from p_parent
   order by l.sort_order, l.name, l.id;
end $$;
revoke all on function public.pf_project_places(uuid, uuid) from public, anon;
grant execute on function public.pf_project_places(uuid, uuid) to authenticated;

-- 7. Копия места переносит и комнаты (прочее как в 045 / 049).
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
  insert into core.locations(id, company_id, project_id, parent_id, node_type, name, sort_order, area, rooms, canonical_key, depth, build_no, bti_no)
  select m.new_id, v_company, l.project_id,
         case when l.id = v_src.id then l.parent_id else (select p.new_id from pg_temp.m045_copy p where p.old_id = l.parent_id) end,
         l.node_type,
         case when l.id = v_src.id then v_name when l.node_type = 'apartment' and l.build_no is not null then 'кв. ' || (v_no + m.k) else l.name end,
         case when l.id = v_src.id then v_order else l.sort_order end, l.area, l.rooms,
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
  insert into core.locations(id, company_id, project_id, parent_id, node_type, name, sort_order, area, rooms, canonical_key, depth, build_no, bti_no)
  select m.new_id, v_company, l.project_id,
         case when l.id = v_src.id then v_t.id else (select p.new_id from pg_temp.m049_copy p where p.old_id = l.parent_id) end,
         l.node_type,
         case when l.id = v_src.id then v_name when l.node_type = 'apartment' and l.build_no is not null then 'кв. ' || (v_no + m.k) else l.name end,
         case when l.id = v_src.id then v_order else l.sort_order end, l.area, l.rooms,
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

-- 8. Доступ: только вошедшим, права проверяет каждая функция; служебные — никому.
revoke all on function core.place_num(text), core.import_find(uuid, uuid, text, text, text), core.import_pattern(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.pf_import_places(uuid, uuid, jsonb, boolean), public.pf_import_undo(uuid),
  public.pf_save_place_info(uuid, numeric, int) from public, anon;
grant execute on function public.pf_import_places(uuid, uuid, jsonb, boolean), public.pf_import_undo(uuid),
  public.pf_save_place_info(uuid, numeric, int) to authenticated;

commit;
