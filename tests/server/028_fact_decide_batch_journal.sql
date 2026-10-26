-- P2-0020: тест 028_fact_decide_batch_journal — решение РП пачкой (= решение по одной pf_fact_decide: статусы, замена
-- исправляемой, итоги, журнал), всё или ничего; права, чужой проект / компания, архив, > 500, повторы, anon;
-- журнал факта объекта: период, лимит, статусы, права fact.view, чужая компания, anon.
-- Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0». Запуск: после 028_fact_decide_batch_journal_up.sql.
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
-- Снимок решения по проекту: записи (статус, кто решил, причина), итоги позиций, журнал fact_entries.
create or replace function pg_temp.snap(p uuid) returns jsonb language sql as $f$
  select jsonb_build_object(
    'e', (select jsonb_agg(jsonb_build_array(e.id, e.status, e.decided_by, e.decision_note) order by e.id)
          from planfact.fact_entries e where e.project_id = p),
    't', (select jsonb_agg(to_jsonb(t) order by t.position_id) from planfact.fact_totals(p) t),
    'a', (select jsonb_agg(jsonb_build_array(a.action, a.record_id, a.actor, a.old_data, a.new_data)
                           order by a.record_id, a.action, a.old_data::text)
          from core.audit_log a where a.project_id = p and a.table_name = 'fact_entries')) $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); upm uuid := gen_random_uuid();
  ubadm uuid := gen_random_uuid(); unov uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid; pa2 uuid; pb uuid; r_adm uuid; r_pto uuid; r_for uuid; r_pm uuid; r_badm uuid; r_none uuid;
  bld uuid; f5 uuid; f6 uuid; kv uuid; m2 uuid; wt uuid; wt2 uuid; wtb uuid; secb uuid; imp uuid; impb uuid;
  pos5 uuid; pos6 uuid; posk uuid; posb uuid; b1 uuid; bb uuid; j jsonb; t text; n int; res text := '';
  ea uuid; e1 uuid; e2 uuid; e3 uuid; e4 uuid; eb uuid; ids uuid[]; s_one jsonb; s_batch jsonb; err text;
  today date := (now() at time zone 'Europe/Moscow')::date;
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,upm,ubadm,unov]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor),(ca,upm),(ca,unov),(cb,ubadm);
  select id into r_adm from core.company_roles where company_id=ca and template_code='company_admin';
  select id into r_pto from core.company_roles where company_id=ca and template_code='pto';
  select id into r_for from core.company_roles where company_id=ca and template_code='foreman';
  select id into r_pm  from core.company_roles where company_id=ca and template_code='project_manager';
  select id into r_badm from core.company_roles where company_id=cb and template_code='company_admin';
  select id into r_none from core.company_roles where company_id=cb and template_code='foreman';
  insert into core.role_assignments(company_id,user_id,role_id,project_id) values
    (ca,uadm,r_adm,null),(ca,upto,r_pto,null),(ca,ufor,r_for,null),(ca,upm,r_pm,null),(cb,ubadm,r_badm,null),(cb,ubadm,r_none,null);
  select id into m2 from core.units where company_id is null and code = 'м²';

  -- Подготовка: проект Альфы (план 100 / 20 / 50), архивный проект, проект Беты с записью, ждущей РП
  reset role; perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Пачка');
  pa2 := public.pf_create_project(ca, 'ЖК Архив');
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
  b1 := public.pf_brigade_save(ca, null, 'Иванов');
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
  j := public.pf_fact_add_batch(pb, bb, today, jsonb_build_array(jsonb_build_object('position_id', posb, 'qty', 40)));
  select id into eb from planfact.fact_entries where batch_id = (j ->> 'batch_id')::uuid;
  reset role; perform pg_temp.as_user(uadm);
  perform public.pf_update_project(pa2, 'ЖК Архив', null, true);

  -- Записи Альфы: ea — принята (pos6, 10, 40 дней назад); e1 — перебор (posk 25 > 20); e2 — «через РП» (pos5, 10);
  -- e3 — исправление ea на 60 (перебор → ждёт РП, ea в итоге до решения); e4 — исправление e1 на 30 (ждёт РП, цепочка в пачке)
  reset role; perform pg_temp.as_user(ufor);
  j := public.pf_fact_add_batch(pa, b1, today - 40, jsonb_build_array(jsonb_build_object('position_id', pos6, 'qty', 10)));
  select id into ea from planfact.fact_entries where batch_id = (j ->> 'batch_id')::uuid;
  j := public.pf_fact_add_batch(pa, b1, today, jsonb_build_array(jsonb_build_object('position_id', posk, 'qty', 25)));
  select id into e1 from planfact.fact_entries where batch_id = (j ->> 'batch_id')::uuid;
  j := public.pf_fact_add_batch(pa, b1, today - 1, jsonb_build_array(jsonb_build_object('position_id', pos5, 'qty', 10)), null, null, true);
  select id into e2 from planfact.fact_entries where batch_id = (j ->> 'batch_id')::uuid;
  j := public.pf_fact_correct(ea, 60, 'перемерили');
  e3 := (j ->> 'id')::uuid;
  j := public.pf_fact_correct(e1, 30, 'уточнили');
  e4 := (j ->> 'id')::uuid;
  select count(*) into n from planfact.fact_entries where id in (e1, e2, e3, e4) and status = 'pending_approval';
  res := res || pg_temp.t(n = 4, 'подготовка: 4 записи ждут РП (получено: ' || n || ')');
  ids := array[e4, e3, e2, e1];   -- порядок в массиве нарочно обратный

  -- 0. Сигнатуры и доступ
  reset role;
  res := res || pg_temp.t(not has_function_privilege('anon', 'public.pf_fact_decide_batch(uuid,uuid[],boolean,text)', 'execute'), 'anon: пачка решений закрыта');
  res := res || pg_temp.t(not has_function_privilege('anon', 'public.pf_fact_journal(uuid,date,date,integer)', 'execute'), 'anon: журнал закрыт');
  res := res || pg_temp.t(has_function_privilege('authenticated', 'public.pf_fact_decide_batch(uuid,uuid[],boolean,text)', 'execute')
    and has_function_privilege('authenticated', 'public.pf_fact_journal(uuid,date,date,integer)', 'execute'), 'authenticated: функции доступны (права проверяет функция)');

  -- 1. Подтверждение: пачка = по одной (статусы, кто решил, замена исправляемой, итоги, журнал)
  begin
    perform pg_temp.as_user(upm);
    perform public.pf_fact_decide(e1, true, 'ок'); perform public.pf_fact_decide(e2, true, 'ок');
    perform public.pf_fact_decide(e3, true, 'ок'); perform public.pf_fact_decide(e4, true, 'ок');
    reset role; s_one := pg_temp.snap(pa);
    raise exception 'rollback-one';
  exception when others then if sqlerrm <> 'rollback-one' then err := 'по одной: ' || sqlerrm; end if;
  end;
  begin
    perform pg_temp.as_user(upm);
    j := public.pf_fact_decide_batch(pa, ids, true, 'ок');
    reset role; s_batch := pg_temp.snap(pa);
    raise exception 'rollback-batch';
  exception when others then if sqlerrm <> 'rollback-batch' then err := coalesce(err || '; ', '') || 'пачка: ' || sqlerrm; end if;
  end;
  res := res || pg_temp.t(err is null, 'подтверждение по одной и пачкой без ошибок (' || coalesce(err, '-') || ')');
  res := res || pg_temp.t(s_one is not null and s_one = s_batch, 'подтверждение: пачка = по одной (записи, итоги, журнал)');
  res := res || pg_temp.t(j = '{"approved": 4, "rejected": 0}'::jsonb, 'итог пачки {approved 4} (' || coalesce(j::text, '-') || ')');
  res := res || pg_temp.t((select count(*) from jsonb_array_elements(s_batch -> 'e') x where x ->> 0 in (ea::text, e1::text) and x ->> 1 = 'superseded') = 2,
    'исправленные записи (ea, e1) заменены');
  res := res || pg_temp.t((select count(*) from jsonb_array_elements(s_batch -> 'a') x where x ->> 0 = 'APPROVE') = 4, 'журнал: APPROVE на каждую запись');

  -- 2. Отказ: пачка = по одной, одна причина на все
  s_one := null; s_batch := null; err := null; j := null;
  begin
    perform pg_temp.as_user(upm);
    perform public.pf_fact_decide(e1, false, 'нет актов'); perform public.pf_fact_decide(e2, false, 'нет актов');
    perform public.pf_fact_decide(e3, false, 'нет актов'); perform public.pf_fact_decide(e4, false, 'нет актов');
    reset role; s_one := pg_temp.snap(pa);
    raise exception 'rollback-one';
  exception when others then if sqlerrm <> 'rollback-one' then err := 'по одной: ' || sqlerrm; end if;
  end;
  begin
    perform pg_temp.as_user(upm);
    j := public.pf_fact_decide_batch(pa, ids, false, '  нет актов ');
    reset role; s_batch := pg_temp.snap(pa);
    raise exception 'rollback-batch';
  exception when others then if sqlerrm <> 'rollback-batch' then err := coalesce(err || '; ', '') || 'пачка: ' || sqlerrm; end if;
  end;
  res := res || pg_temp.t(err is null, 'отказ по одной и пачкой без ошибок (' || coalesce(err, '-') || ')');
  res := res || pg_temp.t(s_one is not null and s_one = s_batch, 'отказ: пачка = по одной (записи, итоги, журнал)');
  res := res || pg_temp.t(j = '{"approved": 0, "rejected": 4}'::jsonb, 'итог пачки {rejected 4} (' || coalesce(j::text, '-') || ')');
  res := res || pg_temp.t((select count(*) from jsonb_array_elements(s_batch -> 'e') x where x ->> 1 = 'rejected' and x ->> 3 = 'нет актов') = 4,
    'одна причина на все записи');

  -- 3. Всё или ничего и границы (ничего не меняется)
  reset role; s_one := pg_temp.snap(pa); perform pg_temp.as_user(upm);
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], false, %L)', pa, ids, '   '));
  res := res || pg_temp.t(t like '22023%причину%', 'отказ без причины: отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pa, '{}'));
  res := res || pg_temp.t(t like '22023%', 'пустая пачка: отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pa, array[e1, e1]));
  res := res || pg_temp.t(t like '22023%дважды%', 'повтор записи: отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pa, array[e1, null]));
  res := res || pg_temp.t(t like '22023%', 'пустой id: отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pa,
        (select array_agg(gen_random_uuid()) from generate_series(1, 501))));
  res := res || pg_temp.t(t like '22023%500%', '501 запись: отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pa, ids || ea));
  res := res || pg_temp.t(t like '22023%обновите%', 'в пачке принятая запись: отказ всей пачки (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pa, ids || eb));
  res := res || pg_temp.t(t like '22023%обновите%', 'в пачке запись чужой компании: отказ всей пачки (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pa, ids || gen_random_uuid()));
  res := res || pg_temp.t(t like '22023%', 'несуществующая запись: отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pb, array[eb]));
  res := res || pg_temp.t(t like '42501%', 'РП Альфы — проект Беты: отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pa2, ids));
  res := res || pg_temp.t(t like '22023%архив%', 'проект в архиве: отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pb, ids));
  res := res || pg_temp.t(t like '42501%', 'записи Альфы под чужим проектом: отказ (' || t || ')');
  reset role; perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pa, ids));
  res := res || pg_temp.t(t like '42501%', 'прораб без fact.approve: отказ (' || t || ')');
  reset role; perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pa, ids));
  res := res || pg_temp.t(t like '42501%', 'чужая компания: отказ (' || t || ')');
  reset role;
  res := res || pg_temp.t(pg_temp.snap(pa) = s_one, 'после отказов ничего не изменилось (записи, итоги, журнал)');
  -- сбой на последней записи пачки (e4 решается после e1, e2, e3) откатывает уже решённые
  execute $t$create function public.t028_boom() returns trigger language plpgsql as $b$
    begin if new.id::text = current_setting('t028.boom', true) and new.status <> old.status then
      raise exception 'сбой на записи' using errcode = 'XX028'; end if; return new; end $b$ $t$;
  create trigger t028_boom before update on planfact.fact_entries for each row execute function public.t028_boom();
  perform set_config('t028.boom', e4::text, true);
  perform pg_temp.as_user(upm);
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pa, ids));
  reset role;
  res := res || pg_temp.t(t like 'XX028%' and pg_temp.snap(pa) = s_one, 'сбой на последней записи — пачка откатана целиком (' || t || ')');
  drop trigger t028_boom on planfact.fact_entries; drop function public.t028_boom();
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], false, %L)', pa, ids, repeat('я', 1001)));
  res := res || pg_temp.t(t <> 'OK' and pg_temp.snap(pa) = s_one, 'причина длиннее 1000 знаков: отказ, ничего не изменилось (' || t || ')');
  res := res || pg_temp.t(coalesce(current_setting('planfact.fact_tx', true), '') <> '1', 'флаг транзакции факта сброшен');

  -- 4. Очередь после решения пачкой и > 500 частями — на клиенте; здесь — решение и очередь согласованы
  perform pg_temp.as_user(upm);
  j := public.pf_fact_decide_batch(pa, array[e2], true, null);
  select count(*) into n from public.pf_fact_pending(pa) p where p.id = e2;
  res := res || pg_temp.t(n = 0 and j ->> 'approved' = '1', 'подтверждение без комментария; запись ушла из очереди');

  -- 5. Журнал объекта
  reset role; perform pg_temp.as_user(ufor);
  select count(*) into n from public.pf_fact_journal(pa);
  res := res || pg_temp.t(n = 5, 'журнал без периода: все 5 записей объекта (получено: ' || n || ')');
  select count(*) into n from public.pf_fact_journal(pa, today - 30, today);
  res := res || pg_temp.t(n = 3, 'журнал за 30 дней: без записей 40-дневной давности (ea и её исправление) (получено: ' || n || ')');
  select count(*) into n from public.pf_fact_journal(pa, today - 30, today - 1);
  res := res || pg_temp.t(n = 1, 'журнал по вчера: 1 запись (получено: ' || n || ')');
  select string_agg(j2.status, ',' order by j2.status) into t from public.pf_fact_journal(pa) j2;
  res := res || pg_temp.t(t = 'accepted,accepted,pending_approval,pending_approval,pending_approval', 'журнал: все статусы (' || coalesce(t, '-') || ')');
  select count(*) into n from public.pf_fact_journal(pa) j2 where j2.id = e2 and j2.status = 'accepted' and j2.decided_by_email = upm || '@test.invalid'
    and j2.note = 'Закрытие через РП' and j2.location_path like '%5 этаж%' and j2.work_name = 'Штукатурка стен' and j2.unit_code = 'м²'
    and j2.brigade_name = 'Иванов' and j2.created_by_email = ufor || '@test.invalid' and j2.qty = 10;
  res := res || pg_temp.t(n = 1, 'журнал: позиция, место, работа, ЕИ, бригада, автор, решение РП, пометка');
  select count(*) into n from public.pf_fact_journal(pa) j2 where j2.id = e3 and j2.corrects_id = ea and j2.correction_reason = 'перемерили';
  res := res || pg_temp.t(n = 1, 'журнал: исправление и причина');
  select count(*) into n from public.pf_fact_journal(pa, null, null, 2);
  res := res || pg_temp.t(n = 2, 'лимит 2 (получено: ' || n || ')');
  select count(*) into n from (select j2.work_date, lag(j2.work_date) over () prev from public.pf_fact_journal(pa) j2) x where x.prev < x.work_date;
  res := res || pg_temp.t(n = 0, 'журнал: новые даты сверху');
  t := pg_temp.err(format('select count(*) from public.pf_fact_journal(%L, %L::date, %L::date)', pa, today, today - 1));
  res := res || pg_temp.t(t like '22023%', 'начало позже конца: отказ (' || t || ')');
  reset role; perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select count(*) from public.pf_fact_journal(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'журнал — чужая компания: отказ (' || t || ')');
  -- человек компании с ролью без fact.view
  reset role;
  insert into core.company_roles(company_id, name) values (ca, 'Без прав') returning id into r_none;
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values (ca, unov, r_none, null);
  perform pg_temp.as_user(unov);
  t := pg_temp.err(format('select count(*) from public.pf_fact_journal(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'журнал без fact.view: отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pa, array[e1]));
  res := res || pg_temp.t(t like '42501%', 'пачка без fact.approve (роль без прав): отказ (' || t || ')');

  reset role; perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  t := pg_temp.err(format('select public.pf_fact_decide_batch(%L, %L::uuid[], true)', pa, array[e1]));
  res := res || pg_temp.t(t <> 'OK', 'anon: пачка — отказ');
  t := pg_temp.err(format('select count(*) from public.pf_fact_journal(%L)', pa));
  res := res || pg_temp.t(t <> 'OK', 'anon: журнал — отказ');
  reset role;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res,'FAIL','')))/4;
end $$;
