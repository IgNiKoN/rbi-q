-- P2-0015 этап 4: заказчик и генподрядчик объекта (017_project_links). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
-- Запуск: после 017_project_links_up.sql.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then 'OK ' || l else 'FAIL ' || l end || E'\n' $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid := gen_random_uuid(); parch uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  kc uuid; kg uuid; ks uuid; kold uuid; kb uuid; j jsonb; n int; s text; res text := '';
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, ufor, ubadm]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 017b', true), (cb, 'Бета 017b', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, ufor), (cb, ubadm);
  insert into core.projects(id, company_id, name) values (pa, ca, 'Спутник'), (parch, ca, 'Архивный'), (pb, cb, 'Проект Б');
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, uadm,  (select id from core.company_roles where company_id = ca and template_code = 'company_admin'), null),
    (ca, ufor,  (select id from core.company_roles where company_id = ca and template_code = 'foreman'), pa),
    (cb, ubadm, (select id from core.company_roles where company_id = cb and template_code = 'company_admin'), null);

  perform pg_temp.as_user(uadm);
  kc := public.pf_counterparties_save(ca, null, 'ООО Заказчик', '7701234567', '770101001', array['customer'],
          '{"address":"г. Москва","signer":"Директор Иванов И. И."}');
  kg := public.pf_counterparties_save(ca, null, 'АО Генподряд', '7702000000', null, array['general_contractor', 'customer'], null);
  ks := public.pf_counterparties_save(ca, null, 'ООО Поставщик', '7703000000', null, array['supplier'], null);
  kold := public.pf_counterparties_save(ca, null, 'ООО Старый', '7704000000', null, array['customer'], null);
  perform public.pf_update_project(parch, 'Архивный', null, true);
  reset role; perform pg_temp.as_user(ubadm);
  kb := public.pf_counterparties_save(cb, null, 'ООО Бета-заказчик', '7705000000', null, array['customer'], null);

  -- 1. Выбор заказчика и генподрядчика
  reset role; perform pg_temp.as_user(uadm);
  perform public.pf_project_set_counterparties(pa, kc, kg);
  select count(*) into n from public.pf_company_projects(ca) where id = pa and customer_id = kc and customer_name = 'ООО Заказчик'
     and general_contractor_id = kg and general_contractor_name = 'АО Генподряд';
  res := res || pg_temp.t(n = 1, 'объект: заказчик и генподрядчик выбраны, видны в списке объектов');
  j := public.pf_project_counterparties(pa);
  res := res || pg_temp.t(j -> 'customer' ->> 'inn' = '7701234567' and j -> 'customer' -> 'requisites' ->> 'signer' = 'Директор Иванов И. И.'
                          and j -> 'general_contractor' ->> 'name' = 'АО Генподряд', 'карточки для документов: ИНН, реквизиты, подписант');
  select count(*) into n from public.pf_list_company_audit(ca, 200) where table_name = 'projects' and record_id = pa
     and new_data ->> 'customer' = 'ООО Заказчик';
  res := res || pg_temp.t(n = 1, 'журнал: смена заказчика объекта записана');
  perform public.pf_project_set_counterparties(pa, kc, kg);
  select count(*) into n from public.pf_list_company_audit(ca, 200) where table_name = 'projects' and record_id = pa and new_data ? 'customer';
  res := res || pg_temp.t(n = 1, 'повтор без изменений — без записи в журнал');

  -- 2. Проверки
  s := pg_temp.err(format('select public.pf_project_set_counterparties(%L, %L, null)', pa, kb));
  res := res || pg_temp.t(s like '22023%не найден%', 'контрагент чужой компании — отказ (' || s || ')');
  s := pg_temp.err(format('select public.pf_project_set_counterparties(%L, %L, null)', pa, ks));
  res := res || pg_temp.t(s like '22023%не отмечен как заказчик%', 'поставщик в роли заказчика — отказ (' || s || ')');
  s := pg_temp.err(format('select public.pf_project_set_counterparties(%L, %L, %L)', pa, kc, kc));
  res := res || pg_temp.t(s like '22023%генподрядчик%', 'заказчик без вида «генподрядчик» в роли генподрядчика — отказ (' || s || ')');
  perform public.pf_counterparties_archive(kold, true);
  s := pg_temp.err(format('select public.pf_project_set_counterparties(%L, %L, %L)', pa, kold, kg));
  res := res || pg_temp.t(s like '22023%в архиве%', 'новый выбор архивного — отказ (' || s || ')');
  perform public.pf_counterparties_archive(kc, true);
  s := pg_temp.err(format('select public.pf_project_set_counterparties(%L, %L, null)', pa, kc));
  res := res || pg_temp.t(s = 'OK' and (select customer_id from core.projects where id = pa) = kc
                          and (select general_contractor_id from core.projects where id = pa) is null,
                          'заказчик ушёл в архив — у объекта остаётся, генподрядчика можно снять (' || s || ')');
  s := pg_temp.err(format('select public.pf_project_set_counterparties(%L, %L, null)', parch, kg));
  res := res || pg_temp.t(s like '%архив%', 'объект в архиве — менять нельзя (' || s || ')');

  -- 3. Права
  reset role; perform pg_temp.as_user(ufor);
  s := pg_temp.err(format('select public.pf_project_set_counterparties(%L, null, null)', pa));
  res := res || pg_temp.t(s like '42501%', 'прораб без права — менять нельзя (' || s || ')');
  j := public.pf_project_counterparties(pa);
  res := res || pg_temp.t(j -> 'customer' ->> 'name' = 'ООО Заказчик', 'прораб объекта видит заказчика (для КС-2)');
  reset role; perform pg_temp.as_user(ubadm);
  s := pg_temp.err(format('select public.pf_project_counterparties(%L)', pa));
  res := res || pg_temp.t(s like '42501%', 'админ Беты не видит заказчика объекта Альфы (' || s || ')');
  s := pg_temp.err(format('select public.pf_project_set_counterparties(%L, %L, null)', pa, kb));
  res := res || pg_temp.t(s like '42501%', 'админ Беты не меняет объект Альфы (' || s || ')');

  -- 4. Защита на уровне базы (в обход функций)
  reset role;
  s := pg_temp.err(format('update core.projects set customer_id = %L where id = %L', kb, pa));
  res := res || pg_temp.t(s like '23503%', 'база: ссылка на контрагента другой компании невозможна (' || s || ')');
  s := pg_temp.err(format('delete from core.counterparties where id = %L', kc));
  res := res || pg_temp.t(s like '23503%', 'база: контрагента объекта удалить нельзя (' || s || ')');

  -- 5. Аноним
  perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  s := pg_temp.err(format('select public.pf_project_counterparties(%L)', pa));
  res := res || pg_temp.t(s like '42501%', 'anon закрыт (' || s || ')');
  reset role;

  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res, 'FAIL', ''))) / 4;
end $$;
