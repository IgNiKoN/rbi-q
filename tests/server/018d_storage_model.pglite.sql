-- P2-0016: ТОЛЬКО ДЛЯ PGlite — минимальная модель Storage (бакеты и объекты под RLS, как на сервере). Сервер этот файл не выполняет.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
insert into storage.buckets(id, name, public) select b, b, true
from unnest(array['construction-defects', 'construction-plans', 'custom-assets', 'inspection-photos', 'library-checklists', 'library-docs',
                  'library-etalons', 'library-nodes', 'library-practices', 'library-twi', 'reports', 'twi-pdfs']) b on conflict do nothing;
-- политика РБИ-образец (публичные бакеты читают все) — проверка, что 018d её не трогает
drop policy if exists rbi_public_read on storage.objects;
create policy rbi_public_read on storage.objects for select to anon, authenticated using (bucket_id in ('inspection-photos', 'reports'));
-- политика РБИ с сервера (снята 23.10.2026, только чтение pg_policies): руководитель/заместитель РБИ — ко ВСЕМ бакетам, без
-- ограничения по бакету. Разрешающие политики складываются через «или» — 018d должна закрыть от неё бакеты quality-*.
drop policy if exists rbi_admin_storage_access on storage.objects;
create policy rbi_admin_storage_access on storage.objects for all to authenticated
  using (public.rbi_current_role() = any (array['manager'::text, 'deputy_manager'::text]));
