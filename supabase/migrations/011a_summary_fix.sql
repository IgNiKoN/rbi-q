-- P2-0008, доработка по ревью приёмки (011a). Применять после 011 — ФАЙЛОМ. Только create or replace, сигнатуры и права не меняются.
-- 1. summary_project: прогноз дальше 36 500 дней (темп за 14 дней почти 0) — прогноза нет (светофор red, причина no_pace);
--    раньше ceil(остаток / темп)::int переполнялся и pf_summary_portfolio падал у всех.
-- 2. pf_summary_ks2_gap: явный порядок строк (порядок загрузок договорной КП, затем номер строки).
-- Откат — тела функций из 011_up.sql (повторно выполнить разделы 2 и 3 файла 011_up.sql).

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

-- «Сделано ↔ выставлено в КС-2» по строкам заказчика договорной КП: сделано (принятый факт через связки), выставлено (итог ПТО
-- выданных актов), разрыв = сделано − выставлено; ₽ по цене договорной КП — только с money.view. Строки без факта и без актов не выводятся.
create or replace function public.pf_summary_ks2_gap(p_project uuid)
returns table(source_row_id uuid, import_id uuid, row_no int, number text, name text, unit_text text, kind text, work_name text,
              done_qty numeric, issued_qty numeric, gap_qty numeric, price numeric, done_money numeric, issued_money numeric, gap_money numeric)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_money boolean;
begin
  v_money := planfact.require_summary_view(p_project);
  perform planfact.ks2_contract_kp(p_project);
  return query
  select sr.source_row_id, sr.import_id, sr.row_no, sr.number, sr.name, sr.unit_text, sr.kind, w.name,
         sr.done_qty, sr.issued_qty, sr.done_qty - sr.issued_qty,
         case when v_money then sr.price end, case when v_money then round(sr.done_qty * sr.price, 2) end,
         case when v_money then round(sr.issued_qty * sr.price, 2) end, case when v_money then round((sr.done_qty - sr.issued_qty) * sr.price, 2) end
  from planfact.summary_rows(p_project, planfact.fact_today()) sr
  left join planfact.work_types w on w.id = sr.work_type_id
  left join planfact.ks2_settings st on st.project_id = p_project
  left join planfact.kp_revisions k on k.id = st.contract_kp_revision_id
  left join planfact.estimates e on e.id = k.estimate_id
  where sr.done_qty > 0 or sr.issued_qty > 0
  order by array_position(e.import_ids, sr.import_id), sr.row_no;
end $$;

