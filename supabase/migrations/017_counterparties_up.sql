-- P2-0015 этап 3. Контрагенты компании (ядро) + правила данных на будущее (specs/2026-10-23-platform-data-architecture.md).
-- Только core.* / planfact.* / public.pf_*. Объекты RBI/Quality, Auth и Storage не затрагивает. Применять после 016.
-- Запись — только через public.pf_counterparties_* (security definer, право core.counterparties.manage проверяется внутри).
-- Повторное применение безопасно. Откат — 017_counterparties_down.sql.

-- 1. Правила данных: updated_at (+ триггер) у таблиц ядра, deleted_at у сущностей, где его нет (для будущей работы без сети).
--    Журнал (audit_log) неизменяем — без updated_at. Связки с составным ключом и назначения (revoked_at) — без deleted_at.
create or replace function core.touch_updated_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke all on function core.touch_updated_at() from public, anon;

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'company_members', 'platform_admins', 'module_catalog', 'company_modules',
    'permission_catalog', 'role_templates', 'role_template_permissions',
    'company_roles', 'company_role_permissions', 'role_assignments',
    'projects', 'locations', 'units', 'work_types'
  ] loop
    execute format('alter table core.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('drop trigger if exists %I on core.%I', t || '_touch', t);
    execute format('create trigger %I before update on core.%I for each row execute function core.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['companies', 'projects', 'company_roles'] loop
    execute format('alter table core.%I add column if not exists deleted_at timestamptz', t);
  end loop;
end $$;

-- 2. Контрагенты
create table if not exists core.counterparties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 300),
  inn text not null check (inn ~ '^([0-9]{10}|[0-9]{12})$'),
  kpp text check (kpp is null or kpp ~ '^[0-9]{4}[0-9A-Z]{2}[0-9]{3}$'),
  kinds text[] not null check (cardinality(kinds) >= 1
    and kinds <@ array['customer', 'general_contractor', 'contractor', 'supplier']::text[]),
  requisites jsonb not null default '{}'::jsonb check (jsonb_typeof(requisites) = 'object'),
  platform_company_id uuid references core.companies(id) on delete set null,  -- контрагент = компания на платформе (обмен документами — позже)
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, company_id)
);
create unique index if not exists counterparties_company_inn_uidx on core.counterparties(company_id, inn) where deleted_at is null;
create index if not exists counterparties_company_idx on core.counterparties(company_id, lower(name));
drop trigger if exists counterparties_touch on core.counterparties;
create trigger counterparties_touch before update on core.counterparties for each row execute function core.touch_updated_at();

alter table core.counterparties enable row level security;
drop policy if exists counterparties_select on core.counterparties;
create policy counterparties_select on core.counterparties for select to authenticated
  using (planfact.is_company_member(company_id));
grant select on core.counterparties to authenticated;

-- 3. Право и шаблоны ролей
insert into core.permission_catalog(action, description) values
  ('core.counterparties.manage', 'Контрагенты компании: добавление, правка, архив')
on conflict (action) do nothing;

insert into core.role_template_permissions(template_code, action)
select t.code, 'core.counterparties.manage' from (values ('company_admin'), ('pto')) t(code)
on conflict do nothing;

insert into core.company_role_permissions(role_id, company_id, action)
select r.id, r.company_id, 'core.counterparties.manage'
from core.company_roles r
where r.template_code in ('company_admin', 'pto')
on conflict do nothing;

-- 4. Функции
create or replace function core.require_counterparties_manage(p_company uuid)
returns void language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
begin
  if p_company is null or auth.uid() is null or not planfact.has_company_permission(p_company, 'core.counterparties.manage') then
    raise exception 'Нет права управлять контрагентами' using errcode = '42501';
  end if;
end $$;

create or replace function core.counterparty_snapshot(p_row core.counterparties)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_object('name', p_row.name, 'inn', p_row.inn, 'kpp', p_row.kpp, 'kinds', to_jsonb(p_row.kinds),
                            'requisites', p_row.requisites, 'archived', p_row.archived_at is not null);
$$;

create or replace function public.pf_counterparties_list(p_company uuid, p_include_archived boolean default false)
returns table(id uuid, name text, inn text, kpp text, kinds text[], requisites jsonb, archived_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
begin
  if p_company is null or auth.uid() is null
     or not (planfact.is_company_member(p_company) or planfact.has_company_permission(p_company, 'core.counterparties.manage')) then
    raise exception 'Нет доступа к компании' using errcode = '42501';
  end if;
  return query
  select c.id, c.name, c.inn, c.kpp, c.kinds, c.requisites, c.archived_at, c.updated_at
  from core.counterparties c
  where c.company_id = p_company and c.deleted_at is null and (p_include_archived or c.archived_at is null)
  order by (c.archived_at is not null), lower(c.name), c.inn;
end $$;

create or replace function public.pf_counterparties_save(p_company uuid, p_id uuid, p_name text, p_inn text, p_kpp text,
                                                         p_kinds text[], p_requisites jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_inn text := regexp_replace(coalesce(p_inn, ''), '\s', '', 'g');
  v_kpp text := nullif(upper(regexp_replace(coalesce(p_kpp, ''), '\s', '', 'g')), '');
  v_kinds text[] := (select coalesce(array_agg(distinct k order by k), '{}') from unnest(coalesce(p_kinds, '{}')) k);
  v_req jsonb := coalesce(p_requisites, '{}'::jsonb);
  v_old core.counterparties;
  v_new core.counterparties;
  v_dup text;
begin
  perform core.require_counterparties_manage(p_company);
  if p_id is not null then
    select * into v_old from core.counterparties where id = p_id and deleted_at is null;
    if v_old.id is null or v_old.company_id is distinct from p_company then
      raise exception 'Контрагент не найден' using errcode = '22023';
    end if;
  end if;
  if v_name = '' then raise exception 'Введите название контрагента' using errcode = '22023'; end if;
  if length(v_name) > 300 then raise exception 'Название длиннее 300 знаков' using errcode = '22023'; end if;
  if v_inn !~ '^([0-9]{10}|[0-9]{12})$' then
    raise exception 'ИНН — 10 цифр (организация) или 12 цифр (ИП)' using errcode = '22023';
  end if;
  if v_kpp is not null and v_kpp !~ '^[0-9]{4}[0-9A-Z]{2}[0-9]{3}$' then
    raise exception 'КПП — 9 знаков' using errcode = '22023';
  end if;
  if cardinality(v_kinds) = 0 then raise exception 'Отметьте, кто это: заказчик, генподрядчик, подрядчик или поставщик' using errcode = '22023'; end if;
  if not v_kinds <@ array['customer', 'general_contractor', 'contractor', 'supplier']::text[] then
    raise exception 'Неизвестный вид контрагента' using errcode = '22023';
  end if;
  if jsonb_typeof(v_req) <> 'object' or length(v_req::text) > 20000 then
    raise exception 'Реквизиты — не более 20 000 знаков' using errcode = '22023';
  end if;
  select c.name into v_dup from core.counterparties c
   where c.company_id = p_company and c.inn = v_inn and c.deleted_at is null and c.id is distinct from p_id limit 1;
  if v_dup is not null then
    raise exception 'Контрагент с таким ИНН уже есть: %', v_dup using errcode = '23505';
  end if;

  if p_id is null then
    insert into core.counterparties(company_id, name, inn, kpp, kinds, requisites)
    values (p_company, v_name, v_inn, v_kpp, v_kinds, v_req) returning * into v_new;
    perform planfact.log_admin_change(p_company, null, 'counterparties', v_new.id, 'INSERT', null, core.counterparty_snapshot(v_new));
  else
    update core.counterparties set name = v_name, inn = v_inn, kpp = v_kpp, kinds = v_kinds, requisites = v_req
     where id = p_id returning * into v_new;
    if core.counterparty_snapshot(v_old) is distinct from core.counterparty_snapshot(v_new) then
      perform planfact.log_admin_change(p_company, null, 'counterparties', v_new.id, 'UPDATE',
        core.counterparty_snapshot(v_old), core.counterparty_snapshot(v_new));
    end if;
  end if;
  return v_new.id;
end $$;

create or replace function public.pf_counterparties_archive(p_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare
  v_old core.counterparties;
  v_new core.counterparties;
begin
  select * into v_old from core.counterparties where id = p_id and deleted_at is null;
  if v_old.id is null then raise exception 'Контрагент не найден' using errcode = '22023'; end if;
  perform core.require_counterparties_manage(v_old.company_id);
  if (v_old.archived_at is not null) = coalesce(p_archived, false) then return; end if;
  update core.counterparties set archived_at = case when p_archived then now() end where id = p_id returning * into v_new;
  perform planfact.log_admin_change(v_old.company_id, null, 'counterparties', p_id, 'UPDATE',
    core.counterparty_snapshot(v_old), core.counterparty_snapshot(v_new));
end $$;

-- Доступ к компании для экранов: + флаг «может управлять контрагентами» (столбец добавлен в конец; прежние — без изменений).
drop function if exists public.pf_my_company_access();
create function public.pf_my_company_access()
returns table(company_id uuid, company_name text, can_manage_projects boolean, can_manage_units boolean, can_manage_roles boolean,
              can_manage_counterparties boolean)
language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  select c.id, c.name,
         planfact.has_company_permission(c.id, 'planfact.projects.manage'),
         planfact.has_company_permission(c.id, 'planfact.units.manage'),
         planfact.has_company_permission(c.id, 'security.roles.assign'),
         planfact.has_company_permission(c.id, 'core.counterparties.manage')
  from core.companies c
  where auth.uid() is not null and exists (
    select 1 from core.company_modules cm
    where cm.company_id = c.id and cm.module = 'planfact' and cm.enabled
      and (planfact.is_platform_admin() or exists (
        select 1 from core.role_assignments a
        where a.company_id = cm.company_id and a.user_id = auth.uid()
          and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))))
  order by c.name;
$$;

-- Журнал компании: + контрагенты (тело как в 010).
create or replace function public.pf_list_company_audit(p_company uuid, p_limit int default 50)
returns table(at timestamptz, actor_email text, action text, record_id uuid, subject_email text, old_data jsonb, new_data jsonb,
              table_name text)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select a.at, u.email::text, a.action, a.record_id, su.email::text, a.old_data, a.new_data, a.table_name
  from core.audit_log a
  left join auth.users u on u.id = a.actor
  left join auth.users su on su.id = (coalesce(a.new_data, a.old_data) ->> 'user_id')::uuid
  where a.company_id = p_company and a.table_name in ('company_roles', 'role_assignments', 'projects', 'locations', 'units',
                                                       'vor_imports', 'vor_profiles', 'work_types', 'vor_dictionary',
                                                       'price_items', 'overhead_templates', 'estimates', 'kp_revisions',
                                                       'brigades', 'fact_entries', 'ks2_settings', 'ks2_acts', 'counterparties')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- 5. Права на выполнение
revoke all on function core.require_counterparties_manage(uuid), core.counterparty_snapshot(core.counterparties) from public, anon;
revoke all on function public.pf_counterparties_list(uuid, boolean),
  public.pf_counterparties_save(uuid, uuid, text, text, text, text[], jsonb),
  public.pf_counterparties_archive(uuid, boolean), public.pf_my_company_access(), public.pf_list_company_audit(uuid, int)
  from public, anon;
grant execute on function public.pf_counterparties_list(uuid, boolean),
  public.pf_counterparties_save(uuid, uuid, text, text, text, text[], jsonb),
  public.pf_counterparties_archive(uuid, boolean), public.pf_my_company_access(), public.pf_list_company_audit(uuid, int)
  to authenticated;
