-- P2-0035 этап 3 (039b): один список объектов компании и «не разобрано».
-- Проверки: контейнер скрыт из списков и отдаётся Качеству; объект ядра → объект Качества и узел дерева; узел дерева → объект
-- Качества и ядра; переименование в обе стороны (прежнее — синоним); «не разобрано» → заявка в очереди → синоним узла → запись
-- узнана и видна инженеру объекта; связь подрядчика → запись узнана; компания без контейнера; компания без Качества.
-- Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N». Запуск: после 039b_quality_one_object_list_up.sql.
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); ue uuid := gen_random_uuid(); un uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cn uuid := gen_random_uuid(); cp uuid := gen_random_uuid();
  pa uuid := gen_random_uuid(); r_adm uuid; r_eng uuid; r_n uuid;
  v uuid; v2 uuid; j jsonb; s text; n int; res text := '';
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, ue, un]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 039b', true), (cn, 'Новая 039b', true), (cp, 'Только План/Факт 039b', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, ue), (cn, un);
  -- контейнер — до включения Качества (как у RBI: создан переносом), затем помечен
  insert into core.projects(id, company_id, name, quality_container) values (pa, ca, 'Объекты Альфы 039b', true);
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cn]) c, unnest(array['quality', 'construction', 'planfact']) m
    union all select cp, 'planfact', true
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_roles(company_id, name) values (ca, 'Админ 039b') returning id into r_adm;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер 039b') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (cn, 'Админ Н 039b') returning id into r_n;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r, c, a from (values (r_adm, ca), (r_n, cn)) x(r, c), unnest(array['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company',
    'quality.objects.manage', 'construction.view', 'construction.edit', 'construction.manage', 'construction.objects.manage']) a
  union all select r_eng, ca, a from unnest(array['quality.view', 'quality.edit', 'construction.view', 'construction.edit']) a;

  -- 1. Объект ядра → объект Качества и узел дерева
  insert into core.projects(company_id, name) values (ca, 'ЖК Север') returning id into v;
  res := res || pg_temp.t((select count(*) = 1 from quality.project_objects where core_company_id = ca and core_object_id = v and display_name = 'ЖК Север'),
                          'объект ядра «ЖК Север» → объект Качества со связью');
  res := res || pg_temp.t((select count(*) = 1 from quality.location_nodes where core_company_id = ca and "nodeType" = 'object' and "displayName" = 'ЖК Север'
                            and coalesce("parentId", '') = ''), 'объект ядра → узел-объект дерева (его видит выбор объекта в Качестве)');
  res := res || pg_temp.t(not exists (select 1 from quality.project_objects where core_company_id = ca and display_name = 'Объекты Альфы 039b'),
                          'контейнер — не объект Качества');
  insert into core.role_assignments(company_id, user_id, role_id, quality_objects) values
    (ca, uadm, r_adm, null), (ca, ue, r_eng, array[(select id from quality.project_objects where core_object_id = v)]), (cn, un, r_n, null);

  -- 2. Контейнер скрыт из списков, Качество работает в нём
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t((select count(*) = 0 from public.pf_company_projects(ca) where id = pa)
                          and (select count(*) >= 1 from public.pf_company_projects(ca) where id = v), 'pf_company_projects: контейнера нет, ЖК есть');
  res := res || pg_temp.t((select count(*) = 0 from public.pf_my_projects() where id = pa), 'pf_my_projects: контейнера нет');
  j := quality.my_access(null);
  res := res || pg_temp.t(j ->> 'container' = pa::text, 'my_access: контейнер компании для Качества ' || coalesce(j ->> 'container', 'null'));
  perform pg_temp.as_user(un, cn);
  j := quality.my_access(null);
  res := res || pg_temp.t(j ? 'container' and j ->> 'container' is null, 'my_access: у компании без контейнера — null');

  -- 3. Узел-объект дерева, созданный в Качестве (Админ) → объект Качества и объект ядра
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.location_nodes(id, canonical_key, "displayName", synonyms, "nodeType", core_company_id)
    values ('nq-m39b', 'жк юг', 'ЖК Юг', '[]', 'object', %L)$q$, ca)) = 'OK', 'Админ создал узел-объект «ЖК Юг» в Качестве');
  reset role;
  select core_object_id into v2 from quality.project_objects where core_company_id = ca and display_name = 'ЖК Юг';
  res := res || pg_temp.t(v2 is not null and (select name = 'ЖК Юг' and company_id = ca from core.projects where id = v2),
                          'узел дерева → объект Качества и объект ядра «ЖК Юг»');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t((select count(*) = 1 from public.pf_company_projects(ca) where id = v2), '«ЖК Юг» — в списке объектов «Компании»');
  reset role;
  res := res || pg_temp.t((select count(*) = 1 from quality.location_nodes where core_company_id = ca and "displayName" = 'ЖК Юг'),
                          'узел не задвоился');

  -- 4. Переименование в «Компании» и в Качестве
  update core.projects set name = 'ЖК Север-2' where id = v;
  res := res || pg_temp.t((select display_name = 'ЖК Север-2' from quality.project_objects where core_object_id = v)
                          and quality.object_of(ca, null, null, 'ЖК Север') = v, 'переименование в ядре → объект Качества, прежнее название узнаётся');
  res := res || pg_temp.t((select "displayName" = 'ЖК Север-2' and synonyms @> '["ЖК Север"]' from quality.location_nodes
                            where core_company_id = ca and "nodeType" = 'object' and "displayName" like 'ЖК Север%'), 'переименование в ядре → узел дерева');
  perform pg_temp.as_user(uadm, ca);
  perform pg_temp.err($q$update quality.location_nodes set "displayName" = 'ЖК Юг Плюс' where id = 'nq-m39b'$q$);
  reset role;
  res := res || pg_temp.t((select name = 'ЖК Юг Плюс' from core.projects where id = v2), 'переименование узла в Качестве → объект ядра');
  res := res || pg_temp.t(quality.object_of(ca, null, null, 'ЖК Юг') = v2, '… прежнее название узнаётся');
  update quality.location_nodes set updated_at = now(), "displayName" = 'ЖК Юг Плюс' where id = 'nq-m39b';
  res := res || pg_temp.t((select count(*) = 1 from quality.project_objects where core_company_id = ca and core_object_id = v2),
                          'устройство переслало узел без изменений — ничего не создано');

  -- 5. «Не разобрано» → заявка → синоним узла → запись узнана, инженер объекта её видит
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, project_display_name, core_company_id)
    values ('u1-m39b', %L, 'Север корп. 1', %L)$q$, pa, ca)) = 'OK', 'Админ записал проверку с неизвестным названием');
  reset role;
  res := res || pg_temp.t((select core_object_id is null from quality.rbi_inspections where id = 'u1-m39b'), 'запись — «не разобрано»');
  res := res || pg_temp.t((select count(*) = 1 from quality.object_normalization_queue where core_company_id = ca and raw_name = 'Север корп. 1'
                            and status = 'pending' and project_code = pa::text), 'заявка в очереди названий (у администратора в «Объекты и планы»)');
  perform pg_temp.as_user(ue, ca);
  res := res || pg_temp.t((select count(*) = 0 from quality.rbi_inspections where id = 'u1-m39b'), 'инженер ЖК Север пока не видит');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.err($q$update quality.location_nodes set synonyms = coalesce(synonyms, '[]') || '["Север корп. 1"]'
    where core_company_id = (select core_company_id from quality.location_nodes where id = 'nq-m39b') and "displayName" = 'ЖК Север-2'$q$) = 'OK',
                          'Админ: «Связать с: ЖК Север-2» (синоним узла)');
  reset role;
  res := res || pg_temp.t((select core_object_id = v from quality.rbi_inspections where id = 'u1-m39b'), 'запись узнана → ЖК Север');
  perform pg_temp.as_user(ue, ca);
  res := res || pg_temp.t((select count(*) = 1 from quality.rbi_inspections where id = 'u1-m39b'), 'инженер ЖК Север теперь видит запись');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.rbi_inspections(id, project_code, project_display_name, core_company_id)
    values ('u2-m39b', %L, 'север корп. 1', %L)$q$, pa, ca)) = 'OK', 'новая запись с этим названием — сразу узнана, инженер пишет');

  -- 6. Подрядчик «не разобрано» → новая связь → запись узнана
  reset role;
  perform pg_temp.as_user(uadm, ca);
  perform pg_temp.err(format($q$insert into quality.sk_records(id, project_code, sk_number, sk_unique_key, contractor_name, core_company_id)
    values ('k1-m39b', %L, 'k1', 'k1', 'Новая фирма', %L)$q$, pa, ca));
  reset role;
  res := res || pg_temp.t((select core_counterparty_id is null from quality.sk_records where id = 'k1-m39b'), 'подрядчик неизвестен — «не разобрано»');
  insert into core.counterparties(company_id, name, inn, kinds) values (ca, 'Новая фирма', '7700000099', array['contractor']) returning id into v2;
  res := res || pg_temp.t((select core_counterparty_id = v2 from quality.sk_records where id = 'k1-m39b'), 'контрагент заведён → запись узнана');

  -- 6а. Как при переносе РБИ: сначала узел дерева (сервер создаёт объект Качества), затем настоящий объект с тем же ключом
  insert into quality.location_nodes(id, canonical_key, "displayName", synonyms, "nodeType", core_company_id)
  values ('nt-m39b', 'лиговский 240', 'Лиговский 240', '[]', 'object', ca);
  select core_object_id into v from quality.project_objects where id = 'obj_ntm39b';
  insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id)
  values ('obj_real_m39b', 'лиговский 240', 'Лиговский 240', '{}', ca) on conflict do nothing;
  res := res || pg_temp.t(v is not null and exists (select 1 from quality.project_objects where id = 'obj_real_m39b' and core_object_id = v)
                          and not exists (select 1 from quality.project_objects where id = 'obj_ntm39b'),
                          'перенос: настоящий объект Качества загрузился, связь с ядром — его, созданный сервером убран');
  res := res || pg_temp.t((select count(*) = 1 from core.projects where company_id = ca and name = 'Лиговский 240'), 'перенос: объект ядра не задвоился');

  -- 7. Компания без контейнера
  insert into core.projects(company_id, name) values (cn, 'Объект Н') returning id into v;
  res := res || pg_temp.t((select count(*) = 1 from quality.project_objects where core_company_id = cn and core_object_id = v)
                          and (select count(*) = 1 from quality.location_nodes where core_company_id = cn and "displayName" = 'Объект Н'),
                          'новая компания: объект «Компании» → в Качестве');
  perform pg_temp.as_user(un, cn);
  perform pg_temp.err(format($q$insert into quality.location_nodes(id, canonical_key, "displayName", synonyms, "nodeType", core_company_id)
    values ('nn-m39b', 'узел н', 'Узел Н', '[]', 'object', %L)$q$, cn));
  reset role;
  res := res || pg_temp.t((select count(*) = 1 from core.projects where company_id = cn and name = 'Узел Н'), 'новая компания: объект Качества → в «Компании»');
  res := res || pg_temp.t(not exists (select 1 from core.projects where company_id = ca and name in ('Объект Н', 'Узел Н'))
                          and not exists (select 1 from quality.project_objects where core_company_id = cn and display_name like 'ЖК%'),
                          'компании не смешиваются');

  -- 8. Компания без Качества — объект ядра в Качество не попадает
  insert into core.projects(company_id, name) values (cp, 'Только ПФ') returning id into v;
  res := res || pg_temp.t(not exists (select 1 from quality.project_objects where core_company_id = cp)
                          and not exists (select 1 from quality.location_nodes where core_company_id = cp), 'компания без Качества — ничего не создано');

  -- 9. Функции закрыты
  perform pg_temp.as_user(ue, ca);
  res := res || pg_temp.t(pg_temp.err(format('select quality.reresolve(%L)', ca)) = '42501', 'сотрудник не запускает пересчёт');
  res := res || pg_temp.t(pg_temp.err('select quality.request_container()') = '42501', 'сотрудник: служебная функция контейнера закрыта');

  reset role;
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
