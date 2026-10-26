-- P2-0019: тест 027_fact_force_approval — пачка факта «Закрыть через РП» (p_require_approval): все строки ждут РП даже без
-- перебора, пометка и журнал; без флага — как в 009; очередь и решение РП; права, чужая компания, архив, 501 строка, откат пачки.
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 027_fact_force_approval_up.sql.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
-- Выполнить запрос; вернуть 'OK' или 'sqlstate: сообщение' (ошибка откатывается в подтранзакции).
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then 'OK ' || l else 'FAIL ' || l end || E'\n' $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); ufor2 uuid := gen_random_uuid();
  upm uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid; pa2 uuid; pb uuid;
  r_adm uuid; r_pto uuid; r_for uuid; r_pm uuid; r_badm uuid;
  bld uuid; f5 uuid; f6 uuid; kv uuid; m2 uuid; wt uuid; wt2 uuid; wtb uuid; secb uuid;
  imp uuid; impb uuid; imp2 uuid; pos5 uuid; pos6 uuid; posk uuid; posb uuid; pos2 uuid;
  b1 uuid; b2 uuid; b3 uuid; bb uuid; j jsonb; e1 uuid; e2 uuid; e3 uuid; e4 uuid; n int; t text; res text := '';
  e15 uuid; e5 uuid; ufor3 uuid := gen_random_uuid(); r_view uuid; tot record; today date := (now() at time zone 'Europe/Moscow')::date; batch1 uuid; cnt_before int;
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,ufor2,upm,ubadm]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor),(ca,ufor2),(ca,upm),(cb,ubadm);
  select id into r_adm from core.company_roles where company_id=ca and template_code='company_admin';
  select id into r_pto from core.company_roles where company_id=ca and template_code='pto';
  select id into r_for from core.company_roles where company_id=ca and template_code='foreman';
  select id into r_pm  from core.company_roles where company_id=ca and template_code='project_manager';
  select id into r_badm from core.company_roles where company_id=cb and template_code='company_admin';
  insert into core.role_assignments(company_id,user_id,role_id,project_id) values
    (ca,uadm,r_adm,null),(ca,upto,r_pto,null),(ca,ufor,r_for,null),(ca,ufor2,r_for,null),(ca,upm,r_pm,null),(cb,ubadm,r_badm,null);
  select id into m2 from core.units where company_id is null and code = 'м²';

  -- 0. Каталог и шаблоны ролей
  select count(*) into n from core.permission_catalog where action in ('planfact.fact.approve', 'planfact.brigades.manage');
  res := res || pg_temp.t(n = 2, 'действия fact.approve и brigades.manage в каталоге');
  select string_agg(r.template_code, ',' order by r.template_code) into t from core.company_role_permissions rp
    join core.company_roles r on r.id = rp.role_id where r.company_id = ca and rp.action = 'planfact.fact.approve';
  res := res || pg_temp.t(t = 'company_admin,project_manager', 'fact.approve: только админ и РП (получено: ' || coalesce(t, '-') || ')');
  select string_agg(r.template_code, ',' order by r.template_code) into t from core.company_role_permissions rp
    join core.company_roles r on r.id = rp.role_id where r.company_id = ca and rp.action = 'planfact.brigades.manage';
  res := res || pg_temp.t(t = 'company_admin,project_manager,pto', 'brigades.manage: админ, РП, ПТО (получено: ' || coalesce(t, '-') || ')');

  select string_agg(r.template_code, ',' order by r.template_code) into t from core.company_role_permissions rp
    join core.company_roles r on r.id = rp.role_id where r.company_id = ca and rp.action = 'planfact.fact.view';
  res := res || pg_temp.t(t like 'company_admin%', 'fact.view есть и у администратора (получено: ' || coalesce(t, '-') || ')');

  -- 1. Подготовка: проект Альфы с местами и тремя позициями (план 100 / 20 / 50), проект Беты
  reset role; perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Факт');
  pa2 := public.pf_create_project(ca, 'ЖК Архив');
  select fact_tolerance_pct into tot from core.projects where id = pa;
  res := res || pg_temp.t((select fact_tolerance_pct from core.projects where id = pa) = 2, 'допуск перебора по умолчанию 2 %');
  bld := public.pf_add_location(pa, null, 'building', 'Корпус 1');
  f5 := public.pf_add_location(pa, bld, 'floor', '5 этаж');
  f6 := public.pf_add_location(pa, bld, 'floor', '6 этаж');
  kv := public.pf_add_location(pa, f5, 'apartment', 'Кв. 1');
  reset role; perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка стен', m2);
  wt2 := public.pf_vor_add_work_type(pa, 'Окраска стен', m2);
  imp := public.pf_vor_create_import(pa, 'вор.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, '[{"row_no": 12, "kind": "work", "name": "Штукатурка стен", "unit_text": "м2", "qty": 100},
    {"row_no": 13, "kind": "work", "name": "Окраска стен", "unit_text": "м2", "qty": 20},
    {"row_no": 14, "kind": "work", "name": "Штукатурка стен 6", "unit_text": "м2", "qty": 50}]');
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(
    jsonb_build_object('row_no', 12, 'location_id', f5, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 13, 'location_id', kv, 'work_type_id', wt2, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 14, 'location_id', f6, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp);
  select id into pos5 from planfact.vor_positions where project_id = pa and location_id = f5;
  select id into posk from planfact.vor_positions where project_id = pa and location_id = kv;
  select id into pos6 from planfact.vor_positions where project_id = pa and location_id = f6;
  -- архивный проект с позицией
  reset role; perform pg_temp.as_user(uadm);
  wt2 := wt2; secb := public.pf_add_location(pa2, null, 'section', 'Секция А');
  reset role; perform pg_temp.as_user(upto);
  imp2 := public.pf_vor_create_import(pa2, 'арх.xlsx', repeat('d', 64), 'Лист');
  perform public.pf_vor_add_rows(imp2, '[{"row_no": 12, "kind": "work", "name": "Штукатурка стен", "unit_text": "м2", "qty": 10}]');
  perform public.pf_vor_resolve_rows(imp2, jsonb_build_array(jsonb_build_object('row_no', 12, 'location_id', secb, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp2);
  select id into pos2 from planfact.vor_positions where project_id = pa2;
  reset role; perform pg_temp.as_user(ubadm);
  pb := public.pf_create_project(cb, 'ЖК Беты');
  secb := public.pf_add_location(pb, null, 'section', 'Секция Б');
  wtb := public.pf_vor_add_work_type(pb, 'Работа Беты', m2);
  impb := public.pf_vor_create_import(pb, 'бета.xlsx', repeat('b', 64), 'Лист');
  perform public.pf_vor_add_rows(impb, '[{"row_no": 12, "kind": "work", "name": "Работа Беты", "unit_text": "м2", "qty": 30}]');
  perform public.pf_vor_resolve_rows(impb, jsonb_build_array(jsonb_build_object('row_no', 12, 'location_id', secb, 'work_type_id', wtb, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(impb);
  select id into posb from planfact.vor_positions where project_id = pb;
  bb := public.pf_brigade_save(cb, null, 'Бригада Беты');
  reset role; perform pg_temp.as_user(uadm);
  perform public.pf_update_project(pa2, 'ЖК Архив', null, true);

  reset role; perform pg_temp.as_user(upto);
  b1 := public.pf_brigade_save(ca, null, 'Иванов');
  b2 := public.pf_brigade_save(ca, null, 'Петров');

  -- 1. Сигнатура: одна функция, флаг по умолчанию false
  reset role;
  select count(*) into n from pg_proc where proname = 'pf_fact_add_batch' and pronamespace = 'public'::regnamespace;
  res := res || pg_temp.t(n = 1, 'одна функция pf_fact_add_batch (получено: ' || n || ')');
  res := res || pg_temp.t(to_regprocedure('public.pf_fact_add_batch(uuid,uuid,date,jsonb,integer,text,boolean)') is not null,
    'есть параметр p_require_approval');
  res := res || pg_temp.t(not has_function_privilege('anon', 'public.pf_fact_add_batch(uuid,uuid,date,jsonb,integer,text,boolean)', 'execute'),
    'anon: пачка закрыта');
  res := res || pg_temp.t(has_function_privilege('authenticated', 'public.pf_fact_add_batch(uuid,uuid,date,jsonb,integer,text,boolean)', 'execute'),
    'authenticated: пачка доступна (права проверяет функция)');

  -- 2. Без флага — как в 009: в пределах плана → accepted, перебор → pending_approval
  reset role; perform pg_temp.as_user(ufor);
  j := public.pf_fact_add_batch(pa, b1, today, jsonb_build_array(
         jsonb_build_object('position_id', pos5, 'qty', 10), jsonb_build_object('position_id', posk, 'qty', 25)));
  res := res || pg_temp.t((j ->> 'accepted')::int = 1 and (j ->> 'pending')::int = 1, 'без флага (6 параметров): 1 принята, 1 перебор ждёт РП (' || j::text || ')');
  select count(*) into n from planfact.fact_entries where batch_id = (j ->> 'batch_id')::uuid and note is null;
  res := res || pg_temp.t(n = 2, 'без флага пометка не добавляется');
  j := public.pf_fact_add_batch(pa, b1, today, jsonb_build_array(jsonb_build_object('position_id', pos6, 'qty', 5)), null, 'с пометкой', false);
  res := res || pg_temp.t((j ->> 'accepted')::int = 1 and (j ->> 'pending')::int = 0, 'флаг false — как без флага');
  select count(*) into n from planfact.fact_entries where batch_id = (j ->> 'batch_id')::uuid and note = 'с пометкой' and status = 'accepted';
  res := res || pg_temp.t(n = 1, 'флаг false: пометка как ввёл прораб');

  -- 3. С флагом: все строки ждут РП даже без перебора; пометка и журнал
  j := public.pf_fact_add_batch(pa, b2, today, jsonb_build_array(
         jsonb_build_object('position_id', pos5, 'qty', 90), jsonb_build_object('position_id', pos6, 'qty', 45)), 3, 'остаток', true);
  batch1 := (j ->> 'batch_id')::uuid;
  res := res || pg_temp.t((j ->> 'accepted')::int = 0 and (j ->> 'pending')::int = 2, 'через РП: 0 принято, 2 ждут РП (' || j::text || ')');
  select count(*) into n from planfact.fact_entries where batch_id = batch1 and status = 'pending_approval'
    and note = 'Закрытие через РП. остаток' and workers = 3 and brigade_id = b2 and created_by = ufor;
  res := res || pg_temp.t(n = 2, 'через РП: статус, пометка «Закрытие через РП», люди, бригада, автор');
  select fact_qty into tot from public.pf_fact_position_totals(pa) where position_id = pos5;
  res := res || pg_temp.t(tot.fact_qty = 10, 'через РП: в итог факта не вошло до решения РП (факт ' || tot.fact_qty || ')');
  j := public.pf_fact_add_batch(pa, b2, today, jsonb_build_array(jsonb_build_object('position_id', posk, 'qty', 30)), null, null, true);
  select count(*) into n from planfact.fact_entries where batch_id = (j ->> 'batch_id')::uuid and note = 'Закрытие через РП' and status = 'pending_approval';
  res := res || pg_temp.t(n = 1 and (j ->> 'pending')::int = 1, 'через РП без своей пометки; строка с перебором (30 из 20) — ждёт РП по правилу перебора');
  reset role; perform pg_temp.as_user(uadm);
  select count(*) into n from public.pf_list_company_audit(ca, 200) a where a.table_name = 'fact_entries' and a.action = 'FORCE_PENDING';
  res := res || pg_temp.t(n = 2, 'журнал: FORCE_PENDING на каждую строку, принятую по допуску (получено: ' || n || ')');
  select count(*) into n from public.pf_list_company_audit(ca, 200) a where a.table_name = 'fact_entries' and a.action = 'INSERT'
    and a.record_id in (select id from planfact.fact_entries where batch_id = batch1);
  res := res || pg_temp.t(n = 2, 'журнал: INSERT по строкам пачки через РП');

  -- 4. Очередь РП и решение
  reset role; perform pg_temp.as_user(upm);
  select count(*) into n from public.pf_fact_pending(pa) p where p.note like 'Закрытие через РП%';
  res := res || pg_temp.t(n = 3, 'РП видит «через РП» в «Ждёт подтверждения» (получено: ' || n || ')');
  select id into e1 from planfact.fact_entries where batch_id = batch1 and position_id = pos5;
  select id into e2 from planfact.fact_entries where batch_id = batch1 and position_id = pos6;
  perform public.pf_fact_decide(e1, true, 'ок');
  perform public.pf_fact_decide(e2, false, 'не выполнено');
  select fact_qty into tot from public.pf_fact_position_totals(pa) where position_id = pos5;
  res := res || pg_temp.t(tot.fact_qty = 100, 'РП подтвердил — в итоге (факт ' || tot.fact_qty || ')');
  select fact_qty into tot from public.pf_fact_position_totals(pa) where position_id = pos6;
  res := res || pg_temp.t(tot.fact_qty = 5, 'РП отклонил — не в итоге (факт ' || tot.fact_qty || ')');
  select count(*) into n from public.pf_fact_history(pos6) h where h.status = 'rejected' and h.decision_note = 'не выполнено' and h.note like 'Закрытие через РП%';
  res := res || pg_temp.t(n = 1, 'история позиции: «через РП», отклонено с причиной');

  -- 5. Права и границы
  reset role; perform pg_temp.as_user(upm);   -- РП: fact.create есть? проверяем по каталогу ниже; прораб Беты — чужая компания
  reset role; perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select public.pf_fact_add_batch(%L, %L, %L, %L::jsonb, null, null, true)', pa, bb, today,
        jsonb_build_array(jsonb_build_object('position_id', pos5, 'qty', 1))));
  res := res || pg_temp.t(t like '42501%', 'чужая компания: отказ (' || t || ')');
  -- человек компании без права fact.create
  reset role;
  insert into auth.users(id, email) values (ufor3, ufor3 || '@test.invalid');
  insert into core.company_members(company_id, user_id) values (ca, ufor3);
  select r.id into r_view from core.company_roles r where r.company_id = ca
    and not exists (select 1 from core.company_role_permissions rp where rp.role_id = r.id and rp.action = 'planfact.fact.create')
    and exists (select 1 from core.company_role_permissions rp where rp.role_id = r.id and rp.action = 'planfact.fact.view') limit 1;
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values (ca, ufor3, r_view, null);
  perform pg_temp.as_user(ufor3);
  t := pg_temp.err(format('select public.pf_fact_add_batch(%L, %L, %L, %L::jsonb, null, null, true)', pa, b1, today,
        jsonb_build_array(jsonb_build_object('position_id', pos6, 'qty', 1))));
  res := res || pg_temp.t(r_view is not null and t like '42501%', 'без fact.create (только просмотр): отказ (' || t || ')');
  reset role; perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select public.pf_fact_add_batch(%L, %L, %L, %L::jsonb, null, null, true)', pa2, b1, today,
        jsonb_build_array(jsonb_build_object('position_id', pos2, 'qty', 1))));
  res := res || pg_temp.t(t like '22023%архив%', 'проект в архиве: отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_add_batch(%L, %L, %L, %L::jsonb, null, null, true)', pa, b1, today,
        (select jsonb_agg(jsonb_build_object('position_id', gen_random_uuid(), 'qty', 1)) from generate_series(1, 501))));
  res := res || pg_temp.t(t like '22023%500%', '501 строка: отказ (' || t || ')');
  select count(*) into cnt_before from planfact.fact_entries;
  t := pg_temp.err(format('select public.pf_fact_add_batch(%L, %L, %L, %L::jsonb, null, null, true)', pa, b1, today,
        jsonb_build_array(jsonb_build_object('position_id', pos6, 'qty', 1), jsonb_build_object('position_id', posb, 'qty', 1))));
  select count(*) into n from planfact.fact_entries;
  res := res || pg_temp.t(t like '22023%' and n = cnt_before, 'чужая позиция в пачке через РП: отказ, пачка откатана целиком (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_add_batch(%L, %L, %L, %L::jsonb, null, %L, true)', pa, b1, today,
        jsonb_build_array(jsonb_build_object('position_id', pos6, 'qty', 1)), repeat('я', 990)));
  res := res || pg_temp.t(t = 'OK', 'длинная пометка обрезается до 1000 знаков (' || t || ')');
  res := res || pg_temp.t(coalesce(current_setting('planfact.fact_tx', true), '') <> '1', 'флаг транзакции факта сброшен');
  t := pg_temp.err(format('update planfact.fact_entries set status = %L where id = %L', 'pending_approval', e1));
  res := res || pg_temp.t(t <> 'OK', 'прямое изменение статуса закрыто');

  reset role; perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  t := pg_temp.err(format('select public.pf_fact_add_batch(%L, %L, %L, %L::jsonb, null, null, true)', pa, b1, today,
        jsonb_build_array(jsonb_build_object('position_id', pos6, 'qty', 1))));
  res := res || pg_temp.t(t <> 'OK', 'anon: вызов закрыт');
  reset role;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res,'FAIL','')))/4;
end $$;
