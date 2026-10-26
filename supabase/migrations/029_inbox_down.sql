-- P2-0021: откат 029_inbox_up.sql — удалить pf_my_inbox; pf_fact_decide и pf_fact_correct — как до 029
-- (тела 009 после 016, побайтно по pg_get_functiondef). Решения, принятые после 029, остаются.
begin;

do $$
begin
  if to_regprocedure('public.pf_my_inbox()') is null then
    raise exception '029 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
end $$;

drop function public.pf_my_inbox();

CREATE OR REPLACE FUNCTION public.pf_fact_correct(p_entry uuid, p_qty numeric, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
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
end $function$
;


CREATE OR REPLACE FUNCTION public.pf_fact_decide(p_entry uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'planfact', 'core'
AS $function$
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
  perform set_config('planfact.fact_tx', '1', true);
  update planfact.fact_entries set status = case when coalesce(p_approve, false) then 'accepted' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = v_note where id = p_entry;
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
end $function$
;


commit;
