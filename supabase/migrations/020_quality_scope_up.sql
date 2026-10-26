-- P2-0018 этап 1 (ADR-068). Видимость по ролям «как в старом Качестве» — проверяет сервер.
-- Область видимости строки (одна функция quality.row_visible) по назначению роли:
--   вся компания  — право quality.scope.company (Администратор компании, Руководство) или *.manage (в пределах объекта назначения);
--   свой подрядчик — право quality.scope.contractor + фирма назначения (role_assignments.counterparty_id): подрядчик записи
--                    (ключ/название) связан с этим контрагентом (quality.contractor_core_links или ключ по названию контрагента);
--   свои записи    — право *.edit без *.manage: проверки и задачи — только свои (автор core_created_by ставит сервер; задача — и назначенная мне);
--   свои объекты   — *.view: всё по объекту назначения (или по компании, если назначение на всю компанию).
-- Таблицы с записями (13): проверки (+ пункты и фото — по своей проверке), задачи, СК, ППР/FMEA/совещания/график,
-- замечания и приёмка Стройконтроля, отчёты и снимки. Остальные таблицы — как в 018 (quality.can).
-- Шаблоны: РП, Прораб, ПТО, Заказчик — только просмотр; Инженер СК — правка своих; Подрядчик — просмотр + правка
-- Стройконтроля своей фирмы. Объекты RBI (public.*) не затрагивает. Применять после 018e, одним запросом.
-- Откат — 020_quality_scope_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.contractor_key(text)') is null then
    raise exception '020: сначала 018e_quality_contractors_up.sql' using errcode = 'P0001';
  end if;
  if to_regprocedure('quality.row_visible(uuid,uuid,text[],text,uuid,uuid,text,text)') is not null then
    raise exception '020 уже применена (повтор — только после 020_quality_scope_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Права области и шаблоны ролей.
insert into core.permission_catalog(action, description) values
  ('quality.scope.company', 'Качество и Стройконтроль: видеть записи всей компании'),
  ('quality.scope.contractor', 'Качество и Стройконтроль: только записи своей фирмы-подрядчика')
on conflict (action) do nothing;
delete from core.role_template_permissions where (template_code, action) in (
  ('project_manager', 'quality.edit'), ('project_manager', 'quality.manage'),
  ('project_manager', 'construction.edit'), ('project_manager', 'construction.manage'),
  ('foreman', 'construction.edit'));
insert into core.role_template_permissions(template_code, action) values
  ('company_admin', 'quality.scope.company'), ('management', 'quality.scope.company'),
  ('contractor_rep', 'quality.scope.contractor')
on conflict do nothing;
delete from core.company_role_permissions rp using core.company_roles r
 where r.id = rp.role_id and r.company_id = rp.company_id and (r.template_code, rp.action) in (
  ('project_manager', 'quality.edit'), ('project_manager', 'quality.manage'),
  ('project_manager', 'construction.edit'), ('project_manager', 'construction.manage'),
  ('foreman', 'construction.edit'));
insert into core.company_role_permissions(role_id, company_id, action)
select r.id, r.company_id, tp.action
from core.company_roles r join core.role_template_permissions tp on tp.template_code = r.template_code
where tp.action like 'quality.scope.%'
on conflict do nothing;

-- 2. Фирма подрядчика у назначения роли (контрагент ядра той же компании).
alter table core.role_assignments add column counterparty_id uuid references core.counterparties(id) on delete set null;

-- 3. Совпадает ли подрядчик записи с контрагентом.
create or replace function quality.contractor_matches(p_company uuid, p_counterparty uuid, p_key text, p_name text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare v_key text := nullif(btrim(coalesce(p_key, '')), '');
begin
  if p_counterparty is null then return false; end if;
  if v_key is null and nullif(btrim(coalesce(p_name, '')), '') is not null then v_key := quality.contractor_key(p_name); end if;
  if v_key is null or v_key = 'unknown_contractor' then return false; end if;
  return exists (select 1 from quality.contractor_core_links l
                  where l.core_company_id = p_company and l.canonical_key = v_key and l.counterparty_id = p_counterparty)
      or exists (select 1 from core.counterparties c
                  where c.id = p_counterparty and c.company_id = p_company and c.deleted_at is null
                    and quality.contractor_key(c.name) = v_key);
end $$;

-- 4. Что видит одно назначение (m — модуль действия: quality / construction).
create or replace function quality.assignment_sees(a core.role_assignments, m text, p_project uuid, p_kind text,
  p_author uuid, p_assignee uuid, p_ckey text, p_cname text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare
  v_acts text[] := array(select rp.action from core.company_role_permissions rp where rp.role_id = a.role_id and rp.company_id = a.company_id);
begin
  if 'quality.scope.company' = any(v_acts) then return true; end if;
  if not (p_project is null or a.project_id is null or a.project_id = p_project) then return false; end if;
  if (m || '.manage') = any(v_acts) then return true; end if;
  if 'quality.scope.contractor' = any(v_acts) then
    return quality.contractor_matches(a.company_id, a.counterparty_id, p_ckey, p_cname);
  end if;
  if p_kind = 'author' and (m || '.edit') = any(v_acts) then
    return auth.uid() is not null and (p_author = auth.uid() or p_assignee = auth.uid());
  end if;
  return true;
end $$;

-- 5. Область видимости строки: текущая компания запроса, модуль включён, действие в назначении и область назначения.
--    p_kind: 'author' — проверки и задачи (свои записи + подрядчик), 'contractor' — только подрядчик.
create or replace function quality.row_visible(p_company uuid, p_project uuid, p_actions text[], p_kind text,
  p_author uuid, p_assignee uuid, p_ckey text, p_cname text)
returns boolean language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  select p_company is not null and p_company = quality.request_company() and exists (
    select 1 from unnest(p_actions) act
    join core.company_modules cm on cm.company_id = p_company and cm.module = split_part(act, '.', 1) and cm.enabled
    where planfact.is_platform_admin() or exists (
      select 1 from core.role_assignments a
      join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = act
      where a.company_id = p_company and a.user_id = auth.uid()
        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
        and quality.assignment_sees(a, split_part(act, '.', 1), p_project, p_kind, p_author, p_assignee, p_ckey, p_cname)));
$$;

-- Пункты и фото проверки — по своей проверке (той же компании); без проверки — как свои записи автора.
create or replace function quality.inspection_child_visible(p_company uuid, p_project uuid, p_actions text[], p_inspection text, p_author uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, contractor_canonical_key, contractor_name into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.row_visible(i.core_company_id, i.core_project_id, p_actions, 'author', i.core_created_by, null,
                               i.contractor_canonical_key, i.contractor_name);
  end if;
  return quality.row_visible(p_company, p_project, p_actions, 'author', p_author, null, null, null);
end $$;

-- 6. Автор записи: ставит сервер при создании, менять нельзя.
create or replace function quality.set_author()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if tg_op = 'INSERT' then new.core_created_by := coalesce(auth.uid(), new.core_created_by);
  else new.core_created_by := old.core_created_by; end if;
  return new;
end $$;

revoke all on function quality.contractor_matches(uuid, uuid, text, text),
  quality.assignment_sees(core.role_assignments, text, uuid, text, uuid, uuid, text, text),
  quality.row_visible(uuid, uuid, text[], text, uuid, uuid, text, text),
  quality.inspection_child_visible(uuid, uuid, text[], text, uuid), quality.set_author() from public, anon, authenticated;
grant execute on function quality.row_visible(uuid, uuid, text[], text, uuid, uuid, text, text),
  quality.inspection_child_visible(uuid, uuid, text[], text, uuid) to authenticated;

-- 7. Таблицы с записями: автор + правила select / insert / update / delete через область видимости.
do $$
declare
  r record;
  v_vis text; v_edit text;
begin
  for r in select * from (values
    -- таблица,                 вид,        view-действия,                   edit-действия,          ключ подрядчика,             название подрядчика, назначенный
    ('rbi_inspections',         'author',     '{quality.view}',      '{quality.edit}',      'contractor_canonical_key', 'contractor_name', 'null'),
    ('rbi_tasks',               'author',     '{quality.view}',      '{quality.edit}',      'contractor_canonical_key', 'contractor_name', 'assigned_to_auth_user_id'),
    ('rbi_inspection_items',    'child',      '{quality.view}',      '{quality.edit}',      null, null, null),
    ('rbi_inspection_photos',   'child',      '{quality.view}',      '{quality.edit}',      null, null, null),
    ('sk_records',              'contractor', '{quality.view}',      '{quality.edit}',      'contractor_canonical_key', 'contractor_name', 'null'),
    ('project_fmea',            'contractor', '{quality.view}',      '{quality.edit}',      'null', 'contractor_name', 'null'),
    ('project_interventions',   'contractor', '{quality.view}',      '{quality.edit}',      'null', 'contractor_name', 'null'),
    ('project_meetings',        'contractor', '{quality.view}',      '{quality.edit}',      'null', 'contractor_name', 'null'),
    ('project_schedule_stages', 'contractor', '{quality.view}',      '{quality.edit}',      'null', 'contractor_name', 'null'),
    ('shared_reports',          'contractor', '{quality.view}',      '{quality.edit}',      'contractor_canonical_key', 'null', 'null'),
    ('shared_report_snapshots', 'contractor', '{quality.view}',      '{quality.edit}',      'contractor_canonical_key', 'null', 'null'),
    ('construction_defects',    'contractor', '{construction.view}', '{construction.edit}', 'null', 'contractor', 'null'),
    ('construction_acceptance', 'contractor', '{construction.view}', '{construction.edit}', 'null', 'contractor', 'null')
  ) v(t, kind, va, ea, ckey, cname, asg) loop
    if r.kind = 'child' then
      v_vis  := format('quality.inspection_child_visible(core_company_id, core_project_id, %L, inspection_id, core_created_by)', r.va);
      v_edit := format('quality.inspection_child_visible(core_company_id, core_project_id, %L, inspection_id, core_created_by)', r.ea);
    else
      v_vis  := format('quality.row_visible(core_company_id, core_project_id, %L, %L, core_created_by, %s, %s, %s)', r.va, r.kind, r.asg, r.ckey, r.cname);
      v_edit := format('quality.row_visible(core_company_id, core_project_id, %L, %L, core_created_by, %s, %s, %s)', r.ea, r.kind, r.asg, r.ckey, r.cname);
    end if;
    execute format('alter table quality.%I add column core_created_by uuid', r.t);
    if exists (select 1 from information_schema.columns c
                where c.table_schema = 'quality' and c.table_name = r.t and c.column_name = 'created_by_auth_user_id') then
      execute format('update quality.%I set core_created_by = created_by_auth_user_id', r.t);
    end if;
    execute format('create trigger %I before insert or update on quality.%I for each row execute function quality.set_author()', r.t || '_set_author', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (%s)', r.t || '_select', r.t, v_vis);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
end $$;

-- 8. Экран Качества: + назначенные объекты (null — вся компания) и фирма подрядчика (прежние ключи — без изменений).
create or replace function quality.my_access(p_project uuid default null)
returns jsonb language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  with asg as (
    select a.*, r.template_code from core.role_assignments a
    join core.company_roles r on r.id = a.role_id and r.company_id = a.company_id
    where a.company_id = quality.request_company() and a.user_id = auth.uid()
      and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))
  select jsonb_build_object(
    'company_id', quality.request_company(),
    'actions', coalesce((select jsonb_agg(pc.action order by pc.action) from core.permission_catalog pc
                          where (pc.action like 'quality.%' or pc.action like 'construction.%')
                            and quality.can(quality.request_company(), p_project, array[pc.action])), '[]'::jsonb),
    'templates', coalesce((select jsonb_agg(distinct template_code) from asg
                            where (p_project is null or project_id is null or project_id = p_project)
                              and template_code is not null), '[]'::jsonb),
    'projects', case when exists (select 1 from asg where project_id is null) then null
                     else coalesce((select jsonb_agg(distinct project_id) from asg), '[]'::jsonb) end,
    'contractor', (select jsonb_build_object('id', c.id, 'name', c.name,
                            'keys', coalesce((select jsonb_agg(l.canonical_key order by l.canonical_key) from quality.contractor_core_links l
                                               where l.counterparty_id = c.id), '[]'::jsonb))
                     from asg join core.counterparties c on c.id = asg.counterparty_id and c.company_id = asg.company_id
                    where c.deleted_at is null order by c.name limit 1));
$$;

-- 9. Назначение роли: + фирма подрядчика (контрагент вида «подрядчик» той же компании).
drop function public.pf_assign_role(uuid, uuid, uuid, timestamptz);
create function public.pf_assign_role(p_user uuid, p_role uuid, p_project uuid default null, p_valid_to timestamptz default null,
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
revoke all on function public.pf_assign_role(uuid, uuid, uuid, timestamptz, uuid) from public, anon;
grant execute on function public.pf_assign_role(uuid, uuid, uuid, timestamptz, uuid) to authenticated;

-- Список людей: + фирма подрядчика назначения (столбцы в конце; прежние — без изменений).
drop function public.pf_list_company_members(uuid);
create function public.pf_list_company_members(p_company uuid)
returns table(user_id uuid, email text, assignment_id uuid, role_id uuid, role_name text, project_id uuid, project_name text,
              valid_from timestamptz, valid_to timestamptz, is_active boolean, counterparty_id uuid, counterparty_name text)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select m.user_id, u.email::text, a.id, a.role_id, r.name, a.project_id, p.name, a.valid_from, a.valid_to,
         case when a.id is null then null else (a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())) end,
         a.counterparty_id, c.name
  from core.company_members m
  left join auth.users u on u.id = m.user_id
  left join core.role_assignments a on a.company_id = m.company_id and a.user_id = m.user_id and a.revoked_at is null
  left join core.company_roles r on r.id = a.role_id
  left join core.projects p on p.id = a.project_id
  left join core.counterparties c on c.id = a.counterparty_id
  where m.company_id = p_company
  order by u.email, r.name, p.name nulls first;
end $$;
revoke all on function public.pf_list_company_members(uuid) from public, anon;
grant execute on function public.pf_list_company_members(uuid) to authenticated;

commit;
