-- P2-0047 (ядро: Подразделение → Проект → Объекты → места; решения владельца 27.10.2026).
--   1) справочники платформы: стадии проекта, виды объектов, роль компании в проекте (правило 9 «типы — данные»);
--   2) core.divisions — подразделения компании (необязательно);
--   3) карточка проекта: подразделение, адрес, руководитель, стадия, наша роль, часовой пояс, страна (правила 6, 7; MODULES 1б);
--   4) места: тип «объект» — только верхний уровень дерева, у объекта вид; у помещения строительный номер и номер БТИ;
--      корни нынешних деревьев становятся объектами (корпус → «корпус», прочее → «прочее»), места Качества — тоже
--      (синхронизация P2-0045 пишет корпус — триггер делает из него объект);
--   5) функции «Компании» — права на уровне ядра, без включённых модулей (MODULES 1а); id записи приходит с устройства,
--      повтор с тем же id не создаёт дубль (правило 1); удаление — пометкой, всё — в журнал (правило 2);
--   6) удобный ввод структуры: заполнить объект (секции × этажи × квартиры, нумерация, подвал/кровля), добавить этажи
--      в несколько секций, копировать секцию.
-- Применять после 044, одним запросом. Откат — 045_projects_objects_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.place_sync(uuid,text,boolean,integer)') is null then
    raise exception '045: сначала 044_one_places_tree_up.sql' using errcode = 'P0001';
  end if;
  if to_regclass('core.divisions') is not null then
    raise exception '045 уже применена (повтор — только после 045_projects_objects_down.sql)' using errcode = 'P0001';
  end if;
  -- корень дерева сейчас бывает только корпусом или «прочим»: обратный перевод однозначен
  if exists (select 1 from core.locations where parent_id is null and node_type not in ('building', 'other')) then
    raise exception '045: есть места верхнего уровня с типом секция/этаж/квартира — сначала разобрать (проба scripts/p2-0047/01_probe.sql)'
      using errcode = 'P0001';
  end if;
end $$;

-- 1. Справочники платформы (код — в данных, подпись — для экрана; компания их пока не правит).
create table core.project_stages (code text primary key, name text not null, sort_order int not null, updated_at timestamptz not null default now());
create table core.object_kinds (code text primary key, name text not null, sort_order int not null, updated_at timestamptz not null default now());
create table core.project_roles (code text primary key, name text not null, sort_order int not null, updated_at timestamptz not null default now());
insert into core.project_stages(code, name, sort_order) values ('design', 'Проектирование', 1), ('tender', 'Тендер', 2), ('construction', 'Строительство', 3),
  ('commissioning', 'Ввод', 4), ('warranty', 'Гарантия', 5), ('operation', 'Эксплуатация', 6);
insert into core.object_kinds(code, name, sort_order) values ('building', 'Корпус', 1), ('parking', 'Паркинг', 2), ('networks', 'Сети', 3),
  ('landscaping', 'Благоустройство', 4), ('other', 'Прочее', 5);
insert into core.project_roles(code, name, sort_order) values ('customer', 'Заказчик', 1), ('general_contractor', 'Генподрядчик', 2), ('contractor', 'Подрядчик', 3),
  ('supervision', 'Технадзор', 4), ('designer', 'Проектировщик', 5);
comment on table core.project_stages is 'P2-0047: стадии жизненного цикла проекта (правило 9 — типы как данные)';
comment on table core.object_kinds is 'P2-0047: виды объектов (здание/сооружение верхнего уровня дерева мест)';
comment on table core.project_roles is 'P2-0047: роль компании в проекте (MODULES 1б) — определяет сторону модулей';
alter table core.project_stages enable row level security;
alter table core.object_kinds enable row level security;
alter table core.project_roles enable row level security;
create policy project_stages_select on core.project_stages for select to authenticated using (true);
create policy object_kinds_select on core.object_kinds for select to authenticated using (true);
create policy project_roles_select on core.project_roles for select to authenticated using (true);
revoke all on core.project_stages, core.object_kinds, core.project_roles from public, anon, authenticated;
grant select on core.project_stages, core.object_kinds, core.project_roles to authenticated;

-- 2. Подразделения.
create table core.divisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  head_user_id uuid,
  archived_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (company_id, head_user_id) references core.company_members(company_id, user_id)
);
create unique index divisions_name_uq on core.divisions (company_id, planfact.canon_name(name)) where archived_at is null;
comment on table core.divisions is 'P2-0047: подразделение (дирекция, филиал) — необязательная группа проектов компании';
create trigger divisions_touch before update on core.divisions for each row execute function core.touch_updated_at();
alter table core.divisions enable row level security;
create policy divisions_select on core.divisions for select to authenticated using (planfact.is_company_member(company_id));
revoke all on core.divisions from public, anon, authenticated;
grant select on core.divisions to authenticated;

-- 3. Карточка проекта.
alter table core.projects
  add column division_id uuid,
  add column address text,
  add column manager_user_id uuid,
  add column stage text not null default 'construction' references core.project_stages(code),
  add column our_role text references core.project_roles(code),
  add column timezone text not null default 'Europe/Moscow',
  add column country text not null default 'RU',
  add constraint projects_division_fk foreign key (division_id, company_id) references core.divisions(id, company_id),
  add constraint projects_manager_fk foreign key (company_id, manager_user_id) references core.company_members(company_id, user_id),
  add constraint projects_country_chk check (country ~ '^[A-Z]{2}$'),
  add constraint projects_address_chk check (address is null or length(address) <= 500);
create index projects_division_idx on core.projects (division_id) where division_id is not null;
comment on column core.projects.timezone is 'P2-0047: часовой пояс стройки (IANA) — «день факта» считается по нему (правило 6)';
comment on column core.projects.country is 'P2-0047: страна проекта (ISO 3166-1) — нормативы, формы, язык, валюта (правило 7)';
comment on column core.projects.our_role is 'P2-0047: наша роль в проекте (MODULES 1б); null — не указана';

-- 4. Места: объект — верхний уровень; номера помещения.
alter table core.locations
  add column object_kind text references core.object_kinds(code),
  add column build_no text check (build_no is null or length(btrim(build_no)) between 1 and 40),
  add column bti_no text check (bti_no is null or length(btrim(bti_no)) between 1 and 40);
comment on column core.locations.object_kind is 'P2-0047: вид объекта (только у node_type = object)';
comment on column core.locations.build_no is 'P2-0047: строительный номер помещения';
comment on column core.locations.bti_no is 'P2-0047: номер помещения по БТИ';
alter table core.locations drop constraint locations_node_type_check;
alter table core.locations add constraint locations_node_type_check
  check (node_type = any (array['object', 'building', 'section', 'floor', 'apartment', 'other']));

-- перевод корней в объекты: без пометки «изменено» и без сторожа Качества (данные те же, меняется только тип)
alter table core.locations disable trigger user;
update core.locations set object_kind = case when node_type = 'building' then 'building' else 'other' end, node_type = 'object'
 where parent_id is null;
alter table core.locations enable trigger user;

alter table core.locations
  add constraint locations_object_root_chk check ((node_type = 'object') = (parent_id is null)),
  add constraint locations_object_kind_chk check ((node_type = 'object') = (object_kind is not null));

-- Верх дерева — только объект: старые клиенты и синхронизация Качества пишут корпус/прочее — превращаем в объект.
create function core.locations_root_object()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.parent_id is null then
    if new.node_type is distinct from 'object' then
      -- перенос из Качества (P2-0045) может поставить наверх секцию или этаж, лежащие прямо под объектом Качества, —
      -- не теряем такое место: оно становится объектом «прочее»; остальным писателям — отказ
      if new.node_type not in ('building', 'other') and coalesce(current_setting('quality.place_sync', true), '') <> '1' then
        raise exception 'Верхний уровень — только объект (корпус, паркинг, сети, благоустройство, прочее)' using errcode = '22023';
      end if;
      new.object_kind := case when new.node_type = 'building' then 'building' else coalesce(new.object_kind, 'other') end;
      new.node_type := 'object';
    end if;
    new.object_kind := coalesce(new.object_kind, 'other');
  else
    if new.node_type = 'object' then
      raise exception 'Объект можно создать только на верхнем уровне' using errcode = '22023';
    end if;
    new.object_kind := null;
  end if;
  return new;
end $$;
create trigger a_locations_root_object before insert or update on core.locations for each row execute function core.locations_root_object();

-- 5. Права на уровне ядра (без модулей). Участник проекта — назначение на компанию целиком или на проект.
create function core.is_project_participant(p_project uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from core.projects pr
    where pr.id = p_project
      and (planfact.is_platform_admin() or exists (
        select 1 from core.role_assignments a
        where a.company_id = pr.company_id and a.user_id = auth.uid()
          and (a.project_id = pr.id or a.project_id is null)
          and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))))
$$;
-- Управлять проектами компании: право planfact.projects.manage назначено на всю компанию (модуль не нужен).
create function core.can_manage_projects(p_company uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select p_company is not null and auth.uid() is not null and (planfact.is_platform_admin() or exists (
    select 1 from core.role_assignments a
    join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = 'planfact.projects.manage'
    where a.company_id = p_company and a.user_id = auth.uid() and a.project_id is null
      and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())))
$$;
-- Управлять местами проекта: право на всю компанию или на этот проект; проект не в архиве.
create function core.require_places_manage(p_project uuid)
returns uuid language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_company uuid; v_arch timestamptz;
begin
  select company_id, archived_at into v_company, v_arch from core.projects where id = p_project and deleted_at is null and not quality_container;
  if v_company is null or auth.uid() is null or not (planfact.is_platform_admin() or exists (
      select 1 from core.role_assignments a
      join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = 'planfact.projects.manage'
      where a.company_id = v_company and a.user_id = auth.uid() and (a.project_id is null or a.project_id = p_project)
        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))) then
    raise exception 'Нет права управлять проектами' using errcode = '42501';
  end if;
  if v_arch is not null then raise exception 'Проект в архиве — сначала верните его из архива' using errcode = '22023'; end if;
  return v_company;
end $$;

-- Справочники для экранов одним вызовом (таблицы core не открыты REST-клиенту напрямую).
create function public.pf_project_dicts()
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'sort_order', sort_order) order by sort_order), '[]') from core.project_stages),
    'object_kinds', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'sort_order', sort_order) order by sort_order), '[]') from core.object_kinds),
    'roles', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'sort_order', sort_order) order by sort_order), '[]') from core.project_roles)) end
$$;

-- 6. Подразделения.
create function public.pf_company_divisions(p_company uuid)
returns table(id uuid, name text, head_user_id uuid, head_name text, archived_at timestamptz, project_count int, can_manage boolean)
language sql stable security definer set search_path = pg_catalog as $$
  select d.id, d.name, d.head_user_id, nullif(btrim(coalesce(up.full_name, '')), ''), d.archived_at,
         (select count(*)::int from core.projects p where p.division_id = d.id and p.archived_at is null and not p.quality_container),
         core.can_manage_projects(d.company_id)
    from core.divisions d
    left join core.user_profiles up on up.user_id = d.head_user_id
   where d.company_id = p_company and auth.uid() is not null and planfact.is_company_member(p_company)
   order by (d.archived_at is not null), planfact.canon_name(d.name)
$$;

-- Создать или изменить подразделение; id — с устройства (повтор с тем же id — та же запись).
create function public.pf_save_division(p_company uuid, p_id uuid, p_name text, p_head_user uuid default null, p_archived boolean default null)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_old core.divisions; v_name text := btrim(coalesce(p_name, '')); v_arch timestamptz;
begin
  if not core.can_manage_projects(p_company) then raise exception 'Нет права управлять проектами' using errcode = '42501'; end if;
  if p_id is null then raise exception 'Нет идентификатора записи' using errcode = '22023'; end if;
  if v_name = '' then raise exception 'Введите название подразделения' using errcode = '22023'; end if;
  select * into v_old from core.divisions where id = p_id;
  if v_old.id is not null and v_old.company_id <> p_company then raise exception 'Подразделение другой компании' using errcode = '42501'; end if;
  if p_head_user is not null and not exists (select 1 from core.company_members m where m.company_id = p_company and m.user_id = p_head_user and m.disabled_at is null) then
    raise exception 'Руководитель — сотрудник этой компании' using errcode = '22023';
  end if;
  v_arch := case when p_archived is null then v_old.archived_at when p_archived then coalesce(v_old.archived_at, now()) else null end;
  if v_arch is null and exists (select 1 from core.divisions d where d.company_id = p_company and d.archived_at is null
                                  and planfact.canon_name(d.name) = planfact.canon_name(v_name) and d.id <> p_id) then
    raise exception 'Подразделение с таким названием уже есть' using errcode = '23505';
  end if;
  if v_old.id is null then
    insert into core.divisions(id, company_id, name, head_user_id, archived_at) values (p_id, p_company, v_name, p_head_user, v_arch);
    perform planfact.log_admin_change(p_company, null, 'divisions', p_id, 'INSERT', null, jsonb_build_object('name', v_name, 'head_user_id', p_head_user));
  elsif (v_old.name, v_old.head_user_id, v_old.archived_at) is distinct from (v_name, p_head_user, v_arch) then
    update core.divisions set name = v_name, head_user_id = p_head_user, archived_at = v_arch where id = p_id;
    perform planfact.log_admin_change(p_company, null, 'divisions', p_id, 'UPDATE',
      jsonb_build_object('name', v_old.name, 'head_user_id', v_old.head_user_id, 'archived', v_old.archived_at is not null),
      jsonb_build_object('name', v_name, 'head_user_id', p_head_user, 'archived', v_arch is not null));
  end if;
  return p_id;
end $$;

-- 7. Проекты компании с карточкой (модуль не нужен: участник проекта или управляющий проектами компании).
create function public.pf_project_catalog(p_company uuid)
returns table(id uuid, name text, code text, archived_at timestamptz, created_at timestamptz, can_manage boolean,
              division_id uuid, division_name text, address text, planned_start date, planned_finish date,
              manager_user_id uuid, manager_name text, stage text, our_role text, timezone text, country text,
              customer_id uuid, customer_name text, general_contractor_id uuid, general_contractor_name text,
              object_count int, place_count int, places_led_by_quality boolean)
language sql stable security definer set search_path = pg_catalog as $$
  select pr.id, pr.name, pr.code, pr.archived_at, pr.created_at, core.can_manage_projects(pr.company_id),
         pr.division_id, dv.name, pr.address, pr.planned_start, pr.planned_finish,
         pr.manager_user_id, nullif(btrim(coalesce(up.full_name, '')), ''), pr.stage, pr.our_role, pr.timezone, pr.country,
         pr.customer_id, cu.name, pr.general_contractor_id, gc.name,
         (select count(*)::int from core.locations l where l.project_id = pr.id and l.parent_id is null and l.deleted_at is null),
         (select count(*)::int from core.locations l where l.project_id = pr.id and l.deleted_at is null),
         quality.places_led_by_quality(pr.id)
    from core.projects pr
    left join core.divisions dv on dv.id = pr.division_id
    left join core.user_profiles up on up.user_id = pr.manager_user_id
    left join core.counterparties cu on cu.id = pr.customer_id
    left join core.counterparties gc on gc.id = pr.general_contractor_id
   where pr.company_id = p_company and pr.deleted_at is null and not pr.quality_container and auth.uid() is not null
     and (core.can_manage_projects(p_company) or core.is_project_participant(pr.id))
   order by (pr.archived_at is not null), planfact.canon_name(pr.name)
$$;

-- Создать или изменить проект одной карточкой; id — с устройства. Пустой ключ карточки — значение не меняется
-- (при создании — по умолчанию); null в ключе — очистить поле.
create function public.pf_save_project(p_company uuid, p_id uuid, p_card jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_old core.projects; v_new core.projects; c jsonb := coalesce(p_card, '{}'::jsonb);
  v_name text; v_tz text;
begin
  if not core.can_manage_projects(p_company) then raise exception 'Нет права управлять проектами' using errcode = '42501'; end if;
  if p_id is null then raise exception 'Нет идентификатора записи' using errcode = '22023'; end if;
  select * into v_old from core.projects where id = p_id;
  if v_old.id is not null and v_old.company_id <> p_company then raise exception 'Проект другой компании' using errcode = '42501'; end if;
  if v_old.deleted_at is not null then raise exception 'Проект удалён' using errcode = '22023'; end if;
  if v_old.quality_container then raise exception 'Служебная запись — не проект' using errcode = '22023'; end if;
  v_new := v_old;
  if v_old.id is null then
    v_new.id := p_id; v_new.company_id := p_company; v_new.stage := 'construction'; v_new.timezone := 'Europe/Moscow'; v_new.country := 'RU';
  end if;
  if c ? 'name' then v_new.name := btrim(coalesce(c->>'name', '')); end if;
  v_name := coalesce(v_new.name, '');
  if v_name = '' then raise exception 'Введите название проекта' using errcode = '22023'; end if;
  if length(v_name) > 200 then raise exception 'Название проекта — до 200 знаков' using errcode = '22023'; end if;
  if c ? 'code' then v_new.code := nullif(btrim(coalesce(c->>'code', '')), ''); end if;
  if c ? 'address' then v_new.address := nullif(btrim(coalesce(c->>'address', '')), ''); end if;
  if c ? 'division_id' then v_new.division_id := nullif(c->>'division_id', '')::uuid; end if;
  if c ? 'manager_user_id' then v_new.manager_user_id := nullif(c->>'manager_user_id', '')::uuid; end if;
  if c ? 'customer_id' then v_new.customer_id := nullif(c->>'customer_id', '')::uuid; end if;
  if c ? 'general_contractor_id' then v_new.general_contractor_id := nullif(c->>'general_contractor_id', '')::uuid; end if;
  if c ? 'planned_start' then v_new.planned_start := nullif(c->>'planned_start', '')::date; end if;
  if c ? 'planned_finish' then v_new.planned_finish := nullif(c->>'planned_finish', '')::date; end if;
  if c ? 'stage' then v_new.stage := coalesce(nullif(c->>'stage', ''), 'construction'); end if;
  if c ? 'our_role' then v_new.our_role := nullif(c->>'our_role', ''); end if;
  if c ? 'timezone' then v_new.timezone := coalesce(nullif(btrim(coalesce(c->>'timezone', '')), ''), 'Europe/Moscow'); end if;
  if c ? 'country' then v_new.country := upper(coalesce(nullif(btrim(coalesce(c->>'country', '')), ''), 'RU')); end if;
  if c ? 'archived' then
    v_new.archived_at := case when (c->>'archived')::boolean then coalesce(v_old.archived_at, now()) else null end;
  end if;
  -- проверки с понятным текстом (ограничения базы — вторая линия)
  -- новое значение — только действующее; уже стоящее в карточке (архивное подразделение, отключённый сотрудник) не мешает сохранить остальное
  if v_new.division_id is distinct from v_old.division_id and v_new.division_id is not null and not exists (
       select 1 from core.divisions d where d.id = v_new.division_id and d.company_id = p_company and d.archived_at is null) then
    raise exception 'Подразделение не найдено или в архиве' using errcode = '22023';
  end if;
  if v_new.manager_user_id is distinct from v_old.manager_user_id and v_new.manager_user_id is not null and not exists (
       select 1 from core.company_members m where m.company_id = p_company and m.user_id = v_new.manager_user_id and m.disabled_at is null) then
    raise exception 'Руководитель проекта — действующий сотрудник этой компании' using errcode = '22023';
  end if;
  -- заказчик и генподрядчик — те же правила, что в pf_project_set_counterparties (017)
  if v_new.customer_id is distinct from v_old.customer_id and v_new.customer_id is not null and not exists (
       select 1 from core.counterparties k where k.id = v_new.customer_id and k.company_id = p_company and k.deleted_at is null
          and k.archived_at is null and 'customer' = any(k.kinds)) then
    raise exception 'Заказчик не найден, в архиве или не отмечен как заказчик' using errcode = '22023';
  end if;
  if v_new.general_contractor_id is distinct from v_old.general_contractor_id and v_new.general_contractor_id is not null and not exists (
       select 1 from core.counterparties k where k.id = v_new.general_contractor_id and k.company_id = p_company and k.deleted_at is null
          and k.archived_at is null and 'general_contractor' = any(k.kinds)) then
    raise exception 'Генподрядчик не найден, в архиве или не отмечен как генподрядчик' using errcode = '22023';
  end if;
  if not exists (select 1 from core.project_stages s where s.code = v_new.stage) then raise exception 'Неизвестная стадия проекта' using errcode = '22023'; end if;
  if v_new.our_role is not null and not exists (select 1 from core.project_roles r where r.code = v_new.our_role) then
    raise exception 'Неизвестная роль в проекте' using errcode = '22023';
  end if;
  v_tz := v_new.timezone;
  if not exists (select 1 from pg_timezone_names z where z.name = v_tz) then raise exception 'Неизвестный часовой пояс: %', v_tz using errcode = '22023'; end if;
  if v_new.country !~ '^[A-Z]{2}$' then raise exception 'Страна — двухбуквенный код, например RU' using errcode = '22023'; end if;
  if v_new.planned_start is not null and v_new.planned_finish is not null and v_new.planned_start > v_new.planned_finish then
    raise exception 'Дата начала позже даты окончания' using errcode = '22023';
  end if;
  if v_old.id is null then
    insert into core.projects(id, company_id, name, code, address, division_id, manager_user_id, customer_id, general_contractor_id,
                              planned_start, planned_finish, stage, our_role, timezone, country, archived_at)
    values (p_id, p_company, v_name, v_new.code, v_new.address, v_new.division_id, v_new.manager_user_id, v_new.customer_id,
            v_new.general_contractor_id, v_new.planned_start, v_new.planned_finish, v_new.stage, v_new.our_role, v_new.timezone,
            v_new.country, v_new.archived_at);
    perform planfact.log_admin_change(p_company, p_id, 'projects', p_id, 'INSERT', null, c || jsonb_build_object('name', v_name));
  elsif (v_old.name, v_old.code, v_old.address, v_old.division_id, v_old.manager_user_id, v_old.customer_id, v_old.general_contractor_id,
         v_old.planned_start, v_old.planned_finish, v_old.stage, v_old.our_role, v_old.timezone, v_old.country, v_old.archived_at)
        is distinct from
        (v_name, v_new.code, v_new.address, v_new.division_id, v_new.manager_user_id, v_new.customer_id, v_new.general_contractor_id,
         v_new.planned_start, v_new.planned_finish, v_new.stage, v_new.our_role, v_new.timezone, v_new.country, v_new.archived_at) then
    update core.projects set name = v_name, code = v_new.code, address = v_new.address, division_id = v_new.division_id,
           manager_user_id = v_new.manager_user_id, customer_id = v_new.customer_id, general_contractor_id = v_new.general_contractor_id,
           planned_start = v_new.planned_start, planned_finish = v_new.planned_finish, stage = v_new.stage, our_role = v_new.our_role,
           timezone = v_new.timezone, country = v_new.country, archived_at = v_new.archived_at
     where id = p_id;
    perform planfact.log_admin_change(p_company, p_id, 'projects', p_id, 'UPDATE',
      to_jsonb(v_old) - 'created_at' - 'updated_at', jsonb_strip_nulls(c) || jsonb_build_object('name', v_name));
  end if;
  return p_id;
end $$;

-- 8. Места проекта (просмотр — участник проекта или управляющий проектами компании; модуль не нужен).
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

-- Создать или изменить место (id — с устройства). Верх — только объект с видом; ниже — секция, этаж, помещение, прочее.
create function public.pf_save_place(p_project uuid, p_id uuid, p_parent uuid, p_type text, p_name text,
                                     p_object_kind text default null, p_build_no text default null, p_bti_no text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_company uuid; v_old core.locations; v_name text := btrim(coalesce(p_name, '')); v_depth int := 1; v_order int;
        v_type text := coalesce(p_type, ''); v_kind text; v_b text := nullif(btrim(coalesce(p_build_no, '')), ''); v_t text := nullif(btrim(coalesce(p_bti_no, '')), '');
begin
  v_company := core.require_places_manage(p_project);
  if p_id is null then raise exception 'Нет идентификатора записи' using errcode = '22023'; end if;
  if v_name = '' then raise exception 'Введите название' using errcode = '22023'; end if;
  select * into v_old from core.locations where id = p_id;
  if v_old.id is not null and v_old.project_id <> p_project then raise exception 'Место другого проекта' using errcode = '42501'; end if;
  if v_old.id is not null then
    -- правка: название, номера, вид объекта; тип и место в дереве не меняются
    if v_old.deleted_at is not null then raise exception 'Место удалено' using errcode = '22023'; end if;
    v_kind := case when v_old.node_type = 'object' then coalesce(nullif(p_object_kind, ''), v_old.object_kind) end;
    if v_kind is not null and not exists (select 1 from core.object_kinds k where k.code = v_kind) then raise exception 'Неизвестный вид объекта' using errcode = '22023'; end if;
    if exists (select 1 from core.locations where project_id = p_project and parent_id is not distinct from v_old.parent_id
               and canonical_key = planfact.canon_name(v_name) and deleted_at is null and id <> p_id) then
      raise exception 'Место с таким названием уже есть на этом уровне' using errcode = '23505';
    end if;
    if (v_old.name, v_old.object_kind, v_old.build_no, v_old.bti_no) is distinct from (v_name, v_kind, v_b, v_t) then
      update core.locations set name = v_name, canonical_key = planfact.canon_name(v_name), object_kind = v_kind, build_no = v_b, bti_no = v_t where id = p_id;
      perform planfact.log_admin_change(v_company, p_project, 'locations', p_id, 'UPDATE',
        jsonb_build_object('name', v_old.name, 'object_kind', v_old.object_kind, 'build_no', v_old.build_no, 'bti_no', v_old.bti_no),
        jsonb_build_object('name', v_name, 'object_kind', v_kind, 'build_no', v_b, 'bti_no', v_t));
    end if;
    return p_id;
  end if;
  if p_parent is null then
    if v_type <> 'object' then raise exception 'Верхний уровень — только объект' using errcode = '22023'; end if;
    v_kind := coalesce(nullif(p_object_kind, ''), 'other');
    if not exists (select 1 from core.object_kinds k where k.code = v_kind) then raise exception 'Неизвестный вид объекта' using errcode = '22023'; end if;
  else
    if v_type not in ('section', 'floor', 'apartment', 'other') then raise exception 'Неизвестный тип места' using errcode = '22023'; end if;
    select depth + 1 into v_depth from core.locations where id = p_parent and project_id = p_project and deleted_at is null;
    if v_depth is null then raise exception 'Место выше не найдено в этом проекте' using errcode = '22023'; end if;
    if v_depth > 6 then raise exception 'Слишком глубокая вложенность (максимум 6 уровней)' using errcode = '22023'; end if;
  end if;
  if exists (select 1 from core.locations where project_id = p_project and parent_id is not distinct from p_parent
             and canonical_key = planfact.canon_name(v_name) and deleted_at is null) then
    raise exception 'Место с таким названием уже есть на этом уровне' using errcode = '23505';
  end if;
  select coalesce(max(sort_order), 0) + 1 into v_order from core.locations
   where project_id = p_project and parent_id is not distinct from p_parent and deleted_at is null;
  insert into core.locations(id, company_id, project_id, parent_id, node_type, object_kind, name, sort_order, canonical_key, depth, build_no, bti_no)
  values (p_id, v_company, p_project, p_parent, v_type, v_kind, v_name, v_order, planfact.canon_name(v_name), v_depth, v_b, v_t);
  perform planfact.log_admin_change(v_company, p_project, 'locations', p_id, 'INSERT', null,
    jsonb_build_object('name', v_name, 'node_type', v_type, 'object_kind', v_kind, 'parent_id', p_parent, 'build_no', v_b, 'bti_no', v_t));
  return p_id;
end $$;

-- Удалить место с веткой — пометкой (правило 2).
create function public.pf_remove_place(p_location uuid)
returns int language plpgsql security definer set search_path = pg_catalog as $$
declare v_company uuid; v_l core.locations; v_n int;
begin
  select * into v_l from core.locations where id = p_location and deleted_at is null;
  if v_l.id is null then return 0; end if;   -- уже удалено (повтор запроса)
  v_company := core.require_places_manage(v_l.project_id);
  with recursive sub(id) as (select id from core.locations where id = v_l.id
                             union all select c.id from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
  update core.locations l set deleted_at = now() from sub where l.id = sub.id and l.deleted_at is null;
  get diagnostics v_n = row_count;
  perform planfact.log_admin_change(v_company, v_l.project_id, 'locations', v_l.id, 'DELETE',
    jsonb_build_object('name', v_l.name, 'node_type', v_l.node_type, 'nodes', v_n), null);
  return v_n;
end $$;

-- Следующий свободный строительный номер помещения в объекте (только числовые номера).
create function core.next_build_no(p_object uuid)
returns int language sql stable security definer set search_path = pg_catalog as $$
  with recursive sub(id) as (select id from core.locations where parent_id = p_object and deleted_at is null
                             union all select c.id from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
  select coalesce(max(l.build_no::int), 0) + 1 from sub join core.locations l on l.id = sub.id
   where l.node_type = 'apartment' and l.build_no ~ '^[0-9]{1,9}$'
$$;

-- Объект (корень), в котором место; номера квартир считаются по объекту. Запись в одном объекте — по очереди (блокировка
-- на время транзакции), чтобы одновременные «Добавить этажи» / «Копировать» не выдали одинаковые номера.
create function core.place_object(p_location uuid)
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  with recursive up(id, parent_id) as (select id, parent_id from core.locations where id = p_location
                                       union all select l.id, l.parent_id from core.locations l join up on l.id = up.parent_id)
  select id from up where parent_id is null
$$;

-- 9. Заполнить объект одной формой: секции × этажи × квартиры, нумерация, подвал и кровля.
--    Повтор (у объекта уже есть места) — ничего не делает, возвращает 0.
create function public.pf_fill_object(p_object uuid, p_sections int, p_floors int, p_apartments_per_floor int,
                                      p_first_floor int default 1, p_numbering text default 'through', p_start_no int default 1,
                                      p_basement boolean default false, p_roof boolean default false)
returns int language plpgsql security definer set search_path = pg_catalog as $$
declare v_o core.locations; v_company uuid; v_first int := coalesce(p_first_floor, 1); v_start int := coalesce(p_start_no, 1);
        v_total bigint; v_extra int := (case when p_basement then 1 else 0 end) + (case when p_roof then 1 else 0 end); v_n int;
begin
  select * into v_o from core.locations where id = p_object and deleted_at is null;
  if v_o.id is null or v_o.node_type <> 'object' then raise exception 'Объект не найден' using errcode = '22023'; end if;
  v_company := core.require_places_manage(v_o.project_id);
  perform pg_advisory_xact_lock(hashtextextended('p2_0047_object:' || p_object::text, 0));
  if p_sections is null or p_floors is null or p_apartments_per_floor is null or p_sections < 1 or p_floors < 1 or p_apartments_per_floor < 0
     or p_sections > 100 or p_floors > 200 or p_apartments_per_floor > 100 or v_first not between -10 and 200 or v_start not between 1 and 100000 then
    raise exception 'Проверьте числа: секций и этажей — от 1, квартир на этаже — от 0' using errcode = '22023';
  end if;
  if coalesce(p_numbering, '') not in ('through', 'per_section') then raise exception 'Нумерация — сквозная или в каждой секции' using errcode = '22023'; end if;
  v_total := p_sections::bigint * (1 + v_extra + p_floors::bigint * (1 + p_apartments_per_floor));
  if v_total > 5000 then raise exception 'Слишком много мест: % (максимум 5000 за раз)', v_total using errcode = '22023'; end if;
  if exists (select 1 from core.locations where parent_id = p_object and deleted_at is null) then return 0; end if;

  insert into core.locations(company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth)
  select v_company, v_o.project_id, p_object, 'section', 'Секция ' || s, s, planfact.canon_name('Секция ' || s), 2
    from generate_series(1, p_sections) s;
  insert into core.locations(company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth)
  select v_company, v_o.project_id, sec.id, 'floor', 'эт. ' || (v_first + f - 1), f + 1, planfact.canon_name('эт. ' || (v_first + f - 1)), 3
    from core.locations sec cross join generate_series(1, p_floors) f
   where sec.parent_id = p_object and sec.deleted_at is null;
  if p_basement then
    insert into core.locations(company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth)
    select v_company, v_o.project_id, sec.id, 'floor', 'Подвал', 1, planfact.canon_name('Подвал'), 3
      from core.locations sec where sec.parent_id = p_object and sec.deleted_at is null;
  end if;
  if p_roof then
    insert into core.locations(company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth)
    select v_company, v_o.project_id, sec.id, 'other', 'Кровля', p_floors + 2, planfact.canon_name('Кровля'), 3
      from core.locations sec where sec.parent_id = p_object and sec.deleted_at is null;
  end if;
  -- квартиры: секция → этаж → квартира; сквозная нумерация по объекту или заново в каждой секции
  insert into core.locations(company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth, build_no)
  select v_company, v_o.project_id, fl.id, 'apartment', 'кв. ' || n.num, a, planfact.canon_name('кв. ' || n.num), 4, n.num::text
    from core.locations fl
    join core.locations sec on sec.id = fl.parent_id and sec.parent_id = p_object
    cross join generate_series(1, p_apartments_per_floor) a
    cross join lateral (select v_start - 1
                               + case when p_numbering = 'through' then (sec.sort_order - 1) * p_floors * p_apartments_per_floor else 0 end
                               + (fl.sort_order - 2) * p_apartments_per_floor + a as num) n
   where fl.deleted_at is null and fl.node_type = 'floor' and fl.name <> 'Подвал';
  get diagnostics v_n = row_count;
  perform planfact.log_admin_change(v_company, v_o.project_id, 'locations', p_object, 'UPDATE', null,
    jsonb_build_object('filled', true, 'sections', p_sections, 'floors', p_floors, 'apartments_per_floor', p_apartments_per_floor,
      'first_floor', v_first, 'numbering', p_numbering, 'start_no', v_start, 'basement', p_basement, 'roof', p_roof, 'apartments', v_n));
  return v_total::int;
end $$;

-- 10. Добавить этажи сразу в несколько секций (этажи с таким названием пропускаются — повтор безопасен).
--     Квартиры получают строительные номера дальше по объекту.
create function public.pf_add_floors(p_sections uuid[], p_from int, p_to int, p_apartments_per_floor int)
returns int language plpgsql security definer set search_path = pg_catalog as $$
declare v_proj uuid; v_obj uuid; v_company uuid; v_n int := 0; v_no int; s record; f int; v_fl uuid; v_order int; a int; v_seen uuid[] := '{}';
begin
  if p_sections is null or cardinality(p_sections) = 0 then raise exception 'Выберите секции' using errcode = '22023'; end if;
  if p_from is null or p_to is null or p_from > p_to or p_from < -10 or p_to > 200 or p_apartments_per_floor is null
     or p_apartments_per_floor not between 0 and 100 then
    raise exception 'Проверьте этажи (с — по) и число квартир' using errcode = '22023';
  end if;
  select min(project_id::text)::uuid, count(distinct project_id), min(parent_id::text)::uuid into v_proj, v_n, v_obj
    from core.locations where id = any(p_sections) and node_type = 'section' and deleted_at is null;
  if v_proj is null or v_n <> 1 or (select count(*) from core.locations where id = any(p_sections) and node_type = 'section' and deleted_at is null) <> cardinality(p_sections) then
    raise exception 'Секции не найдены или из разных проектов' using errcode = '22023';
  end if;
  v_company := core.require_places_manage(v_proj);
  if cardinality(p_sections)::bigint * (p_to - p_from + 1) * (1 + p_apartments_per_floor) > 5000 then
    raise exception 'Слишком много мест за раз (максимум 5000)' using errcode = '22023';
  end if;
  v_n := 0;
  if exists (select 1 from core.locations where id = any(p_sections) and depth + (case when p_apartments_per_floor > 0 then 2 else 1 end) > 6) then
    raise exception 'Слишком глубокая вложенность (максимум 6 уровней)' using errcode = '22023';
  end if;
  for s in select l.id, l.depth, core.place_object(l.id) obj from core.locations l where l.id = any(p_sections) order by l.parent_id, l.sort_order loop
    if not s.obj = any(v_seen) then perform pg_advisory_xact_lock(hashtextextended('p2_0047_object:' || s.obj::text, 0)); v_seen := v_seen || s.obj; end if;
    v_no := core.next_build_no(s.obj);
    for f in p_from .. p_to loop
      if exists (select 1 from core.locations where parent_id = s.id and canonical_key = planfact.canon_name('эт. ' || f) and deleted_at is null) then continue; end if;
      select coalesce(max(sort_order), 0) + 1 into v_order from core.locations where parent_id = s.id and deleted_at is null;
      insert into core.locations(company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth)
      values (v_company, v_proj, s.id, 'floor', 'эт. ' || f, v_order, planfact.canon_name('эт. ' || f), s.depth + 1) returning id into v_fl;
      v_n := v_n + 1;
      for a in 1 .. p_apartments_per_floor loop
        insert into core.locations(company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth, build_no)
        values (v_company, v_proj, v_fl, 'apartment', 'кв. ' || v_no, a, planfact.canon_name('кв. ' || v_no), s.depth + 2, v_no::text);
        v_no := v_no + 1; v_n := v_n + 1;
      end loop;
    end loop;
  end loop;
  perform planfact.log_admin_change(v_company, v_proj, 'locations', p_sections[1], 'UPDATE', null,
    jsonb_build_object('add_floors', true, 'sections', to_jsonb(p_sections), 'from', p_from, 'to', p_to, 'apartments_per_floor', p_apartments_per_floor, 'nodes', v_n));
  return v_n;
end $$;

-- 11. Копировать место с веткой рядом с ним (типовая секция). id копии — с устройства; повтор — та же копия.
--     Квартиры копии получают строительные номера дальше по объекту.
create function public.pf_copy_place(p_source uuid, p_new_id uuid, p_name text)
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

-- 12. Доступ к функциям: только вошедшим, права проверяет каждая функция.
revoke all on function core.is_project_participant(uuid), core.can_manage_projects(uuid), core.require_places_manage(uuid),
  core.next_build_no(uuid), core.place_object(uuid), core.locations_root_object() from public, anon, authenticated;
revoke all on function public.pf_project_dicts(), public.pf_company_divisions(uuid), public.pf_save_division(uuid, uuid, text, uuid, boolean),
  public.pf_project_catalog(uuid), public.pf_save_project(uuid, uuid, jsonb), public.pf_project_places(uuid, uuid),
  public.pf_save_place(uuid, uuid, uuid, text, text, text, text, text), public.pf_remove_place(uuid),
  public.pf_fill_object(uuid, int, int, int, int, text, int, boolean, boolean), public.pf_add_floors(uuid[], int, int, int),
  public.pf_copy_place(uuid, uuid, text) from public, anon;
grant execute on function public.pf_project_dicts(), public.pf_company_divisions(uuid), public.pf_save_division(uuid, uuid, text, uuid, boolean),
  public.pf_project_catalog(uuid), public.pf_save_project(uuid, uuid, jsonb), public.pf_project_places(uuid, uuid),
  public.pf_save_place(uuid, uuid, uuid, text, text, text, text, text), public.pf_remove_place(uuid),
  public.pf_fill_object(uuid, int, int, int, int, text, int, boolean, boolean), public.pf_add_floors(uuid[], int, int, int),
  public.pf_copy_place(uuid, uuid, text) to authenticated;

commit;
