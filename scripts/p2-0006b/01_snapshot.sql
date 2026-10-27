-- P2-0006b: снимок «до / после» 046 (ТОЛЬКО ЧТЕНИЕ). Запустить ДО миграции и сразу ПОСЛЕ — ответ должен совпасть строка в строку.
-- 046 не меняет ни одной строки ВОР, позиций и факта: добавляет столбцы, таблицы редакций и меняет расчёт плана только для
-- снятых позиций (их пока нет). По каждому проекту с ВОР:
--   загрузки        — черновиков / подтверждённых, строк исходника, связок;
--   позиции         — сколько и отпечаток (id, место, вид работ, ЕИ, объём);
--   факт            — записей и объём по статусам, отпечаток записей;
--   расчёт          — Σ плана и факта из planfact.fact_totals (им пользуются сводка, шахматка, ввод факта, КС-2);
--   сводка проекта  — деньги плана / сделано / выставлено, светофор (planfact.summary_project на сегодня);
--   сметы и КП      — сколько.
with pj as (
  select p.id, p.company_id, c.name company, p.name from core.projects p join core.companies c on c.id = p.company_id
   where exists (select 1 from planfact.vor_imports i where i.project_id = p.id)
), ft as (
  select pj.id, coalesce(sum(t.plan_qty), 0) plan, coalesce(sum(t.fact_qty), 0) fact, coalesce(sum(t.pending_qty), 0) pend, count(t.*) n
    from pj left join lateral planfact.fact_totals(pj.id) t on true group by pj.id
), sp as (
  select pj.id, s.plan_money, s.done_money, s.issued_money, s.light from pj cross join lateral planfact.summary_project(pj.id, planfact.fact_today()) s
)
select string_agg(line, E'\n' order by line) lines from (
  select pj.company || ' / ' || pj.name
    || ' | загрузки: черновиков ' || (select count(*) from planfact.vor_imports i where i.project_id = pj.id and i.status = 'draft')
    || ', подтверждённых ' || (select count(*) from planfact.vor_imports i where i.project_id = pj.id and i.status = 'confirmed')
    || ', строк ' || (select count(*) from planfact.vor_source_rows s where s.project_id = pj.id)
    || ', связок ' || (select count(*) from planfact.vor_links l where l.project_id = pj.id)
    || ' | позиций ' || (select count(*) from planfact.vor_positions p where p.project_id = pj.id)
    || ' ' || coalesce((select md5(string_agg(p.id::text || '|' || p.location_id || '|' || p.work_type_id || '|' || p.unit_id || '|' || p.qty, ',' order by p.id))
                          from planfact.vor_positions p where p.project_id = pj.id), '-')
    || ' | факт: ' || coalesce((select string_agg(e.status || ' ' || e.n || ' / ' || e.q, ', ' order by e.status)
                                  from (select status, count(*) n, sum(qty) q from planfact.fact_entries where project_id = pj.id group by status) e), 'нет')
    || ' ' || coalesce((select md5(string_agg(e.id::text || '|' || e.position_id || '|' || e.qty || '|' || e.status, ',' order by e.id))
                          from planfact.fact_entries e where e.project_id = pj.id), '-')
    || ' | расчёт: план ' || ft.plan || ', факт ' || ft.fact || ', ждёт ' || ft.pend || ', позиций ' || ft.n
    || ' | сводка: ' || coalesce(sp.plan_money::text, '—') || ' / ' || coalesce(sp.done_money::text, '—') || ' / ' || coalesce(sp.issued_money::text, '—') || ' · ' || coalesce(sp.light, '—')
    || ' | смет ' || (select count(*) from planfact.estimates e where e.project_id = pj.id)
    || ', КП ' || (select count(*) from planfact.kp_revisions k where k.project_id = pj.id) line
  from pj join ft on ft.id = pj.id left join sp on sp.id = pj.id
  union all
  select 'ВСЕГО: проектов с ВОР ' || (select count(*) from pj) || ', загрузок ' || (select count(*) from planfact.vor_imports)
    || ', позиций ' || (select count(*) from planfact.vor_positions) || ', записей факта ' || (select count(*) from planfact.fact_entries)
) x;
