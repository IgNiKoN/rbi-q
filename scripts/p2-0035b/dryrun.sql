-- P2-0035b этап 1 — пробная привязка людей по номеру учётки: ТОЛЬКО ЧТЕНИЕ (одна выборка; ничего не создаёт и не меняет).
-- Для каждой рабочей таблицы Качества: сколько строк подписано ФИО, сколько уже с номером учётки, у скольких ФИО однозначно
-- узнаётся среди сотрудников компании (по синонимам core.staff_name_aliases: ФИО, почта, имена старого профиля РБИ),
-- сколько спорных (два и больше сотрудника), не найденных и где номер уже стоит, но не совпадает с узнанным по ФИО.
-- Запуск: SQL Editor сервера (суперпользователь) или PGlite. Список спорных/не найденных — dryrun_names.sql.
with people as (
  select m.company_id::text co, m.user_id::text uid, a.alias
    from core.company_members m
    left join core.user_profiles up on up.user_id = m.user_id
    cross join lateral unnest(core.staff_name_aliases(m.user_id, up.full_name)) a(alias)
), src(t, name_col, id_col, what) as (values
  ('rbi_engineer_profiles',   'engineer_name', 'auth_user_id',             'профиль (очки)'),
  ('rbi_engineer_ratings',    'engineer_name', 'auth_user_id',             'рейтинг'),
  ('rbi_inspections',         'engineer_name', 'core_created_by',          'проверки'),
  ('rbi_tasks',               'engineer_name', 'assigned_to_auth_user_id', 'задачи (кому)'),
  ('rbi_draft_sessions',      'engineer_name', 'owner_auth_user_id',       'черновики'),
  ('rbi_sync_queue',          'engineer_name', 'core_created_by',          'очередь отправки'),
  ('project_fmea',            'engineer_name', 'core_created_by',          'FMEA'),
  ('project_interventions',   'engineer_name', 'core_created_by',          'вмешательства'),
  ('project_meetings',        'engineer_name', 'core_created_by',          'совещания'),
  ('project_schedule_stages', 'engineer_name', 'core_created_by',          'этапы графика'),
  ('shared_reports',          'engineer_name', 'core_created_by',          'отчёты')
), grp as (
  select s.t, s.what, x.co, x.nm, nullif(x.uid, '') uid, x.n
    from src s,
         xmltable('/table/row' passing query_to_xml(format(
           'select core_company_id::text co, lower(btrim(%1$I::text)) nm, coalesce(%2$I::text, '''') uid, count(*) n
              from quality.%3$I where nullif(btrim(%1$I::text), '''') is not null group by 1, 2, 3',
           s.name_col, s.id_col, s.t), true, false, '')
           columns co text, nm text, uid text, n int) x
), m as (
  select g.*, (select count(distinct p.uid) from people p where p.co = g.co and p.alias = g.nm) k,
         exists (select 1 from people p where p.co = g.co and p.alias = g.nm and p.uid = g.uid) id_ok
    from grp g
)
select t "таблица", what "что", sum(n) "строк с ФИО",
       coalesce(sum(n) filter (where uid is not null), 0) "уже с номером",
       coalesce(sum(n) filter (where k = 1), 0) "узнано однозначно",
       coalesce(sum(n) filter (where k > 1), 0) "спорно",
       coalesce(sum(n) filter (where k = 0), 0) "не найдено",
       coalesce(sum(n) filter (where uid is not null and k >= 1 and not id_ok), 0) "номер не совпадает с ФИО",
       count(distinct nm) "разных ФИО"
  from m group by t, what order by t;
