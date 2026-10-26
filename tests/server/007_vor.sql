-- P2-0006: тесты ВОР (загрузки, строки, профили, виды работ, словарь, подтверждение, позиции) — права, изоляция компаний, неизменяемость.
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 007_up.sql (или вставить 007_up.sql перед этим файлом).
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid; pb uuid; parch uuid;
  r_adm uuid; r_pto uuid; r_for uuid; r_badm uuid;
  sec1 uuid; fl2 uuid; locb uuid; m2 uuid; ub uuid;
  imp uuid; imp2 uuid; imp3 uuid; impb uuid; wt uuid; wt2 uuid; wtb uuid; prof uuid; prof2 uuid;
  n int; t text; t0 timestamptz; ms int; res text := ''; rows jsonb;
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,ubadm]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor),(cb,ubadm);
  select id into r_adm from core.company_roles where company_id=ca and template_code='company_admin';
  select id into r_pto from core.company_roles where company_id=ca and template_code='pto';
  select id into r_for from core.company_roles where company_id=ca and template_code='foreman';
  select id into r_badm from core.company_roles where company_id=cb and template_code='company_admin';
  insert into core.role_assignments(company_id,user_id,role_id,project_id) values
    (ca,uadm,r_adm,null),(ca,upto,r_pto,null),(ca,ufor,r_for,null),(cb,ubadm,r_badm,null);
  select id into m2 from core.units where company_id is null and code = 'м²';

  -- 0. Каталог, шаблоны, дозаполнение
  select count(*) into n from core.permission_catalog where action = 'planfact.vor.manage';
  res := res || case when n = 1 then E'1 OK действие planfact.vor.manage в каталоге\n' else E'1 FAIL нет действия\n' end;
  select string_agg(r.template_code, ',' order by r.template_code) into t from core.company_role_permissions rp
    join core.company_roles r on r.id = rp.role_id where r.company_id = ca and rp.action = 'planfact.vor.manage';
  res := res || case when t = 'company_admin,project_manager,pto' then E'2 OK право у админа, РП и ПТО, у остальных нет\n' else format(E'2 FAIL выдано: %s\n', t) end;
  delete from core.company_role_permissions where role_id = r_pto and action = 'planfact.vor.manage';
  insert into core.company_role_permissions(role_id, company_id, action)
    select r.id, r.company_id, p.action from core.company_roles r join core.role_template_permissions p on p.template_code = r.template_code
    where r.template_code in ('company_admin','project_manager','pto') and p.action = 'planfact.vor.manage' on conflict do nothing;
  select count(*) into n from core.company_role_permissions where role_id = r_pto and action = 'planfact.vor.manage';
  res := res || case when n = 1 then E'3 OK дозаполнение существующих ролей работает\n' else E'3 FAIL дозаполнение\n' end;

  -- 1. Подготовка: проекты и места (админ Альфы / Беты)
  reset role; perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК ВОР');
  parch := public.pf_create_project(ca, 'ЖК Архив');
  perform public.pf_update_project(parch, 'ЖК Архив', null, true);
  sec1 := public.pf_add_location(pa, null, 'section', 'Секция 1');
  fl2 := public.pf_add_location(pa, sec1, 'floor', 'Этаж 2');
  reset role; perform pg_temp.as_user(ubadm);
  pb := public.pf_create_project(cb, 'ЖК Беты');
  locb := public.pf_add_location(pb, null, 'section', 'Секция 1');
  ub := public.pf_add_unit(cb, 'м² пола', 'Своя ЕИ Беты');
  wtb := public.pf_vor_add_work_type(pb, 'Работа Беты', m2);
  impb := public.pf_vor_create_import(pb, 'бета.xlsx', repeat('b', 64), 'Лист');

  -- 2. ПТО Альфы: загрузка и строки
  reset role; perform pg_temp.as_user(upto);
  imp := public.pf_vor_create_import(pa, ' вор.xlsx ', repeat('a', 64), 'ФКП, 142', null, '{"works": 2}');
  select count(*) into n from public.pf_vor_list_imports(pa) where id = imp and file_name = 'вор.xlsx' and status = 'draft';
  res := res || case when n = 1 then E'4 OK ПТО создал черновик загрузки\n' else E'4 FAIL черновик\n' end;
  begin perform public.pf_vor_create_import(pa, 'x.xlsx', 'плохой', 'Лист'); res := res || E'5 FAIL неверный SHA-256 принят\n';
  exception when others then res := res || case when sqlstate = '22023' then E'5 OK неверный SHA-256 отклонён\n' else E'5 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_vor_create_import(parch, 'x.xlsx', repeat('a', 64), 'Лист'); res := res || E'6 FAIL загрузка в архивный проект\n';
  exception when others then res := res || E'6 OK в архивный проект не загрузить\n'; end;
  rows := '[{"row_no": 10, "kind": "context", "name": "Секция 1", "context": {"section": "1"}},
            {"row_no": 11, "kind": "group", "name": "Полы", "context": {"section": "1"}},
            {"row_no": 12, "kind": "work", "number": "5", "name": "Устройство пола", "unit_text": "м2", "qty": 399.89, "prices": {"Работа": 10}, "context": {"section": "1", "apartments": "кв. 3, 16"}, "raw": [5, "Устройство пола", "м2", null, 399.89]},
            {"row_no": 13, "kind": "material", "name": "Смесь", "unit_text": "кг", "qty": 2999.18, "norm": 7.5, "parent_row_no": 12, "context": {"section": "1"}},
            {"row_no": 14, "kind": "work", "name": "Окраска стен", "unit_text": "м2", "qty": 0, "context": {"section": "1", "floor": {"from": 2, "to": 2}}},
            {"row_no": 15, "kind": "work", "name": "Монтаж дверей", "unit_text": "шт", "qty": 162, "context": {"section": "1", "floor": {"from": 4, "to": 12}}}]';
  n := public.pf_vor_add_rows(imp, rows);
  res := res || case when n = 6 then E'7 OK 6 строк сохранены\n' else format(E'7 FAIL сохранено %s\n', n) end;
  select count(*) into n from public.pf_vor_import_rows(imp) where row_no = 13 and parent_row_no = 12 and norm = 7.5;
  res := res || case when n = 1 then E'8 OK материал привязан к своей работе\n' else E'8 FAIL связь материал → работа\n' end;
  select count(*) into n from public.pf_vor_list_imports(pa) where id = imp and row_count = 6 and works = 3;
  res := res || case when n = 1 then E'9 OK счётчики загрузки: 6 строк, 3 работы\n' else E'9 FAIL счётчики\n' end;
  begin perform public.pf_vor_add_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', 1000 + g, 'kind', 'work', 'name', 'x')) from generate_series(1, 1001) g));
    res := res || E'10 FAIL порция > 1 000 принята\n';
  exception when others then res := res || E'10 OK порция > 1 000 отклонена\n'; end;
  begin perform public.pf_vor_add_rows(imp, '[{"row_no": 12, "kind": "work", "name": "дубль"}]'); res := res || E'11 FAIL дубль номера строки\n';
  exception when others then res := res || E'11 OK дубль номера строки отклонён\n'; end;
  begin perform public.pf_vor_add_rows(imp, '[{"row_no": 99, "kind": "итог", "name": "x"}]'); res := res || E'12 FAIL неизвестный тип строки\n';
  exception when others then res := res || E'12 OK неизвестный тип строки отклонён\n'; end;
  -- 900 строк (как лист «ФКП, 142») — двумя порциями
  imp2 := public.pf_vor_create_import(pa, 'большой.xlsx', repeat('c', 64), 'Лист');
  t0 := clock_timestamp();
  perform public.pf_vor_add_rows(imp2, (select jsonb_agg(jsonb_build_object('row_no', g, 'kind', case when g % 2 = 0 then 'material' else 'work' end,
    'name', 'Строка ' || g, 'unit_text', 'м2', 'qty', g, 'parent_row_no', case when g % 2 = 0 then g - 1 end, 'context', '{"section": "1"}'::jsonb,
    'raw', jsonb_build_array(g, 'Строка ' || g, 'м2', g))) from generate_series(1, 500) g));
  perform public.pf_vor_add_rows(imp2, (select jsonb_agg(jsonb_build_object('row_no', g, 'kind', case when g % 2 = 0 then 'material' else 'work' end,
    'name', 'Строка ' || g, 'unit_text', 'м2', 'qty', g, 'parent_row_no', case when g % 2 = 0 then g - 1 end, 'context', '{"section": "1"}'::jsonb,
    'raw', jsonb_build_array(g, 'Строка ' || g, 'м2', g))) from generate_series(501, 900) g));
  ms := (extract(epoch from clock_timestamp() - t0) * 1000)::int;
  select count(*) into n from planfact.vor_source_rows where import_id = imp2 and (kind <> 'material' or parent_row_id is not null);
  res := res || case when n = 900 and ms < 10000 then format(E'13 OK 900 строк сохранены за %s мс, материалы связаны\n', ms) else format(E'13 FAIL строк %s, %s мс\n', n, ms) end;

  -- 3. Виды работ, словарь, профили
  wt := public.pf_vor_add_work_type(pa, '  Устройство   пола ', m2);
  begin perform public.pf_vor_add_work_type(pa, 'устройство ПОЛА', m2); res := res || E'14 FAIL дубль вида работ\n';
  exception when others then res := res || case when sqlstate = '23505' then E'14 OK дубль вида работ отклонён\n' else E'14 FAIL ' || sqlerrm || E'\n' end; end;
  wt2 := public.pf_vor_add_work_type(pa, 'Окраска стен', m2);
  begin perform public.pf_vor_add_work_type(pa, 'Чужая ЕИ', ub); res := res || E'15 FAIL ЕИ другой компании принята\n';
  exception when others then res := res || E'15 OK ЕИ другой компании отклонена\n'; end;
  select count(*) into n from public.pf_vor_list_work_types(pa);
  res := res || case when n = 2 then E'16 OK ПТО видит 2 вида работ своей компании\n' else format(E'16 FAIL видов работ %s\n', n) end;
  rows := public.pf_vor_add_work_types(pa, jsonb_build_array(jsonb_build_object('name', 'окраска  СТЕН', 'unit_id', m2),
    jsonb_build_object('name', 'Монтаж дверей', 'unit_id', null), jsonb_build_object('name', 'Монтаж дверей', 'unit_id', null)));
  res := res || case when (rows -> 0 ->> 'id')::uuid = wt2 and (rows -> 0 ->> 'created')::boolean = false
                      and (rows -> 1 ->> 'created')::boolean and (rows -> 2 ->> 'id') = (rows -> 1 ->> 'id') and not (rows -> 2 ->> 'created')::boolean
    then E'16a OK пачка видов работ: существующий — его id, новый — создан один раз\n' else format(E'16a FAIL пачка: %s\n', rows) end;
  begin perform public.pf_vor_add_work_types(pa, jsonb_build_array(jsonb_build_object('name', 'x', 'unit_id', ub))); res := res || E'16b FAIL ЕИ другой компании в пачке\n';
  exception when others then res := res || E'16b OK пачка: ЕИ другой компании отклонена\n'; end;
  -- нормализация наименований: те же образцы, что в unit-тесте клиента (canonName)
  reset role;
  select string_agg(planfact.canon_name(x), '|' order by o) into t from unnest(array['  Устройство   ПОЛА ', E'Окраска\tстен  в 2 слоя', 'Ёмкость Ё']) with ordinality as u(x, o);
  res := res || case when t = 'устройство пола|окраска стен в 2 слоя|ёмкость ё' then E'16c OK canon_name = клиентский canonName на образцах\n' else format(E'16c FAIL canon_name: %s\n', t) end;
  perform pg_temp.as_user(upto);
  n := public.pf_vor_learn(pa, jsonb_build_array(jsonb_build_object('name', ' Устройство  ПОЛА', 'unit_text', 'М2', 'work_type_id', wt)));
  select count(*) into n from public.pf_vor_dictionary(pa) where canon_name = 'устройство пола' and unit_text = 'м2' and work_type_id = wt;
  res := res || case when n = 1 then E'17 OK словарь: наименование нормализовано (canon_name), ЕИ — нижний регистр\n' else E'17 FAIL словарь\n' end;
  perform public.pf_vor_learn(pa, jsonb_build_array(jsonb_build_object('name', 'устройство пола', 'unit_text', 'м2', 'work_type_id', wt)));
  select hits into n from public.pf_vor_dictionary(pa) where canon_name = 'устройство пола';
  res := res || case when n = 2 then E'18 OK повторное подтверждение — счётчик, не дубль\n' else format(E'18 FAIL hits %s\n', n) end;
  begin perform public.pf_vor_learn(pa, jsonb_build_array(jsonb_build_object('name', 'x', 'unit_text', '', 'work_type_id', wtb))); res := res || E'19 FAIL вид работ Беты в словарь Альфы\n';
  exception when others then res := res || E'19 OK вид работ другой компании в словарь не попадает\n'; end;
  prof := public.pf_vor_save_profile(pa, 'ФСК — ФКП', 'наименование работ|ед. изм.|объём', '{"name": 1, "unit": 2, "qty": 4}');
  prof2 := public.pf_vor_save_profile(pa, 'ФСК — ФКП (правка)', 'наименование работ|ед. изм.|объём', '{"name": 1, "unit": 2, "qty": 5}');
  select count(*) into n from public.pf_vor_list_profiles(pa) where id = prof and column_map ->> 'qty' = '5';
  res := res || case when prof = prof2 and n = 1 then E'20 OK профиль по подписи шапки обновляется, не дублируется\n' else E'20 FAIL профиль\n' end;
  begin perform public.pf_vor_save_profile(pa, 'Без имени', 'x', '{"unit": 2}'); res := res || E'21 FAIL профиль без колонки «Наименование»\n';
  exception when others then res := res || E'21 OK профиль без «Наименования» отклонён\n'; end;

  -- 4. Прораб: только чтение
  reset role; perform pg_temp.as_user(ufor);
  select count(*) into n from public.pf_vor_list_imports(pa);
  res := res || case when n = 2 then E'22 OK прораб видит загрузки своего проекта\n' else format(E'22 FAIL прораб видит %s\n', n) end;
  select count(*) into n from public.pf_vor_import_rows(imp);
  res := res || case when n = 6 then E'23 OK прораб читает строки\n' else E'23 FAIL строки прорабу\n' end;
  begin perform public.pf_vor_create_import(pa, 'x.xlsx', repeat('a', 64), 'Лист'); res := res || E'24 FAIL прораб загрузил ВОР\n';
  exception when others then res := res || case when sqlstate = '42501' then E'24 OK прораб: загрузка — 42501\n' else E'24 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_vor_add_rows(imp, '[{"row_no": 50, "kind": "work", "name": "x"}]'); res := res || E'25 FAIL прораб дописал строки\n';
  exception when others then res := res || case when sqlstate = '42501' then E'25 OK прораб: запись строк — 42501\n' else E'25 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_vor_add_work_type(pa, 'Прорабская', m2); res := res || E'26 FAIL прораб создал вид работ\n';
  exception when others then res := res || E'26 OK прораб: вид работ — отказ\n'; end;
  begin perform public.pf_vor_add_work_types(pa, '[{"name": "Прорабская"}]'); res := res || E'26a FAIL прораб создал виды работ пачкой\n';
  exception when others then res := res || E'26a OK прораб: пачка видов работ — отказ\n'; end;
  begin perform public.pf_vor_learn(pa, jsonb_build_array(jsonb_build_object('name', 'x', 'work_type_id', wt))); res := res || E'27 FAIL прораб пополнил словарь\n';
  exception when others then res := res || E'27 OK прораб: словарь — отказ\n'; end;
  begin perform public.pf_vor_resolve_rows(imp, '[]'); res := res || E'28 FAIL прораб меняет решения строк\n';
  exception when others then res := res || E'28 OK прораб: решения строк — отказ\n'; end;
  begin perform public.pf_vor_confirm(imp); res := res || E'29 FAIL прораб подтвердил ВОР\n';
  exception when others then res := res || E'29 OK прораб: подтверждение — отказ\n'; end;
  begin perform public.pf_vor_delete_import(imp2); res := res || E'30 FAIL прораб удалил загрузку\n';
  exception when others then res := res || E'30 OK прораб: удаление — отказ\n'; end;
  begin insert into planfact.vor_imports(company_id, project_id, file_name, file_sha256, sheet_name) values (ca, pa, 'x', repeat('a', 64), 'x');
    res := res || E'31 FAIL прямой INSERT прошёл\n';
  exception when others then res := res || E'31 OK прямой INSERT в таблицы ВОР закрыт\n'; end;

  -- 5. Бета: ничего из Альфы
  reset role; perform pg_temp.as_user(ubadm);
  begin perform public.pf_vor_list_imports(pa); res := res || E'32 FAIL Бета читает загрузки Альфы\n';
  exception when others then res := res || case when sqlstate = '42501' then E'32 OK Бета: загрузки Альфы — 42501\n' else E'32 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_vor_import_rows(imp); res := res || E'33 FAIL Бета читает строки Альфы\n';
  exception when others then res := res || E'33 OK Бета: строки Альфы закрыты\n'; end;
  begin perform public.pf_vor_add_rows(imp, '[{"row_no": 60, "kind": "work", "name": "взлом"}]'); res := res || E'34 FAIL Бета пишет в загрузку Альфы\n';
  exception when others then res := res || E'34 OK Бета: запись в загрузку Альфы — отказ\n'; end;
  begin perform public.pf_vor_create_import(pa, 'x.xlsx', repeat('a', 64), 'Лист'); res := res || E'35 FAIL Бета создала загрузку в проекте Альфы\n';
  exception when others then res := res || case when sqlstate = '42501' then E'35 OK Бета: загрузка в проект Альфы — 42501\n' else E'35 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_vor_list_work_types(pa); res := res || E'36 FAIL Бета читает виды работ Альфы\n';
  exception when others then res := res || E'36 OK Бета: виды работ Альфы закрыты\n'; end;
  begin perform public.pf_vor_dictionary(pa); res := res || E'37 FAIL Бета читает словарь Альфы\n';
  exception when others then res := res || E'37 OK Бета: словарь Альфы закрыт\n'; end;
  begin perform public.pf_vor_list_profiles(pa); res := res || E'38 FAIL Бета читает профили Альфы\n';
  exception when others then res := res || E'38 OK Бета: профили Альфы закрыты\n'; end;
  begin perform public.pf_vor_positions(pa); res := res || E'39 FAIL Бета читает позиции Альфы\n';
  exception when others then res := res || E'39 OK Бета: позиции Альфы закрыты\n'; end;
  select (select count(*) from planfact.vor_imports where company_id = ca) + (select count(*) from planfact.vor_source_rows where project_id = pa)
       + (select count(*) from core.work_types where company_id = ca) + (select count(*) from planfact.vor_dictionary where company_id = ca)
       + (select count(*) from planfact.vor_profiles where company_id = ca) into n;
  res := res || case when n = 0 then E'40 OK Бета: прямой SELECT данных ВОР Альфы — 0 строк\n' else format(E'40 FAIL видит %s\n', n) end;
  select count(*) into n from public.pf_vor_list_work_types(pb);
  res := res || case when n = 1 then E'41 OK Бета видит только свой вид работ\n' else format(E'41 FAIL видов работ у Беты %s\n', n) end;
  select count(*) into n from public.pf_vor_dictionary(pb);
  res := res || case when n = 0 then E'42 OK словарь Альфы не влияет на Бету\n' else E'42 FAIL словарь Беты\n' end;

  -- 6. Решения строк: подмена места / вида работ / ЕИ другой компании → отказ
  reset role; perform pg_temp.as_user(upto);
  begin perform public.pf_vor_resolve_rows(imp, jsonb_build_array(jsonb_build_object('row_no', 12, 'location_id', locb, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
    res := res || E'43 FAIL место чужого проекта принято\n';
  exception when others then res := res || E'43 OK место чужого проекта отклонено\n'; end;
  begin perform public.pf_vor_resolve_rows(imp, jsonb_build_array(jsonb_build_object('row_no', 12, 'location_id', sec1, 'work_type_id', wtb, 'unit_id', m2, 'match', 'green')));
    res := res || E'44 FAIL вид работ чужой компании принят\n';
  exception when others then res := res || E'44 OK вид работ чужой компании отклонён\n'; end;
  begin perform public.pf_vor_resolve_rows(imp, jsonb_build_array(jsonb_build_object('row_no', 12, 'location_id', sec1, 'work_type_id', wt, 'unit_id', ub, 'match', 'green')));
    res := res || E'45 FAIL ЕИ чужой компании принята\n';
  exception when others then res := res || E'45 OK ЕИ чужой компании отклонена\n'; end;
  begin perform public.pf_vor_add_rows(impb, '[{"row_no": 1, "kind": "work", "name": "взлом"}]'); res := res || E'46 FAIL ПТО Альфы пишет в загрузку Беты\n';
  exception when others then res := res || E'46 OK ПТО Альфы: загрузка Беты недоступна\n'; end;

  -- 7. Подтверждение
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(jsonb_build_object('row_no', 12, 'location_id', sec1, 'work_type_id', wt, 'unit_id', m2, 'match', 'yellow')));
  begin perform public.pf_vor_confirm(imp); res := res || E'47 FAIL подтверждено при 🟡 и неразобранной строке\n';
  exception when others then res := res || case when sqlstate = '22023' then E'47 OK подтверждение заблокировано: есть неразобранные строки\n' else E'47 FAIL ' || sqlerrm || E'\n' end; end;
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(
    jsonb_build_object('row_no', 12, 'location_id', sec1, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 14, 'location_id', fl2, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 15, 'location_id', sec1, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green')));
  n := public.pf_vor_confirm(imp);
  res := res || case when n = 3 then E'48 OK ВОР подтверждён: 3 позиции\n' else format(E'48 FAIL позиций %s\n', n) end;
  select count(*) into n from planfact.vor_source_rows s where s.import_id = imp and s.kind = 'work'
    and s.qty = (select sum(p.qty * l.share) from planfact.vor_links l join planfact.vor_positions p on p.id = l.position_id where l.source_row_id = s.id);
  res := res || case when n = 3 then E'49 OK Σ позиций = объём строки заказчика по каждой строке (в т.ч. нулевой объём)\n' else format(E'49 FAIL сошлось %s из 3\n', n) end;
  select count(*) into n from planfact.vor_links l join planfact.vor_positions p on p.id = l.position_id where p.import_id = imp and l.share = 1;
  res := res || case when n = 3 then E'50 OK связки 1:1, доля 1\n' else E'50 FAIL связки\n' end;
  select count(*) into n from public.pf_vor_positions(pa) where source_row_no = 15 and location_path = 'Секция 1' and apartments_note = 'эт. 4–12';
  res := res || case when n = 1 then E'50a OK «Этажи 4–12»: позиция на секции с пометкой «эт. 4–12»\n' else E'50a FAIL пометка диапазона этажей\n' end;
  select count(*) into n from public.pf_vor_positions(pa) where location_path = 'Секция 1' and work_type = 'Устройство пола' and unit_code = 'м²'
    and qty = 399.89 and apartments_note = 'кв. 3, 16' and source_row_no = 12;
  res := res || case when n = 1 then E'51 OK позиция: место + вид работ + ЕИ + объём + пометка квартир\n' else E'51 FAIL позиция\n' end;
  select count(*) into n from public.pf_vor_positions(pa, fl2);
  res := res || case when n = 1 then E'52 OK фильтр по месту: этаж — 1 позиция\n' else format(E'52 FAIL фильтр этажа %s\n', n) end;
  select count(*) into n from public.pf_vor_positions(pa, sec1);
  res := res || case when n = 3 then E'53 OK фильтр по месту: секция с потомками — 3 позиции\n' else format(E'53 FAIL фильтр секции %s\n', n) end;

  -- 8. Неизменяемость
  begin perform public.pf_vor_add_rows(imp, '[{"row_no": 70, "kind": "work", "name": "x"}]'); res := res || E'54 FAIL строки дописаны в подтверждённый\n';
  exception when others then res := res || case when sqlstate = '42501' then E'54 OK подтверждённый: дописать строки — 42501\n' else E'54 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_vor_resolve_rows(imp, jsonb_build_array(jsonb_build_object('row_no', 12, 'location_id', fl2, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
    res := res || E'55 FAIL решения изменены после подтверждения\n';
  exception when others then res := res || E'55 OK подтверждённый: решения не меняются\n'; end;
  begin perform public.pf_vor_confirm(imp); res := res || E'56 FAIL повторное подтверждение\n';
  exception when others then res := res || E'56 OK повторное подтверждение отклонено\n'; end;
  begin perform public.pf_vor_delete_import(imp); res := res || E'57 FAIL подтверждённый удалён\n';
  exception when others then res := res || E'57 OK подтверждённый не удалить\n'; end;
  reset role;   -- даже владелец БД (обход RLS) не меняет подтверждённое: триггеры
  begin update planfact.vor_source_rows set qty = 1 where import_id = imp and row_no = 12; res := res || E'58 FAIL UPDATE строки подтверждённого\n';
  exception when others then res := res || case when sqlstate = '42501' then E'58 OK триггер: строку подтверждённого не изменить\n' else E'58 FAIL ' || sqlerrm || E'\n' end; end;
  begin update planfact.vor_positions set qty = 1 where import_id = imp; res := res || E'59 FAIL UPDATE позиции\n';
  exception when others then res := res || E'59 OK триггер: позицию не изменить\n'; end;
  begin delete from planfact.vor_links where project_id = pa; res := res || E'60 FAIL DELETE связок\n';
  exception when others then res := res || E'60 OK триггер: связки не удалить\n'; end;
  begin update planfact.vor_imports set status = 'draft' where id = imp; res := res || E'61 FAIL статус возвращён в черновик\n';
  exception when others then res := res || E'61 OK триггер: статус не вернуть\n'; end;

  -- 9. Прораб видит позиции, черновик удаляется ПТО, журнал
  perform pg_temp.as_user(ufor);
  select count(*) into n from public.pf_vor_positions(pa);
  res := res || case when n = 3 then E'62 OK прораб видит позиции своего проекта\n' else E'62 FAIL позиции прорабу\n' end;
  reset role; perform pg_temp.as_user(upto);
  imp3 := public.pf_vor_create_import(pa, 'пустой.xlsx', repeat('d', 64), 'Лист');
  perform public.pf_vor_add_rows(imp3, '[{"row_no": 1, "kind": "work", "name": "Без объёма", "unit_text": "м2"}]');
  perform public.pf_vor_resolve_rows(imp3, jsonb_build_array(jsonb_build_object('row_no', 1, 'location_id', sec1, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  begin perform public.pf_vor_confirm(imp3); res := res || E'63 FAIL подтверждена работа без объёма\n';
  exception when others then res := res || E'63 OK работа без объёма не подтверждается\n'; end;
  perform public.pf_vor_delete_import(imp3);
  select count(*) into n from public.pf_vor_list_imports(pa) where id = imp3;
  res := res || case when n = 0 then E'64 OK черновик удалён\n' else E'64 FAIL черновик остался\n' end;
  reset role; perform pg_temp.as_user(uadm);
  select string_agg(distinct table_name || ':' || action, ',' order by table_name || ':' || action) into t
    from public.pf_list_company_audit(ca, 200) where table_name in ('vor_imports', 'vor_profiles', 'work_types', 'vor_dictionary');
  res := res || case when t = 'vor_dictionary:INSERT,vor_imports:DELETE,vor_imports:INSERT,vor_imports:UPDATE,vor_profiles:INSERT,vor_profiles:UPDATE,work_types:INSERT'
    then E'65 OK журнал компании: загрузка, подтверждение, удаление, профиль, словарь, вид работ\n' else format(E'65 FAIL журнал: %s\n', t) end;
  select count(*) into n from public.pf_list_company_audit(ca, 200) where table_name = 'vor_imports' and action = 'UPDATE' and new_data ->> 'status' = 'confirmed';
  res := res || case when n = 1 then E'66 OK журнал: подтверждение с числом позиций\n' else E'66 FAIL подтверждение в журнале\n' end;

  -- 10. anon
  reset role; perform set_config('request.jwt.claims','',true); perform set_config('request.jwt.claim.sub','',true); execute 'set local role anon';
  begin perform public.pf_vor_list_imports(pa); res := res || E'67 FAIL anon читает загрузки\n';
  exception when others then res := res || E'67 OK anon: загрузки закрыты\n'; end;
  begin perform count(*) from planfact.vor_positions; res := res || E'68 FAIL anon читает позиции\n';
  exception when others then res := res || E'68 OK anon: таблицы ВОР закрыты\n'; end;
  reset role;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res,'FAIL','')))/4;
end $$;
