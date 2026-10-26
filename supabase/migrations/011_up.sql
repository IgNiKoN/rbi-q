-- P2-0008. Сводка руководителю: плановые даты проекта, единый расчёт сводки (готовность по деньгам договорной КП, темп, прогноз,
-- светофор, «сделано ↔ выставлено в КС-2»), чтение сводки по портфелю / видам работ / позициям / строкам заказчика.
-- Только planfact.* и public.pf_*. Объекты RBI/Quality, Auth/PostgREST и Storage не затрагивает. Применять после 010 — ФАЙЛОМ (урок 006a).
-- Факт — только planfact.fact_totals; раскладка факта по строкам заказчика, цены договорной КП и «выставлено» — только planfact.ks2_rows
-- (REUSE без изменения 009/010). Второго расчёта факта нет; кэш-таблиц нет. Сводка только читает (MN-08), кроме дат проекта.
-- Поля в ₽, общий %, темп в ₽ и прогноз приходят с сервера только при праве planfact.money.view (иначе null).

-- 1. Плановые даты проекта (вводит РП; отставание по каждой работе — после импорта ГПР)
alter table planfact.projects add column if not exists planned_start date;
alter table planfact.projects add column if not exists planned_finish date;
alter table planfact.projects drop constraint if exists projects_planned_dates_chk;
alter table planfact.projects add constraint projects_planned_dates_chk
  check (planned_start is null or planned_finish is null or planned_start <= planned_finish);

-- 2. Служебные функции (клиенту не выдаются)
-- Просмотр сводки: право planfact.fact.view в проекте. Возвращает «видит ли рубли» (planfact.money.view).
create or replace function planfact.require_summary_view(p_project uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.fact.view') then
    raise exception 'Нет права видеть сводку' using errcode = '42501';
  end if;
  return planfact.has_permission(p_project, 'planfact.money.view');
end $$;

-- Строки заказчика договорной КП проекта на дату p_today: план (объём ВОР), цена (правило ks2_rows: работа — работа + материал строки,
-- материал — цена материала), сделано на p_today, на p_today − 7 и − 14 (принятый факт через связки — ks2_rows), выставлено (ks2_rows.prev_qty).
-- Вид работ строки материала — вид работ родительской работы. Без договорной КП строк нет.
create or replace function planfact.summary_rows(p_project uuid, p_today date)
returns table(source_row_id uuid, import_id uuid, row_no int, number text, name text, unit_text text, kind text, work_type_id uuid,
              plan_qty numeric, price numeric, done_qty numeric, done7_qty numeric, done14_qty numeric, issued_qty numeric)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  with kp as (
    select k.id, k.snapshot, e.import_ids from planfact.ks2_settings st
    join planfact.kp_revisions k on k.id = st.contract_kp_revision_id and k.project_id = st.project_id
    join planfact.estimates e on e.id = k.estimate_id
    where st.project_id = p_project
  ), pr as (
    select (r ->> 'import_id')::uuid imp, (r ->> 'row_no')::int rn, (r ->> 'price_labor')::numeric pl, (r ->> 'price_material')::numeric pm
    from kp cross join jsonb_array_elements(kp.snapshot -> 'rows') r
  ), now_ as (select * from kp, planfact.ks2_rows(p_project, p_today, kp.id)),
     d7 as (select * from kp, planfact.ks2_rows(p_project, p_today - 7, kp.id)),
     d14 as (select * from kp, planfact.ks2_rows(p_project, p_today - 14, kp.id))
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

-- ЕДИНЫЙ расчёт сводки проекта на дату p_today (формулы — docs/APP_GUIDE.md «Сводка»). Права не проверяет (только для pf_*).
-- plan_money = Σ план × цена; done_money = Σ сделано × цена (строки без цены не входят, их число — unpriced_rows);
-- issued_money = Σ итог ПТО выданных (не аннулированных) актов КС-2; gap_money = done − issued; pct_money = done / plan × 100;
-- pace7 / pace14 = ₽ сделанного за 7 / 14 дней ÷ 7 / 14 (₽ в день); need_pace = (plan − done) ÷ дней до planned_finish;
-- forecast_finish = p_today + ⌈(plan − done) ÷ pace14⌉; светофор: green — прогноз ≤ план. окончания (или всё сделано),
-- yellow — позже ≤ 14 дней, red — позже > 14 дней или темп 14 дней = 0 при остатке; grey — нет КП / цен / даты окончания.
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
                     when c.p14 > 0 then p_today + ceil(c.rest / c.p14)::int end fc
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

-- 3. RPC
-- Даты проекта (null — убрать). Право planfact.projects.manage, проект не в архиве, начало ≤ окончания; журнал.
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

-- Портфель: проекты пользователя (право planfact.fact.view, не в архиве) с итогами сводки. ₽, %, темп, прогноз — только с money.view.
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

-- Виды работ проекта: объёмы в своих ЕИ (units — по одной записи на ЕИ, разные ЕИ не суммируются) и ₽ по строкам заказчика (при праве).
create or replace function public.pf_summary_worktypes(p_project uuid)
returns table(work_type_id uuid, work_name text, units jsonb, positions int, plan_money numeric, done_money numeric, pct_money numeric,
              unpriced_rows int)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
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
    join planfact.units u on u.id = p.unit_id
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
  left join planfact.work_types w on w.id = coalesce(vw.wt, mon.wt)
  order by (coalesce(vw.wt, mon.wt) is null), w.name;
end $$;

-- Позиции проекта (p_work_type = null — все) с местом: план, факт, %, остаток, факт за 7 / 14 дней, ждёт подтверждения — в ЕИ позиции.
create or replace function public.pf_summary_positions(p_project uuid, p_work_type uuid default null)
returns table(position_id uuid, location_id uuid, location_path text, work_type_id uuid, work_name text, unit_code text,
              plan_qty numeric, fact_qty numeric, pct numeric, rest_qty numeric, fact7 numeric, fact14 numeric, pending_qty numeric)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
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
  join planfact.locations l on l.id = p.location_id
  join planfact.work_types w on w.id = p.work_type_id
  join planfact.units u on u.id = p.unit_id
  join ft on ft.position_id = p.id join f7 on f7.position_id = p.id join f14 on f14.position_id = p.id
  where p.project_id = p_project and (p_work_type is null or p.work_type_id = p_work_type)
  order by w.name, l.depth, l.sort_order, l.name, p.id;
end $$;

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
  where sr.done_qty > 0 or sr.issued_qty > 0;
end $$;

-- 4. Права на выполнение
revoke all on function planfact.require_summary_view(uuid), planfact.summary_rows(uuid, date), planfact.summary_project(uuid, date)
  from public, anon, authenticated;
revoke all on function public.pf_project_set_dates(uuid, date, date), public.pf_summary_portfolio(), public.pf_summary_worktypes(uuid),
  public.pf_summary_positions(uuid, uuid), public.pf_summary_ks2_gap(uuid) from public, anon;
grant execute on function public.pf_project_set_dates(uuid, date, date), public.pf_summary_portfolio(), public.pf_summary_worktypes(uuid),
  public.pf_summary_positions(uuid, uuid), public.pf_summary_ks2_gap(uuid) to authenticated;
