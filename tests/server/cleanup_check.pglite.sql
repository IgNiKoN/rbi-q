-- P2-0011, P2-0075: ТОЛЬКО ДЛЯ PGlite — проверка после scripts/cleanup-test-projects.sql (засев — cleanup_seed.pglite.sql).
-- Режим определяется по данным: если удаляемые проекты ещё есть — проверяется «ничего не изменилось» (сухой прогон или отказ).
-- Отчёт — ERROR P0001 с итогом «FAIL всего: N».
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then 'OK ' || l else 'FAIL ' || l end || E'\n' $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;

do $$
declare res text := ''; n int; dry boolean; t text; pk uuid; pm uuid; v text;
begin
  dry := exists (select 1 from public.cleanup_seed s join core.projects p on p.id = s.id where s.expect_deleted);
  create temp table after_ on commit drop as select * from public.cleanup_counts();
  -- расхождения «до / после» по таблице, компании, проекту
  create temp table diff_ on commit drop as
  select coalesce(b.tbl, a.tbl) tbl, coalesce(b.company, a.company) company, coalesce(b.project, a.project) project,
         coalesce(b.n, 0) before_n, coalesce(a.n, 0) after_n
  from public.cleanup_counts_before b full join after_ a on a.tbl = b.tbl and a.company = b.company and a.project = b.project
  where coalesce(b.n, 0) <> coalesce(a.n, 0);

  if dry then
    select count(*) into n from diff_;
    select string_agg(format('%s/%s/%s %s→%s', tbl, company, project, before_n, after_n), '; ') into v from diff_;
    res := res || pg_temp.t(n = 0, 'ничего не изменилось ни в одной таблице (расхождений ' || n || coalesce(': ' || v, '') || ')');
  else
    select id into pk from public.cleanup_seed where name = 'REST-автопроверки';
    select id into pm from public.cleanup_seed where name = 'Альфа основной';
    -- нетестовая компания: ни одного расхождения
    select count(*) into n from diff_ where company = 'РБИ';
    res := res || pg_temp.t(n = 0, 'РБИ (не тестовая): все таблицы до = после (расхождений ' || n || ')');
    -- обычные проекты тестовых компаний: без изменений, кроме «REST…»-строк в «Альфа основной» (2 работы с журналом, 1 строка справочника Качества)
    select string_agg(format('%s/%s %s→%s', tbl, project, before_n, after_n), '; ') into v from diff_
    where project in ('Альфа основной', 'Старый объект', 'rest-маленькими', 'Бета основной', 'Спутник')
      and not (project = 'Альфа основной' and ((tbl = 'planfact.works' and before_n - after_n = 2) or (tbl = 'core.audit_log' and before_n - after_n = 2)
                                              or (tbl = 'quality.contractor_directory' and before_n - after_n = 1)));
    res := res || pg_temp.t(v is null, 'обычные проекты Альфы, Беты, Демо — без изменений, кроме «REST…» (' || coalesce(v, 'ок') || ')');
    select count(*) into n from planfact.works where project_id = pm and name like 'REST%';
    res := res || pg_temp.t(n = 0, '«Альфа основной»: работы «REST-тест» убраны, обычные на месте (' || n || ')');
    -- проекты
    select count(*) into n from public.cleanup_seed s join core.projects p on p.id = s.id where s.expect_deleted;
    res := res || pg_temp.t(n = 0, 'проекты «REST…» (архивные и нет) удалены — осталось ' || n);
    select count(*) into n from public.cleanup_seed s where not s.expect_deleted and not exists (select 1 from core.projects p where p.id = s.id);
    res := res || pg_temp.t(n = 0, 'остальные проекты (в т. ч. «REST-автопроверки», «rest-маленькими», архивный обычный) на месте — пропало ' || n);
    select count(*) into n from diff_ where project in (select name from public.cleanup_seed where expect_deleted) and after_n <> 0;
    res := res || pg_temp.t(n = 0, 'у удалённых проектов 0 строк во всех таблицах (не 0: ' || n || ')');
    -- постоянный объект: данные прогонов убраны, объект, его обычные места и действующее назначение — на месте
    foreach t in array array['vor_imports', 'vor_source_rows', 'vor_positions', 'vor_links', 'vor_heads', 'vor_position_events', 'fact_entries',
                             'fact_submissions', 'estimates', 'estimate_rows', 'estimate_overheads', 'kp_revisions', 'ks2_settings', 'ks2_acts',
                             'ks2_revisions', 'works'] loop
      execute format('select count(*) from planfact.%I where project_id = $1', t) into n using pk;
      res := res || pg_temp.t(n = 0, '«REST-автопроверки»: ' || t || ' = 0 (' || n || ')');
    end loop;
    select count(*) into n from core.locations where project_id = pk and name in ('Корпус 1', 'Секция 1', 'Этаж 1');
    res := res || pg_temp.t(n = 3, '«REST-автопроверки»: обычные места остались (' || n || ' из 3)');
    select count(*) into n from core.locations where project_id = pk and name like 'REST%';
    res := res || pg_temp.t(n = 0, '«REST-автопроверки»: место «REST-045» со вложенными убрано (' || n || ')');
    select count(*) into n from core.locations l where project_id = pk and not exists (select 1 from core.locations p where p.id = l.parent_id) and l.parent_id is not null;
    res := res || pg_temp.t(n = 0, '«REST-автопроверки»: нет мест без родителя (' || n || ')');
    select count(*) into n from core.role_assignments where project_id = pk and revoked_at is not null;
    res := res || pg_temp.t(n = 0, '«REST-автопроверки»: отозванные назначения убраны (' || n || ')');
    select count(*) into n from core.role_assignments where project_id = pk and revoked_at is null;
    res := res || pg_temp.t(n = 1, '«REST-автопроверки»: действующее назначение осталось (' || n || ')');
    select count(*) into n from quality.rbi_inspections where id like 'REST-%';
    res := res || pg_temp.t(n = 0, 'Качество: строки «REST-…» убраны (' || n || ')');
    select count(*) into n from quality.rbi_inspections where id = 'insp-ok-1';
    res := res || pg_temp.t(n = 1, 'Качество: обычная строка на месте');
    -- «REST…» в тестовых компаниях: остались только постоянный объект и вид работ, на который ссылается ВОР обычного проекта
    select string_agg(x, ', ' order by x) into v from (
      select 'проект ' || name x from core.projects where name like 'REST%'
      union all select 'вид работ ' || name from core.work_types where name like 'REST%'
      union all select 'ВОР ' || file_name from planfact.vor_imports where file_name like 'REST%'
      union all select 'строка ВОР ' || name from planfact.vor_source_rows where name like 'REST%'
      union all select 'смета ' || name from planfact.estimates where name like 'REST%'
      union all select 'работа ' || name from planfact.works where name like 'REST%'
      union all select 'цена ' || name from planfact.price_items where name like 'REST%'
      union all select 'словарь ' || canon_name from planfact.vor_dictionary where upper(canon_name) like 'REST%'
      union all select 'бригада ' || name from planfact.brigades where name like 'REST%'
      union all select 'единица ' || name from core.units where name like 'REST%'
      union all select 'роль ' || name from core.company_roles where name like 'REST%'
      union all select 'контрагент ' || name from core.counterparties where name like 'REST%'
      union all select 'подразделение ' || name from core.divisions where name like 'REST%'
      union all select 'место ' || name from core.locations where name like 'REST%'
      union all select 'подрядчик Качества ' || display_name from quality.contractor_directory where display_name like 'REST%') z;
    res := res || pg_temp.t(v = 'вид работ REST-вид занят, проект REST-автопроверки', 'осталось «REST…»: ' || coalesce(v, 'ничего'));
    -- записи компании без «REST…» — на месте
    res := res || pg_temp.t((select count(*) from core.divisions where name = 'Отдел продаж') = 1
                            and (select count(*) from core.counterparties where name = 'ООО Обычный подрядчик') = 1
                            and (select count(*) from planfact.brigades where name like 'Кладка бригада%') = 1
                            and (select count(*) from core.work_types where name like 'Кладка вид%') = 1, 'обычные подразделение, контрагент, бригада, вид работ — на месте');
    -- журнал удалённых проектов убран
    select count(*) into n from core.audit_log a where a.project_id in (select id from public.cleanup_seed where expect_deleted);
    res := res || pg_temp.t(n = 0, 'журнал удалённых проектов убран (' || n || ')');
  end if;
  -- сторожа снова включены и работают
  select count(*) into n from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace s on s.oid = c.relnamespace
  where s.nspname in ('planfact', 'core') and not g.tgisinternal and g.tgenabled = 'D';
  res := res || pg_temp.t(n = 0, 'все триггеры planfact и core включены (выключенных ' || n || ')');
  select id into pm from public.cleanup_seed where name = 'Альфа основной';
  foreach t in array array['vor_imports', 'fact_entries', 'kp_revisions', 'ks2_revisions'] loop
    res := res || pg_temp.t(pg_temp.err(format('delete from planfact.%I where project_id = %L', t, pm)) <> 'OK', 'сторож ' || t || ' снова запрещает удаление');
  end loop;
  res := res || pg_temp.t(pg_temp.err(format('delete from core.audit_log where project_id = %L', pm)) <> 'OK', 'сторож журнала снова запрещает удаление');
  select count(*) into n from regexp_matches(res, '(^|\n)FAIL', 'g');
  raise exception E'%\nFAIL всего: %', res, n;
end $$;
