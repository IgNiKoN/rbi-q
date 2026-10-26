-- P2-0005 этап 1: тесты проектов, дерева локаций, единиц измерения (изоляция компаний, права, генератор, журнал).
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 006_up.sql (или вставить 006_up.sql перед этим файлом в одно окно).
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid();
  uprj uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid; pa2 uuid; pb uuid;
  r_adm uuid; r_pto uuid; r_for uuid; r_badm uuid;
  bld uuid; sec1 uuid; sec2 uuid; fl uuid; lv uuid; gen uuid; tmp uuid; mv uuid;
  u_a uuid;
  n int; n2 int; t text; b boolean; res text := ''; i int; chain uuid;
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,uprj,ubadm]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor),(ca,uprj),(cb,ubadm);
  select id into r_adm from core.company_roles where company_id=ca and template_code='company_admin';
  select id into r_pto from core.company_roles where company_id=ca and template_code='pto';
  select id into r_for from core.company_roles where company_id=ca and template_code='foreman';
  select id into r_badm from core.company_roles where company_id=cb and template_code='company_admin';
  insert into core.role_assignments(company_id,user_id,role_id,project_id) values
    (ca,uadm,r_adm,null),(ca,ufor,r_for,null),(cb,ubadm,r_badm,null);
  -- проект Беты создаём напрямую (до теста функций)
  insert into core.projects(company_id, name) values (cb,'Проект Беты') returning id into pb;

  -- 0. Каталог и шаблоны (дозаполнение)
  select count(*) into n from core.permission_catalog where action in ('planfact.projects.manage','planfact.units.manage');
  res := res || case when n = 2 then E'1 OK два новых действия в каталоге\n' else format(E'1 FAIL действий в каталоге: %s\n', n) end;
  select count(*) into n from core.company_role_permissions rp join core.company_roles r on r.id = rp.role_id
    where r.company_id = ca and rp.action in ('planfact.projects.manage','planfact.units.manage') and r.template_code in ('company_admin','project_manager','pto');
  res := res || case when n = 6 then E'2 OK админ, РП, ПТО получили оба права\n' else format(E'2 FAIL выдано %s из 6\n', n) end;
  select count(*) into n from core.company_role_permissions rp join core.company_roles r on r.id = rp.role_id
    where r.company_id = ca and rp.action in ('planfact.projects.manage','planfact.units.manage') and r.template_code not in ('company_admin','project_manager','pto');
  res := res || case when n = 0 then E'3 OK остальные шаблоны прав не получили\n' else format(E'3 FAIL лишних выдач: %s\n', n) end;
  -- дозаполнение старой роли: убираем права и повторяем запрос миграции
  delete from core.company_role_permissions where role_id = r_pto and action in ('planfact.projects.manage','planfact.units.manage');
  insert into core.company_role_permissions(role_id, company_id, action)
    select r.id, r.company_id, p.action from core.company_roles r join core.role_template_permissions p on p.template_code = r.template_code
    where r.template_code in ('company_admin','project_manager','pto') and p.action in ('planfact.projects.manage','planfact.units.manage') on conflict do nothing;
  select count(*) into n from core.company_role_permissions where role_id = r_pto and action in ('planfact.projects.manage','planfact.units.manage');
  res := res || case when n = 2 then E'4 OK дозаполнение существующих ролей работает\n' else format(E'4 FAIL после дозаполнения %s\n', n) end;
  insert into core.role_assignments(company_id,user_id,role_id,project_id) values (ca,upto,r_pto,null);

  -- 1. Администратор Альфы: проекты
  reset role; perform pg_temp.as_user(uadm);
  select count(*) into n from public.pf_my_company_access() where company_id = ca and can_manage_projects and can_manage_units and can_manage_roles;
  res := res || case when n = 1 then E'5 OK админ: доступ к проектам/ЕИ/ролям\n' else format(E'5 FAIL pf_my_company_access: %s\n', n) end;
  pa := public.pf_create_project(ca, '  ЖК Тест ', 'T-1');
  select count(*) into n from public.pf_company_projects(ca) where id = pa and name = 'ЖК Тест' and code = 'T-1' and can_manage;
  res := res || case when n = 1 then E'6 OK проект создан, название обрезано, виден в списке\n' else format(E'6 FAIL проект в списке: %s\n', n) end;
  begin perform public.pf_create_project(ca, '   '); res := res || E'7 FAIL пустое название принято\n';
  exception when others then res := res || E'7 OK пустое название отклонено\n'; end;
  perform public.pf_update_project(pa, 'ЖК Тест 2', 'T-2');
  select count(*) into n from public.pf_company_projects(ca) where id = pa and name = 'ЖК Тест 2' and code = 'T-2';
  res := res || case when n = 1 then E'8 OK проект переименован\n' else E'8 FAIL переименование\n' end;
  perform public.pf_update_project(pa, 'ЖК Тест', 'T-1', true);
  select count(*) into n from public.pf_company_projects(ca) where id = pa and archived_at is not null;
  res := res || case when n = 1 then E'9 OK проект в архиве\n' else E'9 FAIL архив\n' end;
  begin perform public.pf_add_location(pa, null, 'building', 'Корпус А'); res := res || E'10 FAIL узел добавлен в архивный проект\n';
  exception when others then res := res || E'10 OK в архивный проект узел не добавить\n'; end;
  perform public.pf_update_project(pa, 'ЖК Тест', 'T-1', false);
  select count(*) into n from public.pf_company_projects(ca) where id = pa and archived_at is null;
  res := res || case when n = 1 then E'11 OK проект возвращён из архива\n' else E'11 FAIL разархивация\n' end;

  -- 2. Локации вручную
  bld := public.pf_add_location(pa, null, 'building', 'Корпус А');
  sec1 := public.pf_add_location(pa, bld, 'section', 'Секция 1');
  begin perform public.pf_add_location(pa, bld, 'section', '  секция   1 '); res := res || E'12 FAIL дубль имени на уровне\n';
  exception when others then res := res || case when sqlstate = '23505' then E'12 OK дубль имени отклонён\n' else E'12 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_add_location(pa, bld, 'room', 'X'); res := res || E'13 FAIL неизвестный тип принят\n';
  exception when others then res := res || E'13 OK неизвестный тип отклонён\n'; end;
  -- уровни можно пропускать: квартира сразу в корпус
  tmp := public.pf_add_location(pa, bld, 'apartment', 'кв. 1');
  res := res || case when (select depth from core.locations where id = tmp) = 2 then E'14 OK уровень пропущен (квартира сразу в корпусе)\n' else E'14 FAIL\n' end;
  -- глубина ≤ 6
  chain := bld;
  for i in 2..6 loop chain := public.pf_add_location(pa, chain, 'other', 'Уровень ' || i); end loop;
  begin perform public.pf_add_location(pa, chain, 'other', 'Уровень 7'); res := res || E'15 FAIL седьмой уровень создан\n';
  exception when others then res := res || E'15 OK глубина > 6 отклонена\n'; end;
  perform public.pf_rename_location(sec1, 'Секция Первая');
  res := res || case when (select name from core.locations where id = sec1) = 'Секция Первая' then E'16 OK узел переименован\n' else E'16 FAIL\n' end;
  begin perform public.pf_rename_location(sec1, 'кв. 1'); res := res || E'17 FAIL переименование в чужое имя уровня прошло\n';
  exception when others then res := res || E'17 OK дубль при переименовании отклонён\n'; end;

  -- перенос
  sec2 := public.pf_add_location(pa, bld, 'section', 'Секция 2');
  fl := public.pf_add_location(pa, sec1, 'floor', 'эт. 1');
  tmp := public.pf_add_location(pa, fl, 'apartment', 'кв. 77');
  begin perform public.pf_move_location(sec1, fl); res := res || E'18 FAIL цикл: узел внутрь потомка\n';
  exception when others then res := res || E'18 OK цикл отклонён\n'; end;
  begin perform public.pf_move_location(sec1, sec1); res := res || E'19 FAIL узел внутрь себя\n';
  exception when others then res := res || E'19 OK перенос в себя отклонён\n'; end;
  perform public.pf_move_location(fl, sec2);
  select depth into n from core.locations where id = tmp;
  res := res || case when (select parent_id from core.locations where id = fl) = sec2 and n = 4 then E'20 OK этаж перенесён вместе с квартирой, глубина пересчитана\n' else format(E'20 FAIL перенос (глубина %s)\n', n) end;
  select count(*) into n from core.locations where id = tmp and depth = 4;
  begin perform public.pf_move_location(bld, chain); res := res || E'21 FAIL корпус внутрь своей ветки\n';
  exception when others then res := res || E'21 OK корпус в свою ветку нельзя\n'; end;

  -- удаление
  begin perform public.pf_delete_location(sec2); res := res || E'22 FAIL удалён узел с потомками без подтверждения\n';
  exception when others then res := res || case when sqlstate = '23503' then E'22 OK узел с потомками без «удалить ветку» не удаляется\n' else E'22 FAIL ' || sqlerrm || E'\n' end; end;
  n := public.pf_delete_location(sec2, true);
  res := res || case when n = 3 then E'23 OK ветка удалена (3 узла: секция, этаж, квартира)\n' else format(E'23 FAIL удалено %s\n', n) end;
  select count(*) into n from public.pf_list_locations(pa, bld) where id = sec2;
  res := res || case when n = 0 then E'24 OK удалённый узел не виден\n' else E'24 FAIL удалённый виден\n' end;
  -- имя освободилось
  begin perform public.pf_add_location(pa, bld, 'section', 'Секция 2'); res := res || E'25 OK имя удалённого узла освободилось\n';
  exception when others then res := res || E'25 FAIL ' || sqlerrm || E'\n'; end;

  -- 3. Генератор 2×5×4
  gen := public.pf_generate_building(pa, null, 'Корпус Г', 2, 5, 4, 1);
  select count(*) into n from core.locations where project_id = pa and deleted_at is null
    and id in (with recursive d(id) as (select id from core.locations where parent_id = gen union all select l.id from core.locations l join d on l.parent_id = d.id) select id from d);
  res := res || case when n = 52 then E'26 OK генератор 2×5×4: 52 узла под корпусом (53 с корпусом)\n' else format(E'26 FAIL узлов: %s\n', n) end;
  select count(*) filter (where node_type='section'), count(*) filter (where node_type='floor'), count(*) filter (where node_type='apartment')
    into n, n2, i from core.locations where project_id = pa and deleted_at is null and depth >= 2
    and id in (with recursive d(id) as (select id from core.locations where parent_id = gen union all select l.id from core.locations l join d on l.parent_id = d.id) select id from d);
  res := res || case when n = 2 and n2 = 10 and i = 40 then E'27 OK 2 секции / 10 этажей / 40 квартир\n' else format(E'27 FAIL %s/%s/%s\n', n, n2, i) end;
  select l.id into tmp from core.locations l join core.locations f on f.id = l.parent_id join core.locations s on s.id = f.parent_id
    where s.parent_id = gen and l.name = 'кв. 21';
  t := public.pf_location_path(tmp);
  res := res || case when t = 'Корпус Г · Секция 2 · эт. 1 · кв. 21' then E'28 OK сквозная нумерация, путь: ' || t || E'\n' else E'28 FAIL путь: ' || coalesce(t,'null') || E'\n' end;
  select count(distinct name) into n from core.locations where node_type = 'apartment' and project_id = pa
    and id in (with recursive d(id) as (select id from core.locations where parent_id = gen union all select l.id from core.locations l join d on l.parent_id = d.id) select id from d);
  res := res || case when n = 40 then E'29 OK номера квартир не повторяются (40)\n' else format(E'29 FAIL уникальных номеров %s\n', n) end;
  begin perform public.pf_generate_building(pa, null, 'Корпус Г', 1, 1, 1, 1); res := res || E'30 FAIL дубль имени корпуса\n';
  exception when others then res := res || E'30 OK повтор имени корпуса отклонён\n'; end;
  select count(*) into n from core.locations where project_id = pa and deleted_at is null;
  begin perform public.pf_generate_building(pa, null, 'Огромный', 10, 100, 10, 1); res := res || E'31 FAIL > 5000 узлов принято\n';
  exception when others then res := res || E'31 OK > 5000 узлов отклонено: ' || sqlerrm || E'\n'; end;
  select count(*) into n2 from core.locations where project_id = pa and deleted_at is null;
  res := res || case when n = n2 then E'32 OK отклонённый генератор ничего не создал (транзакция)\n' else format(E'32 FAIL создано частично: %s -> %s\n', n, n2) end;
  begin perform public.pf_generate_building(pa, null, 'Ноль', 0, 5, 4, 1); res := res || E'33 FAIL 0 секций принято\n';
  exception when others then res := res || E'33 OK 0 секций отклонено\n'; end;
  begin perform public.pf_generate_building(pa, chain, 'Глубоко', 1, 1, 1, 1); res := res || E'34 FAIL генератор на глубину > 6\n';
  exception when others then res := res || E'34 OK генератор у глубокого родителя отклонён\n'; end;
  lv := public.pf_generate_building(pa, null, 'Подвал', 1, 3, 0, -1);
  select count(*) into n from core.locations where parent_id in (select id from core.locations where parent_id = lv) and name in ('эт. -1','эт. 0','эт. 1');
  res := res || case when n = 3 then E'35 OK первый этаж -1, квартир 0\n' else format(E'35 FAIL этажи: %s\n', n) end;

  -- ленивая загрузка
  select count(*) into n from public.pf_list_locations(pa, null);
  select child_count into n2 from public.pf_list_locations(pa, null) where id = gen;
  res := res || case when n2 = 2 then format(E'36 OK корней %s, у «Корпус Г» child_count = 2\n', n) else format(E'36 FAIL child_count %s\n', n2) end;
  select count(*) into n from public.pf_list_locations(pa, gen);
  res := res || case when n = 2 then E'37 OK дети корпуса — 2 секции\n' else format(E'37 FAIL детей %s\n', n) end;

  -- 4. Единицы
  select count(*) into n from public.pf_list_units(ca) where is_common;
  res := res || case when n = 9 then E'38 OK общих единиц 9\n' else format(E'38 FAIL общих %s\n', n) end;
  tmp := public.pf_add_unit(ca, 'м² пола', 'Площадь пола'); u_a := tmp;
  select count(*) into n from public.pf_list_units(ca) where id = tmp and not is_common;
  res := res || case when n = 1 then E'39 OK своя единица добавлена\n' else E'39 FAIL\n' end;
  begin perform public.pf_add_unit(ca, 'М² ПОЛА', 'дубль'); res := res || E'40 FAIL дубль своей единицы\n';
  exception when others then res := res || E'40 OK дубль своей единицы (без учёта регистра) отклонён\n'; end;
  begin perform public.pf_add_unit(ca, 'КГ', 'дубль общей'); res := res || E'41 FAIL дубль общей единицы\n';
  exception when others then res := res || E'41 OK дубль общей единицы отклонён\n'; end;
  select id into mv from core.units where company_id is null and code = 'шт.';
  begin perform public.pf_delete_unit(mv); res := res || E'42 FAIL общая единица удалена\n';
  exception when others then res := res || case when sqlstate = '42501' then E'42 OK общую единицу удалить нельзя\n' else E'42 FAIL ' || sqlerrm || E'\n' end; end;

  -- 5. Прораб Альфы (без прав manage): читает, не пишет
  reset role; perform pg_temp.as_user(ufor);
  select count(*) into n from public.pf_company_projects(ca) where id = pa and not can_manage;
  res := res || case when n = 1 then E'43 OK прораб видит проект, can_manage = false\n' else E'43 FAIL\n' end;
  select count(*) into n from public.pf_list_locations(pa, gen);
  res := res || case when n = 2 then E'44 OK прораб читает дерево\n' else E'44 FAIL\n' end;
  begin perform public.pf_create_project(ca, 'X'); res := res || E'45 FAIL прораб создал проект\n';
  exception when others then res := res || case when sqlstate = '42501' then E'45 OK прораб: создать проект нельзя\n' else E'45 FAIL ' || sqlerrm || E'\n' end; end;
  begin perform public.pf_add_location(pa, null, 'other', 'X'); res := res || E'46 FAIL прораб добавил узел\n';
  exception when others then res := res || E'46 OK прораб: добавить узел нельзя\n'; end;
  begin perform public.pf_rename_location(gen, 'Y'); res := res || E'47 FAIL прораб переименовал\n';
  exception when others then res := res || E'47 OK прораб: переименовать нельзя\n'; end;
  begin perform public.pf_delete_location(gen, true); res := res || E'48 FAIL прораб удалил ветку\n';
  exception when others then res := res || E'48 OK прораб: удалить нельзя\n'; end;
  begin perform public.pf_move_location(gen, null); res := res || E'49 FAIL прораб перенёс\n';
  exception when others then res := res || E'49 OK прораб: перенести нельзя\n'; end;
  begin perform public.pf_generate_building(pa, null, 'Z', 1, 1, 1, 1); res := res || E'50 FAIL прораб сгенерировал\n';
  exception when others then res := res || E'50 OK прораб: генератор закрыт\n'; end;
  begin perform public.pf_update_project(pa, 'Z'); res := res || E'51 FAIL прораб переименовал проект\n';
  exception when others then res := res || E'51 OK прораб: проект не изменить\n'; end;
  begin perform public.pf_add_unit(ca, 'зз', 'зз'); res := res || E'52 FAIL прораб добавил единицу\n';
  exception when others then res := res || E'52 OK прораб: единицу добавить нельзя\n'; end;
  begin perform public.pf_delete_unit(tmp); res := res || E'53 FAIL прораб удалил единицу\n';
  exception when others then res := res || E'53 OK прораб: единицу удалить нельзя\n'; end;
  select count(*) into n from public.pf_list_units(ca);
  res := res || case when n = 10 then E'54 OK прораб читает единицы (9 общих + 1 своя)\n' else format(E'54 FAIL единиц %s\n', n) end;
  select count(*) into n from public.pf_my_company_access() where not can_manage_projects and not can_manage_units and not can_manage_roles;
  res := res || case when n = 1 then E'55 OK прораб: флаги доступа все false\n' else E'55 FAIL\n' end;
  begin perform public.pf_list_company_audit(ca, 10); res := res || E'56 FAIL прораб прочитал журнал компании\n';
  exception when others then res := res || E'56 OK прораб: журнал компании закрыт\n'; end;

  -- 6. Журнал (администратор)
  reset role; perform pg_temp.as_user(uadm);
  select string_agg(distinct table_name, ',' order by table_name) into t from public.pf_list_company_audit(ca, 200);
  res := res || case when t = 'locations,projects,units' then E'57 OK журнал компании: проекты, локации, единицы\n' else E'57 FAIL таблицы журнала: ' || coalesce(t,'null') || E'\n' end;
  select count(*) into n from public.pf_list_company_audit(ca, 200) where table_name = 'locations' and action = 'INSERT' and (new_data ->> 'generated') = 'true';
  res := res || case when n = 2 then E'58 OK генератор в журнале одной записью на вызов (2 вызова)\n' else format(E'58 FAIL записей генератора %s\n', n) end;
  select count(*) into n from public.pf_list_audit(pa, 200);
  res := res || case when n = 0 then E'59 OK журнал «План/Факт» проекта не засорён событиями локаций\n' else format(E'59 FAIL в журнале работ %s записей\n', n) end;

  -- 7. Менеджер ПТО на всю компанию: права из шаблона
  reset role; perform pg_temp.as_user(upto);
  begin tmp := public.pf_add_location(pa, null, 'building', 'Корпус ПТО'); res := res || E'60 OK ПТО добавил узел\n';
  exception when others then res := res || E'60 FAIL ' || sqlerrm || E'\n'; end;
  begin tmp := public.pf_add_unit(ca, 'пог.м', 'Погонный метр (свой)'); res := res || E'61 OK ПТО добавил единицу\n';
  exception when others then res := res || E'61 FAIL ' || sqlerrm || E'\n'; end;

  -- 8. Назначение на один проект: право только внутри него
  reset role;
  insert into core.projects(id, company_id, name) values (gen_random_uuid(), ca, 'Второй проект') returning id into pa2;
  insert into core.role_assignments(company_id,user_id,role_id,project_id) values (ca,uprj,r_pto,pa);
  perform pg_temp.as_user(uprj);
  begin perform public.pf_add_location(pa, null, 'other', 'Внутри назначенного'); res := res || E'62 OK право в назначенном проекте\n';
  exception when others then res := res || E'62 FAIL ' || sqlerrm || E'\n'; end;
  begin perform public.pf_add_location(pa2, null, 'other', 'В чужом проекте'); res := res || E'63 FAIL право вышло за пределы проекта\n';
  exception when others then res := res || E'63 OK в другом проекте компании — нельзя\n'; end;
  begin perform public.pf_create_project(ca, 'Новый'); res := res || E'64 FAIL проектный пользователь создал проект\n';
  exception when others then res := res || E'64 OK создание проекта требует права на всю компанию\n'; end;
  select count(*) into n from public.pf_company_projects(ca);
  res := res || case when n = 1 then E'65 OK видит только назначенный проект\n' else format(E'65 FAIL видит проектов: %s\n', n) end;

  -- 9. Компания Б: ничего из Альфы
  reset role; perform pg_temp.as_user(ubadm);
  select count(*) into n from public.pf_company_projects(ca);
  res := res || case when n = 0 then E'66 OK Бета: проектов Альфы 0\n' else format(E'66 FAIL Бета видит %s проектов Альфы\n', n) end;
  select count(*) into n from core.projects where company_id = ca; select count(*) into n2 from core.locations where company_id = ca;
  res := res || case when n = 0 and n2 = 0 then E'67 OK Бета: прямой SELECT проектов и локаций Альфы — 0 строк\n' else format(E'67 FAIL прямой SELECT %s/%s\n', n, n2) end;
  begin perform public.pf_list_locations(pa, null); res := res || E'68 FAIL Бета читает дерево Альфы\n';
  exception when others then res := res || E'68 OK Бета: дерево Альфы закрыто\n'; end;
  begin perform public.pf_location_path(gen); res := res || E'69 FAIL Бета читает путь узла Альфы\n';
  exception when others then res := res || E'69 OK Бета: путь узла Альфы закрыт\n'; end;
  begin perform public.pf_add_location(pa, null, 'other', 'Чужой'); res := res || E'70 FAIL Бета добавила узел в Альфу\n';
  exception when others then res := res || E'70 OK Бета: запись в Альфу закрыта\n'; end;
  begin perform public.pf_rename_location(gen, 'Чужой'); res := res || E'71 FAIL Бета переименовала узел Альфы\n';
  exception when others then res := res || E'71 OK Бета: переименование закрыто\n'; end;
  begin perform public.pf_delete_location(gen, true); res := res || E'72 FAIL Бета удалила ветку Альфы\n';
  exception when others then res := res || E'72 OK Бета: удаление закрыто\n'; end;
  begin perform public.pf_move_location(gen, null); res := res || E'73 FAIL Бета перенесла узел Альфы\n';
  exception when others then res := res || E'73 OK Бета: перенос закрыт\n'; end;
  begin perform public.pf_generate_building(pa, null, 'Чужой', 1, 1, 1, 1); res := res || E'74 FAIL Бета сгенерировала корпус в Альфе\n';
  exception when others then res := res || E'74 OK Бета: генератор в Альфе закрыт\n'; end;
  begin perform public.pf_update_project(pa, 'Чужой'); res := res || E'75 FAIL Бета переименовала проект Альфы\n';
  exception when others then res := res || E'75 OK Бета: проект Альфы не изменить\n'; end;
  begin perform public.pf_create_project(ca, 'Чужой'); res := res || E'76 FAIL Бета создала проект в Альфе\n';
  exception when others then res := res || E'76 OK Бета: создать проект в Альфе нельзя\n'; end;
  begin perform public.pf_list_units(ca); res := res || E'77 FAIL Бета читает единицы Альфы\n';
  exception when others then res := res || E'77 OK Бета: единицы Альфы закрыты\n'; end;
  begin perform public.pf_add_unit(ca, 'чужая', 'чужая'); res := res || E'78 FAIL Бета добавила единицу в Альфу\n';
  exception when others then res := res || E'78 OK Бета: добавить единицу в Альфу нельзя\n'; end;
  begin perform public.pf_delete_unit(u_a); res := res || E'79 FAIL Бета видела/удалила свою единицу Альфы\n';
  exception when others then res := res || E'79 OK Бета: единица Альфы недоступна\n'; end;
  select count(*) into n from public.pf_list_units(cb);
  res := res || case when n = 9 then E'80 OK Бета: только 9 общих единиц\n' else format(E'80 FAIL единиц у Беты %s\n', n) end;
  select count(*) into n from core.units where company_id = ca;
  res := res || case when n = 0 then E'81 OK Бета: прямой SELECT своих единиц Альфы — 0 строк\n' else format(E'81 FAIL видит %s\n', n) end;
  begin perform public.pf_list_company_audit(ca, 10); res := res || E'82 FAIL Бета читает журнал Альфы\n';
  exception when others then res := res || E'82 OK Бета: журнал Альфы закрыт\n'; end;
  select count(*) into n from public.pf_list_units(cb);
  begin update core.locations set name = 'взлом' where project_id = pa; get diagnostics n = row_count; res := res || case when n = 0 then E'83 OK прямой UPDATE ничего не изменил\n' else E'83 FAIL\n' end;
  exception when others then res := res || E'83 OK прямой UPDATE отклонён\n'; end;
  begin insert into core.locations(company_id, project_id, node_type, name, canonical_key) values (cb, pb, 'other', 'прямая', 'прямая'); res := res || E'84 FAIL прямой INSERT прошёл\n';
  exception when others then res := res || E'84 OK прямой INSERT отклонён\n'; end;
  -- Бета в своём проекте создаёт узлы независимо
  tmp := public.pf_create_project(cb, 'Проект Беты 2');
  select count(*) into n from public.pf_company_projects(cb);
  res := res || case when n = 2 then E'85 OK Бета видит только свои 2 проекта\n' else format(E'85 FAIL проектов Беты %s\n', n) end;
  begin perform public.pf_add_location(pb, null, 'building', 'Корпус А'); res := res || E'86 OK одинаковые имена в разных проектах допустимы\n';
  exception when others then res := res || E'86 FAIL ' || sqlerrm || E'\n'; end;
  begin perform public.pf_add_location(pb, bld, 'other', 'Х'); res := res || E'87 FAIL родитель из другого проекта\n';
  exception when others then res := res || E'87 OK родитель из другого проекта отклонён\n'; end;
  begin perform public.pf_move_location((select id from core.locations where project_id = pb limit 1), bld); res := res || E'88 FAIL перенос в другой проект\n';
  exception when others then res := res || E'88 OK перенос в другой проект отклонён\n'; end;

  -- 10. anon
  reset role; perform set_config('request.jwt.claims','',true); perform set_config('request.jwt.claim.sub','',true); execute 'set local role anon';
  begin perform public.pf_create_project(ca, 'anon'); res := res || E'89 FAIL anon создал проект\n';
  exception when others then res := res || E'89 OK anon отклонён\n'; end;
  begin perform count(*) from core.locations; res := res || E'90 FAIL anon читает локации\n';
  exception when others then res := res || E'90 OK anon: локации закрыты\n'; end;
  begin perform public.pf_list_units(ca); res := res || E'91 FAIL anon читает единицы\n';
  exception when others then res := res || E'91 OK anon: единицы закрыты\n'; end;
  reset role;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res,'FAIL','')))/4;
end $$;
