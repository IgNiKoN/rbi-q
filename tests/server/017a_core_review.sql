-- P2-0016 этап 0: ТД №104–106 (017a). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N». Запуск: после 017a_core_review_up.sql.
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then 'OK ' || l else 'FAIL ' || l end || E'\n' $f$;

do $$
declare
  ca uuid := gen_random_uuid(); k uuid := gen_random_uuid(); n int; s text; res text := '';
begin
  -- №104: ни одна функция core не выполняется клиентом
  select count(*), string_agg(p.proname, ', ') into n, s from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'core' and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'));
  res := res || pg_temp.t(n = 0, 'функции core недоступны authenticated и anon (доступны: ' || coalesce(s, '—') || ')');
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'core';
  res := res || pg_temp.t(n >= 4, 'проверено функций core: ' || n);

  -- №106: путь поиска — разбор по элементам, а не по первому
  select count(*), string_agg(p.proname, ', ') into n, s from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname in ('public', 'planfact') and p.prokind = 'f'
     and array_to_string(p.proconfig, ',') ~ 'search_path=.*\mplanfact\M'
     and array_to_string(p.proconfig, ',') !~ 'search_path=.*\mcore\M';
  res := res || pg_temp.t(n = 0, 'у функций с planfact в пути поиска есть и core (без core: ' || coalesce(s, '—') || ')');
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname in ('public', 'planfact') and array_to_string(p.proconfig, ',') ~ 'search_path=.*\mplanfact\M';
  res := res || pg_temp.t(n >= 50, 'функций с planfact в пути поиска: ' || n);

  -- №106: ссылки объекта на контрагентов — no action; каскадное удаление компании проходит
  select count(*) into n from pg_constraint where conrelid = 'core.projects'::regclass
     and conname in ('projects_customer_fk', 'projects_general_contractor_fk') and confdeltype = 'a';
  res := res || pg_temp.t(n = 2, 'заказчик и генподрядчик объекта — on delete no action (' || n || ' из 2)');
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 017a', true);
  insert into core.counterparties(id, company_id, name, inn, kinds) values (k, ca, 'ООО З', '7701234567', array['customer', 'general_contractor']);
  insert into core.projects(company_id, name, customer_id, general_contractor_id) values (ca, 'Спутник', k, k);
  begin
    delete from core.counterparties where id = k;
    res := res || pg_temp.t(false, 'удалить контрагента, на которого ссылается объект, нельзя');
  exception when foreign_key_violation then
    res := res || pg_temp.t(true, 'удалить контрагента, на которого ссылается объект, нельзя');
  end;
  delete from core.companies where id = ca;
  select count(*) into n from core.projects where company_id = ca;
  res := res || pg_temp.t(n = 0, 'удаление компании каскадом убирает объекты и контрагентов');

  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res, 'FAIL', ''))) / 4;
end $$;
