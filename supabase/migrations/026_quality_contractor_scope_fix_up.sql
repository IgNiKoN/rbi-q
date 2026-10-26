-- P2-0018 доработка 3 (ревью Архитектора, reports/P2-0018/architect-review-3.md). «Только своя фирма» (024):
--   — по назначениям роли напрямую, без проверки модуля: у компании со Стройконтролем без Качества право
--     quality.scope.contractor через quality.has_actions «не видно» (модуль quality выключен) — запрет снимался;
--   — по объекту строки: право *.manage на другом объекте не снимает запрет на объекте, где человек — подрядчик
--     (и наоборот, подрядчик на одном объекте правит справочники там, где у него обычная правка — ТД №127).
-- Правила 5 справочников подрядчиков и quality.on_directory_insert — через quality.contractor_only(компания, объект).
-- Объекты RBI не затрагивает. Применять после 025, одним запросом. Откат — 026_quality_contractor_scope_fix_down.sql.
begin;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'on_directory_insert' and pronamespace = 'quality'::regnamespace
                 and prosrc like '%025: лимит%') then
    raise exception '026: сначала 025_quality_drafts_limit_up.sql' using errcode = 'P0001';
  end if;
  if to_regprocedure('quality.contractor_only(uuid,uuid)') is not null then
    raise exception '026 уже применена (повтор — только после 026_quality_contractor_scope_fix_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- Действующее назначение пользователя в компании, покрывающее объект (без объекта — любое), с одним из действий.
create function quality.assigned_with(p_company uuid, p_project uuid, p_actions text[])
returns boolean language sql stable security definer set search_path = pg_catalog, core as $$
  select auth.uid() is not null and exists (
    select 1 from core.role_assignments a
    join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = any(p_actions)
    where a.company_id = p_company and a.user_id = auth.uid()
      and (p_project is null or a.project_id is null or a.project_id = p_project)
      and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()));
$$;

create function quality.contractor_only(p_company uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  select quality.assigned_with(p_company, p_project, array['quality.scope.contractor'])
     and not quality.assigned_with(p_company, p_project, array['quality.manage', 'construction.manage'])
     and not planfact.has_company_permission(p_company, 'core.counterparties.manage');
$$;
revoke all on function quality.assigned_with(uuid, uuid, text[]), quality.contractor_only(uuid, uuid) from public, anon, authenticated;
grant execute on function quality.contractor_only(uuid, uuid) to authenticated;

do $$
declare r record; v_edit text;
begin
  for r in select * from (values
    ('contractors', '{quality.edit,construction.edit}'), ('contractor_directory', '{quality.edit,construction.edit}'),
    ('contractor_aliases', '{quality.edit,construction.edit}'), ('contractor_normalization_queue', '{quality.edit,construction.edit}'),
    ('sk_contractor_map', '{quality.edit}')
  ) v(t, ea) loop
    v_edit := format('quality.can(core_company_id, core_project_id, %L) and not quality.contractor_only(core_company_id, core_project_id)', r.ea);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
end $$;

drop function quality.contractor_only(uuid);

create or replace function quality.on_directory_insert()
returns trigger language plpgsql security definer set search_path = pg_catalog, core, planfact as $$
declare
  v_id uuid;
  v_inn text := nullif(regexp_replace(coalesce(new.inn, ''), '\s', '', 'g'), '');
  v_new core.counterparties;
begin
  if new.is_deleted then return null; end if;
  -- 023: подрядчик (своя фирма) связей «ключ → контрагент» и черновиков не создаёт (иначе мог бы привязать чужой ключ к своей фирме)
  if quality.contractor_only(new.core_company_id, new.core_project_id) then   -- 026: без зависимости от модуля, по объекту
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
    -- 025: лимит — только без права вести «Контрагентов» и без *.manage
    if auth.uid() is not null and not planfact.has_company_permission(new.core_company_id, 'core.counterparties.manage')
       and not quality.has_actions(new.core_company_id, null, array['quality.manage', 'construction.manage'])
       and (select count(*) from core.audit_log a
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
