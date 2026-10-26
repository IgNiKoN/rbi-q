-- P2-0028: откат 032b_staff_profiles_up.sql. core.staff_rename_quality — как в 032a; функции привязки профилей удаляются.
-- Уже привязанные профили (ключ, учётка, слитый журнал очков) остаются — это данные компании.
begin;
drop function if exists quality.rbi_transfer_attach_profiles(uuid);
-- Переписать имя в записях Качества одной компании. Возвращает число изменённых строк.
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
  -- профиль Качества этой учётки в компании
  update quality.rbi_engineer_profiles
     set engineer_name = case when lower(btrim(engineer_name)) = any(p_aliases) then p_new else engineer_name end,
         inspector_name = case when lower(btrim(inspector_name)) = any(p_aliases) then p_new else inspector_name end
   where core_company_id = p_company and auth_user_id = p_user
     and (lower(btrim(engineer_name)) = any(p_aliases) or lower(btrim(inspector_name)) = any(p_aliases));
  get diagnostics v_n = row_count;
  return v_total + v_n;
end $$;

revoke all on function core.staff_rename_quality(uuid, uuid, text[], text) from public, anon, authenticated;
drop function if exists core.staff_profile_key(text, text);
commit;
