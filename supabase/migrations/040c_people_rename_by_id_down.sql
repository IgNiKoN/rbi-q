-- Откат 040c (P2-0035b): версии функций из 032d_staff_review_up.sql без изменений.
begin;

create or replace function core.staff_rename_quality(p_company uuid, p_user uuid, p_aliases text[], p_new text)
returns integer language plpgsql volatile security definer set search_path = pg_catalog, core as $$
declare
  r record; v_set text; v_any text; v_who text; v_n integer; v_total integer := 0;
begin
  if p_company is null or p_user is null or coalesce(cardinality(p_aliases), 0) = 0 then return 0; end if;
  for r in
    select c.table_name t,
           array_agg(c.column_name::text order by c.column_name) filter (where c.column_name in
             ('engineer_name', 'inspector_name', 'created_by_name', 'owner_name', 'assigned_to_name')) cols,
           bool_or(c.column_name = 'assigned_to_auth_user_id') has_assigned
      from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
     where c.table_schema = 'quality'
     group by c.table_name
    having bool_or(c.column_name = 'core_created_by') and bool_or(c.column_name = 'core_company_id')
       and bool_or(c.column_name in ('engineer_name', 'inspector_name', 'created_by_name', 'owner_name', 'assigned_to_name'))
  loop
    -- поле имени ↔ своя учётка (ревью M2): created_by_name / owner_name — автор; assigned_to_name — назначенный;
    -- engineer_name / inspector_name — автор или назначенный (в задаче РБИ это исполнитель)
    select string_agg(format('%1$I = case when lower(btrim(%1$I)) = any($3) and (%2$s) then $4 else %1$I end', col, w), ', '),
           string_agg(format('(lower(btrim(%I)) = any($3) and (%s))', col, w), ' or ')
      into v_set, v_any
      from (select col, case
                   when col in ('created_by_name', 'owner_name') or not r.has_assigned then 'core_created_by = $2'
                   when col = 'assigned_to_name' then 'assigned_to_auth_user_id = $2'
                   else 'core_created_by = $2 or assigned_to_auth_user_id = $2' end w
              from unnest(r.cols) col) z;
    v_who := 'core_created_by = $2' || case when r.has_assigned then ' or assigned_to_auth_user_id = $2' else '' end;
    execute format('update quality.%I set %s where core_company_id = $1 and (%s) and (%s)', r.t, v_set, v_who, v_any)
      using p_company, p_user, p_aliases, p_new;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;
  -- профиль Качества этой учётки в компании: имя и ключ (sync-engine ищет профиль по ключу «объект_имя»)
  update quality.rbi_engineer_profiles
     set engineer_name = case when lower(btrim(engineer_name)) = any(p_aliases) then p_new else engineer_name end,
         inspector_name = case when lower(btrim(inspector_name)) = any(p_aliases) then p_new else inspector_name end,
         inspector_id = case when lower(btrim(engineer_name)) = any(p_aliases) then core.staff_profile_key(project_code, p_new) else inspector_id end
   where core_company_id = p_company and auth_user_id = p_user
     and (lower(btrim(engineer_name)) = any(p_aliases) or lower(btrim(inspector_name)) = any(p_aliases))
     and not exists (select 1 from quality.rbi_engineer_profiles o where o.core_company_id = p_company   -- однофамилец на объекте (ревью M5)
                      and o.auth_user_id is distinct from p_user and o.project_code = rbi_engineer_profiles.project_code
                      and (o.engineer_name = p_new or o.inspector_id = core.staff_profile_key(rbi_engineer_profiles.project_code, p_new)));
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;
  -- рейтинг (пара объект + имя): строка этой учётки или с прежним именем, если новое имя на объекте ещё не занято
  update quality.rbi_engineer_ratings g
     set engineer_name = p_new
   where g.core_company_id = p_company and lower(btrim(g.engineer_name)) = any(p_aliases)
     and (g.auth_user_id = p_user or exists (select 1 from quality.rbi_engineer_profiles x where x.core_company_id = p_company
            and x.auth_user_id = p_user and x.project_code = g.project_code))
     and not exists (select 1 from quality.rbi_engineer_ratings o where o.core_company_id = g.core_company_id
                      and o.project_code = g.project_code and o.engineer_name = p_new);
  get diagnostics v_n = row_count;
  return v_total + v_n;
end $$;

create or replace function quality.rbi_transfer_attach_profiles(p_company uuid)
returns table (person text, old_key text, new_key text, merged_duplicates integer, game_logs integer)
language plpgsql volatile set search_path = pg_catalog, core as $$
declare
  m record; p quality.rbi_engineer_profiles; d record; v_key text; v_email text; v_logs jsonb; v_n integer; v_name text;
begin
  for m in select * from quality.rbi_transfer_people t where t.core_company_id = p_company and t.user_id is not null order by t.email loop
    select * into p from quality.rbi_engineer_profiles x where x.core_company_id = p_company and x.id = m.old_profile_id;
    if p.id is null then continue; end if;
    select u.email::text into v_email from auth.users u where u.id = m.user_id;
    v_key := core.staff_profile_key(p.project_code, coalesce(nullif(btrim(p.engineer_name), ''), p.inspector_name));
    v_logs := coalesce(p.profile_data -> 'gameLogs', '[]'::jsonb);
    v_n := 0;
    -- у учётки уже привязан профиль на другом объекте (в компании — один профиль на учётку): этот не трогаем (ревью H2)
    if exists (select 1 from quality.rbi_engineer_profiles x where x.core_company_id = p_company and x.id <> p.id
                and x.auth_user_id = m.user_id and x.project_code is distinct from p.project_code) then
      person := coalesce(p.engineer_name, p.inspector_name); old_key := p.inspector_id; new_key := null;
      merged_duplicates := 0; game_logs := jsonb_array_length(v_logs);
      return next;
      continue;
    end if;
    for d in select * from quality.rbi_engineer_profiles x
              where x.core_company_id = p_company and x.id <> p.id
                and x.project_code = p.project_code   -- только тот же объект (ревью H2)
                and (x.auth_user_id = m.user_id or x.inspector_id = v_key
                     or (x.project_code = p.project_code and lower(btrim(x.engineer_name)) = lower(btrim(p.engineer_name)))
                     or (x.project_code = p.project_code and lower(btrim(x.engineer_name)) = lower(btrim((select up.full_name from core.user_profiles up where up.user_id = m.user_id))))) loop
      v_logs := v_logs || coalesce(d.profile_data -> 'gameLogs', '[]'::jsonb);
      delete from quality.rbi_engineer_profiles x where x.core_company_id = p_company and x.id = d.id;
      v_n := v_n + 1;
    end loop;
    update quality.rbi_engineer_profiles x
       set inspector_id = v_key, auth_user_id = m.user_id, auth_email = v_email,
           profile_data = jsonb_set(coalesce(x.profile_data, '{}'::jsonb), '{gameLogs}', v_logs), updated_at = now()
     where x.core_company_id = p_company and x.id = p.id;
    -- имя в профиле, рейтинге и записях автора — как ФИО учётки (регистр старого профиля мог отличаться: «ПЕТРУШКО Д.М.»)
    select up.full_name into v_name from core.user_profiles up where up.user_id = m.user_id;
    if nullif(btrim(v_name), '') is not null then
      perform core.staff_rename_quality(p_company, m.user_id,
        array_remove(core.staff_name_aliases(m.user_id, null) || lower(btrim(p.engineer_name)) || lower(btrim(p.inspector_name)), null), v_name);
    end if;
    select x.inspector_id into v_key from quality.rbi_engineer_profiles x where x.core_company_id = p_company and x.id = p.id;
    person := coalesce(nullif(btrim(v_name), ''), p.engineer_name, p.inspector_name); old_key := p.inspector_id; new_key := v_key;
    merged_duplicates := v_n; game_logs := jsonb_array_length(v_logs);
    return next;
  end loop;
  insert into quality.rbi_transfer_runs(core_company_id, action, scope, result)
  values (p_company, 'attach_profiles', 'all', jsonb_build_object('people', (select count(*) from quality.rbi_transfer_people
           where core_company_id = p_company and user_id is not null)));
end $$;

commit;
