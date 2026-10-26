-- P2-0016: откат 017a_core_review_up.sql. Применять до 017_project_links_down.sql.
-- Права на функции core не возвращаются: у authenticated их и до 017a не было (выдача — только явным grant).
begin;

do $$
declare c text;
begin
  foreach c in array array['customer', 'general_contractor'] loop
    if exists (select 1 from pg_constraint where conrelid = 'core.projects'::regclass and conname = 'projects_' || c || '_fk'
                                             and confdeltype <> 'r') then
      execute format('alter table core.projects drop constraint projects_%s_fk', c);
      execute format('alter table core.projects add constraint projects_%1$s_fk foreign key (%1$s_id, company_id)
                        references core.counterparties(id, company_id) on delete restrict', c);
    end if;
  end loop;
end $$;

commit;
