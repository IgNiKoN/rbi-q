-- P2-0076 (CRITICAL — миграция только добавляющая): внешний СК по номерам «Компании».
--  1) у quality.sk_records рядом с текстами — core_work_type_id (вид работ ядра) и core_location_id (место ядра: объект → корпус /
--     секция → этаж); фирма — прежний core_counterparty_id (039a), теперь — по соответствию. Названия остаются подписью;
--  2) quality.sk_links — одна таблица соответствий «текст из Excel → запись ядра» (фирма / категория / место) на проект компании:
--     текст хранится нормализованным (quality.sk_link_key), запись ядра — по id с внешним ключом; пусто = «не сопоставлено»
--     (это и есть список «Разобрать»). Выбор человека (matched_by = 'person') главнее автоподбора; автоподбор (matched_by = 'auto':
--     фирма — по ключу / названию контрагента, как 039a; категория — по названию вида работ; место — по дереву мест объекта, до
--     этажа) пересчитывается при каждой записи — появится контрагент или этаж в «Компании», связь допишется сама.
--     В ядре ничего не создаётся. Старые sk_contractor_map / sk_category_map не удаляются (уборка — P2-0063);
--  3) сторож quality.sk_stamp_core_ids (последним из BEFORE) ставит три id каждой записи по соответствиям и заводит строку
--     соответствия новому тексту;
--  4) запись — только функциями: quality.sk_link_set (выбор / «Отменить»; право «Внешний СК: загрузка» по P2-0071, фирму —
--     не «своя фирма»; выбор применяется ко всем замечаниям проекта с этим текстом; журнал core.audit_log), quality.sk_links_register
--     (шаг сопоставления при загрузке Excel); чтение — quality.sk_links_list («Разобрать»), quality.sk_core_choices (записи ядра для
--     выбора и подписей); quality.sk_links_backfill — разовая привязка старых записей (сухой прогон / применение), только postgres.
-- Правила RLS, права и функции 052/053/054 не меняются. Откат — 056_sk_core_ids_down.sql.

-- 1. Колонки id рядом с текстами
alter table quality.sk_records add column core_work_type_id uuid references core.work_types (id) on delete set null;
alter table quality.sk_records add column core_location_id uuid references core.locations (id) on delete set null;
create index sk_records_core_work_type_idx on quality.sk_records (core_company_id, core_work_type_id) where core_work_type_id is not null;
create index sk_records_core_location_idx on quality.sk_records (core_company_id, core_location_id) where core_location_id is not null;
comment on column quality.sk_records.core_work_type_id is 'P2-0076: вид работ ядра (core.work_types) по соответствию категории (quality.sk_links); category — подпись';
comment on column quality.sk_records.core_location_id is 'P2-0076: место ядра (core.locations: объект / корпус / секция / этаж) по соответствию расположения; project_* — подпись';

-- 2. Таблица соответствий
create table quality.sk_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies (id),
  project_id uuid not null,
  kind text not null check (kind in ('contractor', 'category', 'place')),
  source_key text not null check (length(source_key) between 1 and 500),
  source_text text not null check (length(source_text) between 1 and 500),
  counterparty_id uuid,
  work_type_id uuid references core.work_types (id) on delete set null,
  location_id uuid references core.locations (id) on delete set null,
  matched_by text check (matched_by in ('auto', 'person')),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint sk_links_project_fk foreign key (project_id, company_id) references core.projects (id, company_id) on delete cascade,
  constraint sk_links_counterparty_fk foreign key (counterparty_id, company_id) references core.counterparties (id, company_id),
  constraint sk_links_target_kind_chk check (
    (kind = 'contractor' or counterparty_id is null) and (kind = 'category' or work_type_id is null) and (kind = 'place' or location_id is null))
);
create unique index sk_links_key_idx on quality.sk_links (company_id, project_id, kind, source_key);
comment on table quality.sk_links is 'P2-0076: соответствие «текст внешнего СК (фирма / категория / место) → запись ядра» на проект; без записи ядра — «Разобрать»';
comment on column quality.sk_links.source_key is 'нормализованный текст (quality.sk_link_key): регистр, ё/е, кавычки, пробелы';
comment on column quality.sk_links.source_text is 'текст как в первой загрузке — подпись в «Разобрать»';
comment on column quality.sk_links.matched_by is 'person — выбрал человек (главнее автоподбора); auto — автоподбор; без записи ядра — «не сопоставлено» («Разобрать»)';
alter table quality.sk_links enable row level security;
revoke all on quality.sk_links from public, anon, authenticated;
grant select on quality.sk_links to authenticated;
create policy sk_links_select on quality.sk_links for select to authenticated
  using (quality.can(company_id, project_id, array['quality.sk.view']));

-- 3. Нормализация текста и автоподбор
create function quality.sk_link_key(p_text text)
returns text language sql immutable set search_path = pg_catalog as $$
  select left(nullif(btrim(regexp_replace(regexp_replace(replace(lower(coalesce(p_text, '')), 'ё', 'е'),
           '["''«»„“”`]', '', 'g'), '\s+', ' ', 'g')), ''), 500)
$$;

-- Текст записи для соответствия вида: фирма — как в файле; категория — кроме «Без категории»; место — путь «Расположение в проекте».
create function quality.sk_rec_text(p_kind text, r quality.sk_records)
returns text language sql stable set search_path = pg_catalog as $$
  select case p_kind
    when 'contractor' then nullif(btrim(coalesce(nullif(btrim(coalesce(r.contractor_raw, '')), ''), r.contractor_name, '')), '')
    when 'category' then case when quality.sk_link_key(r.category) in ('без категории') then null else nullif(btrim(coalesce(r.category, '')), '') end
    when 'place' then nullif(btrim(coalesce(nullif(btrim(coalesce(r.project_raw_path, '')), ''), r.project_loc, '')), '')
  end
$$;

-- Место по дереву проекта (объекта Качества): части «Расположения» — название из файла, блок, этаж; «ЖК / Корпус 2 / Секция 1 / 5»
-- и «Корпус 2, секция 1, этаж 5» — по названию или виду с тем же номером (core.place_num, как загрузка мест P2-0056), сверху вниз
-- до этажа. Часть, не найденная выше корпусов (название ЖК), пропускается; не узнан уровень ниже — остаётся уровень выше
-- (решение владельца). Ничего не узнано — единственный корпус проекта, иначе пусто («Разобрать»).
create function quality.sk_place_of(p_object uuid, p_name text, p_block text, p_floor text)
returns uuid language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  cur uuid; cur_type text; tok text; v_types text[]; v uuid[]; n int; v_roots uuid[];
  toks text[] := '{}';
begin
  if p_object is null then return null; end if;
  select array_agg(id) into v_roots from core.locations where project_id = p_object and parent_id is null and deleted_at is null;
  if v_roots is null then return null; end if;
  if quality.sk_link_key(p_name) is not null then toks := toks || regexp_split_to_array(btrim(p_name), '\s*[,;]\s*'); end if;
  if quality.sk_link_key(p_block) is not null and quality.sk_link_key(p_block) not in ('общее', 'все', 'не указан') then
    toks := toks || regexp_split_to_array(btrim(p_block), '\s*[,;]\s*');
  end if;
  if nullif(btrim(coalesce(p_floor, '')), '') is not null then
    toks := toks || case when p_floor ~ '^\s*-?[0-9]+\s*$' then 'эт. ' || btrim(p_floor) else btrim(p_floor) end;
  end if;
  foreach tok in array toks loop
    tok := btrim(tok);
    continue when tok = '';
    v_types := case when tok ~* '(^|[^а-яё])эт' then array['floor']
                    when tok ~* 'корп|здан|строен|литер' then array['object', 'building']
                    when tok ~* 'секц|подъезд|блок' then array['section']
                    else array['object', 'building', 'section'] end;
    n := core.place_num(tok);
    -- та же часть, что уже узнанный уровень («Корпус 2» и корень «Корпус 2»), — дальше
    continue when cur is not null and cur_type = any(v_types) and exists (select 1 from core.locations l where l.id = cur
      and (l.canonical_key = planfact.canon_name(tok) or (n is not null and core.place_num(l.name) = n)));
    with recursive d as (
      select l.id, l.node_type, l.name, l.canonical_key, 1 lvl from core.locations l
       where l.deleted_at is null and (case when cur is null then l.id = any(v_roots) else l.parent_id = cur end)
      union all
      select l.id, l.node_type, l.name, l.canonical_key, d.lvl + 1 from core.locations l join d on l.parent_id = d.id
       where l.deleted_at is null and d.lvl < 4 and d.node_type <> 'floor')
    select coalesce(
      (select array_agg(id) from d where node_type = any(v_types) and canonical_key = planfact.canon_name(tok) having count(*) = 1),
      (select array_agg(id) from d where node_type = any(v_types) and n is not null and core.place_num(name) = n having count(*) = 1))
      into v;
    if v is null then
      continue when cur is null;   -- выше корпусов: название ЖК и т. п.
      exit;                        -- уровень не узнан — дальше вниз не идём
    end if;
    cur := v[1];
    select node_type into cur_type from core.locations where id = cur;
    exit when cur_type = 'floor';
  end loop;
  return coalesce(cur, case when cardinality(v_roots) = 1 then v_roots[1] end);
end $$;

-- Автоподбор записи ядра для текста вида (без сохранения). p_object — объект записи (quality.record_object).
create function quality.sk_auto_target(p_company uuid, p_kind text, p_object uuid, p_ckey text, p_cname text, p_craw text,
                                       p_category text, p_place text, p_block text, p_floor text)
returns uuid language plpgsql stable security definer set search_path = pg_catalog as $$
declare v uuid[];
begin
  if p_company is null then return null; end if;
  if p_kind = 'contractor' then
    return coalesce(quality.counterparty_of(p_company, p_ckey, p_cname), quality.counterparty_of(p_company, null, p_craw));
  elsif p_kind = 'category' then
    select array_agg(w.id) into v from core.work_types w
     where w.company_id = p_company and w.deleted_at is null
       and (planfact.canon_name(w.name) = planfact.canon_name(p_category) or w.canon_name = planfact.canon_name(p_category));
    return case when cardinality(v) = 1 then v[1] end;
  elsif p_kind = 'place' then
    return quality.sk_place_of(p_object, p_place, p_block, p_floor);
  end if;
  return null;
end $$;

-- Путь места для подписи: «Корпус 2 / Секция 1 / эт. 5».
create function quality.sk_place_path(p_location uuid)
returns text language sql stable security definer set search_path = pg_catalog as $$
  with recursive u as (
    select l.id, l.parent_id, l.name::text nm, 0 lvl from core.locations l where l.id = p_location
    union all
    select l.id, l.parent_id, l.name, u.lvl + 1 from core.locations l join u on l.id = u.parent_id where u.lvl < 8)
  select string_agg(nm, ' / ' order by lvl desc) from u
$$;

create function quality.sk_link_target(l quality.sk_links)
returns uuid language sql immutable set search_path = pg_catalog as $$ select coalesce(l.counterparty_id, l.work_type_id, l.location_id) $$;

-- Соответствие текста: выбор человека → его запись; иначе автоподбор. p_save — завести строку новому тексту / обновить автоподбор.
create function quality.sk_link_resolve(p_company uuid, p_project uuid, p_kind text, p_text text, p_auto uuid, p_save boolean)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare k text := quality.sk_link_key(p_text); l quality.sk_links;
begin
  if k is null or p_company is null or p_project is null then return p_auto; end if;
  select * into l from quality.sk_links where company_id = p_company and project_id = p_project and kind = p_kind and source_key = k;
  if l.id is not null and l.deleted_at is null and l.matched_by = 'person' and quality.sk_link_target(l) is not null then
    return quality.sk_link_target(l);
  end if;
  if p_save then
    if l.id is null then
      insert into quality.sk_links (company_id, project_id, kind, source_key, source_text, counterparty_id, work_type_id, location_id,
                                    matched_by, created_by, updated_by)
      values (p_company, p_project, p_kind, k, left(btrim(p_text), 500),
              case when p_kind = 'contractor' then p_auto end, case when p_kind = 'category' then p_auto end,
              case when p_kind = 'place' then p_auto end, case when p_auto is not null then 'auto' end, auth.uid(), auth.uid())
      on conflict (company_id, project_id, kind, source_key) do nothing;
    elsif l.deleted_at is null and quality.sk_link_target(l) is distinct from p_auto then
      update quality.sk_links set counterparty_id = case when p_kind = 'contractor' then p_auto end,
                                  work_type_id = case when p_kind = 'category' then p_auto end,
                                  location_id = case when p_kind = 'place' then p_auto end,
                                  matched_by = case when p_auto is not null then 'auto' end, updated_at = now()
       where id = l.id;
    end if;
  end if;
  return p_auto;
end $$;

-- 4. Сторож: три id записи — по соответствиям (последним из BEFORE: после привязки компании, объекта и фирмы)
create function quality.sk_stamp_core_ids()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_obj uuid;
  v_save boolean := new.deleted_at is null and not coalesce(new.is_deleted, false);
begin
  if coalesce(current_setting('quality.object_bind', true), '') = '1' then return new; end if;
  v_obj := quality.record_object(new.core_project_id, new.core_object_id);
  new.core_counterparty_id := quality.sk_link_resolve(new.core_company_id, new.core_project_id, 'contractor', quality.sk_rec_text('contractor', new),
    quality.sk_auto_target(new.core_company_id, 'contractor', v_obj, new.contractor_canonical_key, new.contractor_name, new.contractor_raw, null, null, null, null), v_save);
  new.core_work_type_id := quality.sk_link_resolve(new.core_company_id, new.core_project_id, 'category', quality.sk_rec_text('category', new),
    case when quality.sk_rec_text('category', new) is not null
         then quality.sk_auto_target(new.core_company_id, 'category', v_obj, null, null, null, new.category, null, null, null) end, v_save);
  new.core_location_id := case when quality.sk_rec_text('place', new) is null
    then quality.sk_place_of(v_obj, null, null, null)
    else quality.sk_link_resolve(new.core_company_id, new.core_project_id, 'place', quality.sk_rec_text('place', new),
           quality.sk_auto_target(new.core_company_id, 'place', v_obj, null, null, null, null, new.project_raw_name, new.project_block,
                                  new.project_floor), v_save) end;
  return new;
end $$;
create trigger sk_records_zz_core_links before insert or update on quality.sk_records
  for each row execute function quality.sk_stamp_core_ids();

-- 5. Функции экрана
-- Проверка доступа: компания запроса, проект компании, действие Качества.
create function quality.sk_links_guard(p_project uuid, p_action text)
returns uuid language plpgsql stable security definer set search_path = pg_catalog as $$
declare c uuid := quality.request_company();
begin
  if c is null or p_project is null or not exists (select 1 from core.projects where id = p_project and company_id = c) then
    raise exception 'Проект не найден в текущей компании' using errcode = '42501';
  end if;
  if not quality.has_actions(c, p_project, array[p_action]) then
    raise exception '%', case when p_action = 'quality.sk.import' then 'Нет права «Внешний СК: загрузка и правка»'
                              else 'Нет права «Внешний СК: просмотр»' end using errcode = '42501';
  end if;
  return c;
end $$;

-- Объекты проекта: сам проект (если не контейнер) и объекты Качества в нём.
create function quality.sk_project_objects(p_company uuid, p_project uuid)
returns uuid[] language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(array_agg(distinct o), '{}') from (
    select p_project o where not quality.is_container(p_project)
    union all
    select po.core_object_id from quality.project_objects po
     where po.core_company_id = p_company and po.core_project_id = p_project and po.core_object_id is not null and quality.object_alive(po)) s
$$;

-- Выбор человека для текста (и «Отменить» — тот же вызов с прежним значением). Применяется ко всем замечаниям проекта с этим текстом.
create function quality.sk_link_set(p_project uuid, p_kind text, p_text text, p_target uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  c uuid := quality.sk_links_guard(p_project, 'quality.sk.import');
  k text := quality.sk_link_key(p_text);
  l quality.sk_links; o quality.sk_links; n int; v_ok boolean;
begin
  if p_kind not in ('contractor', 'category', 'place') then raise exception 'Неизвестный вид соответствия' using errcode = '22023'; end if;
  if k is null then raise exception 'Пустой текст соответствия' using errcode = '22023'; end if;
  if p_kind = 'contractor' and quality.contractor_only(c, p_project) then
    raise exception 'Сопоставлять фирмы может только инженер компании, не подрядчик' using errcode = '42501';
  end if;
  v_ok := p_target is null or case p_kind
      when 'contractor' then exists (select 1 from core.counterparties where id = p_target and company_id = c and deleted_at is null)
      when 'category' then exists (select 1 from core.work_types where id = p_target and company_id = c and deleted_at is null)
      else exists (select 1 from core.locations where id = p_target and company_id = c and deleted_at is null
                     and project_id = any(quality.sk_project_objects(c, p_project))) end;
  if not v_ok then
    raise exception 'Запись «Компании» не найдена' using errcode = '22023';
  end if;
  select * into o from quality.sk_links where company_id = c and project_id = p_project and kind = p_kind and source_key = k;
  insert into quality.sk_links as x (company_id, project_id, kind, source_key, source_text, counterparty_id, work_type_id, location_id,
                                     matched_by, created_by, updated_by)
  values (c, p_project, p_kind, k, left(btrim(p_text), 500), case when p_kind = 'contractor' then p_target end,
          case when p_kind = 'category' then p_target end, case when p_kind = 'place' then p_target end,
          case when p_target is not null then 'person' end, auth.uid(), auth.uid())
  on conflict (company_id, project_id, kind, source_key) do update
    set counterparty_id = excluded.counterparty_id, work_type_id = excluded.work_type_id, location_id = excluded.location_id,
        matched_by = excluded.matched_by, updated_by = auth.uid(), updated_at = now(), deleted_at = null
  returning * into l;
  perform planfact.log_admin_change(c, p_project, 'quality.sk_links', l.id, case when o.id is null then 'INSERT' else 'UPDATE' end,
    case when o.id is not null then jsonb_build_object('target', quality.sk_link_target(o), 'matched_by', o.matched_by) end,
    jsonb_build_object('kind', l.kind, 'text', l.source_text, 'target', quality.sk_link_target(l), 'matched_by', l.matched_by));
  -- все замечания проекта с этим текстом: сторож пересчитает id; новое время правки — устройства подтянут изменение
  update quality.sk_records r set updated_at = now()
   where r.core_company_id = c and r.core_project_id = p_project and r.deleted_at is null and not coalesce(r.is_deleted, false)
     and quality.sk_link_key(quality.sk_rec_text(p_kind, r)) = k;
  get diagnostics n = row_count;
  select * into l from quality.sk_links where id = l.id;   -- без выбора человека сторож мог дописать автоподбор
  return jsonb_build_object('link_id', l.id, 'kind', l.kind, 'text', l.source_text, 'target', quality.sk_link_target(l),
    'matched_by', l.matched_by, 'previous', case when o.id is not null then quality.sk_link_target(o) end,
    'previous_by', o.matched_by, 'records', n);
end $$;

-- «Разобрать»: тексты проекта без записи ядра (p_all — и сопоставленные) с числом замечаний; права экрана — с сервера.
create function quality.sk_links_list(p_project uuid, p_all boolean default false)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare c uuid := quality.sk_links_guard(p_project, 'quality.sk.view'); v jsonb;
begin
  with r as (
    select k.kind, quality.sk_link_key(quality.sk_rec_text(k.kind, s)) key
      from quality.sk_records s cross join (values ('contractor'), ('category'), ('place')) k(kind)
     where s.core_company_id = c and s.core_project_id = p_project and s.deleted_at is null and not coalesce(s.is_deleted, false)),
  cnt as (select kind, key, count(*) n from r where key is not null group by kind, key)
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'text', l.source_text, 'target', quality.sk_link_target(l),
           'matched_by', l.matched_by, 'records', cnt.n) order by l.kind, cnt.n desc, l.source_text), '[]')
    into v
    from quality.sk_links l join cnt on cnt.kind = l.kind and cnt.key = l.source_key
   where l.company_id = c and l.project_id = p_project and l.deleted_at is null and (p_all or quality.sk_link_target(l) is null);
  return jsonb_build_object('items', v,
    'can_edit', quality.has_actions(c, p_project, array['quality.sk.import']),
    'can_edit_contractor', quality.has_actions(c, p_project, array['quality.sk.import']) and not quality.contractor_only(c, p_project),
    'can_create_counterparty', planfact.has_company_permission(c, 'core.counterparties.manage'));
end $$;

-- Записи ядра для выбора и подписей: контрагенты и виды работ компании, места объектов проекта до этажа (путь — подпись).
create function quality.sk_core_choices(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare c uuid := quality.sk_links_guard(p_project, 'quality.sk.view'); objs uuid[];
begin
  objs := quality.sk_project_objects(c, p_project);
  return jsonb_build_object(
    'counterparties', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]')
                         from core.counterparties where company_id = c and deleted_at is null and archived_at is null),
    'work_types', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]')
                     from core.work_types where company_id = c and deleted_at is null),
    'places', (with recursive t as (
                 select l.id, l.parent_id, l.node_type, l.name::text path, l.name::text root, array[l.sort_order] ord, 1 lvl
                   from core.locations l where l.project_id = any(objs) and l.parent_id is null and l.deleted_at is null
                 union all
                 select l.id, l.parent_id, l.node_type, t.path || ' / ' || l.name, t.root, t.ord || l.sort_order, t.lvl + 1
                   from core.locations l join t on l.parent_id = t.id
                  where l.deleted_at is null and l.node_type in ('building', 'section', 'floor') and t.node_type <> 'floor' and t.lvl < 5)
               select coalesce(jsonb_agg(jsonb_build_object('id', id, 'parent', parent_id, 'type', node_type, 'name', path) order by root, ord), '[]')
                 from t));
end $$;

-- Шаг сопоставления при загрузке Excel: тексты файла → известная запись ядра или «не сопоставлено» (новое заводится в «Разобрать»).
-- p_items — [{kind, text, contractor_canonical_key, contractor_name, project_canonical_key, project_display_name, project_block, project_floor}].
create function quality.sk_links_register(p_project uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  c uuid := quality.sk_links_guard(p_project, 'quality.sk.import');
  v_ctr boolean := not quality.contractor_only(c, p_project);
  it jsonb; v_obj uuid; v uuid[]; v_t uuid; l quality.sk_links; res jsonb := '[]';
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 5000 then
    raise exception 'Список текстов — не более 5000' using errcode = '22023';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    continue when it ->> 'kind' not in ('contractor', 'category', 'place') or quality.sk_link_key(it ->> 'text') is null;
    continue when it ->> 'kind' = 'category' and quality.sk_link_key(it ->> 'text') = 'без категории';
    v_obj := null;
    if it ->> 'kind' = 'place' then
      v := quality.object_candidates(c, null, it ->> 'project_canonical_key', it ->> 'project_display_name');
      v_obj := quality.record_object(p_project, case when cardinality(v) = 1 then v[1] end);
    end if;
    v_t := quality.sk_link_resolve(c, p_project, it ->> 'kind', it ->> 'text',
      quality.sk_auto_target(c, it ->> 'kind', v_obj, it ->> 'contractor_canonical_key', it ->> 'contractor_name', it ->> 'text',
                             it ->> 'text', it ->> 'project_raw_name', it ->> 'project_block', it ->> 'project_floor'),
      it ->> 'kind' <> 'contractor' or v_ctr);
    select * into l from quality.sk_links
     where company_id = c and project_id = p_project and kind = it ->> 'kind' and source_key = quality.sk_link_key(it ->> 'text');
    res := res || jsonb_build_object('kind', it ->> 'kind', 'text', it ->> 'text', 'target', v_t,
                                     'matched_by', case when v_t is null then null else coalesce(l.matched_by, 'auto') end, 'link_id', l.id);
  end loop;
  return res;
end $$;

-- 6. Разовая привязка старых записей (только postgres: SQL Editor). p_apply = false — сухой прогон: отчёт, ничего не меняется;
--    true — завести соответствия всем текстам и проставить id записям, где они отличаются; повтор — 0 изменений.
create function quality.sk_links_backfill(p_apply boolean)
returns table (company text, kind text, source_text text, target text, records bigint, status text)
language plpgsql security definer set search_path = pg_catalog as $$
begin
  create temp table if not exists sk_bf (company_id uuid, project_id uuid, kind text, src text, target uuid, n bigint) on commit drop;
  truncate sk_bf;
  insert into sk_bf
  select s.core_company_id, s.core_project_id, k.kind, min(quality.sk_rec_text(k.kind, s)),
         quality.sk_link_resolve(s.core_company_id, s.core_project_id, k.kind, min(quality.sk_rec_text(k.kind, s)),
           quality.sk_auto_target(s.core_company_id, k.kind, min(quality.record_object(s.core_project_id, s.core_object_id)::text)::uuid,
             min(s.contractor_canonical_key), min(s.contractor_name), min(s.contractor_raw), min(s.category), min(s.project_raw_name),
             min(s.project_block), min(s.project_floor)),
           p_apply),
         count(*)
    from quality.sk_records s cross join (values ('contractor'), ('category'), ('place')) k(kind)
   where s.deleted_at is null and not coalesce(s.is_deleted, false) and quality.sk_rec_text(k.kind, s) is not null
   group by s.core_company_id, s.core_project_id, k.kind, quality.sk_link_key(quality.sk_rec_text(k.kind, s)),
            case when k.kind = 'place' then quality.record_object(s.core_project_id, s.core_object_id) end;
  if p_apply then
    update quality.sk_records s set updated_at = now()
     where s.deleted_at is null and not coalesce(s.is_deleted, false)
       and (s.core_counterparty_id, s.core_work_type_id, s.core_location_id) is distinct from (
         quality.sk_link_resolve(s.core_company_id, s.core_project_id, 'contractor', quality.sk_rec_text('contractor', s),
           quality.sk_auto_target(s.core_company_id, 'contractor', null, s.contractor_canonical_key, s.contractor_name, s.contractor_raw, null, null, null, null), false),
         quality.sk_link_resolve(s.core_company_id, s.core_project_id, 'category', quality.sk_rec_text('category', s),
           case when quality.sk_rec_text('category', s) is not null
                then quality.sk_auto_target(s.core_company_id, 'category', null, null, null, null, s.category, null, null, null) end, false),
         case when quality.sk_rec_text('place', s) is null
              then quality.sk_place_of(quality.record_object(s.core_project_id, s.core_object_id), null, null, null)
              else quality.sk_link_resolve(s.core_company_id, s.core_project_id, 'place', quality.sk_rec_text('place', s),
                     quality.sk_auto_target(s.core_company_id, 'place', quality.record_object(s.core_project_id, s.core_object_id), null, null, null,
                                            null, s.project_raw_name, s.project_block, s.project_floor), false) end);
  end if;
  return query
    select cm.name, b.kind, b.src,
           case b.kind when 'contractor' then (select cp.name from core.counterparties cp where cp.id = b.target and cp.company_id = b.company_id)
                       when 'category' then (select w.name from core.work_types w where w.id = b.target and w.company_id = b.company_id)
                       else (select quality.sk_place_path(l.id) from core.locations l where l.id = b.target and l.company_id = b.company_id) end,
           sum(b.n)::bigint,
           case when b.target is null then 'не сопоставлено — в «Разобрать»'
                when exists (select 1 from quality.sk_links x where x.company_id = b.company_id and x.project_id = b.project_id and x.kind = b.kind
                               and x.source_key = quality.sk_link_key(b.src) and x.matched_by = 'person') then 'выбор человека'
                else 'автоподбор' end
      from sk_bf b join core.companies cm on cm.id = b.company_id
     group by cm.name, b.company_id, b.project_id, b.kind, b.src, b.target
     order by cm.name, b.kind, sum(b.n) desc;
end $$;

-- 7. Права на функции: экранные — учёткам (проверки внутри), служебные — никому, привязка старого — только postgres.
revoke all on function quality.sk_link_key(text), quality.sk_rec_text(text, quality.sk_records), quality.sk_place_of(uuid, text, text, text),
  quality.sk_auto_target(uuid, text, uuid, text, text, text, text, text, text, text), quality.sk_link_target(quality.sk_links),
  quality.sk_place_path(uuid), quality.sk_link_resolve(uuid, uuid, text, text, uuid, boolean), quality.sk_stamp_core_ids(), quality.sk_links_guard(uuid, text),
  quality.sk_project_objects(uuid, uuid), quality.sk_link_set(uuid, text, text, uuid), quality.sk_links_list(uuid, boolean),
  quality.sk_core_choices(uuid), quality.sk_links_register(uuid, jsonb), quality.sk_links_backfill(boolean) from public, anon, authenticated;
grant execute on function quality.sk_link_set(uuid, text, text, uuid), quality.sk_links_list(uuid, boolean),
  quality.sk_core_choices(uuid), quality.sk_links_register(uuid, jsonb) to authenticated;
