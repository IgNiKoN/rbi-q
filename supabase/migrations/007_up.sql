-- P2-0006. Загрузка ВОР любой формы: загрузки и строки исходника, профили форм, виды работ, словарь, позиции и связки.
-- Только planfact.* и public.pf_*. Объекты RBI/Quality, Auth/PostgREST и Storage не затрагивает (файл не хранится — только строки,
-- имя файла и SHA-256). Применять после 006 — ФАЙЛОМ (не через буфер обмена: урок 006a).
-- Запись — только через public.pf_* (security definer, право проверяется внутри, company_id берётся из проекта);
-- клиенту — только SELECT по RLS. Подтверждённая загрузка неизменяема (функции и триггеры отказывают).

-- 1. Действие каталога и шаблоны ролей
insert into planfact.permission_catalog(action, description) values
  ('planfact.vor.manage', 'ВОР: загрузка и подтверждение, профили форм, словарь и виды работ')
on conflict (action) do nothing;

insert into planfact.role_template_permissions(template_code, action)
select t.code, 'planfact.vor.manage' from (values ('company_admin'), ('project_manager'), ('pto')) t(code)
on conflict do nothing;

-- Дозаполнение ролей, уже созданных из этих шаблонов (свои роли с template_code is null не трогаем).
insert into planfact.company_role_permissions(role_id, company_id, action)
select r.id, r.company_id, p.action
from planfact.company_roles r
join planfact.role_template_permissions p on p.template_code = r.template_code
where r.template_code in ('company_admin', 'project_manager', 'pto') and p.action = 'planfact.vor.manage'
on conflict do nothing;

-- 2. Справочники компании: виды работ, профили форм, словарь
create table if not exists planfact.work_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references planfact.companies(id) on delete cascade,
  code text,
  name text not null check (length(btrim(name)) > 0),
  canon_name text not null,
  unit_id uuid references planfact.units(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists work_types_uq
  on planfact.work_types(company_id, canon_name, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where deleted_at is null;

create table if not exists planfact.vor_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references planfact.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  signature text not null check (length(signature) between 1 and 2000),   -- нормализованные подписи шапки
  column_map jsonb not null,
  rules jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, signature)
);

create table if not exists planfact.vor_dictionary (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references planfact.companies(id) on delete cascade,
  canon_name text not null,
  unit_text text not null default '',                                 -- ЕИ строки заказчика (нормализованная), '' — без ЕИ
  work_type_id uuid not null references planfact.work_types(id),
  confirmed_by uuid default auth.uid(),
  confirmed_at timestamptz not null default now(),
  hits int not null default 1,
  unique (company_id, canon_name, unit_text)
);

-- 3. Загрузки ВОР (проект)
create table if not exists planfact.vor_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  project_id uuid not null,
  profile_id uuid references planfact.vor_profiles(id) on delete set null,
  file_name text not null check (length(btrim(file_name)) between 1 and 300),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  sheet_name text not null check (length(sheet_name) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  row_count int not null default 0,
  totals jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  unique (id, project_id),
  foreign key (project_id, company_id) references planfact.projects(id, company_id) on delete cascade
);
create index if not exists vor_imports_project_idx on planfact.vor_imports(project_id, created_at desc);

-- Строки исходника — как в файле + решения ПТО на черновике (место, вид работ, ЕИ, цвет светофора).
create table if not exists planfact.vor_source_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null,
  project_id uuid not null,
  row_no int not null check (row_no > 0),
  kind text not null check (kind in ('group', 'work', 'material', 'context', 'skip')),
  number text,
  name text not null default '',
  unit_text text,
  qty numeric,
  norm numeric,
  prices jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  parent_row_id uuid references planfact.vor_source_rows(id),
  raw jsonb not null default '[]'::jsonb,
  location_id uuid,
  work_type_id uuid references planfact.work_types(id),
  unit_id uuid references planfact.units(id),
  match text check (match in ('green', 'yellow', 'red')),
  unique (import_id, row_no),
  foreign key (import_id, project_id) references planfact.vor_imports(id, project_id) on delete cascade,
  foreign key (location_id, project_id) references planfact.locations(id, project_id)
);

-- 4. Позиции (наша нормализованная позиция: место + вид работ + ЕИ + объём) и связки со строками заказчика
create table if not exists planfact.vor_positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  project_id uuid not null,
  import_id uuid not null,
  location_id uuid not null,
  work_type_id uuid not null references planfact.work_types(id),
  unit_id uuid not null references planfact.units(id),
  qty numeric not null check (qty >= 0),
  apartments_note text,
  status text not null default 'confirmed' check (status in ('green', 'yellow', 'red', 'confirmed')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (import_id, project_id) references planfact.vor_imports(id, project_id) on delete cascade,
  foreign key (location_id, project_id) references planfact.locations(id, project_id)
);
create index if not exists vor_positions_project_idx on planfact.vor_positions(project_id, location_id);

create table if not exists planfact.vor_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  source_row_id uuid not null references planfact.vor_source_rows(id) on delete cascade,
  position_id uuid not null references planfact.vor_positions(id) on delete cascade,
  share numeric not null default 1 check (share > 0 and share <= 1),
  unique (source_row_id, position_id)
);

-- 5. Неизменяемость подтверждённой загрузки (второй рубеж после проверок в pf_*)
create or replace function planfact.vor_guard_confirmed()
returns trigger language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_import uuid; v_status text;
begin
  if tg_table_name = 'vor_imports' then
    if old.status = 'confirmed' then
      raise exception 'Подтверждённую загрузку ВОР изменить нельзя' using errcode = '42501';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_table_name = 'vor_links' then
    select p.import_id into v_import from planfact.vor_positions p where p.id = old.position_id;
  else
    v_import := old.import_id;
  end if;
  select status into v_status from planfact.vor_imports where id = v_import;
  if v_status = 'confirmed' then
    raise exception 'Подтверждённую загрузку ВОР изменить нельзя' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists vor_imports_guard on planfact.vor_imports;
create trigger vor_imports_guard before update or delete on planfact.vor_imports for each row execute function planfact.vor_guard_confirmed();
drop trigger if exists vor_source_rows_guard on planfact.vor_source_rows;
create trigger vor_source_rows_guard before update or delete on planfact.vor_source_rows for each row execute function planfact.vor_guard_confirmed();
drop trigger if exists vor_positions_guard on planfact.vor_positions;
create trigger vor_positions_guard before update or delete on planfact.vor_positions for each row execute function planfact.vor_guard_confirmed();
drop trigger if exists vor_links_guard on planfact.vor_links;
create trigger vor_links_guard before update or delete on planfact.vor_links for each row execute function planfact.vor_guard_confirmed();

-- 6. RLS: чтение — члены проекта (ВОР, позиции) / члены компании (справочники); записи напрямую нет
alter table planfact.work_types      enable row level security;
alter table planfact.vor_profiles    enable row level security;
alter table planfact.vor_dictionary  enable row level security;
alter table planfact.vor_imports     enable row level security;
alter table planfact.vor_source_rows enable row level security;
alter table planfact.vor_positions   enable row level security;
alter table planfact.vor_links       enable row level security;
drop policy if exists work_types_select on planfact.work_types;
create policy work_types_select on planfact.work_types for select to authenticated
  using (deleted_at is null and planfact.is_company_member(company_id));
drop policy if exists vor_profiles_select on planfact.vor_profiles;
create policy vor_profiles_select on planfact.vor_profiles for select to authenticated
  using (planfact.is_company_member(company_id));
drop policy if exists vor_dictionary_select on planfact.vor_dictionary;
create policy vor_dictionary_select on planfact.vor_dictionary for select to authenticated
  using (planfact.is_company_member(company_id));
drop policy if exists vor_imports_select on planfact.vor_imports;
create policy vor_imports_select on planfact.vor_imports for select to authenticated
  using (planfact.is_project_member(project_id));
drop policy if exists vor_source_rows_select on planfact.vor_source_rows;
create policy vor_source_rows_select on planfact.vor_source_rows for select to authenticated
  using (planfact.is_project_member(project_id));
drop policy if exists vor_positions_select on planfact.vor_positions;
create policy vor_positions_select on planfact.vor_positions for select to authenticated
  using (planfact.is_project_member(project_id));
drop policy if exists vor_links_select on planfact.vor_links;
create policy vor_links_select on planfact.vor_links for select to authenticated
  using (planfact.is_project_member(project_id));
revoke all on planfact.work_types, planfact.vor_profiles, planfact.vor_dictionary, planfact.vor_imports,
  planfact.vor_source_rows, planfact.vor_positions, planfact.vor_links from public, anon, authenticated;
grant select on planfact.work_types, planfact.vor_profiles, planfact.vor_dictionary, planfact.vor_imports,
  planfact.vor_source_rows, planfact.vor_positions, planfact.vor_links to authenticated;

-- 7. Служебные функции (клиенту не выдаются)
-- Проект для работы с ВОР: право planfact.vor.manage (по проекту или на всю компанию), проект не в архиве. Возвращает компанию проекта.
create or replace function planfact.require_vor_manage(p_project uuid)
returns uuid language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_arch timestamptz;
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.vor.manage') then
    raise exception 'Нет права загружать ВОР' using errcode = '42501';
  end if;
  select company_id, archived_at into v_company, v_arch from planfact.projects where id = p_project;
  if v_arch is not null then
    raise exception 'Проект в архиве — сначала верните его из архива' using errcode = '22023';
  end if;
  return v_company;
end $$;

-- Черновик загрузки для изменения: право по проекту загрузки + статус draft. Возвращает загрузку.
create or replace function planfact.require_vor_draft(p_import uuid)
returns planfact.vor_imports language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_i planfact.vor_imports;
begin
  select * into v_i from planfact.vor_imports where id = p_import;
  if v_i.id is null or auth.uid() is null or not planfact.is_project_member(v_i.project_id) then
    raise exception 'Загрузка не найдена' using errcode = '22023';
  end if;
  perform planfact.require_vor_manage(v_i.project_id);
  if v_i.status <> 'draft' then
    raise exception 'Подтверждённую загрузку ВОР изменить нельзя' using errcode = '42501';
  end if;
  return v_i;
end $$;

-- ЕИ: общая или своей компании.
create or replace function planfact.unit_allowed(p_unit uuid, p_company uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select exists (select 1 from planfact.units u where u.id = p_unit and u.deleted_at is null
                 and (u.company_id is null or u.company_id = p_company));
$$;

-- 8. Загрузки и строки исходника
create or replace function public.pf_vor_create_import(p_project uuid, p_file_name text, p_sha256 text, p_sheet text,
                                                       p_profile uuid default null, p_totals jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_id uuid; v_file text := btrim(coalesce(p_file_name, '')); v_sheet text := coalesce(p_sheet, '');
begin
  v_company := planfact.require_vor_manage(p_project);
  if v_file = '' or v_sheet = '' then raise exception 'Нет имени файла или листа' using errcode = '22023'; end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Неверная отметка файла (SHA-256)' using errcode = '22023'; end if;
  if p_profile is not null and not exists (select 1 from planfact.vor_profiles where id = p_profile and company_id = v_company) then
    raise exception 'Профиль формы не найден' using errcode = '22023';
  end if;
  insert into planfact.vor_imports(company_id, project_id, profile_id, file_name, file_sha256, sheet_name, totals)
  values (v_company, p_project, p_profile, v_file, p_sha256, v_sheet, coalesce(p_totals, '{}'::jsonb))
  returning id into v_id;
  perform planfact.log_admin_change(v_company, p_project, 'vor_imports', v_id, 'INSERT', null,
    jsonb_build_object('file_name', v_file, 'sheet_name', v_sheet, 'status', 'draft'));
  return v_id;
end $$;

-- Порция строк (≤ 1 000 за вызов, ≤ 10 000 на загрузку). Материал связывается с работой по parent_row_no (работа — раньше в файле).
create or replace function public.pf_vor_add_rows(p_import uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_i planfact.vor_imports; v_n int; v_total int;
begin
  v_i := planfact.require_vor_draft(p_import);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Ожидается массив строк' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_rows);
  if v_n = 0 then return 0; end if;
  if v_n > 1000 then raise exception 'Не более 1 000 строк за один вызов' using errcode = '22023'; end if;
  if v_i.row_count + v_n > 10000 then raise exception 'Не более 10 000 строк в одной загрузке' using errcode = '22023'; end if;
  insert into planfact.vor_source_rows(import_id, project_id, row_no, kind, number, name, unit_text, qty, norm, prices, context, raw)
  select p_import, v_i.project_id, r.row_no, r.kind, nullif(r.number, ''), coalesce(r.name, ''), nullif(r.unit_text, ''), r.qty, r.norm,
         coalesce(r.prices, '{}'::jsonb), coalesce(r.context, '{}'::jsonb), coalesce(r.raw, '[]'::jsonb)
  from jsonb_to_recordset(p_rows) as r(row_no int, kind text, number text, name text, unit_text text, qty numeric, norm numeric,
                                       prices jsonb, context jsonb, raw jsonb, parent_row_no int);
  update planfact.vor_source_rows s set parent_row_id = w.id
  from jsonb_to_recordset(p_rows) as r(row_no int, parent_row_no int)
  join planfact.vor_source_rows w on w.import_id = p_import and w.row_no = r.parent_row_no and w.kind = 'work'
  where s.import_id = p_import and s.row_no = r.row_no and r.parent_row_no is not null;
  select count(*)::int into v_total from planfact.vor_source_rows where import_id = p_import;
  update planfact.vor_imports set row_count = v_total where id = p_import;
  return v_n;
end $$;

create or replace function public.pf_vor_list_imports(p_project uuid)
returns table(id uuid, file_name text, sheet_name text, status text, row_count int, works int, positions int,
              created_at timestamptz, created_by_email text, confirmed_at timestamptz, profile_id uuid)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_project is null or auth.uid() is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  return query
  select i.id, i.file_name, i.sheet_name, i.status, i.row_count,
         (select count(*)::int from planfact.vor_source_rows s where s.import_id = i.id and s.kind = 'work'),
         (select count(*)::int from planfact.vor_positions p where p.import_id = i.id),
         i.created_at, u.email::text, i.confirmed_at, i.profile_id
  from planfact.vor_imports i left join auth.users u on u.id = i.created_by
  where i.project_id = p_project
  order by i.created_at desc;
end $$;

create or replace function public.pf_vor_import_rows(p_import uuid)
returns table(id uuid, row_no int, kind text, number text, name text, unit_text text, qty numeric, norm numeric, prices jsonb,
              context jsonb, parent_row_no int, location_id uuid, work_type_id uuid, unit_id uuid, match text)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_project uuid;
begin
  select project_id into v_project from planfact.vor_imports where vor_imports.id = p_import;
  if v_project is null or auth.uid() is null or not planfact.is_project_member(v_project) then
    raise exception 'Загрузка не найдена' using errcode = '22023';
  end if;
  return query
  select s.id, s.row_no, s.kind, s.number, s.name, s.unit_text, s.qty, s.norm, s.prices, s.context,
         w.row_no, s.location_id, s.work_type_id, s.unit_id, s.match
  from planfact.vor_source_rows s left join planfact.vor_source_rows w on w.id = s.parent_row_id
  where s.import_id = p_import
  order by s.row_no;
end $$;

-- Удалить черновик (подтверждённый — нельзя).
create or replace function public.pf_vor_delete_import(p_import uuid)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_i planfact.vor_imports;
begin
  v_i := planfact.require_vor_draft(p_import);
  delete from planfact.vor_imports where id = p_import;
  perform planfact.log_admin_change(v_i.company_id, v_i.project_id, 'vor_imports', v_i.id, 'DELETE',
    jsonb_build_object('file_name', v_i.file_name, 'sheet_name', v_i.sheet_name, 'rows', v_i.row_count), null);
end $$;

-- 9. Профили форм (компания проекта)
create or replace function public.pf_vor_list_profiles(p_project uuid)
returns table(id uuid, name text, signature text, column_map jsonb, rules jsonb, updated_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_project is null or auth.uid() is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  return query
  select f.id, f.name, f.signature, f.column_map, f.rules, f.updated_at
  from planfact.vor_profiles f join planfact.projects pr on pr.company_id = f.company_id
  where pr.id = p_project order by f.updated_at desc;
end $$;

-- Сохранить профиль (по подписи шапки: есть — обновить карту колонок, нет — создать). Возвращает id.
create or replace function public.pf_vor_save_profile(p_project uuid, p_name text, p_signature text, p_column_map jsonb,
                                                      p_rules jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_id uuid; v_old planfact.vor_profiles; v_name text := btrim(coalesce(p_name, ''));
begin
  v_company := planfact.require_vor_manage(p_project);
  if v_name = '' then raise exception 'Введите название формы' using errcode = '22023'; end if;
  if coalesce(p_signature, '') = '' or length(p_signature) > 2000 then raise exception 'Неверная подпись шапки' using errcode = '22023'; end if;
  if p_column_map is null or jsonb_typeof(p_column_map) <> 'object' or not (p_column_map ? 'name') then
    raise exception 'В карте колонок нет колонки «Наименование»' using errcode = '22023';
  end if;
  select * into v_old from planfact.vor_profiles where company_id = v_company and signature = p_signature;
  if v_old.id is null then
    insert into planfact.vor_profiles(company_id, name, signature, column_map, rules)
    values (v_company, v_name, p_signature, p_column_map, coalesce(p_rules, '{}'::jsonb)) returning id into v_id;
    perform planfact.log_admin_change(v_company, p_project, 'vor_profiles', v_id, 'INSERT', null,
      jsonb_build_object('name', v_name, 'column_map', p_column_map));
  else
    v_id := v_old.id;
    update planfact.vor_profiles set name = v_name, column_map = p_column_map, rules = coalesce(p_rules, '{}'::jsonb), updated_at = now()
    where id = v_id;
    perform planfact.log_admin_change(v_company, p_project, 'vor_profiles', v_id, 'UPDATE',
      jsonb_build_object('name', v_old.name, 'column_map', v_old.column_map), jsonb_build_object('name', v_name, 'column_map', p_column_map));
  end if;
  return v_id;
end $$;

-- 10. Виды работ и словарь (компания проекта)
create or replace function public.pf_vor_list_work_types(p_project uuid)
returns table(id uuid, code text, name text, unit_id uuid, unit_code text)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_project is null or auth.uid() is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  return query
  select w.id, w.code, w.name, w.unit_id, u.code
  from planfact.work_types w join planfact.projects pr on pr.company_id = w.company_id
  left join planfact.units u on u.id = w.unit_id
  where pr.id = p_project and w.deleted_at is null
  order by w.name;
end $$;

create or replace function public.pf_vor_add_work_type(p_project uuid, p_name text, p_unit uuid, p_code text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_id uuid; v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
        v_code text := nullif(btrim(coalesce(p_code, '')), '');
begin
  v_company := planfact.require_vor_manage(p_project);
  if v_name = '' then raise exception 'Введите наименование вида работ' using errcode = '22023'; end if;
  if length(v_name) > 500 then raise exception 'Слишком длинное наименование' using errcode = '22023'; end if;
  if p_unit is not null and not planfact.unit_allowed(p_unit, v_company) then raise exception 'Единица измерения не найдена' using errcode = '22023'; end if;
  if exists (select 1 from planfact.work_types where company_id = v_company and deleted_at is null
             and canon_name = planfact.canon_name(v_name) and unit_id is not distinct from p_unit) then
    raise exception 'Такой вид работ уже есть' using errcode = '23505';
  end if;
  insert into planfact.work_types(company_id, code, name, canon_name, unit_id)
  values (v_company, v_code, v_name, planfact.canon_name(v_name), p_unit) returning id into v_id;
  perform planfact.log_admin_change(v_company, p_project, 'work_types', v_id, 'INSERT', null,
    jsonb_build_object('name', v_name, 'unit_id', p_unit, 'code', v_code));
  return v_id;
end $$;

-- Пачка видов работ [{name, unit_id}] ≤ 1 000 (разбор 🔴 «Создать для всех»): есть такой (canon_name + ЕИ) — его id, нет — создаётся.
-- Возвращает [{name, unit_id, id, created}] в порядке входа.
create or replace function public.pf_vor_add_work_types(p_project uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; r record; v_id uuid; v_name text; v_out jsonb := '[]'::jsonb; v_new boolean;
begin
  v_company := planfact.require_vor_manage(p_project);
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Ожидается массив' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) > 1000 then raise exception 'Не более 1 000 видов работ за один вызов' using errcode = '22023'; end if;
  for r in select e.j ->> 'name' as name, nullif(e.j ->> 'unit_id', '')::uuid as unit_id, e.ord from jsonb_array_elements(p_items) with ordinality as e(j, ord) order by e.ord loop
    v_name := btrim(regexp_replace(coalesce(r.name, ''), '\s+', ' ', 'g'));
    if v_name = '' or length(v_name) > 500 then raise exception 'Пустое или слишком длинное наименование вида работ' using errcode = '22023'; end if;
    if r.unit_id is not null and not planfact.unit_allowed(r.unit_id, v_company) then raise exception 'Единица измерения не найдена' using errcode = '22023'; end if;
    select id into v_id from planfact.work_types where company_id = v_company and deleted_at is null
      and canon_name = planfact.canon_name(v_name) and unit_id is not distinct from r.unit_id;
    v_new := v_id is null;
    if v_new then
      insert into planfact.work_types(company_id, name, canon_name, unit_id) values (v_company, v_name, planfact.canon_name(v_name), r.unit_id)
      returning id into v_id;
      perform planfact.log_admin_change(v_company, p_project, 'work_types', v_id, 'INSERT', null, jsonb_build_object('name', v_name, 'unit_id', r.unit_id));
    end if;
    v_out := v_out || jsonb_build_object('name', v_name, 'unit_id', r.unit_id, 'id', v_id, 'created', v_new);
  end loop;
  return v_out;
end $$;

create or replace function public.pf_vor_dictionary(p_project uuid)
returns table(canon_name text, unit_text text, work_type_id uuid, hits int)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_project is null or auth.uid() is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  return query
  select d.canon_name, d.unit_text, d.work_type_id, d.hits
  from planfact.vor_dictionary d join planfact.projects pr on pr.company_id = d.company_id
  join planfact.work_types w on w.id = d.work_type_id and w.deleted_at is null
  where pr.id = p_project;
end $$;

-- Подтверждения ПТО → словарь компании: [{name, unit_text, work_type_id}], ≤ 1 000. Возвращает число записей.
create or replace function public.pf_vor_learn(p_project uuid, p_items jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_n int; r record; v_id uuid; v_old uuid;
begin
  v_company := planfact.require_vor_manage(p_project);
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Ожидается массив' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_items);
  if v_n > 1000 then raise exception 'Не более 1 000 записей за один вызов' using errcode = '22023'; end if;
  for r in select distinct on (planfact.canon_name(x.name), lower(btrim(coalesce(x.unit_text, ''))))
             planfact.canon_name(x.name) as canon, lower(btrim(coalesce(x.unit_text, ''))) as unit_text, x.work_type_id
           from jsonb_to_recordset(p_items) as x(name text, unit_text text, work_type_id uuid)
           where btrim(coalesce(x.name, '')) <> ''
  loop
    if not exists (select 1 from planfact.work_types where id = r.work_type_id and company_id = v_company and deleted_at is null) then
      raise exception 'Вид работ не найден' using errcode = '22023';
    end if;
    select id, work_type_id into v_id, v_old from planfact.vor_dictionary where company_id = v_company and canon_name = r.canon and unit_text = r.unit_text;
    if v_id is null then
      insert into planfact.vor_dictionary(company_id, canon_name, unit_text, work_type_id) values (v_company, r.canon, r.unit_text, r.work_type_id)
      returning id into v_id;
      perform planfact.log_admin_change(v_company, p_project, 'vor_dictionary', v_id, 'INSERT', null,
        jsonb_build_object('name', r.canon, 'unit_text', r.unit_text, 'work_type_id', r.work_type_id));
    else
      update planfact.vor_dictionary set work_type_id = r.work_type_id, hits = hits + 1, confirmed_by = auth.uid(), confirmed_at = now() where id = v_id;
      if v_old <> r.work_type_id then
        perform planfact.log_admin_change(v_company, p_project, 'vor_dictionary', v_id, 'UPDATE',
          jsonb_build_object('work_type_id', v_old), jsonb_build_object('work_type_id', r.work_type_id));
      end if;
    end if;
  end loop;
  return v_n;
end $$;

-- 11. Решения ПТО по строкам черновика: [{row_no, location_id, work_type_id, unit_id, match}], ≤ 1 000.
create or replace function public.pf_vor_resolve_rows(p_import uuid, p_items jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_i planfact.vor_imports; v_n int; v_bad int;
begin
  v_i := planfact.require_vor_draft(p_import);
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Ожидается массив' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_items);
  if v_n > 1000 then raise exception 'Не более 1 000 строк за один вызов' using errcode = '22023'; end if;
  select count(*) into v_bad from jsonb_to_recordset(p_items) as x(row_no int, location_id uuid, work_type_id uuid, unit_id uuid, match text)
  where (x.location_id is not null and not exists (select 1 from planfact.locations l where l.id = x.location_id and l.project_id = v_i.project_id and l.deleted_at is null))
     or (x.work_type_id is not null and not exists (select 1 from planfact.work_types w where w.id = x.work_type_id and w.company_id = v_i.company_id and w.deleted_at is null))
     or (x.unit_id is not null and not planfact.unit_allowed(x.unit_id, v_i.company_id))
     or (x.match is not null and x.match not in ('green', 'yellow', 'red'));
  if v_bad > 0 then raise exception 'Место, вид работ или ЕИ не из этого проекта/компании' using errcode = '22023'; end if;
  update planfact.vor_source_rows s set location_id = x.location_id, work_type_id = x.work_type_id, unit_id = x.unit_id, match = x.match
  from jsonb_to_recordset(p_items) as x(row_no int, location_id uuid, work_type_id uuid, unit_id uuid, match text)
  where s.import_id = p_import and s.row_no = x.row_no;
  return v_n;
end $$;

-- 12. Подтверждение: позиции 1:1 из строк-работ + связки; Σ позиций = объём строки; дальше загрузка неизменяема.
-- Пометка позиции: диапазон этажей («эт. 4–12» — позиция на секции) и список квартир («кв. 3, 16…» — на ближайшем узле).
create or replace function public.pf_vor_confirm(p_import uuid)
returns int language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_i planfact.vor_imports; v_open int; v_n int; v_diff int; r record; v_pos uuid;
begin
  v_i := planfact.require_vor_draft(p_import);
  select count(*) into v_open from planfact.vor_source_rows
  where import_id = p_import and kind = 'work'
    and (location_id is null or work_type_id is null or unit_id is null or qty is null or qty < 0 or match is distinct from 'green');
  if v_open > 0 then
    raise exception 'Не разобрано строк-работ: % (место, вид работ, ЕИ, объём или неподтверждённый цвет)', v_open using errcode = '22023';
  end if;
  select count(*) into v_n from planfact.vor_source_rows where import_id = p_import and kind = 'work';
  if v_n = 0 then raise exception 'В загрузке нет строк-работ' using errcode = '22023'; end if;
  for r in select * from planfact.vor_source_rows where import_id = p_import and kind = 'work' order by row_no loop
    insert into planfact.vor_positions(company_id, project_id, import_id, location_id, work_type_id, unit_id, qty, apartments_note, status)
    values (v_i.company_id, v_i.project_id, p_import, r.location_id, r.work_type_id, r.unit_id, r.qty,
            nullif(concat_ws(' · ',
              case when (r.context -> 'floor' ->> 'from') is distinct from (r.context -> 'floor' ->> 'to')
                   then 'эт. ' || (r.context -> 'floor' ->> 'from') || '–' || (r.context -> 'floor' ->> 'to') end,
              nullif(r.context ->> 'apartments', '')), ''),
            'confirmed')
    returning id into v_pos;
    insert into planfact.vor_links(project_id, source_row_id, position_id, share) values (v_i.project_id, r.id, v_pos, 1);
  end loop;
  select count(*) into v_diff from planfact.vor_source_rows s
  where s.import_id = p_import and s.kind = 'work'
    and s.qty is distinct from (select sum(p.qty * l.share) from planfact.vor_links l join planfact.vor_positions p on p.id = l.position_id
                                where l.source_row_id = s.id);
  if v_diff > 0 then raise exception 'Сумма позиций не сходится с объёмом строки заказчика: % строк', v_diff using errcode = '22023'; end if;
  update planfact.vor_imports set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_import;
  perform planfact.log_admin_change(v_i.company_id, v_i.project_id, 'vor_imports', v_i.id, 'UPDATE',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'confirmed', 'positions', v_n, 'file_name', v_i.file_name));
  return v_n;
end $$;

-- 13. Позиции проекта (только чтение для членов проекта), с полным путём места; p_location — узел и его потомки.
create or replace function public.pf_vor_positions(p_project uuid, p_location uuid default null)
returns table(id uuid, location_id uuid, location_path text, work_type_id uuid, work_type text, unit_code text, qty numeric,
              apartments_note text, import_id uuid, file_name text, source_row_no int)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_project is null or auth.uid() is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  return query
  with recursive sub(id) as (
    select l.id from planfact.locations l where l.id = p_location and l.project_id = p_project
    union all
    select c.id from planfact.locations c join sub on c.parent_id = sub.id where c.deleted_at is null
  )
  select p.id, p.location_id, planfact.location_path(p.location_id), p.work_type_id, w.name, u.code, p.qty, p.apartments_note,
         p.import_id, i.file_name, (select min(s.row_no) from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id where l.position_id = p.id)
  from planfact.vor_positions p
  join planfact.work_types w on w.id = p.work_type_id
  join planfact.units u on u.id = p.unit_id
  join planfact.vor_imports i on i.id = p.import_id
  where p.project_id = p_project and (p_location is null or p.location_id in (select sub.id from sub))
  order by planfact.location_path(p.location_id), w.name, p.id;
end $$;

-- 14. Журнал компании: + загрузки ВОР, профили, виды работ, словарь (тело как в 006 + фильтр table_name)
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
  where a.company_id = p_company and a.table_name in ('company_roles', 'role_assignments', 'projects', 'locations', 'units',
                                                       'vor_imports', 'vor_profiles', 'work_types', 'vor_dictionary')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- 15. Права на выполнение
revoke all on function planfact.vor_guard_confirmed(), planfact.require_vor_manage(uuid), planfact.require_vor_draft(uuid),
  planfact.unit_allowed(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pf_vor_create_import(uuid, text, text, text, uuid, jsonb), public.pf_vor_add_rows(uuid, jsonb),
  public.pf_vor_list_imports(uuid), public.pf_vor_import_rows(uuid), public.pf_vor_delete_import(uuid),
  public.pf_vor_list_profiles(uuid), public.pf_vor_save_profile(uuid, text, text, jsonb, jsonb),
  public.pf_vor_list_work_types(uuid), public.pf_vor_add_work_type(uuid, text, uuid, text), public.pf_vor_add_work_types(uuid, jsonb), public.pf_vor_dictionary(uuid),
  public.pf_vor_learn(uuid, jsonb), public.pf_vor_resolve_rows(uuid, jsonb), public.pf_vor_confirm(uuid),
  public.pf_vor_positions(uuid, uuid), public.pf_list_company_audit(uuid, int)
  from public, anon;
grant execute on function public.pf_vor_create_import(uuid, text, text, text, uuid, jsonb), public.pf_vor_add_rows(uuid, jsonb),
  public.pf_vor_list_imports(uuid), public.pf_vor_import_rows(uuid), public.pf_vor_delete_import(uuid),
  public.pf_vor_list_profiles(uuid), public.pf_vor_save_profile(uuid, text, text, jsonb, jsonb),
  public.pf_vor_list_work_types(uuid), public.pf_vor_add_work_type(uuid, text, uuid, text), public.pf_vor_add_work_types(uuid, jsonb), public.pf_vor_dictionary(uuid),
  public.pf_vor_learn(uuid, jsonb), public.pf_vor_resolve_rows(uuid, jsonb), public.pf_vor_confirm(uuid),
  public.pf_vor_positions(uuid, uuid), public.pf_list_company_audit(uuid, int)
  to authenticated;
