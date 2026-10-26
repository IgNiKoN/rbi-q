-- P2-0035b этап 1: пробная привязка людей (scripts/p2-0035b/dryrun.sql — тело выборки скопировано ниже без изменений;
-- при правке выборки — обновить копию). Однозначное ФИО, два однофамильца, уволенный (не сотрудник), запись с чужим автором.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 039d (PGlite — суперпользователь).
begin;
create temp table ids(k text primary key, v uuid);
insert into ids select k, gen_random_uuid() from unnest(array['ca','cb','pa','uiv','up1','up2','uadm','usid']) k;
create function pg_temp.i(k text) returns uuid language sql as $f$ select v from ids where ids.k = i.k $f$;
insert into auth.users(id, email) select v, v || '@test.invalid' from ids where k like 'u%';
insert into core.companies(id, name, is_test) values (pg_temp.i('ca'), 'Альфа 040a', true), (pg_temp.i('cb'), 'Бета 040a', true);
insert into core.projects(id, company_id, name) values (pg_temp.i('pa'), pg_temp.i('ca'), 'Объект 040a');
insert into core.company_members(company_id, user_id) values (pg_temp.i('ca'), pg_temp.i('uiv')), (pg_temp.i('ca'), pg_temp.i('up1')),
  (pg_temp.i('ca'), pg_temp.i('up2')), (pg_temp.i('ca'), pg_temp.i('uadm')), (pg_temp.i('cb'), pg_temp.i('usid'));
insert into core.user_profiles(user_id, full_name) values (pg_temp.i('uiv'), 'Иванов И.И.'), (pg_temp.i('up1'), 'Петров П.П.'),
  (pg_temp.i('up2'), 'Петров П.П.'), (pg_temp.i('uadm'), 'Админ А.А.'), (pg_temp.i('usid'), 'Сидоров С.С.');
-- проверки: Иванов (автор он же) ×2; Иванов, но автор — админ ×1; однофамилец Петров ×3; Сидоров (в другой компании) ×1
insert into quality.rbi_inspections(id, project_code, core_company_id, engineer_name, inspector_name, core_created_by)
select 'i' || g, pg_temp.i('pa')::text, pg_temp.i('ca'), n, n, a from (values
  (1, 'Иванов И.И.', pg_temp.i('uiv')), (2, ' иванов и.и. ', pg_temp.i('uiv')), (3, 'Иванов И.И.', pg_temp.i('uadm')),
  (4, 'Петров П.П.', null), (5, 'Петров П.П.', null), (6, 'ПЕТРОВ П.П.', pg_temp.i('up1')), (7, 'Сидоров С.С.', null)) v(g, n, a);
-- задачи: Иванов (кому — пусто), Петров (кому — пусто), почта Иванова как имя
insert into quality.rbi_tasks(id, project_code, core_company_id, engineer_name, inspector_name)
select 't' || g, pg_temp.i('pa')::text, pg_temp.i('ca'), n, n from (values (1, 'Иванов И.И.'), (2, 'Петров П.П.'), (3, pg_temp.i('uiv') || '@test.invalid')) v(g, n);
insert into quality.rbi_engineer_profiles(id, inspector_id, project_code, core_company_id, engineer_name, inspector_name, auth_user_id, profile_data)
values (gen_random_uuid(), pg_temp.i('pa')::text || '_Иванов', pg_temp.i('pa')::text, pg_temp.i('ca'), 'Иванов И.И.', 'Иванов И.И.', null, '{"gameLogs":[{"id":1}]}');

create temp table got as
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

do $$
declare res text := ''; r record;
begin
  select * into r from got where "таблица" = 'rbi_inspections';
  if r is null or r."строк с ФИО" <> 7 then res := res || 'FAIL проверок с ФИО 7: ' || coalesce(r."строк с ФИО"::text, 'нет') || E'\n'; end if;
  if r."уже с номером" <> 4 then res := res || 'FAIL уже с номером 4: ' || r."уже с номером" || E'\n'; end if;
  if r."узнано однозначно" <> 3 then res := res || 'FAIL узнано однозначно 3 (Иванов, регистр и пробелы): ' || r."узнано однозначно" || E'\n'; end if;
  if r."спорно" <> 3 then res := res || 'FAIL однофамильцы Петровы — спорно 3: ' || r."спорно" || E'\n'; end if;
  if r."не найдено" <> 1 then res := res || 'FAIL Сидоров из другой компании — не найдено 1: ' || r."не найдено" || E'\n'; end if;
  if r."номер не совпадает с ФИО" <> 1 then res := res || 'FAIL автор-админ при ФИО Иванова — расхождение 1: ' || r."номер не совпадает с ФИО" || E'\n'; end if;
  select * into r from got where "таблица" = 'rbi_tasks';
  if r."узнано однозначно" <> 2 or r."спорно" <> 1 or r."уже с номером" not in (0, 2) then res := res || 'FAIL задачи: Иванов и почта — однозначно 2, Петров — спорно 1 (с номером: 0 до 040b, 2 после — сервер ставит сам): ' || row_to_json(r) || E'\n'; end if;
  select * into r from got where "таблица" = 'rbi_engineer_profiles';
  if r."узнано однозначно" <> 1 or r."уже с номером" <> 0 then res := res || 'FAIL профиль Иванова узнан: ' || row_to_json(r) || E'\n'; end if;
  raise exception 'P2-0035b 040a (пробная привязка)%FAIL всего: %', E'\n' || res, (length(res) - length(replace(res, 'FAIL', ''))) / 4 using errcode = 'P0001';
end $$;
