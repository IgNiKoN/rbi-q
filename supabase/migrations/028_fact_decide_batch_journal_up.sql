-- P2-0020: решение РП пачкой и журнал факта объекта.
-- pf_fact_decide_batch — подтвердить / отклонить до 500 записей одной операцией (всё или ничего): проверки пачки, затем
-- для каждой записи — public.pf_fact_decide из 009 (права, «не ждёт подтверждения», причина отказа, замена исправляемой,
-- журнал APPROVE / REJECT — без изменений). pf_fact_journal — только чтение: записи факта объекта за период.
-- Прежние функции не меняются. Объекты RBI и раздел quality не затрагивает. search_path — как у pf_* после 016.
-- Применять после 027, одним запросом. Откат — 028_fact_decide_batch_journal_down.sql.
begin;

do $$
begin
  if to_regprocedure('public.pf_fact_decide(uuid,boolean,text)') is null then
    raise exception '028: нет pf_fact_decide из 009' using errcode = 'P0001';
  end if;
  if to_regprocedure('public.pf_fact_decide_batch(uuid,uuid[],boolean,text)') is not null then
    raise exception '028: уже применена (повтор — только после 028_fact_decide_batch_journal_down.sql)' using errcode = 'P0001';
  end if;
end $$;

-- Решение РП пачкой. Все записи — этого проекта и pending_approval, без повторов, ≤ 500; иначе отказ всей пачки.
-- Порядок — как в очереди РП (created_at, id), исправление — после исправляемой записи. Возвращает {approved, rejected}.
create function public.pf_fact_decide_batch(p_project uuid, p_entries uuid[], p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_n int; v_ok int; v_e uuid; v_approve boolean := coalesce(p_approve, false);
begin
  perform planfact.require_fact_approve(p_project);
  v_n := coalesce(cardinality(p_entries), 0);
  if v_n = 0 then raise exception 'Не выбрано ни одной записи' using errcode = '22023'; end if;
  if v_n > 500 then raise exception 'В пачке не больше 500 записей' using errcode = '22023'; end if;
  if array_position(p_entries, null) is not null or (select count(distinct x) from unnest(p_entries) x) <> v_n then
    raise exception 'Запись указана дважды или не указана' using errcode = '22023';
  end if;
  if not v_approve and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Напишите причину отказа' using errcode = '22023';
  end if;
  select count(*) into v_ok from planfact.fact_entries e
  where e.id = any(p_entries) and e.project_id = p_project and e.status = 'pending_approval';
  if v_ok <> v_n then
    raise exception 'Не все записи ждут подтверждения в этом объекте — обновите список' using errcode = '22023';
  end if;
  -- lvl — глубина цепочки исправлений внутри пачки: исправление решается после исправляемой записи
  for v_e in
    with recursive d as (
      select e.id, 0 as lvl from planfact.fact_entries e
      where e.id = any(p_entries) and (e.corrects_id is null or not e.corrects_id = any(p_entries))
      union all
      select c.id, d.lvl + 1 from planfact.fact_entries c join d on c.corrects_id = d.id where c.id = any(p_entries)
    )
    select e.id from d join planfact.fact_entries e on e.id = d.id order by d.lvl, e.created_at, e.id
  loop
    perform public.pf_fact_decide(v_e, v_approve, p_note);
  end loop;
  return jsonb_build_object('approved', case when v_approve then v_n else 0 end, 'rejected', case when v_approve then 0 else v_n end);
end $$;

-- Журнал факта объекта: все записи (любой статус) с датой работ в [p_from, p_to] (null — без границы), новые сверху.
-- p_limit — по умолчанию 2 000, не больше 5 000.
create function public.pf_fact_journal(p_project uuid, p_from date default null, p_to date default null, p_limit int default 2000)
returns table(id uuid, position_id uuid, location_path text, work_name text, unit_code text, qty numeric, work_date date,
              brigade_name text, workers int, man_hours numeric, note text, status text, corrects_id uuid, correction_reason text,
              batch_id uuid, created_by_email text, created_at timestamptz, decided_by_email text, decided_at timestamptz,
              decision_note text)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.fact.view') then
    raise exception 'Нет права видеть факт' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'Начало периода позже конца' using errcode = '22023';
  end if;
  return query
  select e.id, e.position_id, planfact.location_path(p.location_id), w.name, u.code, e.qty, e.work_date, b.name, e.workers,
         e.man_hours, e.note, e.status, e.corrects_id, e.correction_reason, e.batch_id, cu.email::text, e.created_at,
         du.email::text, e.decided_at, e.decision_note
  from planfact.fact_entries e
  join planfact.vor_positions p on p.id = e.position_id
  join core.work_types w on w.id = p.work_type_id
  join core.units u on u.id = p.unit_id
  join planfact.brigades b on b.id = e.brigade_id
  left join auth.users cu on cu.id = e.created_by
  left join auth.users du on du.id = e.decided_by
  where e.project_id = p_project
    and (p_from is null or e.work_date >= p_from) and (p_to is null or e.work_date <= p_to)
  order by e.work_date desc, e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 2000), 1), 5000);
end $$;

revoke all on function public.pf_fact_decide_batch(uuid, uuid[], boolean, text) from public, anon;
grant execute on function public.pf_fact_decide_batch(uuid, uuid[], boolean, text) to authenticated;
revoke all on function public.pf_fact_journal(uuid, date, date, int) from public, anon;
grant execute on function public.pf_fact_journal(uuid, date, date, int) to authenticated;

commit;
