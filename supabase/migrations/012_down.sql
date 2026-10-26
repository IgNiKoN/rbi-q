-- Откат P2-0009 (012): прежние тела pf_vor_import_rows (007_up.sql — цены файла снова видны всем участникам проекта),
-- planfact.ks2_rows (010_up.sql) и planfact.summary_rows (011_up.sql) — без MATERIALIZED.
-- Сигнатура и права на вызов не меняются.
create or replace function public.pf_vor_import_rows(p_import uuid)
returns table(id uuid, row_no int, kind text, number text, name text, unit_text text, qty numeric, norm numeric, prices jsonb,
              context jsonb, parent_row_no int, location_id uuid, work_type_id uuid, unit_id uuid, match text)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_project uuid;
begin
  select project_id into v_project from planfact.vor_imports where vor_imports.id = p_import;
  if v_project is null or auth.uid() is null or not planfact.is_project_member(v_project) then
    raise exception 'Загрузка не найдена' using errcode = '22023';
  end if;
  return query
  select s.id, s.row_no, s.kind, s.number, s.name, s.unit_text, s.qty, s.norm, s.prices, s.context,
         w.row_no, s.location_id, s.work_type_id, s.unit_id, s.match
  from planfact.vor_source_rows s left join planfact.vor_source_rows w on w.id = s.parent_row_id
  where s.import_id = p_import
  order by s.row_no;
end $$;

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
  ), wt as (
    select l.source_row_id, sum(ft.fact_qty * l.share) q
    from planfact.vor_links l join ft on ft.position_id = l.position_id
    where l.project_id = p_project group by l.source_row_id
  ), tot as (
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
  ), pr as (
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
