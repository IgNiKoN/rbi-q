-- Откат 040d (P2-0035b): pf_company_add_member — версия 032d без изменений.
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
    if not exists (select 1 from auth.users u where u.id = v_user and u.email_confirmed_at is not null) then
      raise exception 'Почта этой учётки не подтверждена — добавить нельзя' using errcode = '22023';   -- ревью M4
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

commit;
