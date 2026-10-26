-- Откат 037_quality_admin_up.sql: справочник подрядчиков и удаление из очередей — снова *.edit (как 026), сторож очередей снят.
begin;

do $$
begin
  if to_regprocedure('quality.queue_guard()') is null then
    raise exception '037 не применена' using errcode = 'P0001';
  end if;
end $$;

drop trigger contractor_normalization_queue_queue_guard on quality.contractor_normalization_queue;
drop trigger object_normalization_queue_queue_guard on quality.object_normalization_queue;
drop function quality.queue_guard();

do $$
declare r record;
  v_edit text := 'quality.can(core_company_id, core_project_id, ''{quality.edit,construction.edit}'') and not quality.contractor_only(core_company_id, core_project_id)';
begin
  for r in select unnest(array['contractors', 'contractor_directory', 'contractor_aliases']) t loop
    execute format('drop policy %I on quality.%I', r.t || '_insert', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_update', r.t);
    execute format('drop policy %I on quality.%I', r.t || '_delete', r.t);
    execute format('create policy %I on quality.%I for insert to authenticated with check (%s)', r.t || '_insert', r.t, v_edit);
    execute format('create policy %I on quality.%I for update to authenticated using (%s) with check (%s)', r.t || '_update', r.t, v_edit, v_edit);
    execute format('create policy %I on quality.%I for delete to authenticated using (%s)', r.t || '_delete', r.t, v_edit);
  end loop;
end $$;

drop policy contractor_normalization_queue_delete on quality.contractor_normalization_queue;
create policy contractor_normalization_queue_delete on quality.contractor_normalization_queue for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}') and not quality.contractor_only(core_company_id, core_project_id));
drop policy object_normalization_queue_delete on quality.object_normalization_queue;
create policy object_normalization_queue_delete on quality.object_normalization_queue for delete to authenticated
  using (quality.can(core_company_id, core_project_id, '{quality.edit,construction.edit}'));

commit;
