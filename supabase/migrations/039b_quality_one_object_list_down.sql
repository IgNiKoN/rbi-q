-- Откат P2-0035 этапа 3 (039b_quality_one_object_list_up.sql): списки объектов, quality.my_access, узнавание и объект ядра
-- для объекта Качества — как 039/039a; триггеры синхронизации, «не разобрано» и признак контейнера удаляются.
-- Созданные объекты ядра и Качества, узлы дерева, заявки «не разобрано», синонимы и узнанные id записей остаются (данные компании).
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'projects' and column_name = 'quality_container') then
    raise exception '039b не применена — откатывать нечего' using errcode = 'P0001';
  end if;
end $$;

-- 1. Триггеры и функции 039b.
do $$
declare t text;
begin
  foreach t in array array['rbi_inspections', 'rbi_tasks', 'sk_records', 'project_fmea', 'project_interventions', 'project_meetings',
                           'project_schedule_stages', 'shared_reports'] loop
    execute format('drop trigger %I on quality.%I', t || '_queue_unresolved', t);
  end loop;
end $$;
drop trigger projects_quality_sync on core.projects;
drop trigger location_nodes_object_sync on quality.location_nodes;
drop trigger project_objects_reresolve on quality.project_objects;
drop trigger object_aliases_reresolve on quality.object_aliases;
drop trigger contractor_core_links_reresolve on quality.contractor_core_links;
drop function quality.queue_unresolved();
drop function quality.project_objects_reresolve();
drop function quality.reresolve_trigger();
drop function quality.node_object_sync();
drop function quality.core_project_sync();
drop function quality.reresolve(uuid);

-- 2. Узнавание — как 039.
create or replace function quality.object_candidates(p_company uuid, p_pid text, p_key text, p_name text)
returns uuid[] language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  ids uuid[] := '{}';
  v uuid[];
  x text;
begin
  if p_company is null then return null; end if;
  x := btrim(coalesce(p_pid, ''));
  if x <> '' then
    select array_agg(po.core_object_id) into v from quality.project_objects po
     where po.core_company_id = p_company and po.id = x and quality.object_alive(po);
    if v is null then
      select array_agg(po.core_object_id) into v
        from quality.location_nodes n join quality.project_objects po on po.core_company_id = n.core_company_id and quality.object_alive(po)
       where n.core_company_id = p_company and n.id = x and n."nodeType" = 'object' and not coalesce(n.is_deleted, false)
         and quality.object_clean(coalesce(nullif(n.canonical_key, ''), n."displayName")) <> ''
         and (quality.object_clean(coalesce(nullif(n.canonical_key, ''), n."displayName")) in (quality.object_clean(po.canonical_key), quality.object_clean(po.display_name))
              or exists (select 1 from unnest(po.synonyms) y where quality.object_clean(y) = quality.object_clean(coalesce(nullif(n.canonical_key, ''), n."displayName"))));
    end if;
    ids := ids || coalesce(v, '{}');
  end if;
  foreach x in array array[p_key, p_name] loop
    x := quality.object_clean(x);   -- «нет объекта» — как quality.record_keys (033)
    if x in ('unknown', 'все', 'all') or x like 'все %' then x := ''; end if;
    if x <> '' then
      select array_agg(po.core_object_id) into v from quality.project_objects po
       where po.core_company_id = p_company and quality.object_alive(po)
         and (quality.object_clean(po.canonical_key) = x or quality.object_clean(po.display_name) = x
              or exists (select 1 from unnest(po.synonyms) y where quality.object_clean(y) = x));
      if v is null then
        select array_agg(po.core_object_id) into v
          from quality.object_aliases al join quality.project_objects po
            on po.core_company_id = al.core_company_id and po.canonical_key = al.canonical_key and quality.object_alive(po)
         where al.core_company_id = p_company and not coalesce(al.is_deleted, false) and quality.object_clean(al.raw_name) = x;
      end if;
      ids := ids || coalesce(v, '{}');
    end if;
  end loop;
  select array_agg(distinct i) into v from unnest(ids) i;
  return coalesce(v, '{}');
end $$;
drop function quality.po_names(quality.project_objects);
drop function quality.node_names(quality.location_nodes);

-- 3. Объект ядра для объекта Качества — как 039.
create or replace function quality.ensure_core_object(p quality.project_objects)
returns uuid language plpgsql security definer set search_path = pg_catalog, core as $$
declare v uuid[]; v_id uuid;
begin
  if p.core_company_id is null or not quality.object_alive(p) then return null; end if;
  select array_agg(pr.id order by pr.created_at, pr.id) into v from core.projects pr
   where pr.company_id = p.core_company_id and pr.archived_at is null
     and quality.object_clean(pr.name) <> ''
     and quality.object_clean(pr.name) in (quality.object_clean(p.display_name), quality.object_clean(p.canonical_key));
  if cardinality(v) = 1 then return v[1]; end if;
  if cardinality(v) > 1 then return null; end if;
  insert into core.projects(company_id, name) values (p.core_company_id, btrim(coalesce(nullif(btrim(p.display_name), ''), p.canonical_key)))
    returning id into v_id;
  perform planfact.log_admin_change(p.core_company_id, v_id, 'projects', v_id, 'INSERT', null,
    jsonb_build_object('name', btrim(coalesce(nullif(btrim(p.display_name), ''), p.canonical_key)), 'source', 'P2-0035 объект Качества ' || p.id));
  return v_id;
end $$;

-- Объект Качества — как 039.
create or replace function quality.project_object_core()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare x text;
begin
  if coalesce(current_setting('quality.object_bind', true), '') <> '1' then
    new.core_object_id := case when tg_op = 'UPDATE' then old.core_object_id end;
  end if;
  if tg_op = 'UPDATE' then
    foreach x in array array[old.display_name, old.canonical_key] loop
      if quality.object_clean(x) <> '' and quality.object_clean(x) not in (quality.object_clean(new.display_name), quality.object_clean(new.canonical_key))
         and not exists (select 1 from unnest(coalesce(new.synonyms, '{}')) y where quality.object_clean(y) = quality.object_clean(x)) then
        new.synonyms := coalesce(new.synonyms, '{}') || x;
      end if;
    end loop;
  end if;
  if new.core_object_id is null and quality.object_alive(new) then
    new.core_object_id := quality.ensure_core_object(new);
  end if;
  return new;
end $$;

-- 4. Экран Качества и списки объектов — как до 039b.
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
drop function quality.request_container();

create or replace function public.pf_my_projects()
returns setof core.projects language sql stable set search_path = pg_catalog, planfact, core as $$
  select * from core.projects order by name;
$$;

create or replace function public.pf_company_projects(p_company uuid)
returns table(id uuid, name text, code text, archived_at timestamptz, created_at timestamptz, can_manage boolean,
              customer_id uuid, customer_name text, general_contractor_id uuid, general_contractor_name text)
language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  select pr.id, pr.name, pr.code, pr.archived_at, pr.created_at, planfact.has_permission(pr.id, 'planfact.projects.manage'),
         pr.customer_id, cu.name, pr.general_contractor_id, gc.name
  from core.projects pr
  left join core.counterparties cu on cu.id = pr.customer_id
  left join core.counterparties gc on gc.id = pr.general_contractor_id
  where pr.company_id = p_company and auth.uid() is not null and planfact.is_project_member(pr.id)
  order by (pr.archived_at is not null), pr.name;
$$;

alter table core.projects drop column quality_container;

commit;
