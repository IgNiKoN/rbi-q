-- P2-0028 (показ владельца 25.10.2026, доработка 032b): у старого профиля имя могло быть другим регистром («ПЕТРУШКО Д.М.»),
-- а приложение строит ключ профиля из ФИО учётки («Петрушко Д.М.») — профиль снова не находился. Теперь привязка
-- приводит имя в профиле, его ключ, рейтинг и записи автора к ФИО учётки (core.staff_rename_quality, без учёта регистра)
-- и считает дублем профиль того же имени без учёта регистра. Остальное — как в 032b. Откат — 032c_staff_profiles_case_down.sql.
begin;
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
    for d in select * from quality.rbi_engineer_profiles x
              where x.core_company_id = p_company and x.id <> p.id
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
revoke all on function quality.rbi_transfer_attach_profiles(uuid) from public, anon, authenticated;
commit;
