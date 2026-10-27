-- Откат 046c: ks2_rows — как после 046b (текст побайтно), без индекса и настройки функции.
begin;

drop index planfact.fact_entries_corrects_idx;
alter function planfact.position_moved_to(uuid) reset enable_nestloop;

CREATE OR REPLACE FUNCTION planfact.ks2_rows(p_project uuid, p_to date, p_kp uuid, p_skip_act uuid DEFAULT NULL::uuid)
 RETURNS TABLE(source_row_id uuid, import_id uuid, row_no integer, number text, name text, unit_text text, kind text, total_qty numeric, prev_qty numeric, sys_qty numeric, price numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
 SET enable_nestloop TO 'off'
AS $function$
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
    left join src par on par.id = s.parent_row_id
    left join wt pw on pw.source_row_id = s.parent_row_id
  ), prev_raw as materialized (
    select (r ->> 'source_row_id')::uuid id, sum((r ->> 'qty')::numeric) q
    from planfact.ks2_acts a
    cross join jsonb_array_elements((select v.snapshot from planfact.ks2_revisions v where v.id = a.issued_revision_id) -> 'rows') r
    where a.project_id = p_project and a.status = 'issued' and a.id is distinct from p_skip_act
      and not coalesce((r ->> 'excluded')::boolean, false)
    group by 1
  ), wmap as materialized (
    -- P2-0006d (046b): строка-работа выставленного (сама работа или работа материала) → строка-работа этого КП.
    -- Позиция работы — после переносов факта при редакциях ВОР (planfact.position_moved_to): выставленное идёт за фактом.
    -- Есть строка этой позиции в КП — туда; иначе — та же строка, если она в КП (иначе выставленное в этом КП не участвует).
    select x.old_work, coalesce(
             (select s2.id from planfact.vor_links l2 join src s2 on s2.id = l2.source_row_id and s2.kind = 'work'
               where l2.position_id = x.fin order by s2.row_no, s2.id limit 1),
             (select s.id from src s where s.id = x.old_work)) new_work
    from (select w.old_work, planfact.position_moved_to(
                   (select l.position_id from planfact.vor_links l where l.source_row_id = w.old_work order by l.position_id limit 1)) fin
          from (select distinct case when o.kind = 'work' then o.id else o.parent_row_id end old_work
                from prev_raw p join planfact.vor_source_rows o on o.id = p.id and o.project_id = p_project) w) x
  ), mr_old as materialized (
    -- материалы прежних строк-работ: порядок внутри «работа + название + ЕИ» и внутри работы
    select o.id, o.parent_row_id, planfact.canon_name(o.name) cn, lower(translate(coalesce(o.unit_text, ''), '²³ .', '23')) un,
           row_number() over (partition by o.parent_row_id, planfact.canon_name(o.name), lower(translate(coalesce(o.unit_text, ''), '²³ .', '23')) order by o.row_no) rn_name,
           row_number() over (partition by o.parent_row_id order by o.row_no) rn_all,
           count(*) over (partition by o.parent_row_id) cnt
    from planfact.vor_source_rows o
    where o.project_id = p_project and o.kind = 'material' and o.parent_row_id in (select wm.old_work from wmap wm)
  ), mr_new as materialized (
    select s.id, s.parent_row_id, planfact.canon_name(s.name) cn, lower(translate(coalesce(s.unit_text, ''), '²³ .', '23')) un,
           row_number() over (partition by s.parent_row_id, planfact.canon_name(s.name), lower(translate(coalesce(s.unit_text, ''), '²³ .', '23')) order by s.row_no) rn_name,
           row_number() over (partition by s.parent_row_id order by s.row_no) rn_all,
           count(*) over (partition by s.parent_row_id) cnt
    from src s where s.kind = 'material'
  ), prev_map as (
    -- работа — по wmap; материал — та же строка, если работа не сменилась; иначе один к одному: то же название и ЕИ
    -- (по порядку среди одноимённых), а если таких нет и материалов у работ поровну — по порядку внутри работы
    select y.old_id, y.new_id from (
      select p.id old_id, wm.new_work new_id
      from prev_raw p join planfact.vor_source_rows o on o.id = p.id and o.project_id = p_project and o.kind = 'work'
      join wmap wm on wm.old_work = o.id
      union all
      select p.id, case when wm.new_work = o.parent_row_id then (select s.id from src s where s.id = o.id)
                        else coalesce(
                          (select n.id from mr_new n where n.parent_row_id = wm.new_work and n.cn = om.cn and n.un = om.un and n.rn_name = om.rn_name),
                          (select n.id from mr_new n where n.parent_row_id = wm.new_work and n.cnt = om.cnt and n.rn_all = om.rn_all
                             and not exists (select 1 from mr_new n2 where n2.parent_row_id = wm.new_work and n2.cn = om.cn and n2.un = om.un))) end
      from prev_raw p join planfact.vor_source_rows o on o.id = p.id and o.project_id = p_project and o.kind = 'material'
      join wmap wm on wm.old_work = o.parent_row_id
      join mr_old om on om.id = o.id
    ) y where y.new_id is not null
  ), prev as (
    select m.new_id id, sum(p.q) q from prev_raw p join prev_map m on m.old_id = p.id group by m.new_id
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
$function$;

commit;
