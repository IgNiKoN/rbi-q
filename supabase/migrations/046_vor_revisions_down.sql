-- Откат P2-0006b (046): редакции ВОР убираются, функции — как до 046 (текст побайтно).
-- Только пока нет ни одной новой редакции (№2 и дальше): иначе позиции новой редакции и снятые позиции смешаются.
begin;

do $$
begin
  if to_regclass('planfact.vor_heads') is null then raise exception '046 не применена' using errcode = 'P0001'; end if;
  if exists (select 1 from planfact.vor_imports where previous_import_id is not null)
     or exists (select 1 from planfact.vor_position_events) then
    raise exception 'Есть новые редакции ВОР — откат 046 потеряет данные; сначала выгрузите и согласуйте' using errcode = 'P0001';
  end if;
end $$;

drop function public.pf_vor_revision_changes(uuid);
drop function public.pf_vor_accept_revision(uuid, jsonb, jsonb);
drop function public.pf_vor_revision_base(uuid);
drop function public.pf_vor_create_revision(uuid, text, text, text, uuid, jsonb);

drop function public.pf_vor_list_imports(uuid);
CREATE FUNCTION public.pf_vor_list_imports(p_project uuid)
 RETURNS TABLE(id uuid, file_name text, sheet_name text, status text, row_count integer, works integer, positions integer, created_at timestamp with time zone, created_by_email text, confirmed_at timestamp with time zone, profile_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
begin
  if p_project is null or auth.uid() is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  return query
  select i.id, i.file_name, i.sheet_name, i.status, i.row_count,
         (select count(*)::int from planfact.vor_source_rows s where s.import_id = i.id and s.kind = 'work'),
         (select count(*)::int from planfact.vor_positions p where p.import_id = i.id),
         i.created_at, u.email::text, i.confirmed_at, i.profile_id
  from planfact.vor_imports i left join auth.users u on u.id = i.created_by
  where i.project_id = p_project
  order by i.created_at desc;
end $function$;
revoke all on function public.pf_vor_list_imports(uuid) from public, anon;
grant execute on function public.pf_vor_list_imports(uuid) to authenticated;

drop function public.pf_vor_positions(uuid, uuid);
CREATE FUNCTION public.pf_vor_positions(p_project uuid, p_location uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, location_id uuid, location_path text, work_type_id uuid, work_type text, unit_code text, qty numeric, apartments_note text, import_id uuid, file_name text, source_row_no integer)
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
  select p.id, p.location_id, planfact.location_path(p.location_id), p.work_type_id, w.name, u.code, p.qty, p.apartments_note,
         p.import_id, i.file_name, (select min(s.row_no) from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id where l.position_id = p.id)
  from planfact.vor_positions p
  join core.work_types w on w.id = p.work_type_id
  join core.units u on u.id = p.unit_id
  join planfact.vor_imports i on i.id = p.import_id
  where p.project_id = p_project and (p_location is null or p.location_id in (select sub.id from sub))
  order by planfact.location_path(p.location_id), w.name, p.id;
end $function$;
revoke all on function public.pf_vor_positions(uuid, uuid) from public, anon;
grant execute on function public.pf_vor_positions(uuid, uuid) to authenticated;

drop function public.pf_fact_positions(uuid, uuid);
CREATE FUNCTION public.pf_fact_positions(p_project uuid, p_location uuid DEFAULT NULL::uuid)
 RETURNS TABLE(position_id uuid, location_id uuid, location_path text, location_type text, work_type_id uuid, work_name text, unit_code text, plan_qty numeric, fact_qty numeric, pending_qty numeric, pending_count integer, last_rejected_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.fact.view') then
    raise exception 'Нет права видеть факт' using errcode = '42501';
  end if;
  if p_location is not null and not exists (select 1 from core.locations l where l.id = p_location and l.project_id = p_project and l.deleted_at is null) then
    raise exception 'Место не найдено' using errcode = '22023';
  end if;
  return query
  with recursive sub as (
    select l.id from core.locations l where l.project_id = p_project and l.deleted_at is null
      and ((p_location is null and l.parent_id is null) or l.id = p_location)
    union all
    select c.id from core.locations c join sub s on c.parent_id = s.id where c.deleted_at is null
  )
  select p.id, p.location_id, planfact.location_path(p.location_id), l.node_type, p.work_type_id, w.name, u.code,
         t.plan_qty, t.fact_qty, t.pending_qty, t.pending_count,
         (select e.decision_note from planfact.fact_entries e where e.position_id = p.id and e.status = 'rejected'
            order by e.decided_at desc, e.id desc limit 1)
  from planfact.vor_positions p
  join sub on sub.id = p.location_id
  join core.locations l on l.id = p.location_id
  join core.work_types w on w.id = p.work_type_id
  join core.units u on u.id = p.unit_id
  join planfact.fact_totals(p_project) t on t.position_id = p.id
  where p.project_id = p_project
  order by l.depth, l.sort_order, l.name, w.name, p.id;
end $function$;
revoke all on function public.pf_fact_positions(uuid, uuid) from public, anon;
grant execute on function public.pf_fact_positions(uuid, uuid) to authenticated;

drop function public.pf_summary_positions(uuid, uuid);
CREATE FUNCTION public.pf_summary_positions(p_project uuid, p_work_type uuid DEFAULT NULL::uuid)
 RETURNS TABLE(position_id uuid, location_id uuid, location_path text, work_type_id uuid, work_name text, unit_code text, plan_qty numeric, fact_qty numeric, pct numeric, rest_qty numeric, fact7 numeric, fact14 numeric, pending_qty numeric, forecast_finish date, delta_days integer, plan_pct_today numeric, dev_pp numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_today date := planfact.fact_today(); v_start date; v_finish date; v_ppl numeric;
begin
  perform planfact.require_summary_view(p_project);
  select p.planned_start, p.planned_finish into v_start, v_finish from core.projects p where p.id = p_project;
  v_ppl := planfact.plan_pct(v_start, v_finish, v_today);
  return query
  with ft as (select * from planfact.fact_totals(p_project)),
       f7 as (select * from planfact.fact_totals(p_project, v_today - 6, v_today)),
       f14 as (select * from planfact.fact_totals(p_project, v_today - 13, v_today))
  select p.id, p.location_id, planfact.location_path(p.location_id), p.work_type_id, w.name, u.code, ft.plan_qty, ft.fact_qty,
         case when ft.plan_qty > 0 then round(ft.fact_qty / ft.plan_qty * 100, 1) end, greatest(ft.plan_qty - ft.fact_qty, 0),
         f7.fact_qty, f14.fact_qty, ft.pending_qty, fc.forecast_finish, fc.delta_days, round(v_ppl, 1),
         case when ft.plan_qty > 0 and v_ppl is not null then round(v_ppl - ft.fact_qty / ft.plan_qty * 100, 1) end
  from planfact.vor_positions p
  join core.locations l on l.id = p.location_id
  join core.work_types w on w.id = p.work_type_id
  join core.units u on u.id = p.unit_id
  join ft on ft.position_id = p.id join f7 on f7.position_id = p.id join f14 on f14.position_id = p.id
  cross join lateral planfact.forecast(ft.plan_qty, ft.fact_qty, f14.fact_qty, v_today, v_finish) fc
  where p.project_id = p_project and (p_work_type is null or p.work_type_id = p_work_type)
  order by w.name, l.depth, l.sort_order, l.name, p.id;
end $function$;
revoke all on function public.pf_summary_positions(uuid, uuid) from public, anon;
grant execute on function public.pf_summary_positions(uuid, uuid) to authenticated;

CREATE OR REPLACE FUNCTION planfact.fact_totals(p_project uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(position_id uuid, plan_qty numeric, fact_qty numeric, pending_qty numeric, pending_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
  select p.id, p.qty,
         coalesce(sum(e.qty) filter (where e.status = 'accepted'), 0),
         coalesce(sum(e.qty) filter (where e.status = 'pending_approval'), 0),
         (count(e.id) filter (where e.status = 'pending_approval'))::int
  from planfact.vor_positions p
  left join planfact.fact_entries e on e.position_id = p.id and e.project_id = p_project
       and (p_from is null or e.work_date >= p_from) and (p_to is null or e.work_date <= p_to)
  where p.project_id = p_project
  group by p.id, p.qty;
$function$;

CREATE OR REPLACE FUNCTION planfact.fact_insert(p_company uuid, p_project uuid, p_position uuid, p_brigade uuid, p_date date, p_qty numeric, p_workers integer, p_man_hours numeric, p_note text, p_batch uuid, p_corrects uuid, p_reason text, p_period_from date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_pos planfact.vor_positions; v_tol numeric; v_qty numeric := round(p_qty, 3); v_sum numeric; v_old planfact.fact_entries;
        v_status text; v_id uuid; v_from date := p_period_from;
begin
  select * into v_pos from planfact.vor_positions where id = p_position and project_id = p_project for update;
  if v_pos.id is null then raise exception 'Позиция не найдена в проекте' using errcode = '22023'; end if;
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
  v_status := case when v_sum + v_qty > v_pos.qty * (1 + v_tol / 100) and not (p_corrects is not null and v_qty <= v_old.qty)
                   then 'pending_approval' else 'accepted' end;

  perform set_config('planfact.fact_tx', '1', true);
  insert into planfact.fact_entries(company_id, project_id, position_id, brigade_id, work_date, qty, workers, man_hours, note,
                                    status, corrects_id, correction_reason, batch_id, period_from)
  values (p_company, p_project, p_position, p_brigade, p_date, v_qty, p_workers, p_man_hours, nullif(btrim(coalesce(p_note, '')), ''),
          v_status, p_corrects, nullif(btrim(coalesce(p_reason, '')), ''), p_batch, v_from)
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
                       'reason', nullif(btrim(coalesce(p_reason, '')), '')) || case when v_from is not null then jsonb_build_object('period_from', v_from) else '{}'::jsonb end);
  return jsonb_build_object('id', v_id, 'status', v_status);
exception when others then
  perform set_config('planfact.fact_tx', '0', true);
  raise;
end $function$;

CREATE OR REPLACE FUNCTION public.pf_vor_confirm(p_import uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_i planfact.vor_imports; v_open int; v_n int; v_diff int; r record; v_pos uuid;
begin
  v_i := planfact.require_vor_draft(p_import);
  select count(*) into v_open from planfact.vor_source_rows
  where import_id = p_import and kind = 'work'
    and (location_id is null or work_type_id is null or unit_id is null or qty is null or qty < 0 or match is distinct from 'green');
  if v_open > 0 then
    raise exception 'Не разобрано строк-работ: % (место, вид работ, ЕИ, объём или неподтверждённый цвет)', v_open using errcode = '22023';
  end if;
  select count(*) into v_n from planfact.vor_source_rows where import_id = p_import and kind = 'work';
  if v_n = 0 then raise exception 'В загрузке нет строк-работ' using errcode = '22023'; end if;
  for r in select * from planfact.vor_source_rows where import_id = p_import and kind = 'work' order by row_no loop
    insert into planfact.vor_positions(company_id, project_id, import_id, location_id, work_type_id, unit_id, qty, apartments_note, status)
    values (v_i.company_id, v_i.project_id, p_import, r.location_id, r.work_type_id, r.unit_id, r.qty,
            nullif(concat_ws(' · ',
              case when (r.context -> 'floor' ->> 'from') is distinct from (r.context -> 'floor' ->> 'to')
                   then 'эт. ' || (r.context -> 'floor' ->> 'from') || '–' || (r.context -> 'floor' ->> 'to') end,
              nullif(r.context ->> 'apartments', '')), ''),
            'confirmed')
    returning id into v_pos;
    insert into planfact.vor_links(project_id, source_row_id, position_id, share) values (v_i.project_id, r.id, v_pos, 1);
  end loop;
  select count(*) into v_diff from planfact.vor_source_rows s
  where s.import_id = p_import and s.kind = 'work'
    and s.qty is distinct from (select sum(p.qty * l.share) from planfact.vor_links l join planfact.vor_positions p on p.id = l.position_id
                                where l.source_row_id = s.id);
  if v_diff > 0 then raise exception 'Сумма позиций не сходится с объёмом строки заказчика: % строк', v_diff using errcode = '22023'; end if;
  update planfact.vor_imports set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_import;
  perform planfact.log_admin_change(v_i.company_id, v_i.project_id, 'vor_imports', v_i.id, 'UPDATE',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'confirmed', 'positions', v_n, 'file_name', v_i.file_name));
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.pf_estimate_create(p_project uuid, p_name text, p_imports uuid[], p_area numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_company uuid; v_id uuid; v_name text := btrim(coalesce(p_name, '')); v_tpl uuid; v_bad int; v_imports uuid[];
begin
  v_company := planfact.require_estimate_manage(p_project);
  if v_name = '' or length(v_name) > 300 then raise exception 'Введите название сметы' using errcode = '22023'; end if;
  select array_agg(distinct x) into v_imports from unnest(coalesce(p_imports, '{}')) x where x is not null;
  if v_imports is null or cardinality(v_imports) > 20 then raise exception 'Выберите от 1 до 20 загрузок ВОР' using errcode = '22023'; end if;
  select count(*) into v_bad from unnest(v_imports) x
  where not exists (select 1 from planfact.vor_imports i where i.id = x and i.project_id = p_project and i.status = 'confirmed');
  if v_bad > 0 then raise exception 'Смета строится только по подтверждённым загрузкам ВОР этого проекта' using errcode = '22023'; end if;
  if p_area is not null and (p_area <= 0 or p_area >= 1e9) then raise exception 'Площадь — положительное число' using errcode = '22023'; end if;
  insert into planfact.estimates(company_id, project_id, name, import_ids, area_m2)
  values (v_company, p_project, v_name, v_imports, p_area) returning id into v_id;
  insert into planfact.estimate_rows(estimate_id, project_id, source_row_id)
  select v_id, p_project, s.id from planfact.vor_source_rows s
  where s.import_id = any(v_imports) and s.kind in ('work', 'material');
  perform planfact.estimate_fill_reference(v_id, v_company, null);
  v_tpl := planfact.ensure_overhead_template(v_company);
  insert into planfact.estimate_overheads(estimate_id, project_id, sort, key, section, name, comment, method, base, params, in_total)
  select v_id, p_project, sort, key, section, name, comment, method, base, params, in_total
  from planfact.overhead_lines where template_id = v_tpl;
  perform planfact.log_admin_change(v_company, p_project, 'estimates', v_id, 'INSERT', null,
    jsonb_build_object('name', v_name, 'import_ids', to_jsonb(v_imports), 'area_m2', p_area));
  return v_id;
end $function$;

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
         coalesce(agg.n, 0), (select count(*)::int from planfact.vor_positions vp where vp.project_id = p_project and vp.location_id = l.id),
         case when v_money and v_kp is not null then round(coalesce(agg.pm, 0), 2) end,
         case when v_money and v_kp is not null then round(coalesce(agg.dm, 0), 2) end,
         case when v_money and agg.pm > 0 then round(agg.dm / agg.pm * 100, 1) end,
         coalesce(vol.u, '[]'::jsonb)
  from core.locations l
  left join agg on agg.root = l.id left join vol on vol.root = l.id
  where l.project_id = p_project and l.deleted_at is null and l.parent_id is not distinct from p_location
  order by l.sort_order, l.name, l.id;
end $function$;

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
         (select count(*)::int from planfact.vor_positions vp where vp.project_id = pj.id),
         (select count(*)::int from planfact.fact_entries e where e.project_id = pj.id and e.status = 'pending_approval'),
         s.plan_pct_today, case when pj.m then s.lag_pp end, case when pj.m then s.lag_days end, s.pace_verdict, s.work_days_left,
         s.light_yellow_pp, s.light_red_pp, s.light_overdue_days, pj.th
  from pj cross join lateral planfact.summary_project(pj.id, v_today) s
  order by pj.name, pj.id;
end $function$;

drop view planfact.vor_positions_current;
drop table planfact.vor_position_events;
drop function planfact.vor_events_guard();
drop table planfact.vor_heads;
drop index planfact.vor_imports_chain_revision;
drop index planfact.vor_imports_one_draft_per_previous;
alter table planfact.vor_imports
  drop constraint vor_imports_root_fkey,
  drop constraint vor_imports_previous_fkey,
  drop constraint vor_imports_revision_chain_chk,
  drop constraint vor_imports_revision_no_chk,
  drop column root_import_id,
  drop column previous_import_id,
  drop column revision_no;

commit;
