-- P2-0006c: тесты цен, шаблона надбавок, смет и КП — право planfact.estimate.manage, прораб цены не видит, изоляция компаний,
-- подмена проекта/компании/загрузки, смета только по подтверждённым ВОР, неизменяемость редакций КП, журнал.
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 008_up.sql (или вставить 008_up.sql перед этим файлом).
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid();
  uptop uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid; pa2 uuid; pb uuid; parch uuid;
  r_adm uuid; r_pto uuid; r_for uuid; r_badm uuid;
  sec1 uuid; secb uuid; m2 uuid; wt uuid; wt2 uuid; wtb uuid;
  imp uuid; impd uuid; impb uuid; est uuid; est2 uuid; estb uuid; w12 uuid; m13 uuid; w15 uuid; kp1 jsonb; kp2 jsonb;
  pi_w uuid; n int; t text; j jsonb; res text := ''; lines jsonb;
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,ubadm,uptop]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor),(ca,uptop),(cb,ubadm);
  select id into r_adm from core.company_roles where company_id=ca and template_code='company_admin';
  select id into r_pto from core.company_roles where company_id=ca and template_code='pto';
  select id into r_for from core.company_roles where company_id=ca and template_code='foreman';
  select id into r_badm from core.company_roles where company_id=cb and template_code='company_admin';
  insert into core.role_assignments(company_id,user_id,role_id,project_id) values
    (ca,uadm,r_adm,null),(ca,upto,r_pto,null),(ca,ufor,r_for,null),(cb,ubadm,r_badm,null);
  select id into m2 from core.units where company_id is null and code = 'м²';

  -- 0. Каталог, шаблоны ролей
  select count(*) into n from core.permission_catalog where action = 'planfact.estimate.manage';
  res := res || case when n = 1 then E'1 OK действие planfact.estimate.manage в каталоге\n' else E'1 FAIL нет действия\n' end;
  select string_agg(r.template_code, ',' order by r.template_code) into t from core.company_role_permissions rp
    join core.company_roles r on r.id = rp.role_id where r.company_id = ca and rp.action = 'planfact.estimate.manage';
  res := res || case when t = 'company_admin,project_manager,pto' then E'2 OK право у админа, РП и ПТО; у прораба и прочих нет\n' else format(E'2 FAIL выдано: %s\n', t) end;

  -- 1. Подготовка: проекты, подтверждённый ВОР Альфы, черновик, ВОР Беты
  reset role; perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Смета');
  pa2 := public.pf_create_project(ca, 'ЖК Второй');
  parch := public.pf_create_project(ca, 'ЖК Архив');
  sec1 := public.pf_add_location(pa, null, 'section', 'Секция 1');
  reset role; insert into core.role_assignments(company_id,user_id,role_id,project_id) values (ca,uptop,r_pto,pa2); -- ПТО только на проекте pa2
  reset role; perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Устройство пола', m2);
  wt2 := public.pf_vor_add_work_type(pa, 'Окраска стен', m2);
  imp := public.pf_vor_create_import(pa, 'вор.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, '[{"row_no": 10, "kind": "group", "name": "Полы"},
    {"row_no": 12, "kind": "work", "name": "Устройство пола", "unit_text": "м2", "qty": 100},
    {"row_no": 13, "kind": "material", "name": "Смесь  «Бета»", "unit_text": "Кг", "qty": 750, "norm": 7.5, "parent_row_no": 12},
    {"row_no": 15, "kind": "work", "name": "Окраска стен", "unit_text": "м2", "qty": 20}]');
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(
    jsonb_build_object('row_no', 12, 'location_id', sec1, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 15, 'location_id', sec1, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp);
  impd := public.pf_vor_create_import(pa, 'черновик.xlsx', repeat('c', 64), 'Лист');
  select id into w12 from planfact.vor_source_rows where import_id = imp and row_no = 12;
  select id into m13 from planfact.vor_source_rows where import_id = imp and row_no = 13;
  select id into w15 from planfact.vor_source_rows where import_id = imp and row_no = 15;
  reset role; perform pg_temp.as_user(uadm);
  perform public.pf_update_project(parch, 'ЖК Архив', null, true);
  reset role; perform pg_temp.as_user(ubadm);
  pb := public.pf_create_project(cb, 'ЖК Беты');
  wtb := public.pf_vor_add_work_type(pb, 'Работа Беты', m2);
  impb := public.pf_vor_create_import(pb, 'бета.xlsx', repeat('b', 64), 'Лист');

  -- 2. Справочник цен (ПТО Альфы)
  reset role; perform pg_temp.as_user(upto);
  j := public.pf_price_upsert(ca, jsonb_build_array(
    jsonb_build_object('kind', 'work', 'work_type_id', wt, 'price_labor', 10, 'price_material', 1.5),
    jsonb_build_object('kind', 'material', 'name', 'смесь «бета»', 'unit_text', ' кг ', 'price_material', 2)));
  res := res || case when j = '{"created": 2, "updated": 0, "unchanged": 0}' then E'3 OK цены созданы: работа и материал\n' else format(E'3 FAIL создание: %s\n', j) end;
  j := public.pf_price_upsert(ca, jsonb_build_array(jsonb_build_object('kind', 'work', 'work_type_id', wt, 'price_labor', 10)), 'import:' || imp);
  res := res || case when j ->> 'unchanged' = '1' then E'4 OK повтор той же цены — «без изменений»\n' else format(E'4 FAIL повтор: %s\n', j) end;
  j := public.pf_price_upsert(ca, jsonb_build_array(jsonb_build_object('kind', 'work', 'work_type_id', wt, 'price_labor', 12)), 'import:' || imp);
  select id into pi_w from planfact.price_items where company_id = ca and work_type_id = wt;
  select count(*) into n from public.pf_price_history(pi_w) where source = 'import:' || imp and old_labor = 10 and new_labor = 12 and new_material = 1.5;
  res := res || case when j ->> 'updated' = '1' and n = 1 then E'5 OK изменение цены — в истории с источником «загрузка ВОР»\n' else format(E'5 FAIL изменение: %s / %s\n', j, n) end;
  select count(*) into n from public.pf_price_list(ca);
  res := res || case when n = 2 then E'6 OK список цен: 2 строки\n' else format(E'6 FAIL список: %s\n', n) end;
  begin perform public.pf_price_upsert(ca, '[{"kind": "material", "name": "x", "price_material": -1}]'); res := res || E'7 FAIL отрицательная цена принята\n';
  exception when others then res := res || case when sqlstate = '22023' then E'7 OK отрицательная цена отклонена\n' else E'7 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_price_upsert(ca, '[{"kind": "material", "name": "x", "price_labor": 1}]'); res := res || E'8 FAIL расценка у материала\n';
  exception when others then res := res || E'8 OK у материала нет расценки работы\n'; end;
  begin perform public.pf_price_upsert(ca, jsonb_build_array(jsonb_build_object('kind', 'work', 'work_type_id', wtb, 'price_labor', 1)));
    res := res || E'9 FAIL цена на вид работ чужой компании\n';
  exception when others then res := res || E'9 OK вид работ чужой компании отклонён\n'; end;
  begin perform public.pf_price_upsert(ca, '[]', 'import:' || impb); res := res || E'10 FAIL источник — чужая загрузка\n';
  exception when others then res := res || E'10 OK источник «чужая загрузка» отклонён\n'; end;
  begin perform public.pf_price_upsert(ca, '[]', 'excel'); res := res || E'11 FAIL неизвестный источник\n';
  exception when others then res := res || E'11 OK неизвестный источник отклонён\n'; end;
  begin perform public.pf_price_upsert(ca, '[{"kind": "material", "name": "x", "price_material": "abc"}]'); res := res || E'12 FAIL нечисловая цена\n';
  exception when others then res := res || E'12 OK нечисловая цена отклонена\n'; end;

  -- 3. Шаблон надбавок
  select count(*) into n from public.pf_overhead_template(ca);
  res := res || case when n = 23 then E'13 OK шаблон по умолчанию создан: 23 строки «Расчета»\n' else format(E'13 FAIL шаблон: %s\n', n) end;
  select count(*) into n from public.pf_overhead_template(ca) where key = 'hh_silomat' and not in_total;
  res := res || case when n = 1 then E'14 OK «силомат» — не в итог\n' else E'14 FAIL силомат\n' end;
  select jsonb_agg(to_jsonb(o) - 'sort' order by o.sort) into lines from public.pf_overhead_template(ca) o;
  begin perform public.pf_overhead_save_template(ca, lines || '[{"key": "a", "section": "other", "name": "А", "method": "percent_of", "base": {"lines": ["b"]}, "params": {"percent": 1}},
                                                               {"key": "b", "section": "other", "name": "Б", "method": "percent_of", "base": {"lines": ["a"]}, "params": {"percent": 1}}]');
    res := res || E'15 FAIL цикл принят\n';
  exception when others then res := res || case when sqlerrm like '%по кругу%' then E'15 OK циклическая база отклонена\n' else E'15 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_overhead_save_template(ca, '[{"key": "a", "section": "other", "name": "А", "method": "percent_of", "base": {"sections": ["other"]}, "params": {"percent": 1}}]');
    res := res || E'16 FAIL база — свой раздел\n';
  exception when others then res := res || E'16 OK база «свой раздел» — цикл, отклонено\n'; end;
  begin perform public.pf_overhead_save_template(ca, '[{"key": "a", "section": "other", "name": "А", "method": "formula", "params": {"expr": "1+1"}}]');
    res := res || E'17 FAIL произвольная формула принята\n';
  exception when others then res := res || E'17 OK способ вне закрытого списка отклонён\n'; end;
  begin perform public.pf_overhead_save_template(ca, '[{"key": "a", "section": "other", "name": "А", "method": "gross_up", "base": {"totals": ["labor"]}, "params": {"share": 0}}]');
    res := res || E'18 FAIL доля 0\n';
  exception when others then res := res || E'18 OK доля 0 отклонена\n'; end;

  -- 4. Смета
  begin perform public.pf_estimate_create(pa, 'Смета', array[impd]); res := res || E'19 FAIL смета по черновику ВОР\n';
  exception when others then res := res || case when sqlstate = '22023' then E'19 OK смета по черновику ВОР отклонена\n' else E'19 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_estimate_create(pa, 'Смета', array[impb]); res := res || E'20 FAIL смета по чужой загрузке\n';
  exception when others then res := res || E'20 OK чужая загрузка (подмена import_id) отклонена\n'; end;
  begin perform public.pf_estimate_create(pb, 'Смета', array[imp]); res := res || E'21 FAIL смета в проекте чужой компании\n';
  exception when others then res := res || case when sqlstate = '42501' then E'21 OK проект чужой компании (подмена project_id) — 42501\n' else E'21 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_estimate_create(parch, 'Смета', array[imp]); res := res || E'22 FAIL смета в архивном проекте\n';
  exception when others then res := res || E'22 OK архивный проект — отказ\n'; end;
  begin perform public.pf_estimate_create(pa2, 'Смета', array[imp]); res := res || E'23 FAIL загрузка другого проекта\n';
  exception when others then res := res || E'23 OK загрузка другого проекта отклонена\n'; end;
  est := public.pf_estimate_create(pa, ' Смета 1 ', array[imp, imp], 6364.17);
  select count(*) into n from planfact.estimate_rows where estimate_id = est;
  res := res || case when n = 3 then E'24 OK строки сметы: 2 работы + 1 материал (повтор загрузки не дублирует)\n' else format(E'24 FAIL строк: %s\n', n) end;
  select count(*) into n from public.pf_estimate_rows(est) where source_row_id = w12 and price_labor = 12 and price_material = 1.5 and price_source = 'reference';
  res := res || case when n = 1 then E'25 OK цена работы подставлена из справочника\n' else E'25 FAIL подстановка работы\n' end;
  select count(*) into n from public.pf_estimate_rows(est) where source_row_id = m13 and price_material = 2 and price_labor is null and price_source = 'reference';
  res := res || case when n = 1 then E'26 OK цена материала подставлена (наименование и ЕИ нормализованы)\n' else E'26 FAIL подстановка материала\n' end;
  select count(*) into n from public.pf_estimate_rows(est) where source_row_id = w15 and price_source = 'none' and ref_item_id is null;
  res := res || case when n = 1 then E'27 OK работа без цены — «без цены»\n' else E'27 FAIL без цены\n' end;
  select count(*) into n from public.pf_estimate_list(pa) where id = est and name = 'Смета 1' and rows = 3 and unpriced = 1;
  res := res || case when n = 1 then E'28 OK список смет: строки и «без цены: 1»\n' else E'28 FAIL список смет\n' end;
  select count(*) into n from public.pf_estimate_overheads(est);
  res := res || case when n = 23 then E'29 OK надбавки сметы — копия шаблона\n' else format(E'29 FAIL надбавки: %s\n', n) end;
  perform public.pf_estimate_set_prices(est, jsonb_build_array(jsonb_build_object('source_row_id', w12, 'price_labor', 99, 'price_material', 1.5)));
  select count(*) into n from public.pf_estimate_rows(est) where source_row_id = w12 and price_labor = 99 and price_source = 'manual' and ref_labor = 12;
  select count(*) + n * 10 into n from planfact.price_items where id = pi_w and price_labor = 12;
  res := res || case when n = 11 then E'30 OK ручная цена: пометка «вручную», справочник не изменился\n' else format(E'30 FAIL ручная цена: %s\n', n) end;
  begin perform public.pf_estimate_set_prices(est, jsonb_build_array(jsonb_build_object('source_row_id', m13, 'price_labor', 5)));
    res := res || E'31 FAIL расценка у материала в смете\n';
  exception when others then res := res || E'31 OK у материала в смете нет расценки работы\n'; end;
  begin perform public.pf_estimate_set_prices(est, jsonb_build_array(jsonb_build_object('source_row_id', gen_random_uuid(), 'price_labor', 5)));
    res := res || E'32 FAIL чужая строка\n';
  exception when others then res := res || E'32 OK строка не из сметы отклонена\n'; end;
  perform public.pf_price_upsert(ca, jsonb_build_array(jsonb_build_object('kind', 'work', 'work_type_id', wt, 'price_labor', 13),
                                                      jsonb_build_object('kind', 'work', 'work_type_id', wt2, 'price_labor', 7)));
  n := public.pf_estimate_refill(est);
  select count(*) * 10 + n into n from public.pf_estimate_rows(est) where (source_row_id = w12 and price_labor = 99) or (source_row_id = w15 and price_labor = 7 and price_source = 'reference');
  res := res || case when n = 21 then E'33 OK «подставить заново»: новая цена справочника, ручная — не тронута\n' else format(E'33 FAIL refill: %s\n', n) end;
  perform public.pf_estimate_set_prices(est, jsonb_build_array(jsonb_build_object('source_row_id', w12, 'reset', true)));
  select count(*) into n from public.pf_estimate_rows(est) where source_row_id = w12 and price_labor = 13 and price_source = 'reference';
  res := res || case when n = 1 then E'34 OK «вернуть цену справочника»\n' else E'34 FAIL возврат\n' end;
  j := public.pf_price_upsert(ca, jsonb_build_array(jsonb_build_object('kind', 'work', 'work_type_id', wt2, 'price_labor', 8)), 'estimate:' || est);
  res := res || case when j ->> 'updated' = '1' then E'35 OK «Записать в справочник» с источником «смета»\n' else E'35 FAIL запись из сметы\n' end;
  select jsonb_agg(to_jsonb(o) - 'sort' order by o.sort) into lines from public.pf_estimate_overheads(est) o;
  perform public.pf_estimate_save_overheads(est, (select jsonb_agg(case when e ->> 'key' = 'hh_silomat' then e || '{"in_total": true}' else e end) from jsonb_array_elements(lines) e));
  select count(*) into n from public.pf_estimate_overheads(est) where key = 'hh_silomat' and in_total;
  select n * 10 + count(*) into n from public.pf_overhead_template(ca) where key = 'hh_silomat' and not in_total;
  res := res || case when n = 11 then E'36 OK правка надбавок в смете не меняет шаблон\n' else format(E'36 FAIL надбавки: %s\n', n) end;
  perform public.pf_overhead_save_template(ca, (select jsonb_agg(e) from jsonb_array_elements(lines) e where e ->> 'key' <> 'hh_waste'));
  select count(*) into n from public.pf_overhead_template(ca);
  res := res || case when n = 22 then E'37 OK «Сохранить как шаблон компании»\n' else format(E'37 FAIL шаблон: %s\n', n) end;
  perform public.pf_estimate_update(est, 'Смета 1а', 100);
  select count(*) into n from public.pf_estimate_list(pa) where id = est and name = 'Смета 1а' and area_m2 = 100;
  res := res || case when n = 1 then E'38 OK название и площадь сметы меняются\n' else E'38 FAIL изменение сметы\n' end;

  -- 5. КП
  begin perform public.pf_kp_create(est, repeat('f', 64), '{"rows": []}', 100); res := res || E'39 FAIL КП по другому файлу\n';
  exception when others then res := res || E'39 OK КП: другой файл (SHA-256) отклонён\n'; end;
  kp1 := public.pf_kp_create(est, repeat('a', 64), '{"rows": [{"row_no": 12, "price_labor": 13}]}', 1300.004, 'первая');
  kp2 := public.pf_kp_create(est, repeat('a', 64), '{"rows": [{"row_no": 12, "price_labor": 14}]}', 1400);
  select string_agg(revision_no::text || ':' || total::text, ',' order by revision_no) into t from public.pf_kp_list(est);
  res := res || case when t = '1:1300.00,2:1400.00' and (kp2 ->> 'revision_no') = '2' then E'40 OK редакции КП 1 и 2, итог до копеек\n' else format(E'40 FAIL редакции: %s\n', t) end;
  select count(*) into n from (select public.pf_kp_get((kp1 ->> 'id')::uuid) snap) x where x.snap #>> '{snapshot,rows,0,price_labor}' = '13';
  res := res || case when n = 1 then E'41 OK старая редакция — с прежними ценами\n' else E'41 FAIL снимок\n' end;
  begin update planfact.kp_revisions set total = 1 where id = (kp1 ->> 'id')::uuid; res := res || E'42 FAIL клиент изменил редакцию\n';
  exception when others then res := res || case when sqlstate = '42501' then E'42 OK клиенту изменить редакцию нельзя (42501)\n' else E'42 FAIL ' || sqlerrm || E'\n' end; end;
  reset role;
  begin update planfact.kp_revisions set total = 1 where id = (kp1 ->> 'id')::uuid; res := res || E'43 FAIL триггер пропустил изменение\n';
  exception when others then res := res || case when sqlstate = '42501' then E'43 OK триггер: редакцию не изменить даже владельцу БД\n' else E'43 FAIL ' || sqlerrm || E'\n' end; end;
  begin delete from planfact.kp_revisions where id = (kp1 ->> 'id')::uuid; res := res || E'44 FAIL триггер пропустил удаление\n';
  exception when others then res := res || E'44 OK триггер: редакцию не удалить\n'; end;

  -- 6. Прораб Альфы: цены не видит
  perform pg_temp.as_user(ufor);
  select (select count(*) from planfact.price_items) + (select count(*) from planfact.price_history) + (select count(*) from planfact.estimates)
       + (select count(*) from planfact.estimate_rows) + (select count(*) from planfact.kp_revisions) + (select count(*) from planfact.overhead_lines)
       + (select count(*) from planfact.estimate_overheads) into n;
  res := res || case when n = 0 then E'45 OK прораб: 0 строк цен, смет, надбавок, КП\n' else format(E'45 FAIL прораб видит %s строк\n', n) end;
  begin perform public.pf_price_list(ca); res := res || E'46 FAIL прораб читает цены\n';
  exception when others then res := res || case when sqlstate = '42501' then E'46 OK прораб: список цен — 42501\n' else E'46 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_estimate_list(pa); res := res || E'47 FAIL прораб читает сметы\n';
  exception when others then res := res || case when sqlstate = '42501' then E'47 OK прораб: сметы — 42501\n' else E'47 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_estimate_rows(est); res := res || E'48 FAIL прораб читает строки сметы\n';
  exception when others then res := res || E'48 OK прораб: строки сметы закрыты\n'; end;
  begin perform public.pf_kp_get((kp1 ->> 'id')::uuid); res := res || E'49 FAIL прораб читает КП\n';
  exception when others then res := res || E'49 OK прораб: КП закрыто\n'; end;
  begin perform public.pf_estimate_create(pa, 'x', array[imp]); res := res || E'50 FAIL прораб создал смету\n';
  exception when others then res := res || case when sqlstate = '42501' then E'50 OK прораб: создать смету — 42501\n' else E'50 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_price_upsert(ca, '[]'); res := res || E'51 FAIL прораб пишет цены\n';
  exception when others then res := res || E'51 OK прораб: записать цены нельзя\n'; end;
  begin perform public.pf_overhead_template(ca); res := res || E'52 FAIL прораб читает шаблон надбавок\n';
  exception when others then res := res || E'52 OK прораб: шаблон надбавок закрыт\n'; end;

  -- 7. Админ Беты: компания Альфа закрыта
  reset role; perform pg_temp.as_user(ubadm);
  select (select count(*) from planfact.price_items where company_id = ca) + (select count(*) from planfact.estimates where company_id = ca)
       + (select count(*) from planfact.kp_revisions where company_id = ca) + (select count(*) from planfact.overhead_lines where company_id = ca) into n;
  res := res || case when n = 0 then E'53 OK компания Б: 0 строк цен, смет, КП, надбавок компании А\n' else format(E'53 FAIL Бета видит %s\n', n) end;
  begin perform public.pf_price_list(ca); res := res || E'54 FAIL Бета читает цены Альфы\n';
  exception when others then res := res || case when sqlstate = '42501' then E'54 OK Бета: цены Альфы — 42501\n' else E'54 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_price_upsert(ca, jsonb_build_array(jsonb_build_object('kind', 'material', 'name', 'x', 'price_material', 1)));
    res := res || E'55 FAIL Бета пишет цены Альфы (подмена company_id)\n';
  exception when others then res := res || E'55 OK Бета: запись цен Альфы (подмена company_id) — отказ\n'; end;
  begin perform public.pf_price_delete(pi_w); res := res || E'56 FAIL Бета удалила цену Альфы\n';
  exception when others then res := res || E'56 OK Бета: удалить цену Альфы нельзя\n'; end;
  begin perform public.pf_estimate_rows(est); res := res || E'57 FAIL Бета читает смету Альфы\n';
  exception when others then res := res || E'57 OK Бета: смета Альфы «не найдена»\n'; end;
  begin perform public.pf_estimate_set_prices(est, jsonb_build_array(jsonb_build_object('source_row_id', w12, 'price_labor', 1)));
    res := res || E'58 FAIL Бета правит смету Альфы\n';
  exception when others then res := res || E'58 OK Бета: правка сметы Альфы — отказ\n'; end;
  begin perform public.pf_kp_create(est, repeat('a', 64), '{}', 1); res := res || E'59 FAIL Бета создала КП Альфы\n';
  exception when others then res := res || E'59 OK Бета: КП по смете Альфы — отказ\n'; end;
  begin perform public.pf_overhead_save_template(ca, '[]'); res := res || E'60 FAIL Бета меняет шаблон Альфы\n';
  exception when others then res := res || E'60 OK Бета: шаблон Альфы — отказ\n'; end;
  begin perform public.pf_estimate_create(pb, 'x', array[imp]); res := res || E'61 FAIL смета Беты по ВОР Альфы\n';
  exception when others then res := res || E'61 OK Бета: смета по ВОР Альфы (подмена import_id) — отказ\n'; end;
  begin perform public.pf_price_upsert(cb, '[]', 'estimate:' || est); res := res || E'62 FAIL источник — смета Альфы\n';
  exception when others then res := res || E'62 OK Бета: источник «смета Альфы» — отказ\n'; end;

  -- 8. ПТО только на проекте: цены компании видит, смету — только в своём проекте
  reset role; perform pg_temp.as_user(uptop);
  select count(*) into n from public.pf_price_list(ca);
  res := res || case when n = 3 then E'63 OK ПТО проекта видит справочник цен своей компании\n' else format(E'63 FAIL ПТО проекта: %s\n', n) end;
  begin perform public.pf_estimate_rows(est); res := res || E'64 FAIL ПТО другого проекта читает смету\n';
  exception when others then res := res || E'64 OK ПТО другого проекта: смета «не найдена»\n'; end;
  select count(*) into n from planfact.estimates;
  res := res || case when n = 0 then E'65 OK ПТО другого проекта: 0 смет по RLS\n' else E'65 FAIL сметы чужого проекта\n' end;

  -- 9. Удаление цены, журнал, anon
  reset role; perform pg_temp.as_user(upto);
  perform public.pf_price_delete(pi_w);
  select count(*) into n from public.pf_price_list(ca) where id = pi_w;
  res := res || case when n = 0 then E'66 OK цена удалена из справочника\n' else E'66 FAIL удаление цены\n' end;
  reset role; perform pg_temp.as_user(uadm);
  select string_agg(distinct table_name || ':' || action, ',' order by table_name || ':' || action) into t
    from public.pf_list_company_audit(ca, 200) where table_name in ('price_items', 'overhead_templates', 'estimates', 'kp_revisions');
  res := res || case when t = 'estimates:INSERT,estimates:UPDATE,kp_revisions:INSERT,overhead_templates:INSERT,overhead_templates:UPDATE,price_items:DELETE,price_items:INSERT,price_items:UPDATE'
    then E'67 OK журнал компании: цены, шаблон, сметы, КП\n' else format(E'67 FAIL журнал: %s\n', t) end;
  reset role; perform set_config('request.jwt.claims','',true); perform set_config('request.jwt.claim.sub','',true); execute 'set local role anon';
  begin perform public.pf_price_list(ca); res := res || E'68 FAIL anon читает цены\n';
  exception when others then res := res || E'68 OK anon: цены закрыты\n'; end;
  begin perform count(*) from planfact.price_items; res := res || E'69 FAIL anon читает таблицу цен\n';
  exception when others then res := res || E'69 OK anon: таблицы цен закрыты\n'; end;
  reset role;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res,'FAIL','')))/4;
end $$;
