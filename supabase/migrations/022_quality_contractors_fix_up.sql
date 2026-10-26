-- P2-0018 этап 6 (ТД №119). Подрядчики Качества ↔ «Контрагенты» ядра — исправления 018e:
--   1) журнал: черновик из Качества — с автором (actor = вошедший, как и раньше) и явными by / via в записи журнала;
--   2) лимит: не больше 20 новых черновиков контрагентов от одного пользователя за сутки (запись в справочник Качества
--      доступна по праву quality.edit / construction.edit, без права core.counterparties.manage);
--   3) правка контрагента в ядре не воскрешает строку, удалённую в справочнике Качества (is_deleted не сбрасывается);
--   4) архив / удаление контрагента или снятие вида «подрядчик» — его строки в справочнике Качества помечаются удалёнными
--      (возврат из архива / вида «подрядчик» — строки снова видны).
-- Объекты RBI не затрагивает. Применять после 021, одним запросом. Откат — 022_quality_contractors_fix_down.sql.
begin;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'allowed_projects_pkey' and conrelid = 'quality.allowed_projects'::regclass
                 and pg_get_constraintdef(oid) like '%core_company_id%') then
    raise exception '022: сначала 021_quality_keys_up.sql' using errcode = 'P0001';
  end if;
end $$;

-- 3. Ядро → Качество: новые строки справочника; существующие — только название и ИНН (удалённые остаются удалёнными).
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
    updated_at = now();
end $$;

-- 4. Подрядчик больше не действует (архив, удаление, снятие вида «подрядчик») — убрать из справочника Качества;
--    снова действует (из архива, вернули вид «подрядчик») — его строки в справочнике Качества снова видны.
create or replace function quality.on_counterparty_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, core as $$
declare v_was boolean; v_is boolean;
begin
  if current_setting('quality.from_directory', true) = '1' then return null; end if;
  v_is := 'contractor' = any(new.kinds) and new.deleted_at is null and new.archived_at is null;
  v_was := tg_op = 'UPDATE' and 'contractor' = any(old.kinds) and old.deleted_at is null and old.archived_at is null;
  if v_was and not v_is then
    update quality.contractor_directory d set is_deleted = true, updated_at = now()
      from quality.contractor_core_links l
     where l.counterparty_id = new.id and d.core_company_id = l.core_company_id and d.canonical_key = l.canonical_key and not d.is_deleted;
  elsif v_is and tg_op = 'UPDATE' and not v_was then
    update quality.contractor_directory d set is_deleted = false, updated_at = now()
      from quality.contractor_core_links l
     where l.counterparty_id = new.id and d.core_company_id = l.core_company_id and d.canonical_key = l.canonical_key and d.is_deleted;
  end if;
  perform quality.push_contractor(new);
  return null;
end $$;

-- 1–2. Качество → ядро: черновик — не больше 20 за сутки от пользователя; в журнале — кто и откуда.
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
    if auth.uid() is not null and (select count(*) from core.audit_log a
         where a.company_id = new.core_company_id and a.table_name = 'counterparties' and a.action = 'INSERT' and a.actor = auth.uid()
           and a.new_data ->> 'source' = 'quality' and a.at > now() - interval '1 day') >= 20 then
      raise exception 'За сутки добавлено уже 20 новых подрядчиков — следующих добавит администратор в «Контрагентах»' using errcode = '42501';
    end if;
    perform set_config('quality.from_directory', '1', true);
    insert into core.counterparties(company_id, name, inn, kinds, draft)
    values (new.core_company_id, left(btrim(coalesce(nullif(new.display_name, ''), new.canonical_key)), 300), v_inn, array['contractor'], v_inn is null)
    returning * into v_new;
    perform set_config('quality.from_directory', '', true);
    v_id := v_new.id;
    perform planfact.log_admin_change(new.core_company_id, null, 'counterparties', v_id, 'INSERT', null,
      core.counterparty_snapshot(v_new) || jsonb_build_object('source', 'quality', 'draft', v_new.draft, 'by', auth.uid(),
        'via', jsonb_build_object('project_code', new.project_code, 'canonical_key', new.canonical_key)));
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

-- Уже архивные / удалённые / не «подрядчики» — убрать из справочника Качества.
update quality.contractor_directory d set is_deleted = true, updated_at = now()
  from quality.contractor_core_links l join core.counterparties c on c.id = l.counterparty_id
 where d.core_company_id = l.core_company_id and d.canonical_key = l.canonical_key and not d.is_deleted
   and (c.deleted_at is not null or c.archived_at is not null or not ('contractor' = any(c.kinds)));

commit;
