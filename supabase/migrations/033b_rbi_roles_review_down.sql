-- Откат P2-0033 доработки 1 (033b_rbi_roles_review_up.sql): правила справочника объектов и дерева локаций — снова *.edit (как 018),
-- функции и триггеры пересчёта признаков — как в 033, перенос ролей — как в 033a; новые функции удаляются.
begin;

do $$
declare r record; v_edit text;
begin
  for r in select * from (values
    ('project_objects', '{quality.edit,construction.edit}'), ('object_aliases', '{quality.edit,construction.edit}'),
    ('location_nodes', '{construction.edit}'), ('location_node_aliases', '{construction.edit}'),
    ('construction_floors_v2', '{construction.edit}')
  ) v(t, ea) loop
    v_edit := format('quality.can(core_company_id, core_project_id, %L)', r.ea);
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
end $$;

create or replace function quality.objects_keys(p_company uuid, p_ids text[])
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

create or replace function quality.row_visible(p_company uuid, p_project uuid, p_actions text[], p_kind text,
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

drop function quality.record_foreign_object(uuid, text[], text[]);

create or replace function quality.refresh_object_keys()
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
drop trigger project_objects_refresh_object_keys on quality.project_objects;
drop trigger location_nodes_refresh_object_keys on quality.location_nodes;
create trigger project_objects_refresh_object_keys after insert or update or delete on quality.project_objects
  for each row execute function quality.refresh_object_keys();
create trigger location_nodes_refresh_object_keys after insert or update or delete on quality.location_nodes
  for each row execute function quality.refresh_object_keys();

create or replace function quality.rbi_object_ref(p_company uuid, p_ref text)
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

create or replace function quality.rbi_transfer_roles(p_company uuid, p_apply boolean default false)
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
drop function quality.rbi_object_node(uuid, text);

commit;
