-- P2-0035 этап 1 (ADR-070 п. 1–4, ADR-066; CRITICAL — правила доступа и данные Качества). Объекты Качества — по id объекта ядра.
-- Решения владельца 25.10.2026 (карточка P2-0035, «Решения 4–7»):
--   1) каждый объект Качества (quality.project_objects, ЖК) — свой объект ядра (core.projects): новая колонка core_object_id.
--      Объект ядра ищется по точному очищенному названию (quality.object_clean) среди неархивных объектов компании: один —
--      связь; нет — создаётся; два и больше — спорно, связь пустая (список — quality.object_link_report, решает владелец);
--   2) у записей Качества с объектом — колонка core_object_id (объект ядра). Её пишет только сервер (триггер): из "projectId"
--      (id объекта Качества или узла-объекта локаций), ключа и названия объекта записи — точное совпадение очищенной строки,
--      синоним объекта или синоним из quality.object_aliases. Признаки указывают на разные объекты или ни на один — пусто
--      («не разобрано»). Правка записи без изменения объекта сохраняет прежний id (переименование объекта не отрывает записи);
--   3) правила видимости таблиц с объектом записи — по core_object_id: назначение с объектами видит записи своих объектов
--      (любого автора) и свои записи без объекта / «не разобрано»; текст объекта в правилах больше не участвует
--      (ТД №191, №193, №197). Остальное (компания запроса, модуль, срок назначения, фирма подрядчика) — без изменений;
--   4) смысл core_project_id и project_code («объект-контейнер», на нём права «на объект ядра» и сторож 037b) — не меняется;
--      старое приложение и экраны Качества пишут текст, как раньше;
--   5) переименование объекта Качества: прежние ключ и название добавляются в синонимы (устройства со старым справочником
--      продолжают узнаваться).
-- Применять после 038, одним запросом. Откат — 039_quality_objects_by_id_down.sql (созданные объекты ядра и дописанные
-- синонимы остаются — это данные компании).
begin;

do $$
begin
  if to_regclass('core.module_catalog') is null or not exists (select 1 from information_schema.columns
       where table_schema = 'core' and table_name = 'module_catalog' and column_name = 'access_action') then
    raise exception '039: сначала 038_company_modules_up.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = 'project_objects'
              and column_name = 'core_object_id') then
    raise exception '039 уже применена (повтор — только после 039_quality_objects_by_id_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Объект Качества → объект ядра.
alter table quality.project_objects add column core_object_id uuid;
alter table quality.project_objects add constraint project_objects_core_object_fk foreign key (core_object_id, core_company_id)
  references core.projects(id, company_id);
create index project_objects_core_object_idx on quality.project_objects (core_object_id);
comment on column quality.project_objects.core_object_id is 'P2-0035: объект ядра (core.projects) этого объекта Качества; пишет сервер';

-- Объект Качества не удалён.
create function quality.object_alive(p quality.project_objects)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select not coalesce(p.is_deleted, false) and not coalesce(p._deleted, false) and p.deleted_at is null
$$;

-- Объект ядра для объекта Качества: точное очищенное название (название или ключ) среди неархивных объектов компании;
-- нет — создаётся; два и больше — null (спорно, не угадывать).
create function quality.ensure_core_object(p quality.project_objects)
returns uuid language plpgsql security definer set search_path = pg_catalog, core as $$
declare v uuid[]; v_id uuid;
begin
  if p.core_company_id is null or not quality.object_alive(p) then return null; end if;
  select array_agg(pr.id order by pr.created_at, pr.id) into v from core.projects pr
   where pr.company_id = p.core_company_id and pr.archived_at is null
     and quality.object_clean(pr.name) <> ''
     and quality.object_clean(pr.name) in (quality.object_clean(p.display_name), quality.object_clean(p.canonical_key));
  if cardinality(v) = 1 then return v[1]; end if;
  if cardinality(v) > 1 then return null; end if;
  insert into core.projects(company_id, name) values (p.core_company_id, btrim(coalesce(nullif(btrim(p.display_name), ''), p.canonical_key)))
    returning id into v_id;
  perform planfact.log_admin_change(p.core_company_id, v_id, 'projects', v_id, 'INSERT', null,
    jsonb_build_object('name', btrim(coalesce(nullif(btrim(p.display_name), ''), p.canonical_key)), 'source', 'P2-0035 объект Качества ' || p.id));
  return v_id;
end $$;

-- Триггер объекта Качества: связь ставит сервер (клиент её не меняет; служебные функции — с quality.object_bind = '1');
-- переименование — прежние ключ и название в синонимы.
create function quality.project_object_core()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare x text;
begin
  if coalesce(current_setting('quality.object_bind', true), '') <> '1' then
    new.core_object_id := case when tg_op = 'UPDATE' then old.core_object_id end;
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
create trigger project_objects_core_object before insert or update on quality.project_objects
  for each row execute function quality.project_object_core();

-- Связать существующие объекты (сначала ранние: одноимённые дубли получают общий объект ядра).
do $$
declare p quality.project_objects;
begin
  perform set_config('quality.object_bind', '1', true);
  for p in select * from quality.project_objects po where quality.object_alive(po) order by po.core_company_id, po.created_at, po.id loop
    update quality.project_objects set core_object_id = quality.ensure_core_object(p) where id = p.id;
  end loop;
  perform set_config('quality.object_bind', '', true);
end $$;

-- 2. Объекты ядра, на которые указывают признаки записи ("projectId", ключ, название): различные; null — спорный объект Качества.
create function quality.object_candidates(p_company uuid, p_pid text, p_key text, p_name text)
returns uuid[] language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  ids uuid[] := '{}';
  v uuid[];
  x text;
begin
  if p_company is null then return null; end if;
  x := btrim(coalesce(p_pid, ''));
  if x <> '' then
    select array_agg(po.core_object_id) into v from quality.project_objects po
     where po.core_company_id = p_company and po.id = x and quality.object_alive(po);
    if v is null then
      select array_agg(po.core_object_id) into v
        from quality.location_nodes n join quality.project_objects po on po.core_company_id = n.core_company_id and quality.object_alive(po)
       where n.core_company_id = p_company and n.id = x and n."nodeType" = 'object' and not coalesce(n.is_deleted, false)
         and quality.object_clean(coalesce(nullif(n.canonical_key, ''), n."displayName")) <> ''
         and (quality.object_clean(coalesce(nullif(n.canonical_key, ''), n."displayName")) in (quality.object_clean(po.canonical_key), quality.object_clean(po.display_name))
              or exists (select 1 from unnest(po.synonyms) y where quality.object_clean(y) = quality.object_clean(coalesce(nullif(n.canonical_key, ''), n."displayName"))));
    end if;
    ids := ids || coalesce(v, '{}');
  end if;
  foreach x in array array[p_key, p_name] loop
    x := quality.object_clean(x);   -- «нет объекта» — как quality.record_keys (033)
    if x in ('unknown', 'все', 'all') or x like 'все %' then x := ''; end if;
    if x <> '' then
      select array_agg(po.core_object_id) into v from quality.project_objects po
       where po.core_company_id = p_company and quality.object_alive(po)
         and (quality.object_clean(po.canonical_key) = x or quality.object_clean(po.display_name) = x
              or exists (select 1 from unnest(po.synonyms) y where quality.object_clean(y) = x));
      if v is null then
        select array_agg(po.core_object_id) into v
          from quality.object_aliases al join quality.project_objects po
            on po.core_company_id = al.core_company_id and po.canonical_key = al.canonical_key and quality.object_alive(po)
         where al.core_company_id = p_company and not coalesce(al.is_deleted, false) and quality.object_clean(al.raw_name) = x;
      end if;
      ids := ids || coalesce(v, '{}');
    end if;
  end loop;
  select array_agg(distinct i) into v from unnest(ids) i;
  return coalesce(v, '{}');
end $$;

-- Объект записи: один объект ядра — его id; разные или ни одного — null («не разобрано» / без объекта).
create function quality.object_of(p_company uuid, p_pid text, p_key text, p_name text)
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select case when cardinality(c) = 1 then c[1] end from (select quality.object_candidates(p_company, p_pid, p_key, p_name) c) x
$$;

-- Триггер записи: id объекта считает сервер; правка без изменения объекта записи — прежний id. Сотрудник, закреплённый за
-- объектами (нет назначения на все объекты), не пишет запись, признаки которой указывают на разные объекты, один из которых
-- не его (как M3 033b — теперь по id объектов).
create function quality.set_record_object()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare n jsonb := to_jsonb(new); o jsonb; v uuid[];
begin
  if coalesce(current_setting('quality.object_bind', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    if (n ->> 'projectId', n ->> 'project_canonical_key', n ->> 'project_display_name', n ->> 'core_company_id')
       is not distinct from (o ->> 'projectId', o ->> 'project_canonical_key', o ->> 'project_display_name', o ->> 'core_company_id') then
      new.core_object_id := old.core_object_id;
      return new;
    end if;
  end if;
  v := quality.object_candidates(new.core_company_id, n ->> 'projectId', n ->> 'project_canonical_key', n ->> 'project_display_name');
  if cardinality(v) > 1 and auth.uid() is not null and not planfact.is_platform_admin()
     and not exists (select 1 from core.role_assignments a
                      where a.company_id = new.core_company_id and a.user_id = auth.uid() and a.quality_objects is null
                        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))
     and exists (select 1 from unnest(v) c where c is null or not exists (
                   select 1 from core.role_assignments a
                     join quality.project_objects po on po.core_company_id = a.company_id and po.id = any (a.quality_objects) and quality.object_alive(po)
                    where a.company_id = new.core_company_id and a.user_id = auth.uid() and po.core_object_id = c
                      and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))) then
    raise exception 'Объект записи указывает на объект, который за вами не закреплён' using errcode = '42501';
  end if;
  new.core_object_id := case when cardinality(v) = 1 then v[1] end;
  return new;
end $$;

-- Таблицы с объектом записи: колонка, ссылка на объект ядра (той же компании), индекс, триггер, заполнение существующих
-- (по различным сочетаниям признаков — быстро на больших таблицах).
do $$
declare t text; v_pid text;
begin
  perform set_config('quality.object_bind', '1', true);
  foreach t in array array['rbi_inspections', 'rbi_inspection_items', 'rbi_inspection_photos', 'rbi_tasks', 'sk_records', 'sk_volumes',
                           'sk_data_bundles', 'sk_import_batches', 'project_fmea', 'project_interventions', 'project_meetings',
                           'project_schedule_stages', 'shared_reports', 'shared_report_snapshots'] loop
    execute format('alter table quality.%I add column core_object_id uuid', t);
    execute format('alter table quality.%I add constraint %I foreign key (core_object_id, core_company_id) references core.projects(id, company_id)',
                   t, t || '_core_object_fk');
    execute format('create index %I on quality.%I (core_company_id, core_object_id)', t || '_core_object_idx', t);
    execute format('comment on column quality.%I.core_object_id is %L', t, 'P2-0035: объект ядра записи (пишет сервер; пусто — «не разобрано» или без объекта)');
    execute format('create trigger %I before insert or update on quality.%I for each row execute function quality.set_record_object()',
                   t || '_record_object', t);
    v_pid := case when exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = t and column_name = 'projectId')
                  then '"projectId"' else 'null::text' end;
    execute format($q$
      with d as (select distinct r.core_company_id c, %2$s pid, %3$s k, %4$s nm from quality.%1$I r),
           m as (select c, pid, k, nm, quality.object_of(c, pid, k, nm) oid from d)
      update quality.%1$I r set core_object_id = m.oid from m
       where m.oid is not null and r.core_company_id = m.c and %2$s is not distinct from m.pid
         and %3$s is not distinct from m.k and %4$s is not distinct from m.nm$q$,
      t, replace(v_pid, '"projectId"', 'r."projectId"'), 'r.project_canonical_key',
      case when exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = t and column_name = 'project_display_name')
           then 'r.project_display_name' else 'null::text' end);
  end loop;
  perform set_config('quality.object_bind', '', true);
end $$;

-- 3. Видимость строки с объектом записи (объект ядра p_object; null — без объекта или «не разобрано»). Назначение с объектами:
--    свой объект — просмотр любого автора (как вид 'contractor': фирма подрядчика и объект ядра — как раньше), правка — по
--    правилам роли; без объекта — только своя запись; чужой объект — нет. Остальное — как quality.row_visible (020/033b).
create function quality.object_row_visible(p_company uuid, p_project uuid, p_actions text[], p_kind text,
  p_author uuid, p_assignee uuid, p_ckey text, p_cname text, p_object uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  select p_company is not null and p_company = quality.request_company() and exists (
    select 1 from unnest(p_actions) act
    join core.company_modules cm on cm.company_id = p_company and cm.module = split_part(act, '.', 1) and cm.enabled
    where planfact.is_platform_admin() or exists (
      select 1 from core.role_assignments a
      join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = act
      where a.company_id = p_company and a.user_id = auth.uid()
        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
        and case
          when p_kind not in ('author', 'contractor') or a.quality_objects is null then
            quality.assignment_sees(a, split_part(act, '.', 1), p_project, p_kind, p_author, p_assignee, p_ckey, p_cname)
          when p_object is null then
            coalesce(auth.uid() = p_author or auth.uid() = p_assignee, false)
            and quality.assignment_sees(a, split_part(act, '.', 1), p_project, p_kind, p_author, p_assignee, p_ckey, p_cname)
          when exists (select 1 from quality.project_objects po
                        where po.core_object_id = p_object and po.core_company_id = p_company
                          and po.id = any (a.quality_objects) and quality.object_alive(po)) then
            quality.assignment_sees(a, split_part(act, '.', 1), p_project,
              case when split_part(act, '.', 2) = 'view' then 'contractor' else p_kind end, p_author, p_assignee, p_ckey, p_cname)
          else false end));
$$;

-- Пункты и фото проверки — по своей проверке, с её объектом (сигнатуры — как в 023/033).
create or replace function quality.inspection_child_visible(p_company uuid, p_project uuid, p_actions text[], p_inspection text, p_author uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, contractor_canonical_key, contractor_name, core_object_id into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.object_row_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.contractor_canonical_key, i.contractor_name,
      i.core_object_id);
  end if;
  return quality.row_visible(p_company, p_project, p_actions, 'author', p_author, null, null, null);
end $$;

create or replace function quality.inspection_child_writable(p_company uuid, p_project uuid, p_actions text[], p_inspection text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, contractor_canonical_key, contractor_name, core_object_id into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.object_row_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.contractor_canonical_key, i.contractor_name,
      i.core_object_id);
  end if;
  return quality.can(p_company, p_project, array(select replace(x, '.edit', '.manage') from unnest(p_actions) x));
end $$;

-- Таблицы с объектом записи: правила select / insert / update / delete — по объекту ядра (прочие аргументы — как 033).
do $$
declare r record; v_vis text; v_edit text;
begin
  for r in select * from (values
    ('rbi_inspections',
       '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), null, contractor_canonical_key, contractor_name'),
    ('rbi_tasks',
       '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, contractor_canonical_key, contractor_name'),
    ('sk_records',              '''contractor'', core_created_by, null, contractor_canonical_key, contractor_name'),
    ('project_fmea',            '''contractor'', core_created_by, null, null, contractor_name'),
    ('project_interventions',   '''contractor'', core_created_by, null, null, contractor_name'),
    ('project_meetings',        '''contractor'', core_created_by, null, null, contractor_name'),
    ('project_schedule_stages', '''contractor'', core_created_by, null, null, contractor_name'),
    ('shared_reports',          '''contractor'', core_created_by, null, contractor_canonical_key, null'),
    ('shared_report_snapshots', '''contractor'', core_created_by, null, contractor_canonical_key, null')
  ) v(t, args) loop
    v_vis  := format('quality.object_row_visible(core_company_id, core_project_id, %L, %s, core_object_id)', '{quality.view}', r.args);
    v_edit := format('quality.object_row_visible(core_company_id, core_project_id, %L, %s, core_object_id)', '{quality.edit}', r.args);
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (%s)', r.t || '_select', r.t, v_vis);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
end $$;

-- 4. Сводка для администратора и отчёта (только чтение; SQL Editor): по таблицам — строк, с объектом, «не разобрано»
--    (текст объекта есть, объекта нет); объекты Качества без объекта ядра (спорные).
create function quality.object_link_report(p_company uuid)
returns table (t text, total bigint, linked bigint, unresolved bigint) language plpgsql stable security definer set search_path = pg_catalog as $$
declare x text; v_pid text; v_nm text;
begin
  foreach x in array array['rbi_inspections', 'rbi_inspection_items', 'rbi_inspection_photos', 'rbi_tasks', 'sk_records', 'sk_volumes',
                           'sk_data_bundles', 'sk_import_batches', 'project_fmea', 'project_interventions', 'project_meetings',
                           'project_schedule_stages', 'shared_reports', 'shared_report_snapshots'] loop
    v_pid := case when exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = x and column_name = 'projectId')
                  then '"projectId"' else 'null::text' end;
    v_nm := case when exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = x and column_name = 'project_display_name')
                 then 'project_display_name' else 'null::text' end;
    return query execute format($q$
      select %1$L::text, count(*), count(core_object_id),
             count(*) filter (where core_object_id is null
               and (coalesce(btrim(%2$s), '') <> '' or quality.record_keys(array[null, project_canonical_key, %3$s]) is not null))
        from quality.%1$I where core_company_id = $1$q$, x, v_pid, v_nm) using p_company;
  end loop;
  return query select 'project_objects: без объекта ядра'::text, count(*), count(core_object_id), count(*) filter (where core_object_id is null)
    from quality.project_objects po where po.core_company_id = p_company and quality.object_alive(po);
end $$;

revoke all on function quality.object_alive(quality.project_objects), quality.ensure_core_object(quality.project_objects),
  quality.project_object_core(), quality.object_candidates(uuid, text, text, text), quality.object_of(uuid, text, text, text), quality.set_record_object(),
  quality.object_row_visible(uuid, uuid, text[], text, uuid, uuid, text, text, uuid), quality.object_link_report(uuid)
  from public, anon, authenticated;
grant execute on function quality.object_row_visible(uuid, uuid, text[], text, uuid, uuid, text, text, uuid) to authenticated;

commit;
