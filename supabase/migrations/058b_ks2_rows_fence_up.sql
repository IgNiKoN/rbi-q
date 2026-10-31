-- P2-0053 доработка 2 (058b): «Сводка» и КС-2 объекта с переносами и выставленными актами — без 46 000 вызовов на запрос.
-- Боевой 31.10 (SQL Editor, только чтение): planfact.ks2_rows по «ЖК Демо» — 2 119 мс (summary_rows зовёт её трижды →
-- summary_project и pf_summary_attention «ЖК Демо» по 6,2–6,3 с → «Сводка» и «Входящие» 6–7 с у всех, кто видит объект; так же
-- было бы у клиента с ВОР, переносами и КС-2 такого объёма). План функции (общий: SQL-функция с SET планируется без значений
-- параметров) разворачивал подзапрос x блока wmap (046c) в условие «vor_links.position_id = position_moved_to(…)» и считал
-- position_moved_to на КАЖДОЙ строке vor_links для каждой выставленной работы: 507 × 92 ≈ 46 000 вызовов. Подзапрос с offset 0
-- не разворачивается — position_moved_to один раз на работу: общий план 2 098 → 35 мс (тот же запрос на боевом). Результат тот
-- же (offset 0 ничего не отбрасывает); язык, настройки функции и права — как есть.
-- Применять после 058, одним запросом. Откат — 058b_ks2_rows_fence_down.sql.
begin;

do $$
begin
  if to_regprocedure('core.in_demo_scope(uuid)') is null then
    raise exception '058b: сначала 058_demo_fast_up.sql' using errcode = 'P0001';
  end if;
  if position('058b:' in pg_get_functiondef('planfact.ks2_rows(uuid, date, uuid, uuid)'::regprocedure)) > 0 then
    raise exception '058b уже применена (повтор — только после 058b_ks2_rows_fence_down.sql)' using errcode = 'P0001';
  end if;
end $$;

create function pg_temp.patch(p_fn regprocedure, p_from text[], p_to text[])
returns void language plpgsql as $$
declare v_new text := pg_get_functiondef(p_fn); i int;
begin
  for i in 1..cardinality(p_from) loop
    if position(p_from[i] in v_new) = 0 then
      raise exception '058b: в % не найдено место правки «%»', p_fn, p_from[i] using errcode = 'P0001';
    end if;
    v_new := replace(v_new, p_from[i], p_to[i]);
  end loop;
  execute v_new;
end $$;

select pg_temp.patch('planfact.ks2_rows(uuid, date, uuid, uuid)'::regprocedure,
  array['from prev_raw p join planfact.vor_source_rows o on o.id = p.id and o.project_id = p_project) w) x'],
  array['from prev_raw p join planfact.vor_source_rows o on o.id = p.id and o.project_id = p_project) w
          offset 0) x   -- 058b: x не разворачивать — «куда перенесена позиция» один раз на строку, не на каждую строку vor_links']);
drop function pg_temp.patch(regprocedure, text[], text[]);

commit;
