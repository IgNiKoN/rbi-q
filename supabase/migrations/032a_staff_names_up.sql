-- P2-0028 этап 3 (ADR-069 п. 4). ФИО — одно место (core.user_profiles.full_name, 032); новое ФИО видно везде, включая старые записи.
-- pf_set_full_name(пользователь, ФИО): меняет сам сотрудник или администратор компании (security.roles.assign) этой учётки
-- (учётка создана его компанией или человек состоит только в его компаниях), или администратор платформы.
-- Сервер переписывает имя в записях Качества компаний, где человек состоит: только строки этой учётки (автор core_created_by
-- или назначенная задача assigned_to_auth_user_id), и только поля, где стоит одно из его прежних имён (прежнее ФИО, почта,
-- имена его старого профиля РБИ по переносу); профиль Качества учётки (auth_user_id) — так же. Записи без автора, чужие
-- записи и другие компании не трогаются. Каждое изменение — в журнал компании. Откат — 032a_staff_names_down.sql.
begin;

-- Прежние имена учётки (нижний регистр, без крайних пробелов): прежнее ФИО, почта, имена старых профилей РБИ (перенос P2-0027)
create or replace function core.staff_name_aliases(p_user uuid, p_old text)
returns text[] language sql stable security definer set search_path = pg_catalog, core as $$
  select coalesce(array_agg(distinct lower(btrim(n))) filter (where nullif(btrim(n), '') is not null), '{}')
  from (
    select p_old n
    union all select u.email::text from auth.users u where u.id = p_user
    union all select x from quality.rbi_transfer_people m
              join quality.rbi_engineer_profiles p on p.id = m.old_profile_id and p.core_company_id = m.core_company_id,
              unnest(array[p.engineer_name, p.inspector_name]) x
     where m.user_id = p_user
  ) s;
$$;

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

revoke all on function core.staff_name_aliases(uuid, text), core.staff_rename_quality(uuid, uuid, text[], text) from public, anon, authenticated;

-- Сменить ФИО. Возвращает число переписанных записей Качества.
create or replace function public.pf_set_full_name(p_user uuid, p_full_name text)
returns integer language plpgsql volatile security definer set search_path = pg_catalog, planfact, core as $$
declare
  v_name text; v_old text; v_aliases text[]; v_ok boolean; c record; v_n integer; v_total integer := 0;
begin
  if auth.uid() is null or p_user is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v_name := core.staff_full_name(p_full_name);
  v_ok := p_user = auth.uid() or planfact.is_platform_admin() or exists (
    select 1 from core.company_members m
     where m.user_id = p_user and planfact.has_company_permission(m.company_id, 'security.roles.assign')
       and (exists (select 1 from core.user_profiles p where p.user_id = p_user and p.managed_company_id = m.company_id)
            or not exists (select 1 from core.company_members o where o.user_id = p_user
                            and not planfact.has_company_permission(o.company_id, 'security.roles.assign'))));
  if not v_ok then raise exception 'Нет права менять ФИО этого сотрудника' using errcode = '42501'; end if;
  if exists (select 1 from core.platform_admins where user_id = p_user) and p_user <> auth.uid() and not planfact.is_platform_admin() then
    raise exception 'ФИО администратора платформы меняет он сам' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'Учётка не найдена' using errcode = 'P0002'; end if;

  select full_name into v_old from core.user_profiles where user_id = p_user;
  if v_old is not distinct from v_name then return 0; end if;
  insert into core.user_profiles(user_id, full_name) values (p_user, v_name)
    on conflict on constraint user_profiles_pkey do update set full_name = excluded.full_name, updated_at = now();
  v_aliases := array_remove(core.staff_name_aliases(p_user, v_old), lower(v_name));

  for c in select m.company_id from core.company_members m where m.user_id = p_user loop
    v_n := core.staff_rename_quality(c.company_id, p_user, v_aliases, v_name);
    v_total := v_total + v_n;
    perform planfact.log_admin_change(c.company_id, null, 'user_profiles', p_user, 'FULL_NAME',
              jsonb_build_object('full_name', v_old), jsonb_build_object('full_name', v_name, 'quality_rows', v_n));
  end loop;
  return v_total;
end $$;
revoke all on function public.pf_set_full_name(uuid, text) from public, anon;
grant execute on function public.pf_set_full_name(uuid, text) to authenticated;

commit;
