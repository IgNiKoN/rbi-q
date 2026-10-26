-- P2-0028 этап 1 (ADR-069 п. 1, 4, 7; CRITICAL — вход). Сотрудники компании: учётка функцией сервера.
-- Администратор компании (право security.roles.assign) или администратор платформы:
--   pf_company_add_member      — учётка (если почты нет) + участник + роль; временный пароль генерирует сервер и отдаёт ОДИН раз;
--   pf_company_reset_password  — новый временный пароль, старый и открытые сеансы сразу не работают;
--   pf_company_disable_member  — назначения отозваны, участник отключён, вход закрыт (если человек не состоит в других компаниях);
--   pf_password_changed        — сам пользователь после смены пароля через Auth снимает флаг «сменить пароль»;
--   pf_my_profile              — кто я: почта, ФИО, флаг.
-- Учётка создаётся так же, как P2-0004 / P2-0009 (auth.users + auth.identities, bcrypt), но функцией с проверкой прав.
-- Пароль открыто нигде не хранится: в auth.users — bcrypt; в core.user_profiles — копия bcrypt-хэша временного пароля
-- (чтобы pf_password_changed убедился, что пароль действительно сменён). Журнал — без паролей.
-- Настройки Auth/GoTrue/JWT не меняются; регистрация на сервере не закрывается (P2-0032). public.* не затрагивается.
-- Пароль сбрасывает и вход закрывает только у учётки, созданной этой компанией (managed_company_id): чужую учётку
-- (другой компании, самостоятельно зарегистрированную, скрытую учётку PIN старого приложения) захватить нельзя.
-- Откат — 032_company_staff_down.sql.
begin;

-- 1. Профиль учётки в ядре: ФИО (одно место), чья учётка, флаг «сменить пароль»
create table if not exists core.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  managed_company_id uuid references core.companies(id) on delete set null,
  must_change_password boolean not null default false,
  temp_password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table core.user_profiles enable row level security;   -- правил нет: клиенту закрыто, только функции
revoke all on core.user_profiles from public, anon, authenticated;

-- 2. Отключённый участник компании
alter table core.company_members add column if not exists disabled_at timestamptz;
alter table core.company_members add column if not exists disabled_by uuid;

-- Отключённый участник — не участник (тело как после 016, + disabled_at is null)
create or replace function planfact.is_company_member(p_company uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  select exists (select 1 from core.company_members m
                 where m.company_id = p_company and m.user_id = auth.uid() and m.disabled_at is null)
      or (planfact.is_platform_admin() and exists (select 1 from core.companies c where c.id = p_company));
$$;

-- 3. Служебные функции (клиенту не выдаются)
-- Временный пароль: 14 знаков без похожих (I, O, l, o, 0, 1), ~81 бит.
create or replace function core.staff_temp_password()
returns text language sql volatile security definer set search_path = pg_catalog, extensions as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', (get_byte(x.b, i) % 56) + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(14) b) x, generate_series(0, 13) i;
$$;

-- Закрыть открытые сеансы учётки (refresh-токены): после сброса пароля и отключения
create or replace function core.staff_kill_sessions(p_user uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog as $$
begin
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1::text' using p_user;
  end if;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user;
  end if;
end $$;

-- Новый временный пароль: bcrypt в auth.users, копия хэша и флаг — в профиль; сеансы закрыть. Возвращает пароль.
create or replace function core.staff_set_temp_password(p_user uuid)
returns text language plpgsql volatile security definer set search_path = pg_catalog, extensions as $$
declare v_pw text := core.staff_temp_password(); v_hash text;
begin
  v_hash := extensions.crypt(v_pw, extensions.gen_salt('bf'));
  update auth.users set encrypted_password = v_hash, updated_at = now() where id = p_user;
  if not found then raise exception 'Учётка не найдена' using errcode = 'P0002'; end if;
  update core.user_profiles set must_change_password = true, temp_password_hash = v_hash, updated_at = now() where user_id = p_user;
  perform core.staff_kill_sessions(p_user);
  return v_pw;
end $$;

-- Почта (логин) и ФИО — проверка формата
create or replace function core.staff_email(p_email text)
returns text language plpgsql immutable set search_path = pg_catalog as $$
declare v text := lower(btrim(coalesce(p_email, '')));
begin
  if length(v) > 254 or v !~ '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,}$' or v like '%..%' then
    raise exception 'Почта указана неверно' using errcode = '22023';
  end if;
  if v like '%@rbi-quality.local' then   -- скрытые учётки PIN старого приложения
    raise exception 'Эта почта служебная — укажите настоящую' using errcode = '22023';
  end if;
  return v;
end $$;

create or replace function core.staff_full_name(p_name text)
returns text language plpgsql immutable set search_path = pg_catalog as $$
declare v text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if length(v) < 2 or length(v) > 120 or v !~ '[[:alpha:]]' or v ~ '[[:cntrl:]<>]' then
    raise exception 'ФИО: от 2 до 120 знаков, буквы' using errcode = '22023';
  end if;
  return v;
end $$;

-- Цель действия администратора: участник этой компании, не он сам, не администратор платформы
create or replace function core.staff_target(p_company uuid, p_user uuid)
returns core.company_members language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
declare m core.company_members;
begin
  perform planfact.require_roles_admin(p_company);
  if p_user is null or p_user = auth.uid() then
    raise exception 'Со своей учёткой так нельзя — свой пароль меняйте в «Настройки → Мой профиль»' using errcode = '42501';
  end if;
  if exists (select 1 from core.platform_admins where user_id = p_user) then
    raise exception 'Учётка администратора платформы из компании не меняется' using errcode = '42501';
  end if;
  select * into m from core.company_members where company_id = p_company and user_id = p_user;
  if m.user_id is null then
    raise exception 'Сотрудник не состоит в этой компании' using errcode = '42501';
  end if;
  return m;
end $$;

revoke all on function core.staff_temp_password(), core.staff_kill_sessions(uuid), core.staff_set_temp_password(uuid),
  core.staff_email(text), core.staff_full_name(text), core.staff_target(uuid, uuid) from public, anon, authenticated;

-- 4. Добавить сотрудника. Почты нет — новая учётка с временным паролем (created = true); есть — участник + роль, пароль не трогается.
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

-- 5. Сбросить пароль — только учётке, созданной этой компанией
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

-- 6. Отключить доступ: назначения отозваны, участник отключён; вход закрыт, если учётка этой компании и других компаний нет
create or replace function public.pf_company_disable_member(p_company uuid, p_user uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog, planfact, core as $$
declare m core.company_members; v_roles jsonb; v_block boolean;
begin
  m := core.staff_target(p_company, p_user);
  if m.disabled_at is not null then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object('assignment_id', a.id, 'role_name', r.name, 'project_id', a.project_id)), '[]'::jsonb)
    into v_roles
    from core.role_assignments a join core.company_roles r on r.id = a.role_id
   where a.company_id = p_company and a.user_id = p_user and a.revoked_at is null;
  update core.role_assignments set revoked_at = now(), revoked_by = auth.uid()
   where company_id = p_company and user_id = p_user and revoked_at is null;
  perform planfact.assert_company_has_admin(p_company);
  update core.company_members set disabled_at = now(), disabled_by = auth.uid() where company_id = p_company and user_id = p_user;
  v_block := exists (select 1 from core.user_profiles where user_id = p_user and managed_company_id = p_company)
             and not exists (select 1 from core.company_members where user_id = p_user and company_id <> p_company and disabled_at is null);
  if v_block then
    update auth.users set banned_until = now() + interval '100 years', updated_at = now() where id = p_user;
    perform core.staff_kill_sessions(p_user);
  end if;
  perform planfact.log_admin_change(p_company, null, 'company_members', p_user, 'MEMBER_DISABLE', jsonb_build_object('assignments', v_roles),
            jsonb_build_object('login_blocked', v_block));
end $$;

-- 7. Пароль сменён (вызывает сам пользователь после PUT /auth/v1/user): флаг снимается, если пароль уже не временный
create or replace function public.pf_password_changed()
returns void language plpgsql volatile security definer set search_path = pg_catalog, planfact, core as $$
declare p core.user_profiles; v_hash text;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from core.user_profiles where user_id = auth.uid();
  if p.user_id is null or not p.must_change_password then return; end if;
  select encrypted_password into v_hash from auth.users where id = auth.uid();
  if v_hash is not distinct from p.temp_password_hash then
    raise exception 'Пароль ещё не изменён' using errcode = '22023';
  end if;
  update core.user_profiles set must_change_password = false, temp_password_hash = null, updated_at = now() where user_id = auth.uid();
  if p.managed_company_id is not null then
    perform planfact.log_admin_change(p.managed_company_id, null, 'company_members', auth.uid(), 'PASSWORD_CHANGED', null, null);
  end if;
end $$;

-- 8. Кто я
create or replace function public.pf_my_profile()
returns jsonb language sql stable security definer set search_path = pg_catalog, core as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'user_id', u.id, 'email', u.email,
    'full_name', p.full_name,
    'must_change_password', coalesce(p.must_change_password, false)) end
  from auth.users u left join core.user_profiles p on p.user_id = u.id
  where u.id = auth.uid();
$$;

-- 9. Список сотрудников: + ФИО, отключён, ждёт смены пароля, учётка компании (столбцы в конце; прежние — без изменений, как в 020)
drop function public.pf_list_company_members(uuid);
create function public.pf_list_company_members(p_company uuid)
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

revoke all on function public.pf_company_add_member(uuid, text, text, uuid, uuid), public.pf_company_reset_password(uuid, uuid),
  public.pf_company_disable_member(uuid, uuid), public.pf_password_changed(), public.pf_my_profile(),
  public.pf_list_company_members(uuid) from public, anon;
grant execute on function public.pf_company_add_member(uuid, text, text, uuid, uuid), public.pf_company_reset_password(uuid, uuid),
  public.pf_company_disable_member(uuid, uuid), public.pf_password_changed(), public.pf_my_profile(),
  public.pf_list_company_members(uuid) to authenticated;

commit;
