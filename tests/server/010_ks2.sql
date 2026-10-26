-- P2-0008b: тесты проекта КС-2 — права и изоляция компаний, факт за период (прежний вызов fact_totals не меняется),
-- предложение системы (связки, материалы по норме, цены договорной КП, «выставлено ранее»), редакции и их неизменяемость,
-- выдача (без цен — нельзя, повторно — нельзя, после чужой выдачи — пересохранить), аннулирование, бланк, журнал, anon.
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 010_up.sql (или вставить 010_up.sql перед этим файлом).
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
-- строка предложения/снимка по номеру строки заказчика
create or replace function pg_temp.row_of(rows jsonb, rn int) returns jsonb language sql as $f$
  select r from jsonb_array_elements(rows) r where (r ->> 'row_no')::int = rn limit 1 $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); upm uuid := gen_random_uuid();
  uecon uuid := gen_random_uuid(); umgmt uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid; pa2 uuid; pa3 uuid; pb uuid; f5 uuid; kv uuid; m2 uuid; wt uuid; wt2 uuid; imp uuid; est uuid; kp1 uuid; kp2 uuid;
  pos12 uuid; pos14 uuid; b1 uuid; j jsonb; e1 uuid; pend uuid; n int; t text; res text := ''; x numeric; r jsonb;
  a1 uuid; a2 uuid; a3 uuid; rev int; d1 date := (now() at time zone 'Europe/Moscow')::date - 10; d2 date := (now() at time zone 'Europe/Moscow')::date - 5;
  old_tot text; new_tot text; sha text;
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,upm,uecon,umgmt,ubadm]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor),(ca,upm),(ca,uecon),(ca,umgmt),(cb,ubadm);
  insert into core.role_assignments(company_id,user_id,role_id,project_id)
  select ca, u, (select id from core.company_roles where company_id = ca and template_code = c), null
  from (values (uadm,'company_admin'),(upto,'pto'),(ufor,'foreman'),(upm,'project_manager'),(uecon,'economist'),(umgmt,'management')) v(u, c);
  insert into core.role_assignments(company_id,user_id,role_id,project_id)
  values (cb, ubadm, (select id from core.company_roles where company_id = cb and template_code = 'company_admin'), null);
  select id into m2 from core.units where company_id is null and code = 'м²';

  -- 0. Каталог и шаблоны ролей
  res := res || pg_temp.t(exists (select 1 from core.permission_catalog where action = 'planfact.ks2.view'), 'действие ks2.view в каталоге');
  select string_agg(r2.template_code, ',' order by r2.template_code) into t from core.company_role_permissions rp
    join core.company_roles r2 on r2.id = rp.role_id where r2.company_id = ca and rp.action = 'planfact.ks2.view';
  res := res || pg_temp.t(t = 'management', 'ks2.view: руководство (получено: ' || coalesce(t, '-') || ')');
  select string_agg(r2.template_code, ',' order by r2.template_code) into t from core.company_role_permissions rp
    join core.company_roles r2 on r2.id = rp.role_id where r2.company_id = ca and rp.action = 'planfact.ks2.edit';
  res := res || pg_temp.t(t = 'economist,project_manager,pto', 'ks2.edit: экономист, РП, ПТО (получено: ' || coalesce(t, '-') || ')');

  -- 1. Подготовка: ВОР (работа 12 → материал 13 по норме 9; работа 14 → материал 15 без нормы, 40 на 20), смета, КП
  reset role; perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК КС-2');
  pa2 := public.pf_create_project(ca, 'ЖК Архив');
  pa3 := public.pf_create_project(ca, 'ЖК Другой');
  f5 := public.pf_add_location(pa, null, 'floor', '5 этаж');
  kv := public.pf_add_location(pa, f5, 'apartment', 'Кв. 1');
  reset role; perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка стен', m2);
  wt2 := public.pf_vor_add_work_type(pa, 'Окраска стен', m2);
  imp := public.pf_vor_create_import(pa, 'вор.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, '[{"row_no": 12, "kind": "work", "number": "1.1", "name": "Штукатурка стен", "unit_text": "м2", "qty": 100},
    {"row_no": 13, "kind": "material", "number": "1.1.1", "name": "Смесь «Альфа»", "unit_text": "кг", "qty": 900, "norm": 9, "parent_row_no": 12},
    {"row_no": 14, "kind": "work", "number": "1.2", "name": "Окраска стен", "unit_text": "м2", "qty": 20},
    {"row_no": 15, "kind": "material", "number": "1.2.1", "name": "Краска «Бета»", "unit_text": "л", "qty": 40, "parent_row_no": 14}]');
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(
    jsonb_build_object('row_no', 12, 'location_id', f5, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 14, 'location_id', kv, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp);
  select id into pos12 from planfact.vor_positions where project_id = pa and location_id = f5;
  select id into pos14 from planfact.vor_positions where project_id = pa and location_id = kv;
  est := public.pf_estimate_create(pa, 'Смета', array[imp]);
  j := public.pf_kp_create(est, repeat('a', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', imp, 'row_no', 12, 'kind', 'work', 'price_labor', 300, 'price_material', null),
    jsonb_build_object('import_id', imp, 'row_no', 13, 'kind', 'material', 'price_labor', null, 'price_material', 12.5),
    jsonb_build_object('import_id', imp, 'row_no', 14, 'kind', 'work', 'price_labor', 100, 'price_material', 50))), 1000);
  kp1 := (j ->> 'id')::uuid;
  j := public.pf_kp_create(est, repeat('a', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', imp, 'row_no', 12, 'kind', 'work', 'price_labor', 310, 'price_material', null),
    jsonb_build_object('import_id', imp, 'row_no', 13, 'kind', 'material', 'price_labor', null, 'price_material', 13),
    jsonb_build_object('import_id', imp, 'row_no', 14, 'kind', 'work', 'price_labor', 100, 'price_material', 50))), 1100);
  kp2 := (j ->> 'id')::uuid;
  b1 := public.pf_brigade_save(ca, null, 'Иванов');
  -- факт: 10 (d1) + 5 (d2) по позиции 12; 25 по позиции 14 при плане 20 → ждёт подтверждения
  reset role; perform pg_temp.as_user(ufor);
  perform public.pf_fact_add(pos12, b1, d1, 10);
  perform public.pf_fact_add(pos12, b1, d2, 5);
  j := public.pf_fact_add(pos14, b1, d2, 25);
  pend := (j ->> 'id')::uuid;
  res := res || pg_temp.t(j ->> 'status' = 'pending_approval', 'факт сверх плана ждёт подтверждения');

  -- 2. Факт за период: прежний вызов = вызов без границ; граница по дате
  reset role;
  select string_agg(format('%s:%s:%s:%s', position_id, fact_qty, pending_qty, pending_count), ',' order by position_id) into old_tot from planfact.fact_totals(pa);
  select string_agg(format('%s:%s:%s:%s', position_id, fact_qty, pending_qty, pending_count), ',' order by position_id) into new_tot from planfact.fact_totals(pa, null, null);
  res := res || pg_temp.t(old_tot = new_tot, 'fact_totals(p) = fact_totals(p, null, null)');
  select fact_qty into x from planfact.fact_totals(pa) where position_id = pos12;
  res := res || pg_temp.t(x = 15, 'fact_totals(p): накопленный факт 15 (получено ' || x || ')');
  select fact_qty into x from planfact.fact_totals(pa, null, d1) where position_id = pos12;
  res := res || pg_temp.t(x = 10, 'fact_totals по d1 включительно = 10 (получено ' || x || ')');
  select fact_qty into x from planfact.fact_totals(pa, d1 + 1, d2) where position_id = pos12;
  res := res || pg_temp.t(x = 5, 'fact_totals за (d1, d2] = 5 (получено ' || x || ')');

  -- 3. Права на настройки и договорную КП
  reset role; perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select public.pf_ks2_settings(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'прораб не видит КС-2 (' || t || ')');
  reset role; perform pg_temp.as_user(uadm);
  t := pg_temp.err(format('select public.pf_ks2_settings(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'администратор без ks2.* не видит КС-2 (' || t || ')');
  reset role; perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select public.pf_ks2_acts(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'чужая компания не видит акты (' || t || ')');
  reset role; perform pg_temp.as_user(upto);
  t := pg_temp.err(format('select public.pf_ks2_act_create(%L, %L, %L, %L, %L)', pa, '1', d1, d1 - 1, d1));
  res := res || pg_temp.t(t like '22023%Выберите договорную%', 'без договорной КП акт не создаётся (' || t || ')');
  t := pg_temp.err(format('select public.pf_ks2_set_contract(%L, %L)', pa3, kp1));
  res := res || pg_temp.t(t like '22023%', 'КП другого проекта нельзя сделать договорной (' || t || ')');
  reset role; perform pg_temp.as_user(umgmt);
  t := pg_temp.err(format('select public.pf_ks2_set_contract(%L, %L)', pa, kp1));
  res := res || pg_temp.t(t like '42501%', 'руководство (просмотр) не выбирает договорную КП (' || t || ')');
  reset role; perform pg_temp.as_user(upto);
  perform public.pf_ks2_set_contract(pa, kp1);
  j := public.pf_ks2_settings(pa);
  res := res || pg_temp.t((j ->> 'contract_kp_revision_id')::uuid = kp1 and (j ->> 'can_edit')::boolean and j ->> 'next_act_no' = '1'
                          and jsonb_array_length(j -> 'kp_revisions') = 2, 'настройки: договорная КП, можно править, следующий № 1, 2 редакции КП');
  reset role; perform pg_temp.as_user(umgmt);
  j := public.pf_ks2_settings(pa);
  res := res || pg_temp.t(not (j ->> 'can_edit')::boolean, 'руководство видит настройки без права правки');

  -- 4. Акт 1 за период по d1: предложение системы
  reset role; perform pg_temp.as_user(upto);
  a1 := public.pf_ks2_act_create(pa, '1', d1, d1 - 1, d1);
  t := pg_temp.err(format('select public.pf_ks2_act_create(%L, %L, %L, %L, %L)', pa, ' 1 ', d1, d1, d1));
  res := res || pg_temp.t(t like '23505%', 'повтор номера акта — понятная ошибка (' || t || ')');
  t := pg_temp.err(format('select public.pf_ks2_act_create(%L, %L, %L, %L, %L)', pa, '9', d1, d2, d1));
  res := res || pg_temp.t(t like '22023%', 'начало периода позже конца — отказ (' || t || ')');
  j := public.pf_ks2_act(a1);
  res := res || pg_temp.t(jsonb_array_length(j -> 'proposal') = 2, 'в предложении 2 строки (ждущий подтверждения факт не идёт): ' || jsonb_array_length(j -> 'proposal'));
  r := pg_temp.row_of(j -> 'proposal', 12);
  res := res || pg_temp.t((r ->> 'sys_qty')::numeric = 10 and (r ->> 'total_qty')::numeric = 10 and (r ->> 'prev_qty')::numeric = 0
                          and (r ->> 'price')::numeric = 300 and r ->> 'number' = '1.1' and r ->> 'unit_text' = 'м2',
                          'работа 12: по системе 10, с начала 10, ранее 0, цена 300 (' || r::text || ')');
  r := pg_temp.row_of(j -> 'proposal', 13);
  res := res || pg_temp.t((r ->> 'sys_qty')::numeric = 90 and (r ->> 'price')::numeric = 12.5 and r ->> 'kind' = 'material',
                          'материал 13 = 10 × норма 9 = 90, цена материала 12.5 (' || r::text || ')');
  reset role; perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select public.pf_ks2_act(%L)', a1));
  res := res || pg_temp.t(t like '22023%', 'прораб не открывает акт (' || t || ')');
  reset role; perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select public.pf_ks2_act(%L)', a1));
  res := res || pg_temp.t(t like '22023%', 'чужая компания не открывает акт по id (' || t || ')');
  select count(*) into n from planfact.ks2_acts;
  res := res || pg_temp.t(n = 0, 'чужая компания: прямое чтение ks2_acts — 0 строк');

  -- 5. Сохранение редакций: правка ПТО рядом с предложением, сервер пересчитывает предложение
  reset role; perform pg_temp.as_user(upto);
  t := pg_temp.err(format('select public.pf_ks2_save(%L, %L, %L)', a1, '{}', '[{"source_row_id": "00000000-0000-0000-0000-000000000000", "qty": 1}]'));
  res := res || pg_temp.t(t like '22023%', 'строка не из акта — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_ks2_save(%L, %L, %L)', a1, '{}',
    jsonb_build_array(jsonb_build_object('source_row_id', pg_temp.row_of(j -> 'proposal', 12) ->> 'source_row_id', 'qty', -1))));
  res := res || pg_temp.t(t like '22023%', 'отрицательный объём — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_ks2_save(%L, %L, %L)', a1, '{"contract_date": "не дата"}', '[]'));
  res := res || pg_temp.t(t like '22023%', 'неверная дата договора — отказ (' || t || ')');
  rev := public.pf_ks2_save(a1, '{"customer": "АО Заказчик", "contract_no": "Д-1", "contract_date": "2026-03-01", "act_no": "1", "period_from": "1999-01-01", "лишнее": "x"}',
    jsonb_build_array(jsonb_build_object('source_row_id', pg_temp.row_of(j -> 'proposal', 12) ->> 'source_row_id', 'qty', 9.5, 'price', 300, 'excluded', false)));
  res := res || pg_temp.t(rev = 1, 'первая редакция № 1');
  j := public.pf_ks2_act(a1);
  r := pg_temp.row_of(j -> 'last_revision' -> 'snapshot' -> 'rows', 12);
  res := res || pg_temp.t((r ->> 'sys_qty')::numeric = 10 and (r ->> 'qty')::numeric = 9.5 and (r ->> 'sys_price')::numeric = 300,
                          'в редакции рядом: по системе 10, итог ПТО 9.5 (' || r::text || ')');
  r := pg_temp.row_of(j -> 'last_revision' -> 'snapshot' -> 'rows', 13);
  res := res || pg_temp.t((r ->> 'qty')::numeric = 90, 'строка без правки — по предложению системы (90)');
  res := res || pg_temp.t((j -> 'last_revision' ->> 'total')::numeric = 9.5 * 300 + 90 * 12.5, 'итог редакции = Σ строк (' || (j -> 'last_revision' ->> 'total') || ')');
  r := j -> 'last_revision' -> 'snapshot' -> 'header';
  res := res || pg_temp.t(r ->> 'period_from' = (d1 - 1)::text and r ->> 'customer' = 'АО Заказчик' and not (r ? 'лишнее'),
                          'шапка: период — из акта, лишние поля отброшены');
  res := res || pg_temp.t((select requisites ->> 'contract_no' from planfact.ks2_settings where project_id = pa) = 'Д-1'
                          and not ((select requisites from planfact.ks2_settings where project_id = pa) ? 'act_no'), 'реквизиты запомнены для следующих актов (без № и даты акта)');
  reset role; perform pg_temp.as_user(uecon);
  rev := public.pf_ks2_save(a1, (j -> 'last_revision' -> 'snapshot' -> 'header'),
    jsonb_build_array(jsonb_build_object('source_row_id', pg_temp.row_of(j -> 'proposal', 12) ->> 'source_row_id', 'qty', 9.5, 'price', 300)));
  res := res || pg_temp.t(rev = 2, 'экономист сохраняет редакцию № 2');
  reset role; perform pg_temp.as_user(umgmt);
  t := pg_temp.err(format('select public.pf_ks2_save(%L, %L, %L)', a1, '{}', '[]'));
  res := res || pg_temp.t(t like '42501%', 'руководство не сохраняет редакцию (' || t || ')');
  select count(*) into n from public.pf_ks2_revisions(a1);
  res := res || pg_temp.t(n = 2, 'руководство видит историю: 2 редакции');
  reset role; perform pg_temp.as_user(upto);
  t := pg_temp.err(format('insert into planfact.ks2_acts(company_id, project_id, act_no, act_date, period_from, period_to, kp_revision_id) values (%L,%L,%L,%L,%L,%L,%L)', ca, pa, 'X', d1, d1, d1, kp1));
  res := res || pg_temp.t(t like '42501%', 'прямая запись в ks2_acts закрыта (' || t || ')');
  t := pg_temp.err(format('update planfact.ks2_revisions set total = 0 where act_id = %L', a1));
  res := res || pg_temp.t(t like '42501%', 'прямая правка редакции закрыта (' || t || ')');
  reset role;
  t := pg_temp.err(format('update planfact.ks2_revisions set total = 0 where act_id = %L', a1));
  res := res || pg_temp.t(t like '42501%Редакцию акта%', 'сторож: редакцию не изменить даже владельцу БД (' || t || ')');
  t := pg_temp.err(format('delete from planfact.ks2_revisions where act_id = %L', a1));
  res := res || pg_temp.t(t like '42501%', 'сторож: редакцию не удалить (' || t || ')');
  t := pg_temp.err(format('delete from planfact.ks2_acts where id = %L', a1));
  res := res || pg_temp.t(t like '42501%', 'сторож: акт не удалить (' || t || ')');

  -- 6. Выдача акта 1
  reset role; perform pg_temp.as_user(umgmt);
  t := pg_temp.err(format('select public.pf_ks2_issue(%L)', a1));
  res := res || pg_temp.t(t like '42501%', 'руководство не выдаёт акт (' || t || ')');
  reset role; perform pg_temp.as_user(upto);
  perform public.pf_ks2_issue(a1);
  t := pg_temp.err(format('select public.pf_ks2_issue(%L)', a1));
  res := res || pg_temp.t(t like '22023%уже выдан%', 'повторная выдача невозможна (' || t || ')');
  t := pg_temp.err(format('select public.pf_ks2_save(%L, %L, %L)', a1, '{}', '[]'));
  res := res || pg_temp.t(t like '42501%', 'выданный акт не правится (' || t || ')');
  reset role;
  t := pg_temp.err(format('update planfact.ks2_acts set status = %L, issued_revision_id = null where id = %L', 'draft', a1));
  res := res || pg_temp.t(t like '42501%', 'сторож: выданный акт не вернуть в черновик (' || t || ')');
  t := pg_temp.err(format('insert into planfact.ks2_revisions(act_id, project_id, company_id, revision_no, snapshot, total) values (%L,%L,%L,9,%L,0)', a1, pa, ca, '{"rows": []}'));
  res := res || pg_temp.t(t like '42501%', 'сторож: к выданному акту редакцию не добавить (' || t || ')');

  -- 7. Договорная КП меняется → новый черновик с новыми ценами; акт 2: выставленное ранее вычитается
  reset role; perform pg_temp.as_user(upto);
  perform public.pf_ks2_set_contract(pa, kp2);
  j := public.pf_ks2_settings(pa);
  res := res || pg_temp.t(j ->> 'next_act_no' = '2', 'следующий № акта — 2');
  a2 := public.pf_ks2_act_create(pa, '2', d2, d1 + 1, d2);
  j := public.pf_ks2_act(a2);
  r := pg_temp.row_of(j -> 'proposal', 12);
  res := res || pg_temp.t((r ->> 'total_qty')::numeric = 15 and (r ->> 'prev_qty')::numeric = 9.5 and (r ->> 'sys_qty')::numeric = 5.5
                          and (r ->> 'price')::numeric = 310, 'акт 2, работа 12: с начала 15, ранее 9.5, по системе 5.5, цена новой КП 310 (' || r::text || ')');
  r := pg_temp.row_of(j -> 'proposal', 13);
  res := res || pg_temp.t((r ->> 'total_qty')::numeric = 135 and (r ->> 'prev_qty')::numeric = 90 and (r ->> 'sys_qty')::numeric = 45,
                          'акт 2, материал 13: 135 − 90 = 45 (' || r::text || ')');
  j := public.pf_ks2_act(a1);
  r := pg_temp.row_of(j -> 'last_revision' -> 'snapshot' -> 'rows', 12);
  res := res || pg_temp.t((r ->> 'price')::numeric = 300 and j -> 'proposal' = 'null'::jsonb, 'у выданного акта 1 цена прежняя (300), пересчёта нет');
  select total into x from public.pf_ks2_acts(pa) where id = a1;
  res := res || pg_temp.t(x = 9.5 * 300 + 90 * 12.5, 'список актов: сумма выданной редакции акта 1');

  -- 8. РП подтверждает перебор по 14 → работа 14 (цена работа + материал = 150) и материал 15 без нормы (40/20 × 25 = 50, без цены)
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_fact_decide(pend, true);
  reset role; perform pg_temp.as_user(upto);
  j := public.pf_ks2_act(a2);
  r := pg_temp.row_of(j -> 'proposal', 14);
  res := res || pg_temp.t((r ->> 'sys_qty')::numeric = 25 and (r ->> 'price')::numeric = 150, 'работа 14: 25, цена работы + материала строки = 150 (' || coalesce(r::text, '-') || ')');
  r := pg_temp.row_of(j -> 'proposal', 15);
  res := res || pg_temp.t((r ->> 'sys_qty')::numeric = 50 and r ->> 'price' is null, 'материал 15 без нормы: 25 × 40/20 = 50, цены в КП нет (' || coalesce(r::text, '-') || ')');
  rev := public.pf_ks2_save(a2, '{}', '[]');
  t := pg_temp.err(format('select public.pf_ks2_issue(%L)', a2));
  res := res || pg_temp.t(t like '22023%Нет цены%', 'без цены акт не выдаётся (' || t || ')');
  -- акт 3 (тот же период) сохраняется, пока акт 2 ещё черновик
  a3 := public.pf_ks2_act_create(pa, '3', d2, d1 + 1, d2);
  j := public.pf_ks2_act(a3);
  rev := public.pf_ks2_save(a3, '{}', jsonb_build_array(jsonb_build_object('source_row_id', pg_temp.row_of(j -> 'proposal', 15) ->> 'source_row_id', 'qty', 50, 'excluded', true)));
  -- акт 2: исключить строку без цены и выдать
  j := public.pf_ks2_act(a2);
  rev := public.pf_ks2_save(a2, '{}', jsonb_build_array(jsonb_build_object('source_row_id', pg_temp.row_of(j -> 'proposal', 15) ->> 'source_row_id', 'qty', 50, 'price', null, 'excluded', true)));
  perform public.pf_ks2_issue(a2);
  t := pg_temp.err(format('select public.pf_ks2_issue(%L)', a3));
  res := res || pg_temp.t(t like '22023%После сохранения выдан другой акт%', 'акт 3 после выдачи акта 2 по тем же строкам — пересохранить (' || t || ')');
  j := public.pf_ks2_act(a3);
  r := pg_temp.row_of(j -> 'proposal', 12);
  res := res || pg_temp.t((r ->> 'sys_qty')::numeric = 0 and (r ->> 'prev_qty')::numeric = 15, 'акт 3: выданный объём не попадает (по системе 0, ранее 15)');
  r := pg_temp.row_of(j -> 'proposal', 15);
  res := res || pg_temp.t((r ->> 'sys_qty')::numeric = 50 and (r ->> 'prev_qty')::numeric = 0, 'исключённая в акте 2 строка остаётся доступной (50)');

  -- 9. Аннулирование возвращает объём
  t := pg_temp.err(format('select public.pf_ks2_annul(%L, %L)', a3, 'черновик'));
  res := res || pg_temp.t(t like '22023%', 'черновик не аннулируется (' || t || ')');
  t := pg_temp.err(format('select public.pf_ks2_annul(%L, %L)', a1, '  '));
  res := res || pg_temp.t(t like '22023%причину%', 'аннулирование без причины — отказ (' || t || ')');
  perform public.pf_ks2_annul(a1, 'Заказчик не подписал');
  j := public.pf_ks2_act(a3);
  r := pg_temp.row_of(j -> 'proposal', 12);
  res := res || pg_temp.t((r ->> 'prev_qty')::numeric = 5.5 and (r ->> 'sys_qty')::numeric = 9.5, 'после аннулирования акта 1 объём снова доступен: ранее 5.5, по системе 9.5 (' || r::text || ')');
  t := pg_temp.err(format('select public.pf_ks2_annul(%L, %L)', a1, 'ещё раз'));
  res := res || pg_temp.t(t like '22023%', 'повторное аннулирование — отказ (' || t || ')');
  reset role;
  t := pg_temp.err(format('update planfact.ks2_acts set annul_reason = %L where id = %L', 'x', a1));
  res := res || pg_temp.t(t like '42501%', 'сторож: аннулированный акт не меняется (' || t || ')');
  reset role; perform pg_temp.as_user(upto);
  a1 := public.pf_ks2_act_create(pa, '1', d1, d1, d1);
  res := res || pg_temp.t(a1 is not null, 'номер аннулированного акта можно использовать снова');

  -- 10. Свой бланк
  t := pg_temp.err(format('select public.pf_ks2_template_save(%L, %L, %L)', pa, 'бланк.xlsx', encode('не xlsx'::bytea, 'base64')));
  res := res || pg_temp.t(t like '22023%xlsx%', 'бланк не .xlsx — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_ks2_template_save(%L, %L, %L)', pa, 'бланк.xlsx', 'не base64 !!!'));
  res := res || pg_temp.t(t like '22023%', 'повреждённый бланк — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_ks2_template_save(%L, %L, %L)', pa, 'бланк.xlsx', encode('PK'::bytea || decode(repeat('00', 2097152), 'hex'), 'base64')));
  res := res || pg_temp.t(t like '22023%2 МБ%', 'бланк больше 2 МБ — отказ (' || t || ')');
  sha := public.pf_ks2_template_save(pa, 'бланк.xlsx', encode('PK'::bytea || '\x0304'::bytea, 'base64'));
  res := res || pg_temp.t(sha = encode(sha256('PK'::bytea || '\x0304'::bytea), 'hex'), 'бланк сохранён, sha256 посчитан сервером');
  reset role; perform pg_temp.as_user(umgmt);
  j := public.pf_ks2_template(pa);
  res := res || pg_temp.t(decode(j ->> 'data', 'base64') = 'PK'::bytea || '\x0304'::bytea and j ->> 'name' = 'бланк.xlsx', 'руководство скачивает бланк проекта');
  t := pg_temp.err(format('select public.pf_ks2_template_save(%L, null, null)', pa));
  res := res || pg_temp.t(t like '42501%', 'руководство не меняет бланк (' || t || ')');
  reset role; perform pg_temp.as_user(upto);
  perform public.pf_ks2_template_save(pa, null, null);
  res := res || pg_temp.t(public.pf_ks2_template(pa) is null, 'бланк убран — будет унифицированная форма');

  -- 11. Архивный проект: правка КС-2 закрыта
  reset role; perform pg_temp.as_user(uadm);
  perform public.pf_update_project(pa2, 'ЖК Архив', null, true);
  reset role; perform pg_temp.as_user(upto);
  t := pg_temp.err(format('select public.pf_ks2_act_create(%L, %L, %L, %L, %L)', pa2, '1', d1, d1, d1));
  res := res || pg_temp.t(t like '22023%архиве%', 'архивный проект: акт не создаётся (' || t || ')');
  t := pg_temp.err(format('select public.pf_ks2_template_save(%L, null, null)', pa2));
  res := res || pg_temp.t(t like '22023%архиве%', 'архивный проект: бланк не меняется (' || t || ')');

  -- 12. Журнал компании
  reset role; perform pg_temp.as_user(uadm);
  select string_agg(distinct table_name || ':' || action, ',' order by table_name || ':' || action) into t
    from public.pf_list_company_audit(ca, 200) where table_name in ('ks2_acts', 'ks2_settings');
  res := res || pg_temp.t(t = 'ks2_acts:ANNUL,ks2_acts:INSERT,ks2_acts:ISSUE,ks2_acts:REVISION,ks2_settings:CONTRACT_KP,ks2_settings:TEMPLATE,ks2_settings:TEMPLATE_CLEAR',
    'журнал компании: акты, редакции, выдача, аннулирование, КП, бланк (' || coalesce(t, '-') || ')');

  -- 13. anon
  reset role; perform set_config('request.jwt.claims','',true); perform set_config('request.jwt.claim.sub','',true); execute 'set local role anon';
  t := pg_temp.err(format('select public.pf_ks2_acts(%L)', pa));
  res := res || pg_temp.t(t <> 'OK', 'anon: список актов закрыт');
  t := pg_temp.err('select count(*) from planfact.ks2_acts');
  res := res || pg_temp.t(t <> 'OK', 'anon: таблица актов закрыта');
  t := pg_temp.err(format('select public.pf_ks2_issue(%L)', a2));
  res := res || pg_temp.t(t <> 'OK', 'anon: выдача закрыта');
  reset role;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res,'FAIL','')))/4;
end $$;
