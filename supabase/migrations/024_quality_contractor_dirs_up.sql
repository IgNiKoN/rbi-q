-- P2-0018 доработка 2 (ревью Архитектора, reports/P2-0018/architect-review-2.md).
--   1) Справочники подрядчиков Качества (contractors, contractor_directory, contractor_aliases, contractor_normalization_queue,
--      sk_contractor_map): пользователь со «своей фирмой» (quality.scope.contractor без *.manage и core.counterparties.manage)
--      их только читает — иначе мог бы переписать ключ / название чужой фирмы под свою и увидеть её записи (023, contractor_ref).
--   2) quality.member_by_email, quality.contractor_ref при прямом вызове — только при правах Качества / Стройконтроля в текущей
--      компании (правила RLS работают как прежде).
-- Объекты RBI не затрагивает. Применять после 023, одним запросом. Откат — 024_quality_contractor_dirs_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.member_by_email(uuid,text)') is null then
    raise exception '024: сначала 023_quality_scope_fix_up.sql' using errcode = 'P0001';
  end if;
  if to_regprocedure('quality.contractor_only(uuid)') is not null then
    raise exception '024 уже применена (повтор — только после 024_quality_contractor_dirs_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- «Только своя фирма»: в компании есть право quality.scope.contractor и нет прав на справочники (manage / контрагенты).
create function quality.contractor_only(p_company uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  select quality.has_actions(p_company, null, array['quality.scope.contractor'])
     and not quality.has_actions(p_company, null, array['quality.manage', 'construction.manage'])
     and not planfact.has_company_permission(p_company, 'core.counterparties.manage');
$$;
revoke all on function quality.contractor_only(uuid) from public, anon, authenticated;
grant execute on function quality.contractor_only(uuid) to authenticated;

do $$
declare r record; v_edit text;
begin
  for r in select * from (values
    ('contractors', '{quality.edit,construction.edit}'), ('contractor_directory', '{quality.edit,construction.edit}'),
    ('contractor_aliases', '{quality.edit,construction.edit}'), ('contractor_normalization_queue', '{quality.edit,construction.edit}'),
    ('sk_contractor_map', '{quality.edit}')
  ) v(t, ea) loop
    v_edit := format('quality.can(core_company_id, core_project_id, %L) and not quality.contractor_only(core_company_id)', r.ea);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
end $$;

-- 2. Прямой вызов — только с правами Качества / Стройконтроля в текущей компании.
create or replace function quality.member_by_email(p_company uuid, p_email text)
returns uuid language sql stable security definer set search_path = pg_catalog, core as $$
  select m.user_id from core.company_members m join auth.users u on u.id = m.user_id
   where m.company_id = p_company and p_company = quality.request_company()   -- только своя текущая компания
     and quality.has_actions(p_company, null, array['quality.view', 'construction.view'])
     and nullif(btrim(coalesce(p_email, '')), '') is not null
     and lower(u.email::text) = lower(btrim(p_email)) limit 1;
$$;

create or replace function quality.contractor_ref(p_company uuid, p_id text, p_what text)
returns text language sql stable security definer set search_path = pg_catalog as $$
  select case when p_what = 'key' then c.canonical_key else c."displayName" end
    from quality.contractors c where c.id = p_id and c.core_company_id = p_company and p_company = quality.request_company()
     and quality.has_actions(p_company, null, array['quality.view', 'construction.view']);
$$;

commit;
