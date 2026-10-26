-- P2-0022: откат 030_fact_period_forecast_up.sql — функции факта и сводки как до 030 (тела 009 / 011 / 028 после 016,
-- побайтно по pg_get_functiondef), удалить planfact.forecast и колонку fact_entries.period_from.
-- Если есть записи «за период» — отказ (данные периода не теряются молча): сначала решение владельца.
begin;

do $$
begin
  if to_regprocedure('planfact.forecast(numeric,numeric,numeric,date,date)') is null then
    raise exception '030 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
  if exists (select 1 from planfact.fact_entries where period_from is not null) then
    raise exception '030: есть записи факта «за период» — откат удалил бы их период; сначала решение владельца' using errcode = 'P0001';
  end if;
end $$;

drop function public.pf_summary_positions(uuid, uuid);
drop function public.pf_summary_worktypes(uuid);
drop function planfact.forecast(numeric, numeric, numeric, date, date);
drop function public.pf_fact_journal(uuid, date, date, int);
drop function public.pf_fact_history(uuid);
drop function public.pf_fact_add(uuid, uuid, date, numeric, int, numeric, text, date);
drop function planfact.fact_insert(uuid, uuid, uuid, uuid, date, numeric, int, numeric, text, uuid, uuid, text, date);

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
      new.note, new.corrects_id, new.correction_reason, new.batch_id, new.created_by, new.created_at)
     is distinct from
     (old.id, old.company_id, old.project_id, old.position_id, old.brigade_id, old.work_date, old.qty, old.workers, old.man_hours,
      old.note, old.corrects_id, old.correction_reason, old.batch_id, old.created_by, old.created_at) then
    raise exception 'Объём, дату и бригаду записи факта изменять нельзя' using errcode = '42501';
  end if;
  if old.status in ('rejected', 'superseded') and new.status is distinct from old.status then
    raise exception 'Закрытую запись факта изменять нельзя' using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE FUNCTION planfact.fact_insert(p_company uuid, p_project uuid, p_position uuid, p_brigade uuid, p_date date, p_qty numeric, p_workers integer, p_man_hours numeric, p_note text, p_batch uuid, p_corrects uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_pos planfact.vor_positions; v_tol numeric; v_qty numeric := round(p_qty, 3); v_sum numeric; v_old planfact.fact_entries;
        v_status text; v_id uuid;
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
  end if;
  -- Исправление, не увеличивающее прежний объём записи, подтверждения не требует (перебор уже согласован или уменьшается).
  v_status := case when v_sum + v_qty > v_pos.qty * (1 + v_tol / 100) and not (p_corrects is not null and v_qty <= v_old.qty)
                   then 'pending_approval' else 'accepted' end;

  perform set_config('planfact.fact_tx', '1', true);
  insert into planfact.fact_entries(company_id, project_id, position_id, brigade_id, work_date, qty, workers, man_hours, note,
                                    status, corrects_id, correction_reason, batch_id)
  values (p_company, p_project, p_position, p_brigade, p_date, v_qty, p_workers, p_man_hours, nullif(btrim(coalesce(p_note, '')), ''),
          v_status, p_corrects, nullif(btrim(coalesce(p_reason, '')), ''), p_batch)
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
                       'reason', nullif(btrim(coalesce(p_reason, '')), '')));
  return jsonb_build_object('id', v_id, 'status', v_status);
exception when others then
  perform set_config('planfact.fact_tx', '0', true);
  raise;
end $function$;

CREATE FUNCTION public.pf_fact_add(p_position uuid, p_brigade uuid, p_date date, p_qty numeric, p_workers integer DEFAULT NULL::integer, p_man_hours numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_project uuid; v_company uuid;
begin
  select project_id into v_project from planfact.vor_positions where id = p_position;
  if v_project is null then raise exception 'Позиция не найдена' using errcode = '22023'; end if;
  v_company := planfact.require_fact_create(v_project);
  return planfact.fact_insert(v_company, v_project, p_position, p_brigade, p_date, p_qty, p_workers, p_man_hours, p_note, null, null, null);
end $function$;

CREATE FUNCTION public.pf_fact_history(p_position uuid)
 RETURNS TABLE(id uuid, status text, qty numeric, work_date date, brigade_name text, workers integer, man_hours numeric, note text, corrects_id uuid, correction_reason text, batch_id uuid, created_by_email text, created_at timestamp with time zone, decided_by_email text, decided_at timestamp with time zone, decision_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_project uuid;
begin
  select p.project_id into v_project from planfact.vor_positions p where p.id = p_position;
  if v_project is null or auth.uid() is null or not planfact.has_permission(v_project, 'planfact.fact.view') then
    raise exception 'Нет права видеть факт' using errcode = '42501';
  end if;
  return query
  select e.id, e.status, e.qty, e.work_date, b.name, e.workers, e.man_hours, e.note, e.corrects_id, e.correction_reason, e.batch_id,
         cu.email::text, e.created_at, du.email::text, e.decided_at, e.decision_note
  from planfact.fact_entries e
  join planfact.brigades b on b.id = e.brigade_id
  left join auth.users cu on cu.id = e.created_by
  left join auth.users du on du.id = e.decided_by
  where e.position_id = p_position
  order by e.created_at desc, e.id desc;
end $function$;

CREATE FUNCTION public.pf_fact_journal(p_project uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_limit integer DEFAULT 2000)
 RETURNS TABLE(id uuid, position_id uuid, location_path text, work_name text, unit_code text, qty numeric, work_date date, brigade_name text, workers integer, man_hours numeric, note text, status text, corrects_id uuid, correction_reason text, batch_id uuid, created_by_email text, created_at timestamp with time zone, decided_by_email text, decided_at timestamp with time zone, decision_note text)
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
         du.email::text, e.decided_at, e.decision_note
  from planfact.fact_entries e
  join planfact.vor_positions p on p.id = e.position_id
  join core.work_types w on w.id = p.work_type_id
  join core.units u on u.id = p.unit_id
  join planfact.brigades b on b.id = e.brigade_id
  left join auth.users cu on cu.id = e.created_by
  left join auth.users du on du.id = e.decided_by
  where e.project_id = p_project
    and (p_from is null or e.work_date >= p_from) and (p_to is null or e.work_date <= p_to)
  order by e.work_date desc, e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 2000), 1), 5000);
end $function$;

CREATE FUNCTION public.pf_summary_worktypes(p_project uuid)
 RETURNS TABLE(work_type_id uuid, work_name text, units jsonb, positions integer, plan_money numeric, done_money numeric, pct_money numeric, unpriced_rows integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_money boolean; v_today date := planfact.fact_today();
begin
  v_money := planfact.require_summary_view(p_project);
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
             'fact7', vol.q7, 'fact14', vol.q14, 'pending', vol.pend) order by vol.unit) units
    from vol group by vol.wt
  ), mon as (
    select sr.work_type_id wt, sum(sr.plan_qty * sr.price) plan_m, sum(sr.done_qty * sr.price) done_m,
           count(*) filter (where sr.price is null)::int unpriced
    from planfact.summary_rows(p_project, v_today) sr group by sr.work_type_id
  )
  select coalesce(vw.wt, mon.wt), coalesce(w.name, 'Без вида работ'), coalesce(vw.units, '[]'::jsonb), coalesce(vw.n, 0),
         case when v_money then round(coalesce(mon.plan_m, 0), 2) end, case when v_money then round(coalesce(mon.done_m, 0), 2) end,
         case when v_money and mon.plan_m > 0 then round(mon.done_m / mon.plan_m * 100, 1) end, coalesce(mon.unpriced, 0)
  from vw full join mon on coalesce(mon.wt, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(vw.wt, '00000000-0000-0000-0000-000000000000'::uuid)
  left join core.work_types w on w.id = coalesce(vw.wt, mon.wt)
  order by (coalesce(vw.wt, mon.wt) is null), w.name;
end $function$;

CREATE FUNCTION public.pf_summary_positions(p_project uuid, p_work_type uuid DEFAULT NULL::uuid)
 RETURNS TABLE(position_id uuid, location_id uuid, location_path text, work_type_id uuid, work_name text, unit_code text, plan_qty numeric, fact_qty numeric, pct numeric, rest_qty numeric, fact7 numeric, fact14 numeric, pending_qty numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_today date := planfact.fact_today();
begin
  perform planfact.require_summary_view(p_project);
  return query
  with ft as (select * from planfact.fact_totals(p_project)),
       f7 as (select * from planfact.fact_totals(p_project, v_today - 6, v_today)),
       f14 as (select * from planfact.fact_totals(p_project, v_today - 13, v_today))
  select p.id, p.location_id, planfact.location_path(p.location_id), p.work_type_id, w.name, u.code, ft.plan_qty, ft.fact_qty,
         case when ft.plan_qty > 0 then round(ft.fact_qty / ft.plan_qty * 100, 1) end, greatest(ft.plan_qty - ft.fact_qty, 0),
         f7.fact_qty, f14.fact_qty, ft.pending_qty
  from planfact.vor_positions p
  join core.locations l on l.id = p.location_id
  join core.work_types w on w.id = p.work_type_id
  join core.units u on u.id = p.unit_id
  join ft on ft.position_id = p.id join f7 on f7.position_id = p.id join f14 on f14.position_id = p.id
  where p.project_id = p_project and (p_work_type is null or p.work_type_id = p_work_type)
  order by w.name, l.depth, l.sort_order, l.name, p.id;
end $function$;

alter table planfact.fact_entries drop constraint fact_entries_period_chk;
alter table planfact.fact_entries drop column period_from;

revoke all on function planfact.fact_insert(uuid, uuid, uuid, uuid, date, numeric, int, numeric, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.pf_fact_add(uuid, uuid, date, numeric, int, numeric, text), public.pf_fact_history(uuid),
  public.pf_fact_journal(uuid, date, date, int), public.pf_summary_worktypes(uuid), public.pf_summary_positions(uuid, uuid) from public, anon;
grant execute on function public.pf_fact_add(uuid, uuid, date, numeric, int, numeric, text), public.pf_fact_history(uuid),
  public.pf_fact_journal(uuid, date, date, int), public.pf_summary_worktypes(uuid), public.pf_summary_positions(uuid, uuid) to authenticated;

commit;
