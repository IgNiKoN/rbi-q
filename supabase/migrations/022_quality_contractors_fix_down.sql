-- P2-0018: откат 022_quality_contractors_fix_up.sql — функции подрядчиков как в 018e (push_contractor — как в 021). Применять после 023_down.
-- Строки справочника, скрытые 022 (архивные подрядчики), остаются скрытыми (данные). Применять до 021_quality_keys_down.sql.
begin;

do $$
begin   -- сторожа порядка (ревью P2-0018)
  if not exists (select 1 from pg_proc where proname = 'on_directory_insert' and pronamespace = 'quality'::regnamespace
             and prosrc like '%20 новых подрядчиков%') then
    raise exception '022 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
  if to_regprocedure('quality.member_by_email(uuid,text)') is not null then
    raise exception 'Сначала откатите 023: 023_quality_scope_fix_down.sql' using errcode = 'P0001';
  end if;
end $$;

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
  on conflict (core_company_id, project_code, canonical_key) do update set display_name = excluded.display_name, inn = excluded.inn,
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

revoke all on function quality.push_contractor(core.counterparties), quality.on_counterparty_change(), quality.on_directory_insert()
  from public, anon, authenticated;

commit;
