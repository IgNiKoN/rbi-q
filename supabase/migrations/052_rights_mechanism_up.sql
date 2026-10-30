-- P2-0070 (CRITICAL — права / RLS): единый механизм прав платформы — матрица «роль × действие» и участие в проекте.
--  1) каталог действий — данные для экрана: у core.permission_catalog модуль, группа, порядок, подпись (экран «Роли и права»
--     строит группы из каталога, новое действие любого модуля появляется без правки кода); pf_permission_catalog отдаёт их;
--  2) ядро — одна проверка (поднята из planfact.my_area / in_area, P2-0048): core.my_area / my_area_nodes / in_area — область
--     человека в проекте; core.has_grant — дают ли назначения действие на месте; core.can_at(компания, проект, место,
--     действие) — то же с включённым модулем: «может ли человек действие на этом месте»;
--     core.row_allowed(…) — то же для правил строк (автор, своя фирма подрядчика, запись без места); core.require_action —
--     понятный отказ 42501 «Нет права «…» на объекте «…»» для сторожей модулей;
--  3) Стройконтроль 2.0 подключён: тонкие действия в каталоге (замечания, приёмка, передача), роли получают их по прежним
--     (view → видеть; edit → все; edit + quality.scope.contractor → видеть, «в работу», «устранено», записаться на приёмку),
--     прежние ключи остаются (их читают Стройконтроль 1 и Качество); место записи по id ядра (core_location_id, поле рядом,
--     шаг С1 P2-0069); правила строк — core.row_allowed; сторож действий — core.require_action; «кто я» для телефона;
--  4) План/Факт — на проверку ядра без смены поведения: planfact.my_area / my_area_nodes / in_area / has_permission /
--     has_company_permission — обёртки над core.* (прежние вызовы в функциях и правилах 047–051 не меняются);
--  5) телефон: core.my_grants — участие × действия модуля для правила устройства (quality.my_access → construction.grants,
--     pf_my_area → grants);
--  6) экран «Кто что может на объекте» — pf_who_can (только чтение, администратор ролей компании).
-- Стройконтроль 1 (construction_* без _v2), Качество и помещения (construction_units_v2) не меняются.
-- Применять после 051, одним запросом, ДО выкладки приложения. Откат — 052_rights_mechanism_down.sql.
begin;

do $$
begin
  if to_regprocedure('public.pf_fact_submit(uuid, jsonb)') is null then
    raise exception '052: сначала 051_fact_client_id_up.sql' using errcode = 'P0001';
  end if;
  if to_regprocedure('core.can_at(uuid, uuid, uuid, text)') is not null then
    raise exception '052 уже применена (повтор — только после 052_rights_mechanism_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Каталог действий — данные для экрана.
alter table core.permission_catalog
  add column module text references core.module_catalog(code),
  add column group_name text not null default 'Прочее',
  add column sort int not null default 10000,
  add column label text;
comment on column core.permission_catalog.module is 'P2-0070: модуль действия (включён у компании — действие работает); null — ядро «Компания»';
comment on column core.permission_catalog.group_name is 'P2-0070: группа на экране «Роли и права» (внутри модуля)';
comment on column core.permission_catalog.sort is 'P2-0070: порядок на экране; группы модуля — по наименьшему порядку своих действий';
comment on column core.permission_catalog.label is 'P2-0070: короткая подпись внутри группы и в тексте отказа сервера; null — description';

insert into core.permission_catalog(action, description, area_scoped) values
  ('construction.defects.view', 'Стройконтроль: видеть замечания', true),
  ('construction.defects.create', 'Стройконтроль: выдать замечание', true),
  ('construction.defects.assign', 'Стройконтроль: назначить подрядчика и срок', true),
  ('construction.defects.start', 'Стройконтроль: взять замечание в работу', true),
  ('construction.defects.fix', 'Стройконтроль: отметить «Устранено»', true),
  ('construction.defects.close', 'Стройконтроль: закрыть замечание', true),
  ('construction.defects.reject', 'Стройконтроль: вернуть замечание на доработку', true),
  ('construction.defects.delete', 'Стройконтроль: удалить замечание', true),
  ('construction.acceptance.view', 'Стройконтроль: видеть приёмки', true),
  ('construction.acceptance.book', 'Стройконтроль: записаться на приёмку', true),
  ('construction.acceptance.schedule', 'Стройконтроль: подтвердить или перенести время приёмки', true),
  ('construction.acceptance.conduct', 'Стройконтроль: провести приёмку', true),
  ('construction.transfer.edit', 'Стройконтроль: вести передачу квартир', true);

update core.permission_catalog c set module = v.module, group_name = v.grp, sort = v.sort, label = v.label
  from (values
    ('planfact.works.view', 'planfact', 'Работы и план', 1010, null),
    ('planfact.works.edit', 'planfact', 'Работы и план', 1020, null),
    ('planfact.wor.import', 'planfact', 'Работы и план', 1030, null),
    ('planfact.vor.manage', 'planfact', 'Работы и план', 1040, null),
    ('planfact.plan.change_request', 'planfact', 'Работы и план', 1050, null),
    ('planfact.plan.approve', 'planfact', 'Работы и план', 1060, null),
    ('planfact.fact.view', 'planfact', 'Факт', 1110, null),
    ('planfact.fact.create', 'planfact', 'Факт', 1120, null),
    ('planfact.fact.approve', 'planfact', 'Факт', 1130, null),
    ('planfact.checklist.view', 'planfact', 'Чек-листы', 1210, null),
    ('planfact.checklist.create', 'planfact', 'Чек-листы', 1220, null),
    ('planfact.money.view', 'planfact', 'Деньги и выплаты', 1310, null),
    ('planfact.estimate.manage', 'planfact', 'Деньги и выплаты', 1320, null),
    ('planfact.rates.plan.edit', 'planfact', 'Деньги и выплаты', 1330, null),
    ('planfact.rates.fact.edit', 'planfact', 'Деньги и выплаты', 1340, null),
    ('planfact.payments.prepare', 'planfact', 'Деньги и выплаты', 1350, null),
    ('planfact.payments.review', 'planfact', 'Деньги и выплаты', 1360, null),
    ('planfact.payments.sign', 'planfact', 'Деньги и выплаты', 1370, null),
    ('planfact.ks2.view', 'planfact', 'КС-2', 1410, null),
    ('planfact.ks2.edit', 'planfact', 'КС-2', 1420, null),
    ('planfact.projects.manage', 'planfact', 'Настройки и журнал', 1510, null),
    ('planfact.units.manage', 'planfact', 'Настройки и журнал', 1520, null),
    ('planfact.brigades.manage', 'planfact', 'Настройки и журнал', 1530, null),
    ('planfact.thresholds.edit', 'planfact', 'Настройки и журнал', 1540, null),
    ('planfact.audit.view', 'planfact', 'Настройки и журнал', 1550, null),
    ('quality.view', 'quality', 'Доступ', 2010, 'Просмотр'),
    ('quality.edit', 'quality', 'Доступ', 2020, 'Проверки, задачи, отчёты'),
    ('quality.manage', 'quality', 'Доступ', 2030, 'Настройки, справочники, роли'),
    ('quality.objects.manage', 'quality', 'Доступ', 2040, 'Справочник объектов и дерево локаций (только администратор)'),
    ('quality.ai', 'quality', 'Доступ', 2050, 'ИИ-помощник'),
    ('construction.defects.view', 'construction', 'Замечания', 3010, 'Видеть замечания'),
    ('construction.defects.create', 'construction', 'Замечания', 3020, 'Выдать замечание'),
    ('construction.defects.assign', 'construction', 'Замечания', 3030, 'Назначить подрядчика и срок'),
    ('construction.defects.start', 'construction', 'Замечания', 3040, 'Взять замечание в работу'),
    ('construction.defects.fix', 'construction', 'Замечания', 3050, 'Отметить «Устранено»'),
    ('construction.defects.close', 'construction', 'Замечания', 3060, 'Закрыть замечание'),
    ('construction.defects.reject', 'construction', 'Замечания', 3070, 'Вернуть замечание на доработку'),
    ('construction.defects.delete', 'construction', 'Замечания', 3080, 'Удалить замечание'),
    ('construction.acceptance.view', 'construction', 'Приёмка', 3110, 'Видеть приёмки'),
    ('construction.acceptance.book', 'construction', 'Приёмка', 3120, 'Записаться на приёмку'),
    ('construction.acceptance.schedule', 'construction', 'Приёмка', 3130, 'Подтвердить или перенести время приёмки'),
    ('construction.acceptance.conduct', 'construction', 'Приёмка', 3140, 'Провести приёмку'),
    ('construction.transfer.edit', 'construction', 'Передача', 3210, 'Вести передачу квартир'),
    ('construction.manage', 'construction', 'Настройки', 3310, 'Настройки, справочники'),
    ('construction.objects.manage', 'construction', 'Настройки', 3320, 'Справочник объектов и дерево локаций (только администратор)'),
    ('construction.view', 'construction', 'Прежний доступ', 3410, 'Просмотр (Стройконтроль 1 и Качество)'),
    ('construction.edit', 'construction', 'Прежний доступ', 3420, 'Замечания и приёмка (Стройконтроль 1 и Качество)'),
    ('security.roles.assign', null, 'Сотрудники и справочники', 9010, null),
    ('core.counterparties.manage', null, 'Сотрудники и справочники', 9020, null),
    ('quality.scope.company', null, 'Видимость записей', 9110, 'Видеть записи всей компании (Качество и Стройконтроль)'),
    ('quality.scope.contractor', null, 'Видимость записей', 9120, 'Только записи своей фирмы-подрядчика (Качество и Стройконтроль)')
  ) v(action, module, grp, sort, label)
 where c.action = v.action;

-- Каталог для галочек экрана «Роли и права» (и текст отказа сервера) — с модулем, группой и порядком.
drop function public.pf_permission_catalog();
create function public.pf_permission_catalog()
returns table(action text, description text, module text, module_name text, group_name text, sort int, label text, area_scoped boolean)
language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  select c.action, c.description, c.module, coalesce(m.name, 'Компания'), c.group_name, c.sort, coalesce(c.label, c.description),
         c.area_scoped
    from core.permission_catalog c left join core.module_catalog m on m.code = c.module
   where auth.uid() is not null order by c.sort, c.action;
$$;
revoke all on function public.pf_permission_catalog() from public, anon;
grant execute on function public.pf_permission_catalog() to authenticated;

-- Новые действия Стройконтроля по прежним (одно правило — для шаблонов и ролей компаний; только на время миграции).
create function pg_temp.construction_fine_actions(p_actions text[])
returns text[] language sql immutable as $$
  select case
    when not ('construction.view' = any(p_actions) or 'construction.edit' = any(p_actions)) then '{}'::text[]
    when not 'construction.edit' = any(p_actions) then array['construction.defects.view', 'construction.acceptance.view']
    when 'quality.scope.contractor' = any(p_actions) then
      array['construction.defects.view', 'construction.defects.start', 'construction.defects.fix',
            'construction.acceptance.view', 'construction.acceptance.book']
    else array['construction.defects.view', 'construction.defects.create', 'construction.defects.assign', 'construction.defects.start',
               'construction.defects.fix', 'construction.defects.close', 'construction.defects.reject', 'construction.defects.delete',
               'construction.acceptance.view', 'construction.acceptance.book', 'construction.acceptance.schedule',
               'construction.acceptance.conduct', 'construction.transfer.edit'] end
$$;
insert into core.role_template_permissions(template_code, action)
select t.template_code, x
  from (select template_code, array_agg(action) acts from core.role_template_permissions group by template_code) t
  cross join lateral unnest(pg_temp.construction_fine_actions(t.acts)) x
on conflict do nothing;
insert into core.company_role_permissions(role_id, company_id, action)
select r.role_id, r.company_id, x
  from (select role_id, company_id, array_agg(action) acts from core.company_role_permissions group by role_id, company_id) r
  cross join lateral unnest(pg_temp.construction_fine_actions(r.acts)) x
on conflict do nothing;
drop function pg_temp.construction_fine_actions(text[]);

-- 2. Ядро: одна проверка прав.
-- Место и всё над ним.
create function core.place_up(p_location uuid)
returns uuid[] language sql stable security definer set search_path = pg_catalog as $$
  select case when p_location is null then '{}'::uuid[] else array(
    with recursive up(id, parent_id) as (
      select l.id, l.parent_id from core.locations l where l.id = p_location
      union
      select p.id, p.parent_id from core.locations p join up on p.id = up.parent_id)
    select up.id from up) end
$$;

-- Место и всё под ним (без удалённых).
create function core.place_subtree(p_root uuid)
returns uuid[] language sql stable security definer set search_path = pg_catalog as $$
  select array(
    with recursive sub(id) as (
      select l.id from core.locations l where l.id = p_root and l.deleted_at is null
      union
      select c.id from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
    select sub.id from sub)
$$;

-- Область человека в проекте: null — весь проект; иначе id мест (узлы назначений и всё под ними). Без пользователя или без
-- назначений в компании проекта — null: ограничивать нечего (доступ закрывают проверки прав). Перенесено из planfact.my_area (047).
create function core.my_area(p_project uuid)
returns uuid[] language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_uid uuid := auth.uid(); v_company uuid; v_roots uuid[];
begin
  if v_uid is null or p_project is null then return null; end if;
  select company_id into v_company from core.projects where id = p_project;
  if v_company is null or planfact.is_platform_admin() then return null; end if;
  if exists (select 1 from core.role_assignments a
              where a.company_id = v_company and a.user_id = v_uid
                and (a.project_id is null or (a.project_id = p_project and a.location_id is null))
                and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())) then
    return null;
  end if;
  select array_agg(distinct a.location_id) into v_roots from core.role_assignments a
   where a.company_id = v_company and a.user_id = v_uid and a.project_id = p_project and a.location_id is not null
     and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now());
  if v_roots is null then return null; end if;
  return array(
    with recursive sub(id) as (
      select l.id from core.locations l where l.id = any (v_roots) and l.project_id = p_project and l.deleted_at is null
      union
      select c.id from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null)
    select sub.id from sub);
end $$;

-- Узлы, которые видны в дереве: область и родители её узлов. null — всё дерево. Перенесено из planfact.my_area_nodes (047).
create function core.my_area_nodes(p_project uuid)
returns uuid[] language sql stable security definer set search_path = pg_catalog as $$
  with a as (select core.my_area(p_project) ids)
  select case when a.ids is null then null else array(
    with recursive up(id, parent_id) as (
      select l.id, l.parent_id from core.locations l where l.id = any (a.ids)
      union
      select p.id, p.parent_id from core.locations p join up on p.id = up.parent_id)
    select up.id from up) end
  from a
$$;

-- Место в области: область null — да. Перенесено из planfact.in_area (047).
create function core.in_area(p_location uuid, p_area uuid[])
returns boolean language sql immutable set search_path = pg_catalog as $$
  select p_area is null or p_location = any (p_area)
$$;

-- Дают ли назначения человека действие на месте (без проверки модуля). Проект null — только назначения на всю компанию;
-- место null — где-то в проекте (назначение на часть проекта считается, если действие area_scoped); место задано — назначение
-- на него или выше. Администратор платформы — всё из каталога.
create function core.has_grant(p_company uuid, p_project uuid, p_location uuid, p_action text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select p_company is not null and exists (
    select 1 from core.permission_catalog c
    where c.action = p_action
      and (planfact.is_platform_admin() or exists (
        select 1 from core.role_assignments a
        join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = p_action
        where a.company_id = p_company and a.user_id = auth.uid()
          and (a.project_id is null or a.project_id = p_project)
          and (a.location_id is null or (c.area_scoped and (p_location is null or a.location_id = any (core.place_up(p_location)))))
          and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))))
$$;

-- Может ли человек действие на месте: модуль действия (каталог) включён у компании и назначения его дают.
create function core.can_at(p_company uuid, p_project uuid, p_location uuid, p_action text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from core.permission_catalog c
    where c.action = p_action
      and (c.module is null or exists (select 1 from core.company_modules cm
                                        where cm.company_id = p_company and cm.module = c.module and cm.enabled)))
     and core.has_grant(p_company, p_project, p_location, p_action)
$$;

-- Одно назначение и одно действие над записью: как quality.assignment_sees_id (039a) + область по месту участия.
-- p_up — место записи и всё над ним ({} — запись без места).
create function core.assignment_allows(a core.role_assignments, p_action text, p_project uuid, p_up uuid[], p_author uuid,
  p_counterparty uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_acts text[] := array(select rp.action from core.company_role_permissions rp where rp.role_id = a.role_id and rp.company_id = a.company_id);
  m constant text := split_part(p_action, '.', 1);
begin
  if 'quality.scope.company' = any(v_acts) then return true; end if;
  if not (p_project is null or a.project_id is null or a.project_id = p_project) then return false; end if;
  if a.location_id is not null then
    -- запись без места участник части проекта только видит, и только свою; с местом — место участия или выше него
    if cardinality(p_up) = 0 then return p_action like '%.view' and auth.uid() is not null and p_author = auth.uid(); end if;
    if not a.location_id = any(p_up) then return false; end if;
  end if;
  if (m || '.manage') = any(v_acts) then return true; end if;
  if 'quality.scope.contractor' = any(v_acts) then
    return a.counterparty_id is not null and p_counterparty is not null and a.counterparty_id = p_counterparty;
  end if;
  return true;
end $$;

-- Правило строк модуля: можно ли одно из действий над записью (компания, проект, место, автор, фирма записи).
create function core.row_allowed(p_company uuid, p_project uuid, p_location uuid, p_actions text[], p_author uuid,
  p_counterparty uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_up uuid[];
begin
  if p_company is null then return false; end if;
  v_up := core.place_up(p_location);
  return exists (
    select 1 from unnest(p_actions) act
    join core.permission_catalog pc on pc.action = act
    where (pc.module is null or exists (select 1 from core.company_modules cm
                                         where cm.company_id = p_company and cm.module = pc.module and cm.enabled))
      and (planfact.is_platform_admin() or exists (
        select 1 from core.role_assignments a
        join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = act
        where a.company_id = p_company and a.user_id = auth.uid()
          and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
          and (a.location_id is null or pc.area_scoped)
          and core.assignment_allows(a, act, p_project, v_up, p_author, p_counterparty))));
end $$;

-- Сторожа модулей: нет права — отказ 42501 с понятным текстом («Нет права «Закрыть замечание» на объекте «ЖК-1»»).
create function core.require_action(p_company uuid, p_project uuid, p_location uuid, p_action text, p_author uuid,
  p_counterparty uuid)
returns void language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_label text; v_obj text;
begin
  if core.row_allowed(p_company, p_project, p_location, array[p_action], p_author, p_counterparty) then return; end if;
  select coalesce(pc.label, pc.description) into v_label from core.permission_catalog pc where pc.action = p_action;
  v_label := coalesce(v_label, p_action);
  select p.name into v_obj from core.projects p where p.id = p_project;
  raise exception 'Нет права «%» %', v_label, coalesce('на объекте «' || v_obj || '»', 'для записи без объекта')
    using errcode = '42501';
end $$;

-- Участие × действия модуля для правила устройства (то же, что core.row_allowed / can_at): по назначению — проект, место
-- участия, место и всё под ним, действия роли модуля (на часть проекта — только area_scoped) и признаки видимости, фирма.
-- Проект задан — назначения на него и на всю компанию.
create function core.my_grants(p_company uuid, p_project uuid, p_module text)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'project', g.project_id, 'place', g.location_id,
           'places', case when g.location_id is not null then to_jsonb(core.place_subtree(g.location_id)) end,
           'actions', g.acts, 'counterparty', g.counterparty_id) order by g.project_id nulls first, g.location_id nulls first), '[]'::jsonb)
    from (select a.project_id, a.location_id, a.counterparty_id,
                 array(select rp.action from core.company_role_permissions rp
                        join core.permission_catalog pc on pc.action = rp.action
                       where rp.role_id = a.role_id and rp.company_id = a.company_id
                         and (rp.action like p_module || '.%' or rp.action like 'quality.scope.%')
                         and (a.location_id is null or pc.area_scoped or rp.action like 'quality.scope.%')
                       order by rp.action) acts
            from core.role_assignments a
           where a.company_id = p_company and a.user_id = auth.uid()
             and (p_project is null or a.project_id is null or a.project_id = p_project)
             and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())) g
   where exists (select 1 from unnest(g.acts) x where x like p_module || '.%')
$$;

-- Функции ядра клиент не вызывает (ТД №104, 017a), кроме проверки для правил строк модулей: правило RLS выполняется от имени
-- клиента. row_allowed отвечает только о правах самого вошедшего.
revoke all on function core.place_up(uuid), core.place_subtree(uuid), core.my_area(uuid), core.my_area_nodes(uuid),
  core.in_area(uuid, uuid[]), core.has_grant(uuid, uuid, uuid, text), core.can_at(uuid, uuid, uuid, text),
  core.assignment_allows(core.role_assignments, text, uuid, uuid[], uuid, uuid), core.row_allowed(uuid, uuid, uuid, text[], uuid, uuid),
  core.require_action(uuid, uuid, uuid, text, uuid, uuid), core.my_grants(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function core.row_allowed(uuid, uuid, uuid, text[], uuid, uuid) to authenticated;

-- 3. Стройконтроль 2.0: место записи по id ядра.
create function quality.node_core_place(p_company uuid, p_node text, p_project uuid)
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select l.id from quality.location_nodes n join core.locations l on l.id = n.core_location_id
   where n.core_company_id = p_company and n.id = p_node and p_project is not null
     and l.project_id = p_project and l.deleted_at is null
$$;
revoke all on function quality.node_core_place(uuid, text, uuid) from public, anon, authenticated;

create function quality.v2_bind_place()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  new.core_location_id := quality.node_core_place(new.core_company_id, new."locationId", new.core_project_id);
  return new;
end $$;
revoke all on function quality.v2_bind_place() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['construction_defects_v2', 'construction_acceptance_v2'] loop
    execute format('alter table quality.%I add column core_location_id uuid references core.locations(id)', t);
    execute format('create index %I on quality.%I (core_location_id) where core_location_id is not null', t || '_core_location_idx', t);
    execute format('comment on column quality.%I.core_location_id is %L', t,
                   'P2-0070: место ядра записи (пишет сервер из "locationId"; пусто — узел-объект, место не найдено или другой объект)');
    execute format('update quality.%I set core_location_id = quality.node_core_place(core_company_id, "locationId", core_project_id) '
                   'where quality.node_core_place(core_company_id, "locationId", core_project_id) is not null', t);
    -- после bind_object (объект записи), до сторожей zz_*
    execute format('create trigger %I before insert or update on quality.%I for each row execute function quality.v2_bind_place()',
                   t || '_bind_place', t);
  end loop;
end $$;

-- Правила строк — core.row_allowed (в выбранной компании запроса, как прежде). Правка и удаление — любое действие записи
-- в области; какое именно нужно — решает сторож (понятный отказ, а не «0 строк»).
do $$
declare
  r record;
  v_args constant text := 'core_company_id = quality.request_company() and core.row_allowed(core_company_id, core_project_id, '
                          'core_location_id, %L, core_created_by, core_counterparty_id)';
begin
  for r in select * from (values
    ('construction_defects_v2', '{construction.defects.view}',
     '{construction.defects.create,construction.defects.assign,construction.defects.start,construction.defects.fix,construction.defects.close,construction.defects.reject,construction.defects.delete}'),
    ('construction_acceptance_v2', '{construction.acceptance.view}',
     '{construction.acceptance.book,construction.acceptance.schedule,construction.acceptance.conduct}')) v(t, vis, wr) loop
    execute format('drop policy %I on quality.%I', r.t || '_select', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for select to authenticated using (%s)', r.t || '_select', r.t, format(v_args, r.vis));
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, format(v_args, r.wr));
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)',
                   r.t || '_update', r.t, format(v_args, r.wr), format(v_args, r.wr));
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, format(v_args, r.wr));
  end loop;
end $$;

-- Сторож действий: какое действие нужно — по разнице полей (приложение присылает строку целиком, upsert); проверка — ядро.
create function quality.defect_status_action(p_status text)
returns text language sql immutable set search_path = pg_catalog as $$
  select case p_status
    when 'in_progress' then 'construction.defects.start' when 'fixed' then 'construction.defects.fix'
    when 'closed' then 'construction.defects.close' when 'rejected' then 'construction.defects.reject'
    when 'issued' then 'construction.defects.create' else 'construction.defects.delete' end
$$;
revoke all on function quality.defect_status_action(text) from public, anon, authenticated;

create function quality.construction_action_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_def constant boolean := tg_table_name = 'construction_defects_v2';
  v_skip constant text[] := array['status', 'history', 'contractorId', 'deadline', 'is_deleted', 'deleted_at', 'updated_at', 'created_at',
                                  'version', 'sync_status', 'created_by', 'companyId', 'core_company_id', 'core_project_id',
                                  'core_location_id', 'core_created_by', 'core_counterparty_id'];
  n jsonb; o jsonb; r jsonb; v_need text[] := '{}'; v_exists boolean; v_old text; v_new text; a text;
begin
  -- сервер (перенос, миграции, служебная роль) и администратор платформы — без сторожа, как и без правил RLS; клиент — роль
  -- запроса authenticated / anon (SET ROLE PostgREST); без входа строку не пропустят правила RLS
  if coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') or auth.uid() is null
     or planfact.is_platform_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    r := to_jsonb(old);
    v_need := array[case when v_def then 'construction.defects.delete' else 'construction.acceptance.book' end];
  elsif tg_op = 'INSERT' then
    -- upsert существующей записи — проверка в BEFORE UPDATE (тот же сторож)
    execute format('select exists (select 1 from %I.%I where id = $1 and core_company_id = $2)', tg_table_schema, tg_table_name)
      into v_exists using new.id, new.core_company_id;
    if v_exists then return new; end if;
    r := to_jsonb(new);
    v_new := nullif(r ->> 'status', '');
    if v_def then
      v_need := array['construction.defects.create'];
      if nullif(btrim(coalesce(r ->> 'contractorId', '')), '') is not null or r ->> 'deadline' is not null then
        v_need := v_need || 'construction.defects.assign'::text;
      end if;
      if coalesce(v_new, 'issued') <> 'issued' then v_need := v_need || quality.defect_status_action(v_new); end if;
    else
      v_need := array['construction.acceptance.book'];
      if v_new in ('accepted', 'rejected') then v_need := v_need || 'construction.acceptance.conduct'::text; end if;
    end if;
  else
    n := to_jsonb(new); o := to_jsonb(old); r := n;
    if v_def then
      v_old := coalesce(nullif(o ->> 'status', ''), 'issued');
      v_new := coalesce(nullif(n ->> 'status', ''), 'issued');
      if v_new is distinct from v_old then v_need := v_need || quality.defect_status_action(v_new); end if;
      if (n -> 'contractorId', n -> 'deadline') is distinct from (o -> 'contractorId', o -> 'deadline') then
        v_need := v_need || 'construction.defects.assign'::text;
      end if;
      if (n -> 'is_deleted', n -> 'deleted_at') is distinct from (o -> 'is_deleted', o -> 'deleted_at') then
        v_need := v_need || 'construction.defects.delete'::text;
      end if;
      if (n - v_skip) is distinct from (o - v_skip) then v_need := v_need || 'construction.defects.create'::text; end if;
    else
      if (n -> 'status', n -> 'checklist_results') is distinct from (o -> 'status', o -> 'checklist_results') then
        v_need := v_need || 'construction.acceptance.conduct'::text;
      end if;
      if (n -> 'requested_date', n -> 'requested_time') is distinct from (o -> 'requested_date', o -> 'requested_time') then
        v_need := v_need || 'construction.acceptance.schedule'::text;
      end if;
      if (n -> 'is_deleted', n -> 'deleted_at', n -> 'locationId', n -> 'zone', n -> 'template_key', n -> 'work_type', n -> 'volume',
          n -> 'contractorId')
         is distinct from (o -> 'is_deleted', o -> 'deleted_at', o -> 'locationId', o -> 'zone', o -> 'template_key', o -> 'work_type',
                           o -> 'volume', o -> 'contractorId') then
        v_need := v_need || 'construction.acceptance.book'::text;
      end if;
    end if;
  end if;
  foreach a in array v_need loop
    perform core.require_action((r ->> 'core_company_id')::uuid, (r ->> 'core_project_id')::uuid, (r ->> 'core_location_id')::uuid,
                                a, (r ->> 'core_created_by')::uuid, (r ->> 'core_counterparty_id')::uuid);
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function quality.construction_action_guard() from public, anon, authenticated;

-- «zzz_» — после всех BEFORE-триггеров, в том числе сторожа подрядчика 043 (он оставляет подрядчику только статус и историю)
create trigger zzz_construction_action_guard before insert or update or delete on quality.construction_defects_v2
  for each row execute function quality.construction_action_guard();
create trigger zzz_construction_action_guard before insert or update or delete on quality.construction_acceptance_v2
  for each row execute function quality.construction_action_guard();

-- «Кто я» для телефона: права Стройконтроля по участию (то же правило, что core.row_allowed) и объекты узлов-объектов.
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
                    where c.deleted_at is null order by c.name limit 1),
    'container', case when exists (select 1 from asg) or planfact.is_platform_admin() then quality.request_container() end,
    -- P2-0070: участие × действия Стройконтроля (place — место участия, places — оно и всё под ним; null — весь проект)
    'construction', jsonb_build_object(
      'admin', planfact.is_platform_admin(),
      'enabled', exists (select 1 from core.company_modules cm where cm.company_id = quality.request_company()
                                                              and cm.module = 'construction' and cm.enabled),
      'grants', core.my_grants(quality.request_company(), null, 'construction'),
      'object_nodes', coalesce((select jsonb_object_agg(n.id, quality.node_root_project(n)) from quality.location_nodes n
                                 where n.core_company_id = quality.request_company() and n."nodeType" = 'object'
                                   and not coalesce(n.is_deleted, false) and coalesce(n."parentId", '') = ''
                                   and quality.node_root_project(n) is not null), '{}'::jsonb)));
$$;

-- 4. План/Факт — на проверку ядра без смены поведения: прежние функции planfact остаются тонкими обёртками на переходный срок
-- (их зовут десятки функций и правил 047–051); новое — сразу core.*.
create or replace function planfact.my_area(p_project uuid)
returns uuid[] language sql stable security definer set search_path = pg_catalog as $$
  select core.my_area(p_project)
$$;

create or replace function planfact.my_area_nodes(p_project uuid)
returns uuid[] language sql stable security definer set search_path = pg_catalog as $$
  select core.my_area_nodes(p_project)
$$;

create or replace function planfact.in_area(p_location uuid, p_area uuid[])
returns boolean language sql immutable set search_path = pg_catalog as $$
  select core.in_area(p_location, p_area)
$$;
-- in_area — без чтения таблиц, зовётся в правилах строк от имени клиента (исключение ТД №104, как row_allowed)
grant execute on function core.in_area(uuid, uuid[]) to authenticated;

-- Права План/Факта: модуль План/Факт включён у компании + назначения ядра (проект; назначение на часть проекта — для area_scoped).
-- Модуль самого действия здесь не проверяется — как прежде (pf_my_permissions отдаёт и чужие ключи каталога).
create or replace function planfact.has_permission(p_project uuid, p_action text)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  select exists (
    select 1 from core.projects pr
    join core.company_modules cm on cm.company_id = pr.company_id and cm.module = 'planfact' and cm.enabled
    where pr.id = p_project and core.has_grant(pr.company_id, pr.id, null, p_action));
$$;

-- Права на уровне компании: только назначения на всю компанию (проект не задан) или администратор платформы.
create or replace function planfact.has_company_permission(p_company uuid, p_action text)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  select exists (
    select 1 from core.company_modules cm
    where cm.company_id = p_company and cm.module = 'planfact' and cm.enabled and core.has_grant(p_company, null, null, p_action));
$$;

-- «Моя область» План/Факта для телефона: + участие × действия План/Факта (core.my_grants — то же, что у Стройконтроля).
create or replace function public.pf_my_area(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
declare v_uid uuid := auth.uid();
begin
  if p_project is null or v_uid is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'full', planfact.my_area(p_project) is null,
    'locations', coalesce((select jsonb_agg(distinct a.location_id) from core.role_assignments a
                            where a.user_id = v_uid and a.project_id = p_project and a.location_id is not null
                              and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())), '[]'::jsonb),
    'fact_owner', coalesce((select jsonb_agg(distinct coalesce(a.location_id::text, 'project')) from core.role_assignments a
                             where a.user_id = v_uid and a.project_id = p_project and a.fact_owner
                               and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())), '[]'::jsonb),
    'can_on_behalf', planfact.has_permission(p_project, 'planfact.fact.approve'),
    'grants', core.my_grants((select company_id from core.projects where id = p_project), p_project, 'planfact'));
end $$;

-- 6. «Кто что может на объекте» (экран «Компания → Сотрудники и доступ»), только чтение, администратор ролей компании.
-- Объект и место (null — весь объект) → люди × действия включённых модулей по тому же правилу, что core.can_at: назначение на
-- всю компанию, объект или место выше выбранного — полностью; участие на часть внутри выбранного места — «только …» (partial);
-- на часть проекта — только действия area_scoped. Признаки видимости (quality.scope.*) и фирма подрядчика — для подписи.
create function public.pf_who_can(p_company uuid, p_project uuid, p_location uuid default null)
returns table(user_id uuid, full_name text, email text, roles text[], places text[], partial boolean, firm text, actions text[])
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
declare v_up uuid[];
begin
  perform planfact.require_roles_admin(p_company);
  if not exists (select 1 from core.projects pr where pr.id = p_project and pr.company_id = p_company) then
    raise exception 'Объект не найден в компании' using errcode = '22023';
  end if;
  if p_location is not null and not exists (select 1 from core.locations l where l.id = p_location and l.project_id = p_project) then
    raise exception 'Место не найдено в объекте' using errcode = '22023';
  end if;
  v_up := core.place_up(p_location);
  return query
  with asg as (
    select a.*, (a.location_id is not null and not a.location_id = any (v_up)) part
      from core.role_assignments a
      join core.company_members m on m.company_id = a.company_id and m.user_id = a.user_id and m.disabled_at is null
     where a.company_id = p_company and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
       and (a.project_id is null or a.project_id = p_project)
       and (a.location_id is null or a.location_id = any (v_up) or p_location is null or p_location = any (core.place_up(a.location_id))))
  select g.user_id, max(up.full_name), max(u.email::text),
         array_agg(distinct r.name order by r.name),
         array_agg(distinct case when g.location_id is not null then planfact.location_path(g.location_id)
                                 when g.project_id is not null then 'весь объект' else 'вся компания' end),
         bool_and(g.part),
         max(c.name) filter (where exists (select 1 from core.company_role_permissions x where x.role_id = g.role_id
                                            and x.company_id = g.company_id and x.action = 'quality.scope.contractor')),
         coalesce((select array_agg(distinct rp.action order by rp.action)
                     from asg g2
                     join core.company_role_permissions rp on rp.role_id = g2.role_id and rp.company_id = g2.company_id
                     join core.permission_catalog pc on pc.action = rp.action
                    where g2.user_id = g.user_id
                      and (pc.module is null or exists (select 1 from core.company_modules cm where cm.company_id = p_company
                                                          and cm.module = pc.module and cm.enabled))
                      and (g2.location_id is null or pc.area_scoped or rp.action like 'quality.scope.%')), '{}')
    from asg g
    join core.company_roles r on r.id = g.role_id
    left join core.user_profiles up on up.user_id = g.user_id
    left join auth.users u on u.id = g.user_id
    left join core.counterparties c on c.id = g.counterparty_id
   group by g.user_id
   order by max(coalesce(up.full_name, u.email::text));
end $$;
revoke all on function public.pf_who_can(uuid, uuid, uuid) from public, anon;
grant execute on function public.pf_who_can(uuid, uuid, uuid) to authenticated;

commit;
