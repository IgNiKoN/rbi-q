-- P2-0035 этап 3 (ADR-066, ADR-070; решения владельца 25.10.2026 №6–7). Один список объектов компании; «не разобрано».
--   1) объект-контейнер (как «Объекты RBI»: код проекта старого Качества при переносе) — служебный (core.projects.quality_container):
--      скрыт из списков объектов («Компания», План/Факт — pf_company_projects, pf_my_projects), Качество работает в нём
--      (quality.my_access → 'container'); объектом ЖК не бывает;
--   2) объект ядра создан («Компания», План/Факт) — у компании с Качеством сервер добавляет объект Качества и узел-объект дерева
--      локаций (из него экран Качества строит список объектов); переименован — то же название в Качестве, прежнее — синоним;
--   3) узел-объект дерева создан в Качестве — сервер добавляет объект Качества и объект ядра (039: по названию или новый);
--      переименован — объект ядра тоже (прежнее название — синоним);
--   4) узнавание объекта записи — и по синонимам узлов-объектов дерева (их пишет экран «Объекты и планы» Качества);
--   5) «не разобрано»: запись с объектом, который сервер не узнал, — заявка в существующей очереди названий Качества
--      (quality.object_normalization_queue; администратор: «Связать с: …» → синоним узла); новый синоним / объект / связь
--      подрядчика → сервер заново узнаёт записи «не разобрано» компании (quality.reresolve).
-- Применять после 039a, одним запросом. Откат — 039b_quality_one_object_list_down.sql (созданные объекты, узлы, заявки, синонимы
-- и пересчитанные id записей остаются — данные компании).
begin;

do $$
begin
  if to_regprocedure('quality.record_visible(uuid,uuid,text[],text,uuid,uuid,uuid,uuid)') is null then
    raise exception '039b: сначала 039a_quality_contractors_by_id_up.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'projects' and column_name = 'quality_container') then
    raise exception '039b уже применена (повтор — только после 039b_quality_one_object_list_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- 1. Объект-контейнер.
alter table core.projects add column quality_container boolean not null default false;
comment on column core.projects.quality_container is 'P2-0035: служебный объект-контейнер Качества (код проекта старого Качества); скрыт из списков объектов';
update core.projects pr set quality_container = true
 where exists (select 1 from quality.rbi_transfer_projects t where t.core_project_id = pr.id and t.core_company_id = pr.company_id);

create or replace function public.pf_company_projects(p_company uuid)
returns table(id uuid, name text, code text, archived_at timestamptz, created_at timestamptz, can_manage boolean,
              customer_id uuid, customer_name text, general_contractor_id uuid, general_contractor_name text)
language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  select pr.id, pr.name, pr.code, pr.archived_at, pr.created_at, planfact.has_permission(pr.id, 'planfact.projects.manage'),
         pr.customer_id, cu.name, pr.general_contractor_id, gc.name
  from core.projects pr
  left join core.counterparties cu on cu.id = pr.customer_id
  left join core.counterparties gc on gc.id = pr.general_contractor_id
  where pr.company_id = p_company and auth.uid() is not null and planfact.is_project_member(pr.id) and not pr.quality_container
  order by (pr.archived_at is not null), pr.name;
$$;

create or replace function public.pf_my_projects()
returns setof core.projects language sql stable security invoker set search_path = pg_catalog, planfact, core as $$
  select * from core.projects where not quality_container order by name;
$$;

-- Контейнер компании запроса (null — нет): Качество работает в нём.
create function quality.request_container()
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select pr.id from core.projects pr
   where pr.company_id = quality.request_company() and pr.quality_container and pr.archived_at is null
   order by pr.created_at, pr.id limit 1
$$;

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
    'container', case when exists (select 1 from asg) or planfact.is_platform_admin() then quality.request_container() end);
$$;

-- Контейнер объектом ЖК не бывает (как 039, + not quality_container).
create or replace function quality.ensure_core_object(p quality.project_objects)
returns uuid language plpgsql security definer set search_path = pg_catalog, core as $$
declare v uuid[]; v_id uuid; v_prev text := coalesce(current_setting('quality.object_sync', true), '');
begin
  if p.core_company_id is null or not quality.object_alive(p) then return null; end if;
  select array_agg(pr.id order by pr.created_at, pr.id) into v from core.projects pr
   where pr.company_id = p.core_company_id and pr.archived_at is null and not pr.quality_container
     and quality.object_clean(pr.name) <> ''
     and quality.object_clean(pr.name) in (quality.object_clean(p.display_name), quality.object_clean(p.canonical_key));
  if cardinality(v) = 1 then return v[1]; end if;
  if cardinality(v) > 1 then return null; end if;
  perform set_config('quality.object_sync', '1', true);   -- объект ядра из Качества: узел и объект Качества уже есть
  insert into core.projects(company_id, name) values (p.core_company_id, btrim(coalesce(nullif(btrim(p.display_name), ''), p.canonical_key)))
    returning id into v_id;
  perform set_config('quality.object_sync', v_prev, true);
  perform planfact.log_admin_change(p.core_company_id, v_id, 'projects', v_id, 'INSERT', null,
    jsonb_build_object('name', btrim(coalesce(nullif(btrim(p.display_name), ''), p.canonical_key)), 'source', 'P2-0035 объект Качества ' || p.id));
  return v_id;
end $$;

-- Объект Качества, созданный сервером по узлу дерева или объекту ядра (039b), уступает место объекту Качества с тем же ключом,
-- который пришёл позже (перенос РБИ, устройство): связь с объектом ядра переходит к нему (иначе — как 039).
create or replace function quality.project_object_core()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare x text; v_core uuid;
begin
  if coalesce(current_setting('quality.object_bind', true), '') <> '1' then
    new.core_object_id := case when tg_op = 'UPDATE' then old.core_object_id end;
  end if;
  if tg_op = 'INSERT' then
    delete from quality.project_objects po
     where po.core_company_id = new.core_company_id and po.canonical_key = new.canonical_key and po.id <> new.id
       and po.created_by_name in ('P2-0035 узел дерева Качества', 'P2-0035 объект компании')
    returning po.core_object_id into v_core;
    new.core_object_id := coalesce(new.core_object_id, v_core);
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

-- 2. Названия узла-объекта дерева: ключ, название, синонимы (очищенные, без пустых).
create function quality.node_names(n quality.location_nodes)
returns text[] language sql immutable set search_path = pg_catalog as $$
  select array(select distinct x from unnest(array[quality.object_clean(n.canonical_key), quality.object_clean(n."displayName")]
                  || array(select quality.object_clean(y) from jsonb_array_elements_text(case when jsonb_typeof(n.synonyms) = 'array' then n.synonyms else '[]' end) y)) x
                where x <> '')
$$;
-- Названия объекта Качества: ключ, название, синонимы.
create function quality.po_names(p quality.project_objects)
returns text[] language sql immutable set search_path = pg_catalog as $$
  select array(select distinct x from unnest(array[quality.object_clean(p.canonical_key), quality.object_clean(p.display_name)]
                  || array(select quality.object_clean(y) from unnest(coalesce(p.synonyms, '{}')) y)) x
                where x <> '')
$$;

-- Узнавание (как 039 + синонимы узлов-объектов дерева, если справочник не узнал): узел ↔ объект Качества — по ключу или названию узла.
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
         and quality.po_names(po) && array[quality.object_clean(coalesce(nullif(n.canonical_key, ''), n."displayName")), quality.object_clean(n."displayName")];
    end if;
    ids := ids || coalesce(v, '{}');
  end if;
  foreach x in array array[p_key, p_name] loop
    x := quality.object_clean(x);
    if x in ('unknown', 'все', 'all') or x like 'все %' then x := ''; end if;
    if x <> '' then
      -- сначала справочник объектов Качества (как 039), затем — синонимы узлов-объектов дерева, затем — синонимы справочника
      select array_agg(po.core_object_id) into v from quality.project_objects po
       where po.core_company_id = p_company and quality.object_alive(po)
         and (quality.object_clean(po.canonical_key) = x or quality.object_clean(po.display_name) = x
              or exists (select 1 from unnest(po.synonyms) y where quality.object_clean(y) = x));
      if v is null then
        select array_agg(po.core_object_id) into v
          from quality.location_nodes n join quality.project_objects po
            on po.core_company_id = n.core_company_id and quality.object_alive(po)
           and quality.po_names(po) && array[quality.object_clean(coalesce(nullif(n.canonical_key, ''), n."displayName")), quality.object_clean(n."displayName")]
         where n.core_company_id = p_company and n."nodeType" = 'object' and not coalesce(n.is_deleted, false) and x = any (quality.node_names(n));
      end if;
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

-- 3. Заново узнать записи «не разобрано» компании (после нового синонима, объекта, связи подрядчика). Служебная.
create function quality.reresolve(p_company uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare t text; v_pid text; v_nm text; v_prev text := coalesce(current_setting('quality.object_bind', true), '');
begin
  if p_company is null then return; end if;
  perform set_config('quality.object_bind', '1', true);
  foreach t in array array['rbi_inspections', 'rbi_inspection_items', 'rbi_inspection_photos', 'rbi_tasks', 'sk_records', 'sk_volumes',
                           'sk_data_bundles', 'sk_import_batches', 'project_fmea', 'project_interventions', 'project_meetings',
                           'project_schedule_stages', 'shared_reports', 'shared_report_snapshots'] loop
    v_pid := case when exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = t and column_name = 'projectId')
                  then 'r."projectId"' else 'null::text' end;
    v_nm := case when exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = t and column_name = 'project_display_name')
                 then 'r.project_display_name' else 'null::text' end;
    execute format($q$
      with m as materialized (
        select pid, k, nm, quality.object_of($1, pid, k, nm) oid
          from (select distinct %2$s pid, r.project_canonical_key k, %3$s nm from quality.%1$I r
                 where r.core_company_id = $1 and r.core_object_id is null) d)
      update quality.%1$I r set core_object_id = m.oid from m
       where m.oid is not null and r.core_company_id = $1 and r.core_object_id is null and %2$s is not distinct from m.pid
         and r.project_canonical_key is not distinct from m.k and %3$s is not distinct from m.nm$q$, t, v_pid, v_nm) using p_company;
  end loop;
  foreach t in array array['rbi_inspections', 'rbi_tasks', 'sk_records', 'project_fmea', 'project_interventions', 'project_meetings',
                           'project_schedule_stages', 'shared_reports', 'shared_report_snapshots'] loop
    v_pid := case when exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = t and column_name = 'contractor_canonical_key')
                  then 'r.contractor_canonical_key' else 'null::text' end;
    v_nm := case when exists (select 1 from information_schema.columns where table_schema = 'quality' and table_name = t and column_name = 'contractor_name')
                 then 'r.contractor_name' else 'null::text' end;
    execute format($q$
      with m as materialized (
        select k, nm, quality.counterparty_of($1, k, nm) cid
          from (select distinct %2$s k, %3$s nm from quality.%1$I r where r.core_company_id = $1 and r.core_counterparty_id is null) d)
      update quality.%1$I r set core_counterparty_id = m.cid from m
       where m.cid is not null and r.core_company_id = $1 and r.core_counterparty_id is null
         and %2$s is not distinct from m.k and %3$s is not distinct from m.nm$q$, t, v_pid, v_nm) using p_company;
  end loop;
  perform set_config('quality.object_bind', v_prev, true);
end $$;

-- 4. Ядро → Качество: новый объект — объект Качества и узел-объект дерева (если у компании Качество и такого объекта нет);
--    переименование — название в Качестве (прежнее — синоним).
create function quality.core_project_sync()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_po quality.project_objects; v_names text[];
begin
  if new.quality_container or coalesce(current_setting('quality.object_sync', true), '') = '1' then return null; end if;
  if not exists (select 1 from core.company_modules cm where cm.company_id = new.company_id and cm.module = 'quality' and cm.enabled) then
    return null;
  end if;
  perform set_config('quality.object_sync', '1', true);
  if tg_op = 'INSERT' then
    v_names := array[quality.object_clean(new.name)];
    select * into v_po from quality.project_objects po
     where po.core_company_id = new.company_id and quality.object_alive(po) and quality.po_names(po) && v_names
     order by po.created_at, po.id limit 1;
    perform set_config('quality.object_bind', '1', true);
    if v_po.id is null then
      insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id, core_object_id, created_by_name)
      values ('obj_' || replace(new.id::text, '-', ''), quality.object_clean(new.name), new.name, '{}', new.company_id, new.id, 'P2-0035 объект компании')
      on conflict do nothing;
    elsif v_po.core_object_id is null then
      update quality.project_objects set core_object_id = new.id where id = v_po.id;
    end if;
    perform set_config('quality.object_bind', '', true);
    if not exists (select 1 from quality.location_nodes n where n.core_company_id = new.company_id and n."nodeType" = 'object'
                    and not coalesce(n.is_deleted, false) and quality.node_names(n) && v_names) then
      insert into quality.location_nodes(id, canonical_key, "displayName", synonyms, "nodeType", "parentId", core_company_id, created_by)
      values (gen_random_uuid()::text, quality.object_clean(new.name), new.name, '[]', 'object', null, new.company_id, 'P2-0035 объект компании');
    end if;
  elsif new.name is distinct from old.name then
    update quality.project_objects set display_name = new.name where core_company_id = new.company_id and core_object_id = new.id;
    update quality.location_nodes n set "displayName" = new.name,
           synonyms = case when quality.object_clean(old.name) = any (quality.node_names(n)) and quality.object_clean(old.name) <> quality.object_clean(n."displayName")
                           then n.synonyms else coalesce(case when jsonb_typeof(n.synonyms) = 'array' then n.synonyms end, '[]') || to_jsonb(old.name) end,
           updated_at = now()
     where n.core_company_id = new.company_id and n."nodeType" = 'object' and not coalesce(n.is_deleted, false)
       and quality.object_clean(n."displayName") = quality.object_clean(old.name);
  end if;
  perform set_config('quality.object_sync', '', true);
  perform quality.reresolve(new.company_id);
  return null;
end $$;
create trigger projects_quality_sync after insert or update of name on core.projects
  for each row execute function quality.core_project_sync();

-- 5. Качество → ядро: новый корневой узел-объект — объект Качества (и объект ядра, 039); переименование — объект ядра тоже;
--    синонимы узла изменились — записи «не разобрано» узнаются заново.
create function quality.node_object_sync()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_po quality.project_objects; v_names text[]; v_old text[];
begin
  if new."nodeType" is distinct from 'object' or coalesce(new.is_deleted, false) or coalesce(new."parentId", '') <> ''
     or coalesce(current_setting('quality.object_sync', true), '') = '1' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old."nodeType" = 'object' and not coalesce(old.is_deleted, false) and coalesce(old."parentId", '') = ''
     and array(select unnest(quality.node_names(new)) order by 1) = array(select unnest(quality.node_names(old)) order by 1) then
    return null;   -- устройство переслало узел без изменения названий
  end if;
  v_names := array[quality.object_clean(coalesce(nullif(new.canonical_key, ''), new."displayName")), quality.object_clean(new."displayName")];
  if tg_op = 'UPDATE' and quality.object_clean(new."displayName") is distinct from quality.object_clean(old."displayName") then
    v_old := array[quality.object_clean(coalesce(nullif(old.canonical_key, ''), old."displayName")), quality.object_clean(old."displayName")];
  end if;
  select * into v_po from quality.project_objects po
   where po.core_company_id = new.core_company_id and quality.object_alive(po) and quality.po_names(po) && coalesce(v_old, v_names)
   order by po.created_at, po.id limit 1;
  perform set_config('quality.object_sync', '1', true);
  if v_po.id is null then
    insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id, created_by_name)
    values ('obj_' || replace(new.id, '-', ''), coalesce(nullif(btrim(new.canonical_key), ''), quality.object_clean(new."displayName")),
            coalesce(nullif(btrim(new."displayName"), ''), new.canonical_key), '{}', new.core_company_id, 'P2-0035 узел дерева Качества')
    on conflict do nothing;
  elsif v_old is not null then
    update quality.project_objects set display_name = new."displayName" where id = v_po.id;
    if v_po.core_object_id is not null and exists (select 1 from core.projects where id = v_po.core_object_id and name is distinct from btrim(new."displayName")) then
      update core.projects set name = btrim(new."displayName") where id = v_po.core_object_id;
      perform planfact.log_admin_change(new.core_company_id, v_po.core_object_id, 'projects', v_po.core_object_id, 'UPDATE', null,
        jsonb_build_object('name', btrim(new."displayName"), 'source', 'P2-0035 узел дерева Качества ' || new.id));
    end if;
  end if;
  perform set_config('quality.object_sync', '', true);
  perform quality.reresolve(new.core_company_id);
  return null;
end $$;
create trigger location_nodes_object_sync
  after insert or update of canonical_key, "displayName", synonyms, "nodeType", "parentId", is_deleted on quality.location_nodes
  for each row execute function quality.node_object_sync();

-- Справочник объектов, синонимы справочника, связи подрядчиков изменились — записи «не разобрано» узнаются заново.
create function quality.reresolve_trigger()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if coalesce(current_setting('quality.object_sync', true), '') <> '1' then
    perform quality.reresolve(coalesce(to_jsonb(new) ->> 'core_company_id', to_jsonb(old) ->> 'core_company_id')::uuid);
  end if;
  return null;
end $$;
-- Объект Качества: только при изменении названий, удаления или связи с ядром (устройство пересылает строки целиком).
create function quality.project_objects_reresolve()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if tg_op = 'UPDATE' and array(select unnest(quality.po_names(new)) order by 1) = array(select unnest(quality.po_names(old)) order by 1)
     and quality.object_alive(new) = quality.object_alive(old) and new.core_object_id is not distinct from old.core_object_id then
    return null;
  end if;
  if coalesce(current_setting('quality.object_sync', true), '') <> '1' then
    perform quality.reresolve(new.core_company_id);
  end if;
  return null;
end $$;
create trigger project_objects_reresolve after insert or update of canonical_key, display_name, synonyms, is_deleted, _deleted, deleted_at, core_object_id
  on quality.project_objects for each row execute function quality.project_objects_reresolve();
create trigger object_aliases_reresolve after insert or update on quality.object_aliases
  for each row execute function quality.reresolve_trigger();
create trigger contractor_core_links_reresolve after insert or update on quality.contractor_core_links
  for each row execute function quality.reresolve_trigger();

-- 6. «Не разобрано» → заявка в очереди названий объектов Качества (одна на название; администратор связывает с объектом).
create function quality.queue_unresolved()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare n jsonb := to_jsonb(new); v_raw text;
begin
  if new.core_object_id is not null or coalesce(current_setting('quality.object_bind', true), '') = '1' then return null; end if;
  v_raw := btrim(coalesce(nullif(btrim(n ->> 'project_display_name'), ''), n ->> 'project_canonical_key', ''));
  if quality.object_clean(v_raw) in ('', 'unknown', 'все', 'all') or quality.object_clean(v_raw) like 'все %'
     or nullif(n ->> 'project_code', '') is null then
    return null;
  end if;
  insert into quality.object_normalization_queue(id, project_code, raw_name, source_table, source_record_id, created_by, status, core_company_id)
  values ('unres_' || left(md5(new.core_company_id::text || '|' || (n ->> 'project_code') || '|' || v_raw), 20), n ->> 'project_code', v_raw,
          tg_table_name, n ->> 'id', 'P2-0035 не разобрано', 'pending', new.core_company_id)
  on conflict do nothing;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['rbi_inspections', 'rbi_tasks', 'sk_records', 'project_fmea', 'project_interventions', 'project_meetings',
                           'project_schedule_stages', 'shared_reports'] loop
    execute format('create trigger %I after insert or update of project_canonical_key, project_display_name on quality.%I for each row execute function quality.queue_unresolved()',
                   t || '_queue_unresolved', t);
    -- существующие «не разобрано» — в очередь
    execute format($q$
      insert into quality.object_normalization_queue(id, project_code, raw_name, source_table, source_record_id, created_by, status, core_company_id)
      select distinct on (r.core_company_id, r.project_code, x.raw)
             'unres_' || left(md5(r.core_company_id::text || '|' || r.project_code || '|' || x.raw), 20), r.project_code, x.raw, %1$L, r.id,
             'P2-0035 не разобрано', 'pending', r.core_company_id
        from quality.%1$I r, lateral (select btrim(coalesce(nullif(btrim(r.project_display_name), ''), r.project_canonical_key, '')) raw) x
       where r.core_object_id is null and nullif(r.project_code, '') is not null
         and quality.object_clean(x.raw) not in ('', 'unknown', 'все', 'all') and quality.object_clean(x.raw) not like 'все %%'
       order by r.core_company_id, r.project_code, x.raw, r.id
      on conflict do nothing$q$, t);
  end loop;
end $$;

-- 7. Узлы-объекты дерева без объекта Качества (созданы в Качестве после 033a) — объект Качества и объект ядра.
do $$
declare n quality.location_nodes;
begin
  for n in select * from quality.location_nodes x
            where x."nodeType" = 'object' and not coalesce(x.is_deleted, false) and coalesce(x."parentId", '') = ''
              and not exists (select 1 from quality.project_objects po where po.core_company_id = x.core_company_id and quality.object_alive(po)
                                and quality.po_names(po) && array[quality.object_clean(coalesce(nullif(x.canonical_key, ''), x."displayName")), quality.object_clean(x."displayName")])
            order by x.core_company_id, x.created_at, x.id loop
    insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id, created_by_name)
    values ('obj_' || replace(n.id, '-', ''), coalesce(nullif(btrim(n.canonical_key), ''), quality.object_clean(n."displayName")),
            coalesce(nullif(btrim(n."displayName"), ''), n.canonical_key), '{}', n.core_company_id, 'P2-0035 узел дерева Качества')
    on conflict do nothing;
  end loop;
end $$;

revoke all on function quality.request_container(), quality.node_names(quality.location_nodes), quality.po_names(quality.project_objects),
  quality.reresolve(uuid), quality.core_project_sync(), quality.node_object_sync(), quality.reresolve_trigger(),
  quality.project_objects_reresolve(), quality.queue_unresolved()
  from public, anon, authenticated;

commit;
