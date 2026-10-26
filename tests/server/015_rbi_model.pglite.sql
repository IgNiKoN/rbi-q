-- P2-0014: ТОЛЬКО ДЛЯ PGlite — копия объектов профиля Качества с сервера (аудит 22.10.2026: 015_rbi_audit*.sql).
-- Политики, функции и триггеры — как на сервере; данные — тестовые. Боевой сервер этот файл не выполняет.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create schema if not exists planfact;
grant usage on schema auth, public to anon, authenticated, service_role;
grant usage on schema planfact to authenticated;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table if not exists public.rbi_engineer_profiles (
  id uuid primary key default gen_random_uuid(),
  inspector_id text, inspector_name text, engineer_name text, project_code text, pin_hash text,
  profile_data jsonb default '{}'::jsonb, settings jsonb default '{}'::jsonb,
  last_seen_at timestamptz default now(), created_at timestamptz default now(), updated_at timestamptz default now(),
  role text default 'guest'::text, assigned_contractor text default ''::text, assigned_projects text[] default '{}'::text[],
  cloud_status text default 'pending'::text, contractor_name text default ''::text,
  auth_user_id uuid, auth_email text, last_auth_at timestamptz
);
create unique index if not exists idx_rbi_profiles_inspector_id on public.rbi_engineer_profiles (inspector_id);
create unique index if not exists idx_rbi_profiles_project_engineer on public.rbi_engineer_profiles (project_code, engineer_name);
create unique index if not exists rbi_engineer_profiles_auth_email_uidx on public.rbi_engineer_profiles (lower(auth_email)) where auth_email is not null;
create unique index if not exists rbi_engineer_profiles_auth_user_id_uidx on public.rbi_engineer_profiles (auth_user_id) where auth_user_id is not null;
create table if not exists auth.users (id uuid primary key, email text, aud text, role text);
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000e1') on conflict do nothing;
alter table public.rbi_engineer_profiles drop constraint if exists rbi_engineer_profiles_auth_user_id_fkey;
alter table public.rbi_engineer_profiles add constraint rbi_engineer_profiles_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete set null;
grant all on public.rbi_engineer_profiles to anon, authenticated, service_role;
alter table public.rbi_engineer_profiles enable row level security;

create or replace function public.rbi_can_manage_profiles(target_project_code text) returns boolean
language sql stable security definer set search_path to 'public' as $function$
select exists (select 1 from public.rbi_engineer_profiles p where p.auth_user_id = auth.uid()
  and p.project_code = target_project_code and p.cloud_status = 'approved' and p.role in ('manager', 'deputy_manager'));
$function$;
create or replace function public.rbi_can_view_profiles(target_project_code text) returns boolean
language sql stable security definer set search_path to 'public' as $function$
select exists (select 1 from public.rbi_engineer_profiles p where p.auth_user_id = auth.uid()
  and p.project_code = target_project_code and p.cloud_status = 'approved' and p.role in ('manager', 'deputy_manager', 'director'));
$function$;
create or replace function public.rbi_current_role() returns text
language sql stable security definer set search_path to 'public' as $function$
select coalesce((select p.role from public.rbi_engineer_profiles p where p.auth_user_id = auth.uid() limit 1), 'guest');
$function$;
create or replace function public.rbi_current_project_code() returns text
language sql stable security definer set search_path to 'public' as $function$
select coalesce((select p.project_code from public.rbi_engineer_profiles p where p.auth_user_id = auth.uid() limit 1), '');
$function$;
create or replace function public.rbi_is_approved() returns boolean
language sql stable security definer set search_path to 'public' as $function$
select exists (select 1 from public.rbi_engineer_profiles p where p.auth_user_id = auth.uid() and p.cloud_status = 'approved');
$function$;
create or replace function public.set_updated_at() returns trigger language plpgsql as $function$
begin new.updated_at = now(); return new; end; $function$;
create or replace function public.rbi_guard_profile_update() returns trigger language plpgsql as $function$
BEGIN
  IF current_role IN ('postgres', 'service_role', 'supabase_admin') THEN RETURN NEW; END IF;
  IF public.rbi_can_manage_profiles(OLD.project_code) THEN RETURN NEW; END IF;
  IF OLD.auth_user_id IS NULL THEN
    NEW.role := OLD.role; NEW.cloud_status := OLD.cloud_status;
    NEW.assigned_projects := OLD.assigned_projects; NEW.assigned_contractor := OLD.assigned_contractor;
    RETURN NEW;
  END IF;
  IF OLD.auth_user_id = auth.uid() THEN
    NEW.project_code := OLD.project_code; NEW.inspector_id := OLD.inspector_id; NEW.role := OLD.role;
    NEW.cloud_status := OLD.cloud_status; NEW.assigned_projects := OLD.assigned_projects;
    NEW.assigned_contractor := OLD.assigned_contractor; NEW.contractor_name := OLD.contractor_name;
    NEW.settings := OLD.settings; NEW.auth_user_id := OLD.auth_user_id; NEW.auth_email := OLD.auth_email;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'RBI profile update denied';
END; $function$;
drop trigger if exists trg_rbi_guard_profile_update on public.rbi_engineer_profiles;
create trigger trg_rbi_guard_profile_update before update on public.rbi_engineer_profiles
  for each row execute function rbi_guard_profile_update();
drop trigger if exists trg_rbi_profiles_updated_at on public.rbi_engineer_profiles;
create trigger trg_rbi_profiles_updated_at before update on public.rbi_engineer_profiles
  for each row execute function set_updated_at();

drop policy if exists rbi_profiles_delete_policy on public.rbi_engineer_profiles;
create policy rbi_profiles_delete_policy on public.rbi_engineer_profiles for delete to authenticated
  using (rbi_can_manage_profiles(project_code));
drop policy if exists rbi_profiles_insert_policy on public.rbi_engineer_profiles;
create policy rbi_profiles_insert_policy on public.rbi_engineer_profiles for insert to public
  with check ((auth_user_id = auth.uid()) or rbi_can_manage_profiles(project_code));
drop policy if exists rbi_profiles_select_policy on public.rbi_engineer_profiles;
create policy rbi_profiles_select_policy on public.rbi_engineer_profiles for select to public
  using ((auth_user_id = auth.uid()) or (auth_user_id is null) or rbi_can_view_profiles(project_code));
drop policy if exists rbi_profiles_update_policy on public.rbi_engineer_profiles;
create policy rbi_profiles_update_policy on public.rbi_engineer_profiles for update to public
  using ((auth_user_id = auth.uid()) or (auth_user_id is null) or rbi_can_manage_profiles(project_code))
  with check ((auth_user_id = auth.uid()) or rbi_can_manage_profiles(project_code));
drop policy if exists rbi_super_admin_access on public.rbi_engineer_profiles;
create policy rbi_super_admin_access on public.rbi_engineer_profiles for all to authenticated
  using ((rbi_current_role() = any (array['manager'::text, 'deputy_manager'::text])) and (project_code = rbi_current_project_code()));

-- тестовые профили: руководитель и инженер проекта TEST-P2 (одобрены)
insert into public.rbi_engineer_profiles (inspector_id, engineer_name, project_code, role, cloud_status, assigned_projects, auth_user_id)
values ('t-manager', 'Руководитель', 'TEST-P2', 'manager', 'approved', '{TEST-P2}', '00000000-0000-0000-0000-0000000000a1'),
       ('t-engineer', 'Инженер', 'TEST-P2', 'engineer', 'approved', '{TEST-P2}', '00000000-0000-0000-0000-0000000000e1')
on conflict do nothing;
