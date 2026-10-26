-- P2-0016: ТОЛЬКО ДЛЯ PGlite. Таблицы public.* Качества из снимка сервера 2026-10-23 (структура, без данных и политик).
-- СГЕНЕРИРОВАНО scripts/gen-quality-schema.mjs. Боевой сервер этот файл не выполняет.
drop table if exists public.allowed_projects cascade;
create table public.allowed_projects (
  code text not null,
  title text,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  name text,
  updated_at timestamp with time zone default now()
);
drop table if exists public.app_assistant_kb cascade;
create table public.app_assistant_kb (
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
  created_by_name text
);
drop table if exists public.construction_acceptance cascade;
create table public.construction_acceptance (
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
  "projectId" text
);
drop table if exists public.construction_acceptance_v2 cascade;
create table public.construction_acceptance_v2 (
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
  checklist_results jsonb
);
drop table if exists public.construction_buildings cascade;
create table public.construction_buildings (
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
  data jsonb
);
drop table if exists public.construction_defects cascade;
create table public.construction_defects (
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
  "projectId" text
);
drop table if exists public.construction_defects_v2 cascade;
create table public.construction_defects_v2 (
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
  version integer default 1 not null
);
drop table if exists public.construction_floors cascade;
create table public.construction_floors (
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
  data jsonb
);
drop table if exists public.construction_floors_v2 cascade;
create table public.construction_floors_v2 (
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
  version integer default 1 not null
);
drop table if exists public.construction_objects cascade;
create table public.construction_objects (
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
  data jsonb
);
drop table if exists public.construction_units cascade;
create table public.construction_units (
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
  sync_status text
);
drop table if exists public.construction_units_v2 cascade;
create table public.construction_units_v2 (
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
  pdf_size text
);
drop table if exists public.contractor_aliases cascade;
create table public.contractor_aliases (
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
  created_by_name text
);
drop table if exists public.contractor_directory cascade;
create table public.contractor_directory (
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
  created_by_name text
);
drop table if exists public.contractor_normalization_queue cascade;
create table public.contractor_normalization_queue (
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
  created_by_name text
);
drop table if exists public.contractors cascade;
create table public.contractors (
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
  contact_email text
);
drop table if exists public.contracts cascade;
create table public.contracts (
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
  version integer default 1 not null
);
drop table if exists public.file_registry cascade;
create table public.file_registry (
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
  updated_at timestamp with time zone default now()
);
drop table if exists public.location_node_aliases cascade;
create table public.location_node_aliases (
  id text not null,
  "companyId" text default 'rbi'::text not null,
  raw_name text,
  "locationId" text,
  created_by text,
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  version integer default 1 not null
);
drop table if exists public.location_nodes cascade;
create table public.location_nodes (
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
  sort_order integer default 0 not null
);
drop table if exists public.object_aliases cascade;
create table public.object_aliases (
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
  sync_status text
);
drop table if exists public.object_normalization_queue cascade;
create table public.object_normalization_queue (
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
  created_by_name text
);
drop table if exists public.project_fmea cascade;
create table public.project_fmea (
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
  deleted_by_auth_user_id uuid
);
drop table if exists public.project_interventions cascade;
create table public.project_interventions (
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
  deleted_by_auth_user_id uuid
);
drop table if exists public.project_meetings cascade;
create table public.project_meetings (
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
  deleted_by_auth_user_id uuid
);
drop table if exists public.project_objects cascade;
create table public.project_objects (
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
  created_by_name text
);
drop table if exists public.project_schedule_stages cascade;
create table public.project_schedule_stages (
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
  deleted_by_auth_user_id uuid
);
drop table if exists public.project_settings cascade;
create table public.project_settings (
  project_code text not null,
  logo_url text,
  brand_color text,
  updated_at timestamp with time zone default now()
);
drop table if exists public.rbi_company_settings cascade;
create table public.rbi_company_settings (
  company_id text default 'rbi'::text not null,
  role_matrix_overrides jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  official_templates jsonb default '{}'::jsonb not null
);
drop table if exists public.rbi_draft_sessions cascade;
create table public.rbi_draft_sessions (
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
  deleted_by_auth_user_id uuid
);
drop table if exists public.rbi_engineer_profiles cascade;
create table public.rbi_engineer_profiles (
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
  last_auth_at timestamp with time zone
);
drop table if exists public.rbi_engineer_ratings cascade;
create table public.rbi_engineer_ratings (
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
  deleted_at timestamp with time zone
);
drop table if exists public.rbi_error_logs cascade;
create table public.rbi_error_logs (
  id uuid default gen_random_uuid() not null,
  device_id text,
  project_code text,
  message text,
  stack text,
  app_version text,
  created_at timestamp with time zone default now(),
  auth_user_id uuid,
  engineer_name text,
  role text
);
drop table if exists public.rbi_inspection_items cascade;
create table public.rbi_inspection_items (
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
  deleted_at timestamp with time zone
);
drop table if exists public.rbi_inspection_photos cascade;
create table public.rbi_inspection_photos (
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
  photo_index integer default 0 not null
);
drop table if exists public.rbi_inspections cascade;
create table public.rbi_inspections (
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
  "projectId" text
);
drop table if exists public.rbi_sync_queue cascade;
create table public.rbi_sync_queue (
  id uuid default gen_random_uuid() not null,
  project_code text not null,
  engineer_name text not null,
  action_type text not null,
  payload jsonb not null,
  status text default 'pending'::text,
  device_id text,
  created_at timestamp with time zone default now()
);
drop table if exists public.rbi_tasks cascade;
create table public.rbi_tasks (
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
  contractor_canonical_key text
);
drop table if exists public.shared_checklists cascade;
create table public.shared_checklists (
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
  deleted_by_auth_user_id uuid
);
drop table if exists public.shared_docs cascade;
create table public.shared_docs (
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
  deleted_by_auth_user_id uuid
);
drop table if exists public.shared_etalons cascade;
create table public.shared_etalons (
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
  deleted_by_auth_user_id uuid
);
drop table if exists public.shared_feedback cascade;
create table public.shared_feedback (
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
  updated_by_auth_user_id uuid
);
drop table if exists public.shared_nodes cascade;
create table public.shared_nodes (
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
  deleted_by_auth_user_id uuid
);
drop table if exists public.shared_practices cascade;
create table public.shared_practices (
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
  deleted_by_auth_user_id uuid
);
drop table if exists public.shared_report_snapshots cascade;
create table public.shared_report_snapshots (
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
  sync_status text
);
drop table if exists public.shared_report_templates cascade;
create table public.shared_report_templates (
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
  deleted_at timestamp with time zone
);
drop table if exists public.shared_reports cascade;
create table public.shared_reports (
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
  published_at timestamp with time zone
);
drop table if exists public.shared_twi_cards cascade;
create table public.shared_twi_cards (
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
  deleted_by_auth_user_id uuid
);
drop table if exists public.sk_category_map cascade;
create table public.sk_category_map (
  id text not null,
  project_code text not null,
  data jsonb not null,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  created_by text
);
drop table if exists public.sk_contractor_map cascade;
create table public.sk_contractor_map (
  id text not null,
  project_code text not null,
  data jsonb not null,
  updated_at timestamp with time zone default now(),
  contractor_name text,
  created_at timestamp with time zone default now(),
  created_by text
);
drop table if exists public.sk_data_bundles cascade;
create table public.sk_data_bundles (
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
  sync_block_reason text default ''::text
);
drop table if exists public.sk_import_batches cascade;
create table public.sk_import_batches (
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
  deleted_at timestamp with time zone
);
drop table if exists public.sk_mapping cascade;
create table public.sk_mapping (
  id text not null,
  project_code text not null,
  data jsonb not null,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  created_by text
);
drop table if exists public.sk_records cascade;
create table public.sk_records (
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
  "projectId" text
);
drop table if exists public.sk_volumes cascade;
create table public.sk_volumes (
  id text not null,
  project_code text not null,
  data jsonb not null,
  updated_at timestamp with time zone default now(),
  project_canonical_key text,
  project_display_name text,
  contractor_name text,
  created_at timestamp with time zone default now(),
  created_by text
);
alter table public.allowed_projects add constraint allowed_projects_pkey PRIMARY KEY (code);
alter table public.app_assistant_kb add constraint app_assistant_kb_pkey PRIMARY KEY (id);
CREATE INDEX idx_assistant_question_fts ON public.app_assistant_kb USING gin (to_tsvector('russian'::regconfig, question));
CREATE INDEX idx_assistant_tags ON public.app_assistant_kb USING gin (tags);
alter table public.construction_acceptance add constraint construction_acceptance_pkey PRIMARY KEY (id);
alter table public.construction_acceptance_v2 add constraint construction_acceptance_v2_pkey PRIMARY KEY (id);
alter table public.construction_buildings add constraint construction_buildings_pkey PRIMARY KEY (id);
alter table public.construction_defects add constraint construction_defects_pkey PRIMARY KEY (id);
alter table public.construction_defects_v2 add constraint construction_defects_v2_pkey PRIMARY KEY (id);
alter table public.construction_floors add constraint construction_floors_pkey PRIMARY KEY (id);
alter table public.construction_floors_v2 add constraint construction_floors_v2_pkey PRIMARY KEY (id);
CREATE INDEX construction_floors_v2_location_idx ON public.construction_floors_v2 USING btree ("locationId") WHERE (is_deleted = false);
alter table public.construction_objects add constraint construction_objects_pkey PRIMARY KEY (id);
alter table public.construction_units add constraint construction_units_pkey PRIMARY KEY (id);
alter table public.construction_units_v2 add constraint construction_units_v2_pkey PRIMARY KEY (id);
alter table public.contractor_aliases add constraint contractor_aliases_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX contractor_aliases_project_code_raw_name_uidx ON public.contractor_aliases USING btree (project_code, raw_name);
CREATE INDEX idx_contractor_aliases_key ON public.contractor_aliases USING btree (project_code, canonical_key);
CREATE UNIQUE INDEX idx_contractor_aliases_unique ON public.contractor_aliases USING btree (project_code, raw_name);
alter table public.contractor_directory add constraint contractor_directory_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX contractor_directory_project_code_canonical_key_uidx ON public.contractor_directory USING btree (project_code, canonical_key);
CREATE UNIQUE INDEX idx_contractor_directory_key ON public.contractor_directory USING btree (project_code, canonical_key) WHERE (is_deleted = false);
CREATE INDEX idx_contractor_directory_project ON public.contractor_directory USING btree (project_code);
alter table public.contractor_normalization_queue add constraint contractor_normalization_queue_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX contractor_queue_project_code_raw_name_uidx ON public.contractor_normalization_queue USING btree (project_code, raw_name);
CREATE UNIQUE INDEX idx_contractor_queue_project_raw_name ON public.contractor_normalization_queue USING btree (project_code, raw_name);
CREATE INDEX idx_contractor_queue_project_status ON public.contractor_normalization_queue USING btree (project_code, status);
alter table public.contractors add constraint contractors_pkey PRIMARY KEY (id);
alter table public.contracts add constraint contracts_pkey PRIMARY KEY (id);
alter table public.file_registry add constraint file_registry_bucket_storage_path_key UNIQUE (bucket, storage_path);
alter table public.file_registry add constraint file_registry_cache_policy_check CHECK ((cache_policy = ANY (ARRAY['auto'::text, 'prefer_offline'::text, 'cloud_only'::text])));
alter table public.file_registry add constraint file_registry_cache_status_check CHECK ((cache_status = ANY (ARRAY['local_only'::text, 'cached_cloud'::text, 'cloud_only'::text])));
alter table public.file_registry add constraint file_registry_pkey PRIMARY KEY (id);
CREATE INDEX idx_file_registry_cache_status ON public.file_registry USING btree (cache_status);
CREATE INDEX idx_file_registry_entity ON public.file_registry USING btree (entity_type, entity_id);
CREATE INDEX idx_file_registry_is_deleted ON public.file_registry USING btree (is_deleted);
CREATE INDEX idx_file_registry_last_accessed ON public.file_registry USING btree (last_accessed_at);
CREATE INDEX idx_file_registry_project ON public.file_registry USING btree (project_code);
CREATE INDEX idx_file_registry_storage_path ON public.file_registry USING btree (bucket, storage_path);
alter table public.location_node_aliases add constraint location_node_aliases_pkey PRIMARY KEY (id);
alter table public.location_nodes add constraint location_nodes_pkey PRIMARY KEY (id);
CREATE INDEX location_nodes_parent_idx ON public.location_nodes USING btree ("parentId") WHERE (is_deleted = false);
CREATE INDEX location_nodes_type_idx ON public.location_nodes USING btree ("nodeType") WHERE (is_deleted = false);
alter table public.object_aliases add constraint object_aliases_pkey PRIMARY KEY (id);
alter table public.object_aliases add constraint object_aliases_raw_name_key UNIQUE (raw_name);
CREATE INDEX idx_object_aliases_project_key ON public.object_aliases USING btree (project_code, canonical_key);
CREATE UNIQUE INDEX idx_object_aliases_project_raw ON public.object_aliases USING btree (project_code, raw_name);
CREATE UNIQUE INDEX idx_object_aliases_unique ON public.object_aliases USING btree (project_code, raw_name);
alter table public.object_normalization_queue add constraint object_normalization_queue_pkey PRIMARY KEY (id);
CREATE INDEX idx_object_norm_queue_project_status ON public.object_normalization_queue USING btree (project_code, status);
CREATE INDEX idx_object_norm_queue_raw_name ON public.object_normalization_queue USING btree (raw_name);
CREATE INDEX idx_object_normalization_queue_project_status ON public.object_normalization_queue USING btree (project_code, status);
CREATE UNIQUE INDEX object_queue_project_code_raw_name_uidx ON public.object_normalization_queue USING btree (project_code, raw_name);
alter table public.project_fmea add constraint project_fmea_pkey PRIMARY KEY (id);
CREATE INDEX idx_project_fmea_contractor ON public.project_fmea USING btree (project_code, contractor_name);
CREATE INDEX idx_project_fmea_engineer ON public.project_fmea USING btree (project_code, engineer_name);
CREATE INDEX idx_project_fmea_project_code ON public.project_fmea USING btree (project_code);
CREATE INDEX idx_project_fmea_project_key ON public.project_fmea USING btree (project_code, project_canonical_key);
CREATE INDEX idx_project_fmea_sync_status ON public.project_fmea USING btree (sync_status);
CREATE INDEX idx_project_fmea_updated ON public.project_fmea USING btree (updated_at);
alter table public.project_interventions add constraint project_interventions_pkey PRIMARY KEY (id);
CREATE INDEX idx_project_interventions_contractor ON public.project_interventions USING btree (project_code, contractor_name);
CREATE INDEX idx_project_interventions_engineer ON public.project_interventions USING btree (project_code, engineer_name);
CREATE INDEX idx_project_interventions_project_code ON public.project_interventions USING btree (project_code);
CREATE INDEX idx_project_interventions_project_key ON public.project_interventions USING btree (project_code, project_canonical_key);
CREATE INDEX idx_project_interventions_sync_status ON public.project_interventions USING btree (sync_status);
CREATE INDEX idx_project_interventions_updated ON public.project_interventions USING btree (updated_at);
alter table public.project_meetings add constraint project_meetings_pkey PRIMARY KEY (id);
CREATE INDEX idx_project_meetings_contractor ON public.project_meetings USING btree (project_code, contractor_name);
CREATE INDEX idx_project_meetings_engineer ON public.project_meetings USING btree (project_code, engineer_name);
CREATE INDEX idx_project_meetings_project_code ON public.project_meetings USING btree (project_code);
CREATE INDEX idx_project_meetings_project_key ON public.project_meetings USING btree (project_code, project_canonical_key);
CREATE INDEX idx_project_meetings_sync_status ON public.project_meetings USING btree (sync_status);
CREATE INDEX idx_project_meetings_updated ON public.project_meetings USING btree (updated_at);
alter table public.project_objects add constraint project_objects_canonical_key_key UNIQUE (canonical_key);
alter table public.project_objects add constraint project_objects_pkey PRIMARY KEY (id);
CREATE INDEX idx_project_objects_display_name ON public.project_objects USING btree (display_name);
CREATE INDEX idx_project_objects_project_code ON public.project_objects USING btree (project_code);
CREATE UNIQUE INDEX idx_project_objects_project_key ON public.project_objects USING btree (project_code, canonical_key) WHERE (COALESCE(is_deleted, false) = false);
CREATE UNIQUE INDEX idx_project_objects_unique_key ON public.project_objects USING btree (project_code, canonical_key) WHERE (is_deleted = false);
alter table public.project_schedule_stages add constraint project_schedule_stages_pkey PRIMARY KEY (id);
CREATE INDEX idx_project_schedule_contractor ON public.project_schedule_stages USING btree (project_code, contractor_name);
CREATE INDEX idx_project_schedule_project_key ON public.project_schedule_stages USING btree (project_code, project_canonical_key);
CREATE INDEX idx_project_schedule_stages_contractor ON public.project_schedule_stages USING btree (project_code, contractor_name);
CREATE INDEX idx_project_schedule_stages_engineer ON public.project_schedule_stages USING btree (project_code, engineer_name);
CREATE INDEX idx_project_schedule_stages_project_code ON public.project_schedule_stages USING btree (project_code);
CREATE INDEX idx_project_schedule_stages_project_key ON public.project_schedule_stages USING btree (project_code, project_canonical_key);
CREATE INDEX idx_project_schedule_stages_updated ON public.project_schedule_stages USING btree (updated_at);
alter table public.project_settings add constraint project_settings_pkey PRIMARY KEY (project_code);
alter table public.rbi_company_settings add constraint rbi_company_settings_pkey PRIMARY KEY (company_id);
alter table public.rbi_draft_sessions add constraint rbi_draft_sessions_pkey PRIMARY KEY (id);
CREATE INDEX idx_rbi_drafts_project_engineer ON public.rbi_draft_sessions USING btree (project_code, engineer_name);
alter table public.rbi_engineer_profiles add constraint chk_rbi_profiles_cloud_status CHECK ((cloud_status = ANY (ARRAY['pending'::text, 'approved'::text, 'blocked'::text]))) NOT VALID;
alter table public.rbi_engineer_profiles add constraint chk_rbi_profiles_role CHECK ((role = ANY (ARRAY['guest'::text, 'contractor'::text, 'engineer'::text, 'project_manager'::text, 'deputy_manager'::text, 'manager'::text, 'director'::text]))) NOT VALID;
alter table public.rbi_engineer_profiles add constraint rbi_engineer_profiles_inspector_id_key UNIQUE (inspector_id);
alter table public.rbi_engineer_profiles add constraint rbi_engineer_profiles_pkey PRIMARY KEY (id);
CREATE INDEX idx_rbi_profiles_cloud_status ON public.rbi_engineer_profiles USING btree (cloud_status);
CREATE UNIQUE INDEX idx_rbi_profiles_inspector_id ON public.rbi_engineer_profiles USING btree (inspector_id);
CREATE INDEX idx_rbi_profiles_project_code ON public.rbi_engineer_profiles USING btree (project_code);
CREATE UNIQUE INDEX idx_rbi_profiles_project_engineer ON public.rbi_engineer_profiles USING btree (project_code, engineer_name);
CREATE INDEX idx_rbi_profiles_role ON public.rbi_engineer_profiles USING btree (role);
CREATE UNIQUE INDEX rbi_engineer_profiles_auth_email_uidx ON public.rbi_engineer_profiles USING btree (lower(auth_email)) WHERE (auth_email IS NOT NULL);
CREATE UNIQUE INDEX rbi_engineer_profiles_auth_user_id_uidx ON public.rbi_engineer_profiles USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);
CREATE UNIQUE INDEX rbi_engineer_profiles_inspector_id_uidx ON public.rbi_engineer_profiles USING btree (inspector_id);
CREATE UNIQUE INDEX rbi_engineer_profiles_project_inspector_uidx ON public.rbi_engineer_profiles USING btree (project_code, inspector_id);
alter table public.rbi_engineer_ratings add constraint rbi_engineer_ratings_pkey PRIMARY KEY (id);
alter table public.rbi_engineer_ratings add constraint rbi_engineer_ratings_project_code_engineer_name_key UNIQUE (project_code, engineer_name);
CREATE INDEX idx_rbi_engineer_ratings_project_pi ON public.rbi_engineer_ratings USING btree (project_code, pi DESC);
CREATE UNIQUE INDEX idx_rbi_ratings_project_engineer ON public.rbi_engineer_ratings USING btree (project_code, engineer_name);
alter table public.rbi_error_logs add constraint rbi_error_logs_pkey PRIMARY KEY (id);
alter table public.rbi_inspection_items add constraint rbi_inspection_items_pkey PRIMARY KEY (id);
CREATE INDEX idx_rbi_inspection_items_project_key ON public.rbi_inspection_items USING btree (project_code, project_canonical_key);
CREATE INDEX idx_rbi_inspection_items_sync_status ON public.rbi_inspection_items USING btree (sync_status);
CREATE INDEX idx_rbi_items_inspection ON public.rbi_inspection_items USING btree (inspection_id);
CREATE INDEX idx_rbi_items_project ON public.rbi_inspection_items USING btree (project_code, project_canonical_key);
alter table public.rbi_inspection_photos add constraint rbi_inspection_photos_pkey PRIMARY KEY (id);
CREATE INDEX idx_rbi_inspection_photos_item_order ON public.rbi_inspection_photos USING btree (inspection_id, item_id, photo_index);
CREATE INDEX idx_rbi_inspection_photos_project_key ON public.rbi_inspection_photos USING btree (project_code, project_canonical_key);
CREATE INDEX idx_rbi_inspection_photos_sync_status ON public.rbi_inspection_photos USING btree (sync_status);
CREATE INDEX idx_rbi_photos_inspection ON public.rbi_inspection_photos USING btree (inspection_id);
CREATE INDEX idx_rbi_photos_project ON public.rbi_inspection_photos USING btree (project_code, project_canonical_key);
alter table public.rbi_inspections add constraint chk_rbi_inspections_source CHECK ((source = ANY (ARRAY['local'::text, 'cloud'::text]))) NOT VALID;
alter table public.rbi_inspections add constraint chk_rbi_inspections_sync_status CHECK ((sync_status = ANY (ARRAY['not_synced'::text, 'synced'::text, 'blocked'::text]))) NOT VALID;
alter table public.rbi_inspections add constraint rbi_inspections_pkey PRIMARY KEY (id);
CREATE INDEX idx_rbi_inspections_contractor ON public.rbi_inspections USING btree (project_code, contractor_name);
CREATE INDEX idx_rbi_inspections_engineer ON public.rbi_inspections USING btree (project_code, engineer_name);
CREATE INDEX idx_rbi_inspections_inspector ON public.rbi_inspections USING btree (project_code, inspector_name);
CREATE INDEX idx_rbi_inspections_project ON public.rbi_inspections USING btree (project_code);
CREATE INDEX idx_rbi_inspections_project_code ON public.rbi_inspections USING btree (project_code);
CREATE INDEX idx_rbi_inspections_project_key ON public.rbi_inspections USING btree (project_code, project_canonical_key);
CREATE INDEX idx_rbi_inspections_project_updated ON public.rbi_inspections USING btree (project_code, updated_at);
CREATE INDEX idx_rbi_inspections_sync_status ON public.rbi_inspections USING btree (sync_status);
CREATE INDEX idx_rbi_inspections_updated ON public.rbi_inspections USING btree (updated_at);
alter table public.rbi_sync_queue add constraint rbi_sync_queue_pkey PRIMARY KEY (id);
alter table public.rbi_tasks add constraint chk_rbi_tasks_source CHECK ((source = ANY (ARRAY['local'::text, 'cloud'::text]))) NOT VALID;
alter table public.rbi_tasks add constraint chk_rbi_tasks_sync_status CHECK ((sync_status = ANY (ARRAY['not_synced'::text, 'synced'::text, 'blocked'::text]))) NOT VALID;
alter table public.rbi_tasks add constraint rbi_tasks_pkey PRIMARY KEY (id);
CREATE INDEX idx_rbi_tasks_contractor ON public.rbi_tasks USING btree (project_code, contractor_name);
CREATE INDEX idx_rbi_tasks_engineer ON public.rbi_tasks USING btree (project_code, engineer_name);
CREATE INDEX idx_rbi_tasks_inspector ON public.rbi_tasks USING btree (project_code, inspector_name);
CREATE INDEX idx_rbi_tasks_project_key ON public.rbi_tasks USING btree (project_code, project_canonical_key);
CREATE INDEX idx_rbi_tasks_project_updated ON public.rbi_tasks USING btree (project_code, updated_at);
CREATE INDEX idx_rbi_tasks_sync_status ON public.rbi_tasks USING btree (sync_status);
CREATE INDEX idx_rbi_tasks_updated ON public.rbi_tasks USING btree (updated_at);
alter table public.shared_checklists add constraint shared_checklists_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_checklists_owner ON public.shared_checklists USING btree (owner);
CREATE INDEX idx_shared_checklists_updated ON public.shared_checklists USING btree (updated_at);
alter table public.shared_docs add constraint shared_docs_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_docs_owner ON public.shared_docs USING btree (owner);
CREATE INDEX idx_shared_docs_updated ON public.shared_docs USING btree (updated_at);
alter table public.shared_etalons add constraint shared_etalons_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_etalons_owner ON public.shared_etalons USING btree (owner);
CREATE INDEX idx_shared_etalons_updated ON public.shared_etalons USING btree (updated_at);
alter table public.shared_feedback add constraint shared_feedback_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_feedback_owner ON public.shared_feedback USING btree (owner);
CREATE INDEX idx_shared_feedback_updated ON public.shared_feedback USING btree (updated_at);
alter table public.shared_nodes add constraint shared_nodes_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_nodes_owner ON public.shared_nodes USING btree (owner);
CREATE INDEX idx_shared_nodes_updated ON public.shared_nodes USING btree (updated_at);
alter table public.shared_practices add constraint shared_practices_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_practices_owner ON public.shared_practices USING btree (owner);
CREATE INDEX idx_shared_practices_updated ON public.shared_practices USING btree (updated_at);
alter table public.shared_report_snapshots add constraint shared_report_snapshots_pkey PRIMARY KEY (id);
CREATE INDEX idx_snapshots_report ON public.shared_report_snapshots USING btree (report_id);
CREATE UNIQUE INDEX shared_report_snapshots_public_token_uidx ON public.shared_report_snapshots USING btree (public_token) WHERE (public_token IS NOT NULL);
alter table public.shared_report_templates add constraint shared_report_templates_pkey PRIMARY KEY (id);
CREATE INDEX idx_rep_templates_project ON public.shared_report_templates USING btree (project_code);
alter table public.shared_reports add constraint shared_reports_pkey PRIMARY KEY (id);
CREATE INDEX idx_reports_generated ON public.shared_reports USING btree (generated_at DESC);
CREATE INDEX idx_reports_project ON public.shared_reports USING btree (project_code);
alter table public.shared_twi_cards add constraint shared_twi_cards_pkey PRIMARY KEY (id);
CREATE INDEX idx_shared_twi_cards_owner ON public.shared_twi_cards USING btree (owner);
CREATE INDEX idx_shared_twi_cards_updated ON public.shared_twi_cards USING btree (updated_at);
alter table public.sk_category_map add constraint sk_category_map_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_category_map_project_code ON public.sk_category_map USING btree (project_code);
alter table public.sk_contractor_map add constraint sk_contractor_map_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_contractor_map_contractor ON public.sk_contractor_map USING btree (project_code, contractor_name);
CREATE INDEX idx_sk_contractor_map_project_code ON public.sk_contractor_map USING btree (project_code);
alter table public.sk_data_bundles add constraint chk_sk_data_bundles_source CHECK ((source = ANY (ARRAY['local'::text, 'cloud'::text]))) NOT VALID;
alter table public.sk_data_bundles add constraint chk_sk_data_bundles_sync_status CHECK ((sync_status = ANY (ARRAY['not_synced'::text, 'synced'::text, 'blocked'::text]))) NOT VALID;
alter table public.sk_data_bundles add constraint sk_data_bundles_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_data_bundles_contractor ON public.sk_data_bundles USING btree (project_code, contractor_name);
CREATE INDEX idx_sk_data_bundles_engineer ON public.sk_data_bundles USING btree (project_code, engineer_name);
CREATE INDEX idx_sk_data_bundles_inspector ON public.sk_data_bundles USING btree (project_code, inspector_name);
CREATE INDEX idx_sk_data_bundles_project_code ON public.sk_data_bundles USING btree (project_code);
CREATE INDEX idx_sk_data_bundles_project_key ON public.sk_data_bundles USING btree (project_code, project_canonical_key);
CREATE INDEX idx_sk_data_bundles_sync_status ON public.sk_data_bundles USING btree (sync_status);
CREATE INDEX idx_sk_data_bundles_updated ON public.sk_data_bundles USING btree (updated_at);
alter table public.sk_import_batches add constraint sk_import_batches_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_import_batches_project ON public.sk_import_batches USING btree (project_code, uploaded_at);
CREATE INDEX idx_sk_import_batches_uploaded_by ON public.sk_import_batches USING btree (project_code, uploaded_by);
alter table public.sk_mapping add constraint sk_mapping_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_mapping_project_code ON public.sk_mapping USING btree (project_code);
alter table public.sk_records add constraint sk_records_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_records_contractor_key ON public.sk_records USING btree (project_code, contractor_canonical_key);
CREATE UNIQUE INDEX idx_sk_records_project_number ON public.sk_records USING btree (project_code, sk_number);
CREATE INDEX idx_sk_records_project_object ON public.sk_records USING btree (project_code, project_canonical_key);
CREATE INDEX idx_sk_records_status ON public.sk_records USING btree (project_code, status_normalized);
CREATE UNIQUE INDEX idx_sk_records_unique_key ON public.sk_records USING btree (sk_unique_key);
CREATE INDEX idx_sk_records_uploaded_by ON public.sk_records USING btree (project_code, uploaded_by);
alter table public.sk_volumes add constraint sk_volumes_pkey PRIMARY KEY (id);
CREATE INDEX idx_sk_volumes_contractor ON public.sk_volumes USING btree (project_code, contractor_name);
CREATE INDEX idx_sk_volumes_project_code ON public.sk_volumes USING btree (project_code);
CREATE INDEX idx_sk_volumes_project_key ON public.sk_volumes USING btree (project_code, project_canonical_key);
alter table public.contracts add constraint "contracts_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES contractors(id);
alter table public.rbi_engineer_profiles add constraint rbi_engineer_profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.shared_report_snapshots add constraint shared_report_snapshots_report_id_fkey FOREIGN KEY (report_id) REFERENCES shared_reports(id) ON DELETE CASCADE;
