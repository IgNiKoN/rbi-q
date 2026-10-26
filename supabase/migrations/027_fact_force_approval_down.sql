-- P2-0019: откат 027_fact_force_approval_up.sql — pf_fact_add_batch как в 009 (без p_require_approval).
-- Записи факта, созданные «через РП», остаются (данные; решение РП по ним — как по любой pending_approval).
begin;

do $$
begin
  if to_regprocedure('public.pf_fact_add_batch(uuid,uuid,date,jsonb,integer,text,boolean)') is null then
    raise exception '027 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
end $$;

drop function public.pf_fact_add_batch(uuid, uuid, date, jsonb, int, text, boolean);

-- Пачка «закрыть этаж»: одна бригада и дата на все строки; p_items = [{position_id, qty, man_hours?}] ≤ 500.
-- Любая ошибка откатывает всю пачку. Правило перебора — к каждой строке отдельно. Возвращает {batch_id, accepted, pending}.
create function public.pf_fact_add_batch(p_project uuid, p_brigade uuid, p_date date, p_items jsonb,
                                                    p_workers int default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_company uuid; v_batch uuid := gen_random_uuid(); it jsonb; v_res jsonb; v_acc int := 0; v_pen int := 0; v_seen uuid[] := '{}'; v_pos uuid;
begin
  v_company := planfact.require_fact_create(p_project);
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'В пачке нет строк' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'В пачке не больше 500 строк' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_pos := (it ->> 'position_id')::uuid;
    if v_pos is null or v_pos = any(v_seen) then raise exception 'Позиция указана дважды или не указана' using errcode = '22023'; end if;
    v_seen := v_seen || v_pos;
    v_res := planfact.fact_insert(v_company, p_project, v_pos, p_brigade, p_date, (it ->> 'qty')::numeric, p_workers,
                                  (it ->> 'man_hours')::numeric, p_note, v_batch, null, null);
    if v_res ->> 'status' = 'accepted' then v_acc := v_acc + 1; else v_pen := v_pen + 1; end if;
  end loop;
  return jsonb_build_object('batch_id', v_batch, 'accepted', v_acc, 'pending', v_pen);
end $$;

revoke all on function public.pf_fact_add_batch(uuid, uuid, date, jsonb, int, text) from public, anon;
grant execute on function public.pf_fact_add_batch(uuid, uuid, date, jsonb, int, text) to authenticated;

commit;
