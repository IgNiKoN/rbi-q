-- P2-0006b: проверка сразу после 046 на сервере (ТОЛЬКО ЧТЕНИЕ). Каждая строка — «OK …» или «FAIL …».
--   1) каждая подтверждённая загрузка — редакция №1, действующая (одна на цепочку); новых редакций и событий нет;
--   2) план в расчёте = Σ объёмов позиций (снятых нет); черновики — без «действующей»;
--   3) новые функции на месте, анонимный вход их не вызывает; таблицы редакций под RLS, представление закрыто.
select string_agg(line, E'\n' order by line) lines from (
  select case when a = b then 'OK' else 'FAIL' end || ' действующих редакций ' || b || ' = подтверждённых загрузок ' || a line
    from (select (select count(*) from planfact.vor_imports where status = 'confirmed') a, (select count(*) from planfact.vor_heads) b) x
  union all
  select case when n = 0 then 'OK' else 'FAIL' end || ' подтверждённых не «сама себе действующая»: ' || n
    from (select count(*) n from planfact.vor_imports i where i.status = 'confirmed'
           and not exists (select 1 from planfact.vor_heads h where h.root_import_id = i.id and h.current_import_id = i.id)) x
  union all
  select case when n = 0 then 'OK' else 'FAIL' end || ' загрузок не №1 или с предыдущей: ' || n
    from (select count(*) n from planfact.vor_imports where revision_no <> 1 or previous_import_id is not null or root_import_id is not null) x
  union all
  select case when n = 0 then 'OK' else 'FAIL' end || ' событий редакций: ' || n from (select count(*) n from planfact.vor_position_events) x
  union all
  select case when n = 0 then 'OK' else 'FAIL' end || ' черновиков среди действующих: ' || n
    from (select count(*) n from planfact.vor_heads h join planfact.vor_imports i on i.id = h.current_import_id where i.status <> 'confirmed') x
  union all
  select case when n = 0 then 'OK' else 'FAIL' end || ' проектов, где план расчёта ≠ Σ позиций: ' || n
    from (select count(*) n from core.projects p
           where (select coalesce(sum(plan_qty), 0) from planfact.fact_totals(p.id)) <> (select coalesce(sum(qty), 0) from planfact.vor_positions v where v.project_id = p.id)) x
  union all
  select case when n = 7 then 'OK' else 'FAIL' end || ' функций 046 (новые и пересозданные) с execute у authenticated: ' || n || ' из 7'
    from (select count(*) n from unnest(array['public.pf_vor_create_revision(uuid,text,text,text,uuid,jsonb)', 'public.pf_vor_revision_base(uuid)',
            'public.pf_vor_accept_revision(uuid,jsonb,jsonb)', 'public.pf_vor_revision_changes(uuid)', 'public.pf_vor_list_imports(uuid)',
            'public.pf_vor_positions(uuid,uuid)', 'public.pf_fact_positions(uuid,uuid)']) f
           where has_function_privilege('authenticated', f, 'execute')) x
  union all
  select case when n = 0 then 'OK' else 'FAIL' end || ' функций 046, доступных анонимно: ' || n
    from (select count(*) n from unnest(array['public.pf_vor_create_revision(uuid,text,text,text,uuid,jsonb)', 'public.pf_vor_revision_base(uuid)',
            'public.pf_vor_accept_revision(uuid,jsonb,jsonb)', 'public.pf_vor_revision_changes(uuid)', 'public.pf_vor_list_imports(uuid)',
            'public.pf_vor_positions(uuid,uuid)', 'public.pf_fact_positions(uuid,uuid)', 'public.pf_summary_positions(uuid,uuid)']) f
           where has_function_privilege('anon', f, 'execute')) x
  union all
  select case when a and b then 'OK' else 'FAIL' end || ' RLS: vor_heads ' || a || ', vor_position_events ' || b
    from (select (select relrowsecurity from pg_class where oid = 'planfact.vor_heads'::regclass) a,
                 (select relrowsecurity from pg_class where oid = 'planfact.vor_position_events'::regclass) b) x
  union all
  select case when not a and not b then 'OK' else 'FAIL' end || ' представление vor_positions_current закрыто: authenticated ' || a || ', anon ' || b
    from (select has_table_privilege('authenticated', 'planfact.vor_positions_current', 'select') a,
                 has_table_privilege('anon', 'planfact.vor_positions_current', 'select') b) x
) x;
