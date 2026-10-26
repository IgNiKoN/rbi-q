-- P2-0011 этап 1. Уборка тестового мусора на общем сервере: архивные проекты «REST-…» тестовых компаний (companies.is_test = true)
-- вместе со всеми их данными (ВОР, связки, позиции, места, факт, сметы, КП, КС-2, работы, назначения на проект, журнал этих проектов).
-- Что удаляется — ТОЛЬКО: core.projects, у которых archived_at is not null И name like 'REST-%' И компания is_test = true.
-- Демо-компания, не-тестовые компании, неархивные проекты (в т.ч. постоянный объект «REST-автопроверки») — не затрагиваются.
-- Справочники компании (виды работ, цены, бригады, роли, единицы) — не удаляются; отчёт показывает их «REST-…» для сведения.
--
-- РЕЖИМ (строка ниже): 'dry' — сухой прогон: всё выполняется и откатывается, отчёт приходит как ERROR P0001 «СУХОЙ ПРОГОН …»;
-- 'apply' — удаление (только по разрешению владельца на шаг после сухого прогона), отчёт — результат последнего select.
-- Всё — одним блоком: сторожа неизменяемости (ВОР, факт, КП, КС-2, журнал) отключаются только внутри этой транзакции
-- (ALTER TABLE … DISABLE TRIGGER держит блокировку таблицы до конца транзакции — чужие записи ждут) и включаются обратно в ней же;
-- при любой ошибке откатывается всё. Повторный запуск — 0 строк. Применять ФАЙЛОМ (буфер в UTF-8), как миграции.
create temp table if not exists pf_cleanup_report(step int, what text, before_n bigint, after_n bigint);
truncate pf_cleanup_report;

do $$
declare
  v_mode text := 'dry';   -- 'dry' | 'apply'
  v_ids uuid[];
  v_rep text := '';
  r record;
  v_n bigint;
  -- таблицы с project_id в порядке удаления (дети раньше родителей)
  v_tables text[] := array['ks2_revisions', 'ks2_acts', 'ks2_settings', 'fact_entries', 'estimate_rows', 'estimate_overheads', 'kp_revisions',
                           'estimates', 'vor_links', 'vor_positions', 'vor_source_rows', 'vor_imports', 'locations', 'works',
                           'role_assignments', 'audit_log'];
  v_guards text[][] := array[['ks2_revisions', 'ks2_revisions_guard'], ['ks2_acts', 'ks2_acts_guard'], ['fact_entries', 'fact_entries_guard'],
                             ['kp_revisions', 'kp_revisions_guard'], ['vor_links', 'vor_links_guard'], ['vor_positions', 'vor_positions_guard'],
                             ['vor_source_rows', 'vor_source_rows_guard'], ['vor_imports', 'vor_imports_guard'], ['works', 'works_audit'],
                             ['audit_log', 'audit_log_no_change']];
  t text; k int;
begin
  if v_mode not in ('dry', 'apply') then raise exception 'Режим — dry или apply'; end if;
  -- P2-0015: таблицы ядра (projects, locations, role_assignments, audit_log) — в схеме core, остальные — в planfact
  perform set_config('search_path', 'planfact, core, pg_catalog', true);
  select coalesce(array_agg(p.id order by p.name), '{}') into v_ids
  from core.projects p join core.companies c on c.id = p.company_id
  where c.is_test and p.archived_at is not null and p.name like 'REST-%';

  -- Счётчики ДО: по каждой таблице — всего, у удаляемых проектов, у остальных; по компаниям — число проектов
  insert into pf_cleanup_report select 0, 'проектов к удалению (архивные REST-% в is_test)', cardinality(v_ids), null;
  insert into pf_cleanup_report
  select 1, 'компания «' || c.name || '»' || case when c.is_test then ' (тест)' else '' end || ': проектов', count(p.id), null
  from core.companies c left join core.projects p on p.company_id = c.id group by c.id, c.name, c.is_test;
  foreach t in array v_tables || array['projects'] loop
    execute format('select count(*) from %I where %s = any($1)', t, case when t = 'projects' then 'id' else 'project_id' end)
      into v_n using v_ids;
    insert into pf_cleanup_report values (2, 'удалить: ' || t, v_n, null);
    execute format('select count(*) from %I where not (%s = any($1)) or %s is null', t,
                   case when t = 'projects' then 'id' else 'project_id' end, case when t = 'projects' then 'id' else 'project_id' end)
      into v_n using v_ids;
    insert into pf_cleanup_report values (3, 'остаётся: ' || t, v_n, null);
  end loop;
  insert into pf_cleanup_report
  select 4, 'для сведения, не удаляется: ' || x.what, x.n, null from (
    select 'виды работ REST-…' what, count(*) n from core.work_types w join core.companies c on c.id = w.company_id where c.is_test and w.name like 'REST-%'
    union all select 'бригады REST-…', count(*) from planfact.brigades b join core.companies c on c.id = b.company_id where c.is_test and b.name like 'REST-%'
    union all select 'роли REST-…', count(*) from core.company_roles cr join core.companies c on c.id = cr.company_id where c.is_test and cr.name like 'REST-%'
    union all select 'цены (справочник) тестовых компаний', count(*) from planfact.price_items i join core.companies c on c.id = i.company_id where c.is_test) x;

  -- Удаление: сторожа — выключить только на время транзакции
  if cardinality(v_ids) > 0 then
    for k in 1..array_length(v_guards, 1) loop
      execute format('alter table %I disable trigger %I', v_guards[k][1], v_guards[k][2]);
    end loop;
    -- акт ↔ выданная редакция ссылаются друг на друга — одним оператором (внешние ключи проверяются в конце оператора)
    with a as (delete from planfact.ks2_acts where project_id = any(v_ids))
    delete from planfact.ks2_revisions where project_id = any(v_ids);
    foreach t in array v_tables loop
      continue when t in ('ks2_revisions', 'ks2_acts');
      execute format('delete from %I where project_id = any($1)', t) using v_ids;
    end loop;
    delete from core.projects where id = any(v_ids);
    for k in 1..array_length(v_guards, 1) loop
      execute format('alter table %I enable trigger %I', v_guards[k][1], v_guards[k][2]);
    end loop;
  end if;

  -- Счётчики ПОСЛЕ: у удаляемых — 0; у остальных — как до
  for r in select * from pf_cleanup_report where step in (2, 3) loop
    t := split_part(r.what, ': ', 2);
    execute format('select count(*) from %I where %s', t,
                   case when r.step = 2 then format('%s = any($1)', case when t = 'projects' then 'id' else 'project_id' end)
                        else format('not (%1$s = any($1)) or %1$s is null', case when t = 'projects' then 'id' else 'project_id' end) end)
      into v_n using v_ids;
    update pf_cleanup_report set after_n = v_n where step = r.step and what = r.what;
  end loop;
  update pf_cleanup_report x set after_n = s.n
  from (select c.name, count(p.id) n from core.companies c left join core.projects p on p.company_id = c.id group by c.id, c.name) s
  where x.step = 1 and x.what like 'компания «' || s.name || '»%';
  select count(*) into v_n from pf_cleanup_report where (step = 2 and after_n <> 0) or (step = 3 and after_n <> before_n);
  if v_n > 0 then raise exception 'Уборка: после удаления счётчики не сходятся (% строк отчёта) — всё откатено', v_n; end if;
  if exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace s on s.oid = c.relnamespace
             where s.nspname = 'planfact' and not g.tgisinternal and g.tgenabled = 'D') then
    raise exception 'Уборка: остался выключенный триггер — всё откатено';
  end if;

  if v_mode = 'dry' then
    select string_agg(format('%s | %s | до %s | после %s', step, what, before_n, coalesce(after_n::text, '—')), E'\n' order by step, what) into v_rep
    from pf_cleanup_report;
    raise exception E'СУХОЙ ПРОГОН (ничего не удалено, всё откатено):\n%', v_rep using errcode = 'P0001';
  end if;
end $$;

select step, what, before_n "до", after_n "после" from pf_cleanup_report order by step, what;
