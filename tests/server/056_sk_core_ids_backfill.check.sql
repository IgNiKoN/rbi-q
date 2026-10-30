-- P2-0076 (056), часть 2 из 2 — после засева 056_sk_core_ids.seed.pglite.sql и 056_sk_core_ids_up.sql: разовая привязка старых
-- замечаний quality.sk_links_backfill. Сухой прогон — отчёт по фирмам, категориям, местам (своя компания, удалённые не входят),
-- ничего не меняется; применение — id проставлены (фирма, вид работ, место до этажа; этажа нет — секция; не узнано — пусто),
-- остаток — соответствия «не сопоставлено»; компания Б — свои записи ядра; повтор — 0 изменений. Отчёт — ERROR P0001 «FAIL всего: N».
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
create or replace function pg_temp.loc(p_root uuid, p_path text[]) returns uuid language plpgsql as $f$
declare cur uuid := p_root; x text;
begin
  foreach x in array p_path loop select id into cur from core.locations where parent_id = cur and name = x and deleted_at is null; end loop;
  return cur;
end $f$;
create or replace function pg_temp.rec(c uuid, num text) returns quality.sk_records language sql as $f$
  select * from quality.sk_records where core_company_id = c and sk_number = num $f$;

do $$
declare
  ca constant uuid := '00000000-0000-4000-8000-0000000076a1'; cb constant uuid := '00000000-0000-4000-8000-0000000076b1';
  p1 constant uuid := '00000000-0000-4000-8000-0000000076c1';
  k2 constant uuid := '00000000-0000-4000-8000-0000000076d2'; kb constant uuid := '00000000-0000-4000-8000-0000000076d9';
  f1 constant uuid := '00000000-0000-4000-8000-0000000076e1'; fb constant uuid := '00000000-0000-4000-8000-0000000076e9';
  w1 constant uuid := '00000000-0000-4000-8000-0000000076f1'; wb constant uuid := '00000000-0000-4000-8000-0000000076f9';
  res text := ''; n int; m int; v_rep text; v_snap jsonb;
begin
  -- 1. Сухой прогон: отчёт есть, ничего не изменилось
  select count(*), string_agg(concat_ws(' | ', company, kind, source_text, coalesce(target, '—'), records, status), E'\n' order by company, kind, source_text)
    into n, v_rep from quality.sk_links_backfill(false);
  res := res || pg_temp.t(n = 12, 'сухой прогон: 12 строк отчёта (А: фирмы 3, категории 2, места 4; Б: 1 + 1 + 1), получено ' || n);
  res := res || pg_temp.t((select count(*) from quality.sk_links) = 0, 'сухой прогон: соответствия не заведены');
  res := res || pg_temp.t((select count(*) from quality.sk_records where core_work_type_id is not null or core_location_id is not null
                            or updated_at <> '2026-01-01T00:00:00Z') = 0, 'сухой прогон: записи не тронуты (id, время правки)');
  res := res || pg_temp.t((select records = 2 and status like 'не сопоставлено%' from quality.sk_links_backfill(false)
                            where company = 'Альфа 056т' and kind = 'contractor' and source_text = 'Ромашка (ООО) 056т'),
                          'отчёт: второе написание фирмы — 2 замечания, «не сопоставлено»');
  res := res || pg_temp.t((select records = 2 and target = 'Кладочные работы' and status = 'автоподбор' from quality.sk_links_backfill(false)
                            where company = 'Альфа 056т' and kind = 'category'
                              and quality.sk_link_key(source_text) = 'кладочные работы'), 'отчёт: категория в двух регистрах — один вид работ, 2 замечания');
  res := res || pg_temp.t(not exists (select 1 from quality.sk_links_backfill(false) where source_text like 'Удалённ%'), 'отчёт: удалённые не входят');
  res := res || pg_temp.t(not exists (select 1 from quality.sk_links_backfill(false) where status <> 'не сопоставлено — в «Разобрать»' and target is null),
                          'отчёт: у сопоставленных есть запись своей компании');

  -- 2. Применение
  perform quality.sk_links_backfill(true);
  res := res || pg_temp.t((pg_temp.rec(ca, '1')).core_counterparty_id = f1 and (pg_temp.rec(ca, '1')).core_work_type_id = w1
                          and (pg_temp.rec(ca, '1')).core_location_id = pg_temp.loc(k2, array['Секция 1', 'эт. 5']),
                          '№1: фирма, вид работ, место «Корпус 2, секция 1, этаж 5» → этаж');
  res := res || pg_temp.t((pg_temp.rec(ca, '2')).core_counterparty_id is null and (pg_temp.rec(ca, '2')).core_work_type_id is null
                          and (pg_temp.rec(ca, '2')).core_location_id = pg_temp.loc(k2, array['Секция 2', 'эт. 3']),
                          '№2: новая фирма и категория — пусто; «ЖК / Корпус 2 / Секция 2 / 3» → этаж');
  res := res || pg_temp.t((pg_temp.rec(ca, '3')).core_work_type_id is null and (pg_temp.rec(ca, '3')).core_location_id = pg_temp.loc(k2, array['Секция 1']),
                          '№3: «Без категории» — пусто; этажа 99 нет — секция');
  res := res || pg_temp.t((pg_temp.rec(ca, '4')).core_work_type_id = w1 and (pg_temp.rec(ca, '4')).core_location_id is null,
                          '№4: категория в другом регистре — тот же вид работ; место не узнано (два корпуса) — пусто');
  res := res || pg_temp.t((pg_temp.rec(ca, '5')).core_work_type_id is null and (pg_temp.rec(ca, '5')).updated_at = '2026-01-01T00:00:00Z',
                          '№5 (удалённое): не тронуто');
  res := res || pg_temp.t((pg_temp.rec(cb, '1')).core_counterparty_id = fb and (pg_temp.rec(cb, '1')).core_work_type_id = wb
                          and (pg_temp.rec(cb, '1')).core_location_id = pg_temp.loc(kb, array['Секция 1', 'эт. 2']), 'Б: свои записи ядра');
  res := res || pg_temp.t((select count(*) from quality.sk_links where company_id = ca and coalesce(counterparty_id, work_type_id, location_id) is null) = 4,
                          'А: «не сопоставлено» — 2 фирмы, 1 категория, 1 место');
  res := res || pg_temp.t((select count(*) from quality.sk_links where company_id = ca) = 9 and (select count(*) from quality.sk_links where company_id = cb) = 3,
                          'соответствий: А — 9, Б — 3');
  res := res || pg_temp.t(not exists (select 1 from quality.sk_links l where coalesce(
      (select company_id from core.counterparties where id = l.counterparty_id), (select company_id from core.work_types where id = l.work_type_id),
      (select company_id from core.locations where id = l.location_id), l.company_id) <> l.company_id), 'ни одной записи ядра другой компании');
  res := res || pg_temp.t(not exists (select 1 from quality.sk_records s where s.core_location_id is not null
                            and (select company_id from core.locations where id = s.core_location_id) <> s.core_company_id), 'места замечаний — своей компании');

  -- 3. Повтор — 0 изменений
  select jsonb_object_agg(core_company_id || id, updated_at) into v_snap from quality.sk_records;
  select count(*) into m from quality.sk_links;
  perform quality.sk_links_backfill(true);
  res := res || pg_temp.t((select jsonb_object_agg(core_company_id || id, updated_at) from quality.sk_records) = v_snap
                          and (select count(*) from quality.sk_links) = m, 'повтор применения — 0 изменений');
  raise exception E'%отчёт сухого прогона:\n%\nFAIL всего: %', res, v_rep, (length(res) - length(replace(res, 'FAIL ', ''))) / 5 using errcode = 'P0001';
end $$;
