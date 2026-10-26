-- P2-0005 этап 1. Проекты, дерево локаций, единицы измерения (раздел «Компания»).
-- Только planfact.* и public.pf_*. Объекты RBI/Quality (в т.ч. location_nodes), Auth/PostgREST и Storage не затрагивает. Применять после 005.
-- Запись — только через public.pf_* (security definer, право проверяется внутри); прямых INSERT/UPDATE/DELETE у клиента нет.

-- 1. Проект: код и архив
alter table planfact.projects add column if not exists code text;
alter table planfact.projects add column if not exists archived_at timestamptz;

-- 2. Новые действия каталога и шаблоны ролей
insert into planfact.permission_catalog(action, description) values
  ('planfact.projects.manage', 'Проекты и дерево локаций: создание, правка, архив'),
  ('planfact.units.manage',    'Справочник единиц измерения компании: добавление и удаление своих')
on conflict (action) do nothing;

insert into planfact.role_template_permissions(template_code, action)
select t.code, a.action
from (values ('company_admin'), ('project_manager'), ('pto')) t(code)
cross join (values ('planfact.projects.manage'), ('planfact.units.manage')) a(action)
on conflict do nothing;

-- Дозаполнение ролей, уже созданных из этих шаблонов (свои роли с template_code is null не трогаем).
insert into planfact.company_role_permissions(role_id, company_id, action)
select r.id, r.company_id, p.action
from planfact.company_roles r
join planfact.role_template_permissions p on p.template_code = r.template_code
where r.template_code in ('company_admin', 'project_manager', 'pto')
  and p.action in ('planfact.projects.manage', 'planfact.units.manage')
on conflict do nothing;

-- 3. Локации проекта (любой уровень: корпус / секция / этаж / квартира / другое)
create table if not exists planfact.locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  project_id uuid not null,
  parent_id uuid,                                   -- null = корень проекта
  node_type text not null check (node_type in ('building', 'section', 'floor', 'apartment', 'other')),
  name text not null check (length(btrim(name)) > 0),
  sort_order int not null default 0,
  area numeric check (area is null or area >= 0),
  canonical_key text not null,                      -- нормализованное имя (для сопоставления при импорте ВОР)
  depth int not null default 1 check (depth between 1 and 6),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, project_id),
  foreign key (project_id, company_id) references planfact.projects(id, company_id) on delete cascade,
  foreign key (parent_id, project_id) references planfact.locations(id, project_id)   -- родитель — того же проекта
);
create index if not exists locations_parent_idx on planfact.locations(project_id, parent_id) where deleted_at is null;
create unique index if not exists locations_sibling_uq
  on planfact.locations(project_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), canonical_key)
  where deleted_at is null;

-- 4. Единицы измерения (company_id is null = общая)
create table if not exists planfact.units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references planfact.companies(id) on delete cascade,
  code text not null check (length(btrim(code)) > 0),
  name text not null check (length(btrim(name)) > 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists units_code_uq
  on planfact.units(coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(code))
  where deleted_at is null;

insert into planfact.units(company_id, code, name)
select null, v.code, v.name
from (values ('м²', 'Квадратный метр'), ('м³', 'Кубический метр'), ('м.п.', 'Погонный метр'), ('шт.', 'Штука'),
             ('компл.', 'Комплект'), ('т', 'Тонна'), ('кг', 'Килограмм'), ('л', 'Литр'), ('чел.-ч.', 'Человеко-час')) v(code, name)
where not exists (select 1 from planfact.units u where u.company_id is null and lower(u.code) = lower(v.code) and u.deleted_at is null);

-- 5. RLS: чтение — кто видит проект / члены компании; записи напрямую нет
alter table planfact.locations enable row level security;
alter table planfact.units     enable row level security;
drop policy if exists locations_select on planfact.locations;
create policy locations_select on planfact.locations for select to authenticated
  using (deleted_at is null and planfact.is_project_member(project_id));
drop policy if exists units_select on planfact.units;
create policy units_select on planfact.units for select to authenticated
  using (deleted_at is null and (company_id is null or planfact.is_company_member(company_id)));
revoke all on planfact.locations, planfact.units from public, anon, authenticated;
grant select on planfact.locations, planfact.units to authenticated;

-- 6. Служебные функции (клиенту не выдаются)
create or replace function planfact.canon_name(p_name text)
returns text language sql immutable set search_path = pg_catalog as $$
  select lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'));
$$;

-- Проект для изменения: есть право planfact.projects.manage (по проекту или на всю компанию), проект не в архиве.
create or replace function planfact.require_project_manage(p_project uuid, p_allow_archived boolean default false)
returns uuid language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_arch timestamptz;
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.projects.manage') then
    raise exception 'Нет права управлять проектами' using errcode = '42501';
  end if;
  select company_id, archived_at into v_company, v_arch from planfact.projects where id = p_project;
  if v_arch is not null and not p_allow_archived then
    raise exception 'Проект в архиве — сначала верните его из архива' using errcode = '22023';
  end if;
  return v_company;
end $$;

create or replace function planfact.require_units_manage(p_company uuid)
returns void language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_company is null or auth.uid() is null or not planfact.has_company_permission(p_company, 'planfact.units.manage') then
    raise exception 'Нет права управлять единицами измерения' using errcode = '42501';
  end if;
end $$;

-- Полный путь локации: «Корпус 1 · Секция 2 · эт. 7 · кв. 142» (без проверки прав — только для pf_*).
create or replace function planfact.location_path(p_location uuid)
returns text language sql stable security definer set search_path = pg_catalog, planfact as $$
  with recursive up(id, parent_id, name, lvl) as (
    select id, parent_id, name, 0 from planfact.locations where id = p_location
    union all
    select l.id, l.parent_id, l.name, up.lvl + 1 from planfact.locations l join up on l.id = up.parent_id
  )
  select string_agg(name, ' · ' order by lvl desc) from up;
$$;

-- 7. Проекты
create or replace function public.pf_my_company_access()
returns table(company_id uuid, company_name text, can_manage_projects boolean, can_manage_units boolean, can_manage_roles boolean)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  select c.id, c.name,
         planfact.has_company_permission(c.id, 'planfact.projects.manage'),
         planfact.has_company_permission(c.id, 'planfact.units.manage'),
         planfact.has_company_permission(c.id, 'security.roles.assign')
  from planfact.companies c
  where auth.uid() is not null and exists (
    select 1 from planfact.company_modules cm
    join planfact.role_assignments a on a.company_id = cm.company_id and a.user_id = auth.uid()
         and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
    where cm.company_id = c.id and cm.module = 'planfact' and cm.enabled)
  order by c.name;
$$;

create or replace function public.pf_company_projects(p_company uuid)
returns table(id uuid, name text, code text, archived_at timestamptz, created_at timestamptz, can_manage boolean)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  select pr.id, pr.name, pr.code, pr.archived_at, pr.created_at, planfact.has_permission(pr.id, 'planfact.projects.manage')
  from planfact.projects pr
  where pr.company_id = p_company and auth.uid() is not null and planfact.is_project_member(pr.id)
  order by (pr.archived_at is not null), pr.name;
$$;

create or replace function public.pf_create_project(p_company uuid, p_name text, p_code text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, '')); v_code text := nullif(btrim(coalesce(p_code, '')), '');
begin
  if p_company is null or auth.uid() is null or not planfact.has_company_permission(p_company, 'planfact.projects.manage') then
    raise exception 'Нет права управлять проектами' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'Введите название проекта' using errcode = '22023'; end if;
  insert into planfact.projects(company_id, name, code) values (p_company, v_name, v_code) returning id into v_id;
  perform planfact.log_admin_change(p_company, v_id, 'projects', v_id, 'INSERT', null,
    jsonb_build_object('name', v_name, 'code', v_code));
  return v_id;
end $$;

-- Переименование, код, архив / возврат из архива (p_archived: null = не менять).
create or replace function public.pf_update_project(p_project uuid, p_name text, p_code text default null, p_archived boolean default null)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_old planfact.projects; v_name text := btrim(coalesce(p_name, ''));
        v_code text := nullif(btrim(coalesce(p_code, '')), ''); v_arch timestamptz;
begin
  v_company := planfact.require_project_manage(p_project, true);
  if v_name = '' then raise exception 'Введите название проекта' using errcode = '22023'; end if;
  select * into v_old from planfact.projects where id = p_project;
  v_arch := case when p_archived is null then v_old.archived_at
                 when p_archived then coalesce(v_old.archived_at, now()) else null end;
  update planfact.projects set name = v_name, code = v_code, archived_at = v_arch where id = p_project;
  perform planfact.log_admin_change(v_company, p_project, 'projects', p_project, 'UPDATE',
    jsonb_build_object('name', v_old.name, 'code', v_old.code, 'archived', v_old.archived_at is not null),
    jsonb_build_object('name', v_name, 'code', v_code, 'archived', v_arch is not null));
end $$;

-- 8. Локации
-- Дочерние узлы (p_parent null = корень проекта), с путём и числом потомков. Дерево грузится лениво — по раскрытию узла.
create or replace function public.pf_list_locations(p_project uuid, p_parent uuid default null)
returns table(id uuid, parent_id uuid, node_type text, name text, sort_order int, area numeric, depth int, path text, child_count int)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_prefix text;
begin
  if p_project is null or auth.uid() is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  if p_parent is not null then
    if not exists (select 1 from planfact.locations l where l.id = p_parent and l.project_id = p_project and l.deleted_at is null) then
      raise exception 'Узел не найден' using errcode = '22023';
    end if;
    v_prefix := planfact.location_path(p_parent) || ' · ';
  end if;
  return query
  select l.id, l.parent_id, l.node_type, l.name, l.sort_order, l.area, l.depth,
         coalesce(v_prefix, '') || l.name,
         (select count(*)::int from planfact.locations c where c.parent_id = l.id and c.deleted_at is null)
  from planfact.locations l
  where l.project_id = p_project and l.deleted_at is null
    and l.parent_id is not distinct from p_parent
  order by l.sort_order, l.name, l.id;
end $$;

create or replace function public.pf_location_path(p_location uuid)
returns text language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_project uuid;
begin
  select project_id into v_project from planfact.locations where id = p_location and deleted_at is null;
  if v_project is null or auth.uid() is null or not planfact.is_project_member(v_project) then
    raise exception 'Узел не найден' using errcode = '22023';
  end if;
  return planfact.location_path(p_location);
end $$;

create or replace function public.pf_add_location(p_project uuid, p_parent uuid, p_type text, p_name text, p_area numeric default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_depth int := 1; v_name text := btrim(coalesce(p_name, '')); v_id uuid; v_order int;
begin
  v_company := planfact.require_project_manage(p_project);
  if v_name = '' then raise exception 'Введите название' using errcode = '22023'; end if;
  if p_type is null or p_type not in ('building', 'section', 'floor', 'apartment', 'other') then
    raise exception 'Неизвестный тип узла' using errcode = '22023';
  end if;
  if p_parent is not null then
    select depth + 1 into v_depth from planfact.locations where id = p_parent and project_id = p_project and deleted_at is null;
    if v_depth is null then raise exception 'Родительский узел не найден в этом проекте' using errcode = '22023'; end if;
  end if;
  if v_depth > 6 then raise exception 'Слишком глубокая вложенность (максимум 6 уровней)' using errcode = '22023'; end if;
  if exists (select 1 from planfact.locations where project_id = p_project and parent_id is not distinct from p_parent
             and canonical_key = planfact.canon_name(v_name) and deleted_at is null) then
    raise exception 'Узел с таким названием уже есть на этом уровне' using errcode = '23505';
  end if;
  select coalesce(max(sort_order), 0) + 1 into v_order from planfact.locations
    where project_id = p_project and parent_id is not distinct from p_parent and deleted_at is null;
  insert into planfact.locations(company_id, project_id, parent_id, node_type, name, sort_order, area, canonical_key, depth)
  values (v_company, p_project, p_parent, p_type, v_name, v_order, p_area, planfact.canon_name(v_name), v_depth)
  returning id into v_id;
  perform planfact.log_admin_change(v_company, p_project, 'locations', v_id, 'INSERT', null,
    jsonb_build_object('name', v_name, 'node_type', p_type, 'parent_id', p_parent));
  return v_id;
end $$;

create or replace function public.pf_rename_location(p_location uuid, p_name text)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_l planfact.locations; v_name text := btrim(coalesce(p_name, ''));
begin
  select * into v_l from planfact.locations where id = p_location and deleted_at is null;
  if v_l.id is null then raise exception 'Узел не найден' using errcode = '22023'; end if;
  v_company := planfact.require_project_manage(v_l.project_id);
  if v_name = '' then raise exception 'Введите название' using errcode = '22023'; end if;
  if exists (select 1 from planfact.locations where project_id = v_l.project_id and parent_id is not distinct from v_l.parent_id
             and canonical_key = planfact.canon_name(v_name) and deleted_at is null and id <> v_l.id) then
    raise exception 'Узел с таким названием уже есть на этом уровне' using errcode = '23505';
  end if;
  update planfact.locations set name = v_name, canonical_key = planfact.canon_name(v_name) where id = v_l.id;
  perform planfact.log_admin_change(v_company, v_l.project_id, 'locations', v_l.id, 'UPDATE',
    jsonb_build_object('name', v_l.name), jsonb_build_object('name', v_name));
end $$;

-- Перенос узла (с потомками) под другого родителя того же проекта; p_new_parent null = в корень.
create or replace function public.pf_move_location(p_location uuid, p_new_parent uuid)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_l planfact.locations; v_new_depth int := 1; v_shift int; v_max int; v_order int;
begin
  select * into v_l from planfact.locations where id = p_location and deleted_at is null;
  if v_l.id is null then raise exception 'Узел не найден' using errcode = '22023'; end if;
  v_company := planfact.require_project_manage(v_l.project_id);
  if p_new_parent is not null then
    select depth + 1 into v_new_depth from planfact.locations
      where id = p_new_parent and project_id = v_l.project_id and deleted_at is null;
    if v_new_depth is null then raise exception 'Новый родитель не найден в этом проекте' using errcode = '22023'; end if;
    if p_new_parent = v_l.id or exists (
        with recursive sub(id) as (select id from planfact.locations where id = v_l.id
                                   union all select c.id from planfact.locations c join sub on c.parent_id = sub.id)
        select 1 from sub where id = p_new_parent) then
      raise exception 'Нельзя перенести узел внутрь самого себя' using errcode = '22023';
    end if;
  end if;
  v_shift := v_new_depth - v_l.depth;
  with recursive sub(id) as (select id from planfact.locations where id = v_l.id and deleted_at is null
                             union all select c.id from planfact.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
  select max(l.depth) + v_shift into v_max from planfact.locations l join sub on sub.id = l.id;
  if v_max > 6 then raise exception 'Слишком глубокая вложенность (максимум 6 уровней)' using errcode = '22023'; end if;
  if exists (select 1 from planfact.locations where project_id = v_l.project_id and parent_id is not distinct from p_new_parent
             and canonical_key = v_l.canonical_key and deleted_at is null and id <> v_l.id) then
    raise exception 'Узел с таким названием уже есть на этом уровне' using errcode = '23505';
  end if;
  select coalesce(max(sort_order), 0) + 1 into v_order from planfact.locations
    where project_id = v_l.project_id and parent_id is not distinct from p_new_parent and deleted_at is null;
  update planfact.locations set parent_id = p_new_parent, sort_order = v_order where id = v_l.id;
  if v_shift <> 0 then
    with recursive sub(id) as (select id from planfact.locations where id = v_l.id
                               union all select c.id from planfact.locations c join sub on c.parent_id = sub.id)
    update planfact.locations l set depth = l.depth + v_shift from sub where l.id = sub.id;
  end if;
  perform planfact.log_admin_change(v_company, v_l.project_id, 'locations', v_l.id, 'UPDATE',
    jsonb_build_object('name', v_l.name, 'parent_id', v_l.parent_id), jsonb_build_object('name', v_l.name, 'parent_id', p_new_parent));
end $$;

-- Удаление (мягкое). Узел с живыми потомками — только с p_cascade = true («удалить ветку»). Возвращает число удалённых узлов.
create or replace function public.pf_delete_location(p_location uuid, p_cascade boolean default false)
returns int language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_l planfact.locations; v_n int;
begin
  select * into v_l from planfact.locations where id = p_location and deleted_at is null;
  if v_l.id is null then raise exception 'Узел не найден' using errcode = '22023'; end if;
  v_company := planfact.require_project_manage(v_l.project_id);
  if not coalesce(p_cascade, false) and exists (select 1 from planfact.locations where parent_id = v_l.id and deleted_at is null) then
    raise exception 'У узла есть вложенные узлы — удалите ветку целиком' using errcode = '23503';
  end if;
  with recursive sub(id) as (select id from planfact.locations where id = v_l.id
                             union all select c.id from planfact.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
  update planfact.locations l set deleted_at = now() from sub where l.id = sub.id and l.deleted_at is null;
  get diagnostics v_n = row_count;
  perform planfact.log_admin_change(v_company, v_l.project_id, 'locations', v_l.id, 'DELETE',
    jsonb_build_object('name', v_l.name, 'node_type', v_l.node_type, 'nodes', v_n), null);
  return v_n;
end $$;

-- Генератор корпуса: корпус → N секций → M этажей → K квартир на этаже; нумерация квартир сквозная по корпусу.
-- Одна транзакция, не более 5 000 узлов за вызов. Возвращает id корпуса. Число узлов = 1 + N·(1 + M·(1 + K)).
create or replace function public.pf_generate_building(p_project uuid, p_parent uuid, p_name text, p_sections int,
                                                       p_floors int, p_apartments_per_floor int, p_first_floor int default 1)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_name text := btrim(coalesce(p_name, '')); v_depth int := 1; v_total bigint;
        v_b uuid; v_order int; v_first int := coalesce(p_first_floor, 1);
begin
  v_company := planfact.require_project_manage(p_project);
  if v_name = '' then raise exception 'Введите название корпуса' using errcode = '22023'; end if;
  if p_sections is null or p_floors is null or p_apartments_per_floor is null
     or p_sections < 1 or p_floors < 1 or p_apartments_per_floor < 0
     or p_sections > 1000 or p_floors > 1000 or p_apartments_per_floor > 1000 or v_first not between -100 and 1000 then
    raise exception 'Проверьте числа: секций и этажей — от 1, квартир на этаже — от 0' using errcode = '22023';
  end if;
  v_total := 1 + p_sections::bigint * (1 + p_floors::bigint * (1 + p_apartments_per_floor));
  if v_total > 5000 then
    raise exception 'Слишком много узлов: % (максимум 5000 за раз)', v_total using errcode = '22023';
  end if;
  if p_parent is not null then
    select depth + 1 into v_depth from planfact.locations where id = p_parent and project_id = p_project and deleted_at is null;
    if v_depth is null then raise exception 'Родительский узел не найден в этом проекте' using errcode = '22023'; end if;
  end if;
  if v_depth + 3 > 6 then raise exception 'Слишком глубокая вложенность (максимум 6 уровней)' using errcode = '22023'; end if;
  if exists (select 1 from planfact.locations where project_id = p_project and parent_id is not distinct from p_parent
             and canonical_key = planfact.canon_name(v_name) and deleted_at is null) then
    raise exception 'Узел с таким названием уже есть на этом уровне' using errcode = '23505';
  end if;
  select coalesce(max(sort_order), 0) + 1 into v_order from planfact.locations
    where project_id = p_project and parent_id is not distinct from p_parent and deleted_at is null;

  insert into planfact.locations(company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth)
  values (v_company, p_project, p_parent, 'building', v_name, v_order, planfact.canon_name(v_name), v_depth)
  returning id into v_b;

  -- секции
  insert into planfact.locations(company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth)
  select v_company, p_project, v_b, 'section', 'Секция ' || s, s, planfact.canon_name('Секция ' || s), v_depth + 1
  from generate_series(1, p_sections) s;
  -- этажи
  insert into planfact.locations(company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth)
  select v_company, p_project, sec.id, 'floor', 'эт. ' || (v_first + f - 1), f, planfact.canon_name('эт. ' || (v_first + f - 1)), v_depth + 2
  from planfact.locations sec cross join generate_series(1, p_floors) f
  where sec.parent_id = v_b and sec.deleted_at is null;
  -- квартиры: сквозная нумерация по корпусу (секция → этаж → квартира)
  insert into planfact.locations(company_id, project_id, parent_id, node_type, name, sort_order, canonical_key, depth)
  select v_company, p_project, fl.id, 'apartment', 'кв. ' || n.num, a, planfact.canon_name('кв. ' || n.num), v_depth + 3
  from planfact.locations fl
  join planfact.locations sec on sec.id = fl.parent_id and sec.parent_id = v_b
  cross join generate_series(1, p_apartments_per_floor) a
  cross join lateral (select (sec.sort_order - 1) * p_floors * p_apartments_per_floor
                             + (fl.sort_order - 1) * p_apartments_per_floor + a as num) n
  where fl.deleted_at is null;

  perform planfact.log_admin_change(v_company, p_project, 'locations', v_b, 'INSERT', null,
    jsonb_build_object('name', v_name, 'node_type', 'building', 'parent_id', p_parent, 'generated', true,
      'sections', p_sections, 'floors', p_floors, 'apartments_per_floor', p_apartments_per_floor, 'nodes', v_total));
  return v_b;
end $$;

-- 9. Единицы измерения
create or replace function public.pf_list_units(p_company uuid)
returns table(id uuid, company_id uuid, code text, name text, is_common boolean)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_company is null or auth.uid() is null or not planfact.is_company_member(p_company) then
    raise exception 'Нет доступа к компании' using errcode = '42501';
  end if;
  return query
  select u.id, u.company_id, u.code, u.name, u.company_id is null
  from planfact.units u
  where u.deleted_at is null and (u.company_id is null or u.company_id = p_company)
  order by (u.company_id is not null), lower(u.code);
end $$;

create or replace function public.pf_add_unit(p_company uuid, p_code text, p_name text)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_code text := btrim(coalesce(p_code, '')); v_name text := btrim(coalesce(p_name, '')); v_id uuid;
begin
  perform planfact.require_units_manage(p_company);
  if v_code = '' or v_name = '' then raise exception 'Введите обозначение и название единицы' using errcode = '22023'; end if;
  if exists (select 1 from planfact.units where deleted_at is null and lower(code) = lower(v_code)
             and (company_id is null or company_id = p_company)) then
    raise exception 'Единица с таким обозначением уже есть' using errcode = '23505';
  end if;
  insert into planfact.units(company_id, code, name) values (p_company, v_code, v_name) returning id into v_id;
  perform planfact.log_admin_change(p_company, null, 'units', v_id, 'INSERT', null, jsonb_build_object('code', v_code, 'name', v_name));
  return v_id;
end $$;

create or replace function public.pf_delete_unit(p_unit uuid)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_u planfact.units;
begin
  select * into v_u from planfact.units where id = p_unit and deleted_at is null;
  if v_u.id is null then raise exception 'Единица не найдена' using errcode = '22023'; end if;
  if v_u.company_id is null then
    raise exception 'Общую единицу удалить нельзя' using errcode = '42501';
  end if;
  perform planfact.require_units_manage(v_u.company_id);
  update planfact.units set deleted_at = now() where id = v_u.id;
  perform planfact.log_admin_change(v_u.company_id, null, 'units', v_u.id, 'DELETE',
    jsonb_build_object('code', v_u.code, 'name', v_u.name), null);
end $$;

-- 10. Журнал компании: добавлены проекты, локации, единицы (тело как в 005 + фильтр table_name)
drop function if exists public.pf_list_company_audit(uuid, int);
create function public.pf_list_company_audit(p_company uuid, p_limit int default 50)
returns table(at timestamptz, actor_email text, action text, record_id uuid, subject_email text, old_data jsonb, new_data jsonb,
              table_name text)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select a.at, u.email::text, a.action, a.record_id, su.email::text, a.old_data, a.new_data, a.table_name
  from planfact.audit_log a
  left join auth.users u on u.id = a.actor
  left join auth.users su on su.id = (coalesce(a.new_data, a.old_data) ->> 'user_id')::uuid
  where a.company_id = p_company and a.table_name in ('company_roles', 'role_assignments', 'projects', 'locations', 'units')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- 11. Права на выполнение
revoke all on function planfact.canon_name(text), planfact.require_project_manage(uuid, boolean),
  planfact.require_units_manage(uuid), planfact.location_path(uuid) from public, anon;
revoke all on function public.pf_my_company_access(), public.pf_company_projects(uuid), public.pf_create_project(uuid, text, text),
  public.pf_update_project(uuid, text, text, boolean), public.pf_list_locations(uuid, uuid), public.pf_location_path(uuid),
  public.pf_add_location(uuid, uuid, text, text, numeric), public.pf_rename_location(uuid, text),
  public.pf_move_location(uuid, uuid), public.pf_delete_location(uuid, boolean),
  public.pf_generate_building(uuid, uuid, text, int, int, int, int), public.pf_list_units(uuid),
  public.pf_add_unit(uuid, text, text), public.pf_delete_unit(uuid), public.pf_list_company_audit(uuid, int)
  from public, anon;
grant execute on function public.pf_my_company_access(), public.pf_company_projects(uuid), public.pf_create_project(uuid, text, text),
  public.pf_update_project(uuid, text, text, boolean), public.pf_list_locations(uuid, uuid), public.pf_location_path(uuid),
  public.pf_add_location(uuid, uuid, text, text, numeric), public.pf_rename_location(uuid, text),
  public.pf_move_location(uuid, uuid), public.pf_delete_location(uuid, boolean),
  public.pf_generate_building(uuid, uuid, text, int, int, int, int), public.pf_list_units(uuid),
  public.pf_add_unit(uuid, text, text), public.pf_delete_unit(uuid), public.pf_list_company_audit(uuid, int)
  to authenticated;
