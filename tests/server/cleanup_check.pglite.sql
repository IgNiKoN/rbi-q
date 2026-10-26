-- P2-0011 этап 1: ТОЛЬКО ДЛЯ PGlite — проверка после scripts/cleanup-test-projects.sql (см. cleanup_seed.pglite.sql).
-- Режим определяется по данным: если удаляемые проекты ещё есть — проверяется «сухой прогон ничего не изменил».
-- Отчёт — ERROR P0001 с итогом «FAIL всего: N».
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then 'OK ' || l else 'FAIL ' || l end || E'\n' $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;

do $$
declare res text := ''; n int; m int; dry boolean; t text; keep uuid;
begin
  dry := exists (select 1 from public.cleanup_seed s join core.projects p on p.id = s.id where s.expect_deleted);
  create temp table after_ as
  select s.id, x.t, x.n from public.cleanup_seed s cross join lateral (
    select 'vor_imports' t, (select count(*) from planfact.vor_imports where project_id = s.id) n
    union all select 'vor_source_rows', (select count(*) from planfact.vor_source_rows where project_id = s.id)
    union all select 'vor_positions', (select count(*) from planfact.vor_positions where project_id = s.id)
    union all select 'vor_links', (select count(*) from planfact.vor_links where project_id = s.id)
    union all select 'locations', (select count(*) from core.locations where project_id = s.id)
    union all select 'fact_entries', (select count(*) from planfact.fact_entries where project_id = s.id)
    union all select 'estimates', (select count(*) from planfact.estimates where project_id = s.id)
    union all select 'estimate_rows', (select count(*) from planfact.estimate_rows where project_id = s.id)
    union all select 'estimate_overheads', (select count(*) from planfact.estimate_overheads where project_id = s.id)
    union all select 'kp_revisions', (select count(*) from planfact.kp_revisions where project_id = s.id)
    union all select 'ks2_settings', (select count(*) from planfact.ks2_settings where project_id = s.id)
    union all select 'ks2_acts', (select count(*) from planfact.ks2_acts where project_id = s.id)
    union all select 'ks2_revisions', (select count(*) from planfact.ks2_revisions where project_id = s.id)
    union all select 'works', (select count(*) from planfact.works where project_id = s.id)
    union all select 'audit_log', (select count(*) from core.audit_log where project_id = s.id)
    union all select 'projects', (select count(*) from core.projects where id = s.id)) x;

  select count(*) into n from public.cleanup_seed_before b where b.n = 0 and b.t in ('vor_imports', 'fact_entries', 'kp_revisions', 'ks2_revisions', 'audit_log', 'projects')
    and b.id in (select id from public.cleanup_seed where name <> 'REST-проект 2026-10-22T10:00');
  res := res || pg_temp.t(n = 0, 'подготовка: у полных проектов есть ВОР, факт, КП, редакции КС-2, журнал (пустых ' || n || ')');
  -- оставшиеся проекты не изменились ни в одной таблице
  select count(*) into n from public.cleanup_seed_before b join after_ a on a.id = b.id and a.t = b.t
  join public.cleanup_seed s on s.id = b.id where not s.expect_deleted and a.n <> b.n;
  res := res || pg_temp.t(n = 0, 'Демо, не-архивные, не-REST и «rest-» строчными — без изменений во всех 16 таблицах (расхождений ' || n || ')');
  if dry then
    select count(*) into n from public.cleanup_seed_before b join after_ a on a.id = b.id and a.t = b.t where a.n <> b.n;
    res := res || pg_temp.t(n = 0, 'сухой прогон: ничего не удалено (расхождений ' || n || ')');
  else
    select count(*) into n from after_ a join public.cleanup_seed s on s.id = a.id where s.expect_deleted and a.n <> 0;
    res := res || pg_temp.t(n = 0, 'удаление: у архивных REST-% тестовых компаний 0 строк во всех 16 таблицах (осталось ' || n || ')');
    select count(*) into n from core.projects p join core.companies c on c.id = p.company_id where c.name = 'Альфа';
    res := res || pg_temp.t(n = 4, 'Альфа: осталось 4 проекта (автопроверки, основной, «Старый», «rest-») — ' || n);
    select count(*) into n from core.projects p join core.companies c on c.id = p.company_id where c.name = 'Бета';
    res := res || pg_temp.t(n = 0, 'Бета: 0 проектов — ' || n);
    select count(*) into n from core.projects p join core.companies c on c.id = p.company_id where c.name = 'Демо-компания';
    res := res || pg_temp.t(n = 2, 'Демо-компания (не тест): оба проекта на месте, в т.ч. архивный «REST-ВОР демо» — ' || n);
  end if;
  select count(*) into n from public.cleanup_seed_company_before b
  where b.work_types = (select count(*) from core.work_types) and b.brigades = (select count(*) from planfact.brigades)
    and b.price_items = (select count(*) from planfact.price_items) and b.roles = (select count(*) from core.company_roles)
    and b.units = (select count(*) from core.units) and b.companies = (select count(*) from core.companies);
  res := res || pg_temp.t(n = 1, 'справочники компаний (виды работ, бригады, цены, роли, ЕИ) и компании не тронуты');
  select count(*) into n from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace s on s.oid = c.relnamespace
  where s.nspname in ('planfact', 'core') and not g.tgisinternal and g.tgenabled = 'D';
  res := res || pg_temp.t(n = 0, 'все триггеры planfact и core включены (выключенных ' || n || ')');
  -- сторожа снова работают: подтверждённый ВОР, факт, КП, выданный акт и журнал оставшегося проекта не удалить
  select id into keep from public.cleanup_seed where name = 'REST-автопроверки';
  foreach t in array array['vor_imports', 'fact_entries', 'kp_revisions', 'ks2_revisions', 'audit_log'] loop
    res := res || pg_temp.t(pg_temp.err(format('delete from planfact.%I where project_id = %L', t, keep)) <> 'OK', 'сторож ' || t || ' снова запрещает удаление');
  end loop;

  select count(*) into n from regexp_matches(res, '(^|\n)FAIL', 'g');
  raise exception E'%\nFAIL всего: %', res, n;
end $$;
