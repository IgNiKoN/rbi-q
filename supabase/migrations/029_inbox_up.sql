-- P2-0021: «Требует моего участия» и ТД №138.
-- pf_my_inbox — только чтение: по всем неархивным объектам, где у вошедшего есть право, — что ждёт именно его:
--   pending      — факт ждёт подтверждения (право fact.approve; = число строк pf_fact_pending);
--   my_rejected  — мои отклонённые записи, пока на той же позиции нет моей записи, внесённой после отказа (право fact.create);
--   my_rejected_from — самая ранняя дата работ среди них (период «Журнала» при переходе);
--   ks2_drafts   — невыданные черновики КС-2 (право ks2.edit; = акты pf_ks2_acts со статусом draft);
--   ks2_gap      — строк «сделано, не выставлено» (право ks2.view / ks2.edit; = pf_summary_attention.counts.gap_rows),
--   ks2_gap_money — их сумма (только при money.view; = counts.gap_money);
--   stale        — позиций без факта больше 14 дней (право money.view — решение владельца 24.10.2026;
--                  = pf_summary_attention.counts.stale_positions).
-- Вида без права — null. Подсчёт «не выставлено» и «стоят» — вызовом pf_summary_attention (одна формула), только там, где есть право.
-- ТД №138: pf_fact_decide и pf_fact_correct — запись перечитывается FOR UPDATE после блокировки позиции (порядок блокировок
-- прежний: позиция → запись), UPDATE решения — только из pending_approval. Поведение одиночного вызова — прежнее.
-- Объекты RBI и раздел quality не затрагивает. search_path — как у pf_* после 016. Применять после 028, одним запросом.
-- Откат — 029_inbox_down.sql.
begin;

do $$
begin
  if to_regprocedure('public.pf_fact_decide_batch(uuid,uuid[],boolean,text)') is null
     or to_regprocedure('public.pf_summary_attention(uuid,integer)') is null then
    raise exception '029: нет функций 028 / 013a' using errcode = 'P0001';
  end if;
  if to_regprocedure('public.pf_my_inbox()') is not null then
    raise exception '029: уже применена (повтор — только после 029_inbox_down.sql)' using errcode = 'P0001';
  end if;
end $$;

create function public.pf_my_inbox()
returns table(project_id uuid, name text, code text, pending int, my_rejected int, my_rejected_from date, ks2_drafts int,
              ks2_gap int, ks2_gap_money numeric, stale int, stale_days int)
language plpgsql stable security definer set search_path = pg_catalog, planfact, core as $$
declare r record; v_uid uuid := auth.uid(); v_ap boolean; v_cr boolean; v_ke boolean; v_kv boolean; v_mv boolean; v_att jsonb;
begin
  if v_uid is null then raise exception 'Нет доступа' using errcode = '42501'; end if;
  for r in select p.id, p.name, p.code from core.projects p where p.archived_at is null order by p.name, p.id loop
    v_ap := planfact.has_permission(r.id, 'planfact.fact.approve');
    v_cr := planfact.has_permission(r.id, 'planfact.fact.create');
    v_ke := planfact.has_permission(r.id, 'planfact.ks2.edit');
    v_kv := v_ke or planfact.has_permission(r.id, 'planfact.ks2.view');
    v_mv := planfact.has_permission(r.id, 'planfact.money.view');
    -- сводка «Требует внимания» доступна при fact.view (require_summary_view)
    if (v_kv or v_mv) and not planfact.has_permission(r.id, 'planfact.fact.view') then v_kv := false; v_mv := false; end if;
    continue when not (v_ap or v_cr or v_ke or v_kv or v_mv);
    v_att := case when v_kv or v_mv then public.pf_summary_attention(r.id, 14) end;
    project_id := r.id; name := r.name; code := r.code;
    pending := case when v_ap then (select count(*)::int from planfact.fact_entries e
                                    where e.project_id = r.id and e.status = 'pending_approval') end;
    my_rejected := null; my_rejected_from := null;
    if v_cr then
      select count(*)::int, min(e.work_date) into my_rejected, my_rejected_from from planfact.fact_entries e
      where e.project_id = r.id and e.status = 'rejected' and e.created_by = v_uid
        and not exists (select 1 from planfact.fact_entries n
                        where n.position_id = e.position_id and n.created_by = v_uid and n.id <> e.id and n.created_at >= e.decided_at);
    end if;
    ks2_drafts := case when v_ke then (select count(*)::int from planfact.ks2_acts a
                                       where a.project_id = r.id and a.status = 'draft') end;
    ks2_gap := case when v_kv then (v_att -> 'counts' ->> 'gap_rows')::int end;
    ks2_gap_money := case when v_kv and v_mv then (v_att -> 'counts' ->> 'gap_money')::numeric end;
    stale := case when v_mv then (v_att -> 'counts' ->> 'stale_positions')::int end;
    stale_days := case when v_mv then (v_att ->> 'stale_days')::int end;
    return next;
  end loop;
end $$;

-- ТД №138. Тело — как в 009 (после 016), добавлено: перечитать запись FOR UPDATE после блокировки позиции и UPDATE только из pending_approval.
create or replace function public.pf_fact_decide(p_entry uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_e planfact.fact_entries; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_e from planfact.fact_entries where id = p_entry;
  if v_e.id is null or auth.uid() is null or not planfact.has_permission(v_e.project_id, 'planfact.fact.view') then
    raise exception 'Запись не найдена' using errcode = '22023';
  end if;
  perform planfact.require_fact_approve(v_e.project_id);
  if v_e.status <> 'pending_approval' then raise exception 'Запись не ждёт подтверждения' using errcode = '22023'; end if;
  if not coalesce(p_approve, false) and v_note is null then raise exception 'Напишите причину отказа' using errcode = '22023'; end if;
  perform 1 from planfact.vor_positions where id = v_e.position_id for update;
  -- ТД №138: другое решение могло пройти, пока ждали блокировку
  select * into v_e from planfact.fact_entries where id = p_entry for update;
  if v_e.status <> 'pending_approval' then raise exception 'Запись не ждёт подтверждения' using errcode = '22023'; end if;
  perform set_config('planfact.fact_tx', '1', true);
  update planfact.fact_entries set status = case when coalesce(p_approve, false) then 'accepted' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = v_note where id = p_entry and status = 'pending_approval';
  if not found then raise exception 'Запись не ждёт подтверждения' using errcode = '22023'; end if;
  if coalesce(p_approve, false) and v_e.corrects_id is not null then
    update planfact.fact_entries set status = 'superseded', decided_by = auth.uid(), decided_at = now(),
           decision_note = coalesce(v_e.correction_reason, v_note)
    where id = v_e.corrects_id and status in ('accepted', 'pending_approval');
  end if;
  perform set_config('planfact.fact_tx', '0', true);
  perform planfact.log_admin_change(v_e.company_id, v_e.project_id, 'fact_entries', p_entry,
    case when coalesce(p_approve, false) then 'APPROVE' else 'REJECT' end,
    jsonb_build_object('qty', v_e.qty, 'status', v_e.status), jsonb_build_object('note', v_note));
exception when others then
  perform set_config('planfact.fact_tx', '0', true);
  raise;
end $$;

-- ТД №138 (LOW). Тело — как в 009 (после 016), добавлено: после блокировки позиции перечитать запись FOR UPDATE
-- и повторить проверки «закрыта» / «уже исправлена».
create or replace function public.pf_fact_correct(p_entry uuid, p_qty numeric, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_e planfact.fact_entries; v_reason text := btrim(coalesce(p_reason, '')); v_company uuid; v_ok boolean;
begin
  select * into v_e from planfact.fact_entries where id = p_entry;
  if v_e.id is null or auth.uid() is null or not planfact.has_permission(v_e.project_id, 'planfact.fact.view') then
    raise exception 'Запись не найдена' using errcode = '22023';
  end if;
  v_ok := planfact.has_permission(v_e.project_id, 'planfact.fact.approve')
          or (v_e.created_by = auth.uid() and planfact.has_permission(v_e.project_id, 'planfact.fact.create'));
  if not v_ok then raise exception 'Нет права исправлять эту запись' using errcode = '42501'; end if;
  if exists (select 1 from core.projects where id = v_e.project_id and archived_at is not null) then
    raise exception 'Проект в архиве — сначала верните его из архива' using errcode = '22023';
  end if;
  if v_e.status not in ('accepted', 'pending_approval') then
    raise exception 'Эта запись уже закрыта — исправить её нельзя' using errcode = '22023';
  end if;
  if exists (select 1 from planfact.fact_entries c where c.corrects_id = p_entry and c.status in ('accepted', 'pending_approval')) then
    raise exception 'Запись уже исправлена — откройте историю' using errcode = '22023';
  end if;
  if v_reason = '' then raise exception 'Укажите причину исправления' using errcode = '22023'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Объём не может быть отрицательным' using errcode = '22023'; end if;
  v_company := v_e.company_id;
  -- блокировка позиции на время исправления (как при вводе)
  perform 1 from planfact.vor_positions where id = v_e.position_id for update;
  -- ТД №138: проверки — ещё раз под блокировкой
  select * into v_e from planfact.fact_entries where id = p_entry for update;
  if v_e.status not in ('accepted', 'pending_approval') then
    raise exception 'Эта запись уже закрыта — исправить её нельзя' using errcode = '22023';
  end if;
  if exists (select 1 from planfact.fact_entries c where c.corrects_id = p_entry and c.status in ('accepted', 'pending_approval')) then
    raise exception 'Запись уже исправлена — откройте историю' using errcode = '22023';
  end if;
  if round(p_qty, 3) = 0 then
    perform set_config('planfact.fact_tx', '1', true);
    update planfact.fact_entries set status = 'superseded', decided_by = auth.uid(), decided_at = now(), decision_note = v_reason
    where id = p_entry;
    perform set_config('planfact.fact_tx', '0', true);
    perform planfact.log_admin_change(v_company, v_e.project_id, 'fact_entries', p_entry, 'CANCEL',
      jsonb_build_object('qty', v_e.qty), jsonb_build_object('reason', v_reason));
    return jsonb_build_object('id', p_entry, 'status', 'superseded');
  end if;
  return planfact.fact_insert(v_company, v_e.project_id, v_e.position_id, v_e.brigade_id, v_e.work_date, p_qty, v_e.workers,
                              v_e.man_hours, coalesce(p_note, v_e.note), v_e.batch_id, p_entry, v_reason);
exception when others then
  perform set_config('planfact.fact_tx', '0', true);
  raise;
end $$;

revoke all on function public.pf_my_inbox() from public, anon;
grant execute on function public.pf_my_inbox() to authenticated;

commit;
