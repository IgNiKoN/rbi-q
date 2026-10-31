-- P2-0053. Сброс «ЖК Демо» кнопки «Демо»: удалить ТОЛЬКО демо-компанию «Девелопмент Демо» (is_test и is_demo) со всеми её
-- данными во всех модулях и учётки zd-dd-…@demo.invalid. Посетители (настоящие учётки клиентов и РБИ) НЕ удаляются: исчезают
-- только их участие и визит в демо (строки демо-компании) — при следующем «Демо» создаются заново. Выполняется в SQL Editor
-- (на стенде — scripts/demo/stand.mjs). Файлы демо в Storage (планы, фото) — строки storage.objects с путём демо-компании.
-- Защита: (1) компания удаляется, только если is_test, is_demo и имя из списка; (2) учётка — только zd-dd-…@demo.invalid и только
-- если она не состоит в другой компании; (3) до и после считаются строки всех НЕ демо-компаний по каждой таблице с компанией
-- или проектом — разошлось хоть на одну строку → всё отменяется (exception → rollback); (4) после удаления строк демо
-- не осталось нигде — иначе тоже отмена. Защитные триггеры (журнал, неизменяемые ВОР / КП / КС-2 / факт) отключаются
-- только внутри этой транзакции: другие сеансы на это время ждут (секунды), записать в обход защиты не могут.
-- «Песочницы» клиентов, РБИ, «Альфа», «Бета», старая «Демо-компания» («Спутник») не затрагиваются. Повторный запуск без демо — ничего не делает.
begin;
do $$
declare
  v_names constant text[] := array['Девелопмент Демо'];
  v_c uuid[]; v_p uuid[]; v_u uuid[];
  r record; v_n bigint; v_left bigint; v_pass int; v_done boolean; v_deleted bigint := 0;
  v_before jsonb := '{}'; v_after jsonb := '{}';
  v_tabs text[] := '{}';
begin
  select coalesce(array_agg(id), '{}') into v_c from core.companies where is_test and is_demo and name = any(v_names);
  select coalesce(array_agg(id), '{}') into v_p from core.projects where company_id = any(v_c);
  select coalesce(array_agg(id), '{}') into v_u from auth.users where email like 'zd-dd-%@demo.invalid';
  if cardinality(v_c) = 0 and cardinality(v_u) = 0 then raise notice 'Демо «ЖК Демо» нет — удалять нечего'; return; end if;
  if exists (select 1 from core.company_members m where m.user_id = any(v_u) and not (m.company_id = any(v_c))) then
    raise exception 'Учётка zd-dd-…@demo.invalid состоит в другой компании — сброс остановлен, ничего не удалено';
  end if;

  -- таблицы с компанией или проектом (core, planfact, quality) и условие «строка демо»
  for r in
    select c.table_schema s, c.table_name t,
           string_agg(format('%I = any($1)', c.column_name), ' or ') filter (where c.column_name in ('company_id', 'core_company_id')) as by_company,
           string_agg(format('%I = any($2)', c.column_name), ' or ') filter (where c.column_name = 'project_id') as by_project
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
     where c.table_schema in ('core', 'planfact', 'quality') and c.column_name in ('company_id', 'core_company_id', 'project_id')
       and c.data_type = 'uuid'
     group by 1, 2
  loop
    v_tabs := v_tabs || format('%I.%I|%s', r.s, r.t, concat_ws(' or ', r.by_company, r.by_project));
  end loop;

  -- снимок «до»: строки не-демо по каждой таблице
  for r in select split_part(x, '|', 1) tbl, split_part(x, '|', 2) cond from unnest(v_tabs) x loop
    execute format('select count(*) from %s where not coalesce(%s, false)', r.tbl, r.cond) into v_n using v_c, v_p;
    v_before := v_before || jsonb_build_object(r.tbl, v_n);
  end loop;

  -- защитные триггеры — только на время транзакции, во всех таблицах трёх схем
  for r in select format('%I.%I', schemaname, tablename) tbl from pg_tables where schemaname in ('core', 'planfact', 'quality') loop
    execute format('alter table %s disable trigger user', r.tbl);
  end loop;

  -- удаление: по кругу, пока есть что удалять (порядок задают внешние ключи)
  for v_pass in 1..12 loop
    v_done := true;
    for r in select split_part(x, '|', 1) tbl, split_part(x, '|', 2) cond from unnest(v_tabs) x loop
      begin
        execute format('delete from %s where %s', r.tbl, r.cond) using v_c, v_p;
        get diagnostics v_n = row_count; v_deleted := v_deleted + v_n;
      exception when foreign_key_violation then v_done := false;
      end;
    end loop;
    exit when v_done;
  end loop;
  delete from storage.objects where split_part(name, '/', 1) = any (select x::text from unnest(v_c) x);
  delete from core.companies where id = any(v_c);
  delete from auth.users where id = any(v_u);

  for r in select format('%I.%I', schemaname, tablename) tbl from pg_tables where schemaname in ('core', 'planfact', 'quality') loop
    execute format('alter table %s enable trigger user', r.tbl);
  end loop;

  -- проверки: демо не осталось; у всех остальных — ровно как было
  for r in select split_part(x, '|', 1) tbl, split_part(x, '|', 2) cond from unnest(v_tabs) x loop
    execute format('select count(*) from %s where %s', r.tbl, r.cond) into v_left using v_c, v_p;
    if v_left > 0 then raise exception 'Сброс отменён: в % остались строки демо (%)', r.tbl, v_left; end if;
    execute format('select count(*) from %s where not coalesce(%s, false)', r.tbl, r.cond) into v_n using v_c, v_p;
    v_after := v_after || jsonb_build_object(r.tbl, v_n);
  end loop;
  if v_before <> v_after then
    raise exception 'Сброс отменён: изменились строки других компаний: %',
      (select jsonb_object_agg(k, jsonb_build_array(v_before->k, v_after->k)) from jsonb_object_keys(v_before) k where v_before->k <> v_after->k);
  end if;
  if exists (select 1 from core.companies where id = any(v_c)) or exists (select 1 from auth.users where id = any(v_u)) then
    raise exception 'Сброс отменён: компании или учётки демо не удалились';
  end if;
  raise notice 'Демо «ЖК Демо» удалено: компаний %, учёток %, строк %; данные других компаний не изменились (таблиц проверено %)',
    cardinality(v_c), cardinality(v_u), v_deleted, cardinality(v_tabs);
end $$;
commit;
