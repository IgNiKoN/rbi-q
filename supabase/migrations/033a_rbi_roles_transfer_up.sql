-- P2-0033 этап 2 (ADR-069 п. 4, ADR-070). Роли «как в РБИ» и закрепления за объектами для сотрудников из переноса.
-- quality.rbi_transfer_roles(компания, p_apply) — только для SQL Editor (роль postgres), клиенту закрыто:
--   p_apply = false — показ «что будет» (ничего не меняет); true — применить. Повтор безопасен (одинаковое назначение не дублируется).
--   1) 4 роли компании (не шаблоны: другим компаниям не добавляются) — права = ROLE_MATRIX (permission.service.js):
--      «Админ» (manager) и «Зам. руководителя» (deputy_manager) — всё в Качестве и Стройконтроле + назначение ролей;
--      «Директор» (director) — всё видит, ничего не меняет; «Инженер СК» (engineer) — создаёт и правит свои, по объектам;
--   2) роль человека — из старого профиля (public.rbi_engineer_profiles.role, только чтение); объекты — settings.assignedProjects,
--      иначе assigned_projects (как permission.service.js getAssignedProjects); UUID — узел-объект дерева локаций, название — объект
--      справочника (как ObjectDirectory.resolveObjectRef) → постоянный id объекта Качества (quality.project_objects.id);
--   3) объект есть в дереве локаций, но нет в справочнике объектов Качества — добавляется в справочник (решение владельца 25.10.2026);
--   4) прежние назначения человека в компании отзываются, кроме «Администратора компании» (решение владельца 25.10.2026);
--      нерасшифрованная роль или объект — человек пропускается (в показе — причина).
-- Применять после 033, одним запросом. Откат — 033a_rbi_roles_transfer_down.sql (назначения и роли остаются; снять — в «Сотрудниках»).
begin;

do $$
begin
  if to_regprocedure('quality.objects_keys(uuid,text[])') is null then
    raise exception '033a: сначала 033_rbi_roles_objects_up.sql' using errcode = 'P0001';
  end if;
  if to_regprocedure('quality.rbi_transfer_roles(uuid,boolean)') is not null then
    raise exception '033a уже применена (повтор — только после 033a_rbi_roles_transfer_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- Роли РБИ и их права (таблица «флаг ROLE_MATRIX → действие платформы» — в отчёте P2-0033).
create function quality.rbi_role_actions(p_role text)
returns text[] language sql immutable set search_path = pg_catalog as $$
  select case p_role
    when 'manager' then array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company',
                              'construction.view', 'construction.edit', 'construction.manage', 'security.roles.assign']
    when 'deputy_manager' then array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company',
                              'construction.view', 'construction.edit', 'construction.manage', 'security.roles.assign']
    when 'director' then array['quality.view', 'quality.scope.company', 'construction.view']
    when 'engineer' then array['quality.view', 'quality.edit', 'construction.view', 'construction.edit']
  end
$$;
create function quality.rbi_role_name(p_role text)
returns text language sql immutable set search_path = pg_catalog as $$
  select case p_role when 'manager' then 'Админ' when 'deputy_manager' then 'Зам. руководителя'
                     when 'director' then 'Директор' when 'engineer' then 'Инженер СК' end
$$;

-- Ссылка старого профиля на объект → id объекта Качества (null — не найден). UUID — узел дерева локаций (как клиент).
create function quality.rbi_object_ref(p_company uuid, p_ref text)
returns text language sql stable set search_path = pg_catalog as $$
  with r as (select btrim(coalesce(p_ref, '')) raw),
  n as (select coalesce(nullif(n.canonical_key, ''), n."displayName") nm from quality.location_nodes n, r
         where n.core_company_id = p_company and n.id = r.raw and n."nodeType" = 'object' order by n.is_deleted limit 1),
  k as (select quality.object_clean(coalesce((select nm from n), (select raw from r))) c)
  select o.id from quality.project_objects o, k
   where o.core_company_id = p_company and not coalesce(o.is_deleted, false) and not coalesce(o._deleted, false) and o.deleted_at is null
     and k.c <> '' and (o.id = (select raw from r) or quality.object_clean(o.canonical_key) = k.c or quality.object_clean(o.display_name) = k.c
          or exists (select 1 from unnest(o.synonyms) y where quality.object_clean(y) = k.c))
   order by (o.id = (select raw from r)) desc, o.id limit 1;
$$;

create function quality.rbi_transfer_roles(p_company uuid, p_apply boolean default false)
returns table (email text, full_name text, old_role text, new_role text, old_objects text, objects text, problem text, action text)
language plpgsql as $$
declare
  m record; v_refs text[]; v_ids text[]; v_bad text[]; v_role uuid; v_obj text; v_ref text; v_node record; v_id uuid; v_r text;
begin
  if not exists (select 1 from quality.rbi_transfer_people t where t.core_company_id = p_company) then
    raise exception 'Компания не подготовлена к переносу: нет сопоставления людей (rbi_transfer_people)' using errcode = 'P0001';
  end if;
  if p_apply then
    -- 1. Роли компании (по названию; права — ровно набор ROLE_MATRIX)
    foreach v_r in array array['manager', 'deputy_manager', 'director', 'engineer'] loop
      select r.id into v_role from core.company_roles r where r.company_id = p_company and r.name = quality.rbi_role_name(v_r) and r.deleted_at is null;
      if v_role is null then
        insert into core.company_roles(company_id, name) values (p_company, quality.rbi_role_name(v_r)) returning id into v_role;
        perform planfact.log_admin_change(p_company, null, 'company_roles', v_role, 'INSERT', null,
          jsonb_build_object('name', quality.rbi_role_name(v_r), 'source', 'rbi_transfer_roles', 'actions', to_jsonb(quality.rbi_role_actions(v_r))));
      end if;
      delete from core.company_role_permissions rp where rp.role_id = v_role and rp.company_id = p_company
         and not (rp.action = any (quality.rbi_role_actions(v_r)));
      insert into core.company_role_permissions(role_id, company_id, action)
      select v_role, p_company, a from unnest(quality.rbi_role_actions(v_r)) a on conflict do nothing;
    end loop;
    -- 2. Объекты дерева локаций из закреплений, которых нет в справочнике объектов Качества
    for v_node in
      select distinct on (n.id) n.* from quality.rbi_transfer_people t
        join public.rbi_engineer_profiles p on p.id = t.old_profile_id
        cross join lateral unnest(case when jsonb_typeof(p.settings -> 'assignedProjects') = 'array' and jsonb_array_length(p.settings -> 'assignedProjects') > 0
                                       then array(select jsonb_array_elements_text(p.settings -> 'assignedProjects')) else p.assigned_projects end) ref
        join quality.location_nodes n on n.core_company_id = p_company and n.id = btrim(ref) and n."nodeType" = 'object' and not n.is_deleted
       where t.core_company_id = p_company and t.user_id is not null and quality.rbi_object_ref(p_company, ref) is null
    loop
      insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id, core_project_id, created_by_name)
      values ('obj_' || left(replace(v_node.id, '-', ''), 8), coalesce(nullif(v_node.canonical_key, ''), quality.object_clean(v_node."displayName")),
              v_node."displayName", '{}', p_company, v_node.core_project_id, 'P2-0033 rbi_transfer_roles');
    end loop;
  end if;

  -- 3. Люди
  for m in
    select t.user_id, t.email te, p.role pr, coalesce(up.full_name, p.engineer_name) fn,
           case when jsonb_typeof(p.settings -> 'assignedProjects') = 'array' and jsonb_array_length(p.settings -> 'assignedProjects') > 0
                then array(select jsonb_array_elements_text(p.settings -> 'assignedProjects')) else coalesce(p.assigned_projects, '{}') end refs
      from quality.rbi_transfer_people t
      join public.rbi_engineer_profiles p on p.id = t.old_profile_id
      left join core.user_profiles up on up.user_id = t.user_id
     where t.core_company_id = p_company and t.user_id is not null
     order by t.email
  loop
    email := m.te; full_name := m.fn; old_role := m.pr; new_role := quality.rbi_role_name(m.pr);
    v_refs := m.refs; v_ids := '{}'; v_bad := '{}'; problem := null; action := null;
    old_objects := array_to_string(v_refs, ', ');
    if m.pr = 'engineer' then
      foreach v_ref in array v_refs loop
        v_obj := quality.rbi_object_ref(p_company, v_ref);
        if v_obj is null then v_bad := v_bad || v_ref; elsif not (v_obj = any (v_ids)) then v_ids := v_ids || v_obj; end if;
      end loop;
      if cardinality(v_refs) = 0 then problem := 'у инженера в старом профиле нет объектов'; end if;
    end if;
    if new_role is null then problem := 'роль старого профиля не из 4 ролей РБИ: ' || coalesce(m.pr, '—'); end if;
    if cardinality(v_bad) > 0 then problem := 'не найден объект: ' || array_to_string(v_bad, ', '); end if;
    objects := (select string_agg(coalesce(o.display_name, x) || ' [' || x || ']', ', ' order by x)
                  from unnest(v_ids) x left join quality.project_objects o on o.core_company_id = p_company and o.id = x);
    if problem is null then
      select r.id into v_role from core.company_roles r where r.company_id = p_company and r.name = new_role and r.deleted_at is null;
      if exists (select 1 from core.role_assignments a where a.company_id = p_company and a.user_id = m.user_id and a.role_id = v_role
                  and a.project_id is null and a.revoked_at is null and (a.valid_to is null or a.valid_to > now())
                  and a.quality_objects is not distinct from (case when cardinality(v_ids) = 0 then null else (select array_agg(x order by x) from unnest(v_ids) x) end))
         and not exists (select 1 from core.role_assignments a join core.company_roles r on r.id = a.role_id
                  where a.company_id = p_company and a.user_id = m.user_id and a.revoked_at is null and a.role_id <> v_role
                    and coalesce(r.template_code, '') <> 'company_admin') then
        action := 'уже так';
      elsif not p_apply then
        action := 'будет назначено';
      else
        for v_id in select a.id from core.role_assignments a join core.company_roles r on r.id = a.role_id
                     where a.company_id = p_company and a.user_id = m.user_id and a.revoked_at is null
                       and coalesce(r.template_code, '') <> 'company_admin' loop
          update core.role_assignments set revoked_at = now() where id = v_id;
          perform planfact.log_admin_change(p_company, null, 'role_assignments', v_id, 'REVOKE', null,
                    jsonb_build_object('source', 'rbi_transfer_roles'));
        end loop;
        insert into core.role_assignments(company_id, user_id, role_id, quality_objects)
        values (p_company, m.user_id, v_role, case when cardinality(v_ids) = 0 then null else (select array_agg(x order by x) from unnest(v_ids) x) end)
        returning id into v_id;
        perform planfact.log_admin_change(p_company, null, 'role_assignments', v_id, 'ASSIGN', null,
                  jsonb_build_object('user_id', m.user_id, 'role_id', v_role, 'role_name', new_role, 'quality_objects', to_jsonb(v_ids),
                                     'source', 'rbi_transfer_roles', 'old_role', m.pr));
        action := 'назначено';
      end if;
    else
      action := 'пропущен';
    end if;
    return next;
  end loop;
  if p_apply then
    perform planfact.assert_company_has_admin(p_company);
    insert into quality.rbi_transfer_runs(core_company_id, action, scope, result)
    values (p_company, 'roles', 'all', jsonb_build_object('people', (select count(*) from quality.rbi_transfer_people t
             where t.core_company_id = p_company and t.user_id is not null)));
  end if;
end $$;

revoke all on function quality.rbi_role_actions(text), quality.rbi_role_name(text), quality.rbi_object_ref(uuid, text),
  quality.rbi_transfer_roles(uuid, boolean) from public, anon, authenticated;

commit;
