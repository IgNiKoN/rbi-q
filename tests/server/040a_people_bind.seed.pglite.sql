-- P2-0035b 040a: данные для проверки привязки (PGlite; запускать ДО 040a_people_bind_up.sql, затем 040a_people_bind.sql).
-- Иванов (однозначно), два Петрова (однофамильцы), Латышев и опечатка «Латвшев», тестовая учётка старого РБИ (@rbi-quality.local).
create table public.t040a(k text primary key, v uuid);
insert into public.t040a select k, gen_random_uuid() from unnest(array['ca','pa','uiv','up1','up2','ula','utest']) k;
create function public.t040a(k text) returns uuid language sql as $f$ select v from public.t040a where t040a.k = $1 $f$;
insert into auth.users(id, email) select v, v || '@test.invalid' from public.t040a where k like 'u%' and k <> 'utest';
insert into auth.users(id, email) values (public.t040a('utest'), 'rbi_rbi_test_x@rbi-quality.local');
insert into core.companies(id, name, is_test) values (public.t040a('ca'), 'Альфа 040a', true);
insert into core.projects(id, company_id, name) values (public.t040a('pa'), public.t040a('ca'), 'Объект 040a');
insert into core.company_members(company_id, user_id) select public.t040a('ca'), public.t040a(k) from unnest(array['uiv','up1','up2','ula']) k;
insert into core.user_profiles(user_id, full_name) values (public.t040a('uiv'), 'Иванов И.И.'), (public.t040a('up1'), 'Петров П.П.'),
  (public.t040a('up2'), 'Петров П.П.'), (public.t040a('ula'), 'Латышев Е.В.');
insert into quality.rbi_tasks(id, project_code, core_company_id, engineer_name, inspector_name) values
  ('t1', public.t040a('pa')::text, public.t040a('ca'), 'Иванов И.И.', 'Иванов И.И.'),
  ('t2', public.t040a('pa')::text, public.t040a('ca'), ' ИВАНОВ И.И.', 'Иванов И.И.'),
  ('t3', public.t040a('pa')::text, public.t040a('ca'), 'Петров П.П.', 'Петров П.П.'),
  ('t4', public.t040a('pa')::text, public.t040a('ca'), 'Неизвестный Н.Н.', 'Неизвестный Н.Н.');
insert into quality.rbi_draft_sessions(id, project_code, core_company_id, engineer_name) values
  ('d1', public.t040a('pa')::text, public.t040a('ca'), 'Латвшев Е.В.'), ('d2', public.t040a('pa')::text, public.t040a('ca'), 'Петров П.П.');
insert into quality.rbi_engineer_ratings(id, project_code, core_company_id, engineer_name, pi, auth_user_id) values
  ('r1', public.t040a('pa')::text, public.t040a('ca'), 'Иванов И.И.', 100, null),
  ('r2', public.t040a('pa')::text, public.t040a('ca'), 'Тест', 50, public.t040a('utest'));
