-- P2-0018: откат 025_quality_drafts_limit_up.sql — лимит черновиков для всех (как в 023). Применять до 024_quality_contractor_dirs_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.contractor_only(uuid,uuid)') is not null then
    raise exception 'Сначала откатите 026: 026_quality_contractor_scope_fix_down.sql' using errcode = 'P0001';
  end if;
end $$;

create or replace function quality.on_directory_insert()
returns trigger language plpgsql security definer set search_path = pg_catalog, core, planfact as $$
declare
  v_id uuid;
  v_inn text := nullif(regexp_replace(coalesce(new.inn, ''), '\s', '', 'g'), '');
  v_new core.counterparties;
begin
  if new.is_deleted then return null; end if;
  -- 023: подрядчик (своя фирма) связей «ключ → контрагент» и черновиков не создаёт (иначе мог бы привязать чужой ключ к своей фирме)
  if quality.has_actions(new.core_company_id, null, array['quality.scope.contractor'])
     and not quality.has_actions(new.core_company_id, null, array['quality.manage', 'construction.manage'])
     and not planfact.has_company_permission(new.core_company_id, 'core.counterparties.manage') then
    return null;
  end if;
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

revoke all on function quality.on_directory_insert() from public, anon, authenticated;

commit;
