-- P2-0015 этап 3: контрагенты компании и правила данных (017). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
-- Запуск: после 017_counterparties_up.sql (регрессия — tests/server/002…016).
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
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  k1 uuid; k2 uuid; kb uuid; n int; s text; res text := '';
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, upto, ufor, ubadm]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 017', true), (cb, 'Бета 017', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, upto), (ca, ufor), (cb, ubadm);
  insert into core.projects(id, company_id, name) values (pa, ca, 'Проект А'), (pb, cb, 'Проект Б');
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, uadm,  (select id from core.company_roles where company_id = ca and template_code = 'company_admin'), null),
    (ca, upto,  (select id from core.company_roles where company_id = ca and template_code = 'pto'), null),
    (ca, ufor,  (select id from core.company_roles where company_id = ca and template_code = 'foreman'), pa),
    (cb, ubadm, (select id from core.company_roles where company_id = cb and template_code = 'company_admin'), null);

  -- 1. Схема и право
  res := res || pg_temp.t(to_regclass('core.counterparties') is not null and to_regclass('planfact.counterparties') is null, 'таблица core.counterparties');
  res := res || pg_temp.t((select rowsecurity from pg_tables where schemaname = 'core' and tablename = 'counterparties'), 'RLS у контрагентов включена');
  res := res || pg_temp.t((select is_nullable = 'YES' from information_schema.columns where table_schema = 'core' and table_name = 'counterparties'
                           and column_name = 'platform_company_id'), 'platform_company_id есть и необязателен');
  res := res || pg_temp.t(exists (select 1 from core.permission_catalog where action = 'core.counterparties.manage'), 'право в каталоге');
  select count(*) into n from core.company_roles r join core.company_role_permissions p on p.role_id = r.id and p.action = 'core.counterparties.manage'
   where r.company_id = ca;
  res := res || pg_temp.t(n = 2, 'право у ролей «Администратор компании» и «ПТО» новой компании (' || n || ')');
  select count(*) into n from core.role_template_permissions where action = 'core.counterparties.manage';
  res := res || pg_temp.t(n = 2, 'право в шаблонах company_admin и pto (' || n || ')');

  -- 2. Правила данных
  select count(*) into n from information_schema.columns c join pg_tables t on t.schemaname = c.table_schema and t.tablename = c.table_name
   where c.table_schema = 'core' and c.column_name = 'updated_at';
  res := res || pg_temp.t(n = (select count(*) from pg_tables where schemaname = 'core') - 1, 'updated_at у всех таблиц ядра, кроме журнала (' || n || ')');
  res := res || pg_temp.t((select count(*) from information_schema.columns where table_schema = 'core' and column_name = 'deleted_at'
                           and table_name in ('companies', 'projects', 'company_roles', 'locations', 'units', 'work_types', 'counterparties')) = 7,
                          'deleted_at у сущностей ядра');
  update core.projects set name = 'Проект А1', updated_at = '2000-01-01' where id = pa;
  res := res || pg_temp.t((select updated_at from core.projects where id = pa) = now(), 'триггер ставит updated_at при правке (объект)');

  -- 3. Администратор: добавить, правка, дубль ИНН, проверки
  perform pg_temp.as_user(uadm);
  k1 := public.pf_counterparties_save(ca, null, ' ООО Заказчик ', '7701 234567', '770101001', array['customer', 'customer'],
                                      '{"address":"Москва","bank":"Банк","account":"40702810000000000001","bik":"044525225"}');
  res := res || pg_temp.t(k1 is not null, 'админ добавил контрагента');
  select count(*) into n from public.pf_counterparties_list(ca) where id = k1 and name = 'ООО Заказчик' and inn = '7701234567' and kinds = array['customer'];
  res := res || pg_temp.t(n = 1, 'в списке: название без пробелов, ИНН без пробелов, вид без повтора');
  s := pg_temp.err(format('select public.pf_counterparties_save(%L, null, %L, %L, null, array[%L], null)', ca, 'Другое ООО', '7701234567', 'supplier'));
  res := res || pg_temp.t(s like '23505%такой ИНН%' or s like '23505%таким ИНН%', 'дубль ИНН в компании — отказ (' || s || ')');
  s := pg_temp.err(format('select public.pf_counterparties_save(%L, null, %L, %L, null, array[%L], null)', ca, 'Плохой', '12345', 'supplier'));
  res := res || pg_temp.t(s like '22023%ИНН%', 'неверный ИНН — отказ (' || s || ')');
  s := pg_temp.err(format('select public.pf_counterparties_save(%L, null, %L, %L, null, array[]::text[], null)', ca, 'Без вида', '7702000000'));
  res := res || pg_temp.t(s like '22023%', 'без вида — отказ (' || s || ')');
  s := pg_temp.err(format('select public.pf_counterparties_save(%L, null, %L, %L, null, array[%L], null)', ca, 'Вид?', '7702000000', 'bank'));
  res := res || pg_temp.t(s like '22023%', 'неизвестный вид — отказ (' || s || ')');
  s := pg_temp.err(format('select public.pf_counterparties_save(%L, null, %L, %L, %L, array[%L], null)', ca, 'КПП?', '7702000000', '12', 'supplier'));
  res := res || pg_temp.t(s like '22023%КПП%', 'неверный КПП — отказ (' || s || ')');
  perform public.pf_counterparties_save(ca, k1, 'ООО Заказчик', '7701234567', '770101001', array['customer', 'general_contractor'],
                                        '{"address":"Москва, ул. 1"}');
  select count(*) into n from public.pf_counterparties_list(ca) where id = k1 and kinds = array['customer', 'general_contractor']
     and requisites ->> 'address' = 'Москва, ул. 1';
  res := res || pg_temp.t(n = 1, 'правка: вид и реквизиты сохранены');
  perform public.pf_counterparties_save(ca, k1, 'ООО Заказчик', '7701234567', '770101001', array['customer', 'general_contractor'],
                                        '{"address":"Москва, ул. 1"}');

  -- 4. ПТО — может; прораб — только видит
  reset role; perform pg_temp.as_user(upto);
  k2 := public.pf_counterparties_save(ca, null, 'ИП Поставщик', '770200000012', null, array['supplier'], null);
  res := res || pg_temp.t(k2 is not null, 'ПТО добавил контрагента (ИНН 12 цифр)');
  reset role; perform pg_temp.as_user(ufor);
  select count(*) into n from public.pf_counterparties_list(ca);
  res := res || pg_temp.t(n = 2, 'прораб видит контрагентов своей компании (' || n || ')');
  s := pg_temp.err(format('select public.pf_counterparties_save(%L, null, %L, %L, null, array[%L], null)', ca, 'Прораб ООО', '7703000000', 'supplier'));
  res := res || pg_temp.t(s like '42501%', 'прораб без права — добавить нельзя (' || s || ')');
  s := pg_temp.err(format('select public.pf_counterparties_archive(%L, true)', k1));
  res := res || pg_temp.t(s like '42501%', 'прораб без права — в архив нельзя (' || s || ')');
  select count(*) into n from public.pf_my_company_access() where company_id = ca and not can_manage_counterparties;
  res := res || pg_temp.t(n = 1, 'флаг доступа прораба: управлять нельзя');

  -- 5. Чужая компания
  reset role; perform pg_temp.as_user(ubadm);
  s := pg_temp.err(format('select count(*) from public.pf_counterparties_list(%L)', ca));
  res := res || pg_temp.t(s like '42501%', 'админ Беты не видит контрагентов Альфы (' || s || ')');
  s := pg_temp.err(format('select public.pf_counterparties_save(%L, null, %L, %L, null, array[%L], null)', ca, 'Взлом', '7704000000', 'supplier'));
  res := res || pg_temp.t(s like '42501%', 'админ Беты не добавит в Альфу (' || s || ')');
  s := pg_temp.err(format('select public.pf_counterparties_save(%L, %L, %L, %L, null, array[%L], null)', cb, k1, 'Взлом', '7701234567', 'supplier'));
  res := res || pg_temp.t(s like '22023%не найден%', 'админ Беты не правит контрагента Альфы через свою компанию (' || s || ')');
  s := pg_temp.err(format('select public.pf_counterparties_archive(%L, true)', k1));
  res := res || pg_temp.t(s like '42501%', 'админ Беты не архивирует контрагента Альфы (' || s || ')');
  kb := public.pf_counterparties_save(cb, null, 'ООО Заказчик (Бета)', '7701234567', null, array['customer'], null);
  res := res || pg_temp.t(kb is not null, 'тот же ИНН в другой компании — можно');
  select count(*) into n from public.pf_counterparties_list(cb);
  res := res || pg_temp.t(n = 1, 'Бета видит только своего (' || n || ')');
  s := pg_temp.err('select count(*) from core.counterparties');
  res := res || pg_temp.t(s = 'OK' and (select count(*) from core.counterparties) = 1, 'прямое чтение таблицы — только своя компания (RLS)');
  s := pg_temp.err(format('insert into core.counterparties(company_id, name, inn, kinds) values (%L, %L, %L, array[%L])', ca, 'Мимо', '7705000000', 'supplier'));
  res := res || pg_temp.t(s like '42501%', 'прямая запись в таблицу — отказ (' || s || ')');

  -- 6. Архив и журнал
  reset role; perform pg_temp.as_user(uadm);
  perform public.pf_counterparties_archive(k2, true);
  select count(*) into n from public.pf_counterparties_list(ca);
  res := res || pg_temp.t(n = 1, 'архивный скрыт из списка (' || n || ')');
  select count(*) into n from public.pf_counterparties_list(ca, true) where id = k2 and archived_at is not null;
  res := res || pg_temp.t(n = 1, 'архивный виден с флагом «показать архив»');
  s := pg_temp.err(format('select public.pf_counterparties_save(%L, null, %L, %L, null, array[%L], null)', ca, 'Повтор', '770200000012', 'supplier'));
  res := res || pg_temp.t(s like '23505%', 'ИНН архивного занят — дубль запрещён (' || s || ')');
  perform public.pf_counterparties_archive(k2, false);
  select count(*) into n from public.pf_counterparties_list(ca);
  res := res || pg_temp.t(n = 2, 'вернули из архива');
  select count(*) into n from public.pf_list_company_audit(ca, 200) where table_name = 'counterparties';
  res := res || pg_temp.t(n = 5, 'журнал: добавление ×2, правка ×1 (повтор без изменений — без записи), архив, возврат (' || n || ')');

  -- 7. Аноним
  reset role;
  perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  s := pg_temp.err(format('select count(*) from public.pf_counterparties_list(%L)', ca));
  res := res || pg_temp.t(s like '42501%', 'anon закрыт (' || s || ')');
  reset role;

  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res, 'FAIL', ''))) / 4;
end $$;
