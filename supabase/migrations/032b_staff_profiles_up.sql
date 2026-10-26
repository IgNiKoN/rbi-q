-- P2-0028 (найдено на показе владельца 25.10.2026): рейтинг и награды в профиле пропали после входа по почте.
-- Причина: Качество ищет профиль инженера по ключу inspector_id = «<код объекта>_<имя>» (пробелы → «_», sync-engine),
-- рейтинг — по паре (объект, имя). У перенесённого профиля ключ старый («rbi-test_…») и учётка старая (PIN), поэтому
-- новое приложение профиль не находит, а записать свой не может: пара (объект, имя) уникальна и занята старым профилем.
-- 1) quality.rbi_transfer_attach_profiles(компания) — после переноса (и после каждого повторного переноса, P2-0032):
--    старому профилю каждого сопоставленного человека (rbi_transfer_people) — ключ нового объекта и его учётка;
--    профиль-дубль этого человека, созданный новым приложением (та же учётка / тот же ключ / то же имя на объекте),
--    сливается: журнал очков (profile_data.gameLogs) добавляется к старому, дубль удаляется. Только для SQL Editor.
-- 2) core.staff_rename_quality (032a): при смене ФИО — ещё ключ профиля учётки и строка рейтинга (иначе после смены
--    ФИО профиль снова «теряется»). Остальное тело — как в 032a.
-- Откат — 032b_staff_profiles_down.sql.
begin;

-- Ключ профиля, как в sync-engine: `${projectCode}_${engineerName}`.replace(/\s+/g, '_')
create or replace function core.staff_profile_key(p_project_code text, p_name text)
returns text language sql immutable set search_path = pg_catalog as $$
  select regexp_replace(coalesce(p_project_code, '') || '_' || coalesce(p_name, ''), '\s+', '_', 'g');
$$;
revoke all on function core.staff_profile_key(text, text) from public, anon, authenticated;

create or replace function quality.rbi_transfer_attach_profiles(p_company uuid)
returns table (person text, old_key text, new_key text, merged_duplicates integer, game_logs integer)
language plpgsql volatile set search_path = pg_catalog, core as $$
declare
  m record; p quality.rbi_engineer_profiles; d record; v_key text; v_email text; v_logs jsonb; v_n integer;
begin
  for m in select * from quality.rbi_transfer_people t where t.core_company_id = p_company and t.user_id is not null order by t.email loop
    select * into p from quality.rbi_engineer_profiles x where x.core_company_id = p_company and x.id = m.old_profile_id;
    if p.id is null then continue; end if;
    select u.email::text into v_email from auth.users u where u.id = m.user_id;
    v_key := core.staff_profile_key(p.project_code, coalesce(nullif(btrim(p.engineer_name), ''), p.inspector_name));
    v_logs := coalesce(p.profile_data -> 'gameLogs', '[]'::jsonb);
    v_n := 0;
    for d in select * from quality.rbi_engineer_profiles x
              where x.core_company_id = p_company and x.id <> p.id
                and (x.auth_user_id = m.user_id or x.inspector_id = v_key
                     or (x.project_code = p.project_code and x.engineer_name = p.engineer_name)) loop
      v_logs := v_logs || coalesce(d.profile_data -> 'gameLogs', '[]'::jsonb);
      delete from quality.rbi_engineer_profiles x where x.core_company_id = p_company and x.id = d.id;
      v_n := v_n + 1;
    end loop;
    update quality.rbi_engineer_profiles x
       set inspector_id = v_key, auth_user_id = m.user_id, auth_email = v_email,
           profile_data = jsonb_set(coalesce(x.profile_data, '{}'::jsonb), '{gameLogs}', v_logs), updated_at = now()
     where x.core_company_id = p_company and x.id = p.id;
    person := coalesce(p.engineer_name, p.inspector_name); old_key := p.inspector_id; new_key := v_key;
    merged_duplicates := v_n; game_logs := jsonb_array_length(v_logs);
    return next;
  end loop;
  insert into quality.rbi_transfer_runs(core_company_id, action, scope, result)
  values (p_company, 'attach_profiles', 'all', jsonb_build_object('people', (select count(*) from quality.rbi_transfer_people
           where core_company_id = p_company and user_id is not null)));
end $$;
revoke all on function quality.rbi_transfer_attach_profiles(uuid) from public, anon, authenticated;

-- Смена ФИО: + ключ профиля учётки и строка рейтинга (по учётке или прежнему имени, если новое имя на объекте свободно)
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
    select string_agg(format('%1$I = case when lower(btrim(%1$I)) = any($3) then $4 else %1$I end', col), ', '),
           string_agg(format('lower(btrim(%I)) = any($3)', col), ' or ')
      into v_set, v_any from unnest(r.cols) col;
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
     and (lower(btrim(engineer_name)) = any(p_aliases) or lower(btrim(inspector_name)) = any(p_aliases));
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
revoke all on function core.staff_rename_quality(uuid, uuid, text[], text) from public, anon, authenticated;

commit;
