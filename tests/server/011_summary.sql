-- P2-0008: тесты сводки руководителю — формулы на синтетике (2 ЕИ, работа + материал, строка без цены, факт за 7/14 дней, выданный
-- и аннулированный КС-2, без КП, без дат), ₽ = null без planfact.money.view, права (чужая компания, прораб, заказчик, anon), даты проекта
-- (право, начало > окончания, архив, журнал). Всё откатывается; отчёт — ERROR P0001 с итогом «FAIL всего: 0».
-- Запуск: после 011_up.sql (или вставить 011_up.sql перед этим файлом).
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

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); upm uuid := gen_random_uuid();
  uecon uuid := gen_random_uuid(); umgmt uuid := gen_random_uuid(); ucust uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid(); unone uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid; pa2 uuid; pa3 uuid; f5 uuid; kv uuid; m2 uuid; sht uuid; wt uuid; wt3 uuid; wt4 uuid; imp uuid; est uuid; kp1 uuid;
  pos12 uuid; pos14 uuid; pos16 uuid; b1 uuid; j jsonb; n int; t text; res text := ''; x numeric; r record; a1 uuid; rev int;
  td date := (now() at time zone 'Europe/Moscow')::date;
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,upm,uecon,umgmt,ucust,ubadm,unone]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor),(ca,upm),(ca,uecon),(ca,umgmt),(ca,ucust),(ca,unone),(cb,ubadm);
  insert into core.role_assignments(company_id,user_id,role_id,project_id)
  select ca, u, (select id from core.company_roles where company_id = ca and template_code = c), null
  from (values (uadm,'company_admin'),(upto,'pto'),(ufor,'foreman'),(upm,'project_manager'),(uecon,'economist'),(umgmt,'management'),
               (ucust,'customer')) v(u, c);
  insert into core.role_assignments(company_id,user_id,role_id,project_id)
  values (cb, ubadm, (select id from core.company_roles where company_id = cb and template_code = 'company_admin'), null);
  select id into m2 from core.units where company_id is null and code = 'м²';
  select id into sht from core.units where company_id is null and code = 'шт.';

  -- 1. Подготовка. ВОР: 12 штукатурка 100 м² → 13 смесь 900 кг (норма 9); 14 двери 10 шт; 16 грунтовка 50 м² (без цены в КП).
  -- КП: 12 — 300; 13 — 12,5; 14 — 1000 + 200 = 1200. План ₽ = 100×300 + 900×12,5 + 10×1200 = 53 250.
  reset role; perform pg_temp.as_user(uadm);
  pa := public.pf_create_project(ca, 'ЖК Сводка');
  pa2 := public.pf_create_project(ca, 'ЖК Архив');
  pa3 := public.pf_create_project(ca, 'ЖК Без КП');
  f5 := public.pf_add_location(pa, null, 'floor', '5 этаж');
  kv := public.pf_add_location(pa, f5, 'apartment', 'Кв. 1');
  reset role; perform pg_temp.as_user(upto);
  wt := public.pf_vor_add_work_type(pa, 'Штукатурка стен', m2);
  wt3 := public.pf_vor_add_work_type(pa, 'Установка дверей', sht);
  wt4 := public.pf_vor_add_work_type(pa, 'Грунтовка', m2);
  imp := public.pf_vor_create_import(pa, 'вор.xlsx', repeat('a', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, '[{"row_no": 12, "kind": "work", "number": "1.1", "name": "Штукатурка стен", "unit_text": "м2", "qty": 100},
    {"row_no": 13, "kind": "material", "number": "1.1.1", "name": "Смесь «Альфа»", "unit_text": "кг", "qty": 900, "norm": 9, "parent_row_no": 12},
    {"row_no": 14, "kind": "work", "number": "1.2", "name": "Установка дверей", "unit_text": "шт", "qty": 10},
    {"row_no": 16, "kind": "work", "number": "1.3", "name": "Грунтовка", "unit_text": "м2", "qty": 50}]');
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(
    jsonb_build_object('row_no', 12, 'location_id', f5, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 14, 'location_id', kv, 'work_type_id', wt3, 'unit_id', sht, 'match', 'green'),
    jsonb_build_object('row_no', 16, 'location_id', f5, 'work_type_id', wt4, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp);
  select id into pos12 from planfact.vor_positions where project_id = pa and work_type_id = wt;
  select id into pos14 from planfact.vor_positions where project_id = pa and work_type_id = wt3;
  select id into pos16 from planfact.vor_positions where project_id = pa and work_type_id = wt4;
  est := public.pf_estimate_create(pa, 'Смета', array[imp]);
  j := public.pf_kp_create(est, repeat('a', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', imp, 'row_no', 12, 'kind', 'work', 'price_labor', 300, 'price_material', null),
    jsonb_build_object('import_id', imp, 'row_no', 13, 'kind', 'material', 'price_labor', null, 'price_material', 12.5),
    jsonb_build_object('import_id', imp, 'row_no', 14, 'kind', 'work', 'price_labor', 1000, 'price_material', 200),
    jsonb_build_object('import_id', imp, 'row_no', 16, 'kind', 'work', 'price_labor', null, 'price_material', null))), 53250);
  kp1 := (j ->> 'id')::uuid;
  b1 := public.pf_brigade_save(ca, null, 'Иванов');
  -- Факт: штукатурка 4 (−20 дн.) + 3 (−10 дн.) + 3 (−3 дн.) = 10 из 100; двери 3 (−2 дн.) из 10; грунтовка — нет.
  reset role; perform pg_temp.as_user(ufor);
  perform public.pf_fact_add(pos12, b1, td - 20, 4);
  perform public.pf_fact_add(pos12, b1, td - 10, 3);
  perform public.pf_fact_add(pos12, b1, td - 3, 3);
  perform public.pf_fact_add(pos14, b1, td - 2, 3);
  reset role; perform pg_temp.as_user(uadm);
  perform public.pf_update_project(pa2, 'ЖК Архив', null, true);

  -- 2. Миграция: даты проекта
  reset role;
  res := res || pg_temp.t((select count(*) from information_schema.columns where table_schema = 'core' and table_name = 'projects'
                           and column_name in ('planned_start', 'planned_finish')) = 2, 'у проекта есть плановые даты начала и окончания');
  t := pg_temp.err(format('update core.projects set planned_start = %L, planned_finish = %L where id = %L', td, td - 1, pa));
  res := res || pg_temp.t(t like '23514%', 'ограничение БД: начало ≤ окончания (' || t || ')');

  -- 3. Даты: права, проверки, журнал
  reset role; perform pg_temp.as_user(ufor);
  t := pg_temp.err(format('select public.pf_project_set_dates(%L, %L, %L)', pa, td - 30, td + 120));
  res := res || pg_temp.t(t like '42501%', 'прораб не меняет даты проекта (' || t || ')');
  reset role; perform pg_temp.as_user(ubadm);
  t := pg_temp.err(format('select public.pf_project_set_dates(%L, %L, %L)', pa, td - 30, td + 120));
  res := res || pg_temp.t(t like '42501%', 'чужая компания не меняет даты (' || t || ')');
  reset role; perform pg_temp.as_user(upm);
  t := pg_temp.err(format('select public.pf_project_set_dates(%L, %L, %L)', pa, td + 1, td));
  res := res || pg_temp.t(t like '22023%позже%', 'начало позже окончания — отказ (' || t || ')');
  t := pg_temp.err(format('select public.pf_project_set_dates(%L, %L, %L)', pa2, td - 30, td + 120));
  res := res || pg_temp.t(t like '22023%архиве%', 'архивный проект — отказ (' || t || ')');
  t := pg_temp.err(format('update core.projects set planned_finish = %L where id = %L', td, pa));
  res := res || pg_temp.t(t like '42501%', 'прямая правка дат закрыта (' || t || ')');

  -- 4. Без договорной КП и без дат — серый «нет данных» с причиной
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.light = 'grey' and r.light_reason = 'no_kp' and r.plan_money is null and not r.has_kp,
                          'без договорной КП: серый, причина no_kp, ₽ нет (' || r.light || '/' || r.light_reason || ')');
  t := pg_temp.err(format('select * from public.pf_summary_ks2_gap(%L)', pa));
  res := res || pg_temp.t(t like '22023%договорную%', 'разрыв КС-2 без договорной КП — понятная ошибка (' || t || ')');
  perform public.pf_ks2_set_contract(pa, kp1);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.light = 'grey' and r.light_reason = 'no_dates', 'без даты окончания: серый, причина no_dates (' || r.light_reason || ')');

  -- 5. Формулы (ПТО видит ₽)
  res := res || pg_temp.t(r.plan_money = 53250, 'план ₽ = 53 250 (получено ' || r.plan_money || ')');
  -- сделано: 10×300 + 90×12,5 + 3×1200 = 3000 + 1125 + 3600 = 7725
  res := res || pg_temp.t(r.done_money = 7725, 'сделано ₽ = 7 725 (получено ' || r.done_money || ')');
  res := res || pg_temp.t(r.pct_money = 14.5, 'общий % = 7725 / 53250 = 14,5 (получено ' || r.pct_money || ')');
  res := res || pg_temp.t(r.unpriced_rows = 1, 'строк без цены: 1 (грунтовка) (получено ' || r.unpriced_rows || ')');
  -- за 7 дней: штукатурка 3 → 900 + смесь 27×12,5 = 337,5; двери 3 → 3600; Σ 4837,5 ÷ 7 = 691,07 ₽/дн.
  res := res || pg_temp.t(r.pace7 = 691.07, 'темп 7 дней = 4837,5 / 7 = 691,07 (получено ' || r.pace7 || ')');
  -- за 14 дней: + штукатурка 3 (−10 дн.) → 900 + 337,5; Σ 6075 ÷ 14 = 433,93 ₽/дн.
  res := res || pg_temp.t(r.pace14 = 433.93, 'темп 14 дней = 6075 / 14 = 433,93 (получено ' || r.pace14 || ')');
  res := res || pg_temp.t(r.issued_money = 0 and r.gap_money = 7725, 'выставлено 0, разрыв 7 725 (получено ' || r.gap_money || ')');
  res := res || pg_temp.t(r.positions = 3 and r.can_money and r.can_manage is true, 'позиций 3, ПТО видит ₽ и правит даты');

  -- остаток 45 525; прогноз = сегодня + ⌈45525 / 433,93⌉ = +105 дн.
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_dates(pa, td - 30, td + 120);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.forecast_finish = td + 105, 'прогноз = сегодня + 105 дн. (получено ' || coalesce((r.forecast_finish - td)::text, 'null') || ')');
  res := res || pg_temp.t(r.need_pace = 379.38 and r.days_left = 120, 'нужный темп = 45525 / 120 = 379,38 (получено ' || r.need_pace || ')');
  res := res || pg_temp.t(r.light = 'green', 'прогноз ≤ окончания → зелёный (' || r.light || ')');
  perform public.pf_project_set_dates(pa, td - 30, td + 95);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.light = 'yellow', 'прогноз позже на 10 дн. → жёлтый (' || r.light || ')');
  perform public.pf_project_set_dates(pa, td - 30, td + 90);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.light = 'red', 'прогноз позже на 15 дн. → красный (' || r.light || ')');
  perform public.pf_project_set_dates(pa, td - 30, td + 120);
  reset role;
  select count(*) into n from core.audit_log where project_id = pa and table_name = 'projects' and action = 'UPDATE'
    and new_data ? 'planned_finish';
  res := res || pg_temp.t(n = 4, 'смена дат — в журнале (записей: ' || n || ')');
  reset role; perform pg_temp.as_user(upm);
  perform public.pf_project_set_dates(pa, td - 30, td + 120);
  reset role;
  select count(*) into n from core.audit_log where project_id = pa and table_name = 'projects' and action = 'UPDATE'
    and new_data ? 'planned_finish';
  res := res || pg_temp.t(n = 4, 'те же даты — без лишней записи журнала');

  -- REUSE: цена строки сводки = цена ks2_rows; сделано = total_qty ks2_rows; факт позиций = fact_totals
  select count(*) into n from planfact.summary_rows(pa, td) s join planfact.ks2_rows(pa, td, kp1) k on k.source_row_id = s.source_row_id
    where s.price is distinct from k.price or s.done_qty <> k.total_qty or s.issued_qty <> k.prev_qty;
  res := res || pg_temp.t(n = 0, 'строки сводки совпадают с ks2_rows (цена, сделано, выставлено; расхождений ' || n || ')');

  -- 6. Виды работ: свои ЕИ, разные ЕИ не смешиваются
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_worktypes(pa) w where w.work_type_id = wt;
  res := res || pg_temp.t(jsonb_array_length(r.units) = 1 and r.units -> 0 ->> 'unit' = 'м²' and (r.units -> 0 ->> 'pct')::numeric = 10
                          and (r.units -> 0 ->> 'fact7')::numeric = 3 and (r.units -> 0 ->> 'fact14')::numeric = 6
                          and (r.units -> 0 ->> 'rest')::numeric = 90,
                          'штукатурка: 10 из 100 м² = 10 %, за 7 дн. 3, за 14 дн. 6, остаток 90 (' || r.units::text || ')');
  -- ₽ вида работ = работа 12 + её материал 13: план 30000 + 11250 = 41250, сделано 3000 + 1125 = 4125
  res := res || pg_temp.t(r.plan_money = 41250 and r.done_money = 4125 and r.pct_money = 10,
                          'штукатурка ₽: план 41 250, сделано 4 125 (с материалом), 10 % (' || r.plan_money || '/' || r.done_money || ')');
  select * into r from public.pf_summary_worktypes(pa) w where w.work_type_id = wt3;
  res := res || pg_temp.t(r.units -> 0 ->> 'unit' = 'шт.' and (r.units -> 0 ->> 'pct')::numeric = 30, 'двери: 3 из 10 шт = 30 %');
  select * into r from public.pf_summary_worktypes(pa) w where w.work_type_id = wt4;
  res := res || pg_temp.t(r.unpriced_rows = 1 and r.plan_money = 0, 'грунтовка: строка без цены, ₽ не считаются');
  -- 7. Позиции
  reset role; perform pg_temp.as_user(ufor);
  select * into r from public.pf_summary_positions(pa, wt3) p;
  res := res || pg_temp.t(r.position_id = pos14 and r.location_path = '5 этаж · Кв. 1' and r.pct = 30 and r.rest_qty = 7 and r.unit_code = 'шт.',
                          'позиция дверей: место «5 этаж · Кв. 1», 30 %, остаток 7 шт');
  select count(*) into n from public.pf_summary_positions(pa);
  res := res || pg_temp.t(n = 3, 'все позиции проекта: 3');

  -- 8. «Сделано ↔ КС-2»: выдан акт со штукатуркой 9 из 10 → разрыв 1 (300 ₽); аннулирование → разрыв = сделано
  reset role; perform pg_temp.as_user(upto);
  a1 := public.pf_ks2_act_create(pa, '1', td, td - 30, td);
  rev := public.pf_ks2_save(a1, '{}', jsonb_build_array(jsonb_build_object('source_row_id',
           (select s.id from planfact.vor_source_rows s where s.import_id = imp and s.row_no = 12), 'qty', 9, 'price', 300)));
  perform public.pf_ks2_issue(a1);
  select * into r from public.pf_summary_ks2_gap(pa) g where g.row_no = 12;
  res := res || pg_temp.t(r.done_qty = 10 and r.issued_qty = 9 and r.gap_qty = 1 and r.gap_money = 300,
                          'строка 12: сделано 10, выставлено 9, разрыв 1 = 300 ₽ (' || r.gap_qty || '/' || r.gap_money || ')');
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  -- выдано: 9×300 + 90×12,5 + 3×1200 = 7425; разрыв 7725 − 7425 = 300
  res := res || pg_temp.t(r.issued_money = 7425 and r.gap_money = 300, 'проект: выставлено 7 425, разрыв 300 (' || r.issued_money || '/' || r.gap_money || ')');
  perform public.pf_ks2_annul(a1, 'ошибка в объёме');
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.issued_money = 0 and r.gap_money = 7725, 'после аннулирования разрыв = сделано (' || r.gap_money || ')');
  select * into r from public.pf_summary_ks2_gap(pa) g where g.row_no = 12;
  res := res || pg_temp.t(r.issued_qty = 0 and r.gap_qty = 10, 'строка 12 после аннулирования: разрыв 10');
  select count(*) into n from public.pf_summary_ks2_gap(pa);
  res := res || pg_temp.t(n = 3, 'в разрыве только строки с фактом или актами (3)');

  -- 9. Без money.view ни одно поле в ₽ и общий % не приходят с сервера
  reset role; perform pg_temp.as_user(ufor);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(not r.can_money and r.plan_money is null and r.done_money is null and r.issued_money is null and r.gap_money is null
                          and r.pct_money is null and r.pace7 is null and r.pace14 is null and r.need_pace is null and r.forecast_finish is null
                          and r.light = 'green', 'прораб: ₽, %, темп и прогноз = null, светофор есть');
  select count(*) into n from public.pf_summary_worktypes(pa) w where w.plan_money is not null or w.done_money is not null or w.pct_money is not null;
  res := res || pg_temp.t(n = 0, 'прораб: в видах работ ₽ нет');
  select count(*) into n from public.pf_summary_ks2_gap(pa) g where g.price is not null or g.done_money is not null or g.gap_money is not null
    or g.issued_money is not null;
  res := res || pg_temp.t(n = 0, 'прораб: в разрыве КС-2 ₽ нет');
  select * into r from public.pf_summary_ks2_gap(pa) g where g.row_no = 12;
  res := res || pg_temp.t(r.gap_qty = 10, 'прораб видит объёмы разрыва');
  reset role; perform pg_temp.as_user(ucust);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.project_id = pa and r.plan_money is null and r.pct_money is null, 'заказчик: проект виден, ₽ и % нет');
  reset role; perform pg_temp.as_user(umgmt);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.plan_money = 53250 and not r.can_manage, 'руководство: ₽ видны, даты не правит');
  reset role; perform pg_temp.as_user(uecon);
  select * into r from public.pf_summary_portfolio() p where p.project_id = pa;
  res := res || pg_temp.t(r.plan_money = 53250, 'экономист: ₽ видны');

  -- 10. Отказы: чужая компания, роль без fact.view, anon; архив не в портфеле
  reset role; perform pg_temp.as_user(ubadm);
  select count(*) into n from public.pf_summary_portfolio();
  res := res || pg_temp.t(n = 0, 'чужая компания: портфель пуст');
  t := pg_temp.err(format('select * from public.pf_summary_worktypes(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'чужая компания: виды работ — отказ (' || t || ')');
  t := pg_temp.err(format('select * from public.pf_summary_positions(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'чужая компания: позиции — отказ');
  t := pg_temp.err(format('select * from public.pf_summary_ks2_gap(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'чужая компания: разрыв КС-2 — отказ');
  reset role; perform pg_temp.as_user(unone);
  select count(*) into n from public.pf_summary_portfolio();
  res := res || pg_temp.t(n = 0, 'сотрудник без роли (нет fact.view): портфель пуст');
  t := pg_temp.err(format('select * from public.pf_summary_worktypes(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'сотрудник без fact.view: виды работ — отказ (' || t || ')');
  reset role; perform pg_temp.as_user(upto);
  select count(*) into n from public.pf_summary_portfolio() p where p.project_id = pa2;
  res := res || pg_temp.t(n = 0, 'архивный проект в портфель не входит');
  select count(*) into n from public.pf_summary_portfolio() p where p.project_id = pa3 and p.light_reason = 'no_kp';
  res := res || pg_temp.t(n = 1, 'проект без ВОР и КП — в портфеле с причиной no_kp');
  t := pg_temp.err('select planfact.summary_project(gen_random_uuid(), current_date)');
  res := res || pg_temp.t(t like '42501%', 'служебный расчёт клиенту не выдан (' || t || ')');
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  t := pg_temp.err('select * from public.pf_summary_portfolio()');
  res := res || pg_temp.t(t like '42501%', 'anon: портфель — отказ (' || t || ')');
  t := pg_temp.err(format('select * from public.pf_summary_worktypes(%L)', pa));
  res := res || pg_temp.t(t like '42501%', 'anon: виды работ — отказ');
  t := pg_temp.err(format('select public.pf_project_set_dates(%L, null, null)', pa));
  res := res || pg_temp.t(t like '42501%', 'anon: даты — отказ');
  reset role;

  -- 11. Позиция другой ЕИ того же вида работ (в конце: подтверждённый ВОР не правится) → отдельная запись units, не сумма
  reset role;
  insert into planfact.vor_positions(company_id, project_id, import_id, location_id, work_type_id, unit_id, qty)
  values (ca, pa, imp, kv, wt, sht, 5);
  reset role; perform pg_temp.as_user(upto);
  select * into r from public.pf_summary_worktypes(pa) w where w.work_type_id = wt;
  res := res || pg_temp.t(jsonb_array_length(r.units) = 2 and r.positions = 2, 'вид работ в двух ЕИ — две записи, без суммы (' || r.units::text || ')');

  reset role;

  select count(*) into n from regexp_matches(res, '(^|\n)FAIL', 'g');
  raise exception E'%\nFAIL всего: %', res, n;
end $$;
