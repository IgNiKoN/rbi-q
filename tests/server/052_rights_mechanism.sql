-- P2-0070 (052): единый механизм прав — ядро (core.can_at / row_allowed / require_action), каталог с группами, Стройконтроль 2.0
-- по действиям и участию. Сценарии: каталог (группы, порядок, подписи) и перенос шаблонов; проверка ядра по месту;
-- место записи по id ядра; инженер объекта ЖК-1 не видит ЖК-2; участие на секцию — только она (+ своё без места);
-- без «Закрыть» — отказ сервера с текстом, в том числе upsert-ом и удалением в обход экрана; подрядчик — как 043;
-- приёмка: записаться / время / провести по действиям; «кто я» для телефона; изоляция: чужая компания, без модуля,
-- права Качества не дают Стройконтроля. Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 052_rights_mechanism_up.sql.
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
create or replace function pg_temp.rows(q text) returns int language plpgsql as $f$
declare n int; begin execute q; get diagnostics n = row_count; return n; exception when others then return -1; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
create or replace function pg_temp.vis(tbl text) returns text language plpgsql as $f$
declare s text;
begin
  execute format('select coalesce(string_agg(split_part(id, ''-'', 1), '','' order by id collate "C"), '''') from quality.%I where id like ''%%-m52''', tbl) into s;
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
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); cq uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid();
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); d1 uuid; d2 uuid;
  uadm uuid; ueng uuid; ueng1 uuid; usec uuid; unoclose uuid; uctr uuid; uqual uuid; ub uuid; uq uuid;
  r_adm uuid; r_eng uuid; r_noclose uuid; r_ctr uuid; r_qual uuid;
  s1loc uuid; s1f uuid; n_s1 text; n_s2 text; n_t1 text; n_o1 text; res text := ''; e text; j jsonb; g jsonb;
  v_all text[] := array['construction.defects.view', 'construction.defects.create', 'construction.defects.assign', 'construction.defects.start',
    'construction.defects.fix', 'construction.defects.close', 'construction.defects.reject', 'construction.defects.delete',
    'construction.acceptance.view', 'construction.acceptance.book', 'construction.acceptance.schedule', 'construction.acceptance.conduct',
    'construction.transfer.edit'];
begin
  -- 0. Каталог и шаблоны
  res := res || pg_temp.t((select count(*) from core.permission_catalog where action = any(v_all) and area_scoped) = 13, 'каталог: 13 действий, по участию');
  res := res || pg_temp.t((select count(*) from core.role_template_permissions where template_code = 'qc_engineer' and action = any(v_all)) = 13,
                          'шаблон «Инженер СК»: все 13 действий');
  res := res || pg_temp.t((select array_agg(action order by action) from core.role_template_permissions where template_code = 'contractor_rep'
                            and action = any(v_all)) = array['construction.acceptance.book', 'construction.acceptance.view',
                            'construction.defects.fix', 'construction.defects.start', 'construction.defects.view'], 'шаблон «Подрядчик»: видеть, в работу, устранено, записаться');
  res := res || pg_temp.t((select array_agg(action order by action) from core.role_template_permissions where template_code = 'customer'
                            and action = any(v_all)) = array['construction.acceptance.view', 'construction.defects.view'], 'шаблон «Заказчик»: только видеть');
  res := res || pg_temp.t(exists (select 1 from core.permission_catalog where action = 'construction.edit'), 'прежние ключи на месте');
  res := res || pg_temp.t(not exists (select 1 from core.permission_catalog where group_name = 'Прочее'), 'каталог: у каждого действия своя группа');
  res := res || pg_temp.t((select count(distinct sort) = count(*) from core.permission_catalog), 'каталог: порядок без повторов');
  res := res || pg_temp.t((select module = 'construction' and group_name = 'Замечания' and label = 'Закрыть замечание' from core.permission_catalog
                            where action = 'construction.defects.close'), 'каталог: модуль, группа, подпись у действия Стройконтроля');
  res := res || pg_temp.t((select module = 'planfact' and group_name = 'Факт' and label is null from core.permission_catalog
                            where action = 'planfact.fact.approve'), 'каталог: План/Факт — группа «Факт», подпись = описание');

  -- засев: компания А — два объекта ядра, места; Б — чужая; В — без Стройконтроля
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 052т', true), (cb, 'Бета 052т', true), (cq, 'Только Качество 052т', true);
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction', 'planfact']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_modules(company_id, module, enabled) values (cq, 'quality', true), (cq, 'construction', false)
    on conflict (company_id, module) do update set enabled = excluded.enabled;
  insert into core.counterparties(id, company_id, name, inn, kinds) values
    (f1, ca, 'ООО Ромашка 052т', '7700005201', array['contractor']), (f2, ca, 'Лютик 052т', '7700005202', array['contractor']);
  r_adm := pg_temp.role(ca, 'Админ мест', array['planfact.projects.manage']);
  uadm := pg_temp.member(ca, r_adm, null, null, null);
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_project(ca, p1, '{"name": "ЖК-1"}');
  perform public.pf_save_project(ca, p2, '{"name": "ЖК-2"}');
  perform public.pf_save_place(p1, k1, null, 'object', 'Корпус 1', 'building');
  perform public.pf_save_place(p2, k2, null, 'object', 'Корпус 1', 'building');
  perform public.pf_fill_object(k1, 2, 1, 1);
  perform public.pf_fill_object(k2, 1, 1, 1);
  reset role;
  select l.id into s1loc from core.locations l where l.parent_id = k1 and l.name = 'Секция 1';
  select l.id, n.id into s1f, n_s1 from core.locations l join quality.location_nodes n on n.core_location_id = l.id where l.parent_id = s1loc;
  select n.id into n_s2 from core.locations s join core.locations l on l.parent_id = s.id join quality.location_nodes n on n.core_location_id = l.id
   where s.parent_id = k1 and s.name = 'Секция 2';
  select n.id into n_t1 from core.locations s join core.locations l on l.parent_id = s.id join quality.location_nodes n on n.core_location_id = l.id
   where s.parent_id = k2;
  select n.id into n_o1 from quality.location_nodes n where n.core_company_id = ca and n."nodeType" = 'object' and quality.node_root_project(n) = p1;
  perform set_config('request.headers', json_build_object('x-company-id', ca)::text, true);
  insert into quality.contractor_directory(id, project_code, canonical_key, display_name, core_company_id) values
    (gen_random_uuid(), p1::text, quality.contractor_key('ООО Ромашка 052т'), 'Ромашка', ca),
    (gen_random_uuid(), p1::text, quality.contractor_key('Лютик 052т'), 'Лютик', ca) on conflict do nothing;
  select id into d1 from quality.contractor_directory where core_company_id = ca and canonical_key = quality.contractor_key('ООО Ромашка 052т') limit 1;
  select id into d2 from quality.contractor_directory where core_company_id = ca and canonical_key = quality.contractor_key('Лютик 052т') limit 1;

  r_eng := pg_temp.role(ca, 'Инженер', array['quality.view'] || v_all);
  r_noclose := pg_temp.role(ca, 'Инженер без «Закрыть»', array(select x from unnest(v_all) x
                                                                where x not in ('construction.defects.close', 'construction.defects.delete')));
  r_ctr := pg_temp.role(ca, 'Подрядчик', array['quality.view', 'quality.scope.contractor', 'construction.defects.view', 'construction.defects.start',
                                                'construction.defects.fix', 'construction.acceptance.view', 'construction.acceptance.book']);
  r_qual := pg_temp.role(ca, 'Только Качество', array['quality.view', 'quality.edit', 'construction.view', 'construction.edit']);
  ueng := pg_temp.member(ca, r_eng, null, null, null);
  ueng1 := pg_temp.member(ca, r_eng, p1, null, null);
  usec := pg_temp.member(ca, r_eng, p1, s1loc, null);
  unoclose := pg_temp.member(ca, r_noclose, null, null, null);
  uctr := pg_temp.member(ca, r_ctr, null, null, f1);
  uqual := pg_temp.member(ca, r_qual, null, null, null);   -- только прежние ключи (без переноса) — Стройконтроль 2.0 не видит
  ub := pg_temp.member(cb, pg_temp.role(cb, 'Инженер Б', v_all), null, null, null);
  uq := pg_temp.member(cq, pg_temp.role(cq, 'Инженер В', array['quality.view'] || v_all), null, null, null);

  -- 0а. Каталог для экрана и проверка ядра «может ли действие на месте»
  perform pg_temp.as_user(usec, ca);
  res := res || pg_temp.t((select module_name = 'Стройконтроль' and group_name = 'Замечания' and label = 'Закрыть замечание' and area_scoped
                             from public.pf_permission_catalog() where action = 'construction.defects.close'), 'pf_permission_catalog: модуль, группа, подпись');
  res := res || pg_temp.t((select module_name from public.pf_permission_catalog() where action = 'security.roles.assign') = 'Компания',
                          'pf_permission_catalog: действия ядра — «Компания»');
  res := res || pg_temp.t(pg_temp.err(format('select core.can_at(%L, null, null, ''construction.defects.view'')', ca)) like '42501%'
                          and pg_temp.err(format('select core.my_area(%L)', p1)) like '42501%', 'can_at и my_area клиенту закрыты (ТД №104)');
  reset role;   -- дальше — как функции сервера (определитель), от имени того же пользователя
  res := res || pg_temp.t(core.can_at(ca, p1, s1f, 'construction.defects.close'), 'can_at: участник секции 1 — этаж в ней');
  res := res || pg_temp.t(core.can_at(ca, p1, s1loc, 'construction.defects.close'), 'can_at: участник секции 1 — сама секция');
  res := res || pg_temp.t(not core.can_at(ca, p1, k1, 'construction.defects.close'), 'can_at: участник секции 1 — не корпус над ней');
  res := res || pg_temp.t(not core.can_at(ca, p1, (select id from core.locations where parent_id = k1 and name = 'Секция 2'), 'construction.defects.close'),
                          'can_at: участник секции 1 — не секция 2');
  res := res || pg_temp.t(core.can_at(ca, p1, null, 'construction.defects.close'), 'can_at: место не задано — где-то в проекте');
  res := res || pg_temp.t(not core.can_at(ca, p2, null, 'construction.defects.close'), 'can_at: другой проект — нет');
  res := res || pg_temp.t(not core.can_at(ca, null, null, 'construction.defects.close'), 'can_at: уровень компании — только назначения на компанию');
  res := res || pg_temp.t(core.my_area(p1) @> array[s1loc, s1f] and not core.my_area(p1) @> array[k1], 'my_area: секция и всё под ней');
  perform pg_temp.as_user(unoclose, ca); reset role;
  res := res || pg_temp.t(not core.can_at(ca, p1, s1f, 'construction.defects.close') and core.can_at(ca, p1, s1f, 'construction.defects.reject')
                          and core.can_at(ca, null, null, 'construction.defects.reject'), 'can_at: роль без «Закрыть» — нет, «Вернуть» — да, вся компания');
  perform pg_temp.as_user(uq, cq); reset role;
  res := res || pg_temp.t(not core.can_at(cq, null, null, 'construction.defects.view') and core.can_at(cq, null, null, 'quality.view'),
                          'can_at: модуль выключен у компании — нет');
  reset role;

  -- 1. Записи инженера (под ним — сторож пропускает); место записи по id ядра
  perform pg_temp.as_user(ueng, ca);
  e := pg_temp.err(format($q$insert into quality.construction_defects_v2(id, core_company_id, "locationId", "contractorId", status, text, history) values
    ('s1-m52', %1$L, %2$L, %6$L, 'issued', 'т', '[]'), ('s2-m52', %1$L, %3$L, %7$L, 'issued', 'т', '[]'),
    ('o1-m52', %1$L, %4$L, %6$L, 'issued', 'т', '[]'), ('t1-m52', %1$L, %5$L, %6$L, 'issued', 'т', '[]'),
    ('none-m52', %1$L, null, %6$L, 'issued', 'т', '[]'), ('bad-m52', %1$L, 'нет-такого', %6$L, 'issued', 'т', '[]')$q$,
    ca, n_s1, n_s2, n_o1, n_t1, d1, d2));
  res := res || pg_temp.t(e = 'OK', 'инженер выдаёт замечания (' || e || ')');
  e := pg_temp.err(format($q$insert into quality.construction_acceptance_v2(id, core_company_id, "locationId", "contractorId", status) values
    ('s1-m52', %1$L, %2$L, %5$L, 'pending'), ('s2-m52', %1$L, %3$L, %5$L, 'pending'), ('t1-m52', %1$L, %4$L, %5$L, 'pending')$q$,
    ca, n_s1, n_s2, n_t1, d1));
  res := res || pg_temp.t(e = 'OK', 'инженер записывает приёмки (' || e || ')');
  reset role;
  res := res || pg_temp.t((select core_location_id from quality.construction_defects_v2 where id = 's1-m52') = s1f, 'место записи — этаж ядра');
  res := res || pg_temp.t((select core_location_id is null and core_project_id = p1 from quality.construction_defects_v2 where id = 'o1-m52'),
                          'узел-объект: объект есть, места нет');
  res := res || pg_temp.t((select core_location_id is null from quality.construction_defects_v2 where id = 'bad-m52'), 'неизвестный узел — место пусто');
  res := res || pg_temp.t((select core_location_id from quality.construction_acceptance_v2 where id = 's1-m52') = s1f, 'приёмка: место — этаж ядра');
  -- перенос записи в другой узел — место пересчитано
  perform pg_temp.as_user(ueng, ca);
  perform pg_temp.rows(format($q$update quality.construction_defects_v2 set "locationId" = %L where id = 'bad-m52'$q$, n_s2));
  reset role;
  res := res || pg_temp.t((select core_location_id from quality.construction_defects_v2 where id = 'bad-m52') =
                          (select core_location_id from quality.location_nodes where core_company_id = ca and id = n_s2), 'смена узла → новое место');

  -- 2. Видимость по участию
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = 'bad,none,o1,s1,s2,t1', 'инженер компании видит всё (' || pg_temp.vis('construction_defects_v2') || ')');
  perform pg_temp.as_user(ueng1, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = 'bad,none,o1,s1,s2', 'инженер ЖК-1 не видит ЖК-2 (' || pg_temp.vis('construction_defects_v2') || ')');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_defects_v2 set status = 'in_progress' where id = 't1-m52'$q$) = 0, 'инженер ЖК-1 не правит ЖК-2');
  perform pg_temp.as_user(usec, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = 's1', 'участие на секцию 1 — только она (' || pg_temp.vis('construction_defects_v2') || ')');
  res := res || pg_temp.t(pg_temp.vis('construction_acceptance_v2') = 's1', 'приёмки — только секции 1');
  e := pg_temp.err(format($q$insert into quality.construction_defects_v2(id, core_company_id, "locationId", status) values ('sx-m52', %L, %L, 'issued')$q$, ca, n_s2));
  res := res || pg_temp.t(e like '42501%', 'участник секции 1 не выдаёт замечание в секции 2 (' || e || ')');
  e := pg_temp.err(format($q$insert into quality.construction_defects_v2(id, core_company_id, "locationId", status) values ('own-m52', %L, %L, 'issued')$q$, ca, n_o1));
  res := res || pg_temp.t(e like '42501%', 'участник секции не выдаёт замечание без места (' || e || ')');
  e := pg_temp.err(format($q$insert into quality.construction_defects_v2(id, core_company_id, "locationId", status) values ('my-m52', %L, %L, 'issued')$q$, ca, n_s1));
  res := res || pg_temp.t(e = 'OK', 'участник секции 1 выдаёт замечание в ней (' || e || ')');
  -- своё без места: перенос своего замечания на узел-объект — запрещён (место вне области), видимость автору — проверена в «до = после»
  res := res || pg_temp.t(pg_temp.err(format($q$update quality.construction_defects_v2 set "locationId" = %L where id = 'my-m52'$q$, n_o1)) like '42501%',
                          'участник секции не уводит запись из своей области');

  -- 3. Без «Закрыть»: кнопки нет — и сервер отклоняет обход с текстом (update, upsert, удаление)
  perform pg_temp.as_user(ueng, ca);
  perform pg_temp.rows($q$update quality.construction_defects_v2 set status = 'fixed' where id in ('s1-m52', 's2-m52')$q$);
  perform pg_temp.as_user(unoclose, ca);
  e := pg_temp.err($q$update quality.construction_defects_v2 set status = 'closed' where id = 's1-m52'$q$);
  res := res || pg_temp.t(e = '42501: Нет права «Закрыть замечание» на объекте «ЖК-1»', 'без «Закрыть»: отказ с текстом (' || e || ')');
  e := pg_temp.err(format($q$insert into quality.construction_defects_v2(id, core_company_id, "locationId", "contractorId", status, text, history)
      values ('s1-m52', %L, %L, %L, 'closed', 'т', '[]') on conflict (id, core_company_id) do update set status = excluded.status$q$, ca, n_s1, d1));
  res := res || pg_temp.t(e like '42501: Нет права «Закрыть замечание»%', 'без «Закрыть»: upsert тоже отклонён (' || e || ')');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_defects_v2 set status = 'rejected', history = '[{"status": "rejected"}]' where id = 's1-m52'$q$) = 1,
                          'без «Закрыть»: «Вернуть» можно');
  e := pg_temp.err($q$delete from quality.construction_defects_v2 where id = 's2-m52'$q$);
  res := res || pg_temp.t(e like '42501: Нет права «Удалить замечание»%', 'без «Удалить»: удаление отклонено (' || e || ')');
  e := pg_temp.err($q$update quality.construction_defects_v2 set is_deleted = true where id = 's2-m52'$q$);
  res := res || pg_temp.t(e like '42501: Нет права «Удалить замечание»%', 'без «Удалить»: пометка удаления отклонена');
  e := pg_temp.err($q$update quality.construction_defects_v2 set status = 'closed' where id = 'none-m52'$q$);
  res := res || pg_temp.t(e = '42501: Нет права «Закрыть замечание» для записи без объекта', 'отказ для записи без объекта (' || e || ')');
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_defects_v2 set status = 'closed' where id = 's2-m52'$q$) = 1, 'инженер с «Закрыть» закрывает');

  -- 4. Подрядчик: своя фирма, «в работу» / «устранено»; не выдаёт, не закрывает, не меняет срок
  perform pg_temp.as_user(uctr, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = 'bad,none,o1,s1,t1', 'подрядчик F1 — своя фирма (' || pg_temp.vis('construction_defects_v2') || ')');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_defects_v2 set status = 'in_progress' where id = 't1-m52'$q$) = 1, 'подрядчик: в работу');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_defects_v2 set status = 'fixed', history = '[{"status": "fixed"}]' where id = 't1-m52'$q$) = 1,
                          'подрядчик: устранено');
  res := res || pg_temp.t(pg_temp.err($q$update quality.construction_defects_v2 set status = 'closed' where id = 't1-m52'$q$) like '42501%', 'подрядчик не закрывает');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.construction_defects_v2(id, core_company_id, "locationId", "contractorId", status)
      values ('c-m52', %L, %L, %L, 'issued')$q$, ca, n_s1, d1)) like '42501%', 'подрядчик не выдаёт замечание');
  -- приёмка: записаться — да; перенести время и провести — нет
  e := pg_temp.err(format($q$insert into quality.construction_acceptance_v2(id, core_company_id, "locationId", "contractorId", status)
      values ('c-m52', %L, %L, %L, 'pending')$q$, ca, n_t1, d1));
  res := res || pg_temp.t(e = 'OK', 'подрядчик записывается на приёмку (' || e || ')');
  e := pg_temp.err($q$update quality.construction_acceptance_v2 set requested_date = '2030-01-01' where id = 'c-m52'$q$);
  res := res || pg_temp.t(e = '42501: Нет права «Подтвердить или перенести время приёмки» на объекте «ЖК-2»', 'подрядчик не переносит время (' || e || ')');
  res := res || pg_temp.t(pg_temp.err($q$update quality.construction_acceptance_v2 set status = 'accepted' where id = 'c-m52'$q$) like '42501%', 'подрядчик не проводит приёмку');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_acceptance_v2 set is_deleted = true where id = 'c-m52'$q$) = 1, 'подрядчик отзывает свою заявку');
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_acceptance_v2 set requested_date = '2030-01-02', requested_time = '10:00' where id = 't1-m52'$q$) = 1,
                          'инженер подтверждает время');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_acceptance_v2 set status = 'accepted', checklist_results = '{}' where id = 't1-m52'$q$) = 1,
                          'инженер проводит приёмку');

  -- 5. «Кто я» для телефона
  perform pg_temp.as_user(usec, ca);
  j := quality.my_access() -> 'construction';
  g := j -> 'grants' -> 0;
  res := res || pg_temp.t(jsonb_array_length(j -> 'grants') = 1 and (g ->> 'project')::uuid = p1 and (g ->> 'place')::uuid = s1loc
                          and g -> 'places' ? s1f::text and not g -> 'places' ? k1::text and g -> 'actions' ? 'construction.defects.close',
                          'my_access: участие на секцию — место и всё под ним, действия роли');
  res := res || pg_temp.t((j -> 'object_nodes' ->> n_o1)::uuid = p1, 'my_access: узел-объект → объект ядра');
  perform pg_temp.as_user(ueng, ca);
  g := quality.my_access() -> 'construction' -> 'grants' -> 0;
  res := res || pg_temp.t(g -> 'project' = 'null'::jsonb and g -> 'places' = 'null'::jsonb, 'my_access: вся компания — без мест');
  perform pg_temp.as_user(uctr, ca);
  g := quality.my_access() -> 'construction' -> 'grants' -> 0;
  res := res || pg_temp.t((g ->> 'counterparty')::uuid = f1 and g -> 'actions' ? 'quality.scope.contractor', 'my_access: подрядчик — фирма и признак');

  -- 6. Изоляция
  perform pg_temp.as_user(uqual, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = '', 'только прежние ключи (без новых действий) — не видит Стройконтроль 2.0');
  perform pg_temp.as_user(ub, cb);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = '', 'чужая компания: пусто');
  perform pg_temp.as_user(ub, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = '', 'чужая компания с заголовком А: пусто');
  perform pg_temp.as_user(uq, cq);
  e := pg_temp.err(format($q$insert into quality.construction_defects_v2(id, core_company_id, status) values ('q-m52', %L, 'issued')$q$, cq));
  res := res || pg_temp.t(e like '42501%', 'компания без Стройконтроля: запись не проходит (' || e || ')');
  res := res || pg_temp.t(quality.my_access() -> 'construction' -> 'enabled' = 'false'::jsonb, 'my_access: модуль выключен');
  perform pg_temp.as_user(null, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') in ('', 'ERR:42501'), 'anon: пусто');
  -- общая проверка закрыта от anon и вызывает только то, что видит сам пользователь
  res := res || pg_temp.t(pg_temp.err(format('select core.row_allowed(%L, null, null, ''{construction.defects.view}'', null, null)', ca)) like '42501%',
                          'row_allowed закрыта для anon');
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.err('select core.place_up(null)') like '42501%'
                          and pg_temp.err(format('select core.require_action(%L, null, null, ''construction.defects.view'', null, null)', ca)) like '42501: permission%',
                          'служебные функции ядра закрыты');

  reset role;
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
