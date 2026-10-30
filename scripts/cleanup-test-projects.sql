-- Уборка тестового мусора на общем сервере (P2-0011, расширено P2-0075): всё «REST…» в компаниях с companies.is_test = true.
-- Что удаляется — ТОЛЬКО в тестовых компаниях (Альфа, Бета, Демо, если она тестовая):
--   1) проекты «REST…» (кроме постоянного неархивного объекта «REST-автопроверки») — со всеми данными (ВОР, редакции, позиции, места,
--      факт, сметы, КП, КС-2, работы, назначения, журнал, данные Качества этих проектов);
--   2) в постоянном объекте «REST-автопроверки» — данные прогонов автотеста (ВОР, позиции, факт, сметы, КП, КС-2, работы, отозванные
--      назначения, места «REST…»); сам объект и его прочие места остаются — автотест на них опирается;
--   3) записи компании с названием «REST…»: работы, цены, словарь ВОР, виды работ, бригады, единицы, роли, контрагенты, подразделения,
--      справочник подрядчиков / объекты / места Качества, строки таблиц Качества с номером «REST-…»;
--   4) журнал (core.audit_log) удалённого.
-- Запись, на которую ещё ссылается что-то оставшееся, не удаляется — отчёт показывает её в «оставлено (есть ссылки)».
-- Нетестовые компании (РБИ и другие) не затрагиваются: найдена хоть одна запись «REST…» вне is_test — отказ ДО удаления; после удаления —
-- сверка «до = после» по всем таблицам у нетестовых компаний и «каждая удалённая строка — тестовой компании», иначе откат всего.
--
-- РЕЖИМ (строка ниже): 'dry' — сухой прогон: всё выполняется и откатывается, отчёт приходит как ERROR P0001 «СУХОЙ ПРОГОН …»;
-- 'apply' — удаление (только по разрешению владельца на шаг после сухого прогона), отчёт — результат последнего select.
-- Всё — одним блоком: сторожа неизменяемости (ВОР, факт, КП, КС-2, журнал) отключаются только внутри этой транзакции
-- (ALTER TABLE … DISABLE TRIGGER держит блокировку таблицы до конца транзакции — чужие записи ждут) и включаются обратно в ней же;
-- при любой ошибке откатывается всё. Повторный запуск — 0 строк. Применять ФАЙЛОМ (буфер в UTF-8), как миграции.
-- Проверка — tests/server/cleanup.pglite.mjs (PGlite: засев, dry, apply, повтор, «REST…» в нетестовой компании → отказ).
create temp table if not exists pf_cleanup_report(step int, what text, before_n bigint, after_n bigint);
truncate pf_cleanup_report;
create temp table if not exists pf_cleanup_gone(tbl text, id text, company_id uuid);
truncate pf_cleanup_gone;

do $$
declare
  v_mode text := 'dry';   -- 'dry' | 'apply'
  c_keep constant text := 'REST-автопроверки';
  v_test uuid[]; v_del uuid[]; v_keep uuid[]; v_run uuid[];
  v_rep text := '';
  r record;
  rn record;      -- шаг 3: своя переменная, ключ всегда текстом (у таблиц ключ то uuid, то text — P2-0075 доработка №1, ошибка 42804)
  v_idtype text;  -- настоящий тип ключа таблицы — для удаления по индексу
  v_n bigint; v_skip bigint;
  t text; k int;
  -- «REST…» по таблицам: таблица | компания строки | поле названия | ключ
  v_names text[][] := array[
    ['core.projects', 'company_id', 'name', 'id'],
    ['planfact.vor_imports', 'company_id', 'file_name', 'id'],
    ['planfact.vor_source_rows', '(select p.company_id from core.projects p where p.id = project_id)', 'name', 'id'],
    ['planfact.estimates', 'company_id', 'name', 'id'],
    ['planfact.works', 'company_id', 'name', 'id'],
    ['planfact.price_items', 'company_id', 'name', 'id'],
    ['planfact.vor_dictionary', 'company_id', 'upper(canon_name)', 'id'],   -- словарь хранит название строчными
    ['core.work_types', 'company_id', 'name', 'id'],
    ['planfact.brigades', 'company_id', 'name', 'id'],
    ['core.units', 'company_id', 'name', 'id'],
    ['core.company_roles', 'company_id', 'name', 'id'],
    ['core.counterparties', 'company_id', 'name', 'id'],
    ['core.divisions', 'company_id', 'name', 'id'],
    ['core.locations', 'company_id', 'name', 'id'],
    ['quality.contractor_directory', 'core_company_id', 'display_name', 'id'],
    ['quality.project_objects', 'core_company_id', 'display_name', 'id'],
    ['quality.location_nodes', 'core_company_id', '"displayName"', 'id']];
  -- данные проекта в порядке удаления (дети раньше родителей); ks2 — акт и редакция одним оператором (ссылаются друг на друга)
  v_ptables text[] := array['ks2_settings', 'ks2', 'fact_entries', 'fact_submissions', 'estimate_rows', 'estimate_overheads', 'kp_revisions',
                            'estimates', 'vor_links', 'vor_position_events', 'vor_heads', 'vor_positions', 'vor_source_rows', 'vor_imports', 'works'];
  -- сверка «у нетестовых компаний до = после»: таблица | компания строки | поле названия
  v_all text[][];
begin
  if v_mode not in ('dry', 'apply') then raise exception 'Режим — dry или apply'; end if;
  perform set_config('search_path', 'planfact, core, pg_catalog', true);
  -- места объектов, которые ведёт Качество, удаляются вместе с проектом без сторожа «меняйте в Качестве» и без встречной синхронизации
  perform set_config('quality.place_sync', '1', true);

  select coalesce(array_agg(id), '{}') into v_test from core.companies where is_test;
  select coalesce(array_agg(id order by name), '{}') into v_del from core.projects
  where company_id = any(v_test) and name like 'REST%' and not (name = c_keep and archived_at is null);
  select coalesce(array_agg(id), '{}') into v_keep from core.projects
  where company_id = any(v_test) and name = c_keep and archived_at is null;
  v_run := v_del || v_keep;

  v_all := v_names;
  foreach t in array v_ptables || array['role_assignments', 'audit_log'] loop
    continue when t = 'ks2' or 'planfact.' || t = any(select v_names[i][1] from generate_subscripts(v_names, 1) i);
    v_all := v_all || array[[case when t in ('role_assignments', 'audit_log') then 'core.' else 'planfact.' end || t,
      case when t in ('vor_links', 'estimate_rows', 'estimate_overheads')
           then '(select p.company_id from core.projects p where p.id = project_id)' else 'company_id' end, '', '']];
  end loop;
  v_all := v_all || array[['planfact.ks2_acts', 'company_id', '', ''], ['planfact.ks2_revisions', 'company_id', '', '']];

  -- 0. Отказ ДО удаления: «REST…» вне тестовых компаний
  for k in 1..array_length(v_names, 1) loop
    execute format('select count(*) from %s where not (coalesce(%s = any($1), false)) and %s like ''REST%%''', v_names[k][1], v_names[k][2], v_names[k][3])
      into v_n using v_test;
    if v_n > 0 then v_rep := v_rep || format(E'\n%s: %s', v_names[k][1], v_n); end if;
  end loop;
  if v_rep <> '' then
    raise exception E'Уборка: найдены записи «REST…» вне тестовых компаний — ничего не удалено:%', v_rep;
  end if;

  -- Счётчики ДО
  insert into pf_cleanup_report values (0, 'проектов REST… к удалению (тестовые компании)', cardinality(v_del), null),
                                       (0, 'постоянный объект «' || c_keep || '» (остаётся)', cardinality(v_keep), null);
  for k in 1..array_length(v_names, 1) loop
    execute format('select count(*) from %s where %s = any($1) and %s like ''REST%%''', v_names[k][1], v_names[k][2], v_names[k][3])
      into v_n using v_test;
    insert into pf_cleanup_report values (1, 'REST… у тестовых: ' || v_names[k][1], v_n, null);
  end loop;
  for k in 1..array_length(v_all, 1) loop
    execute format('select count(*) from %s where not (coalesce(%s = any($1), false))', v_all[k][1], v_all[k][2]) into v_n using v_test;
    insert into pf_cleanup_report values (3, 'нетестовые, всего строк: ' || v_all[k][1], v_n, null);
  end loop;

  -- Сторожа неизменяемости и журнала — выключить только на время транзакции
  for r in select c.oid::regclass::text tbl, g.tgname from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace s on s.oid = c.relnamespace
           where s.nspname in ('planfact', 'core') and not g.tgisinternal and g.tgenabled <> 'D'
             and (g.tgname in ('works_audit', 'audit_log_no_change') or (g.tgname like '%\_guard' and g.tgname <> 'zz_locations_quality_guard')) loop
    execute format('alter table %s disable trigger %I', r.tbl, r.tgname);
  end loop;

  -- 1–2. Данные проектов «REST…» и постоянного объекта
  if cardinality(v_run) > 0 then
    foreach t in array v_ptables loop
      if t = 'ks2' then
        with a as (delete from planfact.ks2_acts where project_id = any(v_run) returning id, project_id),
             b as (delete from planfact.ks2_revisions where project_id = any(v_run) returning id, project_id)
        insert into pf_cleanup_gone select z.tbl, z.id::text, p.company_id
        from (select 'ks2_acts' tbl, id, project_id from a union all select 'ks2_revisions', id, project_id from b) z
        join core.projects p on p.id = z.project_id;
      else
        execute format('with d as (delete from planfact.%I where project_id = any($1) returning %s::text id, project_id)
                        insert into pf_cleanup_gone select %L, d.id, p.company_id from d join core.projects p on p.id = d.project_id',
                       t, case when t = 'ks2_settings' then 'project_id' else 'id' end, t) using v_run;
      end if;
    end loop;
    with d as (delete from core.role_assignments where project_id = any(v_del) or (project_id = any(v_keep) and revoked_at is not null)
               returning id, company_id)
    insert into pf_cleanup_gone select 'role_assignments', id::text, company_id from d;
  end if;
  -- строки Качества, у которых удаляемый проект — объект (core_object_id, ссылка без каскада: объект Качества «REST…» отражён
  -- в ядре проектом-объектом), — раньше самих проектов (P2-0075 доработка №1)
  for r in select c.table_name from information_schema.columns c join information_schema.tables tt
             on tt.table_schema = c.table_schema and tt.table_name = c.table_name and tt.table_type = 'BASE TABLE'
           where c.table_schema = 'quality' and c.column_name = 'core_object_id' loop
    execute format('with d as (delete from quality.%I where core_object_id = any($1) and core_company_id = any($2) returning core_company_id)
                    insert into pf_cleanup_gone select %L, null, core_company_id from d', r.table_name, r.table_name) using v_del, v_test;
  end loop;
  -- проекты «REST…»: места и данные Качества — каскадом с проектом
  v_skip := 0;
  for r in select id, company_id from core.projects where id = any(v_del) loop
    begin
      delete from core.projects where id = r.id;
      insert into pf_cleanup_gone values ('projects', r.id::text, r.company_id);
    exception when foreign_key_violation then v_skip := v_skip + 1;
    end;
  end loop;
  if v_skip > 0 then insert into pf_cleanup_report values (5, 'оставлено (есть ссылки): core.projects', v_skip, null); end if;

  -- 3. Записи «REST…» тестовых компаний — по одной; если на запись ещё ссылаются — остаётся (в отчёт)
  for k in 1..array_length(v_names, 1) loop
    continue when v_names[k][1] in ('core.projects', 'planfact.vor_imports', 'planfact.vor_source_rows', 'planfact.estimates');
    v_skip := 0;
    select format_type(a.atttypid, a.atttypmod) into v_idtype from pg_attribute a
    where a.attrelid = v_names[k][1]::regclass and a.attname = v_names[k][4] and not a.attisdropped;
    for rn in execute format(
        case when v_names[k][1] = 'core.locations' then
          -- место «REST…» со всеми вложенными, сначала самые глубокие
          'with recursive sub(id, company_id, depth) as (select id, company_id, 0 from core.locations where company_id = any($1) and name like ''REST%%''
             union select l.id, l.company_id, s.depth + 1 from core.locations l join sub s on l.parent_id = s.id)
           select id::text id, company_id::uuid cid from sub group by id, company_id order by max(depth) desc'
        else 'select %4$s::text id, (%2$s)::uuid cid from %1$s where %2$s = any($1) and %3$s like ''REST%%''' end,
        v_names[k][1], v_names[k][2], v_names[k][3], v_names[k][4]) using v_test loop
      begin
        execute format('delete from %s where %s = $1::%s', v_names[k][1], v_names[k][4], v_idtype) using rn.id;
        get diagnostics v_n = row_count;
        if v_n > 0 then insert into pf_cleanup_gone values (split_part(v_names[k][1], '.', 2), rn.id, rn.cid); end if;
      exception when foreign_key_violation then v_skip := v_skip + 1;
      end;
    end loop;
    if v_skip > 0 then insert into pf_cleanup_report values (5, 'оставлено (есть ссылки): ' || v_names[k][1], v_skip, null); end if;
  end loop;
  -- строки таблиц Качества с номером «REST-…» (остатки прерванных прогонов автотеста)
  for r in select c.table_name from information_schema.columns c join information_schema.tables tt
             on tt.table_schema = c.table_schema and tt.table_name = c.table_name and tt.table_type = 'BASE TABLE'
           where c.table_schema = 'quality' and c.column_name = 'id' and c.data_type = 'text'
             and exists (select 1 from information_schema.columns z where z.table_schema = 'quality' and z.table_name = c.table_name
                         and z.column_name = 'core_company_id') loop
    execute format('with d as (delete from quality.%I where core_company_id = any($1) and id like ''REST-%%'' returning id, core_company_id)
                    insert into pf_cleanup_gone select %L, id, core_company_id from d', r.table_name, r.table_name) using v_test;
  end loop;

  -- 4. Журнал удалённого
  with d as (delete from core.audit_log a where a.company_id = any(v_test)
             and (a.project_id = any(v_del) or a.record_id::text in (select g.id from pf_cleanup_gone g)) returning id, company_id)
  insert into pf_cleanup_gone select 'audit_log', id::text, company_id from d;

  -- Сторожа — обратно
  for r in select c.oid::regclass::text tbl, g.tgname from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace s on s.oid = c.relnamespace
           where s.nspname in ('planfact', 'core') and not g.tgisinternal and g.tgenabled = 'D' loop
    execute format('alter table %s enable trigger %I', r.tbl, r.tgname);
  end loop;

  -- Счётчики ПОСЛЕ и сверки
  insert into pf_cleanup_report select 4, 'удалено: ' || tbl, count(*), null from pf_cleanup_gone group by tbl;
  for r in select * from pf_cleanup_report where step in (1, 3) loop
    k := (select i from generate_subscripts(v_all, 1) i where v_all[i][1] = split_part(r.what, ': ', 2) limit 1);
    if r.step = 1 then
      execute format('select count(*) from %s where %s = any($1) and %s like ''REST%%''', v_all[k][1], v_all[k][2], v_all[k][3]) into v_n using v_test;
    else
      execute format('select count(*) from %s where not (coalesce(%s = any($1), false))', v_all[k][1], v_all[k][2]) into v_n using v_test;
    end if;
    update pf_cleanup_report set after_n = v_n where step = r.step and what = r.what;
  end loop;
  select count(*) into v_n from pf_cleanup_report where step = 3 and after_n <> before_n;
  if v_n > 0 then raise exception 'Уборка: у нетестовых компаний изменилось число строк (% таблиц) — всё откатено', v_n; end if;
  select count(*) into v_n from pf_cleanup_gone where not (coalesce(company_id = any(v_test), false));
  if v_n > 0 then raise exception 'Уборка: % удалённых строк не тестовой компании — всё откатено', v_n; end if;
  if exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace s on s.oid = c.relnamespace
             where s.nspname in ('planfact', 'core') and not g.tgisinternal and g.tgenabled = 'D') then
    raise exception 'Уборка: остался выключенный триггер — всё откатено';
  end if;

  if v_mode = 'dry' then
    select string_agg(format('%s | %s | до %s | после %s', step, what, before_n, coalesce(after_n::text, '—')), E'\n' order by step, what) into v_rep
    from pf_cleanup_report where step <> 3;
    raise exception E'СУХОЙ ПРОГОН (ничего не удалено, всё откатено):\n%\n3 | нетестовые компании: до = после по % таблицам', v_rep,
      (select count(*) from pf_cleanup_report where step = 3) using errcode = 'P0001';
  end if;
end $$;

select step, what, before_n "до", after_n "после" from pf_cleanup_report where step <> 3 order by step, what;
