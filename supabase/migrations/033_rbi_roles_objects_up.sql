-- P2-0033 этап 1 (ADR-070, CRITICAL — правила доступа). Закрепление сотрудника за объектами Качества по id и правило видимости
-- «свой объект или свои записи без объекта» (ROLE_MATRIX dataScope 'ownProjectOrOwnRecords', permission.service.js).
--   1) у назначения роли — список постоянных id объектов Качества компании (quality.project_objects.id); null = все объекты;
--   2) объект записи пока текст (project_canonical_key / project_display_name / "projectId" узла локаций) — сопоставление
--      «id объекта → ключ, название, синонимы» делает сервер по справочнику (переходно, ADR-070 п. 4; записи на id — P2-0035),
--      сравнение — как в клиенте (ObjectDirectory.cleanString: без регистра, кавычек и приставки «ЖК»);
--   3) назначение с объектами: запись видна, если её объект в списке (любой автор) или это своя запись без объекта
--      (пусто / «unknown» / «Все»); править и удалять — по роли (с правкой без *.manage — только свои);
--   4) таблицы без объекта записи (Стройконтроль, черновики, очередь) — как раньше.
-- Остальные правила (компания запроса, модуль, срок назначения, фирма подрядчика) — без изменений. Применять после 032d,
-- одним запросом. Откат — 033_rbi_roles_objects_down.sql.
begin;

do $$
begin
  if to_regprocedure('quality.inspection_child_writable(uuid,uuid,text[],text)') is null
     or to_regprocedure('core.staff_owned_by(uuid,uuid)') is null then
    raise exception '033: сначала 023 и 032–032d' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'role_assignments'
              and column_name = 'quality_objects') then
    raise exception '033 уже применена (повтор — только после 033_rbi_roles_objects_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Закреплённые объекты Качества у назначения (одно место — ядро, рядом с назначением) и служебные признаки этих объектов
--    для быстрой проверки строки (считает сервер: при назначении и при правке справочника объектов; клиент таблицу не пишет).
alter table core.role_assignments add column quality_objects text[]
  constraint role_assignments_quality_objects_chk check (quality_objects is null or cardinality(quality_objects) between 1 and 500);
alter table core.role_assignments add column quality_object_keys text[];
comment on column core.role_assignments.quality_objects is 'P2-0033: id объектов Качества (quality.project_objects.id); null — все объекты';
comment on column core.role_assignments.quality_object_keys is 'P2-0033: служебно — признаки закреплённых объектов (id, узлы локаций, очищенные названия); считает сервер';

-- 2. Строка для сравнения названий объекта — как ObjectDirectory.cleanString (object-directory.service.js).
create function quality.object_clean(p text)
returns text language sql immutable set search_path = pg_catalog as $$
  -- регулярное выражение — только если есть «жк» (правило считается на каждой строке, замер P2-0033)
  select btrim(case when strpos(lower(coalesce(p, '')), 'жк') > 0
                    then regexp_replace(translate(lower(coalesce(p, '')), '''"«»', ''), 'жк\s+', '', 'g')
                    else translate(lower(coalesce(p, '')), '''"«»', '') end, E' \t\r\n')
$$;
-- Признаки закреплённых объектов (как ObjectDirectory.isRecordInAssignedProjects): id объекта; очищенные ключ, название,
-- синонимы; id узлов-объектов локаций с тем же названием (у записей "projectId" — id узла).
create function quality.objects_keys(p_company uuid, p_ids text[])
returns text[] language sql stable security definer set search_path = pg_catalog as $$
  with o as (
    select po.id, array[quality.object_clean(po.canonical_key), quality.object_clean(po.display_name)]
             || array(select quality.object_clean(y) from unnest(coalesce(po.synonyms, '{}')) y) names
      from quality.project_objects po where po.core_company_id = p_company and po.id = any (p_ids))
  select coalesce(array_agg(distinct x) filter (where x <> ''), '{}') from (
    select o.id x from o
    union all select unnest(o.names) from o
    union all select n.id from quality.location_nodes n
     where n.core_company_id = p_company and n."nodeType" = 'object' and not n.is_deleted
       and exists (select 1 from o where quality.object_clean(coalesce(nullif(n.canonical_key, ''), n."displayName")) = any (o.names))) t;
$$;

-- Признаки считает сервер при любой записи назначения (подставить свои нельзя).
create function quality.assignment_object_keys()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  new.quality_object_keys := case when new.quality_objects is null then null else quality.objects_keys(new.company_id, new.quality_objects) end;
  return new;
end $$;
create trigger role_assignments_quality_object_keys before insert or update on core.role_assignments
  for each row execute function quality.assignment_object_keys();

-- Справочник объектов или узел-объект локаций изменён — пересчитать признаки действующих назначений компании с объектами.
create function quality.refresh_object_keys()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  n jsonb := to_jsonb(new);   -- общая функция двух таблиц: поля — через jsonb (у объектов нет "nodeType")
  o jsonb := to_jsonb(old);
begin
  if tg_table_name = 'location_nodes' and coalesce(n ->> 'nodeType', '') <> 'object' and coalesce(o ->> 'nodeType', '') <> 'object' then
    return null;
  end if;
  update core.role_assignments a set quality_object_keys = quality.objects_keys(a.company_id, a.quality_objects)
   where a.company_id = coalesce(n ->> 'core_company_id', o ->> 'core_company_id')::uuid and a.quality_objects is not null and a.revoked_at is null
     and (tg_table_name = 'location_nodes' or a.quality_objects && array[coalesce(n ->> 'id', o ->> 'id')]);
  return null;
end $$;
create trigger project_objects_refresh_object_keys after insert or update or delete on quality.project_objects
  for each row execute function quality.refresh_object_keys();
create trigger location_nodes_refresh_object_keys after insert or update or delete on quality.location_nodes
  for each row execute function quality.refresh_object_keys();

-- 3. Область видимости строки с объектом записи p_obj (до 3 признаков: "projectId", ключ, название; null — у таблицы нет
--    объекта записи, правило объектов не применяется). Назначение с объектами: чужой объект — нет; без объекта — только своя
--    запись (дальше — правила роли); свой объект — просмотр любого автора (решение владельца 25.10.2026: как вид 'contractor' —
--    фирма подрядчика и объект ядра как раньше), правка — по правилам роли. Остальное — как 020.
-- Признаки объекта записи для сравнения: исходные значения и очищенные; null — «нет объекта» (отдельная функция, чтобы план
-- правила оставался простым: sql-правило планируется на каждой строке, тяжёлые выражения в нём — замер P2-0033).
create function quality.record_keys(p_obj text[])
returns text[] language plpgsql immutable set search_path = pg_catalog as $$
declare
  v text[] := array[btrim(p_obj[1]), btrim(p_obj[2]), btrim(p_obj[3])];
  x text;
  i int;
  v_any boolean := false;
begin
  for i in 1..3 loop
    -- = quality.object_clean за один проход; «нет объекта» (пусто, unknown, «Все») — пустая строка
    x := translate(lower(coalesce(p_obj[i], '')), '''"«»', '');
    if strpos(x, 'жк') > 0 then x := regexp_replace(x, 'жк\s+', '', 'g'); end if;
    x := btrim(x, E' \t\r\n');
    if x in ('unknown', 'все', 'all') or x like 'все %' then x := ''; end if;
    v_any := v_any or x <> '';
    v := v || x;
  end loop;
  return case when v_any then v end;
end $$;

create function quality.row_visible(p_company uuid, p_project uuid, p_actions text[], p_kind text,
  p_author uuid, p_assignee uuid, p_ckey text, p_cname text, p_obj text[])
returns boolean language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  select p_company is not null and p_company = quality.request_company() and exists (
    select 1 from unnest(p_actions) act
    join core.company_modules cm on cm.company_id = p_company and cm.module = split_part(act, '.', 1) and cm.enabled
    cross join (select quality.record_keys(p_obj) ks) k
    where planfact.is_platform_admin() or exists (
      select 1 from core.role_assignments a
      join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = act
      where a.company_id = p_company and a.user_id = auth.uid()
        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
        and case
          when p_obj is null or p_kind not in ('author', 'contractor') or a.quality_objects is null then
            quality.assignment_sees(a, split_part(act, '.', 1), p_project, p_kind, p_author, p_assignee, p_ckey, p_cname)
          when k.ks is null then
            coalesce(auth.uid() = p_author or auth.uid() = p_assignee, false)
            and quality.assignment_sees(a, split_part(act, '.', 1), p_project, p_kind, p_author, p_assignee, p_ckey, p_cname)
          when a.quality_object_keys && k.ks then
            quality.assignment_sees(a, split_part(act, '.', 1), p_project,
              case when split_part(act, '.', 2) = 'view' then 'contractor' else p_kind end, p_author, p_assignee, p_ckey, p_cname)
          else false end));
$$;

-- Пункты и фото проверки — по своей проверке, с её объектом (сигнатуры и правила таблиц — как в 023).
create or replace function quality.inspection_child_visible(p_company uuid, p_project uuid, p_actions text[], p_inspection text, p_author uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, contractor_canonical_key, contractor_name,
         "projectId", project_canonical_key, project_display_name into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.row_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.contractor_canonical_key, i.contractor_name,
      array[i."projectId", i.project_canonical_key, i.project_display_name]);
  end if;
  return quality.row_visible(p_company, p_project, p_actions, 'author', p_author, null, null, null);
end $$;

create or replace function quality.inspection_child_writable(p_company uuid, p_project uuid, p_actions text[], p_inspection text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, core as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, contractor_canonical_key, contractor_name,
         "projectId", project_canonical_key, project_display_name into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.row_visible(i.core_company_id, i.core_project_id, p_actions, 'author',
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.contractor_canonical_key, i.contractor_name,
      array[i."projectId", i.project_canonical_key, i.project_display_name]);
  end if;
  return quality.can(p_company, p_project, array(select replace(x, '.edit', '.manage') from unnest(p_actions) x));
end $$;

revoke all on function quality.object_clean(text), quality.record_keys(text[]), quality.objects_keys(uuid, text[]),
  quality.assignment_object_keys(), quality.refresh_object_keys(),
  quality.row_visible(uuid, uuid, text[], text, uuid, uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function quality.row_visible(uuid, uuid, text[], text, uuid, uuid, text, text, text[]) to authenticated;

-- 5. Таблицы с объектом записи: правила select / insert / update / delete — с объектом (прочие аргументы — как 020/023).
do $$
declare r record; v_vis text; v_edit text;
begin
  for r in select * from (values
    ('rbi_inspections',
       '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), null, contractor_canonical_key, contractor_name',
       'array["projectId", project_canonical_key, project_display_name]'),
    ('rbi_tasks',
       '''author'', coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, contractor_canonical_key, contractor_name',
       'array[null, project_canonical_key, project_display_name]'),
    ('sk_records',              '''contractor'', core_created_by, null, contractor_canonical_key, contractor_name',
       'array["projectId", project_canonical_key, project_display_name]'),
    ('project_fmea',            '''contractor'', core_created_by, null, null, contractor_name', 'array[null, project_canonical_key, project_display_name]'),
    ('project_interventions',   '''contractor'', core_created_by, null, null, contractor_name', 'array[null, project_canonical_key, project_display_name]'),
    ('project_meetings',        '''contractor'', core_created_by, null, null, contractor_name', 'array[null, project_canonical_key, project_display_name]'),
    ('project_schedule_stages', '''contractor'', core_created_by, null, null, contractor_name', 'array[null, project_canonical_key, project_display_name]'),
    ('shared_reports',          '''contractor'', core_created_by, null, contractor_canonical_key, null', 'array[null, project_canonical_key, project_display_name]'),
    ('shared_report_snapshots', '''contractor'', core_created_by, null, contractor_canonical_key, null', 'array[null, project_canonical_key]')
  ) v(t, args, obj) loop
    v_vis  := format('quality.row_visible(core_company_id, core_project_id, %L, %s, %s)', '{quality.view}', r.args, r.obj);
    v_edit := format('quality.row_visible(core_company_id, core_project_id, %L, %s, %s)', '{quality.edit}', r.args, r.obj);
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

-- 6. Экран Качества: + закреплённые объекты Качества (null — все; [{id, key, name}]). Прежние ключи — без изменений.
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
    'objects', case when not exists (select 1 from asg) or exists (select 1 from asg where quality_objects is null) then null
                    else coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'key', o.canonical_key, 'name', o.display_name)
                                                    order by o.display_name)
                                     from quality.project_objects o
                                    where o.core_company_id = quality.request_company()
                                      and o.id in (select unnest(quality_objects) from asg)), '[]'::jsonb) end,
    'contractor', (select jsonb_build_object('id', c.id, 'name', c.name,
                            'keys', coalesce((select jsonb_agg(l.canonical_key order by l.canonical_key) from quality.contractor_core_links l
                                               where l.counterparty_id = c.id), '[]'::jsonb))
                     from asg join core.counterparties c on c.id = asg.counterparty_id and c.company_id = asg.company_id
                    where c.deleted_at is null order by c.name limit 1));
$$;

-- 7. Объекты Качества компании для выбора при назначении роли (администратор ролей компании).
create function public.pf_list_quality_objects(p_company uuid)
returns table(id text, name text, canonical_key text)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select o.id, coalesce(nullif(btrim(o.display_name), ''), o.canonical_key), o.canonical_key
    from quality.project_objects o
   where o.core_company_id = p_company and not coalesce(o.is_deleted, false) and not coalesce(o._deleted, false) and o.deleted_at is null
   order by 2, 1;
end $$;

-- 8. Назначение роли: + закреплённые объекты (id объектов Качества этой компании; пусто — все). Тело — как 032d.
drop function public.pf_assign_role(uuid, uuid, uuid, timestamptz, uuid);
create function public.pf_assign_role(p_user uuid, p_role uuid, p_project uuid default null, p_valid_to timestamptz default null,
  p_counterparty uuid default null, p_objects text[] default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_company uuid; v_id uuid; v_objects text[];
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
  if exists (select 1 from core.company_members where company_id = v_company and user_id = p_user and disabled_at is not null) then
    raise exception 'Сотрудник отключён — роль не назначается' using errcode = '42501';   -- ревью M3 (P2-0028)
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
  -- 033: объекты — только действующие объекты Качества этой компании, по id (ADR-070)
  v_objects := array(select distinct btrim(x) from unnest(coalesce(p_objects, '{}')) x where nullif(btrim(coalesce(x, '')), '') is not null order by 1);
  if cardinality(v_objects) = 0 then v_objects := null; end if;
  if v_objects is not null and exists (select 1 from unnest(v_objects) x where not exists (
       select 1 from quality.project_objects o where o.core_company_id = v_company and o.id = x
          and not coalesce(o.is_deleted, false) and not coalesce(o._deleted, false) and o.deleted_at is null)) then
    raise exception 'Объект не найден среди объектов Качества компании' using errcode = '22023';
  end if;
  if exists (select 1 from core.role_assignments where user_id = p_user and role_id = p_role
             and project_id is not distinct from p_project and revoked_at is null
             and (valid_to is null or valid_to > now())) then
    raise exception 'Такое назначение уже действует' using errcode = '22023';
  end if;
  insert into core.role_assignments(company_id, user_id, role_id, project_id, valid_to, created_by, counterparty_id, quality_objects)
  values (v_company, p_user, p_role, p_project, p_valid_to, auth.uid(), p_counterparty, v_objects)
  returning id into v_id;
  perform planfact.log_admin_change(v_company, p_project, 'role_assignments', v_id, 'ASSIGN', null,
            jsonb_build_object('user_id', p_user, 'role_id', p_role, 'role_name', (select name from core.company_roles where id = p_role),
                               'project_id', p_project, 'valid_to', p_valid_to, 'counterparty_id', p_counterparty,
                               'quality_objects', v_objects));
  return v_id;
end $$;

-- 9. Список людей: + закреплённые объекты назначения [{id, name}] (столбец в конце; прежние — как 032d).
drop function public.pf_list_company_members(uuid);
create function public.pf_list_company_members(p_company uuid)
returns table(user_id uuid, email text, assignment_id uuid, role_id uuid, role_name text, project_id uuid, project_name text,
              valid_from timestamptz, valid_to timestamptz, is_active boolean, counterparty_id uuid, counterparty_name text,
              full_name text, disabled_at timestamptz, must_change_password boolean, managed boolean, quality_objects jsonb)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select m.user_id, u.email::text, a.id, a.role_id, r.name, a.project_id, p.name, a.valid_from, a.valid_to,
         case when a.id is null then null else (a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())) end,
         a.counterparty_id, c.name,
         up.full_name, m.disabled_at, coalesce(up.must_change_password, false), core.staff_owned_by(p_company, m.user_id),
         case when a.quality_objects is null then null else
           (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', coalesce((select coalesce(nullif(btrim(o.display_name), ''), o.canonical_key)
                    from quality.project_objects o where o.core_company_id = p_company and o.id = x.id), x.id)) order by x.n), '[]'::jsonb)
              from unnest(a.quality_objects) with ordinality x(id, n)) end
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

revoke all on function public.pf_assign_role(uuid, uuid, uuid, timestamptz, uuid, text[]), public.pf_list_company_members(uuid),
  public.pf_list_quality_objects(uuid) from public, anon;
grant execute on function public.pf_assign_role(uuid, uuid, uuid, timestamptz, uuid, text[]), public.pf_list_company_members(uuid),
  public.pf_list_quality_objects(uuid) to authenticated;

commit;
