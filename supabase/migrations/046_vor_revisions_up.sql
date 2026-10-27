-- P2-0006b (046): редакции ВОР — новая редакция к действующей, сравнение, принятие одной функцией.
--   1) у загрузки — номер редакции, предыдущая и первая редакция цепочки (vor_imports: только новые столбцы,
--      подтверждённые строки не меняются — триггер неизменяемости не ослаблен);
--   2) «действующая» — одно поле: planfact.vor_heads.current_import_id (одна на цепочку); все существующие
--      подтверждённые загрузки — редакция №1, действующая;
--   3) позиция переживает редакцию (тот же id, факт не переносится): изменение объёма и «снята» — события
--      planfact.vor_position_events (только добавление); текущее состояние — planfact.vor_positions_current;
--   4) план во всех расчётах — из planfact.fact_totals (действующий объём; у снятой — 0, снятая без факта не видна);
--      признак «снята» — в списках позиций ВОР, факта и сводки;
--   5) pf_vor_create_revision / pf_vor_revision_base / pf_vor_accept_revision / pf_vor_revision_changes.
-- Применять после 045, одним запросом. Откат — 046_vor_revisions_down.sql.
begin;

do $$
begin
  if to_regclass('core.divisions') is null then raise exception 'Сначала 045' using errcode = 'P0001'; end if;
  if to_regclass('planfact.vor_heads') is not null then raise exception '046 уже применена' using errcode = 'P0001'; end if;
end $$;

-- 1. Редакция у загрузки (добавление столбцов не трогает строки — триггер vor_imports_guard не срабатывает).
alter table planfact.vor_imports
  add column revision_no int not null default 1,
  add column previous_import_id uuid,
  add column root_import_id uuid,
  add constraint vor_imports_revision_no_chk check (revision_no between 1 and 1000),
  add constraint vor_imports_revision_chain_chk check (
    (previous_import_id is null and root_import_id is null and revision_no = 1)
    or (previous_import_id is not null and root_import_id is not null and revision_no > 1)),
  add constraint vor_imports_previous_fkey foreign key (previous_import_id, project_id)
    references planfact.vor_imports(id, project_id) on delete cascade,
  add constraint vor_imports_root_fkey foreign key (root_import_id, project_id)
    references planfact.vor_imports(id, project_id) on delete cascade;
create unique index vor_imports_one_draft_per_previous on planfact.vor_imports(previous_import_id)
  where previous_import_id is not null and status = 'draft';
create unique index vor_imports_chain_revision on planfact.vor_imports(root_import_id, revision_no)
  where root_import_id is not null and status = 'confirmed';

-- 2. Действующая редакция цепочки (цепочка = первая редакция).
create table planfact.vor_heads (
  id uuid primary key default gen_random_uuid(),
  root_import_id uuid not null unique,
  company_id uuid not null,
  project_id uuid not null,
  current_import_id uuid not null unique,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  foreign key (root_import_id, project_id) references planfact.vor_imports(id, project_id) on delete cascade,
  foreign key (current_import_id, project_id) references planfact.vor_imports(id, project_id) on delete cascade,
  foreign key (project_id, company_id) references core.projects(id, company_id) on delete cascade
);
create index vor_heads_project on planfact.vor_heads(project_id);
insert into planfact.vor_heads(root_import_id, company_id, project_id, current_import_id, changed_at, changed_by)
select i.id, i.company_id, i.project_id, i.id, coalesce(i.confirmed_at, i.created_at), i.confirmed_by
from planfact.vor_imports i where i.status = 'confirmed';
alter table planfact.vor_heads enable row level security;
create policy vor_heads_select on planfact.vor_heads for select to authenticated
  using (planfact.is_project_member(project_id));
revoke all on planfact.vor_heads from public, anon, authenticated;
grant select on planfact.vor_heads to authenticated;

-- 3. События позиции: объём изменён / снята в редакции №N (только добавление).
create table planfact.vor_position_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  company_id uuid not null,
  project_id uuid not null,
  position_id uuid not null references planfact.vor_positions(id) on delete cascade,
  import_id uuid not null,
  kind text not null check (kind in ('qty', 'withdrawn')),
  qty_before numeric not null check (qty_before >= 0),
  qty_after numeric not null check (qty_after >= 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  foreign key (import_id, project_id) references planfact.vor_imports(id, project_id) on delete cascade,
  foreign key (project_id, company_id) references core.projects(id, company_id) on delete cascade
);
create index vor_position_events_position on planfact.vor_position_events(position_id, seq desc);
create index vor_position_events_import on planfact.vor_position_events(import_id);
alter table planfact.vor_position_events enable row level security;
create policy vor_position_events_select on planfact.vor_position_events for select to authenticated
  using (planfact.is_project_member(project_id));
revoke all on planfact.vor_position_events from public, anon, authenticated;
grant select on planfact.vor_position_events to authenticated;

create function planfact.vor_events_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Событие редакции ВОР изменить нельзя' using errcode = '42501';
  end if;
  -- удаление — только вместе с проектом / позицией (каскад), не отдельным запросом
  if pg_trigger_depth() < 2 then
    raise exception 'Событие редакции ВОР удалить нельзя' using errcode = '42501';
  end if;
  return old;
end $$;
revoke all on function planfact.vor_events_guard() from public, anon, authenticated;
create trigger vor_position_events_guard before update or delete on planfact.vor_position_events
  for each row execute function planfact.vor_events_guard();

-- Текущее состояние позиции: объём по последнему событию, признак «снята». Единственный источник для расчётов.
create view planfact.vor_positions_current with (security_invoker = true) as
select p.id, p.company_id, p.project_id, p.import_id, p.location_id, p.work_type_id, p.unit_id,
       coalesce(ev.qty_after, p.qty) as qty, p.qty as base_qty, p.apartments_note,
       coalesce(ev.kind = 'withdrawn', false) as withdrawn,
       ev.import_id as changed_import_id,
       coalesce(i.root_import_id, i.id) as root_import_id
from planfact.vor_positions p
join planfact.vor_imports i on i.id = p.import_id
left join lateral (
  select e.kind, e.qty_after, e.import_id from planfact.vor_position_events e
  where e.position_id = p.id order by e.seq desc limit 1
) ev on true;
revoke all on planfact.vor_positions_current from public, anon, authenticated;

-- 4. План: действующий объём; снятая — план 0, видна только если на ней есть факт (принятый или на подтверждении).
CREATE OR REPLACE FUNCTION planfact.fact_totals(p_project uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(position_id uuid, plan_qty numeric, fact_qty numeric, pending_qty numeric, pending_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
  select p.id, case when p.withdrawn then 0 else p.qty end,
         coalesce(sum(e.qty) filter (where e.status = 'accepted'), 0),
         coalesce(sum(e.qty) filter (where e.status = 'pending_approval'), 0),
         (count(e.id) filter (where e.status = 'pending_approval'))::int
  from planfact.vor_positions_current p
  left join planfact.fact_entries e on e.position_id = p.id and e.project_id = p_project
       and (p_from is null or e.work_date >= p_from) and (p_to is null or e.work_date <= p_to)
  where p.project_id = p_project
    and (not p.withdrawn or exists (select 1 from planfact.fact_entries x where x.position_id = p.id
                                     and x.status in ('accepted', 'pending_approval')))
  group by p.id, p.qty, p.withdrawn;
$function$;

-- Ввод факта: допуск — от действующего объёма; на снятую позицию новый факт не вносится (исправление — можно).
CREATE OR REPLACE FUNCTION planfact.fact_insert(p_company uuid, p_project uuid, p_position uuid, p_brigade uuid, p_date date, p_qty numeric, p_workers integer, p_man_hours numeric, p_note text, p_batch uuid, p_corrects uuid, p_reason text, p_period_from date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_pos planfact.vor_positions; v_tol numeric; v_qty numeric := round(p_qty, 3); v_sum numeric; v_old planfact.fact_entries;
        v_status text; v_id uuid; v_from date := p_period_from; v_plan numeric; v_withdrawn boolean;
begin
  select * into v_pos from planfact.vor_positions where id = p_position and project_id = p_project for update;
  if v_pos.id is null then raise exception 'Позиция не найдена в проекте' using errcode = '22023'; end if;
  select case when c.withdrawn then 0 else c.qty end, c.withdrawn into v_plan, v_withdrawn
  from planfact.vor_positions_current c where c.id = p_position;
  if v_withdrawn and p_corrects is null then
    raise exception 'Позиция снята в новой редакции ВОР — вносите факт на действующую позицию' using errcode = '22023';
  end if;
  if p_brigade is null or not exists (select 1 from planfact.brigades b where b.id = p_brigade and b.company_id = p_company) then
    raise exception 'Укажите бригаду' using errcode = '22023';
  end if;
  if not exists (select 1 from planfact.brigades b where b.id = p_brigade and b.archived_at is null) then
    raise exception 'Бригада в архиве — выберите действующую' using errcode = '22023';
  end if;
  if v_qty is null or v_qty <= 0 then raise exception 'Объём должен быть больше нуля' using errcode = '22023'; end if;
  if p_date is null then raise exception 'Укажите дату' using errcode = '22023'; end if;
  if p_date > planfact.fact_today() then raise exception 'Дата не может быть в будущем' using errcode = '22023'; end if;
  if p_workers is not null and (p_workers < 0 or p_workers > 10000) then raise exception 'Неверное число людей' using errcode = '22023'; end if;
  if p_man_hours is not null and (p_man_hours < 0 or p_man_hours > 1000000) then raise exception 'Неверное число чел.-ч' using errcode = '22023'; end if;

  select fact_tolerance_pct into v_tol from core.projects where id = p_project;
  select coalesce(sum(qty), 0) into v_sum from planfact.fact_entries where position_id = p_position and status = 'accepted';
  if p_corrects is not null then
    select * into v_old from planfact.fact_entries where id = p_corrects;
    if v_old.status = 'accepted' then v_sum := v_sum - v_old.qty; end if;
    v_from := coalesce(v_from, v_old.period_from);
  end if;
  if v_from is not null then
    if v_from > p_date then raise exception 'Начало периода позже конца' using errcode = '22023'; end if;
    if p_date - v_from > 30 then raise exception 'Период — не больше 31 дня' using errcode = '22023'; end if;
  end if;
  -- Исправление, не увеличивающее прежний объём записи, подтверждения не требует (перебор уже согласован или уменьшается).
  v_status := case when v_sum + v_qty > v_plan * (1 + v_tol / 100) and not (p_corrects is not null and v_qty <= v_old.qty)
                   then 'pending_approval' else 'accepted' end;

  perform set_config('planfact.fact_tx', '1', true);
  insert into planfact.fact_entries(company_id, project_id, position_id, brigade_id, work_date, qty, workers, man_hours, note,
                                    status, corrects_id, correction_reason, batch_id, period_from)
  values (p_company, p_project, p_position, p_brigade, p_date, v_qty, p_workers, p_man_hours, nullif(btrim(coalesce(p_note, '')), ''),
          v_status, p_corrects, nullif(btrim(coalesce(p_reason, '')), ''), p_batch, v_from)
  returning id into v_id;
  -- Исправление, не требующее подтверждения, сразу заменяет старую запись.
  if p_corrects is not null and v_status = 'accepted' and v_old.status in ('accepted', 'pending_approval') then
    update planfact.fact_entries set status = 'superseded', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_reason), '')
    where id = p_corrects;
  end if;
  perform set_config('planfact.fact_tx', '0', true);
  perform planfact.log_admin_change(p_company, p_project, 'fact_entries', v_id, case when p_corrects is null then 'INSERT' else 'CORRECT' end,
    case when p_corrects is not null then jsonb_build_object('entry', p_corrects, 'qty', v_old.qty) end,
    jsonb_build_object('position_id', p_position, 'qty', v_qty, 'status', v_status, 'work_date', p_date, 'batch_id', p_batch,
                       'reason', nullif(btrim(coalesce(p_reason, '')), '')) || case when v_from is not null then jsonb_build_object('period_from', v_from) else '{}'::jsonb end);
  return jsonb_build_object('id', v_id, 'status', v_status);
exception when others then
  perform set_config('planfact.fact_tx', '0', true);
  raise;
end $function$;

-- Первая загрузка: подтверждение делает её редакцией №1, действующей. Новая редакция так не подтверждается.
CREATE OR REPLACE FUNCTION public.pf_vor_confirm(p_import uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_i planfact.vor_imports; v_open int; v_n int; v_diff int; r record; v_pos uuid;
begin
  v_i := planfact.require_vor_draft(p_import);
  if v_i.previous_import_id is not null then
    raise exception 'Это новая редакция ВОР — примите её после сравнения с действующей' using errcode = '22023';
  end if;
  select count(*) into v_open from planfact.vor_source_rows
  where import_id = p_import and kind = 'work'
    and (location_id is null or work_type_id is null or unit_id is null or qty is null or qty < 0 or match is distinct from 'green');
  if v_open > 0 then
    raise exception 'Не разобрано строк-работ: % (место, вид работ, ЕИ, объём или неподтверждённый цвет)', v_open using errcode = '22023';
  end if;
  select count(*) into v_n from planfact.vor_source_rows where import_id = p_import and kind = 'work';
  if v_n = 0 then raise exception 'В загрузке нет строк-работ' using errcode = '22023'; end if;
  for r in select * from planfact.vor_source_rows where import_id = p_import and kind = 'work' order by row_no loop
    insert into planfact.vor_positions(company_id, project_id, import_id, location_id, work_type_id, unit_id, qty, apartments_note, status)
    values (v_i.company_id, v_i.project_id, p_import, r.location_id, r.work_type_id, r.unit_id, r.qty,
            nullif(concat_ws(' · ',
              case when (r.context -> 'floor' ->> 'from') is distinct from (r.context -> 'floor' ->> 'to')
                   then 'эт. ' || (r.context -> 'floor' ->> 'from') || '–' || (r.context -> 'floor' ->> 'to') end,
              nullif(r.context ->> 'apartments', '')), ''),
            'confirmed')
    returning id into v_pos;
    insert into planfact.vor_links(project_id, source_row_id, position_id, share) values (v_i.project_id, r.id, v_pos, 1);
  end loop;
  select count(*) into v_diff from planfact.vor_source_rows s
  where s.import_id = p_import and s.kind = 'work'
    and s.qty is distinct from (select sum(p.qty * l.share) from planfact.vor_links l join planfact.vor_positions p on p.id = l.position_id
                                where l.source_row_id = s.id);
  if v_diff > 0 then raise exception 'Сумма позиций не сходится с объёмом строки заказчика: % строк', v_diff using errcode = '22023'; end if;
  update planfact.vor_imports set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_import;
  insert into planfact.vor_heads(root_import_id, company_id, project_id, current_import_id, changed_by)
  values (p_import, v_i.company_id, v_i.project_id, p_import, auth.uid());
  perform planfact.log_admin_change(v_i.company_id, v_i.project_id, 'vor_imports', v_i.id, 'UPDATE',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'confirmed', 'positions', v_n, 'file_name', v_i.file_name));
  return v_n;
end $function$;

-- Смета — только по действующим редакциям (сметы на прежних редакциях не меняются).
CREATE OR REPLACE FUNCTION public.pf_estimate_create(p_project uuid, p_name text, p_imports uuid[], p_area numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_company uuid; v_id uuid; v_name text := btrim(coalesce(p_name, '')); v_tpl uuid; v_bad int; v_imports uuid[];
begin
  v_company := planfact.require_estimate_manage(p_project);
  if v_name = '' or length(v_name) > 300 then raise exception 'Введите название сметы' using errcode = '22023'; end if;
  select array_agg(distinct x) into v_imports from unnest(coalesce(p_imports, '{}')) x where x is not null;
  if v_imports is null or cardinality(v_imports) > 20 then raise exception 'Выберите от 1 до 20 загрузок ВОР' using errcode = '22023'; end if;
  select count(*) into v_bad from unnest(v_imports) x
  where not exists (select 1 from planfact.vor_imports i where i.id = x and i.project_id = p_project and i.status = 'confirmed');
  if v_bad > 0 then raise exception 'Смета строится только по подтверждённым загрузкам ВОР этого проекта' using errcode = '22023'; end if;
  select count(*) into v_bad from unnest(v_imports) x
  where not exists (select 1 from planfact.vor_heads h where h.current_import_id = x);
  if v_bad > 0 then raise exception 'Есть новая редакция ВОР — смета строится по действующей редакции' using errcode = '22023'; end if;
  if p_area is not null and (p_area <= 0 or p_area >= 1e9) then raise exception 'Площадь — положительное число' using errcode = '22023'; end if;
  insert into planfact.estimates(company_id, project_id, name, import_ids, area_m2)
  values (v_company, p_project, v_name, v_imports, p_area) returning id into v_id;
  insert into planfact.estimate_rows(estimate_id, project_id, source_row_id)
  select v_id, p_project, s.id from planfact.vor_source_rows s
  where s.import_id = any(v_imports) and s.kind in ('work', 'material');
  perform planfact.estimate_fill_reference(v_id, v_company, null);
  v_tpl := planfact.ensure_overhead_template(v_company);
  insert into planfact.estimate_overheads(estimate_id, project_id, sort, key, section, name, comment, method, base, params, in_total)
  select v_id, p_project, sort, key, section, name, comment, method, base, params, in_total
  from planfact.overhead_lines where template_id = v_tpl;
  perform planfact.log_admin_change(v_company, p_project, 'estimates', v_id, 'INSERT', null,
    jsonb_build_object('name', v_name, 'import_ids', to_jsonb(v_imports), 'area_m2', p_area));
  return v_id;
end $function$;

-- Сводка по местам: «позиций здесь» — только действующие.
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
         coalesce(agg.n, 0), (select count(*)::int from planfact.vor_positions_current vp where vp.project_id = p_project and vp.location_id = l.id
                                and not vp.withdrawn),
         case when v_money and v_kp is not null then round(coalesce(agg.pm, 0), 2) end,
         case when v_money and v_kp is not null then round(coalesce(agg.dm, 0), 2) end,
         case when v_money and agg.pm > 0 then round(agg.dm / agg.pm * 100, 1) end,
         coalesce(vol.u, '[]'::jsonb)
  from core.locations l
  left join agg on agg.root = l.id left join vol on vol.root = l.id
  where l.project_id = p_project and l.deleted_at is null and l.parent_id is not distinct from p_location
  order by l.sort_order, l.name, l.id;
end $function$;

-- Портфель: число позиций — только действующие.
CREATE OR REPLACE FUNCTION public.pf_summary_portfolio()
 RETURNS TABLE(project_id uuid, name text, code text, planned_start date, planned_finish date, can_money boolean, can_manage boolean, has_kp boolean, plan_money numeric, done_money numeric, issued_money numeric, gap_money numeric, pct_money numeric, pace7 numeric, pace14 numeric, need_pace numeric, days_left integer, forecast_finish date, light text, light_reason text, unpriced_rows integer, positions integer, pending integer, plan_pct_today numeric, lag_pp numeric, lag_days numeric, pace_verdict text, work_days_left integer, light_yellow_pp numeric, light_red_pp numeric, light_overdue_days integer, can_thresholds boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_today date := planfact.fact_today();
begin
  if auth.uid() is null then raise exception 'Нет права видеть сводку' using errcode = '42501'; end if;
  return query
  with pj as (
    select p.id, p.name, p.code, planfact.has_permission(p.id, 'planfact.money.view') m, planfact.has_permission(p.id, 'planfact.projects.manage') g,
           planfact.has_permission(p.id, 'planfact.thresholds.edit') th
    from core.projects p where p.archived_at is null and planfact.has_permission(p.id, 'planfact.fact.view')
  )
  select pj.id, pj.name, pj.code, s.planned_start, s.planned_finish, pj.m, pj.g, s.kp_revision_id is not null,
         case when pj.m then s.plan_money end, case when pj.m then s.done_money end, case when pj.m then s.issued_money end,
         case when pj.m then s.gap_money end, case when pj.m then s.pct_money end, case when pj.m then s.pace7 end,
         case when pj.m then s.pace14 end, case when pj.m then s.need_pace end, s.days_left,
         case when pj.m then s.forecast_finish end, s.light, s.light_reason, s.unpriced_rows,
         (select count(*)::int from planfact.vor_positions_current vp where vp.project_id = pj.id and not vp.withdrawn),
         (select count(*)::int from planfact.fact_entries e where e.project_id = pj.id and e.status = 'pending_approval'),
         s.plan_pct_today, case when pj.m then s.lag_pp end, case when pj.m then s.lag_days end, s.pace_verdict, s.work_days_left,
         s.light_yellow_pp, s.light_red_pp, s.light_overdue_days, pj.th
  from pj cross join lateral planfact.summary_project(pj.id, v_today) s
  order by pj.name, pj.id;
end $function$;

-- 5. Списки с признаками редакции (новые столбцы — в конце, прежние без изменений).
drop function public.pf_vor_list_imports(uuid);
create function public.pf_vor_list_imports(p_project uuid)
 RETURNS TABLE(id uuid, file_name text, sheet_name text, status text, row_count integer, works integer, positions integer, created_at timestamp with time zone, created_by_email text, confirmed_at timestamp with time zone, profile_id uuid,
               revision_no integer, previous_import_id uuid, root_import_id uuid, is_current boolean, confirmed_by_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
begin
  if p_project is null or auth.uid() is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  return query
  select i.id, i.file_name, i.sheet_name, i.status, i.row_count,
         (select count(*)::int from planfact.vor_source_rows s where s.import_id = i.id and s.kind = 'work'),
         (select count(distinct l.position_id)::int from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id
           where s.import_id = i.id),
         i.created_at, u.email::text, i.confirmed_at, i.profile_id,
         i.revision_no, i.previous_import_id, coalesce(i.root_import_id, i.id),
         exists (select 1 from planfact.vor_heads h where h.current_import_id = i.id), cu.email::text
  from planfact.vor_imports i left join auth.users u on u.id = i.created_by left join auth.users cu on cu.id = i.confirmed_by
  where i.project_id = p_project
  order by i.created_at desc;
end $function$;
revoke all on function public.pf_vor_list_imports(uuid) from public, anon;
grant execute on function public.pf_vor_list_imports(uuid) to authenticated;

drop function public.pf_vor_positions(uuid, uuid);
create function public.pf_vor_positions(p_project uuid, p_location uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, location_id uuid, location_path text, work_type_id uuid, work_type text, unit_code text, qty numeric, apartments_note text, import_id uuid, file_name text, source_row_no integer,
               withdrawn boolean, revision_no integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
begin
  if p_project is null or auth.uid() is null or not planfact.is_project_member(p_project) then
    raise exception 'Нет доступа к проекту' using errcode = '42501';
  end if;
  return query
  with recursive sub(id) as (
    select l.id from core.locations l where l.id = p_location and l.project_id = p_project
    union all
    select c.id from core.locations c join sub on c.parent_id = sub.id where c.deleted_at is null
  )
  -- файл и строка — действующей редакции цепочки (у снятой — последней, где она была)
  select p.id, p.location_id, planfact.location_path(p.location_id), p.work_type_id, w.name, u.code, p.qty, p.apartments_note,
         coalesce(r.import_id, p.import_id), coalesce(r.file_name, i.file_name), coalesce(r.row_no, r0.row_no), p.withdrawn,
         coalesce(r.revision_no, ri.revision_no, i.revision_no)
  from planfact.vor_positions_current p
  join core.work_types w on w.id = p.work_type_id
  join core.units u on u.id = p.unit_id
  join planfact.vor_imports i on i.id = p.import_id
  left join planfact.vor_heads h on h.root_import_id = p.root_import_id
  left join lateral (select s.import_id, ci.file_name, ci.revision_no, min(s.row_no) row_no
                     from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id
                     join planfact.vor_imports ci on ci.id = s.import_id
                     where l.position_id = p.id and s.import_id = h.current_import_id and not p.withdrawn
                     group by s.import_id, ci.file_name, ci.revision_no) r on true
  left join lateral (select s.import_id, min(s.row_no) row_no from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id
                     join planfact.vor_imports ci on ci.id = s.import_id and ci.status = 'confirmed'
                     where l.position_id = p.id group by s.import_id, ci.revision_no order by ci.revision_no desc limit 1) r0 on true
  left join planfact.vor_imports ri on ri.id = r0.import_id
  where p.project_id = p_project and (p_location is null or p.location_id in (select sub.id from sub))
  order by planfact.location_path(p.location_id), w.name, p.id;
end $function$;
revoke all on function public.pf_vor_positions(uuid, uuid) from public, anon;
grant execute on function public.pf_vor_positions(uuid, uuid) to authenticated;

drop function public.pf_fact_positions(uuid, uuid);
create function public.pf_fact_positions(p_project uuid, p_location uuid DEFAULT NULL::uuid)
 RETURNS TABLE(position_id uuid, location_id uuid, location_path text, location_type text, work_type_id uuid, work_name text, unit_code text, plan_qty numeric, fact_qty numeric, pending_qty numeric, pending_count integer, last_rejected_note text,
               withdrawn boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.fact.view') then
    raise exception 'Нет права видеть факт' using errcode = '42501';
  end if;
  if p_location is not null and not exists (select 1 from core.locations l where l.id = p_location and l.project_id = p_project and l.deleted_at is null) then
    raise exception 'Место не найдено' using errcode = '22023';
  end if;
  return query
  with recursive sub as (
    select l.id from core.locations l where l.project_id = p_project and l.deleted_at is null
      and ((p_location is null and l.parent_id is null) or l.id = p_location)
    union all
    select c.id from core.locations c join sub s on c.parent_id = s.id where c.deleted_at is null
  )
  select p.id, p.location_id, planfact.location_path(p.location_id), l.node_type, p.work_type_id, w.name, u.code,
         t.plan_qty, t.fact_qty, t.pending_qty, t.pending_count,
         (select e.decision_note from planfact.fact_entries e where e.position_id = p.id and e.status = 'rejected'
            order by e.decided_at desc, e.id desc limit 1),
         p.withdrawn
  from planfact.vor_positions_current p
  join sub on sub.id = p.location_id
  join core.locations l on l.id = p.location_id
  join core.work_types w on w.id = p.work_type_id
  join core.units u on u.id = p.unit_id
  join planfact.fact_totals(p_project) t on t.position_id = p.id
  where p.project_id = p_project
  order by l.depth, l.sort_order, l.name, w.name, p.id;
end $function$;
revoke all on function public.pf_fact_positions(uuid, uuid) from public, anon;
grant execute on function public.pf_fact_positions(uuid, uuid) to authenticated;

drop function public.pf_summary_positions(uuid, uuid);
create function public.pf_summary_positions(p_project uuid, p_work_type uuid DEFAULT NULL::uuid)
 RETURNS TABLE(position_id uuid, location_id uuid, location_path text, work_type_id uuid, work_name text, unit_code text, plan_qty numeric, fact_qty numeric, pct numeric, rest_qty numeric, fact7 numeric, fact14 numeric, pending_qty numeric, forecast_finish date, delta_days integer, plan_pct_today numeric, dev_pp numeric,
               withdrawn boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
declare v_today date := planfact.fact_today(); v_start date; v_finish date; v_ppl numeric;
begin
  perform planfact.require_summary_view(p_project);
  select p.planned_start, p.planned_finish into v_start, v_finish from core.projects p where p.id = p_project;
  v_ppl := planfact.plan_pct(v_start, v_finish, v_today);
  return query
  with ft as (select * from planfact.fact_totals(p_project)),
       f7 as (select * from planfact.fact_totals(p_project, v_today - 6, v_today)),
       f14 as (select * from planfact.fact_totals(p_project, v_today - 13, v_today))
  select p.id, p.location_id, planfact.location_path(p.location_id), p.work_type_id, w.name, u.code, ft.plan_qty, ft.fact_qty,
         case when ft.plan_qty > 0 then round(ft.fact_qty / ft.plan_qty * 100, 1) end, greatest(ft.plan_qty - ft.fact_qty, 0),
         f7.fact_qty, f14.fact_qty, ft.pending_qty, fc.forecast_finish, fc.delta_days, round(v_ppl, 1),
         case when ft.plan_qty > 0 and v_ppl is not null then round(v_ppl - ft.fact_qty / ft.plan_qty * 100, 1) end,
         p.withdrawn
  from planfact.vor_positions_current p
  join core.locations l on l.id = p.location_id
  join core.work_types w on w.id = p.work_type_id
  join core.units u on u.id = p.unit_id
  join ft on ft.position_id = p.id join f7 on f7.position_id = p.id join f14 on f14.position_id = p.id
  cross join lateral planfact.forecast(ft.plan_qty, ft.fact_qty, f14.fact_qty, v_today, v_finish) fc
  where p.project_id = p_project and (p_work_type is null or p.work_type_id = p_work_type)
  order by w.name, l.depth, l.sort_order, l.name, p.id;
end $function$;
revoke all on function public.pf_summary_positions(uuid, uuid) from public, anon;
grant execute on function public.pf_summary_positions(uuid, uuid) to authenticated;

-- 6. Новая редакция: черновик к действующей редакции (один черновик на редакцию).
create function public.pf_vor_create_revision(p_previous uuid, p_file_name text, p_sha256 text, p_sheet text,
                                               p_profile uuid default null, p_totals jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_prev planfact.vor_imports; v_company uuid; v_id uuid; v_file text := btrim(coalesce(p_file_name, '')); v_sheet text := coalesce(p_sheet, '');
begin
  select * into v_prev from planfact.vor_imports where id = p_previous;
  if v_prev.id is null or auth.uid() is null or not planfact.is_project_member(v_prev.project_id) then
    raise exception 'Загрузка не найдена' using errcode = '22023';
  end if;
  v_company := planfact.require_vor_manage(v_prev.project_id);
  if not exists (select 1 from planfact.vor_heads h where h.current_import_id = p_previous) then
    raise exception 'Новую редакцию загружают к действующей редакции ВОР' using errcode = '22023';
  end if;
  if exists (select 1 from planfact.vor_imports d where d.previous_import_id = p_previous and d.status = 'draft') then
    raise exception 'Черновик новой редакции уже есть — откройте или удалите его' using errcode = '22023';
  end if;
  if v_file = '' or v_sheet = '' then raise exception 'Нет имени файла или листа' using errcode = '22023'; end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Неверная отметка файла (SHA-256)' using errcode = '22023'; end if;
  if p_profile is not null and not exists (select 1 from planfact.vor_profiles where id = p_profile and company_id = v_company) then
    raise exception 'Профиль формы не найден' using errcode = '22023';
  end if;
  insert into planfact.vor_imports(company_id, project_id, profile_id, file_name, file_sha256, sheet_name, totals,
                                   revision_no, previous_import_id, root_import_id)
  values (v_company, v_prev.project_id, p_profile, v_file, p_sha256, v_sheet, coalesce(p_totals, '{}'::jsonb),
          v_prev.revision_no + 1, p_previous, coalesce(v_prev.root_import_id, v_prev.id))
  returning id into v_id;
  perform planfact.log_admin_change(v_company, v_prev.project_id, 'vor_imports', v_id, 'INSERT', null,
    jsonb_build_object('file_name', v_file, 'sheet_name', v_sheet, 'status', 'draft', 'revision_no', v_prev.revision_no + 1,
                       'previous_import_id', p_previous));
  return v_id;
end $$;

-- База для сравнения: строки-работы действующей редакции с их позициями и фактом.
create function public.pf_vor_revision_base(p_import uuid)
returns table(source_row_id uuid, row_no int, number text, name text, unit_text text, qty numeric, context jsonb,
              location_id uuid, work_type_id uuid, unit_id uuid, position_id uuid, position_qty numeric,
              fact_qty numeric, pending_qty numeric)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
declare v_i planfact.vor_imports;
begin
  select * into v_i from planfact.vor_imports where id = p_import;
  if v_i.id is null or auth.uid() is null or not planfact.is_project_member(v_i.project_id) then
    raise exception 'Загрузка не найдена' using errcode = '22023';
  end if;
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
end $$;

-- Принятие новой редакции — всё или ничего.
--   p_items: [{row_no, position_id|null}] — по одной на каждую строку-работу черновика: та же позиция (id) или новая;
--   p_red:   [{position_id, action: 'keep'|'move', to_position_id?, to_row_no?}] — по каждой снимаемой позиции с фактом.
create function public.pf_vor_accept_revision(p_import uuid, p_items jsonb, p_red jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_i planfact.vor_imports; v_h planfact.vor_heads; v_n int; v_bad int; v_open int; v_txt text; r record; fe record;
        v_pos uuid; v_new int := 0; v_same int := 0; v_qty int := 0; v_wd int := 0; v_moved int := 0; v_kept int := 0; v_eid uuid;
        v_map jsonb := '{}'::jsonb;
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
                                          status, corrects_id, correction_reason, batch_id, period_from)
        values (fe.company_id, fe.project_id, v_pos, fe.brigade_id, fe.work_date, fe.qty, fe.workers, fe.man_hours, fe.note,
                fe.status,
                -- исправление на подтверждении заменит перенесённую копию исправляемой записи, а не старую
                case when fe.status = 'pending_approval' and fe.corrects_id is not null and v_map ? fe.corrects_id::text
                     then (v_map ->> fe.corrects_id::text)::uuid else fe.id end,
                'Перенос при редакции ВОР №' || v_i.revision_no, fe.batch_id, fe.period_from)
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
                       'fact_kept', v_kept, 'fact_moved_entries', v_moved));
  return jsonb_build_object('revision_no', v_i.revision_no, 'added', v_new, 'unchanged', v_same, 'qty_changed', v_qty,
                            'withdrawn', v_wd, 'fact_kept', v_kept, 'fact_moved_entries', v_moved);
exception when others then
  perform set_config('planfact.fact_tx', '0', true);
  raise;
end $$;

-- Что изменила редакция: события по позициям (для истории).
create function public.pf_vor_revision_changes(p_import uuid)
returns table(position_id uuid, kind text, qty_before numeric, qty_after numeric, location_path text, work_name text, unit_code text,
              created_at timestamptz, created_by_email text)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
declare v_project uuid;
begin
  select i.project_id into v_project from planfact.vor_imports i where i.id = p_import;
  if v_project is null or auth.uid() is null or not planfact.is_project_member(v_project) then
    raise exception 'Загрузка не найдена' using errcode = '22023';
  end if;
  return query
  select e.position_id, e.kind, e.qty_before, e.qty_after, planfact.location_path(p.location_id), w.name, u.code, e.created_at, cu.email::text
  from planfact.vor_position_events e
  join planfact.vor_positions p on p.id = e.position_id
  join core.work_types w on w.id = p.work_type_id
  join core.units u on u.id = p.unit_id
  left join auth.users cu on cu.id = e.created_by
  where e.import_id = p_import
  order by e.seq;
end $$;

revoke all on function public.pf_vor_create_revision(uuid, text, text, text, uuid, jsonb), public.pf_vor_revision_base(uuid),
  public.pf_vor_accept_revision(uuid, jsonb, jsonb), public.pf_vor_revision_changes(uuid) from public, anon;
grant execute on function public.pf_vor_create_revision(uuid, text, text, text, uuid, jsonb), public.pf_vor_revision_base(uuid),
  public.pf_vor_accept_revision(uuid, jsonb, jsonb), public.pf_vor_revision_changes(uuid) to authenticated;

commit;
