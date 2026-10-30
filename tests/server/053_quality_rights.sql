-- P2-0071 (053): Качество на единый механизм прав. Сценарии: каталог (действия, группы, признак «запись без места») и шаблоны;
-- инженер объекта ЖК-1 видит все записи ЖК-1 и не видит ЖК-2; без «Видеть все проверки» — только свои; участник секции видит
-- все записи объекта без места и правит только свои; отказ сервера с текстом (чужая задача, удаление без права, проверка на
-- чужом объекте), в том числе upsert-ом в обход экрана; исполнитель выполняет порученную задачу, но не переназначает;
-- подрядчик — только своя фирма; «без объектов» — общие разделы без записей объектов; запись без объекта — автор и назначенные
-- на всю компанию; пункты проверки — по своей проверке; совещания и внешний СК (этап 2) — по объекту и своей группе действий; назначение: «объекты Качества» не принимаются, роль Качества
-- назначается на объект; изоляция: чужая компания, модуль выключен. Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N».
-- Запуск: после 053_quality_rights_up.sql.
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
-- какие записи таблицы (из засева -m71) видит текущий пользователь
create or replace function pg_temp.vis(tbl text) returns text language plpgsql as $f$
declare s text;
begin
  execute format('select coalesce(string_agg(split_part(id, ''-'', 1), '','' order by id collate "C"), '''') from quality.%I where id like ''%%-m71''', tbl) into s;
  return s;
exception when others then return 'ERR:' || sqlstate; end $f$;
create or replace function pg_temp.role(c uuid, nm text, acts text[]) returns uuid language plpgsql as $f$
declare r uuid;
begin
  insert into core.company_roles(company_id, name) values (c, nm) returning id into r;
  insert into core.company_role_permissions(role_id, company_id, action) select r, c, a from unnest(acts) a;
  return r;
end $f$;
create or replace function pg_temp.member(c uuid, r uuid, proj uuid, loc uuid, cp uuid) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (u, u || '@test.invalid');
  insert into core.company_members(company_id, user_id) values (c, u) on conflict do nothing;
  insert into core.role_assignments(company_id, user_id, role_id, project_id, location_id, counterparty_id) values (c, u, r, proj, loc, cp);
  return u;
end $f$;

do $$
declare
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); cq uuid := gen_random_uuid(); cont uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); k1 uuid := gen_random_uuid(); f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid();
  uadm uuid; ueng uuid; uown uuid; usec uuid; uctr uuid; unone uuid; ucomp uuid; ub uuid; uq uuid; uboss uuid;
  r_adm uuid; r_eng uuid; r_own uuid; r_ctr uuid; r_boss uuid; s1loc uuid; po1 text; res text := ''; e text;
  v_new text[] := array['quality.inspections.view', 'quality.inspections.create', 'quality.inspections.edit_any', 'quality.inspections.delete',
    'quality.tasks.view', 'quality.tasks.create', 'quality.tasks.work', 'quality.tasks.edit_any', 'quality.tasks.delete',
    'quality.meetings.view', 'quality.meetings.edit', 'quality.method.view', 'quality.method.edit', 'quality.reports.view',
    'quality.reports.edit', 'quality.sk.view', 'quality.sk.import'];
  v_eng text[] := array['quality.view', 'quality.edit', 'quality.inspections.view', 'quality.inspections.create', 'quality.inspections.delete',
    'quality.tasks.view', 'quality.tasks.create', 'quality.tasks.work', 'quality.tasks.delete'];
begin
  -- 0. Каталог и шаблоны
  res := res || pg_temp.t((select count(*) from core.permission_catalog where action = any(v_new) and module = 'quality' and area_scoped
                            and label is not null) = 17, 'каталог: 17 действий Качества с подписью, по участию');
  res := res || pg_temp.t((select count(*) from core.permission_catalog where unplaced = 'all') = 6
                          and (select count(*) from core.permission_catalog where unplaced = 'own') = 9, 'каталог: признак «запись без места»');
  res := res || pg_temp.t(not exists (select 1 from core.permission_catalog where module <> 'quality' and unplaced is not null),
                          'признак — только у Качества (Стройконтроль и План/Факт — как 052)');
  res := res || pg_temp.t((select count(distinct sort) = count(*) from core.permission_catalog), 'каталог: порядок без повторов');
  res := res || pg_temp.t((select count(*) from core.role_template_permissions where template_code = 'qc_engineer' and action = any(v_new)) = 15,
                          'шаблон «Инженер»: видеть, проводить, ставить, выполнять, вести, удалять — без «Редактирование чужих»');
  res := res || pg_temp.t((select count(*) from core.role_template_permissions where template_code = 'company_admin' and action = any(v_new)) = 17,
                          'шаблон «Администратор компании»: все 17');
  res := res || pg_temp.t((select array_agg(action order by action) from core.role_template_permissions where template_code = 'contractor_rep'
                            and action = any(v_new)) = array['quality.inspections.view', 'quality.meetings.view', 'quality.method.view',
                            'quality.reports.view', 'quality.sk.view', 'quality.tasks.view'], 'шаблон «Подрядчик»: только видеть');
  res := res || pg_temp.t(exists (select 1 from core.permission_catalog where action = 'quality.edit' and group_name = 'База знаний и справочники'),
                          'прежние ключи — «База знаний и справочники»');

  -- засев: А — два объекта (ЖК-1 с секциями), контейнер; Б — чужая; В — Качество выключено
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 053т', true), (cb, 'Бета 053т', true), (cq, 'Без Качества 053т', true);
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction', 'planfact']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_modules(company_id, module, enabled) values (cq, 'quality', false) on conflict (company_id, module) do update set enabled = false;
  insert into core.projects(id, company_id, name, quality_container) values (cont, ca, 'Контейнер 053т', true);
  insert into core.counterparties(id, company_id, name, inn, kinds) values
    (f1, ca, 'ООО Ромашка 053т', '7700000711', array['contractor']), (f2, ca, 'Лютик 053т', '7700000712', array['contractor']);
  r_adm := pg_temp.role(ca, 'Админ 053т', array['planfact.projects.manage', 'security.roles.assign']);
  uadm := pg_temp.member(ca, r_adm, null, null, null);
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_project(ca, p1, '{"name": "ЖК-1 053т"}');
  perform public.pf_save_project(ca, p2, '{"name": "ЖК-2 053т"}');
  perform public.pf_save_place(p1, k1, null, 'object', 'Корпус 1', 'building');
  perform public.pf_fill_object(k1, 2, 1, 1);
  reset role;
  select l.id into s1loc from core.locations l where l.parent_id = k1 and l.name = 'Секция 1';
  select po.id into po1 from quality.project_objects po where po.core_company_id = ca and po.core_object_id = p1;

  r_eng := pg_temp.role(ca, 'Инженер 053т', v_eng);
  r_own := pg_temp.role(ca, 'Только свои 053т', array['quality.view', 'quality.edit', 'quality.inspections.create', 'quality.tasks.create',
                                                     'quality.tasks.work']);
  r_ctr := pg_temp.role(ca, 'Подрядчик 053т', array['quality.view', 'quality.scope.contractor', 'quality.inspections.view', 'quality.tasks.view',
                                                    'quality.tasks.work']);
  r_boss := pg_temp.role(ca, 'Руководитель 053т', array['quality.view', 'quality.edit', 'quality.manage'] || v_new);
  ueng := pg_temp.member(ca, r_eng, p1, null, null);
  uown := pg_temp.member(ca, r_own, p1, null, null);
  usec := pg_temp.member(ca, r_eng, p1, s1loc, null);
  uctr := pg_temp.member(ca, r_ctr, p1, null, f1);
  unone := pg_temp.member(ca, r_eng, cont, null, null);          -- «без объектов»
  ucomp := pg_temp.member(ca, r_eng, null, null, null);          -- все объекты
  uboss := pg_temp.member(ca, r_boss, p1, null, null);
  ub := pg_temp.member(cb, pg_temp.role(cb, 'Инженер Б', v_eng), null, null, null);
  uq := pg_temp.member(cq, pg_temp.role(cq, 'Инженер В', v_eng), null, null, null);

  -- записи (сервером: объект и фирма — прямо; автор — из строки, без входа set_author его не подменяет)
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('quality.object_bind', '1', true);
  insert into quality.rbi_inspections(id, core_company_id, project_code, core_object_id, core_created_by, core_counterparty_id, template_title) values
    ('a1-m71', ca, cont::text, p1, ueng, f1, 'т'), ('a2-m71', ca, cont::text, p1, ucomp, f2, 'т'), ('b1-m71', ca, cont::text, p2, ucomp, f1, 'т'),
    ('n1-m71', ca, cont::text, null, ueng, null, 'т'), ('s1-m71', ca, cont::text, p1, usec, null, 'т');
  insert into quality.rbi_inspection_items(id, inspection_id, project_code, item_id, core_company_id, core_created_by, core_object_id) values
    ('a1i-m71', 'a1-m71', cont::text, 'п1', ca, ueng, p1), ('b1i-m71', 'b1-m71', cont::text, 'п1', ca, ucomp, p2);
  insert into quality.rbi_tasks(id, core_company_id, project_code, core_object_id, core_created_by, assigned_to_auth_user_id, core_counterparty_id, title, status) values
    ('t1-m71', ca, cont::text, p1, uboss, ueng, f1, 'т', 'pending'), ('t2-m71', ca, cont::text, p1, uboss, null, null, 'т', 'pending'),
    ('t3-m71', ca, cont::text, p2, ucomp, null, null, 'т', 'pending'), ('t4-m71', ca, cont::text, p1, ucomp, uown, null, 'т', 'pending');
  insert into quality.project_meetings(id, core_company_id, project_code, core_object_id, core_created_by, data) values
    ('m1-m71', ca, cont::text, p1, uboss, '{}'), ('m2-m71', ca, cont::text, p2, ucomp, '{}'), ('m3-m71', ca, cont::text, p1, usec, '{}');
  insert into quality.sk_records(id, core_company_id, project_code, sk_number, sk_unique_key, core_object_id, core_created_by, core_counterparty_id, text) values
    ('k1-m71', ca, cont::text, '1', 'k1', p1, ucomp, f1, 'т'), ('k2-m71', ca, cont::text, '2', 'k2', p2, ucomp, f2, 'т');
  perform set_config('quality.object_bind', '', true);
  insert into quality.shared_etalons(id, core_company_id, project_code, data) values ('e1-m71', ca, cont::text, '{}');

  -- 1. Инженер ЖК-1: видит всё на ЖК-1 (и своё без объекта), ЖК-2 — нет
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.vis('rbi_inspections') = 'a1,a2,n1,s1', 'инженер ЖК-1: проверки ЖК-1 и своя без объекта — ' || pg_temp.vis('rbi_inspections'));
  res := res || pg_temp.t(pg_temp.vis('rbi_inspection_items') = 'a1i', 'инженер ЖК-1: пункты только своих проверок');
  res := res || pg_temp.t(pg_temp.vis('rbi_tasks') = 't1,t2,t4', 'инженер ЖК-1: задачи ЖК-1 — ' || pg_temp.vis('rbi_tasks'));
  res := res || pg_temp.t(pg_temp.vis('shared_etalons') = 'e1', 'инженер ЖК-1: общие разделы (эталоны)');
  res := res || pg_temp.t(pg_temp.err('update quality.rbi_inspections set template_title = ''m'' where id = ''a1-m71''') = 'OK', 'своя проверка правится');
  e := pg_temp.err('update quality.rbi_inspections set template_title = ''m'' where id = ''a2-m71''');
  res := res || pg_temp.t(e like '42501%Проверки: редактирование чужих%ЖК-1 053т%' and (select template_title from quality.rbi_inspections where id = 'a2-m71') = 'т',
                          'чужая проверка — отказ с текстом — ' || e);
  e := pg_temp.err('insert into quality.rbi_inspections(id, core_company_id, project_code, template_title, core_created_by) values '
                   || format('(%L, %L, %L, ''x'', %L) on conflict (core_company_id, id) do update set template_title = ''x''', 'a2-m71', ca, cont, ueng));
  res := res || pg_temp.t(e like '42501%', 'upsert чужой проверки в обход экрана — отказ — ' || e);
  e := pg_temp.err(format('insert into quality.rbi_inspections(id, core_company_id, project_code, "projectId", template_title) values (''x1-z71'', %L, %L, %L, ''x'')',
                          ca, cont, (select id from quality.project_objects where core_object_id = p2)));
  res := res || pg_temp.t(e like '42501%' and e like '%Проверки: создание%ЖК-2 053т%', 'проверка на чужом объекте — отказ с текстом — ' || e);
  res := res || pg_temp.t(pg_temp.err(format('insert into quality.rbi_inspections(id, core_company_id, project_code, "projectId", template_title) values (''x2-z71'', %L, %L, %L, ''x'')',
                          ca, cont, po1)) = 'OK', 'проверка на своём объекте — можно');
  e := pg_temp.err('update quality.rbi_tasks set status = ''done'' where id = ''t2-m71''');
  res := res || pg_temp.t(e like '42501%' and e like '%Задачи: редактирование чужих%', 'чужая задача без «Редактирование чужих» — отказ с текстом — ' || e);
  res := res || pg_temp.t(pg_temp.err('update quality.rbi_tasks set status = ''done'' where id = ''t1-m71''') = 'OK', 'исполнитель выполняет порученную задачу');
  e := pg_temp.err(format('update quality.rbi_tasks set assigned_to_auth_user_id = %L where id = ''t1-m71''', uown));
  res := res || pg_temp.t(e like '42501%', 'исполнитель не переназначает задачу — ' || e);
  res := res || pg_temp.t(pg_temp.err('update quality.rbi_inspections set is_deleted = true where id = ''a1-m71''') = 'OK', 'своя проверка удаляется (пометкой)');
  reset role;

  -- 2. Только свои (без «Видеть все»): свои и порученные; удалять без права — отказ
  perform pg_temp.as_user(uown, ca);
  res := res || pg_temp.t(pg_temp.vis('rbi_inspections') = '' and pg_temp.vis('rbi_tasks') = 't4', 'без «Видеть все»: только своё и порученное — '
                          || pg_temp.vis('rbi_inspections') || '/' || pg_temp.vis('rbi_tasks'));
  e := pg_temp.err('delete from quality.rbi_tasks where id = ''t4-m71''');
  res := res || pg_temp.t(e like '42501%Задачи: удаление%' and exists (select 1 from quality.rbi_tasks where id = 't4-m71'),
                          'удалить порученную без «Удалять задачи» — отказ с текстом — ' || e);
  e := pg_temp.err('update quality.rbi_tasks set is_deleted = true where id = ''t4-m71''');
  res := res || pg_temp.t(e like '42501%' and e like '%Задачи: удаление%', 'пометка удаления без права — отказ с текстом — ' || e);
  reset role;

  -- 3. Участник секции: все записи объекта без места — видит, правит только свои
  perform pg_temp.as_user(usec, ca);
  res := res || pg_temp.t(pg_temp.vis('rbi_inspections') = 'a1,a2,s1', 'секция: все проверки объекта без места — ' || pg_temp.vis('rbi_inspections'));
  e := pg_temp.err('update quality.rbi_inspections set template_title = ''m'' where id = ''s1-m71''');
  res := res || pg_temp.t(e = 'OK' and (select template_title from quality.rbi_inspections where id = 's1-m71') = 'm', 'секция: своя правится — ' || e);
  perform pg_temp.err('update quality.rbi_inspections set template_title = ''m'' where id = ''a2-m71''');
  res := res || pg_temp.t((select template_title from quality.rbi_inspections where id = 'a2-m71') = 'т', 'секция: чужая не правится');
  reset role;

  -- 4. Подрядчик: только своя фирма
  perform pg_temp.as_user(uctr, ca);
  res := res || pg_temp.t(pg_temp.vis('rbi_inspections') = 'a1' and pg_temp.vis('rbi_tasks') = 't1', 'подрядчик F1: только своя фирма — '
                          || pg_temp.vis('rbi_inspections') || '/' || pg_temp.vis('rbi_tasks'));
  reset role;

  -- 5. Без объектов: общие разделы есть, записей объектов нет, проверку не провести
  perform pg_temp.as_user(unone, ca);
  res := res || pg_temp.t(pg_temp.vis('rbi_inspections') = '' and pg_temp.vis('rbi_tasks') = '' and pg_temp.vis('shared_etalons') = 'e1',
                          'без объектов: только общие разделы — ' || pg_temp.vis('rbi_inspections') || '/' || pg_temp.vis('shared_etalons'));
  e := pg_temp.err(format('insert into quality.rbi_inspections(id, core_company_id, project_code, "projectId", template_title) values (''x3-z71'', %L, %L, %L, ''x'')',
                          ca, cont, po1));
  res := res || pg_temp.t(e like '42501%', 'без объектов: проверку не провести — ' || e);
  e := pg_temp.err(format('insert into quality.rbi_inspections(id, core_company_id, project_code, project_display_name, template_title) values (''x4-z71'', %L, %L, ''Неизвестный 053т'', ''x'')',
                          ca, cont));
  res := res || pg_temp.t(e like '42501%', 'без объектов: и на неизвестном объекте — нет — ' || e);
  reset role;

  -- 6. Все объекты: видит всё, в т. ч. без объекта
  perform pg_temp.as_user(ucomp, ca);
  res := res || pg_temp.t(pg_temp.vis('rbi_inspections') = 'a1,a2,b1,n1,s1' and pg_temp.vis('rbi_inspection_items') = 'a1i,b1i',
                          'все объекты: всё — ' || pg_temp.vis('rbi_inspections'));
  reset role;

  -- 7. Руководитель объекта: правит чужие на своём объекте
  perform pg_temp.as_user(uboss, ca);
  e := pg_temp.err('update quality.rbi_tasks set status = ''done'' where id = ''t4-m71''');
  res := res || pg_temp.t(e = 'OK' and (select status from quality.rbi_tasks where id = 't4-m71') = 'done', 'руководитель: чужая задача закрывается — ' || e);
  res := res || pg_temp.t(pg_temp.vis('rbi_inspections') = 'a1,a2,s1', 'руководитель ЖК-1: только ЖК-1 — ' || pg_temp.vis('rbi_inspections'));
  reset role;

  -- 8. Изоляция: чужая компания; модуль выключен
  perform pg_temp.as_user(ub, cb);
  res := res || pg_temp.t(pg_temp.vis('rbi_inspections') = '' and pg_temp.vis('rbi_tasks') = '', 'чужая компания: пусто');
  reset role;
  perform pg_temp.as_user(ub, ca);
  res := res || pg_temp.t(pg_temp.vis('rbi_inspections') = '', 'чужая компания с заголовком А: пусто');
  reset role;
  perform pg_temp.as_user(uq, cq);
  res := res || pg_temp.t(not quality.has_anywhere(cq, '{quality.inspections.create}', null), 'Качество выключено: действий нет');
  reset role;
  update core.company_modules set enabled = false where company_id = ca and module = 'quality';
  perform pg_temp.as_user(ucomp, ca);
  res := res || pg_temp.t(pg_temp.vis('rbi_inspections') = '', 'модуль выключен у компании: записей нет');
  reset role;
  update core.company_modules set enabled = true where company_id = ca and module = 'quality';

  -- 9а. Этап 2: совещания и внешний СК — по объекту; часть объекта — видит всё без места, правит своё; подрядчик — своя фирма
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.vis('project_meetings') = '' and pg_temp.vis('sk_records') = '', 'роль без галочек совещаний и внешнего СК — их не видит — '
                          || pg_temp.vis('project_meetings') || '/' || pg_temp.vis('sk_records'));
  reset role;
  perform pg_temp.as_user(usec, ca);
  perform pg_temp.err('update quality.project_meetings set data = ''{"m": 1}'' where id in (''m1-m71'', ''m3-m71'')');
  res := res || pg_temp.t((select string_agg(id, ',' order by id) from quality.project_meetings where id like '%-m71' and data = '{"m": 1}') is null,
                          'секция: без «Совещания: редактирование» — не правит');
  reset role;
  perform pg_temp.as_user(uboss, ca);
  res := res || pg_temp.t(pg_temp.vis('project_meetings') = 'm1,m3' and pg_temp.vis('sk_records') = 'k1', 'руководитель ЖК-1: совещания и СК ЖК-1 — '
                          || pg_temp.vis('project_meetings') || '/' || pg_temp.vis('sk_records'));
  perform pg_temp.err('update quality.project_meetings set data = ''{"m": 2}'' where id = ''m3-m71''');
  res := res || pg_temp.t((select data from quality.project_meetings where id = 'm3-m71') = '{"m": 2}', 'руководитель: чужое совещание объекта правит');
  reset role;
  insert into core.company_role_permissions(role_id, company_id, action) values (r_eng, ca, 'quality.meetings.view'), (r_eng, ca, 'quality.meetings.edit');
  perform pg_temp.as_user(usec, ca);
  perform pg_temp.err('update quality.project_meetings set data = ''{"m": 3}'' where id in (''m1-m71'', ''m3-m71'')');
  res := res || pg_temp.t((select string_agg(id, ',' order by id) from quality.project_meetings where id like '%-m71' and data = '{"m": 3}') = 'm3-m71',
                          'секция с «Редактирование»: правит только своё совещание');
  reset role;
  perform pg_temp.as_user(unone, ca);
  res := res || pg_temp.t(pg_temp.vis('project_meetings') = '', 'без объектов: совещаний нет');
  reset role;
  insert into core.company_role_permissions(role_id, company_id, action) values (r_ctr, ca, 'quality.sk.view');
  perform pg_temp.as_user(uctr, ca);
  res := res || pg_temp.t(pg_temp.vis('sk_records') = 'k1', 'подрядчик F1: внешний СК своей фирмы — ' || pg_temp.vis('sk_records'));
  reset role;

  -- 9. Назначение: «объекты Качества» не принимаются, роль Качества — на объект
  perform pg_temp.as_user(uadm, ca);
  e := pg_temp.err(format('select public.pf_set_participation(array[%L]::uuid[], %L, null, null, false, null, array[%L])', uown, r_own, po1));
  res := res || pg_temp.t(e like '22023%Объекты Качества больше не выбираются%', 'участие: объекты Качества — отказ — ' || e);
  e := pg_temp.err(format('select public.pf_set_participation(array[%L]::uuid[], %L, %L)', uown, r_own, p2));
  res := res || pg_temp.t(e = 'OK', 'участие: роль Качества на объект — можно — ' || e);
  res := res || pg_temp.t(not exists (select 1 from core.role_assignments where user_id = uown and project_id = p2 and quality_objects is not null),
                          'участие: мост не пишется');
  e := pg_temp.err(format('select public.pf_assign_role(%L, %L, null, null, null, array[%L])', uown, r_own, po1));
  res := res || pg_temp.t(e like '22023%', 'назначение: объекты Качества — отказ — ' || e);
  reset role;

  raise exception E'%FAIL всего: %', res, (length(res) - length(replace(res, 'FAIL ', ''))) / 5 using errcode = 'P0001';
end $$;
