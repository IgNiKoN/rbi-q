-- P2-0009. Две находки сквозного прогона на реальной ВОР «Спутник»:
-- 1) (К5) цены из файла заказчика в строках ВОР — только тем, кто видит деньги;
-- 2) (К6) скорость: planfact.ks2_rows и planfact.summary_rows — промежуточные расчёты помечены MATERIALIZED (считаются один раз).
--    Без статистики таблиц (сразу после большой загрузки ВОР, до автоматического ANALYZE) планировщик пересчитывал
--    «итог по строке» для каждой строки заказчика (n² повторов): 2 листа «Спутника» (578 строк) — 4,4 с на ks2_rows и 13,5 с
--    на сводку; с правкой — 0,1 с при любой статистике. Формулы и результат не меняются (сверено построчно на данных стенда).
-- Ниже раздел 1 — цены.
-- pf_vor_import_rows отдавал колонку prices (цены и суммы файла заказчика, например себестоимость) любому участнику проекта,
-- в том числе прорабу и заказчику, у которых нет права на суммы. Теперь prices = {} без права planfact.money.view
-- и без права planfact.estimate.manage (смета, справочник цен). Остальные поля, сигнатура и права на вызов — без изменений.
-- Только create or replace функций (public.pf_vor_import_rows, planfact.ks2_rows, planfact.summary_rows); таблицы, RLS, права,
-- объекты RBI/Quality, Auth/PostgREST, Storage не затрагивает.
-- Применять после 011a — ФАЙЛОМ (урок 006a). Откат — 012_down.sql (тела из 007_up.sql, 010_up.sql, 011_up.sql).
create or replace function public.pf_vor_import_rows(p_import uuid)
returns table(id uuid, row_no int, kind text, number text, name text, unit_text text, qty numeric, norm numeric, prices jsonb,
              context jsonb, parent_row_no int, location_id uuid, work_type_id uuid, unit_id uuid, match text)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_project uuid; v_money boolean;
begin
  select project_id into v_project from planfact.vor_imports where vor_imports.id = p_import;
  if v_project is null or auth.uid() is null or not planfact.is_project_member(v_project) then
    raise exception 'Загрузка не найдена' using errcode = '22023';
  end if;
  v_money := planfact.has_permission(v_project, 'planfact.money.view') or planfact.has_permission(v_project, 'planfact.estimate.manage');
  return query
  select s.id, s.row_no, s.kind, s.number, s.name, s.unit_text, s.qty, s.norm,
         case when v_money then s.prices else '{}'::jsonb end, s.context,
         w.row_no, s.location_id, s.work_type_id, s.unit_id, s.match
  from planfact.vor_source_rows s left join planfact.vor_source_rows w on w.id = s.parent_row_id
  where s.import_id = p_import
  order by s.row_no;
end $$;

-- 2. Скорость расчёта КС-2 и сводки (тела из 010_up.sql / 011_up.sql; изменено только «as materialized» у промежуточных расчётов).
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
