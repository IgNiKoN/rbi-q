-- P2-0021: тест 029_inbox — «Требует моего участия» (pf_my_inbox) по ролям и компаниям; числа = pf_fact_pending /
-- pf_summary_attention / pf_ks2_acts того же объекта; «мои отклонённые» исчезают после моей новой записи; архив, чужая
-- компания, роль без прав, anon — не видно; ₽ без money.view — нет; ТД №138: повторное решение и повторное исправление — отказ.
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 029_inbox_up.sql.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then 'OK ' || l else 'FAIL ' || l end || E'\n' $f$;
-- Строка «Входящих» объекта для текущего пользователя (jsonb, null — объекта нет в списке).
create or replace function pg_temp.inbox(p uuid) returns jsonb language sql as $f$
  select to_jsonb(i) from public.pf_my_inbox() i where i.project_id = p $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); ufor2 uuid := gen_random_uuid();
  upm uuid := gen_random_uuid(); umg uuid := gen_random_uuid(); ucus uuid := gen_random_uuid(); unov uuid := gen_random_uuid();
  ubpm uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); td date := (now() at time zone 'Europe/Moscow')::date;
  pa uuid; parch uuid; pb uuid; bld uuid; m2 uuid; wt uuid; imp uuid; est uuid; kp uuid; br uuid; brb uuid; secb uuid; wtb uuid; impb uuid;
  pos10 uuid; pos20 uuid; pos30 uuid; posb uuid; posar uuid; locar uuid; wtar uuid; impar uuid; act uuid;
  ep uuid; er1 uuid; er2 uuid; ec uuid; j jsonb; att jsonb; t text; n int; ms numeric; t0 timestamptz; res text := '';
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,ufor2,upm,umg,ucus,unov,ubpm]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values
    (ca,uadm),(ca,upto),(ca,ufor),(ca,ufor2),(ca,upm),(ca,umg),(ca,ucus),(ca,unov),(cb,ubpm);
  insert into core.role_assignments(company_id,user_id,role_id,project_id)
  select v.c, v.u, (select id from core.company_roles where company_id = v.c and template_code = v.code), null
  from (values (ca,uadm,'company_admin'),(ca,upto,'pto'),(ca,ufor,'foreman'),(ca,ufor2,'foreman'),(ca,upm,'project_manager'),
               (ca,umg,'management'),(ca,ucus,'customer'),(cb,ubpm,'project_manager')) v(c, u, code);
  select id into m2 from core.units where company_id is null and code = 'м²';

  -- Подготовка. Объект Альфы: 3 строки ВОР по 100 м² с ценой 100 ₽, договорная КП, даты (старт 30 дней назад).
  perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Входящие');
  bld := public.pf_add_location(pa, null, 'building', 'Корпус 1');
  br := public.pf_brigade_save(ca, null, 'Иванов');
  reset role; perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка', m2);
  imp := public.pf_vor_create_import(pa, 'вор.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'kind', 'work', 'number', (g / 10)::text,
    'name', 'Строка ' || g, 'unit_text', 'м2', 'qty', 100)) from unnest(array[10, 20, 30]) g));
  perform public.pf_vor_resolve_rows(imp, (select jsonb_agg(jsonb_build_object('row_no', g, 'location_id', bld, 'work_type_id', wt,
    'unit_id', m2, 'match', 'green')) from unnest(array[10, 20, 30]) g));
  perform public.pf_vor_confirm(imp);
  est := public.pf_estimate_create(pa, 'Смета', array[imp]);
  kp := (public.pf_kp_create(est, repeat('a', 64), jsonb_build_object('version', 1, 'rows', (select jsonb_agg(jsonb_build_object(
    'import_id', imp, 'row_no', g, 'kind', 'work', 'price_labor', 100)) from unnest(array[10, 20, 30]) g)), 10000) ->> 'id')::uuid;
  perform public.pf_ks2_set_contract(pa, kp);
  act := public.pf_ks2_act_create(pa, '1', td, td - 30, td);
  reset role;
  update core.projects set planned_start = td - 30, planned_finish = td + 60 where id = pa;
  select l.position_id into pos10 from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp and s.row_no = 10;
  select l.position_id into pos20 from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp and s.row_no = 20;
  select l.position_id into pos30 from planfact.vor_links l join planfact.vor_source_rows s on s.id = l.source_row_id where s.import_id = imp and s.row_no = 30;

  -- Факт: pos10 — 10 (принято, 20 дней назад); pos20 — 150 (перебор → ждёт РП, ep); pos30 — 120 прораба (отклонено, er1);
  -- pos20 — 200 второго прораба (отклонено, er2).
  perform pg_temp.as_user(ufor);
  perform public.pf_fact_add(pos10, br, td - 20, 10);
  ep := (public.pf_fact_add(pos20, br, td - 2, 150) ->> 'id')::uuid;
  er1 := (public.pf_fact_add(pos30, br, td - 3, 120) ->> 'id')::uuid;
  reset role; perform pg_temp.as_user(ufor2);
  er2 := (public.pf_fact_add(pos20, br, td - 1, 200) ->> 'id')::uuid;
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_fact_decide(er1, false, 'перемерить');
  perform public.pf_fact_decide(er2, false, 'перемерить');

  -- Архивный объект Альфы с записью, ждущей РП; объект Беты с записью, ждущей РП
  reset role; perform pg_temp.as_user(uadm);
  parch := public.pf_create_project(ca, 'ЖК Архив');
  locar := public.pf_add_location(parch, null, 'section', 'Секция А');
  reset role; perform pg_temp.as_user(upto);
  wtar := public.pf_vor_add_work_type(parch, 'Работа архива', m2);
  impar := public.pf_vor_create_import(parch, 'архив.xlsx', repeat('c', 64), 'Лист');
  perform public.pf_vor_add_rows(impar, '[{"row_no": 12, "kind": "work", "name": "Работа архива", "unit_text": "м2", "qty": 5}]');
  perform public.pf_vor_resolve_rows(impar, jsonb_build_array(jsonb_build_object('row_no', 12, 'location_id', locar, 'work_type_id', wtar, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(impar);
  select id into posar from planfact.vor_positions where project_id = parch;
  reset role; perform pg_temp.as_user(ufor);
  perform public.pf_fact_add(posar, br, td, 9);
  reset role; perform pg_temp.as_user(uadm);
  perform public.pf_update_project(parch, 'ЖК Архив', null, true);
  reset role; perform pg_temp.as_user(ubpm);
  pb := public.pf_create_project(cb, 'ЖК Беты');
  secb := public.pf_add_location(pb, null, 'section', 'Секция Б');
  brb := public.pf_brigade_save(cb, null, 'Бригада Беты');
  reset role;
  insert into core.role_assignments(company_id,user_id,role_id,project_id)
  values (cb, ubpm, (select id from core.company_roles where company_id = cb and template_code = 'pto'), null),
         (cb, ubpm, (select id from core.company_roles where company_id = cb and template_code = 'foreman'), null);
  perform pg_temp.as_user(ubpm);
  wtb := public.pf_vor_add_work_type(pb, 'Работа Беты', m2);
  impb := public.pf_vor_create_import(pb, 'бета.xlsx', repeat('b', 64), 'Лист');
  perform public.pf_vor_add_rows(impb, '[{"row_no": 12, "kind": "work", "name": "Работа Беты", "unit_text": "м2", "qty": 30}]');
  perform public.pf_vor_resolve_rows(impb, jsonb_build_array(jsonb_build_object('row_no', 12, 'location_id', secb, 'work_type_id', wtb, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(impb);
  select id into posb from planfact.vor_positions where project_id = pb;
  perform public.pf_fact_add(posb, brb, td, 40);

  -- 0. Доступ к функции
  reset role;
  res := res || pg_temp.t(not has_function_privilege('anon', 'public.pf_my_inbox()', 'execute'), 'anon: pf_my_inbox закрыта');
  res := res || pg_temp.t(has_function_privilege('authenticated', 'public.pf_my_inbox()', 'execute'), 'authenticated: функция доступна (права проверяет функция)');

  -- 1. РП: все виды; числа = прежним функциям того же объекта; архив и Бета — не видно
  perform pg_temp.as_user(upm);
  j := pg_temp.inbox(pa); att := public.pf_summary_attention(pa, 14);
  res := res || pg_temp.t((j ->> 'pending')::int = 1 and (j ->> 'pending')::int = (select count(*) from public.pf_fact_pending(pa)),
                          'РП: ждёт подтверждения = pf_fact_pending (1) (' || coalesce(j::text, 'нет строки') || ')');
  res := res || pg_temp.t((j ->> 'pending')::int = (att #>> '{counts,pending_entries}')::int, 'РП: ждёт подтверждения = «Требует внимания»');
  res := res || pg_temp.t((j ->> 'ks2_drafts')::int = 1 and (j ->> 'ks2_drafts')::int = (select count(*) from public.pf_ks2_acts(pa) a where a.status = 'draft'),
                          'РП: черновики КС-2 = pf_ks2_acts draft (1)');
  res := res || pg_temp.t((j ->> 'ks2_gap')::int = (att #>> '{counts,gap_rows}')::int and (j ->> 'ks2_gap')::int = 1,
                          'РП: «сделано, не выставлено» = gap_rows «Требует внимания» (1)');
  res := res || pg_temp.t((j ->> 'ks2_gap_money')::numeric = (att #>> '{counts,gap_money}')::numeric and (j ->> 'ks2_gap_money')::numeric = 1000,
                          'РП: сумма «не выставлено» = gap_money (1 000 ₽)');
  res := res || pg_temp.t((j ->> 'stale')::int = (att #>> '{counts,stale_positions}')::int and (j ->> 'stale')::int = 3 and (j ->> 'stale_days')::int = 14,
                          'РП: «стоят > 14 дней» = stale_positions (3: pos10 — 20 дн., pos20 / pos30 — без принятого факта 30 дн.)');
  res := res || pg_temp.t(j ? 'my_rejected' and j -> 'my_rejected' = 'null'::jsonb and j -> 'my_rejected_from' = 'null'::jsonb, 'РП без fact.create: «мои отклонённые» — нет (null)');
  res := res || pg_temp.t(pg_temp.inbox(parch) is null, 'РП: архивный объект не показан');
  res := res || pg_temp.t(pg_temp.inbox(pb) is null, 'РП Альфы: объект Беты не показан');
  res := res || pg_temp.t((select count(*) from public.pf_my_inbox()) = 1, 'РП: в списке один объект');

  -- 2. Прораб: только «мои отклонённые»; второй прораб — свои; новая запись на позиции убирает отклонённую
  reset role; perform pg_temp.as_user(ufor);
  j := pg_temp.inbox(pa);
  res := res || pg_temp.t((j ->> 'my_rejected')::int = 1 and (j ->> 'my_rejected_from')::date = td - 3,
                          'прораб: мои отклонённые = 1, самая ранняя дата работ — 3 дня назад (' || coalesce(j::text, 'нет строки') || ')');
  res := res || pg_temp.t(j -> 'pending' = 'null'::jsonb and j -> 'ks2_drafts' = 'null'::jsonb and j -> 'ks2_gap' = 'null'::jsonb
                          and j -> 'ks2_gap_money' = 'null'::jsonb and j -> 'stale' = 'null'::jsonb, 'прораб: прочих видов нет (null)');
  res := res || pg_temp.t(pg_temp.inbox(parch) is null and pg_temp.inbox(pb) is null, 'прораб: архив и Бета не показаны');
  reset role; perform pg_temp.as_user(ufor2);
  res := res || pg_temp.t((pg_temp.inbox(pa) ->> 'my_rejected')::int = 1, 'второй прораб: свои отклонённые = 1 (не чужие)');
  reset role; perform pg_temp.as_user(ufor);
  perform public.pf_fact_add(pos30, br, td, 5);
  j := pg_temp.inbox(pa);
  res := res || pg_temp.t((j ->> 'my_rejected')::int = 0 and j -> 'my_rejected_from' = 'null'::jsonb, 'прораб: после новой записи на позиции отклонённая не считается (0, без даты)');
  reset role; perform pg_temp.as_user(ufor2);
  res := res || pg_temp.t((pg_temp.inbox(pa) ->> 'my_rejected')::int = 1, 'второй прораб: чужая новая запись на другой позиции не влияет (1)');

  -- 3. ПТО: КС-2 и «стоят»; без подтверждения факта
  reset role; perform pg_temp.as_user(upto);
  j := pg_temp.inbox(pa); att := public.pf_summary_attention(pa, 14);
  res := res || pg_temp.t(j -> 'pending' = 'null'::jsonb and j -> 'my_rejected' = 'null'::jsonb, 'ПТО: подтверждения и отклонённых нет');
  res := res || pg_temp.t((j ->> 'ks2_drafts')::int = 1 and (j ->> 'ks2_gap')::int = (att #>> '{counts,gap_rows}')::int
                          and (j ->> 'ks2_gap')::int = 2 and (j ->> 'ks2_gap_money')::numeric = (att #>> '{counts,gap_money}')::numeric,
                          'ПТО: черновики 1, «не выставлено» = «Требует внимания» (2 строки после записи прораба) (' || j::text || ')');
  res := res || pg_temp.t((j ->> 'stale')::int = (att #>> '{counts,stale_positions}')::int, 'ПТО: «стоят» = stale_positions');

  -- 4. Руководство: «не выставлено» (ks2.view) и «стоят»; черновиков (ks2.edit) нет
  reset role; perform pg_temp.as_user(umg);
  j := pg_temp.inbox(pa);
  res := res || pg_temp.t(j -> 'ks2_drafts' = 'null'::jsonb and (j ->> 'ks2_gap')::int = 2 and (j ->> 'stale')::int >= 0
                          and j -> 'pending' = 'null'::jsonb, 'руководство: «не выставлено» и «стоят», без черновиков и подтверждения (' || j::text || ')');

  -- 5. Заказчик (только просмотр) и сотрудник без роли — пусто; ₽ без money.view — нет
  reset role; perform pg_temp.as_user(ucus);
  res := res || pg_temp.t((select count(*) from public.pf_my_inbox()) = 0, 'заказчик (только просмотр): список пуст');
  reset role; perform pg_temp.as_user(unov);
  res := res || pg_temp.t((select count(*) from public.pf_my_inbox()) = 0, 'сотрудник без роли: список пуст');
  reset role;
  delete from core.company_role_permissions where role_id = (select id from core.company_roles where company_id = ca and template_code = 'management')
    and action = 'planfact.money.view';
  perform pg_temp.as_user(umg);
  j := pg_temp.inbox(pa);
  res := res || pg_temp.t((j ->> 'ks2_gap')::int = 2 and j -> 'ks2_gap_money' = 'null'::jsonb and j -> 'stale' = 'null'::jsonb,
                          'без money.view: «не выставлено» без ₽, «стоят» — нет (' || j::text || ')');

  -- 6. Бета: только свой объект
  reset role; perform pg_temp.as_user(ubpm);
  res := res || pg_temp.t((select count(*) from public.pf_my_inbox()) = 1 and (pg_temp.inbox(pb) ->> 'pending')::int = 1
                          and pg_temp.inbox(pa) is null, 'РП Беты: только свой объект, ждёт подтверждения 1');

  -- 7. После решения РП число уменьшается; anon / без входа — отказ
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_fact_decide(ep, true, 'ок');
  res := res || pg_temp.t((pg_temp.inbox(pa) ->> 'pending')::int = 0, 'РП: после подтверждения ждёт 0');
  reset role; perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role authenticated';
  t := pg_temp.err('select count(*) from public.pf_my_inbox()');
  res := res || pg_temp.t(t like '42501%', 'без входа: отказ (' || t || ')');
  reset role; set local role anon;
  t := pg_temp.err('select count(*) from public.pf_my_inbox()');
  res := res || pg_temp.t(t <> 'OK', 'anon: отказ');

  -- 8. ТД №138: повторное решение и повторное исправление — отказ, ничего не меняется
  reset role; perform pg_temp.as_user(upm);
  t := pg_temp.err(format('select public.pf_fact_decide(%L, false, %L)', ep, 'передумал'));
  res := res || pg_temp.t(t like '22023%не ждёт подтверждения%' and (select status from planfact.fact_entries where id = ep) = 'accepted',
                          'ТД №138: второе решение по записи — отказ, запись принята (' || t || ')');
  -- перебор: исправление ждёт РП, ep остаётся в итоге
  ec := (public.pf_fact_correct(ep, 500, 'перемерили') ->> 'id')::uuid;
  t := pg_temp.err(format('select public.pf_fact_correct(%L, 80, %L)', ep, 'ещё раз'));
  select count(*) into n from planfact.fact_entries where corrects_id = ep;
  res := res || pg_temp.t(t like '22023%уже исправлена%' and n = 1, 'ТД №138: повторное исправление — отказ, исправление одно (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_correct(%L, 1, %L)', er1, 'отклонённую'));
  res := res || pg_temp.t(t like '22023%закрыта%', 'исправить отклонённую — отказ, как до 029');
  reset role;
  res := res || pg_temp.t((select pg_get_functiondef('public.pf_fact_decide(uuid,boolean,text)'::regprocedure)) ~ 'where id = p_entry for update'
                          and (select pg_get_functiondef('public.pf_fact_decide(uuid,boolean,text)'::regprocedure)) ~ 'and status = ''pending_approval'''
                          and (select pg_get_functiondef('public.pf_fact_correct(uuid,numeric,text,text)'::regprocedure)) ~ 'where id = p_entry for update',
                          'ТД №138: решение и исправление перечитывают запись FOR UPDATE, решение — только из pending_approval');

  -- 9. Скорость: 20 объектов РП — один вызов
  perform pg_temp.as_user(uadm);
  for n in 1..20 loop perform public.pf_create_project(ca, 'Объект ' || n); end loop;
  reset role; perform pg_temp.as_user(upm);
  t0 := clock_timestamp();
  select count(*) into n from public.pf_my_inbox();
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  res := res || pg_temp.t(n = 21 and ms <= 2000, 'скорость: 21 объект за ' || round(ms) || ' мс (≤ 2 000 в PGlite)');

  reset role;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res,'FAIL','')))/4;
end $$;
