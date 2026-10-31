-- P2-0053 (CRITICAL — права): кнопка «Демо» — заполненный «ЖК Демо» глазами любой роли, только смотреть.
--  1) core.companies.is_demo — демо-компания (одна на платформу; ставит SQL учёток scripts/demo/accounts.mjs);
--  2) core.demo_roles — демо-роли демо-компании: роль на выбор («прораб», «ПТО», …) = своя роль компании с действиями
--     шаблона без записи «с телефона» (факт остаётся, Качество и Стройконтроль — только просмотр) и НИКОГДА без
--     административных (роли и права, сотрудники и участие, модули, проекты и справочники компании, ИИ, журнал) и её
--     область (проект, место, фирма) — заводит администратор демо-компании (pf_demo_setup, засев scripts/demo/);
--  3) core.demo_visits — посетитель (вошедший из любой компании): участник демо-компании с одной демо-ролью и её областью
--     (обычное назначение P2-0048 — права и область считает прежняя проверка core.*); pf_demo_roles — выбор,
--     pf_demo_enter(роль) — войти / сменить роль, pf_demo_leave — выйти (назначение отозвано, участие выключено);
--  4) «только просмотр» для посетителя: сторож-триггер на каждой таблице core / planfact / quality с компанией или проектом —
--     любая запись посетителя в строки демо-компании → отказ 42501 «Демо — только просмотр»; файлы — то же правилом Storage;
--     не посетитель — одна проверка по индексу, больше ничего (РБИ и прочие компании не затрагиваются);
--  5) администратор платформы — обычный посетитель в запросах К ДЕМО-КОМПАНИИ, пока он её посетитель (компания запроса —
--     заголовок x-company-id; решение Архитектора 31.10): planfact.is_platform_admin = false — видит «ЖК Демо» глазами
--     выбранной роли; без заголовка или с другой компанией — администратор как раньше (второе устройство, забыл «Выйти»);
--     has_grant / can_at / row_allowed не меняются;
--  6) посетителей не видно: «Сотрудники», «Кто что может», число людей у администратора платформы; pf_my_platform отдаёт
--     признак is_demo у компании.
-- Применять после 056, одним запросом. Откат — 057_demo_mode_down.sql (демо-компания остаётся обычной тестовой).
begin;

do $$
begin
  if to_regclass('quality.sk_links') is null then
    raise exception '057: сначала 056_sk_core_ids_up.sql' using errcode = 'P0001';
  end if;
  if to_regclass('core.demo_visits') is not null then
    raise exception '057 уже применена (повтор — только после 057_demo_mode_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Демо-компания.
alter table core.companies add column is_demo boolean not null default false;
comment on column core.companies.is_demo is 'P2-0053: демо-компания кнопки «Демо» (одна на платформу): посетители смотрят её глазами демо-роли, писать не могут';
create unique index companies_one_demo_uq on core.companies ((true)) where is_demo and deleted_at is null;

-- 2. Демо-роли.
create table core.demo_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies (id),
  code text not null,
  role_id uuid not null references core.company_roles (id),
  title text not null,
  hint text,
  sort int not null default 100,
  project_id uuid references core.projects (id),
  location_id uuid references core.locations (id),
  counterparty_id uuid references core.counterparties (id),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint demo_roles_code_chk check (code ~ '^[a-z_]+$')
);
create unique index demo_roles_code_uq on core.demo_roles (company_id, code) where deleted_at is null;
create unique index demo_roles_role_uq on core.demo_roles (role_id);
comment on table core.demo_roles is
  'demo_roles: роль на выбор кнопки «Демо» (P2-0053) — роль демо-компании (действия шаблона без записи с телефона) и её область';
alter table core.demo_roles enable row level security;
revoke all on core.demo_roles from public, anon, authenticated;

-- 3. Посетители.
create table core.demo_visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  demo_role_id uuid not null references core.demo_roles (id),
  assignment_id uuid references core.role_assignments (id),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index demo_visits_active_uq on core.demo_visits (user_id) where deleted_at is null;
create index demo_visits_company_user_idx on core.demo_visits (company_id, user_id);
comment on table core.demo_visits is
  'demo_visits: посетитель кнопки «Демо» (P2-0053) — кто смотрит демо-компанию какой ролью; deleted_at — вышел из демо';
alter table core.demo_visits enable row level security;
revoke all on core.demo_visits from public, anon, authenticated;

create trigger demo_roles_touch before update on core.demo_roles for each row execute function core.touch_updated_at();
create trigger demo_visits_touch before update on core.demo_visits for each row execute function core.touch_updated_at();

-- Демо-компания, которую сейчас смотрит вошедший (null — не в демо). Одна проверка по индексу.
create function core.my_demo_company()
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select v.company_id from core.demo_visits v where v.user_id = auth.uid() and v.deleted_at is null
$$;

-- Был ли человек посетителем этой компании (сейчас или раньше) — такие участники не показываются в списках людей.
create function core.is_demo_visitor(p_company uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (select 1 from core.demo_visits v where v.company_id = p_company and v.user_id = p_user)
$$;

-- Административные действия — демо-роли их не получают никогда (решение Архитектора 31.10): роли и права, сотрудники и
-- участие, контрагенты, модули и настройки Качества / СК, проекты, места и справочники компании, ИИ, журнал.
create function core.demo_admin_action(p_action text)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select p_action like 'security.%' or p_action like 'core.%'
      or p_action in ('quality.manage', 'quality.objects.manage', 'construction.manage', 'construction.objects.manage', 'quality.ai',
                      'planfact.projects.manage', 'planfact.units.manage', 'planfact.brigades.manage', 'planfact.thresholds.edit',
                      'planfact.audit.view')
$$;

-- Действия демо-роли из действий шаблона: просмотр и видимость записей; работа План/Факта (ВОР, смета, факт, КС-2) — его
-- запись идёт через сервер и упирается в сторож; Качество и Стройконтроль — только просмотр (их записи создаёт телефон без
-- сети — по копии прав он их и не даст создать); административных — нет.
create function core.demo_actions(p_template text)
returns text[] language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(array_agg(t.action order by t.action), '{}')
    from core.role_template_permissions t
   where t.template_code = p_template
     and (t.action like '%.view' or t.action like 'quality.scope.%' or t.action like 'planfact.%')
     and not core.demo_admin_action(t.action)
$$;

revoke all on function core.my_demo_company(), core.is_demo_visitor(uuid, uuid), core.demo_actions(text), core.demo_admin_action(text) from public, anon, authenticated;
-- правило Storage ниже выполняется от имени клиента
grant execute on function core.my_demo_company() to authenticated;

-- 4. Сторож «Демо — только просмотр»: строка демо-компании (её компания, или проект демо-компании) — посетителю отказ.
create function core.demo_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_uid uuid := auth.uid();
  v_cache text;
  v_demo uuid;
  v_row jsonb;
  v_company uuid;
begin
  if v_uid is null then return coalesce(new, old); end if;   -- сервис без входа — дальше
  -- «посетитель ли» — один раз на транзакцию (пакетная запись РБИ не платит проверку за каждую строку); вход и выход из демо
  -- сбрасывают запомненное
  v_cache := current_setting('p2.demo_cache', true);
  if v_cache is not null and v_cache like v_uid::text || ':%' then
    v_demo := nullif(split_part(v_cache, ':', 2), '-')::uuid;
  else
    v_demo := core.my_demo_company();
    perform set_config('p2.demo_cache', v_uid::text || ':' || coalesce(v_demo::text, '-'), true);
  end if;
  if v_demo is null then return coalesce(new, old); end if;   -- не посетитель — дальше
  foreach v_row in array array[case when tg_op <> 'DELETE' then to_jsonb(new) end, case when tg_op <> 'INSERT' then to_jsonb(old) end] loop
    continue when v_row is null;
    -- вход, смена роли и выход посетителя (pf_demo_enter / pf_demo_leave) пишут его участие — только эти таблицы и только
    -- его строки
    continue when current_setting('p2.demo_switch', true) = 'on' and (v_row->>'user_id')::uuid = auth.uid()
      and (tg_table_schema, tg_table_name) in (('core', 'demo_visits'), ('core', 'role_assignments'), ('core', 'company_members'));
    if tg_table_schema = 'core' and tg_table_name = 'companies' then v_company := (v_row->>'id')::uuid;
    else
      v_company := coalesce((v_row->>'company_id')::uuid, (v_row->>'core_company_id')::uuid);
      if v_company is null and v_row ? 'project_id' then
        select p.company_id into v_company from core.projects p where p.id = (v_row->>'project_id')::uuid;
      end if;
    end if;
    if v_company = v_demo then
      raise exception 'Демо — только просмотр. Попробуйте это в своей компании' using errcode = '42501';
    end if;
  end loop;
  return coalesce(new, old);
end $$;

revoke all on function core.demo_guard() from public, anon, authenticated;

do $$
declare r record; n int := 0;
begin
  for r in
    select t.table_schema s, t.table_name tb
      from information_schema.tables t
     where t.table_type = 'BASE TABLE' and t.table_schema in ('core', 'planfact', 'quality')
       and ((t.table_schema, t.table_name) = ('core', 'companies') or exists (
             select 1 from information_schema.columns c
              where c.table_schema = t.table_schema and c.table_name = t.table_name
                and c.column_name in ('company_id', 'core_company_id', 'project_id') and c.data_type = 'uuid'))
     order by 1, 2
  loop
    -- имя — последним среди триггеров «до записи»: сторож видит компанию, которую уже поставили триггеры привязки
    execute format('create trigger zzzzz_demo_guard before insert or update or delete on %I.%I for each row execute function core.demo_guard()', r.s, r.tb);
    n := n + 1;
  end loop;
  raise notice '057: сторож «Демо — только просмотр» — таблиц %', n;
end $$;

-- Файлы: посетитель не кладёт, не меняет и не удаляет файлы в папке демо-компании (пути файлов компаний начинаются с её id:
-- quality-*, core-place-plans); свои файлы с другого устройства — как обычно (триггер на таблицы Storage не закрывает).
create function core.demo_file_ok(p_name text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select core.my_demo_company() is null or split_part(coalesce(p_name, ''), '/', 1) is distinct from core.my_demo_company()::text
$$;
revoke all on function core.demo_file_ok(text) from public, anon, authenticated;
grant execute on function core.demo_file_ok(text) to authenticated;
create policy demo_visitor_no_insert on storage.objects as restrictive for insert to authenticated with check (core.demo_file_ok(name));
create policy demo_visitor_no_update on storage.objects as restrictive for update to authenticated using (core.demo_file_ok(name)) with check (core.demo_file_ok(name));
create policy demo_visitor_no_delete on storage.objects as restrictive for delete to authenticated using (core.demo_file_ok(name));

-- 5. Администратор платформы — посетитель в запросах к демо-компании (компания запроса — заголовок x-company-id; его шлют
-- клиенты Качества и платформы, пока выбрана демо-компания). Без заголовка, с другой компанией, после «Выйти» — как раньше.
create function core.request_company_text()
returns text language plpgsql stable set search_path = pg_catalog as $$
declare v text := nullif(btrim(coalesce(current_setting('request.headers', true), '')), '');
begin
  if v is null then return null; end if;
  return (v::json) ->> 'x-company-id';
exception when others then return null;   -- испорченный заголовок — как без него
end $$;
revoke all on function core.request_company_text() from public, anon, authenticated;

-- Демо-компания запроса (заголовок x-company-id — демо-компания), иначе null.
create function core.request_demo_company()
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select c.id from core.companies c where c.is_demo and c.deleted_at is null and c.id::text = core.request_company_text()
$$;
revoke all on function core.request_demo_company() from public, anon, authenticated;

create or replace function planfact.is_platform_admin()
returns boolean language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  select auth.uid() is not null and exists (select 1 from core.platform_admins where user_id = auth.uid())
     and not exists (select 1 from core.demo_visits v where v.user_id = auth.uid() and v.deleted_at is null
                      and v.company_id::text = core.request_company_text());
$$;

-- 6. Функции кнопки «Демо».
-- Демо-роли (администратор демо-компании; засев): p_roles — [{code, title, hint, sort, project, location, counterparty}].
-- Роль компании «<название> — демо» создаётся или обновляется: действия — core.demo_actions(шаблон code).
create function public.pf_demo_setup(p_company uuid, p_roles jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare r jsonb; v_role uuid; v_code text; v_title text; v_n int := 0; v_project uuid; v_location uuid; v_cp uuid;
begin
  perform planfact.require_roles_admin(p_company);
  if not exists (select 1 from core.companies c where c.id = p_company and c.is_demo and c.deleted_at is null) then
    raise exception 'Это не демо-компания' using errcode = '22023';
  end if;
  if jsonb_typeof(p_roles) is distinct from 'array' then raise exception 'Нужен список ролей' using errcode = '22023'; end if;
  for r in select x from jsonb_array_elements(p_roles) x loop
    v_code := r->>'code'; v_title := btrim(coalesce(r->>'title', ''));
    if not exists (select 1 from core.role_templates t where t.code = v_code) or v_code = 'company_admin' then
      raise exception 'Нет такой роли для демо: %', coalesce(v_code, '—') using errcode = '22023';
    end if;
    if v_title = '' then raise exception 'Нужно название роли' using errcode = '22023'; end if;
    v_project := nullif(r->>'project', '')::uuid; v_location := nullif(r->>'location', '')::uuid; v_cp := nullif(r->>'counterparty', '')::uuid;
    if v_project is not null and not exists (select 1 from core.projects p where p.id = v_project and p.company_id = p_company) then
      raise exception 'Проект не из демо-компании' using errcode = '22023';
    end if;
    if v_location is not null and not exists (select 1 from core.locations l where l.id = v_location and l.project_id = v_project) then
      raise exception 'Место не из проекта демо-роли' using errcode = '22023';
    end if;
    if v_cp is not null and not exists (select 1 from core.counterparties c where c.id = v_cp and c.company_id = p_company) then
      raise exception 'Фирма не из демо-компании' using errcode = '22023';
    end if;
    select d.role_id into v_role from core.demo_roles d where d.company_id = p_company and d.code = v_code and d.deleted_at is null;
    if v_role is null then
      insert into core.company_roles(company_id, name) values (p_company, v_title || ' — демо') returning id into v_role;
      insert into core.demo_roles(company_id, code, role_id, title) values (p_company, v_code, v_role, v_title);
    else
      update core.company_roles set name = v_title || ' — демо' where id = v_role;
    end if;
    delete from core.company_role_permissions where role_id = v_role;
    insert into core.company_role_permissions(role_id, company_id, action)
      select v_role, p_company, a from unnest(core.demo_actions(v_code)) a;
    update core.demo_roles set title = v_title, hint = nullif(btrim(coalesce(r->>'hint', '')), ''),
           sort = coalesce((r->>'sort')::int, 100), project_id = v_project, location_id = v_location, counterparty_id = v_cp
     where role_id = v_role;
    -- посетители этой роли — сразу в новой области
    update core.role_assignments a set project_id = v_project, location_id = v_location, counterparty_id = v_cp
      from core.demo_visits v
     where v.assignment_id = a.id and v.deleted_at is null and a.role_id = v_role;
    v_n := v_n + 1;
  end loop;
  perform planfact.log_admin_change(p_company, null, 'demo_roles', p_company, 'DEMO_SETUP', null, jsonb_build_object('roles', v_n));
  return v_n;
end $$;
revoke all on function public.pf_demo_setup(uuid, jsonb) from public, anon;
grant execute on function public.pf_demo_setup(uuid, jsonb) to authenticated;

-- Роли на выбор (любому вошедшему). ready — демо-компания есть и заполнена ролями.
create function public.pf_demo_roles()
returns table(code text, title text, hint text, sort int, area text, current boolean, company_id uuid, company_name text)
language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  select d.code, d.title, d.hint, d.sort,
         case when d.location_id is not null then planfact.location_path(d.location_id)
              when d.project_id is not null then 'весь объект «' || p.name || '»' else 'вся компания' end
         || case when cp.name is not null then ', фирма ' || cp.name else '' end,
         exists (select 1 from core.demo_visits v where v.user_id = auth.uid() and v.deleted_at is null and v.demo_role_id = d.id),
         c.id, c.name
    from core.demo_roles d
    join core.companies c on c.id = d.company_id and c.is_demo and c.deleted_at is null
    left join core.projects p on p.id = d.project_id
    left join core.counterparties cp on cp.id = d.counterparty_id
   where auth.uid() is not null and d.deleted_at is null
   order by d.sort, d.title
$$;
revoke all on function public.pf_demo_roles() from public, anon;
grant execute on function public.pf_demo_roles() to authenticated;

-- Войти в демо ролью (повторный вызов — сменить роль). Участник демо-компании с назначением демо-роли и её областью.
create function public.pf_demo_enter(p_role text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_uid uuid := auth.uid(); d core.demo_roles; v core.demo_visits; v_asg uuid; v_name text;
begin
  if v_uid is null then raise exception 'Войдите, чтобы открыть демо' using errcode = '42501'; end if;
  perform set_config('p2.demo_switch', 'on', true);
  perform set_config('p2.demo_cache', '', true);
  select dr.* into d from core.demo_roles dr join core.companies c on c.id = dr.company_id and c.is_demo and c.deleted_at is null
   where dr.code = p_role and dr.deleted_at is null;
  if d.id is null then raise exception 'Демо пока не готово или нет такой роли' using errcode = '22023'; end if;
  -- сотрудник самой демо-компании (учётки засева) — не посетитель
  if exists (select 1 from core.company_members m where m.company_id = d.company_id and m.user_id = v_uid)
     and not core.is_demo_visitor(d.company_id, v_uid) then
    raise exception 'Вы сотрудник демо-компании — кнопка «Демо» для учёток других компаний' using errcode = '22023';
  end if;
  select * into v from core.demo_visits where user_id = v_uid and deleted_at is null for update;
  if v.id is not null and v.company_id <> d.company_id then
    update core.demo_visits set deleted_at = now() where id = v.id;
    v.id := null;
  end if;
  insert into core.company_members(company_id, user_id) values (d.company_id, v_uid)
    on conflict (company_id, user_id) do update set disabled_at = null, disabled_by = null;
  if v.id is not null and v.assignment_id is not null
     and exists (select 1 from core.role_assignments a where a.id = v.assignment_id and a.revoked_at is null) then
    update core.role_assignments set role_id = d.role_id, project_id = d.project_id, location_id = d.location_id,
           counterparty_id = d.counterparty_id
     where id = v.assignment_id;
    v_asg := v.assignment_id;
  else
    insert into core.role_assignments(company_id, user_id, role_id, project_id, location_id, counterparty_id, created_by)
    values (d.company_id, v_uid, d.role_id, d.project_id, d.location_id, d.counterparty_id, v_uid) returning id into v_asg;
  end if;
  if v.id is null then
    insert into core.demo_visits(company_id, user_id, demo_role_id, assignment_id, created_by)
    values (d.company_id, v_uid, d.id, v_asg, v_uid);
  else
    update core.demo_visits set demo_role_id = d.id, assignment_id = v_asg where id = v.id;
  end if;
  perform set_config('p2.demo_switch', 'off', true);
  perform set_config('p2.demo_cache', '', true);
  select c.name into v_name from core.companies c where c.id = d.company_id;
  return jsonb_build_object('company_id', d.company_id, 'company_name', v_name, 'role', d.code, 'title', d.title);
end $$;
revoke all on function public.pf_demo_enter(text) from public, anon;
grant execute on function public.pf_demo_enter(text) to authenticated;

-- Выйти из демо: назначение отозвано, участие выключено; повтор — ничего не делает. true — был в демо.
create function public.pf_demo_leave()
returns boolean language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_uid uuid := auth.uid(); v core.demo_visits;
begin
  if v_uid is null then return false; end if;
  select * into v from core.demo_visits where user_id = v_uid and deleted_at is null for update;
  if v.id is null then return false; end if;
  perform set_config('p2.demo_switch', 'on', true);
  perform set_config('p2.demo_cache', '', true);
  update core.role_assignments set revoked_at = now(), revoked_by = v_uid where id = v.assignment_id and revoked_at is null;
  update core.company_members set disabled_at = now(), disabled_by = v_uid where company_id = v.company_id and user_id = v_uid;
  update core.demo_visits set deleted_at = now() where id = v.id;
  perform set_config('p2.demo_switch', 'off', true);
  perform set_config('p2.demo_cache', '', true);
  return true;
end $$;
revoke all on function public.pf_demo_leave() from public, anon;
grant execute on function public.pf_demo_leave() to authenticated;

-- 7. Посетителей не видно и признак демо — правка прежних функций по месту (текст функции меняется заменой; не нашлось —
-- отказ миграции, чтобы правка не прошла мимо).
create function pg_temp.patch(p_fn regprocedure, p_from text[], p_to text[])
returns void language plpgsql as $$
declare v_new text := pg_get_functiondef(p_fn); i int;
begin
  for i in 1..cardinality(p_from) loop
    if position(p_from[i] in v_new) = 0 then
      raise exception '057: в % не найдено место правки «%»', p_fn, p_from[i] using errcode = 'P0001';
    end if;
    v_new := replace(v_new, p_from[i], p_to[i]);
  end loop;
  execute v_new;
end $$;

select pg_temp.patch('public.pf_list_company_members(uuid)'::regprocedure,
  array['  where m.company_id = p_company
'],
  array['  where m.company_id = p_company and not core.is_demo_visitor(p_company, m.user_id)
']);
select pg_temp.patch('public.pf_who_can(uuid, uuid, uuid)'::regprocedure,
  array['where a.company_id = p_company and a.revoked_at is null'],
  array['where a.company_id = p_company and not core.is_demo_visitor(p_company, a.user_id) and a.revoked_at is null']);
select pg_temp.patch('public.pf_platform_companies()'::regprocedure,
  array['(select count(*)::int from core.company_members m where m.company_id = c.id)'],
  array['(select count(*)::int from core.company_members m where m.company_id = c.id and not core.is_demo_visitor(c.id, m.user_id))']);
select pg_temp.patch('public.pf_my_platform()'::regprocedure,
  array['select c.id, c.name, c.is_test from core.companies c, me',
        '''id'', comp.id, ''name'', comp.name, ''is_test'', comp.is_test,'],
  array['select c.id, c.name, c.is_test, c.is_demo from core.companies c, me',
        '''id'', comp.id, ''name'', comp.name, ''is_test'', comp.is_test, ''is_demo'', comp.is_demo,']);
select pg_temp.patch('quality.member_by_email(uuid, text)'::regprocedure,
  array['where m.company_id = p_company and p_company = quality.request_company()'],
  array['where m.company_id = p_company and p_company = quality.request_company() and not core.is_demo_visitor(p_company, m.user_id)']);
-- Сводка План/Факта в демо (запрос к демо-компании) — только объекты демо, без объектов своей компании посетителя (доработка 1)
select pg_temp.patch('public.pf_summary_portfolio()'::regprocedure,
  array['declare v_today date := planfact.fact_today();',
        'from core.projects p where p.archived_at is null and planfact.has_permission(p.id, ''planfact.fact.view'')'],
  array['declare v_today date := planfact.fact_today(); v_demo uuid := core.request_demo_company();',
        'from core.projects p where p.archived_at is null and planfact.has_permission(p.id, ''planfact.fact.view'')
      and (v_demo is null or p.company_id = v_demo)']);
drop function pg_temp.patch(regprocedure, text[], text[]);

commit;
