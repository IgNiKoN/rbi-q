-- P2-0078: откат 059_rls_fast_up.sql — правила чтения как до 059 (quality.can / quality.rec_ok на строке), функции 059 снимаются.
-- Данные не меняются. Применять одним запросом.
begin;

do $$
begin
  if to_regprocedure('quality.readable_projects(text[])') is null then
    raise exception '059 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
end $$;

drop policy file_registry_select on quality.file_registry;
create policy file_registry_select on quality.file_registry for select to authenticated using (
  quality.can(core_company_id, core_project_id, '{quality.view,construction.view}'::text[]));

drop policy sk_records_select on quality.sk_records;
create policy sk_records_select on quality.sk_records for select to authenticated using (
  quality.rec_ok(core_company_id, core_project_id, core_object_id, '{quality.sk.view}'::text[], '{quality.sk.view,quality.sk.import}'::text[],
                 core_created_by, NULL::uuid, core_counterparty_id));

drop function quality.read_ok(quality.read_scope, uuid, uuid, uuid, uuid, uuid);
drop function quality.read_scope(text[], text[]);
drop type quality.read_scope;
drop function quality.readable_projects(text[]);
drop function quality.no_project();
drop function quality.any_project();

commit;
