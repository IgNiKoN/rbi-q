-- P2-0071 (CRITICAL — права / RLS): Качество на единый механизм прав (стандарт «Права на сервере», 052).
--  1) каталог: тонкие действия Качества (проверки, задачи, совещания, FMEA и этапы, отчёты, внешний СК) с группами и подписями;
--     признак core.permission_catalog.unplaced — что участник части проекта может с записью без места («все» / «своя»;
--     пусто — как 052: только своя и только просмотр, поведение Стройконтроля и План/Факта не меняется);
--  2) роли получают новые действия по прежним (view → видеть; edit → проводить, ставить, выполнять, вести, удалять свои;
--     edit + manage / scope.company / scope.contractor → «править чужие»), прежние ключи остаются (общие разделы: база знаний,
--     справочники, профили, ИИ — по ним);
--  3) перенос назначений (решения владельца 30.10.2026): назначение на компанию с выбранными «объектами Качества» → участие
--     на эти объекты для всех модулей роли (прежнее отзывается); роль «только свои» на компанию без объектов → «без объектов»
--     (назначение на проект-контейнер Качества: общие разделы, без записей объектов); роли с quality.scope.company — без
--     изменений; журнал — p2_backup.m053_assignments (для отката);
--  4) правила строк проверок (с пунктами и фото) и задач — quality.rec_ok → core.row_allowed: объект записи — core_object_id
--     (проект ядра); «видеть все» — по действию, своя запись (автор или исполнитель) — по действию «своих»; запись без
--     объекта — участники на всю компанию и автор; сторож действий — quality.quality_rights_guard (отказ 42501 с текстом);
--  4а) остальные записи Качества на объекте (совещания и мероприятия, FMEA и этапы, отчёты, внешний СК) — тот же quality.rec_ok по
--     действиям своей группы; общие таблицы внешнего СК и шаблоны отчётов — по действиям группы без области;
--  5) мост «объекты Качества» снят: pf_set_participation / pf_assign_role не принимают и не пишут quality_objects;
--     set_record_object проверяет «объект за вами» по участию; общие таблицы Качества (quality.can) и прежние правила
--     Стройконтроля 1 / черновиков видят записи контейнера при участии на любой объект.
-- Применять после 052, одним запросом, ДО выкладки приложения. Откат — 053_quality_rights_down.sql.
begin;

do $$
begin
  if to_regprocedure('core.row_allowed(uuid, uuid, uuid, text[], uuid, uuid)') is null then
    raise exception '053: сначала 052_rights_mechanism_up.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'permission_catalog'
               and column_name = 'unplaced') then
    raise exception '053 уже применена (повтор — только после 053_quality_rights_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Каталог действий Качества.
alter table core.permission_catalog add column unplaced text check (unplaced in ('all', 'own'));
comment on column core.permission_catalog.unplaced is 'P2-0071: запись без места у участника части проекта: null — только своя и только просмотр (052); all — все записи проекта без места; own — своя запись без места';

insert into core.permission_catalog(action, description, area_scoped, module, group_name, sort, label, unplaced) values
  ('quality.inspections.view', 'Качество: видеть все проверки (без галочки — только свои)', true, 'quality', 'Проверки', 2110, 'Просмотр всех', 'all'),
  ('quality.inspections.create', 'Качество: проводить проверки и править свои', true, 'quality', 'Проверки', 2120, 'Создание', 'own'),
  ('quality.inspections.edit_any', 'Качество: править чужие проверки', true, 'quality', 'Проверки', 2130, 'Редактирование чужих', null),
  ('quality.inspections.delete', 'Качество: удалять проверки (чужие — вместе с «Редактирование чужих»)', true, 'quality', 'Проверки', 2140, 'Удаление', 'own'),
  ('quality.tasks.view', 'Качество: видеть все задачи (без галочки — только свои и порученные)', true, 'quality', 'Задачи', 2210, 'Просмотр всех', 'all'),
  ('quality.tasks.create', 'Качество: ставить задачи и править свои', true, 'quality', 'Задачи', 2220, 'Создание', 'own'),
  ('quality.tasks.work', 'Качество: выполнять порученные задачи (статус, отметки)', true, 'quality', 'Задачи', 2230, 'Выполнение', 'own'),
  ('quality.tasks.edit_any', 'Качество: править чужие задачи — закрыть, вернуть, переназначить', true, 'quality', 'Задачи', 2240, 'Редактирование чужих', null),
  ('quality.tasks.delete', 'Качество: удалять задачи (чужие — вместе с «Редактирование чужих»)', true, 'quality', 'Задачи', 2250, 'Удаление', 'own'),
  ('quality.meetings.view', 'Качество: видеть совещания и мероприятия воздействия', true, 'quality', 'Совещания и мероприятия', 2310, 'Просмотр', 'all'),
  ('quality.meetings.edit', 'Качество: вести совещания и мероприятия воздействия', true, 'quality', 'Совещания и мероприятия', 2320, 'Редактирование', 'own'),
  ('quality.method.view', 'Качество: видеть FMEA и этапы графика объекта', true, 'quality', 'FMEA и этапы', 2410, 'Просмотр', 'all'),
  ('quality.method.edit', 'Качество: вести FMEA и этапы графика объекта', true, 'quality', 'FMEA и этапы', 2420, 'Редактирование', 'own'),
  ('quality.reports.view', 'Качество: видеть отчёты', true, 'quality', 'Отчёты', 2510, 'Просмотр', 'all'),
  ('quality.reports.edit', 'Качество: формировать отчёты и шаблоны', true, 'quality', 'Отчёты', 2520, 'Редактирование', 'own'),
  ('quality.sk.view', 'Качество: видеть замечания внешнего СК', true, 'quality', 'Внешний СК', 2610, 'Просмотр', 'all'),
  ('quality.sk.import', 'Качество: загружать выгрузки внешнего СК', true, 'quality', 'Внешний СК', 2620, 'Загрузка выгрузок', 'own');

update core.permission_catalog c set group_name = v.grp, sort = v.sort, label = v.label
  from (values
    ('quality.view', 'База знаний и справочники', 2910, 'Просмотр'),
    ('quality.edit', 'База знаний и справочники', 2920, 'Редактирование'),
    ('quality.ai', 'База знаний и справочники', 2930, 'ИИ-помощник'),
    ('quality.manage', 'Настройки', 2950, 'Полный доступ (настройки и все записи)'),
    ('quality.objects.manage', 'Настройки', 2960, 'Справочник объектов и дерево локаций')
  ) v(action, grp, sort, label)
 where c.action = v.action;

-- 2. Новые действия по прежним (одно правило — для шаблонов и ролей компаний; только на время миграции).
create function pg_temp.quality_fine_actions(a text[])
returns text[] language sql immutable as $$
  select (case when 'quality.view' = any(a) then
            array['quality.inspections.view', 'quality.tasks.view', 'quality.meetings.view', 'quality.method.view',
                  'quality.reports.view', 'quality.sk.view'] else '{}'::text[] end)
      || (case when 'quality.edit' = any(a) then
            array['quality.inspections.create', 'quality.inspections.delete', 'quality.tasks.create', 'quality.tasks.work',
                  'quality.tasks.delete', 'quality.meetings.edit', 'quality.method.edit', 'quality.reports.edit',
                  'quality.sk.import'] else '{}'::text[] end)
      || (case when 'quality.edit' = any(a) and ('quality.manage' = any(a) or 'quality.scope.company' = any(a)
                                                  or 'quality.scope.contractor' = any(a)) then
            array['quality.inspections.edit_any', 'quality.tasks.edit_any'] else '{}'::text[] end)
$$;
insert into core.role_template_permissions(template_code, action)
select t.template_code, x
  from (select template_code, array_agg(action) acts from core.role_template_permissions group by template_code) t
  cross join lateral unnest(pg_temp.quality_fine_actions(t.acts)) x
on conflict do nothing;
insert into core.company_role_permissions(role_id, company_id, action)
select r.role_id, r.company_id, x
  from (select role_id, company_id, array_agg(action) acts from core.company_role_permissions group by role_id, company_id) r
  cross join lateral unnest(pg_temp.quality_fine_actions(r.acts)) x
on conflict do nothing;
drop function pg_temp.quality_fine_actions(text[]);

-- 3. Ядро: запись без места у участника части проекта — по признаку действия (unplaced), остальное — как 052.
create or replace function core.assignment_allows(a core.role_assignments, p_action text, p_project uuid, p_up uuid[], p_author uuid, p_counterparty uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_acts text[] := array(select rp.action from core.company_role_permissions rp where rp.role_id = a.role_id and rp.company_id = a.company_id);
  m constant text := split_part(p_action, '.', 1);
  v_u text;
begin
  if 'quality.scope.company' = any(v_acts) then return true; end if;
  if not (p_project is null or a.project_id is null or a.project_id = p_project) then return false; end if;
  if a.location_id is not null then
    -- запись с местом — место участия или выше него; без места — по признаку действия (053): all — все, own — своя,
    -- нет признака — только своя и только просмотр (052)
    if cardinality(p_up) = 0 then
      select pc.unplaced into v_u from core.permission_catalog pc where pc.action = p_action;
      if v_u is null then return p_action like '%.view' and auth.uid() is not null and p_author = auth.uid(); end if;
      if v_u = 'own' and not (auth.uid() is not null and p_author = auth.uid()) then return false; end if;
    elsif not a.location_id = any(p_up) then return false; end if;
  end if;
  if (m || '.manage') = any(v_acts) then return true; end if;
  if 'quality.scope.contractor' = any(v_acts) then
    return a.counterparty_id is not null and p_counterparty is not null and a.counterparty_id = p_counterparty;
  end if;
  return true;
end $function$;

-- 4. Качество: объект записи — проект ядра (core_object_id); проверка — core.row_allowed.
-- Проект-контейнер Качества (общие записи компании; назначение на него — «без объектов»).
create function quality.is_container(p_project uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select p_project is not null and exists (select 1 from core.projects p where p.id = p_project and p.quality_container)
$$;
-- Запись без объекта («не разобрано»): проект-заглушка — подходят только назначения на всю компанию.
create function quality.no_object()
returns uuid language sql immutable set search_path = pg_catalog as $$ select '00000000-0000-0000-0000-000000000000'::uuid $$;

-- Есть ли у человека одно из действий хоть где-то в компании (кроме «без объектов»); подрядчик — своя фирма.
create function quality.has_anywhere(p_company uuid, p_actions text[], p_counterparty uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select p_company is not null and auth.uid() is not null and exists (
    select 1 from unnest(p_actions) act
    join core.permission_catalog pc on pc.action = act
    where (pc.module is null or exists (select 1 from core.company_modules cm
                                         where cm.company_id = p_company and cm.module = pc.module and cm.enabled))
      and (planfact.is_platform_admin() or exists (
        select 1 from core.role_assignments a
        join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = act
        where a.company_id = p_company and a.user_id = auth.uid()
          and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
          and (a.project_id is null or not quality.is_container(a.project_id))
          and (a.location_id is null or pc.area_scoped)
          and (not exists (select 1 from core.company_role_permissions x where x.role_id = a.role_id and x.company_id = a.company_id
                             and x.action = 'quality.scope.contractor')
               or exists (select 1 from core.company_role_permissions x where x.role_id = a.role_id and x.company_id = a.company_id
                            and x.action = 'quality.scope.company')
               or (a.counterparty_id is not null and a.counterparty_id = p_counterparty)))))
$$;

-- Объект записи: core_object_id; не распознан, а проект записи указан прямо (не контейнер) — этот проект.
create function quality.record_object(p_project uuid, p_object uuid)
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(p_object, case when p_project is not null and not quality.is_container(p_project) then p_project end)
$$;

-- Правило строк записи Качества: одно из p_any над записью (область, фирма, место) или — своя запись (автор / исполнитель) —
-- одно из p_own; своя запись без объекта — при p_own хоть где-то в компании.
create function quality.rec_ok(p_company uuid, p_project uuid, p_object uuid, p_any text[], p_own text[], p_author uuid,
  p_assignee uuid, p_counterparty uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  with o as (select quality.record_object(p_project, p_object) obj)
  select p_company is not null and p_company = quality.request_company() and (
    core.row_allowed(p_company, coalesce(o.obj, quality.no_object()), null, p_any, p_author, p_counterparty)
    or (auth.uid() is not null and coalesce(auth.uid() = p_author or auth.uid() = p_assignee, false)
        and cardinality(p_own) > 0
        and (core.row_allowed(p_company, coalesce(o.obj, quality.no_object()), null, p_own, auth.uid(), p_counterparty)
             or (o.obj is null and quality.has_anywhere(p_company, p_own, p_counterparty)))))
  from o
$$;

-- Пункты и фото проверки — по своей проверке; без проверки — своё (видеть) / настройки (править), как 039a.
create function quality.inspection_child_ok(p_company uuid, p_project uuid, p_inspection text, p_author uuid, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $$
declare i record;
begin
  select core_company_id, core_project_id, core_created_by, engineer_name, core_counterparty_id, core_object_id into i
    from quality.rbi_inspections where id = p_inspection and core_company_id = p_company;
  if found then
    return quality.rec_ok(i.core_company_id, i.core_project_id, i.core_object_id,
      case when p_write then '{quality.inspections.edit_any}'::text[] else '{quality.inspections.view}'::text[] end,
      case when p_write then '{quality.inspections.create,quality.inspections.delete}'::text[]
           else '{quality.inspections.view,quality.inspections.create}'::text[] end,
      coalesce(i.core_created_by, quality.member_by_email(i.core_company_id, i.engineer_name)), null, i.core_counterparty_id);
  end if;
  if p_write then return quality.can(p_company, p_project, '{quality.manage}'); end if;
  return p_company = quality.request_company() and auth.uid() is not null and auth.uid() = p_author
     and quality.has_anywhere(p_company, '{quality.inspections.view,quality.inspections.create}', null);
end $$;

-- Отказ сторожа с понятным текстом: «группа: действие» из каталога (подписи — единые: просмотр, создание, редактирование …),
-- объект записи.
create function quality.deny(p_object uuid, p_action text)
returns void language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_label text; v_obj text;
begin
  select pc.group_name || ': ' || lower(left(coalesce(pc.label, pc.description), 1)) || substr(coalesce(pc.label, pc.description), 2)
    into v_label from core.permission_catalog pc where pc.action = p_action;
  select p.name into v_obj from core.projects p where p.id = p_object;
  raise exception 'Нет права «%» %', coalesce(v_label, p_action), coalesce('на объекте «' || v_obj || '»', 'для записи без объекта')
    using errcode = '42501';
end $$;

-- Без входа (правила строк не пропустят) или администратор платформы — сторож не нужен.
create function quality.is_platform_admin()
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select auth.uid() is null or planfact.is_platform_admin()
$$;

-- Есть ли запись (для upsert: существующая проверяется в BEFORE UPDATE), без учёта правил строк.
create function quality.row_exists(p_table text, p_id text, p_company uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $$
declare v boolean;
begin
  if p_table not in ('rbi_inspections', 'rbi_tasks') then return false; end if;
  execute format('select exists (select 1 from quality.%I where id = $1 and core_company_id = $2)', p_table) into v using p_id, p_company;
  return v;
end $$;

-- Сторож действий проверок и задач (BEFORE, последним): создать / править свою / править чужую / удалить (в т. ч. пометкой).
-- Только запросы клиента: функция с правами вызывающего, current_user — authenticated / anon только у прямого запроса;
-- функции сервера (security definer: переименование сотрудника, перенос), миграции и администратор платформы — без сторожа.
create function quality.quality_rights_guard()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
declare
  v_task constant boolean := tg_table_name = 'rbi_tasks';
  p constant text := case when v_task then 'quality.tasks.' else 'quality.inspections.' end;
  v_skip constant text[] := array['updated_at', 'sync_status', 'sync_block_reason', 'source', 'updated_by_auth_user_id',
                                  'core_company_id', 'core_project_id', 'core_object_id', 'core_created_by', 'core_counterparty_id'];
  v_del constant text[] := array['is_deleted', '_deleted', 'deleted_at', '_deleted_at', 'deleted_by_auth_user_id'];
  r jsonb; n jsonb; o jsonb; v_c uuid; v_pr uuid; v_obj0 uuid; v_obj uuid; v_cp uuid; v_author uuid; v_assignee uuid; v_own boolean;
  v_own_edit text[];
begin
  if current_user not in ('authenticated', 'anon') or quality.is_platform_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    -- upsert существующей записи — проверка в BEFORE UPDATE (тот же сторож)
    if quality.row_exists(tg_table_name, new.id, new.core_company_id) then return new; end if;
    r := to_jsonb(new);
    v_obj := quality.record_object(new.core_project_id, new.core_object_id);
    if not quality.rec_ok(new.core_company_id, new.core_project_id, new.core_object_id, '{}', array[p || 'create'], auth.uid(), null,
                          (r ->> 'core_counterparty_id')::uuid) then
      perform quality.deny(v_obj, p || 'create');
    end if;
    return new;
  end if;
  o := to_jsonb(old);
  v_c := old.core_company_id; v_pr := old.core_project_id; v_obj0 := old.core_object_id; v_cp := (o ->> 'core_counterparty_id')::uuid;
  v_obj := quality.record_object(v_pr, v_obj0);
  v_author := coalesce(old.core_created_by, quality.member_by_email(v_c, o ->> 'engineer_name'));
  v_assignee := case when v_task then (o ->> 'assigned_to_auth_user_id')::uuid end;
  v_own := coalesce(auth.uid() = v_author or auth.uid() = v_assignee, false);
  v_own_edit := case when v_task then array[p || 'create', p || 'work'] else array[p || 'create'] end;
  if tg_op = 'UPDATE' then n := to_jsonb(new); end if;
  -- удаление (и пометка удаления): «Удаление»; чужая запись — ещё и «Редактирование чужих»
  if tg_op = 'DELETE' or (select bool_or((n -> k) is distinct from (o -> k)) from unnest(v_del) k) then
    if not quality.rec_ok(v_c, v_pr, v_obj0, case when v_own then '{}'::text[] else array[p || 'delete'] end,
                          array[p || 'delete'], v_author, v_assignee, v_cp) then
      perform quality.deny(v_obj, p || 'delete');
    end if;
    if not v_own and not quality.rec_ok(v_c, v_pr, v_obj0, array[p || 'edit_any'], '{}', v_author, v_assignee, v_cp) then
      perform quality.deny(v_obj, p || 'edit_any');
    end if;
    if tg_op = 'DELETE' then return old; end if;
  end if;
  -- остальные поля: своя — «Создание» (задачи — или «Выполнение»); чужая или смена исполнителя не автором —
  -- «Редактирование чужих»
  if (n - v_skip - v_del) is distinct from (o - v_skip - v_del) then
    if v_own and not (v_task and coalesce(auth.uid() is distinct from v_author, true)
                      and (n -> 'assigned_to_auth_user_id', n -> 'assigned_to_name')
                          is distinct from (o -> 'assigned_to_auth_user_id', o -> 'assigned_to_name')) then
      if not quality.rec_ok(v_c, v_pr, v_obj0, '{}', v_own_edit, v_author, v_assignee, v_cp) then
        perform quality.deny(v_obj, v_own_edit[cardinality(v_own_edit)]);
      end if;
    elsif not quality.rec_ok(v_c, v_pr, v_obj0, array[p || 'edit_any'], '{}', v_author, v_assignee, v_cp) then
      perform quality.deny(v_obj, p || 'edit_any');
    end if;
  end if;
  return new;
end $$;
create trigger rbi_inspections_zzz_rights_guard before insert or update or delete on quality.rbi_inspections
  for each row execute function quality.quality_rights_guard();
create trigger rbi_tasks_zzz_rights_guard before insert or update or delete on quality.rbi_tasks
  for each row execute function quality.quality_rights_guard();

-- Правила строк: проверки (пункты, фото) и задачи. Видеть — «видеть все» или своя; править — любое действие правки записи
-- (какое именно — решает сторож, отказ с текстом), как Стройконтроль 052.
drop policy rbi_inspections_select on quality.rbi_inspections;
drop policy rbi_inspections_insert on quality.rbi_inspections;
drop policy rbi_inspections_update on quality.rbi_inspections;
drop policy rbi_inspections_delete on quality.rbi_inspections;
create policy rbi_inspections_select on quality.rbi_inspections for select to authenticated using (
  quality.rec_ok(core_company_id, core_project_id, core_object_id, '{quality.inspections.view}', '{quality.inspections.view,quality.inspections.create}',
    coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), null, core_counterparty_id));
create policy rbi_inspections_insert on quality.rbi_inspections for insert to authenticated with check (
  quality.rec_ok(core_company_id, core_project_id, core_object_id, '{quality.inspections.create,quality.inspections.edit_any,quality.inspections.delete}', '{quality.inspections.create,quality.inspections.edit_any,quality.inspections.delete}',
    coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), null, core_counterparty_id));
create policy rbi_inspections_update on quality.rbi_inspections for update to authenticated using (
  quality.rec_ok(core_company_id, core_project_id, core_object_id, '{quality.inspections.create,quality.inspections.edit_any,quality.inspections.delete}', '{quality.inspections.create,quality.inspections.edit_any,quality.inspections.delete}',
    coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), null, core_counterparty_id))
  with check (
  quality.rec_ok(core_company_id, core_project_id, core_object_id, '{quality.inspections.create,quality.inspections.edit_any,quality.inspections.delete}', '{quality.inspections.create,quality.inspections.edit_any,quality.inspections.delete}',
    coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), null, core_counterparty_id));
create policy rbi_inspections_delete on quality.rbi_inspections for delete to authenticated using (
  quality.rec_ok(core_company_id, core_project_id, core_object_id, '{quality.inspections.create,quality.inspections.edit_any,quality.inspections.delete}', '{quality.inspections.create,quality.inspections.edit_any,quality.inspections.delete}',
    coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), null, core_counterparty_id));

drop policy rbi_tasks_select on quality.rbi_tasks;
drop policy rbi_tasks_insert on quality.rbi_tasks;
drop policy rbi_tasks_update on quality.rbi_tasks;
drop policy rbi_tasks_delete on quality.rbi_tasks;
create policy rbi_tasks_select on quality.rbi_tasks for select to authenticated using (
  quality.rec_ok(core_company_id, core_project_id, core_object_id, '{quality.tasks.view}', '{quality.tasks.view,quality.tasks.create,quality.tasks.work}',
    coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, core_counterparty_id));
create policy rbi_tasks_insert on quality.rbi_tasks for insert to authenticated with check (
  quality.rec_ok(core_company_id, core_project_id, core_object_id, '{quality.tasks.create,quality.tasks.work,quality.tasks.edit_any,quality.tasks.delete}', '{quality.tasks.create,quality.tasks.work,quality.tasks.edit_any,quality.tasks.delete}',
    coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, core_counterparty_id));
create policy rbi_tasks_update on quality.rbi_tasks for update to authenticated using (
  quality.rec_ok(core_company_id, core_project_id, core_object_id, '{quality.tasks.create,quality.tasks.work,quality.tasks.edit_any,quality.tasks.delete}', '{quality.tasks.create,quality.tasks.work,quality.tasks.edit_any,quality.tasks.delete}',
    coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, core_counterparty_id))
  with check (
  quality.rec_ok(core_company_id, core_project_id, core_object_id, '{quality.tasks.create,quality.tasks.work,quality.tasks.edit_any,quality.tasks.delete}', '{quality.tasks.create,quality.tasks.work,quality.tasks.edit_any,quality.tasks.delete}',
    coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, core_counterparty_id));
create policy rbi_tasks_delete on quality.rbi_tasks for delete to authenticated using (
  quality.rec_ok(core_company_id, core_project_id, core_object_id, '{quality.tasks.create,quality.tasks.work,quality.tasks.edit_any,quality.tasks.delete}', '{quality.tasks.create,quality.tasks.work,quality.tasks.edit_any,quality.tasks.delete}',
    coalesce(core_created_by, quality.member_by_email(core_company_id, engineer_name)), assigned_to_auth_user_id, core_counterparty_id));

do $$
declare t text;
begin
  foreach t in array array['rbi_inspection_items', 'rbi_inspection_photos'] loop
    execute format('drop policy %I on quality.%I', t || '_select', t);
    execute format('drop policy %I on quality.%I', t || '_insert', t);
    execute format('drop policy %I on quality.%I', t || '_update', t);
    execute format('drop policy %I on quality.%I', t || '_delete', t);
    execute format('create policy %I on quality.%I for select to authenticated using '
                   '(quality.inspection_child_ok(core_company_id, core_project_id, inspection_id, core_created_by, false))', t || '_select', t);
    execute format('create policy %I on quality.%I for insert to authenticated with check '
                   '(quality.inspection_child_ok(core_company_id, core_project_id, inspection_id, core_created_by, true))', t || '_insert', t);
    execute format('create policy %I on quality.%I for update to authenticated using '
                   '(quality.inspection_child_ok(core_company_id, core_project_id, inspection_id, core_created_by, true)) with check '
                   '(quality.inspection_child_ok(core_company_id, core_project_id, inspection_id, core_created_by, true))', t || '_update', t);
    execute format('create policy %I on quality.%I for delete to authenticated using '
                   '(quality.inspection_child_ok(core_company_id, core_project_id, inspection_id, core_created_by, true))', t || '_delete', t);
  end loop;
end $$;

-- 5. Мост «объекты Качества» снят.
-- Общие таблицы Качества и прежние правила (Стройконтроль 1, черновики, очередь): запись контейнера видна при участии
-- на любой объект (прежде такие назначения были «на компанию с объектами»).
create or replace function quality.has_actions(p_company uuid, p_project uuid, p_actions text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core', 'planfact'
AS $function$
  select p_company is not null and auth.uid() is not null and exists (
    select 1 from unnest(p_actions) act
    join core.permission_catalog pc on pc.action = act
    join core.company_modules cm on cm.company_id = p_company and cm.module = split_part(act, '.', 1) and cm.enabled
    where planfact.is_platform_admin() or exists (
      select 1 from core.role_assignments a
      join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = act
      where a.company_id = p_company and a.user_id = auth.uid()
        and (p_project is null or a.project_id is null or a.project_id = p_project or quality.is_container(p_project))
        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())));
$function$;
create or replace function quality.assigned_with(p_company uuid, p_project uuid, p_actions text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core'
AS $function$
  select auth.uid() is not null and exists (
    select 1 from core.role_assignments a
    join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = any(p_actions)
    where a.company_id = p_company and a.user_id = auth.uid()
      and (p_project is null or a.project_id is null or a.project_id = p_project or quality.is_container(p_project))
      and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()));
$function$;
create or replace function quality.contractor_limited(p_company uuid, p_project uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core', 'planfact'
AS $function$
  with a as (
    select array(select rp.action from core.company_role_permissions rp where rp.role_id = x.role_id and rp.company_id = x.company_id) acts
      from core.role_assignments x
     where x.company_id = p_company and x.user_id = auth.uid()
       and x.revoked_at is null and x.valid_from <= now() and (x.valid_to is null or x.valid_to > now())
       and (p_project is null or x.project_id is null or x.project_id = p_project or quality.is_container(p_project)))
  select auth.uid() is not null and not planfact.is_platform_admin()
     and exists (select 1 from a where 'construction.edit' = any(acts) and 'quality.scope.contractor' = any(acts))
     and not exists (select 1 from a where 'construction.edit' = any(acts) and not 'quality.scope.contractor' = any(acts));
$function$;
create or replace function quality.assignment_sees(a core.role_assignments, m text, p_project uuid, p_kind text, p_author uuid, p_assignee uuid, p_ckey text, p_cname text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core'
AS $function$
declare
  v_acts text[] := array(select rp.action from core.company_role_permissions rp where rp.role_id = a.role_id and rp.company_id = a.company_id);
begin
  if p_kind = 'owner' then
    if not (p_project is null or a.project_id is null or a.project_id = p_project or quality.is_container(p_project)) then return false; end if;
    return (m || '.manage') = any(v_acts) or (auth.uid() is not null and p_author = auth.uid());
  end if;
  if 'quality.scope.company' = any(v_acts) then return true; end if;
  if not (p_project is null or a.project_id is null or a.project_id = p_project or quality.is_container(p_project)) then return false; end if;
  if (m || '.manage') = any(v_acts) then return true; end if;
  if 'quality.scope.contractor' = any(v_acts) then
    return quality.contractor_matches(a.company_id, a.counterparty_id, p_ckey, p_cname);
  end if;
  if p_kind = 'author' and (m || '.edit') = any(v_acts) then
    return auth.uid() is not null and (p_author = auth.uid() or p_assignee = auth.uid());
  end if;
  return true;
end $function$;
-- «Объект записи за вами»: при неоднозначном объекте — по участию (назначение на компанию или на объект), не по списку объектов.
create or replace function quality.set_record_object()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare n jsonb := to_jsonb(new); o jsonb; v uuid[];
begin
  if coalesce(current_setting('quality.object_bind', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    if (n ->> 'projectId', n ->> 'project_canonical_key', n ->> 'project_display_name', n ->> 'core_company_id')
       is not distinct from (o ->> 'projectId', o ->> 'project_canonical_key', o ->> 'project_display_name', o ->> 'core_company_id') then
      new.core_object_id := old.core_object_id;
      return new;
    end if;
  end if;
  v := quality.object_candidates(new.core_company_id, n ->> 'projectId', n ->> 'project_canonical_key', n ->> 'project_display_name');
  if cardinality(v) > 1 and auth.uid() is not null and not planfact.is_platform_admin()
     and not exists (select 1 from core.role_assignments a
                      where a.company_id = new.core_company_id and a.user_id = auth.uid() and a.project_id is null
                        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))
     and exists (select 1 from unnest(v) c where c is null or not exists (
                   select 1 from core.role_assignments a
                    where a.company_id = new.core_company_id and a.user_id = auth.uid() and a.project_id = c
                      and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))) then
    raise exception 'Объект записи указывает на объект, который за вами не закреплён' using errcode = '42501';
  end if;
  new.core_object_id := case when cardinality(v) = 1 then v[1] end;
  return new;
end $function$;
-- Назначение: «объекты Качества» больше не выбираются — область задаёт участие (объект / место / «без объектов»).
create or replace function public.pf_set_participation(p_users uuid[], p_role uuid, p_project uuid DEFAULT NULL::uuid, p_locations uuid[] DEFAULT NULL::uuid[], p_fact_owner boolean DEFAULT false, p_valid_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_objects text[] DEFAULT NULL::text[], p_counterparty uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_company uuid; v_users uuid[]; v_locs uuid[]; v_objs text[]; v_owner boolean := coalesce(p_fact_owner, false);
        v_q boolean; v_pf boolean; u uuid; t uuid; a core.role_assignments; v_id uuid; v_add int := 0; v_chg int := 0; v_rev int := 0;
        v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  select company_id into v_company from core.company_roles where id = p_role;
  if v_company is null or not planfact.has_company_permission(v_company, 'security.roles.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_users := array(select distinct x from unnest(coalesce(p_users, '{}')) x where x is not null);
  if cardinality(v_users) = 0 then raise exception 'Выберите сотрудников' using errcode = '22023'; end if;
  if cardinality(v_users) > 200 then raise exception 'Не больше 200 сотрудников за раз' using errcode = '22023'; end if;
  if p_project is not null and not exists (select 1 from core.projects where id = p_project and company_id = v_company) then
    raise exception 'Проект не принадлежит этой компании' using errcode = '42501';
  end if;
  v_locs := array(select distinct x from unnest(coalesce(p_locations, '{}')) x where x is not null);
  if cardinality(v_locs) = 0 then v_locs := null; end if;
  if v_locs is not null and p_project is null then raise exception 'Места выбираются внутри проекта' using errcode = '22023'; end if;
  if cardinality(v_locs) > 200 then raise exception 'Не больше 200 мест за раз' using errcode = '22023'; end if;
  if v_locs is not null and exists (select 1 from unnest(v_locs) x where not exists (
       select 1 from core.locations l where l.id = x and l.project_id = p_project and l.deleted_at is null)) then
    raise exception 'Место не найдено в проекте' using errcode = '22023';
  end if;
  if v_owner and p_project is null then
    raise exception '«Ответственный за факт» назначается на проект или его часть' using errcode = '22023';
  end if;
  if p_valid_to is not null and p_valid_to <= now() then raise exception 'Срок окончания уже прошёл' using errcode = '22023'; end if;
  if p_counterparty is not null and not exists (select 1 from core.counterparties where id = p_counterparty and company_id = v_company
       and deleted_at is null and archived_at is null and 'contractor' = any(kinds)) then
    raise exception 'Фирма не найдена среди подрядчиков компании («Контрагенты», вид «подрядчик»)' using errcode = '22023';
  end if;
  -- P2-0071: «объекты Качества» больше не выбираются — область задаёт участие (объект / место / «без объектов»)
  if exists (select 1 from unnest(coalesce(p_objects, '{}')) x where nullif(btrim(coalesce(x, '')), '') is not null) then
    raise exception 'Объекты Качества больше не выбираются: назначьте роль на нужные объекты или «Без объектов»' using errcode = '22023';
  end if;
  v_objs := null;

  foreach u in array v_users loop
    if u = auth.uid() then raise exception 'Нельзя назначить роль самому себе' using errcode = '42501'; end if;
    if not exists (select 1 from core.company_members where company_id = v_company and user_id = u) then
      raise exception 'Сотрудник не состоит в этой компании' using errcode = '42501';
    end if;
    if exists (select 1 from core.company_members where company_id = v_company and user_id = u and disabled_at is not null) then
      raise exception 'Сотрудник отключён — роль не назначается' using errcode = '42501';
    end if;
    foreach t in array coalesce(v_locs, array[null::uuid]) loop
      select * into a from core.role_assignments ra
       where ra.company_id = v_company and ra.user_id = u and ra.role_id = p_role and ra.project_id is not distinct from p_project
         and ra.location_id is not distinct from t and ra.revoked_at is null and (ra.valid_to is null or ra.valid_to > now())
       order by ra.created_at, ra.id limit 1 for update;
      if a.id is null then
        insert into core.role_assignments(company_id, user_id, role_id, project_id, location_id, fact_owner, valid_to, created_by,
                                          counterparty_id, quality_objects)
        values (v_company, u, p_role, p_project, t, v_owner, p_valid_to, auth.uid(), p_counterparty, v_objs)
        returning id into v_id;
        perform planfact.log_admin_change(v_company, p_project, 'role_assignments', v_id, 'ASSIGN', null,
                  jsonb_build_object('user_id', u, 'role_id', p_role, 'role_name', (select name from core.company_roles where id = p_role),
                                     'project_id', p_project, 'location_id', t, 'fact_owner', v_owner, 'valid_to', p_valid_to,
                                     'counterparty_id', p_counterparty, 'quality_objects', v_objs));
        v_add := v_add + 1;
      elsif (a.fact_owner, a.valid_to, a.quality_objects, a.counterparty_id) is distinct from (v_owner, p_valid_to, v_objs, p_counterparty) then
        update core.role_assignments set fact_owner = v_owner, valid_to = p_valid_to, quality_objects = v_objs, counterparty_id = p_counterparty
         where id = a.id;
        perform planfact.log_admin_change(v_company, p_project, 'role_assignments', a.id, 'CHANGE',
                  jsonb_build_object('fact_owner', a.fact_owner, 'valid_to', a.valid_to, 'quality_objects', a.quality_objects,
                                     'counterparty_id', a.counterparty_id),
                  jsonb_build_object('fact_owner', v_owner, 'valid_to', p_valid_to, 'quality_objects', v_objs, 'counterparty_id', p_counterparty));
        v_chg := v_chg + 1;
      end if;
      a := null;
    end loop;
    for a in select * from core.role_assignments ra
              where ra.company_id = v_company and ra.user_id = u and ra.role_id = p_role and ra.project_id is not distinct from p_project
                and ra.revoked_at is null and (ra.valid_to is null or ra.valid_to > now())
                and not coalesce(ra.location_id, v_zero) = any (array(select coalesce(x, v_zero) from unnest(coalesce(v_locs, array[null::uuid])) x))
              order by ra.id for update loop
      update core.role_assignments set revoked_at = now(), revoked_by = auth.uid() where id = a.id;
      perform planfact.log_admin_change(v_company, a.project_id, 'role_assignments', a.id, 'REVOKE',
                jsonb_build_object('user_id', a.user_id, 'role_id', a.role_id, 'role_name', (select name from core.company_roles where id = a.role_id),
                                   'project_id', a.project_id, 'location_id', a.location_id, 'valid_to', a.valid_to), null);
      v_rev := v_rev + 1;
    end loop;
  end loop;
  perform planfact.assert_company_has_admin(v_company);
  return jsonb_build_object('added', v_add, 'changed', v_chg, 'revoked', v_rev);
end $function$;
create or replace function public.pf_assign_role(p_user uuid, p_role uuid, p_project uuid DEFAULT NULL::uuid, p_valid_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_counterparty uuid DEFAULT NULL::uuid, p_objects text[] DEFAULT NULL::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
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
  -- P2-0071: «объекты Качества» больше не выбираются — область задаёт участие (объект / «без объектов»)
  if exists (select 1 from unnest(coalesce(p_objects, '{}')) x where nullif(btrim(coalesce(x, '')), '') is not null) then
    raise exception 'Объекты Качества больше не выбираются: назначьте роль на нужные объекты или «Без объектов»' using errcode = '22023';
  end if;
  v_objects := null;
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
end $function$;

-- 6. Перенос назначений (решения владельца 30.10.2026). Журнал — для отката.
create table p2_backup.m053_assignments (
  old_id uuid not null, new_id uuid, kind text not null, created_at timestamptz not null default now());
comment on table p2_backup.m053_assignments is 'P2-0071 (053): перенос назначений с «объектов Качества» на участие; откат — 053_down';
revoke all on p2_backup.m053_assignments from public, anon, authenticated;

do $$
declare a record; o uuid; v_new uuid; v_cont uuid; v_n int;
begin
  -- 6.1 на компанию с выбранными объектами (кроме ролей «вся компания») → участие на эти объекты, для всех модулей роли
  for a in select ra.* from core.role_assignments ra
            where ra.project_id is null and ra.location_id is null and cardinality(ra.quality_objects) > 0
              and ra.revoked_at is null and (ra.valid_to is null or ra.valid_to > now())
              and exists (select 1 from core.company_role_permissions rp where rp.role_id = ra.role_id and rp.company_id = ra.company_id
                            and rp.action like 'quality.%')
              and not exists (select 1 from core.company_role_permissions rp where rp.role_id = ra.role_id and rp.company_id = ra.company_id
                                and rp.action = 'quality.scope.company')
            order by ra.id loop
    v_n := 0;
    for o in select distinct po.core_object_id from quality.project_objects po
              join core.projects p on p.id = po.core_object_id and p.company_id = a.company_id and not p.quality_container
             where po.core_company_id = a.company_id and po.id = any (a.quality_objects) and quality.object_alive(po)
               and po.core_object_id is not null order by 1 loop
      select ra.id into v_new from core.role_assignments ra
       where ra.company_id = a.company_id and ra.user_id = a.user_id and ra.role_id = a.role_id and ra.project_id = o
         and ra.location_id is null and ra.revoked_at is null and (ra.valid_to is null or ra.valid_to > now()) limit 1;
      if v_new is null then
        insert into core.role_assignments(company_id, user_id, role_id, project_id, valid_from, valid_to, created_by, counterparty_id)
        values (a.company_id, a.user_id, a.role_id, o, a.valid_from, a.valid_to, a.created_by, a.counterparty_id)
        returning id into v_new;
        insert into p2_backup.m053_assignments(old_id, new_id, kind) values (a.id, v_new, 'object');
      else
        insert into p2_backup.m053_assignments(old_id, new_id, kind) values (a.id, null, 'object_existing');
      end if;
      v_new := null; v_n := v_n + 1;
    end loop;
    if v_n = 0 then
      -- ни одного объекта не нашлось — «без объектов»
      select p.id into v_cont from core.projects p where p.company_id = a.company_id and p.quality_container and p.archived_at is null
       order by p.created_at, p.id limit 1;
      if v_cont is null then
        insert into p2_backup.m053_assignments(old_id, new_id, kind) values (a.id, null, 'no_container');
        continue;
      end if;
      insert into core.role_assignments(company_id, user_id, role_id, project_id, valid_from, valid_to, created_by, counterparty_id)
      values (a.company_id, a.user_id, a.role_id, v_cont, a.valid_from, a.valid_to, a.created_by, a.counterparty_id)
      returning id into v_new;
      insert into p2_backup.m053_assignments(old_id, new_id, kind) values (a.id, v_new, 'no_objects');
    end if;
    update core.role_assignments set revoked_at = now() where id = a.id;
  end loop;

  -- 6.2 роль «только свои» (edit без manage / scope.*) на компанию без объектов → «без объектов»
  for a in select ra.* from core.role_assignments ra
            where ra.project_id is null and ra.location_id is null and ra.quality_objects is null
              and ra.revoked_at is null and (ra.valid_to is null or ra.valid_to > now())
              and exists (select 1 from core.company_role_permissions rp where rp.role_id = ra.role_id and rp.company_id = ra.company_id
                            and rp.action = 'quality.edit')
              and not exists (select 1 from core.company_role_permissions rp where rp.role_id = ra.role_id and rp.company_id = ra.company_id
                                and rp.action in ('quality.manage', 'quality.scope.company', 'quality.scope.contractor'))
            order by ra.id loop
    select p.id into v_cont from core.projects p where p.company_id = a.company_id and p.quality_container and p.archived_at is null
     order by p.created_at, p.id limit 1;
    if v_cont is null then
      insert into p2_backup.m053_assignments(old_id, new_id, kind) values (a.id, null, 'no_container');
      continue;
    end if;
    insert into core.role_assignments(company_id, user_id, role_id, project_id, valid_from, valid_to, created_by, counterparty_id)
    values (a.company_id, a.user_id, a.role_id, v_cont, a.valid_from, a.valid_to, a.created_by, a.counterparty_id)
    returning id into v_new;
    insert into p2_backup.m053_assignments(old_id, new_id, kind) values (a.id, v_new, 'own_only');
    update core.role_assignments set revoked_at = now() where id = a.id;
  end loop;
end $$;

-- 7. Остальные записи Качества на объекте — по действиям своей группы: видеть — «Видеть …» или своя запись; править — «Вести …»
-- (участник части объекта — только своя, признак unplaced). Совещания и мероприятия, FMEA и этапы графика, отчёты, внешний СК.
do $$
declare r record; v_view text; v_edit text; v_rule text;
begin
  for r in select * from (values
      ('project_meetings', 'quality.meetings.view', 'quality.meetings.edit'),
      ('project_interventions', 'quality.meetings.view', 'quality.meetings.edit'),
      ('project_fmea', 'quality.method.view', 'quality.method.edit'),
      ('project_schedule_stages', 'quality.method.view', 'quality.method.edit'),
      ('shared_reports', 'quality.reports.view', 'quality.reports.edit'),
      ('shared_report_snapshots', 'quality.reports.view', 'quality.reports.edit'),
      ('sk_records', 'quality.sk.view', 'quality.sk.import')) v(t, a_view, a_edit) loop
    v_view := format('quality.rec_ok(core_company_id, core_project_id, core_object_id, %L, %L, core_created_by, null, core_counterparty_id)',
                     array[r.a_view], array[r.a_view, r.a_edit]);
    v_edit := format('quality.rec_ok(core_company_id, core_project_id, core_object_id, %L, %L, core_created_by, null, core_counterparty_id)',
                     array[r.a_edit], array[r.a_edit]);
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (%s)', r.t || '_select', r.t, v_view);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
  -- общие таблицы внешнего СК и шаблоны отчётов — по действиям группы (без области, как прежде)
  for r in select * from (values
      ('sk_volumes', 'quality.sk.view', 'quality.sk.import'), ('sk_data_bundles', 'quality.sk.view', 'quality.sk.import'),
      ('sk_import_batches', 'quality.sk.view', 'quality.sk.import'), ('sk_mapping', 'quality.sk.view', 'quality.sk.import'),
      ('sk_category_map', 'quality.sk.view', 'quality.sk.import'), ('sk_contractor_map', 'quality.sk.view', 'quality.sk.import'),
      ('shared_report_templates', 'quality.reports.view', 'quality.reports.edit')) v(t, a_view, a_edit) loop
    v_view := format('quality.can(core_company_id, core_project_id, %L)', array[r.a_view]);
    v_edit := format('quality.can(core_company_id, core_project_id, %L)', array[r.a_edit]);
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (%s)', r.t || '_select', r.t, v_view);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
end $$;

-- сторож — с правами вызывающего: отказ и проверки, которые он зовёт, — клиенту (только чтение / отказ)
revoke all on function quality.deny(uuid, text), quality.row_exists(text, text, uuid), quality.is_platform_admin() from public, anon;
grant execute on function quality.deny(uuid, text), quality.row_exists(text, text, uuid), quality.is_platform_admin() to authenticated;
revoke all on function quality.quality_rights_guard() from public, anon, authenticated;
revoke all on function quality.is_container(uuid), quality.no_object(), quality.record_object(uuid, uuid),
  quality.has_anywhere(uuid, text[], uuid), quality.rec_ok(uuid, uuid, uuid, text[], text[], uuid, uuid, uuid),
  quality.inspection_child_ok(uuid, uuid, text, uuid, boolean) from public, anon;
grant execute on function quality.is_container(uuid), quality.no_object(), quality.record_object(uuid, uuid),
  quality.has_anywhere(uuid, text[], uuid), quality.rec_ok(uuid, uuid, uuid, text[], text[], uuid, uuid, uuid),
  quality.inspection_child_ok(uuid, uuid, text, uuid, boolean) to authenticated;

commit;
