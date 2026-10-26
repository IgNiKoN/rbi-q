-- P2-0016 этап 1 (ADR-068). Хранилище Качества и Стройконтроля по компаниям: раздел `quality`.
-- СГЕНЕРИРОВАНО scripts/gen-quality-schema.mjs из снимка сервера 2026-10-23 — не править руками.
-- 55 таблиц: структура как у public.<таблица> (без политик, триггеров и данных RBI) + core_company_id (компания ядра)
-- и core_project_id (объект ядра). Компания записи: объект ядра из project_code или заголовок «текущая компания» (x-company-id),
-- только если пользователь в ней состоит. RLS на каждой таблице: право модуля в компании; anon — ничего.
-- Объекты RBI (public.*, бакеты) не затрагивает. Применять после 017a, одним запросом. Откат — 018_quality_down.sql.
begin;

do $$
begin
  if to_regnamespace('quality') is not null then
    raise exception 'Раздел quality уже есть — 018 применена (повтор — только после 018_quality_down.sql)' using errcode = 'P0001';
  end if;
end $$;

create schema quality;
grant usage on schema quality to authenticated;

-- 1. Модули Качество и Стройконтроль — управляемые (включаются у компании), права модулей.
update core.module_catalog set managed = true where code in ('quality', 'construction');
insert into core.permission_catalog(action, description) values
  ('quality.view', 'Качество: просмотр'),
  ('quality.edit', 'Качество: проверки, задачи, отчёты'),
  ('quality.manage', 'Качество: настройки, справочники, роли'),
  ('construction.view', 'Стройконтроль: просмотр'),
  ('construction.edit', 'Стройконтроль: замечания, приёмка'),
  ('construction.manage', 'Стройконтроль: настройки, справочники')
on conflict (action) do nothing;
insert into core.role_template_permissions(template_code, action)
select t, a from (values
  ('company_admin', 'quality.view'), ('company_admin', 'quality.edit'), ('company_admin', 'quality.manage'),
  ('company_admin', 'construction.view'), ('company_admin', 'construction.edit'), ('company_admin', 'construction.manage'),
  ('project_manager', 'quality.view'), ('project_manager', 'quality.edit'), ('project_manager', 'quality.manage'),
  ('project_manager', 'construction.view'), ('project_manager', 'construction.edit'), ('project_manager', 'construction.manage'),
  ('qc_engineer', 'quality.view'), ('qc_engineer', 'quality.edit'), ('qc_engineer', 'construction.view'), ('qc_engineer', 'construction.edit'),
  ('foreman', 'quality.view'), ('foreman', 'construction.view'), ('foreman', 'construction.edit'),
  ('contractor_rep', 'quality.view'), ('contractor_rep', 'construction.view'), ('contractor_rep', 'construction.edit'),
  ('pto', 'quality.view'), ('pto', 'construction.view'),
  ('management', 'quality.view'), ('management', 'construction.view'),
  ('customer', 'quality.view'), ('customer', 'construction.view')
) v(t, a)
on conflict do nothing;
insert into core.company_role_permissions(role_id, company_id, action)
select r.id, r.company_id, tp.action
from core.company_roles r join core.role_template_permissions tp on tp.template_code = r.template_code
where tp.action like 'quality.%' or tp.action like 'construction.%'
on conflict do nothing;

-- 2. Текущая компания запроса: заголовок x-company-id, только если пользователь в ней состоит (или администратор платформы).
create or replace function quality.request_company()
returns uuid language plpgsql stable security definer set search_path = pg_catalog, core, planfact as $$
declare v text := nullif(btrim(coalesce(current_setting('request.headers', true), '')::text), '');
begin
  if v is null or auth.uid() is null then return null; end if;
  v := (v::json) ->> 'x-company-id';
  if v is null or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  if not planfact.is_company_member(v::uuid) then return null; end if;
  return v::uuid;
end $$;

-- 3. Право: компания = текущая компания запроса, модуль включён у компании, у пользователя есть действие
--    (назначение на всю компанию или на этот объект; для записей без объекта — любое действующее назначение в компании).
create or replace function quality.can(p_company uuid, p_project uuid, p_actions text[])
returns boolean language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  select p_company is not null and p_company = quality.request_company() and exists (
    select 1 from unnest(p_actions) act
    join core.permission_catalog pc on pc.action = act
    join core.company_modules cm on cm.company_id = p_company and cm.module = split_part(act, '.', 1) and cm.enabled
    where planfact.is_platform_admin() or exists (
      select 1 from core.role_assignments a
      join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = act
      where a.company_id = p_company and a.user_id = auth.uid()
        and (p_project is null or a.project_id is null or a.project_id = p_project)
        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())));
$$;

-- 4. Привязка записи к компании и объекту (до вставки/изменения). Аргументы: класс таблицы, есть ли project_code.
create or replace function quality.bind_company()
returns trigger language plpgsql security definer set search_path = pg_catalog, core as $$
declare
  v_pc text;
  v_proj core.projects;
begin
  if tg_op = 'UPDATE' and new.core_company_id is distinct from old.core_company_id then
    raise exception 'Компанию записи менять нельзя' using errcode = '42501';
  end if;
  if tg_argv[1] = '1' then
    v_pc := to_jsonb(new) ->> 'project_code';
    if v_pc ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select * into v_proj from core.projects where id = v_pc::uuid;
    end if;
  end if;
  if v_proj.id is null and tg_argv[0] = 'project' then
    raise exception 'Объект не найден: выберите объект из «Объектов» компании' using errcode = '42501';
  end if;
  if v_proj.id is not null then
    new.core_project_id := v_proj.id;
    new.core_company_id := coalesce(new.core_company_id, v_proj.company_id);
  else
    new.core_project_id := null;
    new.core_company_id := coalesce(new.core_company_id, quality.request_company());
  end if;
  if new.core_company_id is null then
    raise exception 'Не выбрана компания' using errcode = '42501';
  end if;
  if tg_table_name = 'rbi_company_settings' then
    new.company_id := new.core_company_id::text;  -- настройки — одна строка на компанию
  end if;
  return new;
end $$;

-- 5. Таблицы
create table if not exists quality.allowed_projects (
  code text not null,
  title text,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  name text,
  updated_at timestamp with time zone default now(),
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.allowed_projects add constraint allowed_projects_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.allowed_projects add constraint allowed_projects_pkey PRIMARY KEY (code);
create index if not exists allowed_projects_core_company_idx on quality.allowed_projects (core_company_id, core_project_id);
create trigger allowed_projects_bind_company before insert or update on quality.allowed_projects
  for each row execute function quality.bind_company('company', '0');
alter table quality.allowed_projects enable row level security;
create policy allowed_projects_select on quality.allowed_projects for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy allowed_projects_insert on quality.allowed_projects for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'));
create policy allowed_projects_update on quality.allowed_projects for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'));
create policy allowed_projects_delete on quality.allowed_projects for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'));
grant select, insert, update, delete on quality.allowed_projects to authenticated;

create table if not exists quality.app_assistant_kb (
  id text not null,
  project_code text not null,
  question text not null,
  answer text not null,
  tags text[],
  enabled boolean default true,
  created_by text not null,
  is_deleted boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  deleted_at timestamp with time zone,
  created_by_name text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.app_assistant_kb add constraint app_assistant_kb_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.app_assistant_kb add constraint app_assistant_kb_pkey PRIMARY KEY (id);
CREATE INDEX idx_assistant_question_fts ON quality.app_assistant_kb USING gin (to_tsvector('russian'::regconfig, question));
CREATE INDEX idx_assistant_tags ON quality.app_assistant_kb USING gin (tags);
create index if not exists app_assistant_kb_core_company_idx on quality.app_assistant_kb (core_company_id, core_project_id);
create trigger app_assistant_kb_bind_company before insert or update on quality.app_assistant_kb
  for each row execute function quality.bind_company('company', '1');
alter table quality.app_assistant_kb enable row level security;
create policy app_assistant_kb_select on quality.app_assistant_kb for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy app_assistant_kb_insert on quality.app_assistant_kb for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy app_assistant_kb_update on quality.app_assistant_kb for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy app_assistant_kb_delete on quality.app_assistant_kb for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.app_assistant_kb to authenticated;

create table if not exists quality.construction_acceptance (
  id text not null,
  project_code text not null,
  object_id text,
  floor_id text,
  zone jsonb,
  template_key text,
  work_type text,
  location text,
  section text,
  floor text,
  room text,
  volume text,
  requested_date timestamp with time zone,
  requested_time text,
  contractor text,
  status text default 'pending'::text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  sync_status text,
  "contractorId" text,
  "projectId" text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.construction_acceptance add constraint construction_acceptance_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.construction_acceptance add constraint construction_acceptance_pkey PRIMARY KEY (id);
create index if not exists construction_acceptance_core_company_idx on quality.construction_acceptance (core_company_id, core_project_id);
create trigger construction_acceptance_bind_company before insert or update on quality.construction_acceptance
  for each row execute function quality.bind_company('company', '1');
alter table quality.construction_acceptance enable row level security;
create policy construction_acceptance_select on quality.construction_acceptance for select to authenticated using (quality.can(core_company_id, core_project_id, '{construction.view}'));
create policy construction_acceptance_insert on quality.construction_acceptance for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_acceptance_update on quality.construction_acceptance for update to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_acceptance_delete on quality.construction_acceptance for delete to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'));
grant select, insert, update, delete on quality.construction_acceptance to authenticated;

create table if not exists quality.construction_acceptance_v2 (
  id text not null,
  "companyId" text default 'rbi'::text not null,
  "locationId" text,
  zone jsonb,
  template_key text,
  work_type text,
  volume text,
  requested_date date,
  requested_time text,
  "contractorId" text,
  status text,
  created_by text,
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  version integer default 1 not null,
  checklist_results jsonb,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.construction_acceptance_v2 add constraint construction_acceptance_v2_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.construction_acceptance_v2 add constraint construction_acceptance_v2_pkey PRIMARY KEY (id);
create index if not exists construction_acceptance_v2_core_company_idx on quality.construction_acceptance_v2 (core_company_id, core_project_id);
create trigger construction_acceptance_v2_bind_company before insert or update on quality.construction_acceptance_v2
  for each row execute function quality.bind_company('company', '0');
alter table quality.construction_acceptance_v2 enable row level security;
create policy construction_acceptance_v2_select on quality.construction_acceptance_v2 for select to authenticated using (quality.can(core_company_id, core_project_id, '{construction.view}'));
create policy construction_acceptance_v2_insert on quality.construction_acceptance_v2 for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_acceptance_v2_update on quality.construction_acceptance_v2 for update to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_acceptance_v2_delete on quality.construction_acceptance_v2 for delete to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'));
grant select, insert, update, delete on quality.construction_acceptance_v2 to authenticated;

create table if not exists quality.construction_buildings (
  id text not null,
  project_code text,
  object_id text,
  name text not null,
  sort_order integer default 0,
  owner text,
  created_by text,
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by_name text,
  data jsonb,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.construction_buildings add constraint construction_buildings_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.construction_buildings add constraint construction_buildings_pkey PRIMARY KEY (id);
create index if not exists construction_buildings_core_company_idx on quality.construction_buildings (core_company_id, core_project_id);
create trigger construction_buildings_bind_company before insert or update on quality.construction_buildings
  for each row execute function quality.bind_company('company', '1');
alter table quality.construction_buildings enable row level security;
create policy construction_buildings_select on quality.construction_buildings for select to authenticated using (quality.can(core_company_id, core_project_id, '{construction.view}'));
create policy construction_buildings_insert on quality.construction_buildings for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_buildings_update on quality.construction_buildings for update to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_buildings_delete on quality.construction_buildings for delete to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'));
grant select, insert, update, delete on quality.construction_buildings to authenticated;

create table if not exists quality.construction_defects (
  id text not null,
  project_code text not null,
  floor_id text,
  x numeric,
  y numeric,
  template_key text,
  item_id text,
  item_name text,
  norm_text text,
  text text,
  category text,
  deadline timestamp with time zone,
  contractor text,
  description text,
  photo text,
  status text default 'issued'::text,
  history jsonb default '[]'::jsonb,
  created_by text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  sync_status text,
  "contractorId" text,
  "projectId" text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.construction_defects add constraint construction_defects_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.construction_defects add constraint construction_defects_pkey PRIMARY KEY (id);
create index if not exists construction_defects_core_company_idx on quality.construction_defects (core_company_id, core_project_id);
create trigger construction_defects_bind_company before insert or update on quality.construction_defects
  for each row execute function quality.bind_company('project', '1');
alter table quality.construction_defects enable row level security;
create policy construction_defects_select on quality.construction_defects for select to authenticated using (quality.can(core_company_id, core_project_id, '{construction.view}'));
create policy construction_defects_insert on quality.construction_defects for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_defects_update on quality.construction_defects for update to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_defects_delete on quality.construction_defects for delete to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'));
grant select, insert, update, delete on quality.construction_defects to authenticated;

create table if not exists quality.construction_defects_v2 (
  id text not null,
  "companyId" text default 'rbi'::text not null,
  "locationId" text,
  x numeric,
  y numeric,
  template_key text,
  item_id text,
  item_name text,
  norm_text text,
  text text,
  category text,
  deadline timestamp with time zone,
  "contractorId" text,
  description text,
  photo text,
  status text,
  history jsonb,
  created_by text,
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  version integer default 1 not null,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.construction_defects_v2 add constraint construction_defects_v2_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.construction_defects_v2 add constraint construction_defects_v2_pkey PRIMARY KEY (id);
create index if not exists construction_defects_v2_core_company_idx on quality.construction_defects_v2 (core_company_id, core_project_id);
create trigger construction_defects_v2_bind_company before insert or update on quality.construction_defects_v2
  for each row execute function quality.bind_company('company', '0');
alter table quality.construction_defects_v2 enable row level security;
create policy construction_defects_v2_select on quality.construction_defects_v2 for select to authenticated using (quality.can(core_company_id, core_project_id, '{construction.view}'));
create policy construction_defects_v2_insert on quality.construction_defects_v2 for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_defects_v2_update on quality.construction_defects_v2 for update to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_defects_v2_delete on quality.construction_defects_v2 for delete to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'));
grant select, insert, update, delete on quality.construction_defects_v2 to authenticated;

create table if not exists quality.construction_floors (
  id text not null,
  project_code text,
  building_id text,
  name text not null,
  sort_order integer default 0,
  pdf_url text,
  pdf_name text,
  pdf_size text,
  is_active boolean default true,
  owner text,
  created_by text,
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by_name text,
  data jsonb,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.construction_floors add constraint construction_floors_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.construction_floors add constraint construction_floors_pkey PRIMARY KEY (id);
create index if not exists construction_floors_core_company_idx on quality.construction_floors (core_company_id, core_project_id);
create trigger construction_floors_bind_company before insert or update on quality.construction_floors
  for each row execute function quality.bind_company('company', '1');
alter table quality.construction_floors enable row level security;
create policy construction_floors_select on quality.construction_floors for select to authenticated using (quality.can(core_company_id, core_project_id, '{construction.view}'));
create policy construction_floors_insert on quality.construction_floors for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_floors_update on quality.construction_floors for update to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_floors_delete on quality.construction_floors for delete to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'));
grant select, insert, update, delete on quality.construction_floors to authenticated;

create table if not exists quality.construction_floors_v2 (
  id text not null,
  "companyId" text default 'rbi'::text not null,
  "locationId" text,
  name text,
  sort_order integer,
  pdf_url text,
  pdf_name text,
  pdf_size text,
  is_active boolean default true,
  created_by text,
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  version integer default 1 not null,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.construction_floors_v2 add constraint construction_floors_v2_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.construction_floors_v2 add constraint construction_floors_v2_pkey PRIMARY KEY (id);
CREATE INDEX construction_floors_v2_location_idx ON quality.construction_floors_v2 USING btree ("locationId") WHERE (is_deleted = false);
create index if not exists construction_floors_v2_core_company_idx on quality.construction_floors_v2 (core_company_id, core_project_id);
create trigger construction_floors_v2_bind_company before insert or update on quality.construction_floors_v2
  for each row execute function quality.bind_company('company', '0');
alter table quality.construction_floors_v2 enable row level security;
create policy construction_floors_v2_select on quality.construction_floors_v2 for select to authenticated using (quality.can(core_company_id, core_project_id, '{construction.view}'));
create policy construction_floors_v2_insert on quality.construction_floors_v2 for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_floors_v2_update on quality.construction_floors_v2 for update to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_floors_v2_delete on quality.construction_floors_v2 for delete to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'));
grant select, insert, update, delete on quality.construction_floors_v2 to authenticated;

create table if not exists quality.construction_objects (
  id text not null,
  project_code text,
  name text not null,
  description text,
  owner text,
  created_by text,
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by_name text,
  data jsonb,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.construction_objects add constraint construction_objects_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.construction_objects add constraint construction_objects_pkey PRIMARY KEY (id);
create index if not exists construction_objects_core_company_idx on quality.construction_objects (core_company_id, core_project_id);
create trigger construction_objects_bind_company before insert or update on quality.construction_objects
  for each row execute function quality.bind_company('company', '1');
alter table quality.construction_objects enable row level security;
create policy construction_objects_select on quality.construction_objects for select to authenticated using (quality.can(core_company_id, core_project_id, '{construction.view}'));
create policy construction_objects_insert on quality.construction_objects for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_objects_update on quality.construction_objects for update to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_objects_delete on quality.construction_objects for delete to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'));
grant select, insert, update, delete on quality.construction_objects to authenticated;

create table if not exists quality.construction_units (
  id text not null,
  project_code text not null,
  building_id text,
  floor_id text,
  name text,
  type text,
  sort_order integer default 0,
  status text default 'none'::text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  sync_status text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.construction_units add constraint construction_units_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.construction_units add constraint construction_units_pkey PRIMARY KEY (id);
create index if not exists construction_units_core_company_idx on quality.construction_units (core_company_id, core_project_id);
create trigger construction_units_bind_company before insert or update on quality.construction_units
  for each row execute function quality.bind_company('company', '1');
alter table quality.construction_units enable row level security;
create policy construction_units_select on quality.construction_units for select to authenticated using (quality.can(core_company_id, core_project_id, '{construction.view}'));
create policy construction_units_insert on quality.construction_units for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_units_update on quality.construction_units for update to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_units_delete on quality.construction_units for delete to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'));
grant select, insert, update, delete on quality.construction_units to authenticated;

create table if not exists quality.construction_units_v2 (
  id text not null,
  "companyId" text default 'rbi'::text not null,
  "locationId" text,
  name text,
  type text,
  sort_order integer,
  status text,
  created_by text,
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  version integer default 1 not null,
  pdf_url text,
  pdf_name text,
  pdf_size text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.construction_units_v2 add constraint construction_units_v2_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.construction_units_v2 add constraint construction_units_v2_pkey PRIMARY KEY (id);
create index if not exists construction_units_v2_core_company_idx on quality.construction_units_v2 (core_company_id, core_project_id);
create trigger construction_units_v2_bind_company before insert or update on quality.construction_units_v2
  for each row execute function quality.bind_company('company', '0');
alter table quality.construction_units_v2 enable row level security;
create policy construction_units_v2_select on quality.construction_units_v2 for select to authenticated using (quality.can(core_company_id, core_project_id, '{construction.view}'));
create policy construction_units_v2_insert on quality.construction_units_v2 for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_units_v2_update on quality.construction_units_v2 for update to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy construction_units_v2_delete on quality.construction_units_v2 for delete to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'));
grant select, insert, update, delete on quality.construction_units_v2 to authenticated;

create table if not exists quality.contractor_aliases (
  id uuid default gen_random_uuid() not null,
  project_code text not null,
  raw_name text not null,
  canonical_key text not null,
  created_by text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  deleted_by_auth_user_id uuid,
  created_by_name text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.contractor_aliases add constraint contractor_aliases_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.contractor_aliases add constraint contractor_aliases_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX contractor_aliases_project_code_raw_name_uidx ON quality.contractor_aliases USING btree (project_code, raw_name);
CREATE INDEX idx_contractor_aliases_key ON quality.contractor_aliases USING btree (project_code, canonical_key);
CREATE UNIQUE INDEX idx_contractor_aliases_unique ON quality.contractor_aliases USING btree (project_code, raw_name);
create index if not exists contractor_aliases_core_company_idx on quality.contractor_aliases (core_company_id, core_project_id);
create trigger contractor_aliases_bind_company before insert or update on quality.contractor_aliases
  for each row execute function quality.bind_company('company', '1');
alter table quality.contractor_aliases enable row level security;
create policy contractor_aliases_select on quality.contractor_aliases for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy contractor_aliases_insert on quality.contractor_aliases for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy contractor_aliases_update on quality.contractor_aliases for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy contractor_aliases_delete on quality.contractor_aliases for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
grant select, insert, update, delete on quality.contractor_aliases to authenticated;

create table if not exists quality.contractor_directory (
  id uuid default gen_random_uuid() not null,
  project_code text not null,
  canonical_key text not null,
  display_name text not null,
  synonyms text[] default '{}'::text[],
  inn text,
  created_by text,
  is_deleted boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  deleted_at timestamp with time zone,
  created_by_name text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.contractor_directory add constraint contractor_directory_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.contractor_directory add constraint contractor_directory_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX contractor_directory_project_code_canonical_key_uidx ON quality.contractor_directory USING btree (project_code, canonical_key);
CREATE UNIQUE INDEX idx_contractor_directory_key ON quality.contractor_directory USING btree (project_code, canonical_key) WHERE (is_deleted = false);
CREATE INDEX idx_contractor_directory_project ON quality.contractor_directory USING btree (project_code);
create index if not exists contractor_directory_core_company_idx on quality.contractor_directory (core_company_id, core_project_id);
create trigger contractor_directory_bind_company before insert or update on quality.contractor_directory
  for each row execute function quality.bind_company('company', '1');
alter table quality.contractor_directory enable row level security;
create policy contractor_directory_select on quality.contractor_directory for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy contractor_directory_insert on quality.contractor_directory for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy contractor_directory_update on quality.contractor_directory for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy contractor_directory_delete on quality.contractor_directory for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
grant select, insert, update, delete on quality.contractor_directory to authenticated;

create table if not exists quality.contractor_normalization_queue (
  id uuid default gen_random_uuid() not null,
  project_code text not null,
  raw_name text not null,
  cleaned_name text,
  suggested_canonical_key text,
  source_table text,
  source_record_id text,
  created_by text,
  status text default 'pending'::text,
  admin_comment text default ''::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  deleted_by_auth_user_id uuid,
  created_by_name text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.contractor_normalization_queue add constraint contractor_normalization_queue_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.contractor_normalization_queue add constraint contractor_normalization_queue_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX contractor_queue_project_code_raw_name_uidx ON quality.contractor_normalization_queue USING btree (project_code, raw_name);
CREATE UNIQUE INDEX idx_contractor_queue_project_raw_name ON quality.contractor_normalization_queue USING btree (project_code, raw_name);
CREATE INDEX idx_contractor_queue_project_status ON quality.contractor_normalization_queue USING btree (project_code, status);
create index if not exists contractor_normalization_queue_core_company_idx on quality.contractor_normalization_queue (core_company_id, core_project_id);
create trigger contractor_normalization_queue_bind_company before insert or update on quality.contractor_normalization_queue
  for each row execute function quality.bind_company('company', '1');
alter table quality.contractor_normalization_queue enable row level security;
create policy contractor_normalization_queue_select on quality.contractor_normalization_queue for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy contractor_normalization_queue_insert on quality.contractor_normalization_queue for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy contractor_normalization_queue_update on quality.contractor_normalization_queue for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy contractor_normalization_queue_delete on quality.contractor_normalization_queue for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
grant select, insert, update, delete on quality.contractor_normalization_queue to authenticated;

create table if not exists quality.contractors (
  id text not null,
  "companyId" text default 'rbi'::text not null,
  "locationId" text,
  canonical_key text,
  "displayName" text,
  synonyms jsonb,
  inn text,
  created_by text,
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  version integer default 1 not null,
  legal_name text,
  legal_form text,
  legal_address text,
  contact_person text,
  contact_phone text,
  contact_email text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.contractors add constraint contractors_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.contractors add constraint contractors_pkey PRIMARY KEY (id);
create index if not exists contractors_core_company_idx on quality.contractors (core_company_id, core_project_id);
create trigger contractors_bind_company before insert or update on quality.contractors
  for each row execute function quality.bind_company('company', '0');
alter table quality.contractors enable row level security;
create policy contractors_select on quality.contractors for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy contractors_insert on quality.contractors for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy contractors_update on quality.contractors for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy contractors_delete on quality.contractors for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
grant select, insert, update, delete on quality.contractors to authenticated;

create table if not exists quality.contracts (
  id text not null,
  "companyId" text default 'rbi'::text not null,
  "contractorId" text not null,
  contract_number text,
  contract_date date,
  work_type text,
  status text,
  created_by text,
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  version integer default 1 not null,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.contracts add constraint contracts_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.contracts add constraint contracts_pkey PRIMARY KEY (id);
create index if not exists contracts_core_company_idx on quality.contracts (core_company_id, core_project_id);
create trigger contracts_bind_company before insert or update on quality.contracts
  for each row execute function quality.bind_company('company', '0');
alter table quality.contracts enable row level security;
create policy contracts_select on quality.contracts for select to authenticated using (quality.can(core_company_id, core_project_id, '{construction.view}'));
create policy contracts_insert on quality.contracts for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy contracts_update on quality.contracts for update to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy contracts_delete on quality.contracts for delete to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'));
grant select, insert, update, delete on quality.contracts to authenticated;

create table if not exists quality.file_registry (
  id uuid default gen_random_uuid() not null,
  project_code text not null,
  entity_type text not null,
  entity_id text not null,
  field_path text,
  bucket text not null,
  storage_path text not null,
  public_url text,
  original_name text,
  mime_type text,
  size_bytes bigint,
  uploaded_by text,
  uploaded_at timestamp with time zone default now(),
  cache_policy text default 'auto'::text,
  cache_status text default 'cloud_only'::text,
  is_deleted boolean default false,
  last_accessed_at timestamp with time zone,
  last_local_cached_at timestamp with time zone,
  last_local_cleanup_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.file_registry add constraint file_registry_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.file_registry add constraint file_registry_bucket_storage_path_key UNIQUE (bucket, storage_path);
alter table quality.file_registry add constraint file_registry_cache_policy_check CHECK ((cache_policy = ANY (ARRAY['auto'::text, 'prefer_offline'::text, 'cloud_only'::text])));
alter table quality.file_registry add constraint file_registry_cache_status_check CHECK ((cache_status = ANY (ARRAY['local_only'::text, 'cached_cloud'::text, 'cloud_only'::text])));
alter table quality.file_registry add constraint file_registry_pkey PRIMARY KEY (id);
CREATE INDEX idx_file_registry_cache_status ON quality.file_registry USING btree (cache_status);
CREATE INDEX idx_file_registry_entity ON quality.file_registry USING btree (entity_type, entity_id);
CREATE INDEX idx_file_registry_is_deleted ON quality.file_registry USING btree (is_deleted);
CREATE INDEX idx_file_registry_last_accessed ON quality.file_registry USING btree (last_accessed_at);
CREATE INDEX idx_file_registry_project ON quality.file_registry USING btree (project_code);
CREATE INDEX idx_file_registry_storage_path ON quality.file_registry USING btree (bucket, storage_path);
create index if not exists file_registry_core_company_idx on quality.file_registry (core_company_id, core_project_id);
create trigger file_registry_bind_company before insert or update on quality.file_registry
  for each row execute function quality.bind_company('company', '1');
alter table quality.file_registry enable row level security;
create policy file_registry_select on quality.file_registry for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy file_registry_insert on quality.file_registry for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy file_registry_update on quality.file_registry for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy file_registry_delete on quality.file_registry for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
grant select, insert, update, delete on quality.file_registry to authenticated;

create table if not exists quality.location_node_aliases (
  id text not null,
  "companyId" text default 'rbi'::text not null,
  raw_name text,
  "locationId" text,
  created_by text,
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  version integer default 1 not null,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.location_node_aliases add constraint location_node_aliases_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.location_node_aliases add constraint location_node_aliases_pkey PRIMARY KEY (id);
create index if not exists location_node_aliases_core_company_idx on quality.location_node_aliases (core_company_id, core_project_id);
create trigger location_node_aliases_bind_company before insert or update on quality.location_node_aliases
  for each row execute function quality.bind_company('company', '0');
alter table quality.location_node_aliases enable row level security;
create policy location_node_aliases_select on quality.location_node_aliases for select to authenticated using (quality.can(core_company_id, core_project_id, '{construction.view}'));
create policy location_node_aliases_insert on quality.location_node_aliases for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy location_node_aliases_update on quality.location_node_aliases for update to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy location_node_aliases_delete on quality.location_node_aliases for delete to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'));
grant select, insert, update, delete on quality.location_node_aliases to authenticated;

create table if not exists quality.location_nodes (
  id text not null,
  "companyId" text default 'rbi'::text not null,
  canonical_key text,
  "displayName" text,
  synonyms jsonb,
  "parentId" text,
  created_by text,
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  version integer default 1 not null,
  "nodeType" text,
  sort_order integer default 0 not null,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.location_nodes add constraint location_nodes_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.location_nodes add constraint location_nodes_pkey PRIMARY KEY (id);
CREATE INDEX location_nodes_parent_idx ON quality.location_nodes USING btree ("parentId") WHERE (is_deleted = false);
CREATE INDEX location_nodes_type_idx ON quality.location_nodes USING btree ("nodeType") WHERE (is_deleted = false);
create index if not exists location_nodes_core_company_idx on quality.location_nodes (core_company_id, core_project_id);
create trigger location_nodes_bind_company before insert or update on quality.location_nodes
  for each row execute function quality.bind_company('company', '0');
alter table quality.location_nodes enable row level security;
create policy location_nodes_select on quality.location_nodes for select to authenticated using (quality.can(core_company_id, core_project_id, '{construction.view}'));
create policy location_nodes_insert on quality.location_nodes for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy location_nodes_update on quality.location_nodes for update to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{construction.edit}'));
create policy location_nodes_delete on quality.location_nodes for delete to authenticated using (quality.can(core_company_id, core_project_id, '{construction.edit}'));
grant select, insert, update, delete on quality.location_nodes to authenticated;

create table if not exists quality.object_aliases (
  id text default ('alias_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) not null,
  raw_name text not null,
  canonical_key text not null,
  project_code text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by text,
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  deleted_by_auth_user_id uuid,
  created_by_name text,
  sync_status text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.object_aliases add constraint object_aliases_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.object_aliases add constraint object_aliases_pkey PRIMARY KEY (id);
alter table quality.object_aliases add constraint object_aliases_raw_name_key UNIQUE (core_company_id, raw_name);
CREATE INDEX idx_object_aliases_project_key ON quality.object_aliases USING btree (project_code, canonical_key);
CREATE UNIQUE INDEX idx_object_aliases_project_raw ON quality.object_aliases USING btree (project_code, raw_name);
CREATE UNIQUE INDEX idx_object_aliases_unique ON quality.object_aliases USING btree (project_code, raw_name);
create index if not exists object_aliases_core_company_idx on quality.object_aliases (core_company_id, core_project_id);
create trigger object_aliases_bind_company before insert or update on quality.object_aliases
  for each row execute function quality.bind_company('company', '1');
alter table quality.object_aliases enable row level security;
create policy object_aliases_select on quality.object_aliases for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy object_aliases_insert on quality.object_aliases for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy object_aliases_update on quality.object_aliases for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy object_aliases_delete on quality.object_aliases for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
grant select, insert, update, delete on quality.object_aliases to authenticated;

create table if not exists quality.object_normalization_queue (
  id text not null,
  project_code text not null,
  raw_name text not null,
  suggested_canonical_key text,
  source_table text,
  source_record_id text,
  created_by text,
  status text default 'pending'::text,
  admin_comment text default ''::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  deleted_by_auth_user_id uuid,
  created_by_name text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.object_normalization_queue add constraint object_normalization_queue_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.object_normalization_queue add constraint object_normalization_queue_pkey PRIMARY KEY (id);
CREATE INDEX idx_object_norm_queue_project_status ON quality.object_normalization_queue USING btree (project_code, status);
CREATE INDEX idx_object_norm_queue_raw_name ON quality.object_normalization_queue USING btree (raw_name);
CREATE INDEX idx_object_normalization_queue_project_status ON quality.object_normalization_queue USING btree (project_code, status);
CREATE UNIQUE INDEX object_queue_project_code_raw_name_uidx ON quality.object_normalization_queue USING btree (project_code, raw_name);
create index if not exists object_normalization_queue_core_company_idx on quality.object_normalization_queue (core_company_id, core_project_id);
create trigger object_normalization_queue_bind_company before insert or update on quality.object_normalization_queue
  for each row execute function quality.bind_company('company', '1');
alter table quality.object_normalization_queue enable row level security;
create policy object_normalization_queue_select on quality.object_normalization_queue for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy object_normalization_queue_insert on quality.object_normalization_queue for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy object_normalization_queue_update on quality.object_normalization_queue for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy object_normalization_queue_delete on quality.object_normalization_queue for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
grant select, insert, update, delete on quality.object_normalization_queue to authenticated;

create table if not exists quality.project_fmea (
  id text not null,
  project_code text,
  engineer_name text,
  data jsonb,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  project_canonical_key text,
  project_display_name text,
  inspector_name text,
  contractor_name text,
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.project_fmea add constraint project_fmea_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.project_fmea add constraint project_fmea_pkey PRIMARY KEY (id);
CREATE INDEX idx_project_fmea_contractor ON quality.project_fmea USING btree (project_code, contractor_name);
CREATE INDEX idx_project_fmea_engineer ON quality.project_fmea USING btree (project_code, engineer_name);
CREATE INDEX idx_project_fmea_project_code ON quality.project_fmea USING btree (project_code);
CREATE INDEX idx_project_fmea_project_key ON quality.project_fmea USING btree (project_code, project_canonical_key);
CREATE INDEX idx_project_fmea_sync_status ON quality.project_fmea USING btree (sync_status);
CREATE INDEX idx_project_fmea_updated ON quality.project_fmea USING btree (updated_at);
create index if not exists project_fmea_core_company_idx on quality.project_fmea (core_company_id, core_project_id);
create trigger project_fmea_bind_company before insert or update on quality.project_fmea
  for each row execute function quality.bind_company('project', '1');
alter table quality.project_fmea enable row level security;
create policy project_fmea_select on quality.project_fmea for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy project_fmea_insert on quality.project_fmea for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy project_fmea_update on quality.project_fmea for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy project_fmea_delete on quality.project_fmea for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.project_fmea to authenticated;

create table if not exists quality.project_interventions (
  id text not null,
  project_code text,
  engineer_name text,
  data jsonb,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  project_canonical_key text,
  project_display_name text,
  inspector_name text,
  contractor_name text,
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.project_interventions add constraint project_interventions_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.project_interventions add constraint project_interventions_pkey PRIMARY KEY (id);
CREATE INDEX idx_project_interventions_contractor ON quality.project_interventions USING btree (project_code, contractor_name);
CREATE INDEX idx_project_interventions_engineer ON quality.project_interventions USING btree (project_code, engineer_name);
CREATE INDEX idx_project_interventions_project_code ON quality.project_interventions USING btree (project_code);
CREATE INDEX idx_project_interventions_project_key ON quality.project_interventions USING btree (project_code, project_canonical_key);
CREATE INDEX idx_project_interventions_sync_status ON quality.project_interventions USING btree (sync_status);
CREATE INDEX idx_project_interventions_updated ON quality.project_interventions USING btree (updated_at);
create index if not exists project_interventions_core_company_idx on quality.project_interventions (core_company_id, core_project_id);
create trigger project_interventions_bind_company before insert or update on quality.project_interventions
  for each row execute function quality.bind_company('project', '1');
alter table quality.project_interventions enable row level security;
create policy project_interventions_select on quality.project_interventions for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy project_interventions_insert on quality.project_interventions for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy project_interventions_update on quality.project_interventions for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy project_interventions_delete on quality.project_interventions for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.project_interventions to authenticated;

create table if not exists quality.project_meetings (
  id text not null,
  project_code text,
  engineer_name text,
  data jsonb,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  project_canonical_key text,
  project_display_name text,
  inspector_name text,
  contractor_name text,
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.project_meetings add constraint project_meetings_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.project_meetings add constraint project_meetings_pkey PRIMARY KEY (id);
CREATE INDEX idx_project_meetings_contractor ON quality.project_meetings USING btree (project_code, contractor_name);
CREATE INDEX idx_project_meetings_engineer ON quality.project_meetings USING btree (project_code, engineer_name);
CREATE INDEX idx_project_meetings_project_code ON quality.project_meetings USING btree (project_code);
CREATE INDEX idx_project_meetings_project_key ON quality.project_meetings USING btree (project_code, project_canonical_key);
CREATE INDEX idx_project_meetings_sync_status ON quality.project_meetings USING btree (sync_status);
CREATE INDEX idx_project_meetings_updated ON quality.project_meetings USING btree (updated_at);
create index if not exists project_meetings_core_company_idx on quality.project_meetings (core_company_id, core_project_id);
create trigger project_meetings_bind_company before insert or update on quality.project_meetings
  for each row execute function quality.bind_company('project', '1');
alter table quality.project_meetings enable row level security;
create policy project_meetings_select on quality.project_meetings for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy project_meetings_insert on quality.project_meetings for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy project_meetings_update on quality.project_meetings for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy project_meetings_delete on quality.project_meetings for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.project_meetings to authenticated;

create table if not exists quality.project_objects (
  id text not null,
  canonical_key text not null,
  display_name text not null,
  synonyms text[] default '{}'::text[],
  project_code text,
  created_by text,
  updated_at timestamp with time zone default now(),
  _deleted boolean default false,
  is_deleted boolean default false,
  created_at timestamp with time zone default now(),
  project_code_name text,
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  deleted_at timestamp with time zone,
  created_by_name text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.project_objects add constraint project_objects_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.project_objects add constraint project_objects_canonical_key_key UNIQUE (core_company_id, canonical_key);
alter table quality.project_objects add constraint project_objects_pkey PRIMARY KEY (id);
CREATE INDEX idx_project_objects_display_name ON quality.project_objects USING btree (display_name);
CREATE INDEX idx_project_objects_project_code ON quality.project_objects USING btree (project_code);
CREATE UNIQUE INDEX idx_project_objects_project_key ON quality.project_objects USING btree (project_code, canonical_key) WHERE (COALESCE(is_deleted, false) = false);
CREATE UNIQUE INDEX idx_project_objects_unique_key ON quality.project_objects USING btree (project_code, canonical_key) WHERE (is_deleted = false);
create index if not exists project_objects_core_company_idx on quality.project_objects (core_company_id, core_project_id);
create trigger project_objects_bind_company before insert or update on quality.project_objects
  for each row execute function quality.bind_company('company', '1');
alter table quality.project_objects enable row level security;
create policy project_objects_select on quality.project_objects for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy project_objects_insert on quality.project_objects for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy project_objects_update on quality.project_objects for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy project_objects_delete on quality.project_objects for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
grant select, insert, update, delete on quality.project_objects to authenticated;

create table if not exists quality.project_schedule_stages (
  id text not null,
  project_code text,
  engineer_name text,
  data jsonb,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  project_canonical_key text,
  project_display_name text,
  contractor_name text,
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  inspector_name text,
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.project_schedule_stages add constraint project_schedule_stages_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.project_schedule_stages add constraint project_schedule_stages_pkey PRIMARY KEY (id);
CREATE INDEX idx_project_schedule_contractor ON quality.project_schedule_stages USING btree (project_code, contractor_name);
CREATE INDEX idx_project_schedule_project_key ON quality.project_schedule_stages USING btree (project_code, project_canonical_key);
CREATE INDEX idx_project_schedule_stages_contractor ON quality.project_schedule_stages USING btree (project_code, contractor_name);
CREATE INDEX idx_project_schedule_stages_engineer ON quality.project_schedule_stages USING btree (project_code, engineer_name);
CREATE INDEX idx_project_schedule_stages_project_code ON quality.project_schedule_stages USING btree (project_code);
CREATE INDEX idx_project_schedule_stages_project_key ON quality.project_schedule_stages USING btree (project_code, project_canonical_key);
CREATE INDEX idx_project_schedule_stages_updated ON quality.project_schedule_stages USING btree (updated_at);
create index if not exists project_schedule_stages_core_company_idx on quality.project_schedule_stages (core_company_id, core_project_id);
create trigger project_schedule_stages_bind_company before insert or update on quality.project_schedule_stages
  for each row execute function quality.bind_company('project', '1');
alter table quality.project_schedule_stages enable row level security;
create policy project_schedule_stages_select on quality.project_schedule_stages for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy project_schedule_stages_insert on quality.project_schedule_stages for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy project_schedule_stages_update on quality.project_schedule_stages for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy project_schedule_stages_delete on quality.project_schedule_stages for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.project_schedule_stages to authenticated;

create table if not exists quality.project_settings (
  project_code text not null,
  logo_url text,
  brand_color text,
  updated_at timestamp with time zone default now(),
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.project_settings add constraint project_settings_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.project_settings add constraint project_settings_pkey PRIMARY KEY (project_code);
create index if not exists project_settings_core_company_idx on quality.project_settings (core_company_id, core_project_id);
create trigger project_settings_bind_company before insert or update on quality.project_settings
  for each row execute function quality.bind_company('company', '1');
alter table quality.project_settings enable row level security;
create policy project_settings_select on quality.project_settings for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy project_settings_insert on quality.project_settings for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'));
create policy project_settings_update on quality.project_settings for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'));
create policy project_settings_delete on quality.project_settings for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'));
grant select, insert, update, delete on quality.project_settings to authenticated;

create table if not exists quality.rbi_company_settings (
  company_id text default 'rbi'::text not null,
  role_matrix_overrides jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  official_templates jsonb default '{}'::jsonb not null,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.rbi_company_settings add constraint rbi_company_settings_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.rbi_company_settings add constraint rbi_company_settings_pkey PRIMARY KEY (company_id);
create index if not exists rbi_company_settings_core_company_idx on quality.rbi_company_settings (core_company_id, core_project_id);
create trigger rbi_company_settings_bind_company before insert or update on quality.rbi_company_settings
  for each row execute function quality.bind_company('company', '0');
alter table quality.rbi_company_settings enable row level security;
create policy rbi_company_settings_select on quality.rbi_company_settings for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy rbi_company_settings_insert on quality.rbi_company_settings for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'));
create policy rbi_company_settings_update on quality.rbi_company_settings for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'));
create policy rbi_company_settings_delete on quality.rbi_company_settings for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.manage,construction.manage}'));
grant select, insert, update, delete on quality.rbi_company_settings to authenticated;

create table if not exists quality.rbi_draft_sessions (
  id text not null,
  project_code text not null,
  engineer_name text not null,
  template_key text,
  template_title text,
  contractor_name text,
  location text,
  section text,
  floor text,
  room text,
  state jsonb default '{}'::jsonb,
  details jsonb default '{}'::jsonb,
  photos jsonb default '{}'::jsonb,
  custom_expert_conclusions jsonb default '{}'::jsonb,
  device_id text,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  owner_auth_user_id uuid,
  owner_name text,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  deleted_by_auth_user_id uuid,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.rbi_draft_sessions add constraint rbi_draft_sessions_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.rbi_draft_sessions add constraint rbi_draft_sessions_pkey PRIMARY KEY (id);
CREATE INDEX idx_rbi_drafts_project_engineer ON quality.rbi_draft_sessions USING btree (project_code, engineer_name);
create index if not exists rbi_draft_sessions_core_company_idx on quality.rbi_draft_sessions (core_company_id, core_project_id);
create trigger rbi_draft_sessions_bind_company before insert or update on quality.rbi_draft_sessions
  for each row execute function quality.bind_company('company', '1');
alter table quality.rbi_draft_sessions enable row level security;
create policy rbi_draft_sessions_select on quality.rbi_draft_sessions for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy rbi_draft_sessions_insert on quality.rbi_draft_sessions for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy rbi_draft_sessions_update on quality.rbi_draft_sessions for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy rbi_draft_sessions_delete on quality.rbi_draft_sessions for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.rbi_draft_sessions to authenticated;

create table if not exists quality.rbi_engineer_profiles (
  id uuid default gen_random_uuid() not null,
  inspector_id text,
  inspector_name text,
  engineer_name text,
  project_code text not null,
  pin_hash text,
  profile_data jsonb default '{}'::jsonb,
  settings jsonb default '{}'::jsonb,
  last_seen_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  role text default 'guest'::text,
  assigned_contractor text default ''::text,
  assigned_projects text[] default '{}'::text[],
  cloud_status text default 'pending'::text,
  contractor_name text default ''::text,
  auth_user_id uuid,
  auth_email text,
  last_auth_at timestamp with time zone,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.rbi_engineer_profiles add constraint rbi_engineer_profiles_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.rbi_engineer_profiles add constraint chk_rbi_profiles_cloud_status CHECK ((cloud_status = ANY (ARRAY['pending'::text, 'approved'::text, 'blocked'::text]))) NOT VALID;
alter table quality.rbi_engineer_profiles add constraint chk_rbi_profiles_role CHECK ((role = ANY (ARRAY['guest'::text, 'contractor'::text, 'engineer'::text, 'project_manager'::text, 'deputy_manager'::text, 'manager'::text, 'director'::text]))) NOT VALID;
alter table quality.rbi_engineer_profiles add constraint rbi_engineer_profiles_inspector_id_key UNIQUE (inspector_id);
alter table quality.rbi_engineer_profiles add constraint rbi_engineer_profiles_pkey PRIMARY KEY (id);
CREATE INDEX idx_rbi_profiles_cloud_status ON quality.rbi_engineer_profiles USING btree (cloud_status);
CREATE UNIQUE INDEX idx_rbi_profiles_inspector_id ON quality.rbi_engineer_profiles USING btree (inspector_id);
CREATE INDEX idx_rbi_profiles_project_code ON quality.rbi_engineer_profiles USING btree (project_code);
CREATE UNIQUE INDEX idx_rbi_profiles_project_engineer ON quality.rbi_engineer_profiles USING btree (project_code, engineer_name);
CREATE INDEX idx_rbi_profiles_role ON quality.rbi_engineer_profiles USING btree (role);
CREATE UNIQUE INDEX rbi_engineer_profiles_auth_email_uidx ON quality.rbi_engineer_profiles USING btree (core_company_id, lower(auth_email)) WHERE (auth_email IS NOT NULL);
CREATE UNIQUE INDEX rbi_engineer_profiles_auth_user_id_uidx ON quality.rbi_engineer_profiles USING btree (core_company_id, auth_user_id) WHERE (auth_user_id IS NOT NULL);
CREATE UNIQUE INDEX rbi_engineer_profiles_inspector_id_uidx ON quality.rbi_engineer_profiles USING btree (inspector_id);
CREATE UNIQUE INDEX rbi_engineer_profiles_project_inspector_uidx ON quality.rbi_engineer_profiles USING btree (project_code, inspector_id);
create index if not exists rbi_engineer_profiles_core_company_idx on quality.rbi_engineer_profiles (core_company_id, core_project_id);
create trigger rbi_engineer_profiles_bind_company before insert or update on quality.rbi_engineer_profiles
  for each row execute function quality.bind_company('company', '1');
alter table quality.rbi_engineer_profiles enable row level security;
create policy rbi_engineer_profiles_select on quality.rbi_engineer_profiles for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy rbi_engineer_profiles_insert on quality.rbi_engineer_profiles for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy rbi_engineer_profiles_update on quality.rbi_engineer_profiles for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy rbi_engineer_profiles_delete on quality.rbi_engineer_profiles for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
grant select, insert, update, delete on quality.rbi_engineer_profiles to authenticated;

create table if not exists quality.rbi_engineer_ratings (
  id text not null,
  project_code text not null,
  engineer_name text not null,
  rating_data jsonb default '{}'::jsonb not null,
  pi integer default 0,
  checks_count integer default 0,
  level_name text,
  updated_at timestamp with time zone default now(),
  auth_user_id uuid,
  project_canonical_key text,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.rbi_engineer_ratings add constraint rbi_engineer_ratings_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.rbi_engineer_ratings add constraint rbi_engineer_ratings_pkey PRIMARY KEY (id);
alter table quality.rbi_engineer_ratings add constraint rbi_engineer_ratings_project_code_engineer_name_key UNIQUE (project_code, engineer_name);
CREATE INDEX idx_rbi_engineer_ratings_project_pi ON quality.rbi_engineer_ratings USING btree (project_code, pi DESC);
CREATE UNIQUE INDEX idx_rbi_ratings_project_engineer ON quality.rbi_engineer_ratings USING btree (project_code, engineer_name);
create index if not exists rbi_engineer_ratings_core_company_idx on quality.rbi_engineer_ratings (core_company_id, core_project_id);
create trigger rbi_engineer_ratings_bind_company before insert or update on quality.rbi_engineer_ratings
  for each row execute function quality.bind_company('company', '1');
alter table quality.rbi_engineer_ratings enable row level security;
create policy rbi_engineer_ratings_select on quality.rbi_engineer_ratings for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy rbi_engineer_ratings_insert on quality.rbi_engineer_ratings for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy rbi_engineer_ratings_update on quality.rbi_engineer_ratings for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy rbi_engineer_ratings_delete on quality.rbi_engineer_ratings for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.rbi_engineer_ratings to authenticated;

create table if not exists quality.rbi_error_logs (
  id uuid default gen_random_uuid() not null,
  device_id text,
  project_code text,
  message text,
  stack text,
  app_version text,
  created_at timestamp with time zone default now(),
  auth_user_id uuid,
  engineer_name text,
  role text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.rbi_error_logs add constraint rbi_error_logs_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.rbi_error_logs add constraint rbi_error_logs_pkey PRIMARY KEY (id);
create index if not exists rbi_error_logs_core_company_idx on quality.rbi_error_logs (core_company_id, core_project_id);
create trigger rbi_error_logs_bind_company before insert or update on quality.rbi_error_logs
  for each row execute function quality.bind_company('company', '1');
alter table quality.rbi_error_logs enable row level security;
create policy rbi_error_logs_select on quality.rbi_error_logs for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy rbi_error_logs_insert on quality.rbi_error_logs for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy rbi_error_logs_update on quality.rbi_error_logs for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy rbi_error_logs_delete on quality.rbi_error_logs for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
grant select, insert, update, delete on quality.rbi_error_logs to authenticated;

create table if not exists quality.rbi_inspection_items (
  id text not null,
  inspection_id text not null,
  project_code text not null,
  item_id text not null,
  item_name text,
  item_weight integer,
  status text,
  comment text,
  cause_code text,
  fact_value text,
  tolerance_value text,
  details jsonb default '{}'::jsonb,
  updated_at timestamp with time zone default now(),
  project_canonical_key text,
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.rbi_inspection_items add constraint rbi_inspection_items_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.rbi_inspection_items add constraint rbi_inspection_items_pkey PRIMARY KEY (id);
CREATE INDEX idx_rbi_inspection_items_project_key ON quality.rbi_inspection_items USING btree (project_code, project_canonical_key);
CREATE INDEX idx_rbi_inspection_items_sync_status ON quality.rbi_inspection_items USING btree (sync_status);
CREATE INDEX idx_rbi_items_inspection ON quality.rbi_inspection_items USING btree (inspection_id);
CREATE INDEX idx_rbi_items_project ON quality.rbi_inspection_items USING btree (project_code, project_canonical_key);
create index if not exists rbi_inspection_items_core_company_idx on quality.rbi_inspection_items (core_company_id, core_project_id);
create trigger rbi_inspection_items_bind_company before insert or update on quality.rbi_inspection_items
  for each row execute function quality.bind_company('project', '1');
alter table quality.rbi_inspection_items enable row level security;
create policy rbi_inspection_items_select on quality.rbi_inspection_items for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy rbi_inspection_items_insert on quality.rbi_inspection_items for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy rbi_inspection_items_update on quality.rbi_inspection_items for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy rbi_inspection_items_delete on quality.rbi_inspection_items for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.rbi_inspection_items to authenticated;

create table if not exists quality.rbi_inspection_photos (
  id text not null,
  inspection_id text not null,
  project_code text not null,
  item_id text,
  photo_type text default 'inspection'::text,
  bucket_name text default 'inspection-photos'::text,
  storage_path text,
  public_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  project_canonical_key text,
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  photo_index integer default 0 not null,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.rbi_inspection_photos add constraint rbi_inspection_photos_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.rbi_inspection_photos add constraint rbi_inspection_photos_pkey PRIMARY KEY (id);
CREATE INDEX idx_rbi_inspection_photos_item_order ON quality.rbi_inspection_photos USING btree (inspection_id, item_id, photo_index);
CREATE INDEX idx_rbi_inspection_photos_project_key ON quality.rbi_inspection_photos USING btree (project_code, project_canonical_key);
CREATE INDEX idx_rbi_inspection_photos_sync_status ON quality.rbi_inspection_photos USING btree (sync_status);
CREATE INDEX idx_rbi_photos_inspection ON quality.rbi_inspection_photos USING btree (inspection_id);
CREATE INDEX idx_rbi_photos_project ON quality.rbi_inspection_photos USING btree (project_code, project_canonical_key);
create index if not exists rbi_inspection_photos_core_company_idx on quality.rbi_inspection_photos (core_company_id, core_project_id);
create trigger rbi_inspection_photos_bind_company before insert or update on quality.rbi_inspection_photos
  for each row execute function quality.bind_company('project', '1');
alter table quality.rbi_inspection_photos enable row level security;
create policy rbi_inspection_photos_select on quality.rbi_inspection_photos for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy rbi_inspection_photos_insert on quality.rbi_inspection_photos for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy rbi_inspection_photos_update on quality.rbi_inspection_photos for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy rbi_inspection_photos_delete on quality.rbi_inspection_photos for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.rbi_inspection_photos to authenticated;

create table if not exists quality.rbi_inspections (
  id text not null,
  project_code text not null,
  project_name text,
  engineer_name text,
  inspector_name text,
  contractor_name text,
  template_key text,
  template_title text,
  location text,
  section text,
  floor text,
  room text,
  inspection_date timestamp with time zone,
  date timestamp with time zone,
  metrics jsonb default '{}'::jsonb,
  inspection_data jsonb default '{}'::jsonb,
  photos jsonb default '{}'::jsonb,
  is_completed boolean default true,
  is_deleted boolean default false,
  _deleted boolean default false,
  deleted_at timestamp with time zone,
  _deleted_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  project_canonical_key text,
  project_display_name text,
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  contractor_canonical_key text,
  contractor_raw_name text,
  created_by_auth_user_id uuid,
  created_by_name text,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  inspection_type text default 'rbi_audit'::text,
  "contractorId" text,
  "projectId" text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.rbi_inspections add constraint rbi_inspections_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.rbi_inspections add constraint chk_rbi_inspections_source CHECK ((source = ANY (ARRAY['local'::text, 'cloud'::text]))) NOT VALID;
alter table quality.rbi_inspections add constraint chk_rbi_inspections_sync_status CHECK ((sync_status = ANY (ARRAY['not_synced'::text, 'synced'::text, 'blocked'::text]))) NOT VALID;
alter table quality.rbi_inspections add constraint rbi_inspections_pkey PRIMARY KEY (id);
CREATE INDEX idx_rbi_inspections_contractor ON quality.rbi_inspections USING btree (project_code, contractor_name);
CREATE INDEX idx_rbi_inspections_engineer ON quality.rbi_inspections USING btree (project_code, engineer_name);
CREATE INDEX idx_rbi_inspections_inspector ON quality.rbi_inspections USING btree (project_code, inspector_name);
CREATE INDEX idx_rbi_inspections_project ON quality.rbi_inspections USING btree (project_code);
CREATE INDEX idx_rbi_inspections_project_code ON quality.rbi_inspections USING btree (project_code);
CREATE INDEX idx_rbi_inspections_project_key ON quality.rbi_inspections USING btree (project_code, project_canonical_key);
CREATE INDEX idx_rbi_inspections_project_updated ON quality.rbi_inspections USING btree (project_code, updated_at);
CREATE INDEX idx_rbi_inspections_sync_status ON quality.rbi_inspections USING btree (sync_status);
CREATE INDEX idx_rbi_inspections_updated ON quality.rbi_inspections USING btree (updated_at);
create index if not exists rbi_inspections_core_company_idx on quality.rbi_inspections (core_company_id, core_project_id);
create trigger rbi_inspections_bind_company before insert or update on quality.rbi_inspections
  for each row execute function quality.bind_company('project', '1');
alter table quality.rbi_inspections enable row level security;
create policy rbi_inspections_select on quality.rbi_inspections for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy rbi_inspections_insert on quality.rbi_inspections for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy rbi_inspections_update on quality.rbi_inspections for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy rbi_inspections_delete on quality.rbi_inspections for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.rbi_inspections to authenticated;

create table if not exists quality.rbi_sync_queue (
  id uuid default gen_random_uuid() not null,
  project_code text not null,
  engineer_name text not null,
  action_type text not null,
  payload jsonb not null,
  status text default 'pending'::text,
  device_id text,
  created_at timestamp with time zone default now(),
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.rbi_sync_queue add constraint rbi_sync_queue_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.rbi_sync_queue add constraint rbi_sync_queue_pkey PRIMARY KEY (id);
create index if not exists rbi_sync_queue_core_company_idx on quality.rbi_sync_queue (core_company_id, core_project_id);
create trigger rbi_sync_queue_bind_company before insert or update on quality.rbi_sync_queue
  for each row execute function quality.bind_company('company', '1');
alter table quality.rbi_sync_queue enable row level security;
create policy rbi_sync_queue_select on quality.rbi_sync_queue for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'));
create policy rbi_sync_queue_insert on quality.rbi_sync_queue for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy rbi_sync_queue_update on quality.rbi_sync_queue for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
create policy rbi_sync_queue_delete on quality.rbi_sync_queue for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));
grant select, insert, update, delete on quality.rbi_sync_queue to authenticated;

create table if not exists quality.rbi_tasks (
  id text not null,
  project_code text not null,
  engineer_name text,
  contractor_name text,
  title text,
  task_data jsonb default '{}'::jsonb,
  status text default 'pending'::text,
  task_date timestamp with time zone,
  is_deleted boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone,
  project_canonical_key text,
  project_display_name text,
  inspector_name text,
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  assigned_to_auth_user_id uuid,
  assigned_to_name text,
  contractor_canonical_key text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.rbi_tasks add constraint rbi_tasks_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.rbi_tasks add constraint chk_rbi_tasks_source CHECK ((source = ANY (ARRAY['local'::text, 'cloud'::text]))) NOT VALID;
alter table quality.rbi_tasks add constraint chk_rbi_tasks_sync_status CHECK ((sync_status = ANY (ARRAY['not_synced'::text, 'synced'::text, 'blocked'::text]))) NOT VALID;
alter table quality.rbi_tasks add constraint rbi_tasks_pkey PRIMARY KEY (id);
CREATE INDEX idx_rbi_tasks_contractor ON quality.rbi_tasks USING btree (project_code, contractor_name);
CREATE INDEX idx_rbi_tasks_engineer ON quality.rbi_tasks USING btree (project_code, engineer_name);
CREATE INDEX idx_rbi_tasks_inspector ON quality.rbi_tasks USING btree (project_code, inspector_name);
CREATE INDEX idx_rbi_tasks_project_key ON quality.rbi_tasks USING btree (project_code, project_canonical_key);
CREATE INDEX idx_rbi_tasks_project_updated ON quality.rbi_tasks USING btree (project_code, updated_at);
CREATE INDEX idx_rbi_tasks_sync_status ON quality.rbi_tasks USING btree (sync_status);
CREATE INDEX idx_rbi_tasks_updated ON quality.rbi_tasks USING btree (updated_at);
create index if not exists rbi_tasks_core_company_idx on quality.rbi_tasks (core_company_id, core_project_id);
create trigger rbi_tasks_bind_company before insert or update on quality.rbi_tasks
  for each row execute function quality.bind_company('project', '1');
alter table quality.rbi_tasks enable row level security;
create policy rbi_tasks_select on quality.rbi_tasks for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy rbi_tasks_insert on quality.rbi_tasks for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy rbi_tasks_update on quality.rbi_tasks for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy rbi_tasks_delete on quality.rbi_tasks for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.rbi_tasks to authenticated;

create table if not exists quality.shared_checklists (
  id text not null,
  owner text,
  data jsonb,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  project_code text default 'RBI'::text,
  created_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  created_by_name text,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.shared_checklists add constraint shared_checklists_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.shared_checklists add constraint shared_checklists_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_checklists_owner ON quality.shared_checklists USING btree (owner);
CREATE INDEX idx_shared_checklists_updated ON quality.shared_checklists USING btree (updated_at);
create index if not exists shared_checklists_core_company_idx on quality.shared_checklists (core_company_id, core_project_id);
create trigger shared_checklists_bind_company before insert or update on quality.shared_checklists
  for each row execute function quality.bind_company('company', '1');
alter table quality.shared_checklists enable row level security;
create policy shared_checklists_select on quality.shared_checklists for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy shared_checklists_insert on quality.shared_checklists for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_checklists_update on quality.shared_checklists for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_checklists_delete on quality.shared_checklists for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.shared_checklists to authenticated;

create table if not exists quality.shared_docs (
  id text not null,
  owner text,
  data jsonb,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  project_code text default 'RBI'::text,
  created_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  created_by_name text,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.shared_docs add constraint shared_docs_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.shared_docs add constraint shared_docs_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_docs_owner ON quality.shared_docs USING btree (owner);
CREATE INDEX idx_shared_docs_updated ON quality.shared_docs USING btree (updated_at);
create index if not exists shared_docs_core_company_idx on quality.shared_docs (core_company_id, core_project_id);
create trigger shared_docs_bind_company before insert or update on quality.shared_docs
  for each row execute function quality.bind_company('company', '1');
alter table quality.shared_docs enable row level security;
create policy shared_docs_select on quality.shared_docs for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy shared_docs_insert on quality.shared_docs for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_docs_update on quality.shared_docs for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_docs_delete on quality.shared_docs for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.shared_docs to authenticated;

create table if not exists quality.shared_etalons (
  id text not null,
  owner text,
  data jsonb,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  project_code text default 'RBI'::text,
  created_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  created_by_name text,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.shared_etalons add constraint shared_etalons_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.shared_etalons add constraint shared_etalons_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_etalons_owner ON quality.shared_etalons USING btree (owner);
CREATE INDEX idx_shared_etalons_updated ON quality.shared_etalons USING btree (updated_at);
create index if not exists shared_etalons_core_company_idx on quality.shared_etalons (core_company_id, core_project_id);
create trigger shared_etalons_bind_company before insert or update on quality.shared_etalons
  for each row execute function quality.bind_company('company', '1');
alter table quality.shared_etalons enable row level security;
create policy shared_etalons_select on quality.shared_etalons for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy shared_etalons_insert on quality.shared_etalons for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_etalons_update on quality.shared_etalons for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_etalons_delete on quality.shared_etalons for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.shared_etalons to authenticated;

create table if not exists quality.shared_feedback (
  id text not null,
  data jsonb not null,
  owner text,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  created_by_auth_user_id uuid,
  created_by_name text,
  project_code text default 'RBI'::text,
  updated_by_auth_user_id uuid,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.shared_feedback add constraint shared_feedback_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.shared_feedback add constraint shared_feedback_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_feedback_owner ON quality.shared_feedback USING btree (owner);
CREATE INDEX idx_shared_feedback_updated ON quality.shared_feedback USING btree (updated_at);
create index if not exists shared_feedback_core_company_idx on quality.shared_feedback (core_company_id, core_project_id);
create trigger shared_feedback_bind_company before insert or update on quality.shared_feedback
  for each row execute function quality.bind_company('company', '1');
alter table quality.shared_feedback enable row level security;
create policy shared_feedback_select on quality.shared_feedback for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy shared_feedback_insert on quality.shared_feedback for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_feedback_update on quality.shared_feedback for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_feedback_delete on quality.shared_feedback for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.shared_feedback to authenticated;

create table if not exists quality.shared_nodes (
  id text not null,
  owner text,
  data jsonb,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  project_code text default 'RBI'::text,
  created_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  created_by_name text,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.shared_nodes add constraint shared_nodes_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.shared_nodes add constraint shared_nodes_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_nodes_owner ON quality.shared_nodes USING btree (owner);
CREATE INDEX idx_shared_nodes_updated ON quality.shared_nodes USING btree (updated_at);
create index if not exists shared_nodes_core_company_idx on quality.shared_nodes (core_company_id, core_project_id);
create trigger shared_nodes_bind_company before insert or update on quality.shared_nodes
  for each row execute function quality.bind_company('company', '1');
alter table quality.shared_nodes enable row level security;
create policy shared_nodes_select on quality.shared_nodes for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy shared_nodes_insert on quality.shared_nodes for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_nodes_update on quality.shared_nodes for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_nodes_delete on quality.shared_nodes for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.shared_nodes to authenticated;

create table if not exists quality.shared_practices (
  id text not null,
  owner text,
  data jsonb,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  project_code text default 'RBI'::text,
  created_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  created_by_name text,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.shared_practices add constraint shared_practices_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.shared_practices add constraint shared_practices_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_practices_owner ON quality.shared_practices USING btree (owner);
CREATE INDEX idx_shared_practices_updated ON quality.shared_practices USING btree (updated_at);
create index if not exists shared_practices_core_company_idx on quality.shared_practices (core_company_id, core_project_id);
create trigger shared_practices_bind_company before insert or update on quality.shared_practices
  for each row execute function quality.bind_company('company', '1');
alter table quality.shared_practices enable row level security;
create policy shared_practices_select on quality.shared_practices for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy shared_practices_insert on quality.shared_practices for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_practices_update on quality.shared_practices for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_practices_delete on quality.shared_practices for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.shared_practices to authenticated;

create table if not exists quality.shared_report_snapshots (
  id text not null,
  report_id text,
  html_content text not null,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone,
  project_code text default 'RBI'::text,
  project_canonical_key text,
  contractor_canonical_key text,
  created_by_auth_user_id uuid,
  created_by_name text,
  is_public boolean default true,
  public_token text,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  sync_status text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.shared_report_snapshots add constraint shared_report_snapshots_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.shared_report_snapshots add constraint shared_report_snapshots_pkey PRIMARY KEY (id);
CREATE INDEX idx_snapshots_report ON quality.shared_report_snapshots USING btree (report_id);
CREATE UNIQUE INDEX shared_report_snapshots_public_token_uidx ON quality.shared_report_snapshots USING btree (core_company_id, public_token) WHERE (public_token IS NOT NULL);
create index if not exists shared_report_snapshots_core_company_idx on quality.shared_report_snapshots (core_company_id, core_project_id);
create trigger shared_report_snapshots_bind_company before insert or update on quality.shared_report_snapshots
  for each row execute function quality.bind_company('company', '1');
alter table quality.shared_report_snapshots enable row level security;
create policy shared_report_snapshots_select on quality.shared_report_snapshots for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy shared_report_snapshots_insert on quality.shared_report_snapshots for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_report_snapshots_update on quality.shared_report_snapshots for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_report_snapshots_delete on quality.shared_report_snapshots for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.shared_report_snapshots to authenticated;

create table if not exists quality.shared_report_templates (
  id uuid default gen_random_uuid() not null,
  project_code text not null,
  report_type text not null,
  name text not null,
  template_data jsonb not null,
  created_by text not null,
  is_deleted boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  created_by_name text,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  deleted_at timestamp with time zone,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.shared_report_templates add constraint shared_report_templates_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.shared_report_templates add constraint shared_report_templates_pkey PRIMARY KEY (id);
CREATE INDEX idx_rep_templates_project ON quality.shared_report_templates USING btree (project_code);
create index if not exists shared_report_templates_core_company_idx on quality.shared_report_templates (core_company_id, core_project_id);
create trigger shared_report_templates_bind_company before insert or update on quality.shared_report_templates
  for each row execute function quality.bind_company('company', '1');
alter table quality.shared_report_templates enable row level security;
create policy shared_report_templates_select on quality.shared_report_templates for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy shared_report_templates_insert on quality.shared_report_templates for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_report_templates_update on quality.shared_report_templates for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_report_templates_delete on quality.shared_report_templates for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.shared_report_templates to authenticated;

create table if not exists quality.shared_reports (
  id text not null,
  project_code text not null,
  report_type text not null,
  title text not null,
  generated_at timestamp with time zone not null,
  file_url text not null,
  file_size integer,
  metadata jsonb,
  created_by text not null,
  is_deleted boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone,
  project_canonical_key text,
  project_display_name text,
  engineer_name text,
  contractor_canonical_key text,
  created_by_auth_user_id uuid,
  created_by_name text,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  is_public boolean default false,
  public_token text,
  published_at timestamp with time zone,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.shared_reports add constraint shared_reports_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.shared_reports add constraint shared_reports_pkey PRIMARY KEY (id);
CREATE INDEX idx_reports_generated ON quality.shared_reports USING btree (generated_at DESC);
CREATE INDEX idx_reports_project ON quality.shared_reports USING btree (project_code);
create index if not exists shared_reports_core_company_idx on quality.shared_reports (core_company_id, core_project_id);
create trigger shared_reports_bind_company before insert or update on quality.shared_reports
  for each row execute function quality.bind_company('project', '1');
alter table quality.shared_reports enable row level security;
create policy shared_reports_select on quality.shared_reports for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy shared_reports_insert on quality.shared_reports for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_reports_update on quality.shared_reports for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_reports_delete on quality.shared_reports for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.shared_reports to authenticated;

create table if not exists quality.shared_twi_cards (
  id text not null,
  owner text,
  data jsonb,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  project_code text default 'RBI'::text,
  created_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  created_by_name text,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.shared_twi_cards add constraint shared_twi_cards_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.shared_twi_cards add constraint shared_twi_cards_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_twi_cards_owner ON quality.shared_twi_cards USING btree (owner);
CREATE INDEX idx_shared_twi_cards_updated ON quality.shared_twi_cards USING btree (updated_at);
create index if not exists shared_twi_cards_core_company_idx on quality.shared_twi_cards (core_company_id, core_project_id);
create trigger shared_twi_cards_bind_company before insert or update on quality.shared_twi_cards
  for each row execute function quality.bind_company('company', '1');
alter table quality.shared_twi_cards enable row level security;
create policy shared_twi_cards_select on quality.shared_twi_cards for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy shared_twi_cards_insert on quality.shared_twi_cards for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_twi_cards_update on quality.shared_twi_cards for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy shared_twi_cards_delete on quality.shared_twi_cards for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.shared_twi_cards to authenticated;

create table if not exists quality.sk_category_map (
  id text not null,
  project_code text not null,
  data jsonb not null,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  created_by text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.sk_category_map add constraint sk_category_map_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.sk_category_map add constraint sk_category_map_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_category_map_project_code ON quality.sk_category_map USING btree (project_code);
create index if not exists sk_category_map_core_company_idx on quality.sk_category_map (core_company_id, core_project_id);
create trigger sk_category_map_bind_company before insert or update on quality.sk_category_map
  for each row execute function quality.bind_company('company', '1');
alter table quality.sk_category_map enable row level security;
create policy sk_category_map_select on quality.sk_category_map for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy sk_category_map_insert on quality.sk_category_map for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_category_map_update on quality.sk_category_map for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_category_map_delete on quality.sk_category_map for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.sk_category_map to authenticated;

create table if not exists quality.sk_contractor_map (
  id text not null,
  project_code text not null,
  data jsonb not null,
  updated_at timestamp with time zone default now(),
  contractor_name text,
  created_at timestamp with time zone default now(),
  created_by text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.sk_contractor_map add constraint sk_contractor_map_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.sk_contractor_map add constraint sk_contractor_map_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_contractor_map_contractor ON quality.sk_contractor_map USING btree (project_code, contractor_name);
CREATE INDEX idx_sk_contractor_map_project_code ON quality.sk_contractor_map USING btree (project_code);
create index if not exists sk_contractor_map_core_company_idx on quality.sk_contractor_map (core_company_id, core_project_id);
create trigger sk_contractor_map_bind_company before insert or update on quality.sk_contractor_map
  for each row execute function quality.bind_company('company', '1');
alter table quality.sk_contractor_map enable row level security;
create policy sk_contractor_map_select on quality.sk_contractor_map for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy sk_contractor_map_insert on quality.sk_contractor_map for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_contractor_map_update on quality.sk_contractor_map for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_contractor_map_delete on quality.sk_contractor_map for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.sk_contractor_map to authenticated;

create table if not exists quality.sk_data_bundles (
  id text not null,
  project_code text,
  data jsonb,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  engineer_name text,
  project_canonical_key text,
  project_display_name text,
  inspector_name text,
  contractor_name text,
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.sk_data_bundles add constraint sk_data_bundles_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.sk_data_bundles add constraint chk_sk_data_bundles_source CHECK ((source = ANY (ARRAY['local'::text, 'cloud'::text]))) NOT VALID;
alter table quality.sk_data_bundles add constraint chk_sk_data_bundles_sync_status CHECK ((sync_status = ANY (ARRAY['not_synced'::text, 'synced'::text, 'blocked'::text]))) NOT VALID;
alter table quality.sk_data_bundles add constraint sk_data_bundles_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_data_bundles_contractor ON quality.sk_data_bundles USING btree (project_code, contractor_name);
CREATE INDEX idx_sk_data_bundles_engineer ON quality.sk_data_bundles USING btree (project_code, engineer_name);
CREATE INDEX idx_sk_data_bundles_inspector ON quality.sk_data_bundles USING btree (project_code, inspector_name);
CREATE INDEX idx_sk_data_bundles_project_code ON quality.sk_data_bundles USING btree (project_code);
CREATE INDEX idx_sk_data_bundles_project_key ON quality.sk_data_bundles USING btree (project_code, project_canonical_key);
CREATE INDEX idx_sk_data_bundles_sync_status ON quality.sk_data_bundles USING btree (sync_status);
CREATE INDEX idx_sk_data_bundles_updated ON quality.sk_data_bundles USING btree (updated_at);
create index if not exists sk_data_bundles_core_company_idx on quality.sk_data_bundles (core_company_id, core_project_id);
create trigger sk_data_bundles_bind_company before insert or update on quality.sk_data_bundles
  for each row execute function quality.bind_company('project', '1');
alter table quality.sk_data_bundles enable row level security;
create policy sk_data_bundles_select on quality.sk_data_bundles for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy sk_data_bundles_insert on quality.sk_data_bundles for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_data_bundles_update on quality.sk_data_bundles for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_data_bundles_delete on quality.sk_data_bundles for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.sk_data_bundles to authenticated;

create table if not exists quality.sk_import_batches (
  id text not null,
  project_code text not null,
  uploaded_by text,
  uploaded_at timestamp with time zone default now(),
  file_name text,
  file_hash text,
  project_canonical_key text,
  project_display_name text,
  records_total integer default 0,
  records_created integer default 0,
  records_updated integer default 0,
  records_skipped integer default 0,
  status text default 'completed'::text,
  error_message text default ''::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.sk_import_batches add constraint sk_import_batches_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.sk_import_batches add constraint sk_import_batches_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_import_batches_project ON quality.sk_import_batches USING btree (project_code, uploaded_at);
CREATE INDEX idx_sk_import_batches_uploaded_by ON quality.sk_import_batches USING btree (project_code, uploaded_by);
create index if not exists sk_import_batches_core_company_idx on quality.sk_import_batches (core_company_id, core_project_id);
create trigger sk_import_batches_bind_company before insert or update on quality.sk_import_batches
  for each row execute function quality.bind_company('company', '1');
alter table quality.sk_import_batches enable row level security;
create policy sk_import_batches_select on quality.sk_import_batches for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy sk_import_batches_insert on quality.sk_import_batches for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_import_batches_update on quality.sk_import_batches for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_import_batches_delete on quality.sk_import_batches for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.sk_import_batches to authenticated;

create table if not exists quality.sk_mapping (
  id text not null,
  project_code text not null,
  data jsonb not null,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  created_by text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.sk_mapping add constraint sk_mapping_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.sk_mapping add constraint sk_mapping_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_mapping_project_code ON quality.sk_mapping USING btree (project_code);
create index if not exists sk_mapping_core_company_idx on quality.sk_mapping (core_company_id, core_project_id);
create trigger sk_mapping_bind_company before insert or update on quality.sk_mapping
  for each row execute function quality.bind_company('company', '1');
alter table quality.sk_mapping enable row level security;
create policy sk_mapping_select on quality.sk_mapping for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy sk_mapping_insert on quality.sk_mapping for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_mapping_update on quality.sk_mapping for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_mapping_delete on quality.sk_mapping for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.sk_mapping to authenticated;

create table if not exists quality.sk_records (
  id text not null,
  project_code text not null,
  sk_number text not null,
  sk_unique_key text not null,
  row_number text,
  text text,
  category text,
  date_issued date,
  contractor_raw text,
  contractor_name text,
  contractor_canonical_key text,
  contractor_normalization_status text default 'pending'::text,
  contractor_representative text,
  deadline date,
  status_raw text,
  status_normalized text,
  is_verified_closed boolean default false,
  date_resolved date,
  issued_by text,
  closed_by text,
  structure text,
  project_loc text,
  project_raw_path text,
  project_raw_name text,
  project_canonical_key text,
  project_display_name text,
  project_block text,
  project_floor text,
  project_normalization_status text default 'pending'::text,
  uploaded_by text,
  sk_uploaded_by text,
  imported_by text,
  first_uploaded_by text,
  last_uploaded_by text,
  import_batch_id text,
  import_count integer default 1,
  first_imported_at timestamp with time zone default now(),
  last_imported_at timestamp with time zone default now(),
  source text default 'cloud'::text,
  sync_status text default 'synced'::text,
  sync_block_reason text default ''::text,
  is_deleted boolean default false,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by_auth_user_id uuid,
  updated_by_auth_user_id uuid,
  deleted_by_auth_user_id uuid,
  "contractorId" text,
  "projectId" text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.sk_records add constraint sk_records_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.sk_records add constraint sk_records_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_records_contractor_key ON quality.sk_records USING btree (project_code, contractor_canonical_key);
CREATE UNIQUE INDEX idx_sk_records_project_number ON quality.sk_records USING btree (project_code, sk_number);
CREATE INDEX idx_sk_records_project_object ON quality.sk_records USING btree (project_code, project_canonical_key);
CREATE INDEX idx_sk_records_status ON quality.sk_records USING btree (project_code, status_normalized);
CREATE UNIQUE INDEX idx_sk_records_unique_key ON quality.sk_records USING btree (core_company_id, sk_unique_key);
CREATE INDEX idx_sk_records_uploaded_by ON quality.sk_records USING btree (project_code, uploaded_by);
create index if not exists sk_records_core_company_idx on quality.sk_records (core_company_id, core_project_id);
create trigger sk_records_bind_company before insert or update on quality.sk_records
  for each row execute function quality.bind_company('project', '1');
alter table quality.sk_records enable row level security;
create policy sk_records_select on quality.sk_records for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy sk_records_insert on quality.sk_records for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_records_update on quality.sk_records for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_records_delete on quality.sk_records for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.sk_records to authenticated;

create table if not exists quality.sk_volumes (
  id text not null,
  project_code text not null,
  data jsonb not null,
  updated_at timestamp with time zone default now(),
  project_canonical_key text,
  project_display_name text,
  contractor_name text,
  created_at timestamp with time zone default now(),
  created_by text,
  core_company_id uuid not null references core.companies(id) on delete cascade,
  core_project_id uuid
);
alter table quality.sk_volumes add constraint sk_volumes_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;
alter table quality.sk_volumes add constraint sk_volumes_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_volumes_contractor ON quality.sk_volumes USING btree (project_code, contractor_name);
CREATE INDEX idx_sk_volumes_project_code ON quality.sk_volumes USING btree (project_code);
CREATE INDEX idx_sk_volumes_project_key ON quality.sk_volumes USING btree (project_code, project_canonical_key);
create index if not exists sk_volumes_core_company_idx on quality.sk_volumes (core_company_id, core_project_id);
create trigger sk_volumes_bind_company before insert or update on quality.sk_volumes
  for each row execute function quality.bind_company('company', '1');
alter table quality.sk_volumes enable row level security;
create policy sk_volumes_select on quality.sk_volumes for select to authenticated using (quality.can(core_company_id, core_project_id, '{quality.view}'));
create policy sk_volumes_insert on quality.sk_volumes for insert to authenticated with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_volumes_update on quality.sk_volumes for update to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'))
  with check (quality.can(core_company_id, core_project_id, '{quality.edit}'));
create policy sk_volumes_delete on quality.sk_volumes for delete to authenticated using (quality.can(core_company_id, core_project_id, '{quality.edit}'));
grant select, insert, update, delete on quality.sk_volumes to authenticated;

-- 6. Внешние ключи между таблицами quality (как в public)
alter table quality.contractors add constraint contractors_id_company_key unique (id, core_company_id);
alter table quality.contracts add constraint "contracts_contractorId_fkey" FOREIGN KEY ("contractorId", core_company_id) REFERENCES quality.contractors(id, core_company_id);
alter table quality.rbi_engineer_profiles add constraint rbi_engineer_profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table quality.shared_reports add constraint shared_reports_id_company_key unique (id, core_company_id);
alter table quality.shared_report_snapshots add constraint shared_report_snapshots_report_id_fkey FOREIGN KEY (report_id, core_company_id) REFERENCES quality.shared_reports(id, core_company_id) ON DELETE CASCADE;

-- 7. Права на выполнение: проверки — для RLS (authenticated); триггер — никому.
revoke all on function quality.request_company(), quality.can(uuid, uuid, text[]), quality.bind_company() from public, anon, authenticated;
grant execute on function quality.request_company(), quality.can(uuid, uuid, text[]) to authenticated;
revoke all on all tables in schema quality from anon;

commit;
