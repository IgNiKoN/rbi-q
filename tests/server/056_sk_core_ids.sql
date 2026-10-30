-- P2-0076 (056): внешний СК по номерам «Компании». Сценарии: загрузка — известная фирма / категория / место подставлены, новые —
-- «не сопоставлено» («Разобрать»); шаг сопоставления (quality.sk_links_register) — известное, новое заводится, повтор не растит
-- список; выбор человека применяется ко всем замечаниям проекта с этим текстом, два написания → один контрагент, «Отменить»
-- возвращает; повторная загрузка — по выбору, «Разобрать» не растёт; подмена id с устройства — сервер ставит свои; место — только
-- своего проекта и компании; права: без «загрузки» — отказ, «своя фирма» — не сопоставляет фирмы, «Создать контрагента» — только
-- с правом «Компании»; чужая компания не видит и не пишет; прямая запись в таблицу — отказ; разовая привязка — не для учёток;
-- журнал. Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 056_sk_core_ids_up.sql.
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
create or replace function pg_temp.role(c uuid, nm text, acts text[]) returns uuid language plpgsql as $f$
declare r uuid;
begin
  insert into core.company_roles(company_id, name) values (c, nm) returning id into r;
  insert into core.company_role_permissions(role_id, company_id, action) select r, c, a from unnest(acts) a;
  return r;
end $f$;
create or replace function pg_temp.member(c uuid, r uuid, proj uuid, cp uuid) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (u, u || '@test.invalid');
  insert into core.company_members(company_id, user_id) values (c, u) on conflict do nothing;
  insert into core.role_assignments(company_id, user_id, role_id, project_id, counterparty_id) values (c, u, r, proj, cp);
  return u;
end $f$;
-- замечание загрузки (как sk.actions.js: фирма, категория, «Расположение в проекте» и его разбор)
create or replace function pg_temp.sk(p uuid, num text, craw text, cat text, path text, rname text, blk text, fl text) returns text language plpgsql as $f$
begin
  insert into quality.sk_records (id, project_code, sk_number, sk_unique_key, contractor_raw, contractor_name, category, project_raw_path,
                                  project_loc, project_raw_name, project_block, project_floor)
  values ('sk_' || p || '_' || num, p::text, num, p || '_' || num, craw, craw, cat, path, path, rname, blk, fl)
  on conflict (core_company_id, id) do update set contractor_raw = excluded.contractor_raw, contractor_name = excluded.contractor_name,
    category = excluded.category, project_raw_path = excluded.project_raw_path, project_loc = excluded.project_loc,
    project_raw_name = excluded.project_raw_name, project_block = excluded.project_block, project_floor = excluded.project_floor;
  return 'OK';
exception when others then return sqlstate || ': ' || sqlerrm;
end $f$;
create or replace function pg_temp.rec(p uuid, num text) returns quality.sk_records language sql security definer as $f$
  select * from quality.sk_records where id = 'sk_' || p || '_' || num $f$;
create or replace function pg_temp.loc(p_root uuid, p_path text[]) returns uuid language plpgsql security definer as $f$
declare cur uuid := p_root; x text;
begin
  foreach x in array p_path loop select id into cur from core.locations where parent_id = cur and name = x and deleted_at is null; end loop;
  return cur;
end $f$;
create or replace function pg_temp.pending(p uuid) returns text language sql as $f$
  select coalesce(string_agg(i ->> 'kind' || ':' || (i ->> 'text') || '=' || (i ->> 'records'), ', ' order by i ->> 'kind', i ->> 'text'), '')
    from jsonb_array_elements(quality.sk_links_list(p) -> 'items') i $f$;

do $$
declare
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  k2 uuid := gen_random_uuid(); k3 uuid := gen_random_uuid(); kx uuid := gen_random_uuid(); kb uuid := gen_random_uuid();
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); fb uuid := gen_random_uuid();
  w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); wb uuid := gen_random_uuid();
  uadm uuid; uimp uuid; uview uuid; uctr uuid; ub uuid; ucp uuid; r_adm uuid; r_imp uuid; r_view uuid; r_ctr uuid;
  res text := ''; e text; j jsonb; v text; n int; t0 timestamptz;
begin
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 056', true), (cb, 'Бета 056', true);
  insert into core.company_modules(company_id, module, enabled)
    select x, m, true from unnest(array[ca, cb]) x, unnest(array['quality', 'planfact']) m
    on conflict (company_id, module) do update set enabled = true;
  r_adm := pg_temp.role(ca, 'Админ 056', array['planfact.projects.manage']);
  uadm := pg_temp.member(ca, r_adm, null, null);
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_project(ca, p1, '{"name": "ЖК-1 056"}');
  perform public.pf_save_project(ca, p2, '{"name": "ЖК-2 056"}');
  perform public.pf_save_place(p1, k2, null, 'object', 'Корпус 2', 'building');
  perform public.pf_fill_object(k2, 2, 6, 1);
  perform public.pf_save_place(p1, k3, null, 'object', 'Корпус 3', 'building');
  perform public.pf_save_place(p2, kx, null, 'object', 'Корпус 9', 'building');
  perform public.pf_fill_object(kx, 1, 3, 1);
  reset role;
  r_adm := pg_temp.role(cb, 'Админ Б 056', array['planfact.projects.manage']);
  perform pg_temp.as_user(pg_temp.member(cb, r_adm, null, null), cb);
  perform public.pf_save_project(cb, pb, '{"name": "ЖК-Б 056"}');
  perform public.pf_save_place(pb, kb, null, 'object', 'Корпус 2', 'building');
  perform public.pf_fill_object(kb, 1, 6, 1);
  reset role;
  insert into core.counterparties(id, company_id, name, inn, kinds) values
    (f1, ca, 'ООО Ромашка 056', '7700000561', array['contractor']), (f2, ca, 'Лютик 056', '7700000562', array['contractor']),
    (fb, cb, 'ООО Ромашка 056', '7700000569', array['contractor']);
  insert into core.work_types(id, company_id, name, canon_name) values
    (w1, ca, 'Кладочные работы', 'кладочные работы'), (w2, ca, 'Отделка', 'отделка'), (wb, cb, 'Кладочные работы', 'кладочные работы');
  r_imp := pg_temp.role(ca, 'Инженер СК 056', array['quality.sk.view', 'quality.sk.import']);
  r_view := pg_temp.role(ca, 'Смотрит СК 056', array['quality.sk.view']);
  r_ctr := pg_temp.role(ca, 'Подрядчик СК 056', array['quality.scope.contractor', 'quality.sk.view', 'quality.sk.import']);
  uimp := pg_temp.member(ca, r_imp, p1, null);
  uview := pg_temp.member(ca, r_view, p1, null);
  uctr := pg_temp.member(ca, r_ctr, p1, f1);
  ucp := pg_temp.member(ca, pg_temp.role(ca, 'ПТО 056', array['quality.sk.view', 'quality.sk.import', 'core.counterparties.manage']), null, null);
  ub := pg_temp.member(cb, pg_temp.role(cb, 'Инженер Б 056', array['quality.sk.view', 'quality.sk.import']), null, null);

  -- 1. Загрузка: известное подставлено, новое — «не сопоставлено»
  perform pg_temp.as_user(uimp, ca);
  res := res || pg_temp.t(pg_temp.sk(p1, '1', 'ООО Ромашка 056', 'Кладочные работы', 'Корпус 2, секция 1, этаж 5', 'Корпус 2, секция 1, этаж 5', 'Общее', '') = 'OK'
                          and pg_temp.sk(p1, '2', 'Ромашка (ООО) 056', 'Непонятная 056', 'ЖК-1 056/Корпус 2/Секция 2/3', 'Корпус 2', 'Секция 2', '3') = 'OK'
                          and pg_temp.sk(p1, '3', 'Ромашка (ООО) 056', 'Без категории', 'Склад 056', 'Склад 056', 'Общее', '') = 'OK',
                          'загрузка трёх замечаний инженером с правом «загрузка»');
  res := res || pg_temp.t((pg_temp.rec(p1, '1')).core_counterparty_id = f1 and (pg_temp.rec(p1, '1')).core_work_type_id = w1
                          and (pg_temp.rec(p1, '1')).core_location_id = pg_temp.loc(k2, array['Секция 1', 'эт. 5']), '№1: фирма, вид работ, этаж — подставлены');
  res := res || pg_temp.t((pg_temp.rec(p1, '2')).core_counterparty_id is null and (pg_temp.rec(p1, '2')).core_work_type_id is null
                          and (pg_temp.rec(p1, '2')).core_location_id = pg_temp.loc(k2, array['Секция 2', 'эт. 3']), '№2: новые фирма и категория — пусто, место — этаж');
  v := pg_temp.pending(p1);
  res := res || pg_temp.t(v = 'category:Непонятная 056=1, contractor:Ромашка (ООО) 056=2, place:Склад 056=1', '«Разобрать» после загрузки: ' || v);
  j := quality.sk_links_list(p1);
  res := res || pg_temp.t((j ->> 'can_edit')::boolean and (j ->> 'can_edit_contractor')::boolean and not (j ->> 'can_create_counterparty')::boolean,
                          'права экрана с сервера: правка — да, «Создать контрагента» — нет (нет права «Компании»)');

  -- 2. Шаг сопоставления при загрузке: известное, новое заводится, повтор не растит список
  j := quality.sk_links_register(p1, jsonb_build_array(
    jsonb_build_object('kind', 'contractor', 'text', 'ООО Ромашка 056'), jsonb_build_object('kind', 'contractor', 'text', 'Новая фирма 056'),
    jsonb_build_object('kind', 'category', 'text', 'кладочные  работы'), jsonb_build_object('kind', 'category', 'text', 'Без категории'),
    jsonb_build_object('kind', 'place', 'text', 'ЖК-1 056/Корпус 2/Секция 1/4', 'project_raw_name', 'Корпус 2', 'project_block', 'Секция 1', 'project_floor', '4')));
  res := res || pg_temp.t(jsonb_array_length(j) = 4, 'шаг сопоставления: «Без категории» пропущена — 4 ответа');
  res := res || pg_temp.t((j -> 0 ->> 'target')::uuid = f1 and j -> 0 ->> 'matched_by' = 'auto' and j -> 1 ->> 'target' is null
                          and (j -> 2 ->> 'target')::uuid = w1 and (j -> 3 ->> 'target')::uuid = pg_temp.loc(k2, array['Секция 1', 'эт. 4']),
                          'шаг сопоставления: известное узнано (фирма, вид работ в другом регистре, этаж), новая фирма — пусто');
  n := jsonb_array_length(quality.sk_links_list(p1) -> 'items');
  perform quality.sk_links_register(p1, jsonb_build_array(jsonb_build_object('kind', 'contractor', 'text', 'Новая фирма 056')));
  res := res || pg_temp.t(jsonb_array_length(quality.sk_links_list(p1) -> 'items') = n, 'повтор шага — «Разобрать» не растёт');
  res := res || pg_temp.t(exists (select 1 from quality.sk_links where source_text = 'Новая фирма 056' and counterparty_id is null),
                          'новая фирма заведена в соответствия без записи ядра');
  res := res || pg_temp.t(not exists (select 1 from core.counterparties where name like 'Новая фирма%') , 'в ядре ничего не создано само');

  -- 3. Выбор человека: ко всем замечаниям с этим текстом; два написания → один контрагент; «Отменить»
  t0 := (pg_temp.rec(p1, '2')).updated_at;
  j := quality.sk_link_set(p1, 'contractor', 'Ромашка (ООО) 056', f1);
  res := res || pg_temp.t((j ->> 'records')::int = 2 and (j ->> 'target')::uuid = f1 and j ->> 'previous' is null and j ->> 'matched_by' = 'person',
                          'выбор: применён к 2 замечаниям — ' || j::text);
  res := res || pg_temp.t((pg_temp.rec(p1, '2')).core_counterparty_id = f1 and (pg_temp.rec(p1, '3')).core_counterparty_id = f1
                          and (select count(distinct core_counterparty_id) from quality.sk_records where core_project_id = p1) = 1,
                          'два написания фирмы — один контрагент');
  res := res || pg_temp.t((pg_temp.rec(p1, '2')).updated_at > t0 or (pg_temp.rec(p1, '2')).updated_at = now(), 'время правки обновлено — устройства подтянут');
  res := res || pg_temp.t(pg_temp.pending(p1) not like '%Ромашка%', '«Разобрать»: текст ушёл из списка');
  reset role;
  res := res || pg_temp.t((select count(*) from core.audit_log where company_id = ca and table_name = 'quality.sk_links' and actor = uimp) = 1, 'журнал: кто и когда');
  perform pg_temp.as_user(uimp, ca);
  j := quality.sk_link_set(p1, 'contractor', 'Ромашка (ООО) 056', null);
  res := res || pg_temp.t((j ->> 'previous')::uuid = f1 and j ->> 'target' is null and (pg_temp.rec(p1, '2')).core_counterparty_id is null
                          and pg_temp.pending(p1) like '%Ромашка (ООО) 056=2%', '«Отменить»: вернулось «не сопоставлено»');
  perform quality.sk_link_set(p1, 'contractor', 'Ромашка (ООО) 056', f1);
  -- повторная загрузка того же файла: по выбору, список не растёт
  n := jsonb_array_length(quality.sk_links_list(p1) -> 'items');
  res := res || pg_temp.t(pg_temp.sk(p1, '2', 'Ромашка (ООО) 056', 'Непонятная 056', 'ЖК-1 056/Корпус 2/Секция 2/3', 'Корпус 2', 'Секция 2', '3') = 'OK'
                          and pg_temp.sk(p1, '4', 'ромашка (ооо)  056', 'Отделка', 'Корпус 2/Секция 1/99', 'Корпус 2', 'Секция 1', '99') = 'OK'
                          and (pg_temp.rec(p1, '2')).core_counterparty_id = f1 and (pg_temp.rec(p1, '4')).core_counterparty_id = f1
                          and jsonb_array_length(quality.sk_links_list(p1) -> 'items') = n,
                          'повторная загрузка: выбор действует (и в другом регистре), «Разобрать» не растёт');
  res := res || pg_temp.t((pg_temp.rec(p1, '4')).core_work_type_id = w2 and (pg_temp.rec(p1, '4')).core_location_id = pg_temp.loc(k2, array['Секция 1']),
                          'этажа нет — остаётся секция');
  -- подмена id с устройства: сервер ставит по соответствиям
  update quality.sk_records set core_work_type_id = w2, core_location_id = kx where id = 'sk_' || p1 || '_1';
  res := res || pg_temp.t((pg_temp.rec(p1, '1')).core_work_type_id = w1 and (pg_temp.rec(p1, '1')).core_location_id = pg_temp.loc(k2, array['Секция 1', 'эт. 5']),
                          'подмена id с устройства — сервер вернул свои');
  -- место: только своего проекта и компании; категория → вид работ
  res := res || pg_temp.t(pg_temp.err(format('select quality.sk_link_set(%L, ''place'', ''Склад 056'', %L)', p1, kx)) like '22023%',
                          'место другого проекта — отказ: ' || pg_temp.err(format('select quality.sk_link_set(%L, ''place'', ''Склад 056'', %L)', p1, kx)));
  res := res || pg_temp.t(pg_temp.err(format('select quality.sk_link_set(%L, ''place'', ''Склад 056'', %L)', p1, kb)) like '22023%', 'место чужой компании — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select quality.sk_link_set(%L, ''contractor'', ''Ромашка (ООО) 056'', %L)', p1, fb)) like '22023%',
                          'контрагент чужой компании — отказ');
  j := quality.sk_link_set(p1, 'place', 'Склад 056', k3);
  res := res || pg_temp.t((pg_temp.rec(p1, '3')).core_location_id = k3 and (j ->> 'records')::int = 1, 'место выбрано вручную — корпус');
  j := quality.sk_link_set(p1, 'category', 'Непонятная 056', w2);
  res := res || pg_temp.t((pg_temp.rec(p1, '2')).core_work_type_id = w2, 'категория → вид работ');
  res := res || pg_temp.t(pg_temp.err('select quality.sk_link_set(''' || p1 || ''', ''x'', ''a'', null)') like '22023%', 'неизвестный вид — отказ');
  -- выбор человека главнее автоподбора: категория «Кладочные работы» → «Отделка»
  perform quality.sk_link_set(p1, 'category', 'Кладочные работы', w2);
  res := res || pg_temp.t((pg_temp.rec(p1, '1')).core_work_type_id = w2, 'выбор человека главнее автоподбора');
  perform quality.sk_link_set(p1, 'category', 'Кладочные работы', null);
  res := res || pg_temp.t((pg_temp.rec(p1, '1')).core_work_type_id = w1, '«Отменить» выбор — вернулся автоподбор');
  -- 4. Прямая запись в таблицу — только функциями
  res := res || pg_temp.t(pg_temp.err(format('insert into quality.sk_links(company_id, project_id, kind, source_key, source_text) values (%L, %L, ''contractor'', ''x'', ''x'')', ca, p1)) like '42501%',
                          'прямая вставка — отказ');
  res := res || pg_temp.t(pg_temp.err('update quality.sk_links set counterparty_id = null') like '42501%', 'прямая правка — отказ');
  res := res || pg_temp.t(pg_temp.err('select quality.sk_links_backfill(false)') like '42501%', 'разовая привязка — не для учёток');
  res := res || pg_temp.t(pg_temp.err(format('select quality.sk_link_resolve(%L, %L, ''contractor'', ''x'', null, true)', ca, p1)) like '42501%', 'служебная функция — не для учёток');
  j := quality.sk_core_choices(p1);
  res := res || pg_temp.t(jsonb_array_length(j -> 'counterparties') = 2 and jsonb_array_length(j -> 'work_types') = 2
                          and exists (select 1 from jsonb_array_elements(j -> 'places') x where x ->> 'name' = 'Корпус 2 / Секция 1 / эт. 5')
                          and not exists (select 1 from jsonb_array_elements(j -> 'places') x where x ->> 'type' = 'apartment' or x ->> 'name' like 'Корпус 9%'),
                          'выбор: контрагенты и виды работ компании, места проекта до этажа');

  -- 5. Права
  perform pg_temp.as_user(uview, ca);
  res := res || pg_temp.t(jsonb_array_length(quality.sk_links_list(p1) -> 'items') = 0 and jsonb_array_length(quality.sk_links_list(p1, true) -> 'items') >= 5
                          and not (quality.sk_links_list(p1) ->> 'can_edit')::boolean, 'просмотр: всё разобрано, сопоставленные видны, правки нет');
  e := pg_temp.err(format('select quality.sk_link_set(%L, ''category'', ''Непонятная 056'', null)', p1));
  res := res || pg_temp.t(e like '42501%«Внешний СК: загрузка%', 'без права «загрузка» — отказ: ' || e);
  res := res || pg_temp.t(pg_temp.err(format('select quality.sk_links_register(%L, ''[]'')', p1)) like '42501%', 'шаг сопоставления без права — отказ');
  res := res || pg_temp.t((select count(*) from quality.sk_links where project_id = p1) > 0, 'просмотр: таблица соответствий читается');
  perform pg_temp.as_user(uctr, ca);
  e := pg_temp.err(format('select quality.sk_link_set(%L, ''contractor'', ''Новая фирма 056'', %L)', p1, f2));
  res := res || pg_temp.t(e like '42501%', '«своя фирма» — фирмы не сопоставляет: ' || e);
  res := res || pg_temp.t(not (quality.sk_links_list(p1) ->> 'can_edit_contractor')::boolean, '«своя фирма»: экран не предлагает выбор фирмы');
  res := res || pg_temp.t(pg_temp.err(format('select quality.sk_link_set(%L, ''place'', ''Склад 056'', %L)', p1, k2)) = 'OK', '«своя фирма»: место — можно');
  perform pg_temp.as_user(ucp, ca);
  res := res || pg_temp.t((quality.sk_links_list(p1) ->> 'can_create_counterparty')::boolean, 'с правом «Компании» — «Создать контрагента» доступно');

  -- 6. Чужая компания
  perform pg_temp.as_user(ub, cb);
  res := res || pg_temp.t((select count(*) from quality.sk_links) = 0, 'Б: соответствия А не видны');
  e := pg_temp.err(format('select quality.sk_links_list(%L)', p1));
  res := res || pg_temp.t(e like '42501%', 'Б: «Разобрать» проекта А — отказ: ' || e);
  res := res || pg_temp.t(pg_temp.err(format('select quality.sk_link_set(%L, ''contractor'', ''x'', null)', p1)) like '42501%', 'Б: запись в проект А — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select quality.sk_core_choices(%L)', p1)) like '42501%', 'Б: записи ядра А — отказ');
  perform pg_temp.as_user(ub, ca);
  res := res || pg_temp.t(pg_temp.err(format('select quality.sk_links_list(%L)', p1)) like '42501%', 'Б с заголовком компании А — отказ');
  perform pg_temp.as_user(ub, cb);
  res := res || pg_temp.t(pg_temp.sk(pb, '1', 'ООО Ромашка 056', 'Кладочные работы', 'Корпус 2, секция 1, этаж 2', 'Корпус 2, секция 1, этаж 2', 'Общее', '') = 'OK'
                          and (pg_temp.rec(pb, '1')).core_counterparty_id = fb and (pg_temp.rec(pb, '1')).core_work_type_id = wb
                          and (pg_temp.rec(pb, '1')).core_location_id = pg_temp.loc(kb, array['Секция 1', 'эт. 2']), 'Б: те же тексты — свои записи ядра');
  reset role;
  raise exception E'%FAIL всего: %', res, (length(res) - length(replace(res, 'FAIL ', ''))) / 5 using errcode = 'P0001';
end $$;
