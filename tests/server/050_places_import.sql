-- P2-0056 (050): загрузка списка помещений. Предпросмотр ничего не пишет; загрузка создаёт недостающие объект / секцию / этаж /
-- помещение (номер — из файла или следующий по объекту), существующие не трогает (сопоставление по названию и по номеру:
-- «2 этаж» = «эт. 2»), «в файле иначе» — отдельно; повтор с той же меткой — прежний ответ; тот же файл новой меткой — «создано 0»;
-- ошибка в строке — не пишется ничего; место другого вида на уровне — отказ; зеркало Качества; отмена загрузки (с добавленным
-- внутрь потом) и восстановление; площадь и комнаты (pf_save_place_info, pf_project_places, копия переносит комнаты);
-- права: роль без права, чужая компания, аноним; проект 'quality' — отказ; без Качества; 5000 строк — время.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 050_places_import_up.sql.
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
create or replace function pg_temp.node(c uuid, nid text, parent text, typ text, nm text, ord int default 0) returns void language sql as $f$
  insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id)
  values (nid, parent, typ, nm, lower(nm), ord, c) $f$;
create or replace function pg_temp.diff(p uuid) returns int language sql security definer as $f$
  select (select count(*)::int from core.locations l
           where l.project_id = p and l.deleted_at is null
             and not exists (select 1 from quality.location_nodes n
                              where n.core_location_id = l.id and not n.is_deleted and n."displayName" = l.name and n.sort_order = l.sort_order
                                and n."parentId" = coalesce((select x.id from quality.location_nodes x where x.core_location_id = l.parent_id),
                                                            quality.project_root_node(p))))
       + (select count(*)::int from quality.location_nodes n join core.locations l on l.id = n.core_location_id
           where l.project_id = p and not n.is_deleted and l.deleted_at is not null) $f$;
create or replace function pg_temp.bad_depth(p uuid) returns int language sql security definer as $f$
  select count(*)::int from core.locations l left join core.locations pr on pr.id = l.parent_id
   where l.project_id = p and l.deleted_at is null and l.depth <> coalesce(pr.depth, 0) + 1 $f$;
create or replace function pg_temp.kid(par uuid, nm text) returns uuid language sql security definer as $f$
  select id from core.locations where parent_id = par and name = nm and deleted_at is null $f$;
create or replace function pg_temp.root(p uuid, nm text) returns uuid language sql security definer as $f$
  select id from core.locations where project_id = p and parent_id is null and name = nm and deleted_at is null $f$;
create or replace function pg_temp.live(p uuid) returns int language sql security definer as $f$
  select count(*)::int from core.locations where project_id = p and deleted_at is null $f$;
create or replace function pg_temp.loc(l uuid) returns core.locations language sql security definer as $f$
  select * from core.locations where id = l $f$;
-- строка файла
create or replace function pg_temp.rw(no int, o text, s text, f text, n text, b text default null, bt text default null,
                                      a text default null, rm text default null) returns jsonb language sql as $f$
  select jsonb_build_object('row_no', no, 'object', o, 'section', s, 'floor', f, 'name', n, 'build_no', b, 'bti_no', bt, 'area', a, 'rooms', rm) $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); ueng uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); cc uuid := gen_random_uuid();
  r_adm uuid; r_eng uuid; r_b uuid; r_c uuid;
  pn uuid := gen_random_uuid(); pc uuid := gen_random_uuid(); pq uuid; pbig uuid := gen_random_uuid();
  k1 uuid := gen_random_uuid(); kc uuid := gen_random_uuid(); s1 uuid; f1 uuid; f2 uuid; f3 uuid; s2 uuid; k2 uuid; a1 uuid; a5 uuid;
  b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); b3 uuid := gen_random_uuid(); bx uuid := gen_random_uuid();
  fa jsonb; fe jsonb; j jsonb; j2 jsonb; res text := ''; info text := ''; str text; n0 int; n1 int; v int; x core.locations;
  t0 timestamptz; ms int; ar numeric; rm int; cp uuid := gen_random_uuid(); cp2 uuid := gen_random_uuid(); extra uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, ueng, ub, uc]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 050', true), (cb, 'Бета 050', true), (cc, 'Без Качества 050', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, ueng), (cb, ub), (cc, uc);
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction', 'planfact']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_modules(company_id, module, enabled) values (cc, 'planfact', true)
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_modules(company_id, module, enabled) values (cc, 'quality', false), (cc, 'construction', false)
    on conflict (company_id, module) do update set enabled = false;
  insert into core.company_roles(company_id, name) values (ca, 'Админ 050') returning id into r_adm;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер 050') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (cb, 'Админ Б 050') returning id into r_b;
  insert into core.company_roles(company_id, name) values (cc, 'Админ В 050') returning id into r_c;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_adm, ca, a from unnest(array['planfact.projects.manage', 'quality.view', 'construction.view', 'construction.edit']) a
  union all select r_eng, ca, a from unnest(array['quality.view', 'construction.view', 'construction.edit', 'construction.objects.manage']) a
  union all select r_b, cb, 'planfact.projects.manage'
  union all select r_c, cc, 'planfact.projects.manage';
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, uadm, r_adm, null), (ca, ueng, r_eng, null), (cb, ub, r_b, null), (cc, uc, r_c, null);

  -- 0. Проект ядра: Корпус 1 — Секция 1 × эт. 1–2 × 2 кв. (кв. 1–4, стр. № 1–4)
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_project(ca, pn, '{"name": "ЖК Загрузка 050"}');
  perform public.pf_save_place(pn, k1, null, 'object', 'Корпус 1', 'building');
  perform public.pf_fill_object(k1, 1, 2, 2);
  reset role;
  s1 := pg_temp.kid(k1, 'Секция 1'); f1 := pg_temp.kid(s1, 'эт. 1'); f2 := pg_temp.kid(s1, 'эт. 2'); a1 := pg_temp.kid(f1, 'кв. 1');
  res := res || pg_temp.t(a1 is not null and pg_temp.kid(f2, 'кв. 3') is not null and pg_temp.diff(pn) = 0, 'засев: места и зеркало');
  res := res || pg_temp.t(core.place_num('эт. 3') = 3 and core.place_num('5 этаж') = 5 and core.place_num('эт. -1') = -1
                          and core.place_num('кв. 45а') is null and core.place_num('Секция') is null and core.place_num('Секция 12') = 12,
                          'номер в конце названия');

  -- файл A: 1 есть; 2 — «2 этаж» = эт. 2, кв. 3 есть, площадь иначе; 3–4 — новый эт. 3 (номера 102, 103 — после 101 из файла);
  -- 5 — новая Секция 2; 6–7 — новый Корпус 2 без секции, этаж -1 без помещения
  fa := jsonb_build_array(
    pg_temp.rw(1, 'Корпус 1', 'Секция 1', 'эт. 1', 'кв. 1', '1'),
    pg_temp.rw(2, 'Корпус 1', 'Секция 1', '2 этаж', 'кв. 3', '3', null, '40.5'),
    pg_temp.rw(3, 'Корпус 1', 'Секция 1', 'эт. 3', 'кв. 5', null, 'Б-5', '55,2', '2'),
    pg_temp.rw(4, 'Корпус 1', 'Секция 1', 'эт. 3', 'кв. 6'),
    pg_temp.rw(5, 'Корпус 1', 'Секция 2', 'эт. 1', 'кв. 101', '101', null, null, '0'),
    pg_temp.rw(6, 'Корпус 2', null, 'эт. 1', 'кв. 1'),
    pg_temp.rw(7, 'Корпус 2', null, 'эт. -1', null));

  -- 1. Предпросмотр: счётчики и строки, ничего не записано
  n0 := pg_temp.live(pn);
  perform pg_temp.as_user(uadm, ca);
  j := public.pf_import_places(pn, b1, fa, true);
  reset role;
  res := res || pg_temp.t((j ->> 'ok')::boolean and (j ->> 'dry_run')::boolean
                          and j -> 'created' = '{"objects": 1, "sections": 1, "floors": 4, "apartments": 4}'::jsonb
                          and j -> 'existing_rows' = '[1]'::jsonb and jsonb_array_length(j -> 'differs') = 1
                          and (j -> 'differs' -> 0 ->> 'row_no')::int = 2 and j -> 'differs' -> 0 -> 'fields' -> 0 ->> 'field' = 'area'
                          and j -> 'errors' = '[]'::jsonb and j -> 'roots' = '[]'::jsonb,
                          'предпросмотр: создать 1 объект, 1 секцию, 4 этажа, 4 кв.; строка 1 есть, строка 2 — площадь иначе (' || j::text || ')');
  res := res || pg_temp.t(pg_temp.live(pn) = n0 and pg_temp.root(pn, 'Корпус 2') is null
                          and not exists (select 1 from core.audit_log where record_id = b1)
                          and not exists (select 1 from quality.location_nodes where "displayName" = 'Корпус 2' and core_company_id = ca),
                          'предпросмотр: ничего не записано (мест ' || pg_temp.live(pn) || ' из ' || n0 || ')');

  -- 2. Загрузка
  perform pg_temp.as_user(uadm, ca);
  j := public.pf_import_places(pn, b1, fa);
  reset role;
  s2 := pg_temp.kid(k1, 'Секция 2'); f3 := pg_temp.kid(s1, 'эт. 3'); k2 := pg_temp.root(pn, 'Корпус 2'); a5 := pg_temp.kid(f3, 'кв. 5');
  res := res || pg_temp.t((j ->> 'ok')::boolean and not (j ->> 'dry_run')::boolean
                          and j -> 'created' = '{"objects": 1, "sections": 1, "floors": 4, "apartments": 4}'::jsonb
                          and pg_temp.live(pn) = n0 + 10, 'загрузка: создано 10 мест (' || j::text || ')');
  res := res || pg_temp.t(j -> 'roots' @> to_jsonb(array[k2, s2, f3]) and jsonb_array_length(j -> 'roots') = 3,
                          'загрузка: верхние новые места — Корпус 2, Секция 2, эт. 3');
  x := pg_temp.loc(a5);
  res := res || pg_temp.t(x.build_no = '102' and x.bti_no = 'Б-5' and x.area = 55.20 and x.rooms = 2 and x.node_type = 'apartment' and x.import_batch = b1,
                          'кв. 5: стр. № 102 (следующий после номеров объекта и файла), БТИ, площадь 55,2, 2 комнаты');
  res := res || pg_temp.t((pg_temp.loc(pg_temp.kid(f3, 'кв. 6'))).build_no = '103'
                          and (pg_temp.loc(pg_temp.kid(pg_temp.kid(s2, 'эт. 1'), 'кв. 101'))).build_no = '101'
                          and (pg_temp.loc(pg_temp.kid(pg_temp.kid(s2, 'эт. 1'), 'кв. 101'))).rooms = 0
                          and (pg_temp.loc(pg_temp.kid(pg_temp.kid(k2, 'эт. 1'), 'кв. 1'))).build_no = '1',
                          'номера: кв. 6 → 103, кв. 101 из файла (студия), в Корпусе 2 — с 1');
  res := res || pg_temp.t((pg_temp.loc(k2)).object_kind = 'building' and pg_temp.kid(k2, 'эт. -1') is not null
                          and (pg_temp.loc(pg_temp.kid(k2, 'эт. 1'))).depth = 2 and (pg_temp.loc(f3)).sort_order = (pg_temp.loc(f2)).sort_order + 1
                          and (pg_temp.loc(s2)).sort_order = 2 and pg_temp.bad_depth(pn) = 0,
                          'дерево: объект «корпус», этаж прямо под объектом, глубина и порядок');
  res := res || pg_temp.t((pg_temp.loc(pg_temp.kid(f2, 'кв. 3'))).area is null and pg_temp.kid(s1, '2 этаж') is null,
                          'существующие не тронуты: «2 этаж» = эт. 2, площадь кв. 3 не записана');
  res := res || pg_temp.t(pg_temp.diff(pn) = 0, 'зеркало: все новые места — в Качестве');
  res := res || pg_temp.t((select count(*) from core.audit_log where record_id = b1 and action = 'IMPORT') = 1, 'журнал: IMPORT');

  -- 3. Повтор того же запроса — прежний ответ, ничего нового
  perform pg_temp.as_user(uadm, ca);
  j2 := public.pf_import_places(pn, b1, fa);
  reset role;
  res := res || pg_temp.t((j2 ->> 'repeat')::boolean and j2 -> 'created' = j -> 'created' and pg_temp.live(pn) = n0 + 10,
                          'повтор той же загрузки: прежний ответ, мест столько же');
  -- 4. Тот же файл новой загрузкой — «создано 0»
  perform pg_temp.as_user(uadm, ca);
  j2 := public.pf_import_places(pn, b2, fa);
  reset role;
  res := res || pg_temp.t(j2 -> 'created' = '{"objects": 0, "sections": 0, "floors": 0, "apartments": 0}'::jsonb
                          and j2 -> 'existing_rows' = '[1, 3, 4, 5, 6, 7]'::jsonb and jsonb_array_length(j2 -> 'differs') = 1
                          and pg_temp.live(pn) = n0 + 10, 'тот же файл ещё раз: создано 0, есть 6, иначе 1 (' || j2::text || ')');

  -- 5. Ошибки в строках — не пишется ничего, причины по строкам
  fe := jsonb_build_array(
    pg_temp.rw(1, 'Корпус 1', 'Секция 3', 'эт. 1', 'кв. 900'),
    pg_temp.rw(2, 'Корпус 1', 'Секция 3', null, 'кв. 901'),
    pg_temp.rw(3, 'Корпус 1', 'Секция 3', 'эт. 1', 'кв. 902', null, null, 'много'),
    pg_temp.rw(4, 'Корпус 1', 'Секция 3', 'эт. 1', 'кв. 903', null, null, null, '25'),
    pg_temp.rw(5, 'Корпус 1', 'Секция 3', 'эт. 2', 'кв. 904'),
    pg_temp.rw(6, 'Корпус 1', 'Секция 3', 'эт. 2', 'КВ.  904'),
    pg_temp.rw(7, null, 'Секция 3', 'эт. 1', 'кв. 905'),
    pg_temp.rw(8, 'Корпус 1', 'Секция 3', 'эт. 3', null, '77'),
    pg_temp.rw(9, 'Корпус 1', 'Секция 3', 'эт. 1', 'кв. 906', null, null, '0'));
  perform pg_temp.as_user(uadm, ca);
  j := public.pf_import_places(pn, b3, fe);
  reset role;
  res := res || pg_temp.t(not (j ->> 'ok')::boolean and j -> 'roots' = '[]'::jsonb and pg_temp.kid(k1, 'Секция 3') is null
                          and pg_temp.live(pn) = n0 + 10 and not exists (select 1 from core.audit_log where record_id = b3),
                          'ошибки: ничего не записано, журнала нет');
  res := res || pg_temp.t((select string_agg(e ->> 'row_no', ',' order by (e ->> 'row_no')::int) from jsonb_array_elements(j -> 'errors') e)
                          = '2,3,4,5,6,7,8,9', 'ошибки: строки 2–9 (' || (j -> 'errors')::text || ')');
  res := res || pg_temp.t(j -> 'errors' @> '[{"row_no": 2, "msg": "У помещения не указан этаж"}, {"row_no": 7, "msg": "Не указан корпус (объект)"},
                                              {"row_no": 5, "msg": "Повтор в файле: строки 5, 6"}, {"row_no": 8, "msg": "Номера, площадь и комнаты — только у помещения"},
                                              {"row_no": 4, "msg": "Комнат — целое число от 0 до 20"}]'::jsonb
                          and (select e ->> 'msg' from jsonb_array_elements(j -> 'errors') e where (e ->> 'row_no')::int = 3) like 'Площадь —%'
                          and (select e ->> 'msg' from jsonb_array_elements(j -> 'errors') e where (e ->> 'row_no')::int = 9) like 'Площадь —%',
                          'ошибки: тексты причин');
  res := res || pg_temp.t(j -> 'created' = '{"objects": 0, "sections": 1, "floors": 1, "apartments": 1}'::jsonb,
                          'ошибки: счётчики — по верным строкам (' || (j -> 'created')::text || ')');
  -- место другого вида на уровне
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_place(pn, gen_random_uuid(), s1, 'other', 'эт. 9');
  j := public.pf_import_places(pn, bx, jsonb_build_array(pg_temp.rw(1, 'Корпус 1', 'Секция 1', 'эт. 8', 'кв. 70'),
                                                         pg_temp.rw(2, 'Корпус 1', 'Секция 1', 'эт. 9', 'кв. 71')));
  reset role;
  res := res || pg_temp.t(not (j ->> 'ok')::boolean and j -> 'errors' -> 0 ->> 'row_no' = '2'
                          and j -> 'errors' -> 0 ->> 'msg' like 'На этом уровне уже есть «эт. 9» другого вида%'
                          and pg_temp.kid(s1, 'эт. 8') is null, 'место другого вида на уровне: отказ строки, ничего не записано (' || j::text || ')');
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.msg(format($q$select public.pf_import_places(%L, %L, '[]'::jsonb)$q$, pn, gen_random_uuid()));
  res := res || pg_temp.t(str like '22023 В файле нет строк%', 'пустой файл — отказ');
  str := pg_temp.msg(format($q$select public.pf_import_places(%L, %L, %L::jsonb)$q$, pn, gen_random_uuid(),
                            (select jsonb_agg(pg_temp.rw(g, 'Корпус 1', 'Секция 1', 'эт. 1', 'кв. x' || g)) from generate_series(1, 5001) g)));
  res := res || pg_temp.t(str like '22023 Слишком много строк%', '5001 строка — отказ');
  reset role;

  -- 6. Площадь и комнаты помещения
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_place_info(a1, 40.555, 0);
  reset role;
  res := res || pg_temp.t((pg_temp.loc(a1)).area = 40.56 and (pg_temp.loc(a1)).rooms = 0, 'площадь и комнаты: записаны (округление до сотых)');
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_place(pn, a1, f1, 'apartment', 'кв. 1а', null, '1', null);
  select p.area, p.rooms into ar, rm from public.pf_project_places(pn, f1) p where p.id = a1;
  reset role;
  res := res || pg_temp.t(ar = 40.56 and rm = 0 and (pg_temp.loc(a1)).name = 'кв. 1а', 'прежний pf_save_place не стирает; pf_project_places отдаёт площадь и комнаты');
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.msg(format($q$select public.pf_save_place_info(%L, 10, 1)$q$, f1));
  res := res || pg_temp.t(str like '22023 Площадь и комнаты — только у помещения%', 'у этажа — отказ');
  str := pg_temp.msg(format($q$select public.pf_save_place_info(%L, 0, 1)$q$, a1));
  res := res || pg_temp.t(str like '22023 Площадь%', 'площадь 0 — отказ');
  str := pg_temp.msg(format($q$select public.pf_save_place_info(%L, 50, 21)$q$, a1));
  res := res || pg_temp.t(str like '22023 Комнат%', '21 комната — отказ');
  perform public.pf_save_place_info(a1, null, null);
  reset role;
  res := res || pg_temp.t((pg_temp.loc(a1)).area is null and (pg_temp.loc(a1)).rooms is null
                          and (select count(*) from core.audit_log where record_id = a1 and action = 'UPDATE' and new_data ? 'rooms') = 2,
                          'стереть: площадь и комнаты пусты; журнал UPDATE');
  str := pg_temp.msg(format($q$update core.locations set rooms = 2 where id = %L$q$, f1));
  res := res || pg_temp.t(str like '23514%', 'таблица: комнаты только у помещения');

  -- 7. Копия переносит комнаты (обе pf_copy_place)
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_copy_place(f3, cp, 'эт. 3', s2);
  perform public.pf_copy_place(a5, cp2, 'кв. 5 копия');
  reset role;
  res := res || pg_temp.t((select rooms from core.locations where parent_id = cp and area = 55.20) = 2
                          and (pg_temp.loc(cp2)).rooms = 2 and (pg_temp.loc(cp2)).area = 55.20,
                          'копия этажа в другую секцию и копия рядом: площадь и комнаты перенесены');

  -- 8. Отмена загрузки: созданное и добавленное внутрь потом — удалено; бывшее до загрузки — на месте; восстановление
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_place(pn, extra, f3, 'apartment', 'кв. 77');
  v := public.pf_import_undo(b1);
  reset role;
  -- 10 созданных + кв. 77 внутри эт. 3 + копия кв. 5 рядом с ней + копия эт. 3 (с 2 кв.) внутри Секции 2 = 15
  res := res || pg_temp.t(v = 15 and pg_temp.root(pn, 'Корпус 2') is null and pg_temp.kid(k1, 'Секция 2') is null and pg_temp.kid(s1, 'эт. 3') is null
                          and (pg_temp.loc(extra)).deleted_at is not null, 'отмена: созданное загрузкой и всё добавленное внутрь потом (' || v || ')');
  res := res || pg_temp.t(pg_temp.kid(f2, 'кв. 3') is not null and (pg_temp.loc(a1)).deleted_at is null and pg_temp.kid(f2, 'кв. 4') is not null
                          and pg_temp.diff(pn) = 0, 'отмена: прежние места на месте, зеркало совпадает');
  res := res || pg_temp.t((select count(*) from core.audit_log where record_id = b1 and action = 'IMPORT_UNDO') = 1, 'журнал: IMPORT_UNDO');
  perform pg_temp.as_user(uadm, ca);
  v := public.pf_import_undo(b1);
  n1 := public.pf_restore_place(k2);
  reset role;
  res := res || pg_temp.t(v = 0 and n1 = 4 and pg_temp.root(pn, 'Корпус 2') is not null and pg_temp.diff(pn) = 0,
                          'повтор отмены — 0; Корпус 2 восстановлен веткой (' || n1 || ')');

  -- 9. Права
  perform pg_temp.as_user(ueng, ca);
  str := pg_temp.msg(format($q$select public.pf_import_places(%L, %L, %L::jsonb, true)$q$, pn, gen_random_uuid(), fa));
  res := res || pg_temp.t(str like '42501%', 'без права: предпросмотр — отказ (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_import_undo(%L)$q$, b1));
  res := res || pg_temp.t(str like '42501%', 'без права: отмена — отказ');
  str := pg_temp.msg(format($q$select public.pf_save_place_info(%L, 10, 1)$q$, a1));
  res := res || pg_temp.t(str like '42501%', 'без права: площадь — отказ');
  perform pg_temp.as_user(ub, cb);
  str := pg_temp.msg(format($q$select public.pf_import_places(%L, %L, %L::jsonb)$q$, pn, gen_random_uuid(), fa));
  res := res || pg_temp.t(str like '42501%', 'чужая компания: загрузка — отказ (' || str || ')');
  str := pg_temp.msg(format($q$select public.pf_import_undo(%L)$q$, b1));
  res := res || pg_temp.t(str like '42501%', 'чужая компания: отмена — отказ');
  str := pg_temp.msg(format($q$select public.pf_save_place_info(%L, 10, 1)$q$, a1));
  res := res || pg_temp.t(str like '42501%', 'чужая компания: площадь — отказ');
  reset role;
  res := res || pg_temp.t(not exists (select 1 from unnest(array['public.pf_import_places(uuid,uuid,jsonb,boolean)', 'public.pf_import_undo(uuid)',
                            'public.pf_save_place_info(uuid,numeric,integer)', 'public.pf_project_places(uuid,uuid)']) f
                            where has_function_privilege('anon', f::regprocedure, 'execute'))
                          and not has_function_privilege('authenticated', 'core.import_find(uuid,uuid,text,text,text)'::regprocedure, 'execute')
                          and not has_function_privilege('authenticated', 'core.place_num(text)'::regprocedure, 'execute')
                          and has_function_privilege('authenticated', 'public.pf_project_places(uuid,uuid)'::regprocedure, 'execute'),
                          'аноним: функции не вызываются; служебные — никому; список мест — вошедшим');

  -- 10. Проект 'quality' (как RBI): места ведёт Качество — загрузка в Компании — отказ, ничего не создано
  perform pg_temp.node(ca, 'obj-q50', null, 'object', 'ЖК Старый 050');
  select quality.node_root_project(q) into pq from quality.location_nodes q where q.core_company_id = ca and q.id = 'obj-q50';
  update core.projects set places_master = 'quality' where id = pq;
  perform pg_temp.node(ca, 'qb1-50', 'obj-q50', 'building', 'Корпус 1', 1);
  n0 := pg_temp.live(pq); n1 := (select count(*) from quality.location_nodes where core_company_id = ca);
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.msg(format($q$select public.pf_import_places(%L, %L, %L::jsonb)$q$, pq, gen_random_uuid(), fa));
  reset role;
  res := res || pg_temp.t(str like '42501%' and pg_temp.live(pq) = n0
                          and (select count(*) from quality.location_nodes where core_company_id = ca) = n1,
                          'проект Качества: загрузка — отказ, узлы не тронуты (' || str || ')');

  -- 11. Компания без Качества: загрузка работает, в Качество не уходит
  perform pg_temp.as_user(uc, cc);
  perform public.pf_save_project(cc, pc, '{"name": "ЖК Без Качества 050"}');
  j := public.pf_import_places(pc, gen_random_uuid(), fa);
  reset role;
  res := res || pg_temp.t((j ->> 'ok')::boolean and (j -> 'created' ->> 'objects')::int = 2 and pg_temp.live(pc) = 16
                          and (select count(*) from quality.location_nodes where core_company_id = cc) = 0 and pg_temp.bad_depth(pc) = 0,
                          'без Качества: загрузка работает (' || (j -> 'created')::text || ', мест ' || pg_temp.live(pc) || ')');

  -- 12. 5000 строк: 10 секций × 25 этажей × 20 кв. — время и зеркало
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_project(ca, pbig, '{"name": "ЖК Большой 050"}');
  fa := (select jsonb_agg(pg_temp.rw(g, 'Корпус 9', 'Секция ' || (1 + (g - 1) / 500), 'эт. ' || (1 + ((g - 1) / 20) % 25), 'кв. ' || g, null, null, '45.5', '1'))
           from generate_series(1, 5000) g);
  t0 := clock_timestamp();
  j := public.pf_import_places(pbig, gen_random_uuid(), fa, true);
  ms := (extract(epoch from clock_timestamp() - t0) * 1000)::int;
  info := info || 'INFO 5000 строк: предпросмотр ' || ms || ' мс';
  t0 := clock_timestamp();
  j := public.pf_import_places(pbig, gen_random_uuid(), fa);
  ms := (extract(epoch from clock_timestamp() - t0) * 1000)::int;
  info := info || ', загрузка ' || ms || E' мс\n';
  reset role;
  res := res || pg_temp.t(j -> 'created' = '{"objects": 1, "sections": 10, "floors": 250, "apartments": 5000}'::jsonb
                          and pg_temp.live(pbig) = 5261 and pg_temp.diff(pbig) = 0 and pg_temp.bad_depth(pbig) = 0
                          and (select max(build_no::int) from core.locations where project_id = pbig) = 5000,
                          '5000 строк: всё создано, зеркало совпадает, номера 1–5000 (' || (j -> 'created')::text || ')');
  res := res || pg_temp.t(ms < 30000, '5000 строк: загрузка быстрее 30 с (' || ms || ' мс)');

  res := info || res;
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
