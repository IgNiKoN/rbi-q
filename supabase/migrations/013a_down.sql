-- Откат P2-0011 этап 0 (013a): тела функций как в 010_up (fact_totals), 011_up (pf_project_set_dates), 013_up (остальные).
-- Данные не затрагивает. Применять ФАЙЛОМ.

begin;

create or replace function planfact.fact_totals(p_project uuid, p_from date default null, p_to date default null)
returns table(position_id uuid, plan_qty numeric, fact_qty numeric, pending_qty numeric, pending_count int)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  select p.id, p.qty,
         coalesce(sum(e.qty) filter (where e.status = 'accepted'), 0),
         coalesce(sum(e.qty) filter (where e.status = 'pending_approval'), 0),
         (count(e.id) filter (where e.status = 'pending_approval'))::int
  from planfact.vor_positions p
  left join planfact.fact_entries e on e.position_id = p.id
       and (p_from is null or e.work_date >= p_from) and (p_to is null or e.work_date <= p_to)
  where p.project_id = p_project
  group by p.id, p.qty;
$$;

create or replace function public.pf_project_set_dates(p_project uuid, p_start date, p_finish date)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_old planfact.projects;
begin
  v_company := planfact.require_project_manage(p_project);
  if p_start is not null and p_finish is not null and p_start > p_finish then
    raise exception 'Дата начала позже даты окончания' using errcode = '22023';
  end if;
  select * into v_old from planfact.projects where id = p_project;
  if v_old.planned_start is not distinct from p_start and v_old.planned_finish is not distinct from p_finish then return; end if;
  update planfact.projects set planned_start = p_start, planned_finish = p_finish where id = p_project;
  perform planfact.log_admin_change(v_company, p_project, 'projects', p_project, 'UPDATE',
    jsonb_build_object('planned_start', v_old.planned_start, 'planned_finish', v_old.planned_finish),
    jsonb_build_object('planned_start', p_start, 'planned_finish', p_finish));
end $$;

create or replace function planfact.summary_project(p_project uuid, p_today date)
returns table(kp_revision_id uuid, planned_start date, planned_finish date, plan_money numeric, done_money numeric, issued_money numeric,
              gap_money numeric, pct_money numeric, pace7 numeric, pace14 numeric, need_pace numeric, days_left int,
              forecast_finish date, light text, light_reason text, priced_rows int, unpriced_rows int,
              plan_pct_today numeric, lag_pp numeric, lag_days numeric, pace_verdict text, work_days_left int,
              light_yellow_pp numeric, light_red_pp numeric, light_overdue_days int)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  with pj as (
    select p.planned_start, p.planned_finish, p.light_yellow_pp ly, p.light_red_pp lr, p.light_overdue_days lo, st.contract_kp_revision_id kp
    from planfact.projects p left join planfact.ks2_settings st on st.project_id = p.id where p.id = p_project
  ), r as materialized (
    select count(*) filter (where price is not null)::int priced, count(*) filter (where price is null)::int unpriced,
           coalesce(sum(plan_qty * price), 0) plan_m, coalesce(sum(done_qty * price), 0) done_m,
           coalesce(sum((done_qty - done7_qty) * price), 0) m7, coalesce(sum((done_qty - done14_qty) * price), 0) m14
    from planfact.summary_rows(p_project, p_today)
  ), iss as (
    select coalesce(sum(v.total), 0) m from planfact.ks2_acts a join planfact.ks2_revisions v on v.id = a.issued_revision_id
    where a.project_id = p_project and a.status = 'issued'
  ), c as (
    select pj.*, r.*, iss.m issued_m, round(r.m7 / 7, 2) p7, round(r.m14 / 14, 2) p14, greatest(r.plan_m - r.done_m, 0) rest,
           (pj.planned_finish - p_today) dl,
           planfact.plan_pct(pj.planned_start, pj.planned_finish, p_today) ppl,
           case when r.plan_m > 0 then r.done_m / r.plan_m * 100 end pf,
           case when pj.planned_finish is not null then
             (select count(*)::int from generate_series(1, pj.planned_finish - p_today) k where extract(isodow from p_today + k) < 6) end wdl
    from pj, r, iss
  ), f as (
    select c.*, case when c.kp is null or c.plan_m = 0 then null when c.rest = 0 then p_today
                     when c.p14 > 0 and c.rest / c.p14 <= 36500 then p_today + ceil(c.rest / c.p14)::int end fc,
           c.ppl - c.pf lag, (c.ppl - c.pf) / 100 * (c.planned_finish - c.planned_start) lagd,
           (c.kp is null or c.plan_m = 0 or c.planned_start is null or c.planned_finish is null) nodata
    from c
  )
  select f.kp, f.planned_start, f.planned_finish,
         case when f.kp is not null then round(f.plan_m, 2) end, case when f.kp is not null then round(f.done_m, 2) end,
         round(f.issued_m, 2), case when f.kp is not null then round(f.done_m - f.issued_m, 2) end,
         case when f.plan_m > 0 then round(f.done_m / f.plan_m * 100, 1) end,
         case when f.kp is not null then f.p7 end, case when f.kp is not null then f.p14 end,
         case when f.kp is not null and f.plan_m > 0 and f.dl > 0 then round(f.rest / f.dl, 2) end, f.dl, f.fc,
         case when f.nodata then 'grey'
              when f.rest = 0 then 'green'
              when f.lag > f.lr or p_today > f.planned_finish then 'red'
              when f.lag > f.ly or (f.lagd > 0 and f.lagd >= f.lo) then 'yellow'
              else 'green' end,
         case when f.kp is null then 'no_kp' when f.plan_m = 0 then 'no_prices'
              when f.planned_start is null or f.planned_finish is null then 'no_dates'
              when f.rest = 0 then 'done'
              when f.lag > f.lr then 'lag_red'
              when p_today > f.planned_finish then 'overdue'
              when f.wdl <= 5 and f.lag > f.ly then 'finish_near'
              when f.lag > f.ly then 'lag_yellow'
              when f.lagd > 0 and f.lagd >= f.lo then 'lag_days'
              else 'on_track' end,
         f.priced, f.unpriced,
         round(f.ppl, 1), case when not f.nodata then round(f.lag, 1) end, case when not f.nodata then round(f.lagd, 1) end,
         case when f.kp is null or f.plan_m = 0 or f.m14 <= 0 then null
              when f.m7 / 7 > f.m14 / 14 * 1.1 then 'faster' when f.m7 / 7 < f.m14 / 14 * 0.9 then 'slower' else 'steady' end,
         f.wdl, f.ly, f.lr, f.lo
  from f;
$$;

create or replace function planfact.ks2_rows(p_project uuid, p_to date, p_kp uuid, p_skip_act uuid default null)
returns table(source_row_id uuid, import_id uuid, row_no int, number text, name text, unit_text text, kind text,
              total_qty numeric, prev_qty numeric, sys_qty numeric, price numeric)
language sql stable security definer set search_path = pg_catalog, planfact set enable_nestloop = off as $$
  with kp as (
    select k.snapshot, e.import_ids from planfact.kp_revisions k join planfact.estimates e on e.id = k.estimate_id
    where k.id = p_kp and k.project_id = p_project
  ), src as (
    select s.* from planfact.vor_source_rows s, kp
    where s.project_id = p_project and s.import_id = any(kp.import_ids) and s.kind in ('work', 'material')
  ), ft as (
    select * from planfact.fact_totals(p_project, null, p_to)
  ), wt as materialized (
    select l.source_row_id, sum(ft.fact_qty * l.share) q
    from planfact.vor_links l join ft on ft.position_id = l.position_id
    where l.project_id = p_project group by l.source_row_id
  ), tot as materialized (
    select s.id, round(case when s.kind = 'work' then coalesce(w.q, 0)
                            else coalesce(pw.q, 0) * coalesce(s.norm, case when par.qty > 0 then s.qty / par.qty end, 0) end, 3) t
    from src s
    left join wt w on w.source_row_id = s.id
    left join planfact.vor_source_rows par on par.id = s.parent_row_id
    left join wt pw on pw.source_row_id = s.parent_row_id
  ), prev as (
    select (r ->> 'source_row_id')::uuid id, sum((r ->> 'qty')::numeric) q
    from planfact.ks2_acts a
    join planfact.ks2_revisions v on v.id = a.issued_revision_id
    cross join jsonb_array_elements(v.snapshot -> 'rows') r
    where a.project_id = p_project and a.status = 'issued' and a.id is distinct from p_skip_act
      and not coalesce((r ->> 'excluded')::boolean, false)
    group by 1
  ), pr as materialized (
    select (r ->> 'import_id')::uuid imp, (r ->> 'row_no')::int rn, (r ->> 'price_labor')::numeric pl, (r ->> 'price_material')::numeric pm
    from kp cross join jsonb_array_elements(kp.snapshot -> 'rows') r
  )
  select s.id, s.import_id, s.row_no, s.number, s.name, s.unit_text, s.kind,
         t.t, round(coalesce(p.q, 0), 3), greatest(t.t - round(coalesce(p.q, 0), 3), 0),
         case when s.kind = 'work' then case when pr.pl is null and pr.pm is null then null else coalesce(pr.pl, 0) + coalesce(pr.pm, 0) end
              else pr.pm end
  from src s
  join tot t on t.id = s.id
  cross join kp
  left join prev p on p.id = s.id
  left join pr on pr.imp = s.import_id and pr.rn = s.row_no
  where t.t > 0 or coalesce(p.q, 0) > 0
  order by array_position(kp.import_ids, s.import_id), s.row_no;
$$;

create or replace function planfact.summary_rows(p_project uuid, p_today date)
returns table(source_row_id uuid, import_id uuid, row_no int, number text, name text, unit_text text, kind text, work_type_id uuid,
              plan_qty numeric, price numeric, done_qty numeric, done7_qty numeric, done14_qty numeric, issued_qty numeric)
language sql stable security definer set search_path = pg_catalog, planfact set enable_nestloop = off as $$
  with kp as (
    select k.id, k.snapshot, e.import_ids from planfact.ks2_settings st
    join planfact.kp_revisions k on k.id = st.contract_kp_revision_id and k.project_id = st.project_id
    join planfact.estimates e on e.id = k.estimate_id
    where st.project_id = p_project
  ), pr as materialized (
    select (r ->> 'import_id')::uuid imp, (r ->> 'row_no')::int rn, (r ->> 'price_labor')::numeric pl, (r ->> 'price_material')::numeric pm
    from kp cross join jsonb_array_elements(kp.snapshot -> 'rows') r
  ), now_ as materialized (select * from kp, planfact.ks2_rows(p_project, p_today, kp.id)),
     d7 as materialized (select * from kp, planfact.ks2_rows(p_project, p_today - 7, kp.id)),
     d14 as materialized (select * from kp, planfact.ks2_rows(p_project, p_today - 14, kp.id))
  select s.id, s.import_id, s.row_no, s.number, s.name, s.unit_text, s.kind,
         case when s.kind = 'work' then s.work_type_id else coalesce(s.work_type_id, par.work_type_id) end,
         coalesce(s.qty, 0),
         case when s.kind = 'work' then case when pr.pl is null and pr.pm is null then null else coalesce(pr.pl, 0) + coalesce(pr.pm, 0) end
              else pr.pm end,
         coalesce(n.total_qty, 0), coalesce(a.total_qty, 0), coalesce(b.total_qty, 0), coalesce(n.prev_qty, 0)
  from kp
  join planfact.vor_source_rows s on s.project_id = p_project and s.import_id = any(kp.import_ids) and s.kind in ('work', 'material')
  left join planfact.vor_source_rows par on par.id = s.parent_row_id
  left join pr on pr.imp = s.import_id and pr.rn = s.row_no
  left join now_ n on n.source_row_id = s.id
  left join d7 a on a.source_row_id = s.id
  left join d14 b on b.source_row_id = s.id
  order by array_position(kp.import_ids, s.import_id), s.row_no;
$$;

create or replace function planfact.position_money(p_project uuid, p_kp uuid, p_today date)
returns table(position_id uuid, plan_money numeric, done_money numeric)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  with kp as (
    select k.snapshot, e.import_ids from planfact.kp_revisions k join planfact.estimates e on e.id = k.estimate_id
    where k.id = p_kp and k.project_id = p_project
  ), pr as materialized (
    select (r ->> 'import_id')::uuid imp, (r ->> 'row_no')::int rn, (r ->> 'price_labor')::numeric pl, (r ->> 'price_material')::numeric pm
    from kp cross join jsonb_array_elements(kp.snapshot -> 'rows') r
  ), w as materialized (
    select s.id, coalesce(s.qty, 0) qty,
           case when pr.pl is null and pr.pm is null then 0 else coalesce(pr.pl, 0) + coalesce(pr.pm, 0) end price
    from kp join planfact.vor_source_rows s on s.project_id = p_project and s.import_id = any(kp.import_ids) and s.kind = 'work'
    left join pr on pr.imp = s.import_id and pr.rn = s.row_no
  ), m as materialized (
    select w.id wid, coalesce(sum(coalesce(m.qty, 0) * pr.pm), 0) plan_m,
           coalesce(sum(coalesce(m.norm, case when w.qty > 0 then m.qty / w.qty end, 0) * pr.pm), 0) unit_m
    from w join planfact.vor_source_rows m on m.parent_row_id = w.id and m.kind = 'material'
    left join pr on pr.imp = m.import_id and pr.rn = m.row_no
    group by w.id
  ), ft as materialized (
    select * from planfact.fact_totals(p_project, null, p_today)
  )
  select l.position_id,
         sum(l.share * (w.qty * w.price + coalesce(m.plan_m, 0))),
         sum(ft.fact_qty * l.share * (w.price + coalesce(m.unit_m, 0)))
  from planfact.vor_links l
  join w on w.id = l.source_row_id
  left join m on m.wid = w.id
  join ft on ft.position_id = l.position_id
  where l.project_id = p_project
  group by l.position_id;
$$;

create or replace function public.pf_project_set_thresholds(p_project uuid, p_yellow_pp numeric, p_red_pp numeric, p_overdue_days int)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_old planfact.projects;
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.thresholds.edit') then
    raise exception 'Нет права менять пороги светофора' using errcode = '42501';
  end if;
  select * into v_old from planfact.projects where id = p_project;
  if v_old.archived_at is not null then
    raise exception 'Проект в архиве — сначала верните его из архива' using errcode = '22023';
  end if;
  if p_yellow_pp is null or p_red_pp is null or p_overdue_days is null
     or p_yellow_pp < 0 or p_yellow_pp >= p_red_pp or p_red_pp > 100 or p_overdue_days < 0 or p_overdue_days > 60 then
    raise exception 'Пороги: 0 ≤ жёлтый < красный ≤ 100 п.п., дни — от 0 до 60' using errcode = '22023';
  end if;
  if v_old.light_yellow_pp = p_yellow_pp and v_old.light_red_pp = p_red_pp and v_old.light_overdue_days = p_overdue_days then return; end if;
  update planfact.projects set light_yellow_pp = p_yellow_pp, light_red_pp = p_red_pp, light_overdue_days = p_overdue_days where id = p_project;
  perform planfact.log_admin_change(v_old.company_id, p_project, 'projects', p_project, 'UPDATE',
    jsonb_build_object('light_yellow_pp', v_old.light_yellow_pp, 'light_red_pp', v_old.light_red_pp, 'light_overdue_days', v_old.light_overdue_days),
    jsonb_build_object('light_yellow_pp', p_yellow_pp, 'light_red_pp', p_red_pp, 'light_overdue_days', p_overdue_days));
end $$;

create or replace function public.pf_summary_weekly(p_project uuid, p_weeks int default 12)
returns table(week_start date, week_end date, plan_pct numeric, plan_money_cum numeric, done_money numeric, done_money_cum numeric,
              issued_money numeric, issued_money_cum numeric, units jsonb)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_money boolean; v_today date := planfact.fact_today(); v_kp uuid; v_start date; v_finish date; v_plan numeric; v_n int;
begin
  v_money := planfact.require_summary_view(p_project);
  v_n := least(greatest(coalesce(p_weeks, 12), 1), 52);
  select st.contract_kp_revision_id, p.planned_start, p.planned_finish into v_kp, v_start, v_finish
  from planfact.projects p left join planfact.ks2_settings st on st.project_id = p.id where p.id = p_project;
  if v_kp is not null then select s.plan_money into v_plan from planfact.summary_project(p_project, v_today) s; end if;
  return query
  with w as (
    select g, v_today - 7 * g we from generate_series(0, v_n) g
  ), cum as materialized (
    select w.g, w.we,
           (select coalesce(sum(r.total_qty * r.price), 0) from planfact.ks2_rows(p_project, w.we, v_kp) r where v_kp is not null) dm,
           (select coalesce(sum(v.total), 0) from planfact.ks2_acts a join planfact.ks2_revisions v on v.id = a.issued_revision_id
             where a.project_id = p_project and a.status = 'issued' and a.act_date <= w.we) im
    from w
  ), vol as (
    select w.g, jsonb_agg(jsonb_build_object('unit', x.code, 'qty', x.q) order by x.code) u
    from w cross join lateral (
      select u.code, sum(ft.fact_qty) q from planfact.fact_totals(p_project, w.we - 6, w.we) ft
      join planfact.vor_positions p on p.id = ft.position_id join planfact.units u on u.id = p.unit_id
      group by u.code having sum(ft.fact_qty) > 0) x
    where w.g < v_n
    group by w.g
  )
  select c.we - 6, c.we, round(planfact.plan_pct(v_start, v_finish, c.we), 1),
         case when v_money and v_plan is not null then round(v_plan * planfact.plan_pct(v_start, v_finish, c.we) / 100, 2) end,
         case when v_money and v_kp is not null then round(c.dm - p.dm, 2) end, case when v_money and v_kp is not null then round(c.dm, 2) end,
         case when v_money then round(c.im - p.im, 2) end, case when v_money then round(c.im, 2) end,
         coalesce(vol.u, '[]'::jsonb)
  from cum c join cum p on p.g = c.g + 1 left join vol on vol.g = c.g
  order by c.we;
end $$;

create or replace function public.pf_summary_attention(p_project uuid, p_stale_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_money boolean; v_today date := planfact.fact_today(); v_kp uuid; v_start date; v_finish date; v_n int; v_res jsonb;
begin
  v_money := planfact.require_summary_view(p_project);
  v_n := least(greatest(coalesce(p_stale_days, 14), 1), 180);
  select st.contract_kp_revision_id, p.planned_start, p.planned_finish into v_kp, v_start, v_finish
  from planfact.projects p left join planfact.ks2_settings st on st.project_id = p.id where p.id = p_project;
  with sr as materialized (
    select * from planfact.summary_rows(p_project, v_today)
  ), gap as (
    select sr.*, sr.done_qty - sr.issued_qty g, (sr.done_qty - sr.issued_qty) * sr.price gm from sr where sr.done_qty - sr.issued_qty > 0
  ), ft as materialized (
    select * from planfact.fact_totals(p_project)
  ), last_ as (
    select e.position_id, max(e.work_date) d from planfact.fact_entries e
    where e.project_id = p_project and e.status = 'accepted' group by e.position_id
  ), st as (
    select coalesce(v_start, (select min(d) from last_), (select min(e.work_date) from planfact.fact_entries e
                    where e.project_id = p_project and e.status = 'accepted')) s
  ), pos as (
    select p.id, w.name wname, planfact.location_path(p.location_id) path, u.code, ft.plan_qty, ft.fact_qty, l.node_type,
           v_today - coalesce(last_.d, st.s) idle
    from planfact.vor_positions p
    join ft on ft.position_id = p.id
    join planfact.work_types w on w.id = p.work_type_id
    join planfact.units u on u.id = p.unit_id
    join planfact.locations l on l.id = p.location_id
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
      'pending_entries', (select count(*) from planfact.fact_entries e where e.project_id = p_project and e.status = 'pending_approval')),
    'gap', coalesce((select jsonb_agg(jsonb_build_object('source_row_id', x.source_row_id, 'number', x.number, 'name', x.name,
                       'unit', x.unit_text, 'qty', round(x.g, 3), 'money', case when v_money then round(x.gm, 2) end) order by x.o)
                     from (select gap.*, row_number() over (order by case when v_money then gap.gm end desc nulls last, gap.g desc, gap.row_no) o
                           from gap) x where x.o <= 20), '[]'::jsonb),
    'unpriced', coalesce((select jsonb_agg(jsonb_build_object('source_row_id', x.source_row_id, 'number', x.number, 'name', x.name,
                            'unit', x.unit_text, 'qty', x.plan_qty) order by x.o)
                          from (select sr.*, row_number() over () o from sr where sr.price is null) x where x.o <= 20), '[]'::jsonb),
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
end $$;

commit;
