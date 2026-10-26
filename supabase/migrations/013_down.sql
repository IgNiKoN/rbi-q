-- Откат P2-0010 (013). Удаляет функции дашборда и пороги светофора объектов (ВВЕДЁННЫЕ ПОРОГИ ТЕРЯЮТСЯ);
-- summary_project и pf_summary_portfolio — как в 011a / 011 (прежний светофор по прогнозу), ks2_rows и summary_rows — как в 012.
-- Факт, ВОР, цены, сметы, КП, КС-2 и даты проектов не затрагивает. Строки журнала (audit_log) остаются.
drop function if exists public.pf_summary_places(uuid, uuid);
drop function if exists public.pf_summary_attention(uuid, int);
drop function if exists public.pf_summary_weekly(uuid, int);
drop function if exists public.pf_project_set_thresholds(uuid, numeric, numeric, int);
drop function if exists planfact.position_money(uuid, uuid, date);
drop function if exists public.pf_summary_portfolio();
drop function if exists planfact.summary_project(uuid, date);
drop function if exists planfact.plan_pct(date, date, date);

create or replace function planfact.ks2_rows(p_project uuid, p_to date, p_kp uuid, p_skip_act uuid default null)
returns table(source_row_id uuid, import_id uuid, row_no int, number text, name text, unit_text text, kind text,
              total_qty numeric, prev_qty numeric, sys_qty numeric, price numeric)
language sql stable security definer set search_path = pg_catalog, planfact as $$
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
language sql stable security definer set search_path = pg_catalog, planfact as $$
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

create or replace function planfact.summary_project(p_project uuid, p_today date)
returns table(kp_revision_id uuid, planned_start date, planned_finish date, plan_money numeric, done_money numeric, issued_money numeric,
              gap_money numeric, pct_money numeric, pace7 numeric, pace14 numeric, need_pace numeric, days_left int,
              forecast_finish date, light text, light_reason text, priced_rows int, unpriced_rows int)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  with pj as (
    select p.planned_start, p.planned_finish, st.contract_kp_revision_id kp
    from planfact.projects p left join planfact.ks2_settings st on st.project_id = p.id where p.id = p_project
  ), r as (
    select count(*) filter (where price is not null)::int priced, count(*) filter (where price is null)::int unpriced,
           coalesce(sum(plan_qty * price), 0) plan_m, coalesce(sum(done_qty * price), 0) done_m,
           coalesce(sum((done_qty - done7_qty) * price), 0) m7, coalesce(sum((done_qty - done14_qty) * price), 0) m14
    from planfact.summary_rows(p_project, p_today)
  ), iss as (
    select coalesce(sum(v.total), 0) m from planfact.ks2_acts a join planfact.ks2_revisions v on v.id = a.issued_revision_id
    where a.project_id = p_project and a.status = 'issued'
  ), c as (
    select pj.*, r.*, iss.m issued_m, round(r.m7 / 7, 2) p7, round(r.m14 / 14, 2) p14, greatest(r.plan_m - r.done_m, 0) rest,
           (pj.planned_finish - p_today) dl
    from pj, r, iss
  ), f as (
    select c.*, case when c.kp is null or c.plan_m = 0 then null when c.rest = 0 then p_today
                     when c.p14 > 0 and c.rest / c.p14 <= 36500 then p_today + ceil(c.rest / c.p14)::int end fc
    from c
  )
  select f.kp, f.planned_start, f.planned_finish,
         case when f.kp is not null then round(f.plan_m, 2) end, case when f.kp is not null then round(f.done_m, 2) end,
         round(f.issued_m, 2), case when f.kp is not null then round(f.done_m - f.issued_m, 2) end,
         case when f.plan_m > 0 then round(f.done_m / f.plan_m * 100, 1) end,
         case when f.kp is not null then f.p7 end, case when f.kp is not null then f.p14 end,
         case when f.kp is not null and f.plan_m > 0 and f.dl > 0 then round(f.rest / f.dl, 2) end, f.dl, f.fc,
         case when f.kp is null or f.plan_m = 0 or f.planned_finish is null then 'grey'
              when f.rest = 0 or f.fc <= f.planned_finish then 'green'
              when f.fc is not null and f.fc <= f.planned_finish + 14 then 'yellow' else 'red' end,
         case when f.kp is null then 'no_kp' when f.plan_m = 0 then 'no_prices' when f.planned_finish is null then 'no_dates'
              when f.rest = 0 then 'done' when f.fc is null then 'no_pace' when f.dl < 0 then 'overdue' else 'forecast' end,
         f.priced, f.unpriced
  from f;
$$;

create or replace function public.pf_summary_portfolio()
returns table(project_id uuid, name text, code text, planned_start date, planned_finish date, can_money boolean, can_manage boolean,
              has_kp boolean, plan_money numeric, done_money numeric, issued_money numeric, gap_money numeric, pct_money numeric,
              pace7 numeric, pace14 numeric, need_pace numeric, days_left int, forecast_finish date, light text, light_reason text,
              unpriced_rows int, positions int, pending int)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_today date := planfact.fact_today();
begin
  if auth.uid() is null then raise exception 'Нет права видеть сводку' using errcode = '42501'; end if;
  return query
  with pj as (
    select p.id, p.name, p.code, planfact.has_permission(p.id, 'planfact.money.view') m, planfact.has_permission(p.id, 'planfact.projects.manage') g
    from planfact.projects p where p.archived_at is null and planfact.has_permission(p.id, 'planfact.fact.view')
  )
  select pj.id, pj.name, pj.code, s.planned_start, s.planned_finish, pj.m, pj.g, s.kp_revision_id is not null,
         case when pj.m then s.plan_money end, case when pj.m then s.done_money end, case when pj.m then s.issued_money end,
         case when pj.m then s.gap_money end, case when pj.m then s.pct_money end, case when pj.m then s.pace7 end,
         case when pj.m then s.pace14 end, case when pj.m then s.need_pace end, s.days_left,
         case when pj.m then s.forecast_finish end, s.light, s.light_reason, s.unpriced_rows,
         (select count(*)::int from planfact.vor_positions vp where vp.project_id = pj.id),
         (select count(*)::int from planfact.fact_entries e where e.project_id = pj.id and e.status = 'pending_approval')
  from pj cross join lateral planfact.summary_project(pj.id, v_today) s
  order by pj.name, pj.id;
end $$;

revoke all on function planfact.summary_project(uuid, date) from public, anon, authenticated;
revoke all on function public.pf_summary_portfolio() from public, anon;
grant execute on function public.pf_summary_portfolio() to authenticated;

alter table planfact.projects drop constraint if exists projects_light_thresholds_chk;
alter table planfact.projects drop column if exists light_overdue_days;
alter table planfact.projects drop column if exists light_red_pp;
alter table planfact.projects drop column if exists light_yellow_pp;
