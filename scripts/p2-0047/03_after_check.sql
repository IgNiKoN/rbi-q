-- P2-0047 этап 6: проверка сразу после 045 на сервере (ТОЛЬКО ЧТЕНИЕ). Каждая строка — «OK …» или «FAIL …».
--   1) верх дерева — только объекты, объектов ниже верха нет; виды объектов — из справочника;
--   2) справочники заполнены; функции на месте; анонимный вход не вызывает ни одну новую функцию;
--   3) изоляция в базе: RLS включена на core.divisions, у функций — security definer и фиксированный search_path.
select string_agg(line, E'\n' order by line) lines from (
  select case when n = 0 then 'OK' else 'FAIL' end || ' верхних мест не «объект»: ' || n line
    from (select count(*) n from core.locations where parent_id is null and deleted_at is null and node_type <> 'object') x
  union all
  select case when n = 0 then 'OK' else 'FAIL' end || ' объектов ниже верхнего уровня: ' || n
    from (select count(*) n from core.locations where parent_id is not null and node_type = 'object') x
  union all
  select case when n = 0 then 'OK' else 'FAIL' end || ' объектов без вида из справочника: ' || n
    from (select count(*) n from core.locations l where l.node_type = 'object' and not exists (select 1 from core.object_kinds k where k.code = l.object_kind)) x
  union all
  select 'OK объекты по видам: ' || coalesce(string_agg(k || ' ' || n, ', ' order by k), 'нет')
    from (select object_kind k, count(*) n from core.locations where node_type = 'object' and deleted_at is null group by object_kind) x
  union all
  select case when s = 6 and k = 5 and r >= 4 then 'OK' else 'FAIL' end || ' справочники: стадий ' || s || ', видов ' || k || ', ролей ' || r
    from (select (select count(*) from core.project_stages) s, (select count(*) from core.object_kinds) k, (select count(*) from core.project_roles) r) x
  union all
  select case when count(*) = 12 then 'OK' else 'FAIL' end || ' новых функций: ' || count(*) || ' из 12'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('pf_project_dicts', 'pf_company_divisions', 'pf_save_division', 'pf_project_catalog', 'pf_save_project',
     'pf_project_places', 'pf_save_place', 'pf_remove_place', 'pf_fill_object', 'pf_add_floors', 'pf_copy_place', 'pf_locations_from_quality')
  union all
  select case when count(*) = 0 then 'OK' else 'FAIL' end || ' анонимный вход вызывает новые функции: ' || coalesce(string_agg(p.proname, ', '), '0')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('pf_project_dicts', 'pf_company_divisions', 'pf_save_division', 'pf_project_catalog', 'pf_save_project',
     'pf_project_places', 'pf_save_place', 'pf_remove_place', 'pf_fill_object', 'pf_add_floors', 'pf_copy_place')
     and has_function_privilege('anon', p.oid, 'execute')
  union all
  select case when count(*) = 0 then 'OK' else 'FAIL' end || ' функции без security definer или search_path: ' || coalesce(string_agg(p.proname, ', '), '0')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('pf_project_dicts', 'pf_company_divisions', 'pf_save_division', 'pf_project_catalog', 'pf_save_project',
     'pf_project_places', 'pf_save_place', 'pf_remove_place', 'pf_fill_object', 'pf_add_floors', 'pf_copy_place')
     and not (p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'))
  union all
  select case when c.relrowsecurity then 'OK' else 'FAIL' end || ' RLS на core.divisions: ' || c.relrowsecurity::text
    from pg_class c where c.oid = 'core.divisions'::regclass
  union all
  select case when not has_table_privilege('anon', 'core.divisions', 'select') then 'OK' else 'FAIL' end || ' анонимный вход не читает core.divisions'
) z;
