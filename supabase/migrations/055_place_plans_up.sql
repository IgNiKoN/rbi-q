-- P2-0057 (CRITICAL — Storage; решения владельца 28.10.2026, MODULES 7.8 «б»): PDF-план этажа и квартиры — документ ядра
-- «документ места» с версиями; Качество и Стройконтроль 2.0 получают план копией ссылки (зеркало, как места в 048).
--   1) core.place_documents — документ места (вид 'plan'): версии 1, 2, …, одна текущая на место; ничего не стирается;
--   2) закрытый бакет core-place-plans: путь <компания>/<проект>/<место>/<id документа>.pdf; читать — участник проекта или
--      управляющий проектами компании, класть — кто ведёт места проекта (core.require_places_manage); перезаписать и удалить
--      файл — никто; аноним — ничего; только PDF до 50 МБ (бакет и RPC);
--   3) RPC: pf_place_plans (планы проекта — все версии), pf_add_place_plan (новая версия после загрузки файла — текущая),
--      pf_set_place_plan (сделать текущей прежнюю), pf_remove_place_plan (снять: текущей нет, версии остаются),
--      pf_place_pins (сколько точек замечаний на плане места — подсказка при замене); журнал — planfact.log_admin_change;
--   4) копия в модули: текущая версия → quality.construction_floors_v2 (этаж; Качество или СК включены) и
--      quality.construction_units_v2 (квартира; СК включён; помещение заводится, если его нет) — ссылка того же вида, что у
--      файлов Качества (…/storage/v1/object/public/<бакет>/…); снята — поля плана пусты; проект 'quality' — копии нет;
--   5) защита: в проекте ядра план в модулях не меняют (вставка с планом, другая ссылка, пометка удаления, перенос) — отказ
--      42501; пустая или прежняя ссылка ядра от устройства со старой копией — сервер оставляет текущую (запись проходит).
-- Применять после 054, одним запросом. Откат — 055_place_plans_down.sql (бакет и файлы остаются, доступ к ним закрывается).
begin;

do $$
begin
  if to_regprocedure('quality.core_ids_stamp()') is null then
    raise exception '055: сначала 054_quality_ids_up.sql' using errcode = 'P0001';
  end if;
  if to_regclass('core.place_documents') is not null then
    raise exception '055 уже применена (повтор — только после 055_place_plans_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Документ места.
create table core.place_documents (
  id uuid primary key,
  company_id uuid not null references core.companies (id),
  project_id uuid not null references core.projects (id),
  location_id uuid not null references core.locations (id),
  kind text not null default 'plan' constraint place_documents_kind_chk check (kind in ('plan')),
  version_no int not null constraint place_documents_version_chk check (version_no > 0),
  is_current boolean not null default false,
  file_bucket text not null,
  file_path text not null,
  file_url text not null,
  file_name text not null,
  file_size bigint not null constraint place_documents_size_chk check (file_size > 0),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id),
  constraint place_documents_version_uq unique (location_id, kind, version_no)
);
create unique index place_documents_current_uq on core.place_documents (location_id, kind) where is_current and deleted_at is null;
create index place_documents_company_project_idx on core.place_documents (company_id, project_id);
comment on table core.place_documents is
  'place_documents: документ места (P2-0057) — PDF-план этажа или квартиры с версиями; текущая — одна на место; копия — в Качество и СК';
comment on column core.place_documents.file_url is
  'ссылка вида …/storage/v1/object/public/<бакет>/<путь> — та же форма, что у файлов Качества (закрытый файл берёт кэш приложения со входом)';

alter table core.place_documents enable row level security;
revoke all on core.place_documents from public, anon;
grant select on core.place_documents to authenticated;
create policy place_documents_select on core.place_documents for select to authenticated
  using (core.can_manage_projects(company_id) or core.is_project_participant(project_id));

-- 2. Закрытый бакет и доступ к файлу.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('core-place-plans', 'core-place-plans', false, 52428800, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Ведёт ли человек места проекта: то же правило, что core.require_places_manage (один источник), ответом да / нет.
create function core.can_manage_places(p_project uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  perform core.require_places_manage(p_project);
  return true;
exception when others then
  return false;
end $$;

-- Файл плана: <компания>/<проект>/<место этажа или квартиры>/<uuid>.pdf; место — в этом проекте, проект — этой компании.
create function core.place_file_can(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_parts text[] := string_to_array(coalesce(p_name, ''), '/');
  v_project uuid; v_company uuid;
begin
  if auth.uid() is null or array_length(v_parts, 1) <> 4 or v_parts[1] !~ v_re or v_parts[2] !~ v_re or v_parts[3] !~ v_re
     or v_parts[4] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$' then
    return false;
  end if;
  select l.project_id, l.company_id into v_project, v_company
    from core.locations l join core.projects pr on pr.id = l.project_id and pr.company_id = l.company_id
   where l.id = v_parts[3]::uuid and l.project_id = v_parts[2]::uuid and l.company_id = v_parts[1]::uuid
     and l.node_type in ('floor', 'apartment') and pr.deleted_at is null;
  if v_project is null then return false; end if;
  if p_write then return core.can_manage_places(v_project); end if;
  return core.can_manage_projects(v_company) or core.is_project_participant(v_project);
end $$;

create policy core_place_plans_select on storage.objects for select to authenticated
  using (bucket_id = 'core-place-plans' and core.place_file_can(name, false));
create policy core_place_plans_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'core-place-plans' and core.place_file_can(name, true));
-- Ограничивающие: любая другая разрешающая политика (как прежняя «админ РБИ ко всем бакетам») не откроет бакет; файл не
-- перезаписывают и не удаляют (версии хранятся все).
create policy core_place_plans_guard_select on storage.objects as restrictive for select to authenticated
  using (case when bucket_id = 'core-place-plans' then core.place_file_can(name, false) else true end);
create policy core_place_plans_guard_insert on storage.objects as restrictive for insert to authenticated
  with check (case when bucket_id = 'core-place-plans' then core.place_file_can(name, true) else true end);
create policy core_place_plans_guard_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'core-place-plans') with check (bucket_id <> 'core-place-plans');
create policy core_place_plans_guard_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'core-place-plans');

-- 3. Копия в модули.
create function quality.mirror_place_plan(p_location uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare
  l core.locations; v_node text; d core.place_documents; v_url text; v_name text; v_size text; v_n int;
begin
  select * into l from core.locations where id = p_location;
  if l.id is null or l.node_type not in ('floor', 'apartment')
     or not exists (select 1 from core.projects pr where pr.id = l.project_id and pr.places_master = 'core') then
    return;
  end if;
  select n.id into v_node from quality.location_nodes n
   where n.core_company_id = l.company_id and n.core_location_id = l.id and not n.is_deleted
   order by n.created_at, n.id limit 1;
  if v_node is null then return; end if;   -- у компании нет Качества / СК (нет узла-проекта) — копии нет
  select * into d from core.place_documents where location_id = l.id and kind = 'plan' and is_current and deleted_at is null;
  v_url := d.file_url; v_name := d.file_name; v_size := d.file_size::text;
  if l.node_type = 'floor' then
    if not exists (select 1 from core.company_modules cm where cm.company_id = l.company_id
                    and cm.module in ('quality', 'construction') and cm.enabled) then
      return;
    end if;
    update quality.construction_floors_v2
       set pdf_url = v_url, pdf_name = v_name, pdf_size = v_size, is_active = true, updated_at = now(), version = version + 1
     where core_company_id = l.company_id and "locationId" = v_node and not is_deleted
       and (pdf_url, pdf_name, pdf_size, is_active) is distinct from (v_url, v_name, v_size, true);
    if v_url is not null and not exists (select 1 from quality.construction_floors_v2 where core_company_id = l.company_id
                                          and "locationId" = v_node and not is_deleted) then
      insert into quality.construction_floors_v2 (id, "locationId", name, sort_order, pdf_url, pdf_name, pdf_size, is_active,
                                                  created_by, core_company_id)
      values (gen_random_uuid()::text, v_node, l.name, 1, v_url, v_name, v_size, true, 'Компания → Объекты и места', l.company_id);
    end if;
  else
    if not exists (select 1 from core.company_modules cm where cm.company_id = l.company_id and cm.module = 'construction' and cm.enabled) then
      return;
    end if;
    update quality.construction_units_v2
       set pdf_url = v_url, pdf_name = v_name, pdf_size = v_size, updated_at = now(), version = version + 1
     where core_company_id = l.company_id and "locationId" = v_node and not is_deleted
       and (pdf_url, pdf_name, pdf_size) is distinct from (v_url, v_name, v_size);
    get diagnostics v_n = row_count;
    if v_url is not null and not exists (select 1 from quality.construction_units_v2 where core_company_id = l.company_id
                                          and "locationId" = v_node and not is_deleted) then
      -- помещение СК для квартиры заводится здесь (раньше — при первом открытии карточки, ТД 288)
      insert into quality.construction_units_v2 (id, "locationId", name, type, sort_order, status, pdf_url, pdf_name, pdf_size,
                                                 created_by, core_company_id)
      values (gen_random_uuid()::text, v_node, l.name, 'КВ', l.sort_order, 'not_inspected', v_url, v_name, v_size,
              'Компания → Объекты и места', l.company_id);
    end if;
  end if;
end $$;

-- 4. Защита плана в модулях для мест ядра. Сторож — с правами вызывающего (как quality.quality_rights_guard 053): запись
--    роли приложения проверяется, запись зеркала (security definer) — нет. Место ядра и ссылки ядра — функции ниже.
create function quality.plan_core_place(p_company uuid, p_node text)
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select l.id from quality.location_nodes n
    join core.locations l on l.id = n.core_location_id
    join core.projects pr on pr.id = l.project_id and pr.places_master = 'core'
   where n.core_company_id = p_company and n.id = p_node
$$;
create function quality.plan_core_url(p_location uuid, p_url text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (select 1 from core.place_documents d where d.location_id = p_location and d.file_url = p_url)
$$;
create function quality.plan_row_exists(p_table text, p_company uuid, p_id text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $$
declare v boolean;
begin
  if p_table not in ('construction_floors_v2', 'construction_units_v2') then return false; end if;
  execute format('select exists (select 1 from quality.%I where core_company_id = $1 and id = $2)', p_table) into v using p_company, p_id;
  return v;
end $$;

create function quality.plan_core_guard()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
declare v_loc uuid;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    -- повтор записи с устройства (upsert) — проверит правка
    if quality.plan_row_exists(tg_table_name, new.core_company_id, new.id) then return new; end if;
    if coalesce(new.pdf_url, '') <> '' and quality.plan_core_place(new.core_company_id, new."locationId") is not null then
      raise exception 'Планы этого объекта ведутся в «Компания → Объекты и места»' using errcode = '42501';
    end if;
    return new;
  end if;
  v_loc := coalesce(quality.plan_core_place(old.core_company_id, old."locationId"),
                    quality.plan_core_place(new.core_company_id, new."locationId"));
  if v_loc is null then return new; end if;
  if new."locationId" is distinct from old."locationId" or (new.is_deleted and not old.is_deleted and coalesce(old.pdf_url, '') <> '') then
    raise exception 'Планы этого объекта ведутся в «Компания → Объекты и места»' using errcode = '42501';
  end if;
  if (new.pdf_url, new.pdf_name, new.pdf_size) is distinct from (old.pdf_url, old.pdf_name, old.pdf_size) then
    if coalesce(new.pdf_url, '') = '' or quality.plan_core_url(v_loc, new.pdf_url) then
      -- устройство со старой копией: план остаётся текущим (его задаёт ядро)
      new.pdf_url := old.pdf_url; new.pdf_name := old.pdf_name; new.pdf_size := old.pdf_size;
    else
      raise exception 'Планы этого объекта ведутся в «Компания → Объекты и места»' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger construction_floors_v2_plan_guard before insert or update on quality.construction_floors_v2
  for each row execute function quality.plan_core_guard();
create trigger construction_units_v2_plan_guard before insert or update on quality.construction_units_v2
  for each row execute function quality.plan_core_guard();

-- 5. RPC экрана «Компания → Объекты и места».
-- Планы проекта: все версии (не помеченные удалёнными), новые сверху; видят участники проекта и управляющие проектами.
create function public.pf_place_plans(p_project uuid)
returns table(id uuid, location_id uuid, version_no int, is_current boolean, file_name text, file_size bigint, file_url text,
              created_by uuid, author text, created_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog as $$
#variable_conflict use_column
declare v_company uuid;
begin
  select company_id into v_company from core.projects where id = p_project and deleted_at is null and not quality_container;
  if v_company is null or auth.uid() is null or not (core.can_manage_projects(v_company) or core.is_project_participant(p_project)) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  return query
  select d.id, d.location_id, d.version_no, d.is_current, d.file_name, d.file_size, d.file_url, d.created_by,
         coalesce(nullif(btrim(up.full_name), ''), u.email::text, ''), d.created_at
    from core.place_documents d
    left join core.user_profiles up on up.user_id = d.created_by
    left join auth.users u on u.id = d.created_by
   where d.project_id = p_project and d.kind = 'plan' and d.deleted_at is null
   order by d.location_id, d.version_no desc;
end $$;

-- Место плана: этаж или квартира проекта ядра, человек ведёт места; возвращает место (проверки — по месту).
create function core.plan_place(p_location uuid)
returns core.locations language plpgsql stable security definer set search_path = pg_catalog as $$
declare l core.locations;
begin
  select * into l from core.locations where id = p_location and deleted_at is null;
  if l.id is null then raise exception 'Место не найдено' using errcode = '22023'; end if;
  perform core.require_places_manage(l.project_id);
  if exists (select 1 from core.projects pr where pr.id = l.project_id and pr.places_master = 'quality') then
    raise exception 'Места этого проекта ведутся в Качестве' using errcode = '42501';
  end if;
  if l.node_type not in ('floor', 'apartment') then
    raise exception 'План загружается на этаж или квартиру' using errcode = '22023';
  end if;
  return l;
end $$;

-- Новая версия плана (файл уже загружен в core-place-plans/<компания>/<проект>/<место>/<p_id>.pdf) — становится текущей.
-- Повтор с тем же p_id — прежний ответ.
create function public.pf_add_place_plan(p_location uuid, p_id uuid, p_url text, p_name text, p_size bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  l core.locations; d core.place_documents; v_prev core.place_documents; v_path text; v_no int;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if p_id is null then raise exception 'Нет идентификатора записи' using errcode = '22023'; end if;
  l := core.plan_place(p_location);
  select * into d from core.place_documents where id = p_id;
  if d.id is not null then
    if d.location_id <> l.id then raise exception 'Идентификатор занят другой записью' using errcode = '22023'; end if;
    return jsonb_build_object('id', d.id, 'version_no', d.version_no, 'repeat', true);
  end if;
  v_path := l.company_id || '/' || l.project_id || '/' || l.id || '/' || p_id || '.pdf';
  if v_name = '' or v_name !~* '\.pdf$' then raise exception 'Нужен файл PDF' using errcode = '22023'; end if;
  if coalesce(p_size, 0) <= 0 or p_size > 52428800 then
    raise exception 'Файл больше 50 МБ — уменьшите PDF' using errcode = '22023';
  end if;
  if coalesce(p_url, '') !~ '^https?://' or right(p_url, length('/storage/v1/object/public/core-place-plans/' || v_path))
       <> '/storage/v1/object/public/core-place-plans/' || v_path then
    raise exception 'Ссылка не на файл плана этого места' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'core-place-plans' and o.name = v_path) then
    raise exception 'Файл плана не загружен' using errcode = '22023';
  end if;
  perform 1 from core.locations where id = l.id for update;   -- номера версий одного места — по очереди
  select coalesce(max(version_no), 0) + 1 into v_no from core.place_documents where location_id = l.id and kind = 'plan';
  select * into v_prev from core.place_documents where location_id = l.id and kind = 'plan' and is_current and deleted_at is null;
  update core.place_documents set is_current = false, updated_at = now() where id = v_prev.id;
  insert into core.place_documents (id, company_id, project_id, location_id, kind, version_no, is_current, file_bucket, file_path,
                                    file_url, file_name, file_size)
  values (p_id, l.company_id, l.project_id, l.id, 'plan', v_no, true, 'core-place-plans', v_path, p_url, left(v_name, 255), p_size)
  returning * into d;
  perform planfact.log_admin_change(l.company_id, l.project_id, 'place_documents', d.id, 'INSERT',
    case when v_prev.id is not null then jsonb_build_object('current', v_prev.id, 'version_no', v_prev.version_no) end,
    jsonb_build_object('location_id', l.id, 'version_no', v_no, 'file_name', d.file_name, 'file_size', d.file_size));
  perform quality.mirror_place_plan(l.id);
  return jsonb_build_object('id', d.id, 'version_no', v_no, 'previous', v_prev.id, 'repeat', false);
end $$;

-- Сделать текущей прежнюю версию.
create function public.pf_set_place_plan(p_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare l core.locations; d core.place_documents; v_prev core.place_documents;
begin
  select * into d from core.place_documents where id = p_id and deleted_at is null;
  if d.id is null then raise exception 'Версия плана не найдена' using errcode = '22023'; end if;
  l := core.plan_place(d.location_id);
  perform 1 from core.locations where id = l.id for update;
  select * into v_prev from core.place_documents where location_id = l.id and kind = d.kind and is_current and deleted_at is null;
  if v_prev.id = d.id then return jsonb_build_object('id', d.id, 'version_no', d.version_no, 'previous', d.id); end if;
  update core.place_documents set is_current = false, updated_at = now() where id = v_prev.id;
  update core.place_documents set is_current = true, updated_at = now() where id = d.id;
  perform planfact.log_admin_change(l.company_id, l.project_id, 'place_documents', d.id, 'SET_CURRENT',
    jsonb_build_object('current', v_prev.id, 'version_no', v_prev.version_no), jsonb_build_object('current', d.id, 'version_no', d.version_no));
  perform quality.mirror_place_plan(l.id);
  return jsonb_build_object('id', d.id, 'version_no', d.version_no, 'previous', v_prev.id);
end $$;

-- Снять план места: текущей версии нет, версии остаются (их можно сделать текущими).
create function public.pf_remove_place_plan(p_location uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare l core.locations; v_prev core.place_documents;
begin
  l := core.plan_place(p_location);
  perform 1 from core.locations where id = l.id for update;
  select * into v_prev from core.place_documents where location_id = l.id and kind = 'plan' and is_current and deleted_at is null;
  if v_prev.id is null then return jsonb_build_object('previous', null); end if;
  update core.place_documents set is_current = false, updated_at = now() where id = v_prev.id;
  perform planfact.log_admin_change(l.company_id, l.project_id, 'place_documents', v_prev.id, 'REMOVE_CURRENT',
    jsonb_build_object('current', v_prev.id, 'version_no', v_prev.version_no), null);
  perform quality.mirror_place_plan(l.id);
  return jsonb_build_object('previous', v_prev.id);
end $$;

-- Точки замечаний на плане места (Стройконтроль 2.0 — замечания с координатами, Качество — проверки с точкой на плане).
create function public.pf_place_pins(p_location uuid)
returns int language plpgsql stable security definer set search_path = pg_catalog as $$
declare l core.locations; v_nodes text[]; v int := 0; v2 int := 0;
begin
  select * into l from core.locations where id = p_location and deleted_at is null;
  if l.id is null or auth.uid() is null or not (core.can_manage_projects(l.company_id) or core.is_project_participant(l.project_id)) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  select coalesce(array_agg(n.id), '{}') into v_nodes from quality.location_nodes n
   where n.core_company_id = l.company_id and n.core_location_id = l.id;
  if cardinality(v_nodes) = 0 then return 0; end if;
  select count(*)::int into v from quality.construction_defects_v2 x
   where x.core_company_id = l.company_id and x."locationId" = any (v_nodes) and not coalesce(x.is_deleted, false) and x.x is not null and x.y is not null;
  select count(*)::int into v2 from quality.rbi_inspections x
   where x.core_company_id = l.company_id and not coalesce(x.is_deleted, false) and x.metrics -> 'planPin' ->> 'locationId' = any (v_nodes)
     and x.metrics -> 'planPin' ->> 'x' is not null;
  return v + v2;
end $$;

revoke all on function core.can_manage_places(uuid), core.place_file_can(text, boolean), core.plan_place(uuid),
  quality.mirror_place_plan(uuid), quality.plan_core_place(uuid, text), quality.plan_core_url(uuid, text),
  quality.plan_row_exists(text, uuid, text), quality.plan_core_guard() from public, anon, authenticated;
grant execute on function core.place_file_can(text, boolean), quality.plan_core_place(uuid, text), quality.plan_core_url(uuid, text),
  quality.plan_row_exists(text, uuid, text) to authenticated;
revoke all on function public.pf_place_plans(uuid), public.pf_add_place_plan(uuid, uuid, text, text, bigint),
  public.pf_set_place_plan(uuid), public.pf_remove_place_plan(uuid), public.pf_place_pins(uuid) from public, anon;
grant execute on function public.pf_place_plans(uuid), public.pf_add_place_plan(uuid, uuid, text, text, bigint),
  public.pf_set_place_plan(uuid), public.pf_remove_place_plan(uuid), public.pf_place_pins(uuid) to authenticated;

commit;
