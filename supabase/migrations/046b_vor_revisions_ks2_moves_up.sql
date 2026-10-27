-- P2-0006d доработка (046b): замечания приёмки по ревью 046a (карточка P2-0006d, §9).
--   1) КС-2: выставленное идёт за перенесённым при редакции ВОР фактом (planfact.position_moved_to) — перенос на
--      существующую или новую позицию, в ту же или другую ВОР, не выставляет объём повторно;
--   2) материалы — один к одному: то же название и ЕИ (ЕИ без пробелов и точек, ²/³ = 2/3) по порядку среди одноимённых;
--      нет таких и материалов у работ поровну — по порядку внутри работы;
--   3) принятие редакции блокирует позиции цепочки и получателей переноса одним запросом по id, получателей — только этого проекта.
-- Применять после 046a, одним запросом. Откат — 046b_vor_revisions_ks2_moves_down.sql.
begin;

do $$
begin
  if to_regprocedure('planfact.position_moved_to(uuid)') is not null then raise exception '046b уже применена' using errcode = 'P0001'; end if;
end $$;

-- Конечная позиция факта после переносов при редакциях ВОР: перенос — принятая копия записи на другой позиции с причиной
-- «Перенос при редакции ВОР №…» (046 / 046a); цепочка переносов — до конца (не больше 50 шагов).
create function planfact.position_moved_to(p_position uuid) returns uuid
language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  with recursive m(pos, depth) as (
    select p_position, 0
    union all
    select (select e2.position_id from planfact.fact_entries e1
              join planfact.fact_entries e2 on e2.corrects_id = e1.id and e2.position_id <> e1.position_id
             where e1.position_id = m.pos and e2.correction_reason like 'Перенос при редакции ВОР №%'
             order by e2.created_at, e2.id limit 1), m.depth + 1
    from m where m.pos is not null and m.depth < 50
  )
  select pos from m where pos is not null order by depth desc limit 1;
$$;
revoke all on function planfact.position_moved_to(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pf_vor_accept_revision(p_import uuid, p_items jsonb, p_red jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core', 'pg_temp'
AS $function$
declare v_i planfact.vor_imports; v_h planfact.vor_heads; v_n int; v_bad int; v_open int; v_txt text; r record; fe record;
        v_pos uuid; v_new int := 0; v_same int := 0; v_qty int := 0; v_wd int := 0; v_moved int := 0; v_kept int := 0; v_eid uuid;
        v_map jsonb := '{}'::jsonb; v_plan numeric; v_tol numeric; v_sum numeric; v_move numeric;
begin
  v_i := planfact.require_vor_draft(p_import);
  if v_i.previous_import_id is null then raise exception 'Это первая загрузка — подтвердите её' using errcode = '22023'; end if;
  select * into v_h from planfact.vor_heads where root_import_id = v_i.root_import_id for update;
  if v_h.current_import_id is distinct from v_i.previous_import_id then
    raise exception 'Редакция уже сменилась — загрузите файл заново к действующей редакции' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Ожидается массив строк' using errcode = '22023'; end if;
  if p_red is null or jsonb_typeof(p_red) <> 'array' then raise exception 'Ожидается массив решений' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) > 10000 or jsonb_array_length(p_red) > 10000 then
    raise exception 'Слишком много строк' using errcode = '22023';
  end if;

  select count(*) into v_open from planfact.vor_source_rows
  where import_id = p_import and kind = 'work'
    and (location_id is null or work_type_id is null or unit_id is null or qty is null or qty < 0 or match is distinct from 'green');
  if v_open > 0 then
    raise exception 'Не разобрано строк-работ: % (место, вид работ, ЕИ, объём или неподтверждённый цвет)', v_open using errcode = '22023';
  end if;
  select count(*) into v_n from planfact.vor_source_rows where import_id = p_import and kind = 'work';
  if v_n = 0 then raise exception 'В загрузке нет строк-работ' using errcode = '22023'; end if;

  -- сопоставление: каждая строка-работа ровно один раз, каждая позиция — не больше одного раза
  create temp table if not exists pg_temp.vor_acc_items(row_no int, position_id uuid, source_row_id uuid, new_pos uuid) on commit drop;
  truncate pg_temp.vor_acc_items;
  insert into pg_temp.vor_acc_items(row_no, position_id)
  select x.row_no, x.position_id from jsonb_to_recordset(p_items) as x(row_no int, position_id uuid);
  update pg_temp.vor_acc_items a set source_row_id = s.id
  from planfact.vor_source_rows s where s.import_id = p_import and s.row_no = a.row_no and s.kind = 'work';
  select count(*) into v_bad from pg_temp.vor_acc_items where source_row_id is null;
  if v_bad > 0 then raise exception 'Строк нет в черновике или это не работы: %', v_bad using errcode = '22023'; end if;
  if (select count(distinct row_no) from pg_temp.vor_acc_items) <> (select count(*) from pg_temp.vor_acc_items)
     or (select count(*) from pg_temp.vor_acc_items) <> v_n then
    raise exception 'Нужно решение по каждой строке-работе ровно один раз (строк: %)', v_n using errcode = '22023';
  end if;
  if exists (select position_id from pg_temp.vor_acc_items where position_id is not null group by position_id having count(*) > 1) then
    raise exception 'Одна позиция сопоставлена с несколькими строками' using errcode = '22023';
  end if;

  -- блокировка позиций цепочки и получателей переноса (только этого проекта) — одним запросом по порядку id
  -- (ввод факта и одновременное принятие другой ВОР ждут; без взаимоблокировок), затем проверки под блокировкой
  perform 1 from planfact.vor_positions p join planfact.vor_imports i on i.id = p.import_id
  where coalesce(i.root_import_id, i.id) = v_i.root_import_id
     or (p.project_id = v_i.project_id and p.id in (select x.to_position_id from jsonb_to_recordset(p_red) as x(to_position_id uuid)
                                                    where x.to_position_id is not null))
  order by p.id for update of p;
  select string_agg(a.row_no::text, ', ' order by a.row_no) into v_txt
  from pg_temp.vor_acc_items a
  left join planfact.vor_positions_current c on c.id = a.position_id
  where a.position_id is not null and (c.id is null or c.withdrawn or c.root_import_id <> v_i.root_import_id);
  if v_txt is not null then raise exception 'Строки %: позиция не из действующей редакции', v_txt using errcode = '22023'; end if;
  select string_agg(a.row_no::text, ', ' order by a.row_no) into v_txt
  from pg_temp.vor_acc_items a join planfact.vor_source_rows s on s.id = a.source_row_id
  join planfact.vor_positions_current c on c.id = a.position_id
  where (s.location_id, s.work_type_id, s.unit_id) is distinct from (c.location_id, c.work_type_id, c.unit_id);
  if v_txt is not null then raise exception 'Строки %: место, вид работ или ЕИ не совпадают с позицией', v_txt using errcode = '22023'; end if;

  -- снимаемые: действующие позиции цепочки, которых нет среди сопоставленных
  create temp table if not exists pg_temp.vor_acc_gone(position_id uuid, qty numeric, has_fact boolean, action text, to_position uuid,
                                                      to_row_no int) on commit drop;
  truncate pg_temp.vor_acc_gone;
  insert into pg_temp.vor_acc_gone(position_id, qty, has_fact)
  select c.id, c.qty, exists (select 1 from planfact.fact_entries e where e.position_id = c.id and e.status in ('accepted', 'pending_approval'))
  from planfact.vor_positions_current c
  where c.root_import_id = v_i.root_import_id and not c.withdrawn
    and not exists (select 1 from pg_temp.vor_acc_items a where a.position_id = c.id);
  if (select count(*) from jsonb_to_recordset(p_red) as x(position_id uuid)) <> (select count(distinct x.position_id) from jsonb_to_recordset(p_red) as x(position_id uuid)) then
    raise exception 'Решение по одной позиции указано дважды' using errcode = '22023';
  end if;
  update pg_temp.vor_acc_gone g set action = x.action, to_position = x.to_position_id, to_row_no = x.to_row_no
  from jsonb_to_recordset(p_red) as x(position_id uuid, action text, to_position_id uuid, to_row_no int)
  where x.position_id = g.position_id;
  if (select count(*) from jsonb_to_recordset(p_red) as x(position_id uuid)
      where not exists (select 1 from pg_temp.vor_acc_gone g where g.position_id = x.position_id and g.has_fact)) > 0 then
    raise exception 'Решение по позиции, которая не снимается или без факта' using errcode = '22023';
  end if;
  select count(*) into v_bad from pg_temp.vor_acc_gone where has_fact and (action is null or action not in ('keep', 'move'));
  if v_bad > 0 then raise exception 'Есть снимаемые позиции с фактом без решения: %', v_bad using errcode = '22023'; end if;
  select count(*) into v_bad from pg_temp.vor_acc_gone g
  where g.action = 'move' and not (
    (g.to_position is not null and g.to_row_no is null and exists (
       select 1 from planfact.vor_positions_current c where c.id = g.to_position and c.project_id = v_i.project_id and not c.withdrawn
         and c.unit_id = (select p.unit_id from planfact.vor_positions p where p.id = g.position_id)
         and not exists (select 1 from pg_temp.vor_acc_gone g2 where g2.position_id = c.id)))
    or (g.to_row_no is not null and g.to_position is null and exists (
       select 1 from pg_temp.vor_acc_items a join planfact.vor_source_rows s on s.id = a.source_row_id
       where a.row_no = g.to_row_no and a.position_id is null
         and s.unit_id = (select p.unit_id from planfact.vor_positions p where p.id = g.position_id))));
  if v_bad > 0 then raise exception 'Перенос факта: позиция-получатель не найдена, снимается или другая ЕИ' using errcode = '22023'; end if;

  -- новые позиции и связки
  for r in select a.*, s.location_id, s.work_type_id, s.unit_id, s.qty, s.context from pg_temp.vor_acc_items a
           join planfact.vor_source_rows s on s.id = a.source_row_id order by a.row_no loop
    if r.position_id is null then
      insert into planfact.vor_positions(company_id, project_id, import_id, location_id, work_type_id, unit_id, qty, apartments_note, status)
      values (v_i.company_id, v_i.project_id, p_import, r.location_id, r.work_type_id, r.unit_id, r.qty,
              nullif(concat_ws(' · ',
                case when (r.context -> 'floor' ->> 'from') is distinct from (r.context -> 'floor' ->> 'to')
                     then 'эт. ' || (r.context -> 'floor' ->> 'from') || '–' || (r.context -> 'floor' ->> 'to') end,
                nullif(r.context ->> 'apartments', '')), ''),
              'confirmed')
      returning id into v_pos;
      update pg_temp.vor_acc_items set new_pos = v_pos where row_no = r.row_no;
      v_new := v_new + 1;
    else
      v_pos := r.position_id;
      if r.qty is distinct from (select c.qty from planfact.vor_positions_current c where c.id = v_pos) then
        insert into planfact.vor_position_events(company_id, project_id, position_id, import_id, kind, qty_before, qty_after, created_by)
        select v_i.company_id, v_i.project_id, v_pos, p_import, 'qty', c.qty, r.qty, auth.uid()
        from planfact.vor_positions_current c where c.id = v_pos;
        v_qty := v_qty + 1;
      else
        v_same := v_same + 1;
      end if;
    end if;
    insert into planfact.vor_links(project_id, source_row_id, position_id, share) values (v_i.project_id, r.source_row_id, v_pos, 1);
  end loop;

  -- снятие и перенос факта (новой записью с причиной, старая — superseded)
  for r in select * from pg_temp.vor_acc_gone loop
    insert into planfact.vor_position_events(company_id, project_id, position_id, import_id, kind, qty_before, qty_after, created_by)
    values (v_i.company_id, v_i.project_id, r.position_id, p_import, 'withdrawn', r.qty, r.qty, auth.uid());
    v_wd := v_wd + 1;
    if r.action = 'keep' then v_kept := v_kept + 1; end if;
    if r.action = 'move' then
      v_pos := coalesce(r.to_position, (select a.new_pos from pg_temp.vor_acc_items a where a.row_no = r.to_row_no));
      -- перенос не обходит подтверждение РП: принятый факт получателя с переносом — не больше плана с допуском
      select case when c.withdrawn then 0 else c.qty end into v_plan from planfact.vor_positions_current c where c.id = v_pos;
      select fact_tolerance_pct into v_tol from core.projects where id = v_i.project_id;
      select coalesce(sum(qty), 0) into v_sum from planfact.fact_entries where position_id = v_pos and status = 'accepted';
      select coalesce(sum(qty), 0) into v_move from planfact.fact_entries where position_id = r.position_id and status = 'accepted';
      if v_sum + v_move > v_plan * (1 + coalesce(v_tol, 0) / 100) then
        raise exception 'Перенос факта (% ) больше остатка плана позиции-получателя (план %, уже %) — выберите другую позицию или «Оставить»',
          v_move, v_plan, v_sum using errcode = '22023';
      end if;
      perform set_config('planfact.fact_tx', '1', true);
      -- исправляемая запись — раньше своего исправления (время записей одной операции совпадает)
      for fe in with recursive mv as (
                  select x.*, 0 as depth from planfact.fact_entries x
                  where x.position_id = r.position_id and x.status in ('accepted', 'pending_approval')
                    and (x.corrects_id is null or not exists (select 1 from planfact.fact_entries y where y.id = x.corrects_id
                           and y.position_id = r.position_id and y.status in ('accepted', 'pending_approval')))
                  union all
                  select x.*, mv.depth + 1 from planfact.fact_entries x join mv on x.corrects_id = mv.id
                  where x.position_id = r.position_id and x.status in ('accepted', 'pending_approval'))
                select * from mv order by depth, created_at, id loop
        insert into planfact.fact_entries(company_id, project_id, position_id, brigade_id, work_date, qty, workers, man_hours, note,
                                          status, corrects_id, correction_reason, batch_id, period_from, created_by)
        values (fe.company_id, fe.project_id, v_pos, fe.brigade_id, fe.work_date, fe.qty, fe.workers, fe.man_hours, fe.note,
                fe.status,
                -- принятая копия заменяет перенесённую запись; исправление на подтверждении — копию исправляемой;
                -- запись на подтверждении без исправления исправлением не становится (связь — в причине и журнале)
                case when fe.status = 'accepted' then fe.id
                     when fe.corrects_id is not null and v_map ? fe.corrects_id::text then (v_map ->> fe.corrects_id::text)::uuid end,
                'Перенос при редакции ВОР №' || v_i.revision_no, fe.batch_id, fe.period_from, fe.created_by)
        returning id into v_eid;
        v_map := v_map || jsonb_build_object(fe.id::text, v_eid);
        update planfact.fact_entries set status = 'superseded', decided_by = auth.uid(), decided_at = now(),
               decision_note = 'Перенос при редакции ВОР №' || v_i.revision_no
        where id = fe.id;
        v_moved := v_moved + 1;
      end loop;
      perform set_config('planfact.fact_tx', '0', true);
    end if;
  end loop;

  -- сумма позиций = объёму строки заказчика (по действующему объёму)
  select count(*) into v_bad from planfact.vor_source_rows s
  where s.import_id = p_import and s.kind = 'work'
    and s.qty is distinct from (select sum(c.qty * l.share) from planfact.vor_links l join planfact.vor_positions_current c on c.id = l.position_id
                                where l.source_row_id = s.id);
  if v_bad > 0 then raise exception 'Сумма позиций не сходится с объёмом строки заказчика: % строк', v_bad using errcode = '22023'; end if;

  update planfact.vor_imports set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_import;
  update planfact.vor_heads set current_import_id = p_import, changed_at = now(), changed_by = auth.uid()
  where root_import_id = v_i.root_import_id;
  perform planfact.log_admin_change(v_i.company_id, v_i.project_id, 'vor_imports', p_import, 'ACCEPT_REVISION',
    jsonb_build_object('current_import_id', v_i.previous_import_id),
    jsonb_build_object('current_import_id', p_import, 'revision_no', v_i.revision_no, 'file_name', v_i.file_name,
                       'added', v_new, 'unchanged', v_same, 'qty_changed', v_qty, 'withdrawn', v_wd,
                       'fact_kept', v_kept, 'fact_moved_entries', v_moved, 'moved', v_map));
  return jsonb_build_object('revision_no', v_i.revision_no, 'added', v_new, 'unchanged', v_same, 'qty_changed', v_qty,
                            'withdrawn', v_wd, 'fact_kept', v_kept, 'fact_moved_entries', v_moved);
exception when others then
  perform set_config('planfact.fact_tx', '0', true);
  raise;
end $function$;

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
