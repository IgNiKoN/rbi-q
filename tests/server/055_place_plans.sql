-- P2-0057 (055): PDF-план места — документ ядра с версиями, закрытый бакет core-place-plans, копия в Качество / СК 2.0.
-- Бакет (закрытый, PDF, 50 МБ); файлы: кладёт ведущий места, читает участник проекта, чужая компания / не участник / аноним —
-- ничего, путь не того места — отказ, перезаписать и удалить — никто; версии: загрузка → 1 текущая → копия этажа; вторая —
-- текущая, первая в списке; повтор по id; «сделать текущей»; «снять»; квартира — помещение СК заводится; отказы RPC (права,
-- не PDF, больше 50 МБ, чужая ссылка, файл не загружен, не этаж / квартира, проект «Качество»); список версий (кто видит);
-- защита в модулях (новая ссылка, пометка удаления, вставка с планом — отказ; старая копия устройства — план остаётся;
-- проект «Качество» — как раньше); без модулей — копии нет; модуль выключен — копии нет; точки замечаний; журнал.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 055_place_plans_up.sql.
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
create or replace function pg_temp.val(q text) returns text language plpgsql as $f$
declare v text; begin execute q into v; return coalesce(v, 'NULL'); exception when others then return sqlstate || ' ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
create or replace function pg_temp.kid(par uuid, nm text) returns uuid language sql security definer as $f$
  select id from core.locations where parent_id = par and name = nm and deleted_at is null $f$;
create or replace function pg_temp.path(l uuid, d uuid) returns text language sql security definer as $f$
  select company_id || '/' || project_id || '/' || id || '/' || d || '.pdf' from core.locations where id = l $f$;
create or replace function pg_temp.url(l uuid, d uuid) returns text language sql security definer as $f$
  select 'https://api.test.invalid/storage/v1/object/public/core-place-plans/' || pg_temp.path(l, d) $f$;
-- положить файл в бакет от имени текущей роли
create or replace function pg_temp.put(p text) returns text language sql as $f$
  select pg_temp.msg(format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, auth.uid())', 'core-place-plans', p)) $f$;
create or replace function pg_temp.seen(p text) returns int language sql as $f$
  select count(*)::int from storage.objects where bucket_id = 'core-place-plans' and name = p $f$;
create or replace function pg_temp.add(l uuid, d uuid, nm text default 'План.pdf', sz bigint default 1000) returns text language sql as $f$
  select pg_temp.val(format('select public.pf_add_place_plan(%L, %L, %L, %L, %s)::text', l, d, pg_temp.url(l, d), nm, sz)) $f$;
create or replace function pg_temp.floor_url(c uuid, l uuid) returns text language sql security definer as $f$
  select coalesce(string_agg(coalesce(f.pdf_url, 'NULL'), ',' order by f.id), 'нет строки') from quality.construction_floors_v2 f
   where f.core_company_id = c and f."locationId" = l::text and not f.is_deleted $f$;
create or replace function pg_temp.unit_url(c uuid, l uuid) returns text language sql security definer as $f$
  select coalesce(string_agg(coalesce(u.pdf_url, 'NULL'), ',' order by u.id), 'нет строки') from quality.construction_units_v2 u
   where u.core_company_id = c and u."locationId" = l::text and not u.is_deleted $f$;
create or replace function pg_temp.cur(l uuid) returns uuid language sql security definer as $f$
  select id from core.place_documents where location_id = l and is_current and deleted_at is null $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); ueng uuid := gen_random_uuid(); uout uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); cc uuid := gen_random_uuid();
  r_adm uuid; r_eng uuid; r_b uuid; r_c uuid;
  pn uuid := gen_random_uuid(); pn2 uuid := gen_random_uuid(); pb uuid := gen_random_uuid(); pc uuid := gen_random_uuid(); pq uuid;
  k1 uuid := gen_random_uuid(); kb uuid := gen_random_uuid(); kc uuid := gen_random_uuid();
  s1 uuid; f1 uuid; f2 uuid; a1 uuid; a2 uuid; a3 uuid; fb uuid; fc uuid; ac uuid; fq uuid;
  d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid(); d3 uuid := gen_random_uuid(); da uuid := gen_random_uuid();
  da2 uuid := gen_random_uuid(); dc uuid := gen_random_uuid(); dca uuid := gen_random_uuid(); dx uuid := gen_random_uuid();
  dbig uuid := gen_random_uuid(); dsec uuid := gen_random_uuid(); dq uuid := gen_random_uuid();
  res text := ''; str text; j jsonb; n int; v_row quality.construction_floors_v2; v_unit text; v_ver int;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, ueng, uout, ub, uc]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 055', true), (cb, 'Бета 055', true), (cc, 'Только ядро 055', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, ueng), (ca, uout), (cb, ub), (cc, uc);
  insert into core.user_profiles(user_id, full_name) values (uadm, 'Админ Альфы') on conflict (user_id) do update set full_name = excluded.full_name;
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction', 'planfact']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_modules(company_id, module, enabled) values (cc, 'planfact', true)
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_modules(company_id, module, enabled) values (cc, 'quality', false), (cc, 'construction', false)
    on conflict (company_id, module) do update set enabled = false;
  insert into core.company_roles(company_id, name) values (ca, 'Админ 055') returning id into r_adm;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер 055') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (cb, 'Админ Б 055') returning id into r_b;
  insert into core.company_roles(company_id, name) values (cc, 'Админ В 055') returning id into r_c;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_adm, ca, a from unnest(array['planfact.projects.manage', 'quality.view', 'quality.edit', 'construction.view', 'construction.edit']) a
  union all select r_eng, ca, a from unnest(array['quality.view', 'quality.edit', 'construction.view', 'construction.edit',
                                                  'quality.objects.manage', 'construction.objects.manage']) a
  union all select r_b, cb, a from unnest(array['planfact.projects.manage', 'construction.view', 'construction.edit']) a
  union all select r_c, cc, 'planfact.projects.manage';

  -- Проекты ядра: Альфа — Корпус 1 (Секция 1, эт. 1–2 по 2 кв.), второй проект; Бета; «Только ядро» (без Качества и СК)
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values (ca, uadm, r_adm, null), (cb, ub, r_b, null), (cc, uc, r_c, null);
  perform pg_temp.as_user(uadm, ca);
  perform public.pf_save_project(ca, pn, '{"name": "ЖК Планы 055"}');
  perform public.pf_save_project(ca, pn2, '{"name": "ЖК Другой 055"}');
  perform public.pf_save_place(pn, k1, null, 'object', 'Корпус 1', 'building');
  perform public.pf_fill_object(k1, 1, 2, 2);
  perform pg_temp.as_user(ub, cb);
  perform public.pf_save_project(cb, pb, '{"name": "ЖК Бета 055"}');
  perform public.pf_save_place(pb, kb, null, 'object', 'Корпус Б', 'building');
  perform public.pf_fill_object(kb, 1, 1, 1);
  perform pg_temp.as_user(uc, cc);
  perform public.pf_save_project(cc, pc, '{"name": "ЖК Ядро 055"}');
  perform public.pf_save_place(pc, kc, null, 'object', 'Корпус В', 'building');
  perform public.pf_fill_object(kc, 1, 1, 1);
  reset role;
  -- инженер — участник проекта pn без права вести места; uout — участник только другого проекта
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values (ca, ueng, r_eng, pn), (ca, uout, r_eng, pn2);
  s1 := pg_temp.kid(k1, 'Секция 1'); f1 := pg_temp.kid(s1, 'эт. 1'); f2 := pg_temp.kid(s1, 'эт. 2');
  a1 := pg_temp.kid(f1, 'кв. 1'); a2 := pg_temp.kid(f1, 'кв. 2'); a3 := pg_temp.kid(f2, 'кв. 3');
  fb := pg_temp.kid(pg_temp.kid(kb, 'Секция 1'), 'эт. 1');
  fc := pg_temp.kid(pg_temp.kid(kc, 'Секция 1'), 'эт. 1'); ac := pg_temp.kid(fc, 'кв. 1');
  res := res || pg_temp.t(f1 is not null and a1 is not null and fb is not null and ac is not null
                          and exists (select 1 from quality.location_nodes where core_company_id = ca and id = f1::text)
                          and not exists (select 1 from quality.location_nodes where core_company_id = cc),
                          'засев: места, зеркало мест Альфы, у «Только ядро» узлов Качества нет');

  -- 1. Бакет
  res := res || pg_temp.t((select not public and file_size_limit = 52428800 and allowed_mime_types = array['application/pdf']
                             from storage.buckets where id = 'core-place-plans'), 'бакет закрытый, PDF, 50 МБ');

  -- 2. Файлы: кто кладёт
  perform pg_temp.as_user(ueng, ca);
  str := pg_temp.put(pg_temp.path(f1, dx));
  reset role;
  res := res || pg_temp.t(str like '42501%', 'файл: участник без права вести места — отказ (' || str || ')');
  perform pg_temp.as_user(ub, cb);
  str := pg_temp.put(pg_temp.path(f1, dx));
  reset role;
  res := res || pg_temp.t(str like '42501%', 'файл: чужая компания в путь Альфы — отказ (' || str || ')');
  perform pg_temp.as_user(null, null);
  str := pg_temp.put(pg_temp.path(f1, dx));
  reset role;
  res := res || pg_temp.t(str like '42501%', 'файл: аноним — отказ (' || str || ')');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.put(ca || '/' || pn || '/' || f1 || '/план.pdf') like '42501%'
                          and pg_temp.put(ca || '/' || pn2 || '/' || f1 || '/' || dx || '.pdf') like '42501%'
                          and pg_temp.put(ca || '/' || pn || '/' || s1 || '/' || dx || '.pdf') like '42501%'
                          and pg_temp.put(ca || '/' || pn || '/' || f1 || '/' || dx || '.png') like '42501%'
                          and pg_temp.put(cb || '/' || pb || '/' || fb || '/' || dx || '.pdf') like '42501%'
                          and pg_temp.put(ca || '/' || f1 || '/' || dx || '.pdf') like '42501%',
                          'файл: путь не того места / не uuid / секция / не .pdf / чужая компания / без проекта — отказ');
  res := res || pg_temp.t(pg_temp.put(pg_temp.path(f1, d1)) = 'OK' and pg_temp.put(pg_temp.path(f1, d2)) = 'OK'
                          and pg_temp.put(pg_temp.path(f1, d3)) = 'OK' and pg_temp.put(pg_temp.path(a1, da)) = 'OK'
                          and pg_temp.put(pg_temp.path(a1, da2)) = 'OK' and pg_temp.put(pg_temp.path(f1, dbig)) = 'OK',
                          'файл: ведущий места кладёт планы этажа и квартиры');
  -- перезаписать и удалить — никто
  perform pg_temp.msg(format('update storage.objects set name = %L where bucket_id = %L and name = %L', pg_temp.path(f2, d1), 'core-place-plans', pg_temp.path(f1, d1)));
  perform pg_temp.msg(format('delete from storage.objects where bucket_id = %L and name = %L', 'core-place-plans', pg_temp.path(f1, d1)));
  reset role;
  res := res || pg_temp.t((select count(*) from storage.objects where bucket_id = 'core-place-plans' and name = pg_temp.path(f1, d1)) = 1,
                          'файл: ведущий места не перезаписывает и не удаляет');
  perform pg_temp.as_user(ub, cb);
  res := res || pg_temp.t(pg_temp.put(pg_temp.path(fb, dx)) = 'OK', 'файл: Бета кладёт в свой проект');
  reset role;

  -- 3. Файлы: кто читает
  perform pg_temp.as_user(ueng, ca); n := pg_temp.seen(pg_temp.path(f1, d1)); reset role;
  res := res || pg_temp.t(n = 1, 'файл: участник проекта видит');
  perform pg_temp.as_user(uout, ca); n := pg_temp.seen(pg_temp.path(f1, d1)); reset role;
  res := res || pg_temp.t(n = 0, 'файл: участник другого проекта не видит');
  perform pg_temp.as_user(ub, cb); n := pg_temp.seen(pg_temp.path(f1, d1)); reset role;
  res := res || pg_temp.t(n = 0, 'файл: чужая компания не видит');
  perform pg_temp.as_user(uadm, ca); n := pg_temp.seen(pg_temp.path(fb, dx)); reset role;
  res := res || pg_temp.t(n = 0, 'файл: Альфа не видит файл Беты');
  perform pg_temp.as_user(null, null); n := pg_temp.seen(pg_temp.path(f1, d1)); reset role;
  res := res || pg_temp.t(n = 0, 'файл: аноним не видит');

  -- 3б. Широкое разрешающее правило ко всем бакетам (как прежнее «админ РБИ», 018d/042): ограничивающие правила 055 держат бакет
  create policy p2_0057_wide on storage.objects for all to authenticated using (true) with check (true);
  perform pg_temp.as_user(uadm, ca);
  perform pg_temp.msg(format('delete from storage.objects where bucket_id = %L and name = %L', 'core-place-plans', pg_temp.path(f1, d2)));
  perform pg_temp.msg(format('update storage.objects set name = %L where bucket_id = %L and name = %L', pg_temp.path(f2, d2), 'core-place-plans', pg_temp.path(f1, d2)));
  reset role;
  perform pg_temp.as_user(ueng, ca); str := pg_temp.put(pg_temp.path(f1, dx)); reset role;
  perform pg_temp.as_user(ub, cb); n := pg_temp.seen(pg_temp.path(f1, d1)); reset role;
  res := res || pg_temp.t((select count(*) from storage.objects where bucket_id = 'core-place-plans' and name = pg_temp.path(f1, d2)) = 1
                          and str like '42501%' and n = 0,
                          'широкое правило: файл не удалён и не переименован, участник без права не кладёт, чужая компания не видит');
  drop policy p2_0057_wide on storage.objects;

  -- 4. Версии этажа: первая → текущая → копия этажа (строки этажа не было — создана)
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.add(f1, d1, 'Этаж 1.pdf', 120000);
  reset role;
  res := res || pg_temp.t(str like '{%' and (str::jsonb ->> 'version_no')::int = 1 and pg_temp.cur(f1) = d1
                          and pg_temp.floor_url(ca, f1) = pg_temp.url(f1, d1),
                          'версия 1: текущая, копия в construction_floors_v2 (' || str || ' / ' || pg_temp.floor_url(ca, f1) || ')');
  select * into v_row from quality.construction_floors_v2 where core_company_id = ca and "locationId" = f1::text;
  res := res || pg_temp.t(v_row.pdf_name = 'Этаж 1.pdf' and v_row.pdf_size = '120000' and v_row.is_active and v_row.core_id is not null
                          and v_row.core_location_node_id is not null,
                          'копия этажа: имя, размер, активна, номер и связь моста 054 заполнены');
  v_ver := v_row.version;
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.add(f1, d1, 'Этаж 1.pdf', 120000);
  reset role;
  res := res || pg_temp.t((str::jsonb ->> 'repeat')::boolean and (select count(*) from core.place_documents where location_id = f1) = 1
                          and (select version from quality.construction_floors_v2 where core_company_id = ca and "locationId" = f1::text) = v_ver,
                          'повтор той же версии: прежний ответ, копия не тронута');
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.add(f1, d2, 'Этаж 1 изм.pdf', 130000);
  reset role;
  res := res || pg_temp.t((str::jsonb ->> 'version_no')::int = 2 and (str::jsonb ->> 'previous')::uuid = d1 and pg_temp.cur(f1) = d2
                          and pg_temp.floor_url(ca, f1) = pg_temp.url(f1, d2)
                          and (select count(*) from quality.construction_floors_v2 where core_company_id = ca and "locationId" = f1::text) = 1,
                          'версия 2: текущая, первая — в списке, копия обновлена той же строкой (' || pg_temp.floor_url(ca, f1) || ')');
  perform pg_temp.as_user(uadm, ca);
  j := public.pf_set_place_plan(d1);
  reset role;
  res := res || pg_temp.t(pg_temp.cur(f1) = d1 and pg_temp.floor_url(ca, f1) = pg_temp.url(f1, d1) and (j ->> 'previous')::uuid = d2,
                          'сделать текущей первую: копия — первая');
  perform pg_temp.as_user(uadm, ca);
  j := public.pf_remove_place_plan(f1);
  reset role;
  res := res || pg_temp.t(pg_temp.cur(f1) is null and pg_temp.floor_url(ca, f1) = 'NULL'
                          and (select count(*) from core.place_documents where location_id = f1 and deleted_at is null) = 2,
                          'снять: текущей нет, копия пуста, обе версии остались (' || pg_temp.floor_url(ca, f1) || ')');
  perform pg_temp.as_user(uadm, ca);
  j := public.pf_set_place_plan(d2);
  reset role;
  res := res || pg_temp.t(pg_temp.cur(f1) = d2 and pg_temp.floor_url(ca, f1) = pg_temp.url(f1, d2), '«Отменить» снятие: вторая снова текущая');
  res := res || pg_temp.t((select count(*) from core.audit_log where table_name = 'place_documents' and record_id in (d1, d2)) >= 5
                          and exists (select 1 from core.audit_log where table_name = 'place_documents' and action = 'REMOVE_CURRENT' and actor = uadm),
                          'журнал: загрузки, «сделать текущей», «снять» — с автором');

  -- 5. Квартира: помещения СК не было — заведено с планом
  res := res || pg_temp.t(pg_temp.unit_url(ca, a1) = 'нет строки', 'до плана помещения СК квартиры нет');
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.add(a1, da, 'кв 1.pdf', 5000);
  reset role;
  res := res || pg_temp.t(pg_temp.unit_url(ca, a1) = pg_temp.url(a1, da)
                          and (select type = 'КВ' and status = 'not_inspected' and name = 'кв. 1' from quality.construction_units_v2
                                where core_company_id = ca and "locationId" = a1::text),
                          'квартира: помещение СК заведено с планом (' || pg_temp.unit_url(ca, a1) || ')');
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.add(a1, da2, 'кв 1 изм.pdf', 5000);
  reset role;
  res := res || pg_temp.t(pg_temp.unit_url(ca, a1) = pg_temp.url(a1, da2), 'квартира: вторая версия — та же строка помещения');

  -- 6. Отказы RPC
  perform pg_temp.as_user(ueng, ca);
  str := pg_temp.add(f1, d3);
  reset role;
  res := res || pg_temp.t(str like '42501%', 'RPC: участник без права вести места — отказ (' || str || ')');
  perform pg_temp.as_user(ub, cb);
  str := pg_temp.add(f1, d3);
  reset role;
  res := res || pg_temp.t(str like '42501%', 'RPC: чужая компания — отказ (' || str || ')');
  perform pg_temp.as_user(null, null);
  str := pg_temp.msg(format('select public.pf_add_place_plan(%L, %L, %L, %L, 1)', f1, d3, pg_temp.url(f1, d3), 'a.pdf'));
  reset role;
  res := res || pg_temp.t(str like '42501%', 'RPC: аноним — отказ (' || str || ')');
  perform pg_temp.as_user(uadm, ca);
  res := res || pg_temp.t(pg_temp.add(f1, d3, 'План.docx') like '22023%Нужен файл PDF%', 'RPC: не PDF — отказ');
  res := res || pg_temp.t(pg_temp.add(f1, dbig, 'big.pdf', 52428801) like '22023%50 МБ%', 'RPC: больше 50 МБ — отказ');
  res := res || pg_temp.t(pg_temp.val(format('select public.pf_add_place_plan(%L, %L, %L, %L, 1)::text', f1, d3, pg_temp.url(f2, d3), 'a.pdf')) like '22023%Ссылка%'
                          and pg_temp.val(format('select public.pf_add_place_plan(%L, %L, %L, %L, 1)::text', f1, d3,
                                                 replace(pg_temp.url(f1, d3), 'core-place-plans', 'quality-custom-assets'), 'a.pdf')) like '22023%Ссылка%',
                          'RPC: ссылка на файл другого места или бакета — отказ');
  res := res || pg_temp.t(pg_temp.add(f2, dc) like '22023%не загружен%', 'RPC: файл не загружен — отказ');
  res := res || pg_temp.t(pg_temp.add(s1, dsec) like '22023%этаж или квартиру%', 'RPC: секция — отказ');
  res := res || pg_temp.t(pg_temp.add(f2, d1) like '22023%занят%', 'RPC: id версии другого места — отказ');
  reset role;
  res := res || pg_temp.t((select count(*) from core.place_documents where location_id in (f1, f2, s1)) = 2,
                          'после отказов версий не прибавилось');

  -- 7. Список версий
  perform pg_temp.as_user(ueng, ca);
  str := pg_temp.val(format('select count(*)::text from public.pf_place_plans(%L)', pn));
  j := (select jsonb_agg(to_jsonb(x)) from public.pf_place_plans(pn) x where x.location_id = f1);
  reset role;
  res := res || pg_temp.t(str = '4' and (j -> 0 ->> 'version_no')::int = 2 and (j -> 0 ->> 'is_current')::boolean
                          and j -> 0 ->> 'author' = 'Админ Альфы' and not (j -> 1 ->> 'is_current')::boolean,
                          'список: участник видит 4 версии; новые сверху, автор по имени (' || str || ')');
  perform pg_temp.as_user(uout, ca);
  str := pg_temp.val(format('select count(*)::text from public.pf_place_plans(%L)', pn));
  reset role;
  res := res || pg_temp.t(str like '42501%', 'список: участник другого проекта — отказ (' || str || ')');
  perform pg_temp.as_user(ub, cb);
  str := pg_temp.val(format('select count(*)::text from public.pf_place_plans(%L)', pn));
  reset role;
  res := res || pg_temp.t(str like '42501%', 'список: чужая компания — отказ (' || str || ')');
  perform pg_temp.as_user(ub, cb);
  str := pg_temp.val('select count(*)::text from core.place_documents');
  reset role;
  res := res || pg_temp.t(str = '0' or str like '42501%', 'таблица: чужая компания строк Альфы не видит (' || str || ')');
  res := res || pg_temp.t(not has_function_privilege('anon', 'public.pf_place_plans(uuid)', 'execute')
                          and not has_function_privilege('anon', 'public.pf_add_place_plan(uuid,uuid,text,text,bigint)', 'execute')
                          and not has_function_privilege('authenticated', 'quality.mirror_place_plan(uuid)', 'execute')
                          and not has_function_privilege('authenticated', 'core.plan_place(uuid)', 'execute'),
                          'аноним функции не вызывает; зеркало и служебные — никому');

  -- 8. Защита в модулях (инженер с правом дерева Качества и СК)
  perform pg_temp.as_user(ueng, ca);
  str := pg_temp.msg(format('update quality.construction_floors_v2 set pdf_url = %L, version = version + 1 where core_company_id = %L and "locationId" = %L',
                            'https://api.test.invalid/storage/v1/object/public/quality-custom-assets/' || ca || '/location_plans/x/plan_1.pdf', ca, f1));
  reset role;
  res := res || pg_temp.t(str like '42501%Компания%' and pg_temp.floor_url(ca, f1) = pg_temp.url(f1, d2),
                          'модуль: своя ссылка на план этажа ядра — отказ (' || str || ')');
  perform pg_temp.as_user(ueng, ca);
  str := pg_temp.msg(format('update quality.construction_floors_v2 set pdf_url = %L, pdf_name = %L, name = %L, version = version + 1 where core_company_id = %L and "locationId" = %L',
                            pg_temp.url(f1, d1), 'старое.pdf', 'эт. 1 (план)', ca, f1));
  reset role;
  res := res || pg_temp.t(str = 'OK' and pg_temp.floor_url(ca, f1) = pg_temp.url(f1, d2)
                          and (select name from quality.construction_floors_v2 where core_company_id = ca and "locationId" = f1::text) = 'эт. 1 (план)',
                          'модуль: старая копия устройства (прежняя версия) — запись прошла, план остался текущим');
  perform pg_temp.as_user(ueng, ca);
  str := pg_temp.msg(format('update quality.construction_floors_v2 set is_deleted = true, deleted_at = now() where core_company_id = %L and "locationId" = %L', ca, f1));
  reset role;
  res := res || pg_temp.t(str like '42501%' and pg_temp.floor_url(ca, f1) = pg_temp.url(f1, d2), 'модуль: пометить план этажа ядра удалённым — отказ');
  perform pg_temp.as_user(ueng, ca);
  str := pg_temp.msg(format('insert into quality.construction_floors_v2 (id, "locationId", name, pdf_url) values (%L, %L, %L, %L)',
                            gen_random_uuid(), f2, 'эт. 2', 'https://x.invalid/a.pdf'));
  reset role;
  res := res || pg_temp.t(str like '42501%' and pg_temp.floor_url(ca, f2) = 'нет строки', 'модуль: новый план этажа ядра — отказ');
  perform pg_temp.as_user(ueng, ca);
  v_unit := gen_random_uuid()::text;
  str := pg_temp.msg(format('insert into quality.construction_units_v2 (id, "locationId", name, type, status) values (%L, %L, %L, %L, %L)',
                            v_unit, a2, 'кв. 2', 'КВ', 'not_inspected'));
  reset role;
  res := res || pg_temp.t(str = 'OK' and pg_temp.unit_url(ca, a2) = 'NULL', 'модуль: помещение без плана заводится как раньше');
  perform pg_temp.as_user(ueng, ca);
  str := pg_temp.msg(format('update quality.construction_units_v2 set pdf_url = %L where core_company_id = %L and id = %L', 'https://x.invalid/b.pdf', ca, v_unit));
  reset role;
  res := res || pg_temp.t(str like '42501%', 'модуль: свой план квартиры ядра — отказ');
  perform pg_temp.as_user(ueng, ca);
  str := pg_temp.msg(format('update quality.construction_units_v2 set status = %L, pdf_url = null, pdf_name = null, version = version + 1 where core_company_id = %L and "locationId" = %L',
                            'accepted', ca, a1));
  reset role;
  res := res || pg_temp.t(str = 'OK' and pg_temp.unit_url(ca, a1) = pg_temp.url(a1, da2)
                          and (select status from quality.construction_units_v2 where core_company_id = ca and "locationId" = a1::text) = 'accepted',
                          'модуль: статус квартиры с устройства со старой копией (без плана) — статус записан, план остался');

  -- 9. Проект «Качество»: места ведёт Качество — загрузка в Компании — отказ; план в модуле — как раньше
  perform pg_temp.as_user(ueng, ca);
  insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id)
  values ('obj-q55', null, 'object', 'ЖК Старый 055', 'жк старый 055', 0, ca);
  reset role;
  select quality.node_root_project(q) into pq from quality.location_nodes q where q.core_company_id = ca and q.id = 'obj-q55';
  update core.projects set places_master = 'quality' where id = pq;
  perform pg_temp.as_user(ueng, ca);
  insert into quality.location_nodes(id, "parentId", "nodeType", "displayName", canonical_key, sort_order, core_company_id) values
    ('qb-55', 'obj-q55', 'building', 'Корпус 1', 'корпус 1', 1, ca), ('qf-55', 'qb-55', 'floor', 'эт. 1', 'эт. 1', 1, ca);
  str := pg_temp.msg(format('insert into quality.construction_floors_v2 (id, "locationId", name, pdf_url) values (%L, %L, %L, %L)',
                            'qplan-55', 'qf-55', 'эт. 1', 'https://x.invalid/q1.pdf'));
  str := str || ' / ' || pg_temp.msg(format('update quality.construction_floors_v2 set pdf_url = %L where core_company_id = %L and id = %L',
                                             'https://x.invalid/q2.pdf', ca, 'qplan-55'));
  reset role;
  select core_location_id into fq from quality.location_nodes where core_company_id = ca and id = 'qf-55';
  res := res || pg_temp.t(str = 'OK / OK' and fq is not null, 'проект «Качество»: план этажа в модуле — как раньше (' || str || ')');
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.msg(format('select public.pf_add_place_plan(%L, %L, %L, %L, 1)', fq, dq, 'https://x.invalid/' || dq || '.pdf', 'q.pdf'));
  reset role;
  res := res || pg_temp.t(str like '42501%Качестве%', 'проект «Качество»: загрузка в Компании — отказ (' || str || ')');

  -- 10. Без модулей: план в ядре есть, копии нет; модуль выключен — копии нет
  perform pg_temp.as_user(uc, cc);
  str := pg_temp.put(pg_temp.path(fc, dc)) || ' ' || pg_temp.put(pg_temp.path(ac, dca));
  str := str || ' ' || pg_temp.add(fc, dc) || ' ' || pg_temp.add(ac, dca);
  reset role;
  res := res || pg_temp.t(pg_temp.cur(fc) = dc and pg_temp.cur(ac) = dca
                          and not exists (select 1 from quality.construction_floors_v2 where core_company_id = cc)
                          and not exists (select 1 from quality.construction_units_v2 where core_company_id = cc),
                          'только ядро: планы есть, копий в Качество / СК нет (' || left(str, 200) || ')');
  update core.company_modules set enabled = false where company_id = ca and module = 'construction';
  perform pg_temp.as_user(uadm, ca);
  str := pg_temp.put(pg_temp.path(a3, d3)) || ' ' || pg_temp.add(a3, d3);
  reset role;
  res := res || pg_temp.t(pg_temp.cur(a3) = d3 and pg_temp.unit_url(ca, a3) = 'нет строки',
                          'СК выключен: план квартиры в ядре, помещения и копии нет (' || left(str, 120) || ')');
  update core.company_modules set enabled = true where company_id = ca and module = 'construction';

  -- 11. Точки замечаний на плане места
  insert into quality.construction_defects_v2 (id, "locationId", x, y, core_company_id) values
    (gen_random_uuid()::text, f1::text, 10, 20, ca), (gen_random_uuid()::text, f1::text, null, null, ca);
  insert into quality.rbi_inspections (id, project_code, metrics, core_company_id)
  values (gen_random_uuid()::text, pn::text, jsonb_build_object('planPin', jsonb_build_object('locationId', f1::text, 'x', 33, 'y', 44)), ca);
  perform pg_temp.as_user(ueng, ca);
  str := pg_temp.val(format('select public.pf_place_pins(%L)::text', f1));
  reset role;
  res := res || pg_temp.t(str = '2', 'точки: замечание СК с координатами + проверка Качества с точкой = 2 (' || str || ')');
  perform pg_temp.as_user(ub, cb);
  str := pg_temp.val(format('select public.pf_place_pins(%L)::text', f1));
  reset role;
  res := res || pg_temp.t(str like '42501%', 'точки: чужая компания — отказ');

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
