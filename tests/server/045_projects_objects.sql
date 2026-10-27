-- P2-0047 (045): подразделения, карточка проекта, объект — верх дерева, номера помещений, удобный ввод структуры.
-- Права — на уровне ядра (без модулей), id с устройства без дублей, удаление пометкой, журнал.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 045_projects_objects_up.sql.
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.msg(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ' ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
create or replace function pg_temp.cnt(q text) returns int language plpgsql as $f$
declare n int; begin execute 'select count(*)::int from (' || q || ') x' into n; return n; exception when others then return -1; end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); ueng uuid := gen_random_uuid(); uoth uuid := gen_random_uuid(); uman uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); r_adm uuid; r_eng uuid; r_b uuid;
  d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid(); db uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); po uuid; o1 uuid := gen_random_uuid(); o2 uuid := gen_random_uuid();
  s1 uuid; s2 uuid; s3 uuid := gen_random_uuid(); x uuid; res text := ''; n int; m text; r record; v text;
begin
  -- 0. Справочники
  res := res || pg_temp.t((select count(*) from core.project_stages) = 6 and (select count(*) from core.object_kinds) = 5
                          and (select count(*) from core.project_roles) = 5, 'справочники: 6 стадий, 5 видов объектов, 5 ролей');

  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, ueng, uoth, uman]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 045', true), (cb, 'Бета 045', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, ueng), (ca, uman), (cb, uoth);
  -- у Альфы ни одного модуля (MODULES 1а: ядро работает без модулей)
  delete from core.company_modules where company_id in (ca, cb);
  insert into core.company_roles(company_id, name) values (ca, 'Админ 045') returning id into r_adm;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер 045') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (cb, 'Админ Б 045') returning id into r_b;
  insert into core.company_role_permissions(role_id, company_id, action) values
    (r_adm, ca, 'planfact.projects.manage'), (r_b, cb, 'planfact.projects.manage');
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values (ca, uadm, r_adm, null), (cb, uoth, r_b, null);

  -- 1. Подразделения
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(jsonb_array_length(public.pf_project_dicts()->'stages') = 6 and jsonb_array_length(public.pf_project_dicts()->'roles') = 5,
                          'справочники одним вызовом (pf_project_dicts)');
  m := pg_temp.msg(format('select public.pf_save_division(%L, %L, %L, %L)', ca, d1, 'Дирекция «Север»', uman));
  res := res || pg_temp.t(m = 'OK', 'админ создаёт подразделение без модулей (' || m || ')');
  m := pg_temp.msg(format('select public.pf_save_division(%L, %L, %L, %L)', ca, d1, 'Дирекция «Север»', uman));
  reset role;
  res := res || pg_temp.t(m = 'OK' and (select count(*) from core.divisions where company_id = ca) = 1, 'повтор с тем же id — без дубля');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_division(%L, %L, %L)', ca, d2, 'дирекция  «север»')) like '23505%',
                          'то же название — отказ 23505');
  perform public.pf_save_division(ca, d2, 'Дирекция «Юг»');
  res := res || pg_temp.t(pg_temp.cnt(format('select * from public.pf_company_divisions(%L)', ca)) = 2, 'список подразделений: 2');
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_division(%L, %L, %L, %L)', ca, gen_random_uuid(), 'Чужой руководитель', uoth)) like '22023%',
                          'руководитель не из компании — отказ');
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_division(%L, %L, %L)', ca, gen_random_uuid(), 'Без права')) like '42501%',
                          'сотрудник без права — отказ 42501');
  perform pg_temp.as_user(uoth, cb);
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_division(%L, %L, %L)', ca, gen_random_uuid(), 'Чужая')) like '42501%',
                          'чужая компания — отказ 42501');
  res := res || pg_temp.t(pg_temp.cnt(format('select * from public.pf_company_divisions(%L)', ca)) = 0
                          and pg_temp.cnt(format('select * from core.divisions where company_id = %L', ca)) = 0, 'чужая компания: подразделений не видит');
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_division(%L, %L, %L)', cb, d1, 'Захват')) like '42501%',
                          'id подразделения чужой компании — отказ');
  perform pg_temp.as_user(null, null);
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_division(%L, %L, %L)', ca, gen_random_uuid(), 'Аноним')) like '42501%',
                          'без входа — отказ');

  -- 2. Проекты: карточка, id с устройства
  perform pg_temp.as_user(uadm, ca);
  m := pg_temp.msg(format('select public.pf_save_project(%L, %L, %L::jsonb)', ca, p1,
    json_build_object('name', 'ЖК Тест 045', 'code', 'T45', 'division_id', d1, 'address', 'СПб, пр. Тестовый, 1', 'manager_user_id', uman,
                      'planned_start', '2026-01-10', 'planned_finish', '2027-12-31', 'stage', 'construction', 'our_role', 'general_contractor',
                      'timezone', 'Asia/Yekaterinburg', 'country', 'ru')));
  res := res || pg_temp.t(m = 'OK', 'проект создан карточкой (' || m || ')');
  perform public.pf_save_project(ca, p1, json_build_object('name', 'ЖК Тест 045')::jsonb);
  reset role;
  select * into r from core.projects where id = p1;
  res := res || pg_temp.t((select count(*) from core.projects where company_id = ca) = 1 and r.code = 'T45' and r.division_id = d1
                          and r.timezone = 'Asia/Yekaterinburg' and r.country = 'RU' and r.our_role = 'general_contractor' and r.stage = 'construction'
                          and r.manager_user_id = uman and r.planned_finish = date '2027-12-31', 'повтор — без дубля, поля карточки сохранены, страна заглавными');
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_project(ca, p1, '{"stage": "warranty"}'::jsonb);
  reset role;
  res := res || pg_temp.t((select stage = 'warranty' and code = 'T45' and division_id = d1 from core.projects where id = p1), 'частичная правка: другие поля не тронуты');
  res := res || pg_temp.t((select count(*) from core.audit_log where record_id = p1 and table_name = 'projects') = 2, 'журнал: создание и правка (повтор без изменений не пишется)');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_project(%L, %L, %L::jsonb)', ca, p1, '{"timezone": "Mars/Base"}')) like '22023%', 'неизвестный пояс — отказ');
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_project(%L, %L, %L::jsonb)', ca, p1, '{"stage": "fly"}')) like '22023%', 'неизвестная стадия — отказ');
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_project(%L, %L, %L::jsonb)', ca, p1, '{"our_role": "boss"}')) like '22023%', 'неизвестная роль — отказ');
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_project(%L, %L, %L::jsonb)', ca, p1, '{"country": "RUS"}')) like '22023%', 'страна не из 2 букв — отказ');
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_project(%L, %L, %L::jsonb)', ca, p1,
                            json_build_object('planned_start', '2028-01-01'))) like '22023%', 'начало позже окончания — отказ');
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_project(%L, %L, %L::jsonb)', ca, p2, '{"code": "X"}')) like '22023%', 'новый без названия — отказ');
  perform public.pf_save_project(ca, p2, '{"name": "ЖК Второй 045"}'::jsonb);
  reset role;
  res := res || pg_temp.t((select stage = 'construction' and timezone = 'Europe/Moscow' and country = 'RU' and our_role is null and division_id is null
                           from core.projects where id = p2), 'новый проект: по умолчанию строительство, Москва, RU');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.cnt(format('select * from public.pf_project_catalog(%L)', ca)) = 2, 'каталог проектов без модулей: 2');
  select * into r from public.pf_project_catalog(ca) c where c.id = p1;
  res := res || pg_temp.t(r.division_name = 'Дирекция «Север»' and r.can_manage and r.object_count = 0, 'каталог: подразделение, право, объектов 0');
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.cnt(format('select * from public.pf_project_catalog(%L)', ca)) = 0, 'сотрудник без назначения — проектов не видит');
  reset role;
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values (ca, ueng, r_eng, p2);
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.cnt(format('select * from public.pf_project_catalog(%L)', ca)) = 1
                          and (select not c.can_manage from public.pf_project_catalog(ca) c), 'участник проекта видит только свой, без правки');
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_project(%L, %L, %L::jsonb)', ca, p2, '{"name": "Взлом"}')) like '42501%', 'участник — правка карточки отказ');
  perform pg_temp.as_user(uoth, cb);
  res := res || pg_temp.t(pg_temp.cnt(format('select * from public.pf_project_catalog(%L)', ca)) = 0, 'чужая компания — проектов не видит');
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_project(%L, %L, %L::jsonb)', cb, p1, '{"name": "Захват"}')) like '42501%', 'id проекта чужой компании — отказ');
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_project(%L, %L, %L::jsonb)', cb, gen_random_uuid(),
                            json_build_object('name', 'Б', 'division_id', d1))) like '22023%', 'подразделение чужой компании — отказ');

  -- 3. Объекты и места
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_place(%L, %L, null, %L, %L)', p1, gen_random_uuid(), 'section', 'Секция')) like '22023%',
                          'верх дерева — не объект: отказ');
  m := pg_temp.msg(format('select public.pf_save_place(%L, %L, null, %L, %L, %L)', p1, o1, 'object', 'Корпус 1', 'building'));
  res := res || pg_temp.t(m = 'OK', 'объект «Корпус 1» (' || m || ')');
  perform public.pf_save_place(p1, o1, null, 'object', 'Корпус 1', 'building');
  reset role;
  res := res || pg_temp.t((select count(*) from core.locations where project_id = p1) = 1, 'повтор объекта — без дубля');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_place(%L, %L, %L, %L, %L)', p1, gen_random_uuid(), o1, 'object', 'Вложенный')) like '22023%',
                          'объект внутри объекта — отказ');
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_place(%L, %L, null, %L, %L, %L)', p1, gen_random_uuid(), 'object', 'Х', 'spaceship')) like '22023%',
                          'неизвестный вид объекта — отказ');
  perform public.pf_save_place(p1, o2, null, 'object', 'Паркинг', 'parking');
  reset role;
  res := res || pg_temp.t((select node_type = 'object' and object_kind = 'parking' and depth = 1 from core.locations where id = o2), 'паркинг — объект вида «паркинг»');
  perform pg_temp.as_user(uadm, ca);

  -- мастер: 2 секции × 3 этажа × 2 квартиры, сквозная нумерация, подвал и кровля
  n := public.pf_fill_object(o1, 2, 3, 2, 1, 'through', 1, true, true);
  reset role;
  res := res || pg_temp.t((select count(*) from core.locations where parent_id = o1 and node_type = 'section' and deleted_at is null) = 2
                          and (select count(*) from core.locations l join core.locations s on s.id = l.parent_id where s.parent_id = o1 and l.node_type = 'floor') = 8
                          and (select count(*) from core.locations l join core.locations s on s.id = l.parent_id where s.parent_id = o1 and l.name = 'Кровля') = 2,
                          'мастер: 2 секции, 8 этажей с подвалом, 2 кровли');
  select string_agg(l.build_no, ',' order by l.build_no::int) into v from core.locations l where l.project_id = p1 and l.node_type = 'apartment';
  res := res || pg_temp.t(v = '1,2,3,4,5,6,7,8,9,10,11,12', 'сквозная нумерация 1–12 (' || coalesce(v, '—') || ')');
  res := res || pg_temp.t((select l.name from core.locations l join core.locations f on f.id = l.parent_id join core.locations s on s.id = f.parent_id
                            where s.name = 'Секция 2' and s.parent_id = o1 and f.name = 'эт. 1' and l.sort_order = 1) = 'кв. 7', 'секция 2, 1 этаж — кв. 7');
  perform pg_temp.as_user(uadm, ca);
  n := public.pf_fill_object(o1, 2, 3, 2);
  reset role;
  res := res || pg_temp.t(n = 0 and (select count(*) from core.locations where project_id = p1 and node_type = 'apartment') = 12, 'повтор мастера — ничего не добавил');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_fill_object(%L, 100, 200, 100)', o2)) like '22023%', 'больше 5000 мест — отказ');
  -- нумерация в каждой секции заново
  x := gen_random_uuid(); perform public.pf_save_place(p2, x, null, 'object', 'Корпус А', 'building');
  perform public.pf_fill_object(x, 2, 2, 2, 1, 'per_section', 101);
  reset role;
  select string_agg(l.build_no, ',' order by l.build_no::int) into v from core.locations l where l.project_id = p2 and l.node_type = 'apartment';
  res := res || pg_temp.t(v = '101,101,102,102,103,103,104,104', 'нумерация в каждой секции с 101 (' || coalesce(v, '—') || ')');

  -- добавить этажи 4–5 в обе секции
  select id into s1 from core.locations where parent_id = o1 and name = 'Секция 1';
  select id into s2 from core.locations where parent_id = o1 and name = 'Секция 2';
  perform pg_temp.as_user(uadm, ca);
  n := public.pf_add_floors(array[s1, s2], 4, 5, 2);
  reset role;
  select string_agg(l.build_no, ',' order by l.build_no::int) into v from core.locations l where l.project_id = p1 and l.node_type = 'apartment' and l.build_no::int > 12;
  res := res || pg_temp.t(n = 12 and v = '13,14,15,16,17,18,19,20', 'добавлены этажи 4–5 в 2 секции: 12 мест, квартиры 13–20 (' || n || '; ' || coalesce(v, '—') || ')');
  perform pg_temp.as_user(uadm, ca);
  n := public.pf_add_floors(array[s1, s2], 4, 5, 2);
  res := res || pg_temp.t(n = 0, 'повтор «добавить этажи» — ничего');
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_add_floors(array[%L, %L]::uuid[], 1, 2, 1)', s1, o2)) like '22023%', 'не секция в списке — отказ');

  -- копировать секцию
  x := public.pf_copy_place(s1, s3, 'Секция 3');
  x := public.pf_copy_place(s1, s3, 'Секция 3');
  reset role;
  res := res || pg_temp.t((select count(*) from core.locations where parent_id = o1 and node_type = 'section' and deleted_at is null) = 3, 'копия секции: 3 секции, повтор без дубля');
  select string_agg(l.build_no, ',' order by l.build_no::int) into v from core.locations l join core.locations f on f.id = l.parent_id where f.parent_id = s3 and l.node_type = 'apartment';
  res := res || pg_temp.t(v = '21,22,23,24,25,26,27,28,29,30', 'квартиры копии — 21–30 (' || coalesce(v, '—') || ')');
  res := res || pg_temp.t((select count(*) from core.locations where parent_id = s3) = (select count(*) from core.locations where parent_id = s1), 'копия: те же этажи');

  -- список мест, правка номеров, удаление пометкой
  perform pg_temp.as_user(uadm, ca);
  select * into r from public.pf_project_places(p1) p where p.id = o1;
  res := res || pg_temp.t(r.object_kind = 'building' and r.child_count = 3 and r.apartment_count = 30, 'список: объект, 3 секции, 30 квартир');
  reset role;
  select l.id into x from core.locations l where l.project_id = p1 and l.build_no = '5';
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_place(p1, x, null, 'apartment', 'кв. 5', null, '5', '105');
  reset role;
  res := res || pg_temp.t((select bti_no = '105' and parent_id is not null from core.locations where id = x), 'номер БТИ сохранён, место не сдвинулось');
  perform pg_temp.as_user(uadm, ca);
  n := public.pf_remove_place(s3);
  res := res || pg_temp.t(n = 18 and public.pf_remove_place(s3) = 0, 'удаление ветки пометкой (' || n || '), повтор — 0');
  reset role;
  res := res || pg_temp.t((select count(*) from core.locations where id = s3 and deleted_at is not null) = 1, 'ветка помечена удалённой, не стёрта');

  -- архив, права, чужая компания
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_place(%L, %L, null, %L, %L, %L)', p2, gen_random_uuid(), 'object', 'Х', 'other')) like '42501%',
                          'участник без права — места не правит');
  res := res || pg_temp.t(pg_temp.cnt(format('select * from public.pf_project_places(%L)', p2)) = 1, 'участник видит места своего проекта');
  res := res || pg_temp.t(pg_temp.msg(format('select * from public.pf_project_places(%L)', p1)) like '42501%', 'места чужого проекта — отказ');
  perform pg_temp.as_user(uoth, cb);
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_place(%L, %L, null, %L, %L, %L)', p1, gen_random_uuid(), 'object', 'Х', 'other')) like '42501%',
                          'чужая компания — места не правит');
  res := res || pg_temp.t(pg_temp.cnt(format('select * from core.locations where project_id = %L', p1)) = 0, 'чужая компания — мест не видит');
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_project(ca, p2, '{"archived": true}'::jsonb);
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_save_place(%L, %L, null, %L, %L, %L)', p2, gen_random_uuid(), 'object', 'Х', 'other')) like '22023%',
                          'проект в архиве — места не меняются');

  -- 4. Старые пути: корпус через прежние функции и прямую запись становится объектом
  reset role;
  insert into core.company_modules(company_id, module, enabled) values (ca, 'planfact', true)
    on conflict (company_id, module) do update set enabled = true;
  insert into core.projects(id, company_id, name) values (gen_random_uuid(), ca, 'ЖК Старый путь 045') returning id into po;
  perform pg_temp.as_user(uadm, ca);
  x := public.pf_add_location(po, null, 'building', 'Корпус 9');
  res := res || pg_temp.t((select node_type = 'object' and object_kind = 'building' from core.locations where id = x), 'pf_add_location: корпус → объект «корпус»');
  x := public.pf_generate_building(po, null, 'Корпус 10', 1, 2, 2);
  res := res || pg_temp.t((select node_type = 'object' and object_kind = 'building' from core.locations where id = x)
                          and (select count(*) from core.locations where parent_id = x and node_type = 'section') = 1, 'pf_generate_building: корпус → объект');
  reset role;
  res := res || pg_temp.t(pg_temp.msg(format($q$insert into core.locations(company_id, project_id, node_type, name, canonical_key) values (%L, %L, 'apartment', 'Кв', 'кв')$q$, ca, po)) like '22023%',
                          'прямая запись: квартира на верхнем уровне — отказ');
  res := res || pg_temp.t(pg_temp.msg(format($q$update core.locations set node_type = 'object' where id = %L$q$, s1)) like '22023%',
                          'объект ниже верхнего уровня — отказ');

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
