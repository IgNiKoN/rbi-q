-- P2-0028: откат 032d — функции как до 032d (032, 032a, 032b, 032c, 020); core.staff_owned_by удаляется.
begin;

create or replace function public.pf_company_add_member(p_company uuid, p_email text, p_full_name text, p_role uuid,
  p_project uuid default null)
returns table(user_id uuid, temp_password text, created boolean)
language plpgsql volatile security definer set search_path = pg_catalog, planfact, core, extensions as $$
declare
  v_email text; v_name text; v_user uuid; v_pw text; v_created boolean := false; v_inst uuid; v_has_pid boolean;
  m core.company_members;
begin
  perform planfact.require_roles_admin(p_company);
  v_email := core.staff_email(p_email);
  v_name := core.staff_full_name(p_full_name);
  if p_role is null or not exists (select 1 from core.company_roles r where r.id = p_role and r.company_id = p_company) then
    raise exception 'Роль не найдена в этой компании' using errcode = '22023';
  end if;

  select u.id into v_user from auth.users u where lower(u.email::text) = v_email limit 1;
  if v_user is null then
    v_user := gen_random_uuid();
    select u.instance_id into v_inst from auth.users u where u.instance_id is not null limit 1;
    insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
                           raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
                           email_change_token_new, email_change)
    values (coalesce(v_inst, '00000000-0000-0000-0000-000000000000'::uuid), v_user, 'authenticated', 'authenticated', v_email,
            extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
    select exists (select 1 from information_schema.columns
                   where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id') into v_has_pid;
    if v_has_pid then
      execute 'insert into auth.identities(id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
               values (gen_random_uuid(), $1, $1::text, $2, ''email'', null, now(), now())'
        using v_user, jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true);
    else
      execute 'insert into auth.identities(id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
               values ($1, $1, $2, ''email'', null, now(), now())'
        using v_user, jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true);
    end if;
    insert into core.user_profiles(user_id, full_name, managed_company_id) values (v_user, v_name, p_company);
    v_pw := core.staff_set_temp_password(v_user);
    v_created := true;
  else
    select * into m from core.company_members cm where cm.company_id = p_company and cm.user_id = v_user;
    if m.user_id is not null and m.disabled_at is not null then
      raise exception 'Сотрудник с этой почтой отключён' using errcode = '22023';
    elsif m.user_id is not null then
      raise exception 'Сотрудник с этой почтой уже есть в компании' using errcode = '22023';
    end if;
    insert into core.user_profiles(user_id, full_name) values (v_user, v_name)
      on conflict on constraint user_profiles_pkey do update set full_name = coalesce(core.user_profiles.full_name, excluded.full_name);
  end if;

  insert into core.company_members(company_id, user_id) values (p_company, v_user);
  perform public.pf_assign_role(v_user, p_role, p_project, null, null);
  perform planfact.log_admin_change(p_company, null, 'company_members', v_user, 'MEMBER_ADD', null,
            jsonb_build_object('email', v_email, 'full_name', v_name, 'new_account', v_created,
                               'role_id', p_role, 'project_id', p_project));
  return query select v_user, v_pw, v_created;
end $$;

create or replace function public.pf_company_reset_password(p_company uuid, p_user uuid)
returns text language plpgsql volatile security definer set search_path = pg_catalog, planfact, core as $$
declare m core.company_members; v_pw text;
begin
  m := core.staff_target(p_company, p_user);
  if m.disabled_at is not null then
    raise exception 'Сотрудник отключён' using errcode = '22023';
  end if;
  if not exists (select 1 from core.user_profiles where user_id = p_user and managed_company_id = p_company) then
    raise exception 'Пароль этой учётки компания не меняет (учётка создана не здесь)' using errcode = '42501';
  end if;
  v_pw := core.staff_set_temp_password(p_user);
  perform planfact.log_admin_change(p_company, null, 'company_members', p_user, 'PASSWORD_RESET', null, null);
  return v_pw;
end $$;

create or replace function public.pf_list_company_members(p_company uuid)
returns table(user_id uuid, email text, assignment_id uuid, role_id uuid, role_name text, project_id uuid, project_name text,
              valid_from timestamptz, valid_to timestamptz, is_active boolean, counterparty_id uuid, counterparty_name text,
              full_name text, disabled_at timestamptz, must_change_password boolean, managed boolean)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select m.user_id, u.email::text, a.id, a.role_id, r.name, a.project_id, p.name, a.valid_from, a.valid_to,
         case when a.id is null then null else (a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())) end,
         a.counterparty_id, c.name,
         up.full_name, m.disabled_at, coalesce(up.must_change_password, false), coalesce(up.managed_company_id = p_company, false)
  from core.company_members m
  left join auth.users u on u.id = m.user_id
  left join core.user_profiles up on up.user_id = m.user_id
  left join core.role_assignments a on a.company_id = m.company_id and a.user_id = m.user_id and a.revoked_at is null
  left join core.company_roles r on r.id = a.role_id
  left join core.projects p on p.id = a.project_id
  left join core.counterparties c on c.id = a.counterparty_id
  where m.company_id = p_company
  order by (m.disabled_at is not null), coalesce(up.full_name, u.email::text), r.name, p.name nulls first;
end $$;

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

create or replace function public.pf_assign_role(p_user uuid, p_role uuid, p_project uuid default null, p_valid_to timestamptz default null,
  p_counterparty uuid default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_company uuid; v_id uuid;
begin
  select company_id into v_company from core.company_roles where id = p_role;
  if v_company is null or not planfact.has_company_permission(v_company, 'security.roles.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot assign a role to yourself' using errcode = '42501';
  end if;
  if not exists (select 1 from core.company_members where company_id = v_company and user_id = p_user) then
    raise exception 'Сотрудник не состоит в этой компании' using errcode = '42501';
  end if;
  if p_project is not null and not exists (select 1 from core.projects where id = p_project and company_id = v_company) then
    raise exception 'Проект не принадлежит этой компании' using errcode = '42501';
  end if;
  if p_counterparty is not null and not exists (select 1 from core.counterparties where id = p_counterparty and company_id = v_company
       and deleted_at is null and archived_at is null and 'contractor' = any(kinds)) then
    raise exception 'Фирма не найдена среди подрядчиков компании («Контрагенты», вид «подрядчик»)' using errcode = '22023';
  end if;
  if p_valid_to is not null and p_valid_to <= now() then
    raise exception 'Срок окончания уже прошёл' using errcode = '22023';
  end if;
  if exists (select 1 from core.role_assignments where user_id = p_user and role_id = p_role
             and project_id is not distinct from p_project and revoked_at is null
             and (valid_to is null or valid_to > now())) then
    raise exception 'Такое назначение уже действует' using errcode = '22023';
  end if;
  insert into core.role_assignments(company_id, user_id, role_id, project_id, valid_to, created_by, counterparty_id)
  values (v_company, p_user, p_role, p_project, p_valid_to, auth.uid(), p_counterparty)
  returning id into v_id;
  perform planfact.log_admin_change(v_company, p_project, 'role_assignments', v_id, 'ASSIGN', null,
            jsonb_build_object('user_id', p_user, 'role_id', p_role, 'role_name', (select name from core.company_roles where id = p_role),
                               'project_id', p_project, 'valid_to', p_valid_to, 'counterparty_id', p_counterparty));
  return v_id;
end $$;

revoke all on function public.pf_company_add_member(uuid, text, text, uuid, uuid), public.pf_company_reset_password(uuid, uuid),
  public.pf_list_company_members(uuid), public.pf_set_full_name(uuid, text),
  public.pf_assign_role(uuid, uuid, uuid, timestamptz, uuid) from public, anon;
grant execute on function public.pf_company_add_member(uuid, text, text, uuid, uuid), public.pf_company_reset_password(uuid, uuid),
  public.pf_list_company_members(uuid), public.pf_set_full_name(uuid, text),
  public.pf_assign_role(uuid, uuid, uuid, timestamptz, uuid) to authenticated;
revoke all on function core.staff_rename_quality(uuid, uuid, text[], text), quality.rbi_transfer_attach_profiles(uuid) from public, anon, authenticated;
drop function if exists core.staff_owned_by(uuid, uuid);

commit;
