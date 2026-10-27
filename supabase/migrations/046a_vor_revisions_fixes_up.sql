-- P2-0006d (046a): доработки редакций ВОР по ревью 046 (акт приёмки P2-0006b).
--   1) перенос факта: получатель из другой ВОР блокируется до проверки; перенос сверх плана получателя с допуском — отказ
--      (иначе перенос обходил бы подтверждение РП); автор записи сохраняется; запись «на подтверждении» без исправления
--      исправлением не становится; повторное решение по одной позиции — отказ; копии — в журнале принятия;
--   2) КС-2: выставленное по строкам прежней редакции находится на строках нового договорного КП через ту же позицию —
--      смена КП на смету по новой редакции не выставляет объём повторно;
--   3) база сравнения — только с правом planfact.vor.manage (в ней объёмы факта);
--   4) пачка факта блокирует позиции по порядку id; «позиций здесь» в сводке по местам — по тому же правилу, что «позиций»;
--      search_path функций с временными таблицами — с pg_temp в конце.
-- Применять после 046, одним запросом. Откат — 046a_vor_revisions_fixes_down.sql.
begin;

do $$
begin
  if to_regclass('planfact.vor_heads') is null then raise exception 'Сначала 046' using errcode = 'P0001'; end if;
end $$;

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

  -- блокировка позиций цепочки (ввод факта ждёт), затем проверки под блокировкой
  perform 1 from planfact.vor_positions p join planfact.vor_imports i on i.id = p.import_id
  where coalesce(i.root_import_id, i.id) = v_i.root_import_id order by p.id for update of p;
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
  -- позиции-получатели переноса из других цепочек — блокировка до проверки (одновременное принятие другой ВОР ждёт)
  perform 1 from planfact.vor_positions p
  where p.id in (select x.to_position_id from jsonb_to_recordset(p_red) as x(to_position_id uuid) where x.to_position_id is not null)
  order by p.id for update;
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

CREATE OR REPLACE FUNCTION public.pf_vor_revision_base(p_import uuid)
 RETURNS TABLE(source_row_id uuid, row_no integer, number text, name text, unit_text text, qty numeric, context jsonb, location_id uuid, work_type_id uuid, unit_id uuid, position_id uuid, position_qty numeric, fact_qty numeric, pending_qty numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core', 'pg_temp'
AS $function$
declare v_i planfact.vor_imports;
begin
  select * into v_i from planfact.vor_imports where id = p_import;
  if v_i.id is null or auth.uid() is null or not planfact.is_project_member(v_i.project_id) then
    raise exception 'Загрузка не найдена' using errcode = '22023';
  end if;
  -- база сравнения (с объёмами факта) — только тем, кто принимает редакцию
  perform planfact.require_vor_manage(v_i.project_id);
  if v_i.previous_import_id is null then raise exception 'Это первая загрузка — сравнивать не с чем' using errcode = '22023'; end if;
  return query
  select s.id, s.row_no, s.number, s.name, s.unit_text, s.qty, s.context, s.location_id, s.work_type_id, s.unit_id,
         c.id, c.qty,
         coalesce((select sum(e.qty) from planfact.fact_entries e where e.position_id = c.id and e.status = 'accepted'), 0),
         coalesce((select sum(e.qty) from planfact.fact_entries e where e.position_id = c.id and e.status = 'pending_approval'), 0)
  from planfact.vor_source_rows s
  left join planfact.vor_links l on l.source_row_id = s.id
  left join planfact.vor_positions_current c on c.id = l.position_id and not c.withdrawn
  where s.import_id = v_i.previous_import_id and s.kind = 'work'
  order by s.row_no, c.id;
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
  ), prev_map as (
    -- P2-0006d: выставленное по строкам прежней редакции ВОР — на строки этого КП через ту же позицию
    -- (работа: строка → позиция → строка-работа этого КП; материал: его работа сопоставлена, то же название и ЕИ)
    select p.id old_id, p.id new_id from prev_raw p where exists (select 1 from src s where s.id = p.id)
    union all
    select distinct p.id, s2.id from prev_raw p
    join planfact.vor_source_rows o on o.id = p.id and o.project_id = p_project and o.kind = 'work'
    join planfact.vor_links l1 on l1.source_row_id = o.id
    join planfact.vor_links l2 on l2.position_id = l1.position_id and l2.source_row_id <> o.id
    join src s2 on s2.id = l2.source_row_id and s2.kind = 'work'
    where not exists (select 1 from src s where s.id = p.id)
    union all
    select distinct p.id, s2.id from prev_raw p
    join planfact.vor_source_rows o on o.id = p.id and o.project_id = p_project and o.kind = 'material'
    join planfact.vor_links l1 on l1.source_row_id = o.parent_row_id
    join planfact.vor_links l2 on l2.position_id = l1.position_id and l2.source_row_id <> o.parent_row_id
    join src s2 on s2.parent_row_id = l2.source_row_id and s2.kind = 'material'
         and planfact.canon_name(s2.name) = planfact.canon_name(o.name) and coalesce(s2.unit_text, '') = coalesce(o.unit_text, '')
    where not exists (select 1 from src s where s.id = p.id)
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

CREATE OR REPLACE FUNCTION public.pf_summary_places(p_project uuid, p_location uuid DEFAULT NULL::uuid)
 RETURNS TABLE(location_id uuid, name text, node_type text, depth integer, children integer, positions integer, here_positions integer, plan_money numeric, done_money numeric, pct_money numeric, units jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_money boolean; v_today date := planfact.fact_today(); v_kp uuid;
begin
  v_money := planfact.require_summary_view(p_project);
  if p_location is not null and not exists (select 1 from core.locations l where l.id = p_location and l.project_id = p_project and l.deleted_at is null) then
    raise exception 'Место не найдено в проекте' using errcode = '22023';
  end if;
  select st.contract_kp_revision_id into v_kp from planfact.ks2_settings st where st.project_id = p_project;
  return query
  with recursive tree(root, id) as (
    select l.id, l.id from core.locations l
    where l.project_id = p_project and l.deleted_at is null and l.parent_id is not distinct from p_location
    union all
    select t.root, c.id from core.locations c join tree t on c.parent_id = t.id where c.deleted_at is null
  ), ft as materialized (
    select * from planfact.fact_totals(p_project)
  ), mon as materialized (
    select * from planfact.position_money(p_project, v_kp, v_today) where v_kp is not null
  ), pos as (
    select t.root, p.id, u.code, ft.plan_qty, ft.fact_qty, mon.plan_money pm, mon.done_money dm
    from tree t join planfact.vor_positions p on p.location_id = t.id and p.project_id = p_project
    join core.units u on u.id = p.unit_id
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
         (select count(*)::int from core.locations c where c.parent_id = l.id and c.deleted_at is null),
         coalesce(agg.n, 0), (select count(*)::int from planfact.vor_positions vp join ft on ft.position_id = vp.id
                                where vp.project_id = p_project and vp.location_id = l.id),
         case when v_money and v_kp is not null then round(coalesce(agg.pm, 0), 2) end,
         case when v_money and v_kp is not null then round(coalesce(agg.dm, 0), 2) end,
         case when v_money and agg.pm > 0 then round(agg.dm / agg.pm * 100, 1) end,
         coalesce(vol.u, '[]'::jsonb)
  from core.locations l
  left join agg on agg.root = l.id left join vol on vol.root = l.id
  where l.project_id = p_project and l.deleted_at is null and l.parent_id is not distinct from p_location
  order by l.sort_order, l.name, l.id;
end $function$;

CREATE OR REPLACE FUNCTION public.pf_fact_add_batch(p_project uuid, p_brigade uuid, p_date date, p_items jsonb, p_workers integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text, p_require_approval boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_company uuid; v_batch uuid := gen_random_uuid(); it jsonb; v_res jsonb; v_acc int := 0; v_pen int := 0; v_seen uuid[] := '{}'; v_pos uuid;
        v_force boolean := coalesce(p_require_approval, false); v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  v_company := planfact.require_fact_create(p_project);
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'В пачке нет строк' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'В пачке не больше 500 строк' using errcode = '22023'; end if;
  -- позиции пачки — блокировка по порядку id (как при принятии редакции ВОР): без взаимоблокировки
  perform 1 from planfact.vor_positions p
  where p.project_id = p_project and p.id in (select (x ->> 'position_id')::uuid from jsonb_array_elements(p_items) x)
  order by p.id for update;
  if v_force then
    v_note := left('Закрытие через РП' || coalesce('. ' || v_note, ''), 1000);
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_pos := (it ->> 'position_id')::uuid;
    if v_pos is null or v_pos = any(v_seen) then raise exception 'Позиция указана дважды или не указана' using errcode = '22023'; end if;
    v_seen := v_seen || v_pos;
    v_res := planfact.fact_insert(v_company, p_project, v_pos, p_brigade, p_date, (it ->> 'qty')::numeric, p_workers,
                                  (it ->> 'man_hours')::numeric, v_note, v_batch, null, null);
    if v_force and v_res ->> 'status' = 'accepted' then
      perform set_config('planfact.fact_tx', '1', true);
      update planfact.fact_entries set status = 'pending_approval' where id = (v_res ->> 'id')::uuid;
      perform set_config('planfact.fact_tx', '0', true);
      perform planfact.log_admin_change(v_company, p_project, 'fact_entries', (v_res ->> 'id')::uuid, 'FORCE_PENDING',
        jsonb_build_object('status', 'accepted'), jsonb_build_object('status', 'pending_approval', 'reason', 'Закрытие через РП'));
      v_res := jsonb_set(v_res, '{status}', '"pending_approval"');
    end if;
    if v_res ->> 'status' = 'accepted' then v_acc := v_acc + 1; else v_pen := v_pen + 1; end if;
  end loop;
  return jsonb_build_object('batch_id', v_batch, 'accepted', v_acc, 'pending', v_pen);
exception when others then
  perform set_config('planfact.fact_tx', '0', true);
  raise;
end $function$;

alter function public.pf_vor_create_revision(uuid, text, text, text, uuid, jsonb) set search_path = pg_catalog, planfact, core, pg_temp;
alter function public.pf_vor_revision_changes(uuid) set search_path = pg_catalog, planfact, core, pg_temp;

commit;
