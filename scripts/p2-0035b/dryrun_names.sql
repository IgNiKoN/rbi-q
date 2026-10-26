-- P2-0035b этап 1 — список для владельца: ФИО, которые не узнаются однозначно (спорно / не найдено / номер не совпадает).
-- ТОЛЬКО ЧТЕНИЕ. Кандидаты — почты сотрудников компании с этим именем. Сводка — dryrun.sql.
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
  select g.*, (select string_agg(distinct u.email::text, ', ') from people p join auth.users u on u.id::text = p.uid
                where p.co = g.co and p.alias = g.nm) cand,
         (select count(distinct p.uid) from people p where p.co = g.co and p.alias = g.nm) k,
         exists (select 1 from people p where p.co = g.co and p.alias = g.nm and p.uid = g.uid) id_ok
    from grp g
)
select c.name "компания", m.nm "ФИО в записях", case when k = 0 then 'не найдено' when k > 1 then 'спорно' else 'номер не совпадает' end "случай",
       string_agg(distinct m.what, ', ') "где", sum(m.n) "строк", max(m.cand) "кандидаты (почты)",
       (select string_agg(distinct u.email::text, ', ') from auth.users u where u.id::text = any (array_agg(m.uid))) "сейчас стоит номер"
  from m join core.companies c on c.id::text = m.co
 where k <> 1 or (m.uid is not null and not m.id_ok)
 group by 1, 2, 3 order by 1, 4 desc, 5 desc;
