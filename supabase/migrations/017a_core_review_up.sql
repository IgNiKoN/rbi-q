-- P2-0016 этап 0 (ТД №104–106, ревью P2-0015). Применять после 017_project_links_up.sql, одним запросом.
-- 1. Функции раздела core — служебные (вызываются только из pf_* и триггеров): явно отозвать выполнение у authenticated.
-- 2. Ссылки объекта на заказчика/генподрядчика: on delete restrict → no action (проверка в конце оператора —
--    каскадное удаление компании вместе с её контрагентами и объектами не спотыкается о порядок удаления).
-- Объекты RBI/Quality, Auth и Storage не затрагивает. Повторное применение безопасно. Откат — 017a_core_review_down.sql.
begin;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'core' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.f);
  end loop;
end $$;

do $$
declare c text;
begin
  foreach c in array array['customer', 'general_contractor'] loop
    if exists (select 1 from pg_constraint where conrelid = 'core.projects'::regclass and conname = 'projects_' || c || '_fk'
                                             and confdeltype <> 'a') then
      execute format('alter table core.projects drop constraint projects_%s_fk', c);
      execute format('alter table core.projects add constraint projects_%1$s_fk foreign key (%1$s_id, company_id)
                        references core.counterparties(id, company_id) on delete no action', c);
    end if;
  end loop;
end $$;

commit;
