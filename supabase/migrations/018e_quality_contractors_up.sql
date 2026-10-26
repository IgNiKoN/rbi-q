-- P2-0016 этап 7 (ADR-068 п.6). Подрядчики Качества = контрагенты ядра вида «подрядчик».
-- Владелец — ядро (core.counterparties). Качество — потребитель: справочник Качества quality.contractor_directory (по объектам)
-- заполняется из ядра; подрядчик, добавленный в Качестве, попадает в «Контрагенты» (по ИНН/названию — существующий,
-- иначе — «черновик без ИНН», решение владельца 23.10.2026: администратор потом дозаполняет ИНН).
-- Связь «ключ Качества ↔ контрагент» — quality.contractor_core_links (клиенту не выдаётся). Объекты RBI не затрагивает.
-- Применять после 018d, одним запросом. Откат — 018e_quality_contractors_down.sql.
begin;

-- 1. Ядро: черновик контрагента без ИНН (только из Качества); указали ИНН — уже не черновик.
alter table core.counterparties add column if not exists draft boolean not null default false;
alter table core.counterparties alter column inn drop not null;
alter table core.counterparties drop constraint if exists counterparties_inn_check;
alter table core.counterparties add constraint counterparties_inn_check
  check ((inn is null and draft) or (inn is not null and inn ~ '^([0-9]{10}|[0-9]{12})$'));
create unique index if not exists counterparties_company_draft_name_uidx on core.counterparties(company_id, lower(btrim(name)))
  where draft and deleted_at is null;
create or replace function core.counterparty_undraft()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.inn is not null then new.draft := false; end if;
  return new;
end $$;
revoke all on function core.counterparty_undraft() from public, anon, authenticated;
drop trigger if exists counterparties_undraft on core.counterparties;
create trigger counterparties_undraft before insert or update on core.counterparties for each row execute function core.counterparty_undraft();

-- Список контрагентов: + признак «черновик (нужен ИНН)» (столбец в конце; прежние — без изменений).
drop function if exists public.pf_counterparties_list(uuid, boolean);
create function public.pf_counterparties_list(p_company uuid, p_include_archived boolean default false)
returns table(id uuid, name text, inn text, kpp text, kinds text[], requisites jsonb, archived_at timestamptz, updated_at timestamptz,
              draft boolean)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
begin
  if p_company is null or auth.uid() is null
     or not (planfact.is_company_member(p_company) or planfact.has_company_permission(p_company, 'core.counterparties.manage')) then
    raise exception 'Нет доступа к компании' using errcode = '42501';
  end if;
  return query
  select c.id, c.name, c.inn, c.kpp, c.kinds, c.requisites, c.archived_at, c.updated_at, c.draft
  from core.counterparties c
  where c.company_id = p_company and c.deleted_at is null and (p_include_archived or c.archived_at is null)
  order by (c.archived_at is not null), lower(c.name), c.inn;
end $$;
revoke all on function public.pf_counterparties_list(uuid, boolean) from public, anon;
grant execute on function public.pf_counterparties_list(uuid, boolean) to authenticated;

-- 2. Ключ подрядчика как в Качестве (contractor-directory.service.js makeCanonicalKey; формы «ООО/АО…» JS не убирает — так же).
create or replace function quality.contractor_key(p_name text)
returns text language sql immutable set search_path = pg_catalog as $$
  select coalesce(nullif(btrim(regexp_replace(
           btrim(regexp_replace(regexp_replace(regexp_replace(replace(lower(coalesce(p_name, '')), 'ё', 'е'),
             '["''«»„“”]', '', 'g'), '[.,;:()№]', ' ', 'g'), '\s+', ' ', 'g')),
           '[^a-zа-я0-9]+', '_', 'g'), '_'), ''), 'unknown_contractor');
$$;

create table if not exists quality.contractor_core_links (
  core_company_id uuid not null references core.companies(id) on delete cascade,
  canonical_key text not null,
  counterparty_id uuid not null references core.counterparties(id) on delete cascade,
  primary key (core_company_id, canonical_key)
);
alter table quality.contractor_core_links enable row level security;
revoke all on quality.contractor_core_links from public, anon, authenticated;

-- 3. Ядро → Качество: подрядчик (не архив, не удалён) есть в справочнике Качества на каждом действующем объекте компании.
create or replace function quality.push_contractor(p_cp core.counterparties)
returns void language plpgsql security definer set search_path = pg_catalog, core as $$
declare v_key text;
begin
  if p_cp.id is null or not ('contractor' = any(p_cp.kinds)) or p_cp.deleted_at is not null or p_cp.archived_at is not null then return; end if;
  select canonical_key into v_key from quality.contractor_core_links where counterparty_id = p_cp.id limit 1;
  if v_key is null then
    v_key := quality.contractor_key(p_cp.name);
    insert into quality.contractor_core_links(core_company_id, canonical_key, counterparty_id) values (p_cp.company_id, v_key, p_cp.id)
    on conflict (core_company_id, canonical_key) do nothing;
    select canonical_key into v_key from quality.contractor_core_links where counterparty_id = p_cp.id limit 1;
    if v_key is null then return; end if;   -- ключ уже занят другим контрагентом (тёзка) — без справочника Качества
  end if;
  insert into quality.contractor_directory(project_code, canonical_key, display_name, inn, created_by, core_company_id)
  select pr.id::text, v_key, p_cp.name, p_cp.inn, 'Контрагенты', p_cp.company_id
  from core.projects pr where pr.company_id = p_cp.company_id and pr.archived_at is null
  on conflict (project_code, canonical_key) do update set display_name = excluded.display_name, inn = excluded.inn,
    is_deleted = false, updated_at = now();
end $$;

create or replace function quality.on_counterparty_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, core as $$
begin
  -- Подрядчик, созданный из Качества (on_directory_insert), привязывается к ключу Качества — там же и выкладывается.
  if current_setting('quality.from_directory', true) = '1' then return null; end if;
  perform quality.push_contractor(new);
  return null;
end $$;
drop trigger if exists counterparties_to_quality on core.counterparties;
create trigger counterparties_to_quality after insert or update on core.counterparties for each row execute function quality.on_counterparty_change();

-- Новый объект — справочник подрядчиков компании на нём.
create or replace function quality.on_project_insert()
returns trigger language plpgsql security definer set search_path = pg_catalog, core as $$
declare r core.counterparties;
begin
  for r in select * from core.counterparties where company_id = new.company_id and deleted_at is null and archived_at is null
             and 'contractor' = any(kinds) loop
    perform quality.push_contractor(r);
  end loop;
  return null;
end $$;
drop trigger if exists projects_to_quality on core.projects;
create trigger projects_to_quality after insert on core.projects for each row execute function quality.on_project_insert();

-- 4. Качество → ядро: новый подрядчик в справочнике Качества — существующий контрагент (ИНН, затем название) или черновик.
create or replace function quality.on_directory_insert()
returns trigger language plpgsql security definer set search_path = pg_catalog, core, planfact as $$
declare
  v_id uuid;
  v_inn text := nullif(regexp_replace(coalesce(new.inn, ''), '\s', '', 'g'), '');
  v_new core.counterparties;
begin
  if new.is_deleted then return null; end if;
  if exists (select 1 from quality.contractor_core_links where core_company_id = new.core_company_id and canonical_key = new.canonical_key) then
    return null;
  end if;
  if v_inn !~ '^([0-9]{10}|[0-9]{12})$' then v_inn := null; end if;
  select id into v_id from core.counterparties
   where company_id = new.core_company_id and deleted_at is null and v_inn is not null and inn = v_inn limit 1;
  if v_id is null then
    select id into v_id from core.counterparties
     where company_id = new.core_company_id and deleted_at is null
       and quality.contractor_key(name) = new.canonical_key limit 1;
  end if;
  if v_id is null then
    perform set_config('quality.from_directory', '1', true);
    insert into core.counterparties(company_id, name, inn, kinds, draft)
    values (new.core_company_id, left(btrim(coalesce(nullif(new.display_name, ''), new.canonical_key)), 300), v_inn, array['contractor'], v_inn is null)
    returning * into v_new;
    perform set_config('quality.from_directory', '', true);
    v_id := v_new.id;
    perform planfact.log_admin_change(new.core_company_id, null, 'counterparties', v_id, 'INSERT', null,
      core.counterparty_snapshot(v_new) || jsonb_build_object('source', 'quality', 'draft', v_new.draft));
  else
    perform set_config('quality.from_directory', '1', true);
    update core.counterparties set kinds = array(select distinct k from unnest(kinds || array['contractor']) k order by 1)
     where id = v_id and not ('contractor' = any(kinds));
    perform set_config('quality.from_directory', '', true);
  end if;
  insert into quality.contractor_core_links(core_company_id, canonical_key, counterparty_id) values (new.core_company_id, new.canonical_key, v_id)
  on conflict (core_company_id, canonical_key) do nothing;
  perform quality.push_contractor((select c from core.counterparties c where c.id = v_id));
  return null;
end $$;
drop trigger if exists contractor_directory_to_core on quality.contractor_directory;
create trigger contractor_directory_to_core after insert on quality.contractor_directory for each row
  when (pg_trigger_depth() < 2) execute function quality.on_directory_insert();

revoke all on function quality.contractor_key(text), quality.push_contractor(core.counterparties), quality.on_counterparty_change(),
  quality.on_project_insert(), quality.on_directory_insert() from public, anon, authenticated;

-- 5. Уже заведённые подрядчики ядра — в справочник Качества.
select quality.push_contractor(c) from core.counterparties c where 'contractor' = any(c.kinds) and c.deleted_at is null and c.archived_at is null;

commit;
