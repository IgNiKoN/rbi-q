-- P2-0010. Дашборд руководителя: пороги светофора объекта, план на сегодня и отставание (п.п. и дни) по ТЗ §9, светофор по ТЗ 8.2,
-- вердикт темпа, итоги по неделям, «Требует внимания» и полнота данных, проваливание по местам (корпус → секция → этаж).
-- Только planfact.* и public.pf_*. Объекты RBI/Quality, Auth/PostgREST и Storage не затрагивает. Применять после 012 — ФАЙЛОМ (урок 006a).
-- Факт — только planfact.fact_totals; цены и «сделано» строк заказчика — только planfact.ks2_rows / summary_rows (REUSE без изменений).
-- Светофор, отставание, вердикт — только planfact.summary_project (экран и Excel не пересчитывают).
-- Таблиц не добавляет; в planfact.projects — три столбца порогов. summary_project и pf_summary_portfolio пересоздаются
-- (drop + create: PostgreSQL не меняет состав столбцов результата через create or replace); прежние столбцы — те же, новые — в конце.
-- Поля в ₽, общий %, отставание (п.п. и дни, из них виден %) — только при праве planfact.money.view (иначе null).
-- Откат — 013_down.sql.

-- 1. Пороги светофора — настройки объекта (ТЗ 8.2 «пороги вынесены в настройки объекта»)
alter table planfact.projects add column if not exists light_yellow_pp numeric not null default 3;
alter table planfact.projects add column if not exists light_red_pp numeric not null default 10;
alter table planfact.projects add column if not exists light_overdue_days int not null default 3;
alter table planfact.projects drop constraint if exists projects_light_thresholds_chk;
alter table planfact.projects add constraint projects_light_thresholds_chk
  check (light_yellow_pp >= 0 and light_yellow_pp < light_red_pp and light_red_pp <= 100 and light_overdue_days between 0 and 60);

-- 2. Служебные функции (клиенту не выдаются)
-- План на дату T по ТЗ §9 (равномерно): P_план(T) = 100 × min(max(T − T_start; 0); T_end − T_start) / (T_end − T_start).
-- Нулевая длительность: 100 с даты окончания, иначе 0. Нет дат — null.
create or replace function planfact.plan_pct(p_start date, p_finish date, p_t date)
returns numeric language sql immutable set search_path = pg_catalog as $$
  select case when p_start is null or p_finish is null or p_t is null then null
              when p_finish = p_start then case when p_t >= p_finish then 100::numeric else 0::numeric end
              else 100.0 * least(greatest(p_t - p_start, 0), p_finish - p_start) / (p_finish - p_start) end;
$$;

-- ЕДИНЫЙ расчёт сводки проекта на дату p_today (формулы — docs/APP_GUIDE.md «Сводка»). Права не проверяет (только для pf_*).
-- Прежние поля — как в 011a. Новые:
-- plan_pct_today = P_план(T); lag_pp = P_план(T) − P_факт (п.п., P_факт = pct_money); lag_days = D = lag_pp / 100 × (T_end − T_start);
-- pace_verdict: faster — темп 7 дней > темпа 14 дней × 1,1; slower — < × 0,9; steady — иначе; null — нет КП / цен / выполнения за 14 дней;
-- work_days_left — рабочих дней (пн–пт) после T до T_end включительно.
-- Светофор по ТЗ 8.2 (решение владельца 22.10.2026 о «днях» — карточка P2-0010), пороги объекта Y = light_yellow_pp, R = light_red_pp,
-- N = light_overdue_days: grey — нет КП / цен / дат начала и окончания; green «done» — всё сделано;
-- red — lag_pp > R («lag_red») или срок прошёл (T > T_end) при выполнении < 100 % («overdue»);
-- yellow — до финиша ≤ 5 рабочих дней при lag_pp > Y («finish_near»), lag_pp > Y («lag_yellow»), D ≥ N при D > 0 («lag_days»);
-- иначе green («on_track»).
drop function if exists planfact.summary_project(uuid, date);
create function planfact.summary_project(p_project uuid, p_today date)
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

-- Скорость (NFR-03, урок ТД №72). Без статистики таблиц (сразу после загрузки ВОР, до автоматического ANALYZE) планировщик
-- оценивает строки заказчика как «1 строка» и соединяет их с промежуточными итогами вложенным циклом: на 2 000 строк ks2_rows —
-- 0,2 с, summary_rows — 0,8 с, портфель 5 × 2 000 — 4,2 с (PGlite). Тела ks2_rows и summary_rows — БЕЗ ИЗМЕНЕНИЙ (как в 012);
-- добавлена только настройка функции enable_nestloop = off (соединения хешем/слиянием, план не зависит от статистики).
-- Формулы, состав и порядок строк — те же (регрессия 010/011/012 и тест 013).
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

-- Деньги позиции (для проваливания по местам): та же раскладка, что planfact.ks2_rows / summary_rows, но по позициям.
-- План = Σ связок доля × (объём строки-работы × цена работы + Σ материалов под ней объём × цена материала);
-- сделано = принятый факт позиции на p_today × Σ связок доля × (цена работы + Σ материалов норма × цена материала),
-- норма — как в ks2_rows (norm, иначе объём материала ÷ объём работы). Строки без цены — 0. Сумма по позициям = сводке проекта
-- (тест 013; расхождение — только округление строк ks2_rows до 0,001). Материалы без строки-работы по местам не раскладываются.
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

-- 3. RPC
-- Пороги светофора объекта. Право planfact.thresholds.edit (РП, руководство), проект не в архиве, 0 ≤ жёлтый < красный ≤ 100,
-- дни 0…60; журнал.
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

-- Портфель: как в 011 + план на сегодня, отставание (п.п., дни — с money.view), вердикт темпа, рабочие дни до финиша, пороги,
-- право менять пороги. Прежние столбцы — без изменений.
drop function if exists public.pf_summary_portfolio();
create function public.pf_summary_portfolio()
returns table(project_id uuid, name text, code text, planned_start date, planned_finish date, can_money boolean, can_manage boolean,
              has_kp boolean, plan_money numeric, done_money numeric, issued_money numeric, gap_money numeric, pct_money numeric,
              pace7 numeric, pace14 numeric, need_pace numeric, days_left int, forecast_finish date, light text, light_reason text,
              unpriced_rows int, positions int, pending int,
              plan_pct_today numeric, lag_pp numeric, lag_days numeric, pace_verdict text, work_days_left int,
              light_yellow_pp numeric, light_red_pp numeric, light_overdue_days int, can_thresholds boolean)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_today date := planfact.fact_today();
begin
  if auth.uid() is null then raise exception 'Нет права видеть сводку' using errcode = '42501'; end if;
  return query
  with pj as (
    select p.id, p.name, p.code, planfact.has_permission(p.id, 'planfact.money.view') m, planfact.has_permission(p.id, 'planfact.projects.manage') g,
           planfact.has_permission(p.id, 'planfact.thresholds.edit') th
    from planfact.projects p where p.archived_at is null and planfact.has_permission(p.id, 'planfact.fact.view')
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
end $$;

-- По неделям (p_weeks последних недель, 1…52; неделя — 7 дней, последняя кончается сегодня), от старой к новой:
-- план на конец недели (%, ₽ = план ₽ × % — линейно, «графика работ ещё нет»), сделано за неделю и нарастающим итогом (₽ — ks2_rows на
-- конец недели × цена договорной КП), выставлено (итог выданных актов КС-2 по дате акта) за неделю и нарастающим итогом,
-- объём за неделю по ЕИ (принятый факт позиций, разные ЕИ не складываются). ₽ — только с money.view; без договорной КП ₽ нет.
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

-- «Требует внимания» и полнота данных (jsonb). p_stale_days — сколько дней без факта считается «застоем» (1…180, по умолчанию 14).
-- counts: gap_rows / gap_money (сделано, не выставлено по строкам договорной КП), unpriced_rows (строки без цены в договорной КП),
-- no_kp, no_dates, stale_positions (не завершены и без принятого факта дольше p_stale_days при начатом объекте — начало = плановая
-- дата начала, иначе первый принятый факт), pending_entries (факт на подтверждении).
-- items: до 20 строк каждого вида (gap — по убыванию ₽ при праве, иначе по объёму; unpriced, stale — по порядку ВОР / дням).
-- completeness: доля строк с ценой, даты объекта (0 / 100), доля позиций с местом ниже корпуса (секция, этаж, квартира).
-- ₽ — только с money.view.
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

-- Проваливание: дети узла p_location (null — верхний уровень проекта) с итогами по поддереву: позиций, план и сделано ₽ (по договорной
-- КП — planfact.position_money; только с money.view), % по деньгам, объёмы по ЕИ (план, факт, % — разные ЕИ не складываются).
-- here_positions — позиции, привязанные прямо к этому месту (не к его детям): например, объёмы корпуса, не разнесённые по этажам.
create or replace function public.pf_summary_places(p_project uuid, p_location uuid default null)
returns table(location_id uuid, name text, node_type text, depth int, children int, positions int, here_positions int,
              plan_money numeric, done_money numeric, pct_money numeric, units jsonb)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_money boolean; v_today date := planfact.fact_today(); v_kp uuid;
begin
  v_money := planfact.require_summary_view(p_project);
  if p_location is not null and not exists (select 1 from planfact.locations l where l.id = p_location and l.project_id = p_project and l.deleted_at is null) then
    raise exception 'Место не найдено в проекте' using errcode = '22023';
  end if;
  select st.contract_kp_revision_id into v_kp from planfact.ks2_settings st where st.project_id = p_project;
  return query
  with recursive tree(root, id) as (
    select l.id, l.id from planfact.locations l
    where l.project_id = p_project and l.deleted_at is null and l.parent_id is not distinct from p_location
    union all
    select t.root, c.id from planfact.locations c join tree t on c.parent_id = t.id where c.deleted_at is null
  ), ft as materialized (
    select * from planfact.fact_totals(p_project)
  ), mon as materialized (
    select * from planfact.position_money(p_project, v_kp, v_today) where v_kp is not null
  ), pos as (
    select t.root, p.id, u.code, ft.plan_qty, ft.fact_qty, mon.plan_money pm, mon.done_money dm
    from tree t join planfact.vor_positions p on p.location_id = t.id and p.project_id = p_project
    join planfact.units u on u.id = p.unit_id
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
         (select count(*)::int from planfact.locations c where c.parent_id = l.id and c.deleted_at is null),
         coalesce(agg.n, 0), (select count(*)::int from planfact.vor_positions vp where vp.project_id = p_project and vp.location_id = l.id),
         case when v_money and v_kp is not null then round(coalesce(agg.pm, 0), 2) end,
         case when v_money and v_kp is not null then round(coalesce(agg.dm, 0), 2) end,
         case when v_money and agg.pm > 0 then round(agg.dm / agg.pm * 100, 1) end,
         coalesce(vol.u, '[]'::jsonb)
  from planfact.locations l
  left join agg on agg.root = l.id left join vol on vol.root = l.id
  where l.project_id = p_project and l.deleted_at is null and l.parent_id is not distinct from p_location
  order by l.sort_order, l.name, l.id;
end $$;

-- 4. Права на выполнение
revoke all on function planfact.plan_pct(date, date, date), planfact.summary_project(uuid, date), planfact.position_money(uuid, uuid, date)
  from public, anon, authenticated;
revoke all on function public.pf_project_set_thresholds(uuid, numeric, numeric, int), public.pf_summary_portfolio(),
  public.pf_summary_weekly(uuid, int), public.pf_summary_attention(uuid, int), public.pf_summary_places(uuid, uuid) from public, anon;
grant execute on function public.pf_project_set_thresholds(uuid, numeric, numeric, int), public.pf_summary_portfolio(),
  public.pf_summary_weekly(uuid, int), public.pf_summary_attention(uuid, int), public.pf_summary_places(uuid, uuid) to authenticated;
