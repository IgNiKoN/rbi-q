-- P2-0018: откат 024_quality_contractor_dirs_up.sql — правила записи справочников подрядчиков как в 018,
-- member_by_email / contractor_ref — как в 023. Применять до 023_quality_scope_fix_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.contractor_only(uuid)') is null then
    raise exception '024 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_proc where proname = 'on_directory_insert' and pronamespace = 'quality'::regnamespace
             and prosrc like '%025: лимит%') then
    raise exception 'Сначала откатите 025: 025_quality_drafts_limit_down.sql' using errcode = 'P0001';
  end if;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('contractors', '{quality.edit,construction.edit}'), ('contractor_directory', '{quality.edit,construction.edit}'),
    ('contractor_aliases', '{quality.edit,construction.edit}'), ('contractor_normalization_queue', '{quality.edit,construction.edit}'),
    ('sk_contractor_map', '{quality.edit}')
  ) v(t, ea) loop
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for insert to authenticated with check (quality.can(core_company_id, core_project_id, %L))', r.t || '_insert', r.t, r.ea);
    execute format('create policy %I on quality.%I for update to authenticated using (quality.can(core_company_id, core_project_id, %L))
  with check (quality.can(core_company_id, core_project_id, %L))', r.t || '_update', r.t, r.ea, r.ea);
    execute format('create policy %I on quality.%I for delete to authenticated using (quality.can(core_company_id, core_project_id, %L))', r.t || '_delete', r.t, r.ea);
  end loop;
end $$;

drop function quality.contractor_only(uuid);

create or replace function quality.member_by_email(p_company uuid, p_email text)
returns uuid language sql stable security definer set search_path = pg_catalog, core as $$
  select m.user_id from core.company_members m join auth.users u on u.id = m.user_id
   where m.company_id = p_company and p_company = quality.request_company()   -- только своя текущая компания
     and nullif(btrim(coalesce(p_email, '')), '') is not null
     and lower(u.email::text) = lower(btrim(p_email)) limit 1;
$$;

create or replace function quality.contractor_ref(p_company uuid, p_id text, p_what text)
returns text language sql stable security definer set search_path = pg_catalog as $$
  select case when p_what = 'key' then c.canonical_key else c."displayName" end
    from quality.contractors c where c.id = p_id and c.core_company_id = p_company and p_company = quality.request_company();
$$;

commit;
