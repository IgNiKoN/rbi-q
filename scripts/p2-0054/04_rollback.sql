-- P2-0054: откат 03_switch.sql — проекты компании снова «места ведёт Качество» (по копии p2_backup.p2_0054_switch).
-- Места, заведённые в «Компании» после перевода, остаются (их узлы в Качестве связаны с местами ядра — правило 044 их видит).
begin;
do $$
declare
  v_name text := 'RBI';   -- ← компания
  v_company uuid; v_n int;
begin
  select id into v_company from core.companies where name = v_name;
  if v_company is null then raise exception 'Компания «%» не найдена', v_name using errcode = 'P0001'; end if;
  if to_regclass('p2_backup.p2_0054_switch') is null then raise exception 'Нет копии p2_backup.p2_0054_switch — перевода не было' using errcode = 'P0001'; end if;
  alter table core.projects disable trigger projects_touch;
  update core.projects pr set places_master = b.places_master
    from p2_backup.p2_0054_switch b
   where b.project_id = pr.id and b.company_id = v_company and b.rolled_back_at is null;
  get diagnostics v_n = row_count;
  alter table core.projects enable trigger projects_touch;
  update p2_backup.p2_0054_switch set rolled_back_at = now() where company_id = v_company and rolled_back_at is null;
  raise notice 'P2-0054: «%» — проектов возвращено %', v_name, v_n;
end $$;
commit;
