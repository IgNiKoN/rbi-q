-- Откат P2-0008 (011). Удаляет функции сводки и плановые даты проектов (ВВЕДЁННЫЕ ДАТЫ ТЕРЯЮТСЯ).
-- Факт, ВОР, цены, сметы, КП и КС-2 не затрагивает. Строки журнала (audit_log) остаются.
drop function if exists public.pf_summary_ks2_gap(uuid);
drop function if exists public.pf_summary_positions(uuid, uuid);
drop function if exists public.pf_summary_worktypes(uuid);
drop function if exists public.pf_summary_portfolio();
drop function if exists public.pf_project_set_dates(uuid, date, date);
drop function if exists planfact.summary_project(uuid, date);
drop function if exists planfact.summary_rows(uuid, date);
drop function if exists planfact.require_summary_view(uuid);
alter table planfact.projects drop constraint if exists projects_planned_dates_chk;
alter table planfact.projects drop column if exists planned_finish;
alter table planfact.projects drop column if exists planned_start;
