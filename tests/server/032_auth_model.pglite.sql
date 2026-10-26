-- P2-0028: ТОЛЬКО ДЛЯ PGlite — столбцы auth.users и таблицы auth.identities / sessions / refresh_tokens, которые
-- использует 032 (на сервере они есть у GoTrue). Боевой сервер этот файл не выполняет.
alter table auth.users add column if not exists instance_id uuid;
alter table auth.users add column if not exists encrypted_password text;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists raw_app_meta_data jsonb;
alter table auth.users add column if not exists raw_user_meta_data jsonb;
alter table auth.users add column if not exists created_at timestamptz;
alter table auth.users add column if not exists updated_at timestamptz;
alter table auth.users add column if not exists confirmation_token text;
alter table auth.users add column if not exists recovery_token text;
alter table auth.users add column if not exists email_change_token_new text;
alter table auth.users add column if not exists email_change text;
alter table auth.users add column if not exists banned_until timestamptz;
create table if not exists auth.identities (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, provider_id text not null,
  identity_data jsonb not null, provider text not null, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
create table if not exists auth.refresh_tokens (id bigserial primary key, user_id varchar(255), token varchar(255), session_id uuid);
