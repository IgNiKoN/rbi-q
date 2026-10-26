-- P2-0042: ТОЛЬКО ДЛЯ PGlite. Права схемы public как на сервере (опись reports/P2-0042/inventory-server.md):
-- все таблицы public — anon и authenticated полностью, RLS включён; правила «для всех» (using(true), check(true));
-- функция ссылок на отчёты; права по умолчанию для новых объектов. По одной строке в таблицах, которые сервер отдаёт без входа.
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
  foreach t in array array['location_nodes', 'contracts', 'contractors', 'construction_floors_v2', 'construction_units_v2',
                           'construction_defects_v2', 'construction_acceptance_v2', 'rbi_company_settings'] loop
    execute format('create policy %I on public.%I for select using (true)', t || '_select_anon', t);
  end loop;
end $$;
create policy rbi_allowed_projects_select_public on public.allowed_projects for select to anon, authenticated using (true);
create policy "Allow insert to queue" on public.rbi_sync_queue for insert with check (true);
create policy "temp report snapshots public read by token" on public.shared_report_snapshots for select
  using (is_public = true and is_deleted is not true and (expires_at is null or expires_at > now()));

create sequence public.plan_fact_audit_id_seq;
grant usage, select, update on sequence public.plan_fact_audit_id_seq to anon, authenticated;

create function public.get_public_report_by_token(p_token text) returns setof public.shared_report_snapshots
language sql stable security definer set search_path = pg_catalog, public as $$
  select * from public.shared_report_snapshots where public_token = p_token and is_public and is_deleted is not true
$$;
grant execute on function public.get_public_report_by_token(text) to anon, authenticated;

alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;
-- на сервере объекты public создаёт supabase_admin — его права по умолчанию такие же
do $$ begin if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin; end if; end $$;
grant create, usage on schema public to supabase_admin;
alter default privileges for role supabase_admin in schema public grant all on tables to anon, authenticated;
alter default privileges for role supabase_admin in schema public grant all on sequences to anon, authenticated;
alter default privileges for role supabase_admin in schema public grant all on functions to anon, authenticated;

insert into public.location_nodes(id) values ('ln-041');
insert into public.contractors(id) values ('c-041');
insert into public.contracts(id, "contractorId") values ('ct-041', 'c-041');
insert into public.allowed_projects(code) values ('P041');
insert into public.shared_report_snapshots(id, html_content, public_token) values ('rs-041', '<p>отчёт</p>', 'tok-041');
