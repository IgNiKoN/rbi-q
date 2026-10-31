-- P2-0053 доработка 2 (058b): planfact.ks2_rows «как после 046c» = «с offset 0 в wmap» по ВСЕМ объектам — строка в строку.
-- Обе версии собираются во временной схеме из текущего определения на сервере (до или после 058b — всё равно), сравниваются по
-- каждой КП каждого объекта, на 5 датах (сегодня, −7, −14, −60, +30), без исключения акта и с исключением каждого выставленного.
-- Только чтение (функции — во временной схеме сеанса). Боевой: SQL Editor; стенд: node tests/server/run-pglite.mjs … этот файл.
-- Отчёт — ERROR P0001 «… FAIL всего: N» (N = 0 — равны), с числом сравнений и временем обеих версий.
do $$
declare
  d text := pg_get_functiondef('planfact.ks2_rows(uuid, date, uuid, uuid)'::regprocedure);
  old_s constant text := 'from prev_raw p join planfact.vor_source_rows o on o.id = p.id and o.project_id = p_project) w) x';
  new_s constant text := E'from prev_raw p join planfact.vor_source_rows o on o.id = p.id and o.project_id = p_project) w\n'
    || '          offset 0) x   -- 058b: x не разворачивать — «куда перенесена позиция» один раз на строку, не на каждую строку vor_links';
  base text; ra text[]; rb text[]; k record; dt date; sk uuid; n_cmp int := 0; n_diff int := 0; n_rows int := 0; x int;
  t timestamptz; ms_old numeric := 0; ms_new numeric := 0; bad text := '';
begin
  base := replace(d, 'FUNCTION planfact.ks2_rows(', 'FUNCTION pg_temp.%s(');
  if position(new_s in base) > 0 then base := replace(base, new_s, old_s); end if;
  if position(old_s in base) = 0 then raise exception 'ks2_rows: место правки 058b не найдено — сравнение невозможно' using errcode = 'P0001'; end if;
  execute format(base, 'ks2_old');
  execute format(replace(base, old_s, new_s), 'ks2_new');
  for k in select r.id, r.project_id from planfact.kp_revisions r order by r.project_id, r.id loop
    foreach dt in array array[current_date, current_date - 7, current_date - 14, current_date - 60, current_date + 30] loop
      for sk in select null::uuid union all select a.id from planfact.ks2_acts a where a.project_id = k.project_id and a.status = 'issued' loop
        -- каждая версия — один раз (на боевом «как после 046c» по «ЖК Демо» ≈ 2 с): упорядоченный список строк целиком — и состав, и порядок
        t := clock_timestamp();
        ra := array(select f::text from pg_temp.ks2_old(k.project_id, dt, k.id, sk) with ordinality f order by f.ordinality);
        ms_old := ms_old + extract(epoch from clock_timestamp() - t) * 1000;
        t := clock_timestamp();
        rb := array(select f::text from pg_temp.ks2_new(k.project_id, dt, k.id, sk) with ordinality f order by f.ordinality);
        ms_new := ms_new + extract(epoch from clock_timestamp() - t) * 1000;
        x := case when ra = rb then 0 else greatest(1, (select count(*) from (select unnest(ra) except all select unnest(rb)) q)::int
                                                     + (select count(*) from (select unnest(rb) except all select unnest(ra)) q)::int) end;
        n_cmp := n_cmp + 1; n_diff := n_diff + x;
        n_rows := n_rows + cardinality(rb);
        if x > 0 and length(bad) < 2000 then bad := bad || format(E'FAIL проект %s, КП %s, дата %s, без акта %s: различий %s\n', k.project_id, k.id, dt, sk, x); end if;
      end loop;
    end loop;
  end loop;
  raise exception E'ОТЧЁТ (только чтение): сравнений %, строк %, различий %; время: как после 046c % мс, с 058b % мс\n%FAIL всего: %',
    n_cmp, n_rows, n_diff, round(ms_old), round(ms_new), bad, (case when n_diff > 0 then 1 else 0 end) + (case when n_cmp = 0 then 1 else 0 end)
    using errcode = 'P0001';
end $$;
