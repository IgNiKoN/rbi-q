-- P2-0019: «Закрыть через РП» — pf_fact_add_batch + p_require_approval (default false).
-- При true каждая строка пачки ждёт подтверждения РП (pending_approval) даже без перебора; в пометку записи —
-- «Закрытие через РП». Права (planfact.fact.create), проверки строк, правило перебора, журнал — прежние (planfact.fact_insert);
-- вызов без флага (и прежний вызов из 6 параметров) — поведение 009. Объекты RBI и раздел quality не затрагивает.
-- search_path — как у pf_* после 016 (pg_catalog, planfact, core). Применять после 026, одним запросом. Откат — 027_fact_force_approval_down.sql.
begin;

do $$
begin
  if to_regprocedure('public.pf_fact_add_batch(uuid,uuid,date,jsonb,integer,text)') is null then
    raise exception '027: нет pf_fact_add_batch из 009 (уже применена? повтор — только после 027_fact_force_approval_down.sql)'
      using errcode = 'P0001';
  end if;
end $$;

drop function public.pf_fact_add_batch(uuid, uuid, date, jsonb, int, text);

-- Пачка «закрыть этаж» / «Закрыть выбранные»: одна бригада и дата на все строки; p_items = [{position_id, qty, man_hours?}] ≤ 500.
-- Любая ошибка откатывает всю пачку. Правило перебора — к каждой строке отдельно. Возвращает {batch_id, accepted, pending}.
-- p_require_approval = true — «Закрыть через РП»: строка, принятая по правилу перебора, переводится в pending_approval (журнал FORCE_PENDING).
create function public.pf_fact_add_batch(p_project uuid, p_brigade uuid, p_date date, p_items jsonb,
                                         p_workers int default null, p_note text default null,
                                         p_require_approval boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact, core as $$
declare v_company uuid; v_batch uuid := gen_random_uuid(); it jsonb; v_res jsonb; v_acc int := 0; v_pen int := 0; v_seen uuid[] := '{}'; v_pos uuid;
        v_force boolean := coalesce(p_require_approval, false); v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  v_company := planfact.require_fact_create(p_project);
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'В пачке нет строк' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'В пачке не больше 500 строк' using errcode = '22023'; end if;
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
end $$;

revoke all on function public.pf_fact_add_batch(uuid, uuid, date, jsonb, int, text, boolean) from public, anon;
grant execute on function public.pf_fact_add_batch(uuid, uuid, date, jsonb, int, text, boolean) to authenticated;

commit;
