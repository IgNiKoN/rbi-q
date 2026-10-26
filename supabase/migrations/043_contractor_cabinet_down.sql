-- P2-0044: откат 043_contractor_cabinet_up.sql — сторож подрядчика снят, правила _v2 — как после 023 (фирма по ключу/названию
-- через quality.contractor_ref), колонка core_counterparty_id и функции 043 удалены. Проверка на PGlite: schema_fingerprint до up
-- и после down совпадает.
begin;
do $$
begin
  if to_regprocedure('quality.contractor_defect_guard()') is null then
    raise exception '043 down: 043 не применена' using errcode = 'P0001';
  end if;
end $$;

drop trigger zz_contractor_defect_guard on quality.construction_defects;
drop trigger zz_contractor_defect_guard on quality.construction_defects_v2;
drop function quality.contractor_defect_guard();
drop function quality.contractor_limited(uuid, uuid);

do $$
declare t text; v_vis text; v_edit text;
begin
  foreach t in array array['construction_defects_v2', 'construction_acceptance_v2'] loop
    v_vis  := 'quality.row_visible(core_company_id, core_project_id, ''{construction.view}'', ''contractor'', core_created_by, null, '
              'quality.contractor_ref(core_company_id, "contractorId", ''key''), quality.contractor_ref(core_company_id, "contractorId", ''name''))';
    v_edit := replace(v_vis, '{construction.view}', '{construction.edit}');
    execute format('drop policy %I on quality.%I', t || '_select', t);
    execute format('drop policy %I on quality.%I', t || '_insert', t);
    execute format('drop policy %I on quality.%I', t || '_update', t);
    execute format('drop policy %I on quality.%I', t || '_delete', t);
    execute format('create policy %I on quality.%I for select to authenticated using (%s)', t || '_select', t, v_vis);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', t || '_insert', t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', t || '_update', t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', t || '_delete', t, v_edit);
    execute format('drop trigger %I on quality.%I', t || '_construction_counterparty', t);
    execute format('alter table quality.%I drop column core_counterparty_id', t);
  end loop;
end $$;

drop function quality.row_visible_id(uuid, uuid, text[], text, uuid, uuid, uuid);
drop function quality.set_construction_counterparty();
drop function quality.construction_counterparty(uuid, text);
commit;
