-- P2-0048 (участие в проекте; решения владельца 27.10.2026). Назначение до места, «ответственный за факт», права План/Факта по области.
--   1) core.role_assignments: место (location_id — узел дерева проекта: объект / секция / этаж; область = узел и всё под ним)
--      и «ответственный за факт» (fact_owner); старые назначения не меняют смысла: без проекта — вся компания, проект без места —
--      весь проект;
--   2) core.permission_catalog.area_scoped — права, которые даёт назначение на часть проекта (данные, не код): просмотр работ,
--      просмотр, ввод и подтверждение факта, чек-лист заказчика; остальное (КС-2, сметы, деньги, ВОР, настройки) — только назначение на весь проект;
--   3) planfact.my_area / my_area_nodes / in_area — одна проверка «человек видит место» для всех функций и правил План/Факта;
--      списки позиций, мест, факта, журнал, история, сводки и «Входящие» — только своя область;
--   4) факт: место вне области — отказ; у места есть ответственный за факт — вносит он, РП (право «подтверждать факт») — за него
--      с отметкой «за кого» (fact_entries.on_behalf_of); у места нет ответственного — как сейчас (решение владельца 27.10.2026);
--   5) pf_set_participation — пакетное назначение (люди × роль × проект × места / объекты Качества), оно же «Изменить область»
--      действующего назначения без отзыва; Качество — мост: назначение на проект получает объекты Качества этого проекта
--      (Качество смотрит только на назначения без проекта — его правила не меняются).
-- Применять после 046c, одним запросом. Откат — 047_project_participation_down.sql.
begin;

do $$
begin
  if to_regprocedure('planfact.position_moved_to(uuid)') is null then
    raise exception '047: сначала 046c_vor_revisions_ks2_materials_up.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'role_assignments' and column_name = 'location_id') then
    raise exception '047 уже применена (повтор — только после 047_project_participation_down.sql)' using errcode = 'P0001';
  end if;
  if to_regclass('p2_backup.p2_0048_assignments') is not null or to_regclass('p2_backup.p2_0048_fact_on_behalf') is not null then
    raise exception '047: остались копии p2_backup.p2_0048_* от прошлого отката — сначала разобрать' using errcode = 'P0001';
  end if;
end $$;

-- 1. Область назначения.
alter table core.role_assignments
  add column location_id uuid references core.locations(id),
  add column fact_owner boolean not null default false,
  add constraint role_assignments_location_chk check (location_id is null or project_id is not null),
  add constraint role_assignments_fact_owner_chk check (not fact_owner or project_id is not null);
comment on column core.role_assignments.location_id is 'P2-0048: место дерева проекта (узел и всё под ним); null — весь проект (или вся компания без проекта)';
comment on column core.role_assignments.fact_owner is 'P2-0048: ответственный за факт по области назначения';
create index role_assignments_project_location_idx on core.role_assignments (project_id, location_id) where revoked_at is null;
create index role_assignments_fact_owner_idx on core.role_assignments (project_id) where fact_owner and revoked_at is null;

-- 2. Права, которые даёт назначение на часть проекта (данные).
alter table core.permission_catalog add column area_scoped boolean not null default false;
comment on column core.permission_catalog.area_scoped is 'P2-0048: право действует при назначении на часть проекта (по местам)';
update core.permission_catalog set area_scoped = true
 where action in ('planfact.works.view', 'planfact.fact.view', 'planfact.fact.create', 'planfact.fact.approve',
                  'planfact.checklist.view', 'planfact.checklist.create');

-- 3. «За кого» в факте.
alter table planfact.fact_entries add column on_behalf_of uuid references auth.users(id);
comment on column planfact.fact_entries.on_behalf_of is 'P2-0048: ответственный за факт, за которого внёс РП (автор — created_by)';

-- 4. Область сотрудника.
-- Область в проекте: null — весь проект; иначе id мест (узлы назначений и всё под ними). Без пользователя или без назначений
-- в компании проекта — null: ограничивать нечего (доступ закрывают проверки прав has_permission / is_project_member).
create function planfact.my_area(p_project uuid)
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

-- Узлы, которые видны в дереве: область и родители её узлов (чтобы дойти до своей секции). null — всё дерево.
create function planfact.my_area_nodes(p_project uuid)
returns uuid[] language sql stable security definer set search_path = pg_catalog as $$
  with a as (select planfact.my_area(p_project) ids)
  select case when a.ids is null then null else array(
    with recursive up(id, parent_id) as (
      select l.id, l.parent_id from core.locations l where l.id = any (a.ids)
      union
      select p.id, p.parent_id from core.locations p join up on p.id = up.parent_id)
    select up.id from up) end
  from a
$$;

-- Место в области: область null — да.
create function planfact.in_area(p_location uuid, p_area uuid[])
returns boolean language sql immutable set search_path = pg_catalog as $$
  select p_area is null or p_location = any (p_area)
$$;

create function planfact.position_location(p_position uuid)
returns uuid language sql stable security definer set search_path = pg_catalog as $$
  select location_id from planfact.vor_positions where id = p_position
$$;

-- Ответственные за факт по месту: назначение с fact_owner на это место, его родителя или на весь проект.
create function planfact.place_fact_owners(p_project uuid, p_location uuid)
returns uuid[] language sql stable security definer set search_path = pg_catalog as $$
  with recursive up(id, parent_id) as (
    select l.id, l.parent_id from core.locations l where l.id = p_location and l.project_id = p_project
    union
    select p.id, p.parent_id from core.locations p join up on p.id = up.parent_id)
  select coalesce(array_agg(distinct a.user_id), '{}'::uuid[])
  from core.role_assignments a
  join core.company_members m on m.company_id = a.company_id and m.user_id = a.user_id and m.disabled_at is null
  where a.project_id = p_project and a.fact_owner
    and (a.location_id is null or a.location_id in (select up.id from up))
    and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
$$;

-- Проверка ввода факта по месту (вызывает fact_insert).
create function planfact.require_fact_place(p_project uuid, p_location uuid, p_on_behalf uuid, p_correction boolean)
returns void language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_uid uuid := auth.uid(); v_owners uuid[]; v_names text;
begin
  if v_uid is null then raise exception 'Нет доступа' using errcode = '42501'; end if;
  if not planfact.in_area(p_location, planfact.my_area(p_project)) then
    raise exception 'Это место вне вашей области в проекте — факт не принят' using errcode = '42501';
  end if;
  v_owners := planfact.place_fact_owners(p_project, p_location);
  if p_on_behalf is not null then
    if not planfact.has_permission(p_project, 'planfact.fact.approve') then
      raise exception 'Вносить факт «за кого» может только тот, кто подтверждает факт (РП)' using errcode = '42501';
    end if;
    if p_correction then raise exception 'Исправление вносится без «за кого»' using errcode = '22023'; end if;
    if p_on_behalf = v_uid then raise exception 'В «за кого» указывают другого сотрудника' using errcode = '22023'; end if;
    if not p_on_behalf = any (v_owners) then
      raise exception 'Этот сотрудник не отвечает за факт по этому месту' using errcode = '22023';
    end if;
    return;
  end if;
  if p_correction or cardinality(v_owners) = 0 or v_uid = any (v_owners) then return; end if;
  select string_agg(coalesce(nullif(btrim(up.full_name), ''), u.email::text), ', ' order by 1) into v_names
    from unnest(v_owners) o(id) left join core.user_profiles up on up.user_id = o.id left join auth.users u on u.id = o.id;
  raise exception 'Факт по этому месту вносит ответственный: %. РП может внести за него — с отметкой «за кого»', v_names
    using errcode = '42501';
end $$;

-- 8. Изменённые функции План/Факта (нынешние определения + область / «за кого»).
-- has_permission
CREATE OR REPLACE FUNCTION planfact.has_permission(p_project uuid, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
  select exists (
    select 1 from core.projects pr
    join core.company_modules cm on cm.company_id = pr.company_id and cm.module = 'planfact' and cm.enabled
    join core.permission_catalog c on c.action = p_action
    where pr.id = p_project
      and (planfact.is_platform_admin() or exists (
        select 1 from core.role_assignments a
        join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = p_action
        where a.company_id = pr.company_id and a.user_id = auth.uid()
          and (a.project_id = pr.id or a.project_id is null)
          and (a.location_id is null or c.area_scoped)
          and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now()))));
$function$;

-- fact_totals
CREATE OR REPLACE FUNCTION planfact.fact_totals(p_project uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(position_id uuid, plan_qty numeric, fact_qty numeric, pending_qty numeric, pending_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
  select p.id, case when p.withdrawn then 0 else p.qty end,
         coalesce(sum(e.qty) filter (where e.status = 'accepted'), 0),
         coalesce(sum(e.qty) filter (where e.status = 'pending_approval'), 0),
         (count(e.id) filter (where e.status = 'pending_approval'))::int
  from planfact.vor_positions_current p
  left join planfact.fact_entries e on e.position_id = p.id and e.project_id = p_project
       and (p_from is null or e.work_date >= p_from) and (p_to is null or e.work_date <= p_to)
  where p.project_id = p_project
    and planfact.in_area(p.location_id, (select planfact.my_area(p_project)))
    and (not p.withdrawn or exists (select 1 from planfact.fact_entries x where x.position_id = p.id
                                     and x.status in ('accepted', 'pending_approval')))
  group by p.id, p.qty, p.withdrawn;
$function$;

-- pf_vor_positions
CREATE OR REPLACE FUNCTION public.pf_vor_positions(p_project uuid, p_location uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, location_id uuid, location_path text, work_type_id uuid, work_type text, unit_code text, qty numeric, apartments_note text, import_id uuid, file_name text, source_row_no integer, withdrawn boolean, revision_no integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
begin
  if p_project is null or auth.uid() is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  return query
  with recursive sub(id) as (
    select l.id from core.locations l where l.id = p_location and l.project_id = p_project
    union all
    select c.id from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null
  )
  -- файл и строка — действующей редакции цепочки (у снятой — последней, где она была)
  select p.id, p.location_id, planfact.location_path(p.location_id), p.work_type_id, w.name, u.code, p.qty, p.apartments_note,
         coalesce(r.import_id, p.import_id), coalesce(r.file_name, i.file_name), coalesce(r.row_no, r0.row_no), p.withdrawn,
         coalesce(r.revision_no, ri.revision_no, i.revision_no)
  from planfact.vor_positions_current p
  join core.work_types w on w.id = p.work_type_id
  join core.units u on u.id = p.unit_id
  join planfact.vor_imports i on i.id = p.import_id
  left join planfact.vor_heads h on h.root_import_id = p.root_import_id
  left join lateral (select s.import_id, ci.file_name, ci.revision_no, min(s.row_no) row_no
                     from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id
                     join planfact.vor_imports ci on ci.id = s.import_id
                     where l.position_id = p.id and s.import_id = h.current_import_id and not p.withdrawn
                     group by s.import_id, ci.file_name, ci.revision_no) r on true
  left join lateral (select s.import_id, min(s.row_no) row_no from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id
                     join planfact.vor_imports ci on ci.id = s.import_id and ci.status = 'confirmed'
                     where l.position_id = p.id group by s.import_id, ci.revision_no order by ci.revision_no desc limit 1) r0 on true
  left join planfact.vor_imports ri on ri.id = r0.import_id
  where p.project_id = p_project and (p_location is null or p.location_id in (select sub.id from sub))
    and planfact.in_area(p.location_id, (select planfact.my_area(p_project)))
  order by planfact.location_path(p.location_id), w.name, p.id;
end $function$;

-- pf_list_locations
CREATE OR REPLACE FUNCTION public.pf_list_locations(p_project uuid, p_parent uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, parent_id uuid, node_type text, name text, sort_order integer, area numeric, depth integer, path text, child_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_prefix text;
begin
  if p_project is null or auth.uid() is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  if p_parent is not null then
    if not exists (select 1 from core.locations l where l.id = p_parent and l.project_id = p_project and l.deleted_at is null) then
      raise exception 'Узел не найден' using errcode = '22023';
    end if;
    v_prefix := planfact.location_path(p_parent) || ' · ';
  end if;
  return query
  select l.id, l.parent_id, l.node_type, l.name, l.sort_order, l.area, l.depth,
         coalesce(v_prefix, '') || l.name,
         (select count(*)::int from core.locations c where c.parent_id = l.id and c.deleted_at is null
            and planfact.in_area(c.id, (select planfact.my_area_nodes(p_project))))
  from core.locations l
  where l.project_id = p_project and l.deleted_at is null
    and l.parent_id is not distinct from p_parent
    and planfact.in_area(l.id, (select planfact.my_area_nodes(p_project)))
  order by l.sort_order, l.name, l.id;
end $function$;

-- pf_summary_places
CREATE OR REPLACE FUNCTION public.pf_summary_places(p_project uuid, p_location uuid DEFAULT NULL::uuid)
 RETURNS TABLE(location_id uuid, name text, node_type text, depth integer, children integer, positions integer, here_positions integer, plan_money numeric, done_money numeric, pct_money numeric, units jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_money boolean; v_today date := planfact.fact_today(); v_kp uuid;
begin
  v_money := planfact.require_summary_view(p_project);
  if p_location is not null and not exists (select 1 from core.locations l where l.id = p_location and l.project_id = p_project and l.deleted_at is null) then
    raise exception 'Место не найдено в проекте' using errcode = '22023';
  end if;
  select st.contract_kp_revision_id into v_kp from planfact.ks2_settings st where st.project_id = p_project;
  return query
  with recursive tree(root, id) as (
    select l.id, l.id from core.locations l
    where l.project_id = p_project and l.deleted_at is null and l.parent_id is not distinct from p_location
    union all
    select t.root, c.id from core.locations c join tree t on c.parent_id = t.id where c.deleted_at is null
  ), ft as materialized (
    select * from planfact.fact_totals(p_project)
  ), mon as materialized (
    select * from planfact.position_money(p_project, v_kp, v_today) where v_kp is not null
  ), pos as (
    select t.root, p.id, u.code, ft.plan_qty, ft.fact_qty, mon.plan_money pm, mon.done_money dm
    from tree t join planfact.vor_positions p on p.location_id = t.id and p.project_id = p_project
    join core.units u on u.id = p.unit_id
    join ft on ft.position_id = p.id
    left join mon on mon.position_id = p.id
  ), vol as (
    select x.root, jsonb_agg(jsonb_build_object('unit', x.code, 'plan', x.pq, 'fact', x.fq,
             'pct', case when x.pq > 0 then round(x.fq / x.pq * 100, 1) end) order by x.code) u
    from (select pos.root, pos.code, sum(pos.plan_qty) pq, sum(pos.fact_qty) fq from pos group by pos.root, pos.code) x
    group by x.root
  ), agg as (
    select pos.root, count(*)::int n, sum(pos.pm) pm, sum(pos.dm) dm from pos group by pos.root
  )
  select l.id, l.name, l.node_type, l.depth,
         (select count(*)::int from core.locations c where c.parent_id = l.id and c.deleted_at is null),
         coalesce(agg.n, 0), (select count(*)::int from planfact.vor_positions vp join ft on ft.position_id = vp.id
                                where vp.project_id = p_project and vp.location_id = l.id),
         case when v_money and v_kp is not null then round(coalesce(agg.pm, 0), 2) end,
         case when v_money and v_kp is not null then round(coalesce(agg.dm, 0), 2) end,
         case when v_money and agg.pm > 0 then round(agg.dm / agg.pm * 100, 1) end,
         coalesce(vol.u, '[]'::jsonb)
  from core.locations l
  left join agg on agg.root = l.id left join vol on vol.root = l.id
  where l.project_id = p_project and l.deleted_at is null and l.parent_id is not distinct from p_location
    and planfact.in_area(l.id, (select planfact.my_area_nodes(p_project)))
  order by l.sort_order, l.name, l.id;
end $function$;

-- pf_summary_worktypes
CREATE OR REPLACE FUNCTION public.pf_summary_worktypes(p_project uuid)
 RETURNS TABLE(work_type_id uuid, work_name text, units jsonb, positions integer, plan_money numeric, done_money numeric, pct_money numeric, unpriced_rows integer, plan_pct_today numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_money boolean; v_today date := planfact.fact_today(); v_start date; v_finish date; v_ppl numeric;
begin
  v_money := planfact.require_summary_view(p_project);
  select p.planned_start, p.planned_finish into v_start, v_finish from core.projects p where p.id = p_project;
  v_ppl := planfact.plan_pct(v_start, v_finish, v_today);
  return query
  with ft as (select * from planfact.fact_totals(p_project)),
       f7 as (select * from planfact.fact_totals(p_project, v_today - 6, v_today)),
       f14 as (select * from planfact.fact_totals(p_project, v_today - 13, v_today)),
  vol as (
    select p.work_type_id wt, u.code unit, count(*)::int n, sum(ft.plan_qty) plan, sum(ft.fact_qty) fact, sum(f7.fact_qty) q7,
           sum(f14.fact_qty) q14, sum(ft.pending_qty) pend
    from planfact.vor_positions p
    join core.units u on u.id = p.unit_id
    join ft on ft.position_id = p.id join f7 on f7.position_id = p.id join f14 on f14.position_id = p.id
    where p.project_id = p_project group by p.work_type_id, u.code
  ), vw as (
    select vol.wt, sum(vol.n)::int n, jsonb_agg(jsonb_build_object('unit', vol.unit, 'plan', vol.plan, 'fact', vol.fact,
             'pct', case when vol.plan > 0 then round(vol.fact / vol.plan * 100, 1) end, 'rest', greatest(vol.plan - vol.fact, 0),
             'fact7', vol.q7, 'fact14', vol.q14, 'pending', vol.pend,
             'forecast_finish', fc.forecast_finish, 'delta_days', fc.delta_days,
             'dev_pp', case when vol.plan > 0 and v_ppl is not null then round(v_ppl - vol.fact / vol.plan * 100, 1) end) order by vol.unit) units
    from vol cross join lateral planfact.forecast(vol.plan, vol.fact, vol.q14, v_today, v_finish) fc group by vol.wt
  ), mon as (
    select sr.work_type_id wt, sum(sr.plan_qty * sr.price) plan_m, sum(sr.done_qty * sr.price) done_m,
           count(*) filter (where sr.price is null)::int unpriced
    from planfact.summary_rows(p_project, v_today) sr where (select planfact.my_area(p_project)) is null group by sr.work_type_id
  )
  select coalesce(vw.wt, mon.wt), coalesce(w.name, 'Без вида работ'), coalesce(vw.units, '[]'::jsonb), coalesce(vw.n, 0),
         case when v_money then round(coalesce(mon.plan_m, 0), 2) end, case when v_money then round(coalesce(mon.done_m, 0), 2) end,
         case when v_money and mon.plan_m > 0 then round(mon.done_m / mon.plan_m * 100, 1) end, coalesce(mon.unpriced, 0),
         round(v_ppl, 1)
  from vw full join mon on coalesce(mon.wt, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(vw.wt, '00000000-0000-0000-0000-000000000000'::uuid)
  left join core.work_types w on w.id = coalesce(vw.wt, mon.wt)
  order by (coalesce(vw.wt, mon.wt) is null), w.name;
end $function$;

-- pf_summary_attention
CREATE OR REPLACE FUNCTION public.pf_summary_attention(p_project uuid, p_stale_days integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_money boolean; v_today date := planfact.fact_today(); v_kp uuid; v_start date; v_finish date; v_n int; v_res jsonb; v_imports uuid[];
begin
  v_money := planfact.require_summary_view(p_project);
  v_n := least(greatest(coalesce(p_stale_days, 14), 1), 180);
  select st.contract_kp_revision_id, p.planned_start, p.planned_finish into v_kp, v_start, v_finish
  from core.projects p left join planfact.ks2_settings st on st.project_id = p.id where p.id = p_project;
  select e.import_ids into v_imports from planfact.kp_revisions k join planfact.estimates e on e.id = k.estimate_id where k.id = v_kp;
  with sr as materialized (
    select * from planfact.summary_rows(p_project, v_today) where (select planfact.my_area(p_project)) is null
  ), gap as (
    select sr.*, sr.done_qty - sr.issued_qty g, (sr.done_qty - sr.issued_qty) * sr.price gm from sr where sr.done_qty - sr.issued_qty > 0
  ), ft as materialized (
    select * from planfact.fact_totals(p_project)
  ), last_ as (
    select e.position_id, max(e.work_date) d from planfact.fact_entries e
    where e.project_id = p_project and e.status = 'accepted' group by e.position_id
  ), st as (
    select coalesce(v_start, (select min(e.work_date) from planfact.fact_entries e
                    where e.project_id = p_project and e.status = 'accepted')) s
  ), pos as (
    select p.id, w.name wname, planfact.location_path(p.location_id) path, u.code, ft.plan_qty, ft.fact_qty, l.node_type,
           v_today - coalesce(last_.d, st.s) idle
    from planfact.vor_positions p
    join ft on ft.position_id = p.id
    join core.work_types w on w.id = p.work_type_id
    join core.units u on u.id = p.unit_id
    join core.locations l on l.id = p.location_id
    left join last_ on last_.position_id = p.id
    cross join st
    where p.project_id = p_project
  ), stale as (
    select * from pos, st where st.s is not null and st.s <= v_today and pos.fact_qty < pos.plan_qty and pos.idle > v_n
  )
  select jsonb_build_object(
    'stale_days', v_n,
    'counts', jsonb_build_object(
      'no_kp', v_kp is null,
      'no_dates', v_start is null or v_finish is null,
      'gap_rows', (select count(*) from gap),
      'gap_money', case when v_money and v_kp is not null then (select round(coalesce(sum(gm), 0), 2) from gap) end,
      'unpriced_rows', (select count(*) from sr where sr.price is null),
      'stale_positions', (select count(*) from stale),
      'pending_entries', (select count(*) from planfact.fact_entries e join planfact.vor_positions vp on vp.id = e.position_id
                          where e.project_id = p_project and e.status = 'pending_approval' and planfact.in_area(vp.location_id, (select planfact.my_area(p_project))))),
    'gap', coalesce((select jsonb_agg(jsonb_build_object('source_row_id', x.source_row_id, 'number', x.number, 'name', x.name,
                       'unit', x.unit_text, 'qty', round(x.g, 3), 'money', case when v_money then round(x.gm, 2) end) order by x.o)
                     from (select gap.*, row_number() over (order by case when v_money then gap.gm end desc nulls last, gap.g desc, gap.row_no) o
                           from gap) x where x.o <= 20), '[]'::jsonb),
    'unpriced', coalesce((select jsonb_agg(jsonb_build_object('source_row_id', x.source_row_id, 'number', x.number, 'name', x.name,
                            'unit', x.unit_text, 'qty', x.plan_qty) order by x.o)
                          from (select sr.*, row_number() over (order by array_position(v_imports, sr.import_id), sr.row_no) o from sr where sr.price is null) x where x.o <= 20), '[]'::jsonb),
    'stale', coalesce((select jsonb_agg(jsonb_build_object('position_id', x.id, 'work_name', x.wname, 'location_path', x.path,
                         'unit', x.code, 'plan_qty', x.plan_qty, 'fact_qty', x.fact_qty, 'idle_days', x.idle) order by x.o)
                       from (select stale.*, row_number() over (order by stale.idle desc, stale.wname, stale.path) o from stale) x
                       where x.o <= 20), '[]'::jsonb),
    'completeness', jsonb_build_object(
      'rows_total', (select count(*) from sr), 'rows_priced', (select count(*) from sr where sr.price is not null),
      'priced_pct', (select case when count(*) > 0 then round(100.0 * count(*) filter (where sr.price is not null) / count(*), 1) end from sr),
      'dates_pct', case when v_start is not null and v_finish is not null then 100 else 0 end,
      'positions_total', (select count(*) from pos),
      'positions_placed', (select count(*) from pos where pos.node_type in ('section', 'floor', 'apartment')),
      'placed_pct', (select case when count(*) > 0 then round(100.0 * count(*) filter (where pos.node_type in ('section', 'floor', 'apartment')) / count(*), 1) end from pos)))
  into v_res;
  return v_res;
end $function$;

-- pf_summary_portfolio
CREATE OR REPLACE FUNCTION public.pf_summary_portfolio()
 RETURNS TABLE(project_id uuid, name text, code text, planned_start date, planned_finish date, can_money boolean, can_manage boolean, has_kp boolean, plan_money numeric, done_money numeric, issued_money numeric, gap_money numeric, pct_money numeric, pace7 numeric, pace14 numeric, need_pace numeric, days_left integer, forecast_finish date, light text, light_reason text, unpriced_rows integer, positions integer, pending integer, plan_pct_today numeric, lag_pp numeric, lag_days numeric, pace_verdict text, work_days_left integer, light_yellow_pp numeric, light_red_pp numeric, light_overdue_days integer, can_thresholds boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_today date := planfact.fact_today();
begin
  if auth.uid() is null then raise exception 'Нет права видеть сводку' using errcode = '42501'; end if;
  return query
  with pj as (
    select p.id, p.name, p.code, planfact.has_permission(p.id, 'planfact.money.view') m, planfact.has_permission(p.id, 'planfact.projects.manage') g,
           planfact.has_permission(p.id, 'planfact.thresholds.edit') th
    from core.projects p where p.archived_at is null and planfact.has_permission(p.id, 'planfact.fact.view')
  )
  select pj.id, pj.name, pj.code, s.planned_start, s.planned_finish, pj.m, pj.g, s.kp_revision_id is not null,
         case when pj.m then s.plan_money end, case when pj.m then s.done_money end, case when pj.m then s.issued_money end,
         case when pj.m then s.gap_money end, case when pj.m then s.pct_money end, case when pj.m then s.pace7 end,
         case when pj.m then s.pace14 end, case when pj.m then s.need_pace end, s.days_left,
         case when pj.m then s.forecast_finish end, s.light, s.light_reason, s.unpriced_rows,
         (select count(*)::int from planfact.vor_positions_current vp where vp.project_id = pj.id and not vp.withdrawn
            and planfact.in_area(vp.location_id, planfact.my_area(pj.id))),
         (select count(*)::int from planfact.fact_entries e join planfact.vor_positions vp on vp.id = e.position_id
           where e.project_id = pj.id and e.status = 'pending_approval' and planfact.in_area(vp.location_id, planfact.my_area(pj.id))),
         s.plan_pct_today, case when pj.m then s.lag_pp end, case when pj.m then s.lag_days end, s.pace_verdict, s.work_days_left,
         s.light_yellow_pp, s.light_red_pp, s.light_overdue_days, pj.th
  from pj cross join lateral planfact.summary_project(pj.id, v_today) s
  order by pj.name, pj.id;
end $function$;

-- pf_my_inbox
CREATE OR REPLACE FUNCTION public.pf_my_inbox()
 RETURNS TABLE(project_id uuid, name text, code text, pending integer, my_rejected integer, my_rejected_from date, ks2_drafts integer, ks2_gap integer, ks2_gap_money numeric, stale integer, stale_days integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare r record; v_uid uuid := auth.uid(); v_ap boolean; v_cr boolean; v_ke boolean; v_kv boolean; v_mv boolean; v_att jsonb;
begin
  if v_uid is null then raise exception 'Нет доступа' using errcode = '42501'; end if;
  for r in select p.id, p.name, p.code from core.projects p where p.archived_at is null order by p.name, p.id loop
    v_ap := planfact.has_permission(r.id, 'planfact.fact.approve');
    v_cr := planfact.has_permission(r.id, 'planfact.fact.create');
    v_ke := planfact.has_permission(r.id, 'planfact.ks2.edit');
    v_kv := v_ke or planfact.has_permission(r.id, 'planfact.ks2.view');
    v_mv := planfact.has_permission(r.id, 'planfact.money.view');
    -- сводка «Требует внимания» доступна при fact.view (require_summary_view)
    if (v_kv or v_mv) and not planfact.has_permission(r.id, 'planfact.fact.view') then v_kv := false; v_mv := false; end if;
    continue when not (v_ap or v_cr or v_ke or v_kv or v_mv);
    v_att := case when v_kv or v_mv then public.pf_summary_attention(r.id, 14) end;
    project_id := r.id; name := r.name; code := r.code;
    pending := case when v_ap then (select count(*)::int from planfact.fact_entries e join planfact.vor_positions vp on vp.id = e.position_id
                                    where e.project_id = r.id and e.status = 'pending_approval' and planfact.in_area(vp.location_id, planfact.my_area(r.id))) end;
    my_rejected := null; my_rejected_from := null;
    if v_cr then
      select count(*)::int, min(e.work_date) into my_rejected, my_rejected_from from planfact.fact_entries e
      where e.project_id = r.id and e.status = 'rejected' and e.created_by = v_uid
        and not exists (select 1 from planfact.fact_entries n
                        where n.position_id = e.position_id and n.created_by = v_uid and n.id <> e.id and n.created_at >= e.decided_at);
    end if;
    ks2_drafts := case when v_ke then (select count(*)::int from planfact.ks2_acts a
                                       where a.project_id = r.id and a.status = 'draft') end;
    ks2_gap := case when v_kv then (v_att -> 'counts' ->> 'gap_rows')::int end;
    ks2_gap_money := case when v_kv and v_mv then (v_att -> 'counts' ->> 'gap_money')::numeric end;
    stale := case when v_mv then (v_att -> 'counts' ->> 'stale_positions')::int end;
    stale_days := case when v_mv then (v_att ->> 'stale_days')::int end;
    return next;
  end loop;
end $function$;

-- fact_guard
CREATE OR REPLACE FUNCTION planfact.fact_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'Запись факта удалять нельзя — исправьте её с причиной' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if coalesce(current_setting('planfact.fact_tx', true), '') <> '1' then
      raise exception 'Факт вносится только через функции платформы' using errcode = '42501';
    end if;
    if not exists (select 1 from planfact.vor_positions p where p.id = new.position_id
                   and p.project_id = new.project_id and p.company_id = new.company_id) then
      raise exception 'Позиция не принадлежит проекту' using errcode = '22023';
    end if;
    if not exists (select 1 from planfact.brigades b where b.id = new.brigade_id and b.company_id = new.company_id) then
      raise exception 'Бригада не принадлежит компании' using errcode = '22023';
    end if;
    return new;
  end if;
  -- UPDATE
  if coalesce(current_setting('planfact.fact_tx', true), '') <> '1' then
    raise exception 'Запись факта изменять нельзя — исправьте её с причиной' using errcode = '42501';
  end if;
  if (new.id, new.company_id, new.project_id, new.position_id, new.brigade_id, new.work_date, new.qty, new.workers, new.man_hours,
      new.note, new.corrects_id, new.correction_reason, new.batch_id, new.created_by, new.created_at, new.period_from, new.on_behalf_of)
     is distinct from
     (old.id, old.company_id, old.project_id, old.position_id, old.brigade_id, old.work_date, old.qty, old.workers, old.man_hours,
      old.note, old.corrects_id, old.correction_reason, old.batch_id, old.created_by, old.created_at, old.period_from, old.on_behalf_of) then
    raise exception 'Объём, дату и бригаду записи факта изменять нельзя' using errcode = '42501';
  end if;
  if old.status in ('rejected', 'superseded') and new.status is distinct from old.status then
    raise exception 'Закрытую запись факта изменять нельзя' using errcode = '42501';
  end if;
  return new;
end $function$;

-- fact_insert
CREATE OR REPLACE FUNCTION planfact.fact_insert(p_company uuid, p_project uuid, p_position uuid, p_brigade uuid, p_date date, p_qty numeric, p_workers integer, p_man_hours numeric, p_note text, p_batch uuid, p_corrects uuid, p_reason text, p_period_from date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_pos planfact.vor_positions; v_tol numeric; v_qty numeric := round(p_qty, 3); v_sum numeric; v_old planfact.fact_entries;
        v_status text; v_id uuid; v_from date := p_period_from; v_plan numeric; v_withdrawn boolean;
        v_behalf uuid := nullif(current_setting('planfact.on_behalf', true), '')::uuid;
begin
  select * into v_pos from planfact.vor_positions where id = p_position and project_id = p_project for update;
  if v_pos.id is null then raise exception 'Позиция не найдена в проекте' using errcode = '22023'; end if;
  -- P2-0048: область и «ответственный за факт» (исправление — по прежним правилам автора / РП, но место — в области)
  perform planfact.require_fact_place(p_project, v_pos.location_id, v_behalf, p_corrects is not null);
  select case when c.withdrawn then 0 else c.qty end, c.withdrawn into v_plan, v_withdrawn
  from planfact.vor_positions_current c where c.id = p_position;
  if v_withdrawn and p_corrects is null then
    raise exception 'Позиция снята в новой редакции ВОР — вносите факт на действующую позицию' using errcode = '22023';
  end if;
  if p_brigade is null or not exists (select 1 from planfact.brigades b where b.id = p_brigade and b.company_id = p_company) then
    raise exception 'Укажите бригаду' using errcode = '22023';
  end if;
  if not exists (select 1 from planfact.brigades b where b.id = p_brigade and b.archived_at is null) then
    raise exception 'Бригада в архиве — выберите действующую' using errcode = '22023';
  end if;
  if v_qty is null or v_qty <= 0 then raise exception 'Объём должен быть больше нуля' using errcode = '22023'; end if;
  if p_date is null then raise exception 'Укажите дату' using errcode = '22023'; end if;
  if p_date > planfact.fact_today() then raise exception 'Дата не может быть в будущем' using errcode = '22023'; end if;
  if p_workers is not null and (p_workers < 0 or p_workers > 10000) then raise exception 'Неверное число людей' using errcode = '22023'; end if;
  if p_man_hours is not null and (p_man_hours < 0 or p_man_hours > 1000000) then raise exception 'Неверное число чел.-ч' using errcode = '22023'; end if;

  select fact_tolerance_pct into v_tol from core.projects where id = p_project;
  select coalesce(sum(qty), 0) into v_sum from planfact.fact_entries where position_id = p_position and status = 'accepted';
  if p_corrects is not null then
    select * into v_old from planfact.fact_entries where id = p_corrects;
    if v_old.status = 'accepted' then v_sum := v_sum - v_old.qty; end if;
    v_from := coalesce(v_from, v_old.period_from);
  end if;
  if v_from is not null then
    if v_from > p_date then raise exception 'Начало периода позже конца' using errcode = '22023'; end if;
    if p_date - v_from > 30 then raise exception 'Период — не больше 31 дня' using errcode = '22023'; end if;
  end if;
  -- Исправление, не увеличивающее прежний объём записи, подтверждения не требует (перебор уже согласован или уменьшается).
  v_status := case when v_sum + v_qty > v_plan * (1 + v_tol / 100) and not (p_corrects is not null and v_qty <= v_old.qty)
                   then 'pending_approval' else 'accepted' end;

  perform set_config('planfact.fact_tx', '1', true);
  insert into planfact.fact_entries(company_id, project_id, position_id, brigade_id, work_date, qty, workers, man_hours, note,
                                    status, corrects_id, correction_reason, batch_id, period_from, on_behalf_of)
  values (p_company, p_project, p_position, p_brigade, p_date, v_qty, p_workers, p_man_hours, nullif(btrim(coalesce(p_note, '')), ''),
          v_status, p_corrects, nullif(btrim(coalesce(p_reason, '')), ''), p_batch, v_from, v_behalf)
  returning id into v_id;
  -- Исправление, не требующее подтверждения, сразу заменяет старую запись.
  if p_corrects is not null and v_status = 'accepted' and v_old.status in ('accepted', 'pending_approval') then
    update planfact.fact_entries set status = 'superseded', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_reason), '')
    where id = p_corrects;
  end if;
  perform set_config('planfact.fact_tx', '0', true);
  perform planfact.log_admin_change(p_company, p_project, 'fact_entries', v_id, case when p_corrects is null then 'INSERT' else 'CORRECT' end,
    case when p_corrects is not null then jsonb_build_object('entry', p_corrects, 'qty', v_old.qty) end,
    jsonb_build_object('position_id', p_position, 'qty', v_qty, 'status', v_status, 'work_date', p_date, 'batch_id', p_batch,
                       'reason', nullif(btrim(coalesce(p_reason, '')), '')) || case when v_behalf is not null then jsonb_build_object('on_behalf_of', v_behalf) else '{}'::jsonb end || case when v_from is not null then jsonb_build_object('period_from', v_from) else '{}'::jsonb end);
  return jsonb_build_object('id', v_id, 'status', v_status);
exception when others then
  perform set_config('planfact.fact_tx', '0', true);
  raise;
end $function$;

-- require_fact_create
CREATE OR REPLACE FUNCTION planfact.require_fact_create(p_project uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_company uuid; v_arch timestamptz;
begin
  if p_project is null or auth.uid() is null or not (planfact.has_permission(p_project, 'planfact.fact.create')
       or (nullif(current_setting('planfact.on_behalf', true), '') is not null and planfact.has_permission(p_project, 'planfact.fact.approve'))) then
    raise exception 'Нет права вносить факт' using errcode = '42501';
  end if;
  select company_id, archived_at into v_company, v_arch from core.projects where id = p_project;
  if v_arch is not null then
    raise exception 'Проект в архиве — сначала верните его из архива' using errcode = '22023';
  end if;
  return v_company;
end $function$;

-- pf_fact_history
DROP FUNCTION public.pf_fact_history(uuid);
CREATE FUNCTION public.pf_fact_history(p_position uuid)
 RETURNS TABLE(id uuid, status text, qty numeric, work_date date, brigade_name text, workers integer, man_hours numeric, note text, corrects_id uuid, correction_reason text, batch_id uuid, created_by_email text, created_at timestamp with time zone, decided_by_email text, decided_at timestamp with time zone, decision_note text, period_from date, on_behalf_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_project uuid;
begin
  select p.project_id into v_project from planfact.vor_positions p where p.id = p_position;
  if v_project is null or auth.uid() is null or not planfact.has_permission(v_project, 'planfact.fact.view')
     or not planfact.in_area((select p.location_id from planfact.vor_positions p where p.id = p_position), planfact.my_area(v_project)) then
    raise exception 'Нет права видеть факт' using errcode = '42501';
  end if;
  return query
  select e.id, e.status, e.qty, e.work_date, b.name, e.workers, e.man_hours, e.note, e.corrects_id, e.correction_reason, e.batch_id,
         cu.email::text, e.created_at, du.email::text, e.decided_at, e.decision_note, e.period_from, bu.email::text
  from planfact.fact_entries e
  join planfact.brigades b on b.id = e.brigade_id
  left join auth.users cu on cu.id = e.created_by
  left join auth.users du on du.id = e.decided_by
  left join auth.users bu on bu.id = e.on_behalf_of
  where e.position_id = p_position
  order by e.created_at desc, e.id desc;
end $function$;

-- pf_fact_journal
DROP FUNCTION public.pf_fact_journal(uuid, date, date, integer);
CREATE FUNCTION public.pf_fact_journal(p_project uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_limit integer DEFAULT 2000)
 RETURNS TABLE(id uuid, position_id uuid, location_path text, work_name text, unit_code text, qty numeric, work_date date, brigade_name text, workers integer, man_hours numeric, note text, status text, corrects_id uuid, correction_reason text, batch_id uuid, created_by_email text, created_at timestamp with time zone, decided_by_email text, decided_at timestamp with time zone, decision_note text, period_from date, on_behalf_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.fact.view') then
    raise exception 'Нет права видеть факт' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'Начало периода позже конца' using errcode = '22023';
  end if;
  return query
  select e.id, e.position_id, planfact.location_path(p.location_id), w.name, u.code, e.qty, e.work_date, b.name, e.workers,
         e.man_hours, e.note, e.status, e.corrects_id, e.correction_reason, e.batch_id, cu.email::text, e.created_at,
         du.email::text, e.decided_at, e.decision_note, e.period_from, bu.email::text
  from planfact.fact_entries e
  join planfact.vor_positions p on p.id = e.position_id
  join core.work_types w on w.id = p.work_type_id
  join core.units u on u.id = p.unit_id
  join planfact.brigades b on b.id = e.brigade_id
  left join auth.users cu on cu.id = e.created_by
  left join auth.users du on du.id = e.decided_by
  left join auth.users bu on bu.id = e.on_behalf_of
  where e.project_id = p_project and planfact.in_area(p.location_id, (select planfact.my_area(p_project)))
    and (p_from is null or e.work_date >= p_from) and (p_to is null or e.work_date <= p_to)
  order by e.work_date desc, e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 2000), 1), 5000);
end $function$;

-- pf_list_company_members
DROP FUNCTION public.pf_list_company_members(uuid);
CREATE FUNCTION public.pf_list_company_members(p_company uuid)
 RETURNS TABLE(user_id uuid, email text, assignment_id uuid, role_id uuid, role_name text, project_id uuid, project_name text, valid_from timestamp with time zone, valid_to timestamp with time zone, is_active boolean, counterparty_id uuid, counterparty_name text, full_name text, disabled_at timestamp with time zone, must_change_password boolean, managed boolean, quality_objects jsonb, location_id uuid, location_path text, fact_owner boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
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
              from unnest(a.quality_objects) with ordinality x(id, n)) end,
         a.location_id, case when a.location_id is not null then planfact.location_path(a.location_id) end, coalesce(a.fact_owner, false)
  from core.company_members m
  left join auth.users u on u.id = m.user_id
  left join core.user_profiles up on up.user_id = m.user_id
  left join core.role_assignments a on a.company_id = m.company_id and a.user_id = m.user_id and a.revoked_at is null
  left join core.company_roles r on r.id = a.role_id
  left join core.projects p on p.id = a.project_id
  left join core.counterparties c on c.id = a.counterparty_id
  where m.company_id = p_company
  order by (m.disabled_at is not null), coalesce(up.full_name, u.email::text), r.name, p.name nulls first, planfact.location_path(a.location_id) nulls first;
end $function$;

-- 5. Участие: пакетное назначение и «Изменить область» (одна функция). Для каждого сотрудника набор действующих назначений
--    (сотрудник, роль, проект) приводится к выбранной области: новые места — добавляются, прежние — меняются (ответственный,
--    срок, объекты Качества, фирма) без отзыва, лишние — отзываются; всё — в журнал.
create function public.pf_set_participation(p_users uuid[], p_role uuid, p_project uuid default null, p_locations uuid[] default null,
  p_fact_owner boolean default false, p_valid_to timestamptz default null, p_objects text[] default null, p_counterparty uuid default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
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
  select bool_or(rp.action like 'quality.%' or rp.action like 'construction.%'), bool_or(rp.action like 'planfact.%') into v_q, v_pf
    from core.company_role_permissions rp where rp.role_id = p_role and rp.company_id = v_company;
  if p_project is not null and coalesce(v_q, false) and not coalesce(v_pf, false) then
    raise exception 'Роль Качества назначается на всю компанию — с выбором объектов Качества' using errcode = '22023';
  end if;
  -- объекты Качества: назначение на компанию — выбранные (пусто — все); на проект — объекты Качества этого проекта (мост)
  v_objs := array(select distinct btrim(x) from unnest(coalesce(p_objects, '{}')) x where nullif(btrim(coalesce(x, '')), '') is not null order by 1);
  if cardinality(v_objs) = 0 then v_objs := null; end if;
  if v_objs is not null and p_project is not null then
    raise exception 'Объекты Качества выбираются при назначении на всю компанию' using errcode = '22023';
  end if;
  if v_objs is not null and exists (select 1 from unnest(v_objs) x where not exists (
       select 1 from quality.project_objects o where o.core_company_id = v_company and o.id = x
          and not coalesce(o.is_deleted, false) and not coalesce(o._deleted, false) and o.deleted_at is null)) then
    raise exception 'Объект не найден среди объектов Качества компании' using errcode = '22023';
  end if;
  if p_project is not null then
    v_objs := (select array_agg(o.id order by o.id) from quality.project_objects o
                where o.core_company_id = v_company and o.core_object_id = p_project
                  and not coalesce(o.is_deleted, false) and not coalesce(o._deleted, false) and o.deleted_at is null);
  end if;

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
end $$;

-- Моя область в проекте (для экранов): весь проект или узлы; где я отвечаю за факт; могу ли вносить «за кого».
create function public.pf_my_area(p_project uuid)
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
    'can_on_behalf', planfact.has_permission(p_project, 'planfact.fact.approve'));
end $$;

-- Ответственные за факт по месту — для выбора «за кого» (только тот, кто подтверждает факт).
create function public.pf_place_fact_owners(p_location uuid)
returns table(user_id uuid, full_name text, email text) language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
declare v_project uuid;
begin
  select l.project_id into v_project from core.locations l where l.id = p_location and l.deleted_at is null;
  if v_project is null or auth.uid() is null or not planfact.has_permission(v_project, 'planfact.fact.approve') then
    raise exception 'Нет права вносить факт «за кого»' using errcode = '42501';
  end if;
  return query
  select o.id, up.full_name, u.email::text
    from unnest(planfact.place_fact_owners(v_project, p_location)) o(id)
    left join core.user_profiles up on up.user_id = o.id left join auth.users u on u.id = o.id
   order by coalesce(nullif(btrim(up.full_name), ''), u.email::text), o.id;
end $$;

-- Ввод факта «за кого» (РП за ответственного): те же pf_fact_add / pf_fact_add_batch, «за кого» — на время вызова.
create function public.pf_fact_add_for(p_on_behalf uuid, p_position uuid, p_brigade uuid, p_date date, p_qty numeric,
  p_workers integer default null, p_man_hours numeric default null, p_note text default null, p_period_from date default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_res jsonb;
begin
  if p_on_behalf is null then raise exception 'Укажите, за кого вносится факт' using errcode = '22023'; end if;
  perform set_config('planfact.on_behalf', p_on_behalf::text, true);
  v_res := public.pf_fact_add(p_position, p_brigade, p_date, p_qty, p_workers, p_man_hours, p_note, p_period_from);
  perform set_config('planfact.on_behalf', '', true);
  return v_res;
exception when others then
  perform set_config('planfact.on_behalf', '', true);
  raise;
end $$;

create function public.pf_fact_add_batch_for(p_on_behalf uuid, p_project uuid, p_brigade uuid, p_date date, p_items jsonb,
  p_workers integer default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_res jsonb;
begin
  if p_on_behalf is null then raise exception 'Укажите, за кого вносится факт' using errcode = '22023'; end if;
  perform set_config('planfact.on_behalf', p_on_behalf::text, true);
  v_res := public.pf_fact_add_batch(p_project, p_brigade, p_date, p_items, p_workers, p_note, false);
  perform set_config('planfact.on_behalf', '', true);
  return v_res;
exception when others then
  perform set_config('planfact.on_behalf', '', true);
  raise;
end $$;

-- 6. Правила строк: позиции, факт и изменения позиций — только своя область.
alter policy vor_positions_select on planfact.vor_positions
  using (planfact.is_project_member(project_id) and planfact.in_area(location_id, planfact.my_area(project_id)));
alter policy fact_entries_select on planfact.fact_entries
  using (planfact.has_permission(project_id, 'planfact.fact.view'::text)
         and planfact.in_area(planfact.position_location(position_id), planfact.my_area(project_id)));
alter policy vor_position_events_select on planfact.vor_position_events
  using (planfact.is_project_member(project_id) and planfact.in_area(planfact.position_location(position_id), planfact.my_area(project_id)));

-- 7. Права на функции: служебные — никому (кроме тех, что нужны правилам строк); pf_* — только authenticated.
revoke all on function planfact.my_area_nodes(uuid), planfact.place_fact_owners(uuid, uuid), planfact.require_fact_place(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function planfact.my_area(uuid), planfact.in_area(uuid, uuid[]), planfact.position_location(uuid) from public, anon;
grant execute on function planfact.my_area(uuid), planfact.in_area(uuid, uuid[]), planfact.position_location(uuid) to authenticated;
revoke all on function public.pf_set_participation(uuid[], uuid, uuid, uuid[], boolean, timestamptz, text[], uuid), public.pf_my_area(uuid),
  public.pf_place_fact_owners(uuid), public.pf_fact_add_for(uuid, uuid, uuid, date, numeric, integer, numeric, text, date),
  public.pf_fact_add_batch_for(uuid, uuid, uuid, date, jsonb, integer, text), public.pf_fact_history(uuid),
  public.pf_fact_journal(uuid, date, date, integer), public.pf_list_company_members(uuid) from public, anon;
grant execute on function public.pf_set_participation(uuid[], uuid, uuid, uuid[], boolean, timestamptz, text[], uuid), public.pf_my_area(uuid),
  public.pf_place_fact_owners(uuid), public.pf_fact_add_for(uuid, uuid, uuid, date, numeric, integer, numeric, text, date),
  public.pf_fact_add_batch_for(uuid, uuid, uuid, date, jsonb, integer, text), public.pf_fact_history(uuid),
  public.pf_fact_journal(uuid, date, date, integer), public.pf_list_company_members(uuid) to authenticated;

commit;
