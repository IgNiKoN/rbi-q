-- P2-0036 этап 1: перенос готовых отчётов РБИ (036) — ТОЛЬКО ДЛЯ PGlite (наполняет public.* подставными данными; боевой сервер не выполняет).
-- Проверяет: отчёты и снимки в переносе (отчёт раньше снимка), один объект (отчёты, снимки, файлы из ссылок отчёта и снимка), ссылки
-- в file_url и в HTML снимка → бакет компании, код проекта → объект ядра, автор; отчёт с чужим кодом и его снимок — не переносятся;
-- видимость по закреплённым объектам (033): инженер своего объекта видит, чужого — нет; повтор без дублей; очистка; полный перенос;
-- сверка по бакетам (ловит недокопированный файл и другой размер); public до = после. Отчёт — ERROR P0001 с «FAIL всего: N».
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
create or replace function pg_temp.seen(tbl text) returns text language plpgsql as $f$
declare s text;
begin
  execute format('select coalesce(string_agg(id, '','' order by id collate "C"), '''') from quality.%I', tbl) into s;
  return s;
exception when others then return 'ERR:' || sqlstate; end $f$;
-- копия файлов, как после scripts/rbi-transfer/files.mjs copy (размер — как у оригинала)
create or replace function pg_temp.copy_files(c uuid) returns void language plpgsql as $f$
begin
  insert into storage.objects(bucket_id, name, metadata)
  select 'quality-' || l.old_bucket, c || '/' || l.old_name, o.metadata from quality.rbi_transfer_files l
    join storage.objects o on o.bucket_id = l.old_bucket and o.name = l.old_name
   where l.core_company_id = c and l.copied_at is null;
  update quality.rbi_transfer_files set copied_at = now() where core_company_id = c and copied_at is null;
end $f$;
create or replace function pg_temp.objects(c uuid) returns void language plpgsql as $f$
begin
  insert into quality.project_objects(id, canonical_key, display_name, synonyms, core_company_id) values
    ('o-a-m36', 'obj-a', 'Объект А', '{}', c), ('o-b-m36', 'obj-b', 'Объект Б', '{}', c);
end $f$;

do $$
declare
  c uuid := gen_random_uuid(); cx uuid := gen_random_uuid(); p uuid := gen_random_uuid(); px uuid := gen_random_uuid();
  uo uuid := gen_random_uuid(); ue1 uuid := gen_random_uuid(); ue2 uuid := gen_random_uuid(); ux uuid := gen_random_uuid();
  old_o uuid := gen_random_uuid(); prof_o uuid := gen_random_uuid(); r_eng uuid;
  url text := 'https://api.rbi-q.ru/storage/v1/object/public/';
  html text; r record; res text := ''; n bigint; j jsonb; s text;
begin
  insert into auth.users(id, email) values (uo, 'owner-036@test.invalid'), (ue1, 'e1-036@test.invalid'), (ue2, 'e2-036@test.invalid'),
    (ux, 'x-036@test.invalid'), (old_o, 'kondratiev36@rbi-quality.local');
  insert into core.companies(id, name, is_test) values (c, 'RBI 036', true), (cx, 'Чужая 036', true);
  insert into core.company_members(company_id, user_id) values (c, uo), (c, ue1), (c, ue2), (cx, ux);
  insert into core.projects(id, company_id, name) values (p, c, 'RBI — объекты'), (px, cx, 'Чужой объект');
  insert into core.company_modules(company_id, module, enabled)
    select x, m, true from unnest(array[c, cx]) x, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.role_assignments(company_id, user_id, role_id)
    select x.c, x.u, (select id from core.company_roles where company_id = x.c and template_code = 'company_admin')
      from (values (c, uo), (cx, ux)) x(c, u);
  insert into core.company_roles(company_id, name) values (c, 'Инженер СК 036') returning id into r_eng;
  insert into core.company_role_permissions(role_id, company_id, action)
    select r_eng, c, a from unnest(array['quality.view', 'quality.edit', 'construction.view', 'construction.edit']) a;
  perform pg_temp.objects(c);
  insert into core.role_assignments(company_id, user_id, role_id, quality_objects) values (c, ue1, r_eng, array['o-a-m36']), (c, ue2, r_eng, array['o-b-m36']);

  -- старые данные РБИ: отчёты объектов А и Б, удалённый отчёт А, отчёт с чужим кодом; снимки; файлы
  insert into public.rbi_engineer_profiles(id, inspector_id, inspector_name, engineer_name, project_code, role, auth_user_id)
    values (prof_o, 'rbi-test_Кондратьев', 'Кондратьев И. Н.', 'Кондратьев И. Н.', 'rbi-test', 'manager', old_o);
  insert into public.rbi_inspections(id, project_code, engineer_name, inspector_name, project_canonical_key, photos, created_by_auth_user_id)
    values ('i1', 'rbi-test', 'Кондратьев И. Н.', 'Кондратьев И. Н.', 'obj-a', '[]', old_o);
  insert into public.shared_reports(id, project_code, report_type, title, generated_at, file_url, created_by, project_canonical_key,
                                    project_display_name, created_by_auth_user_id, is_deleted, public_token)
    values ('rep1', 'rbi-test', 'pdf', 'Отчёт А', now(), url || 'reports/rbi-test/r1.pdf', 'Кондратьев И. Н.', 'obj-a', 'Объект А', old_o, false, 'tok1'),
           ('rep2', 'rbi-test', 'pdf', 'Отчёт Б', now(), url || 'reports/rbi-test/r2.pdf', 'Кондратьев И. Н.', 'obj-b', 'Объект Б', old_o, false, 'tok2'),
           ('rep3', 'rbi-test', 'pptx', 'Удалён А', now(), url || 'reports/rbi-test/r3.pptx', 'Кондратьев И. Н.', null, 'OBJ-A', old_o, true, null),
           ('rep9', 'N/A', 'pdf', 'Чужой код', now(), url || 'reports/N-A/r9.pdf', 'кто-то', 'obj-a', 'Объект А', null, false, 'tok9');
  html := '<html><body><h1>Отчёт</h1><img src="' || url || 'inspection-photos/rbi-test/inspections/i1/1_0/photo_a">'
       || '<a href="' || url || 'reports/rbi-test/r1.pdf">PDF</a><script>var d = {"project_code":"rbi-test","note":"rbi-test"};</script>'
       || repeat('<p>строка отчёта</p>', 2000) || '</body></html>';
  insert into public.shared_report_snapshots(id, report_id, html_content, project_code, project_canonical_key, created_by_auth_user_id, public_token)
    values ('snap_rep1', 'rep1', html, 'RBI', 'obj-a', old_o, 'tok1'),
           ('snap_rep2', 'rep2', '<html>Б</html>', 'RBI', 'obj-b', old_o, 'tok2'),
           ('snap_rep9', 'rep9', '<html>чужой</html>', 'RBI', 'obj-a', null, 'tok9'),
           ('snap_free', null, '<html>без отчёта</html>', 'rbi-test', 'obj-b', old_o, 'tokf');
  insert into storage.objects(bucket_id, name, metadata) values
    ('inspection-photos', 'rbi-test/inspections/i1/1_0/photo_a', '{"size": 100}'),
    ('reports', 'rbi-test/r1.pdf', '{"size": 400}'), ('reports', 'rbi-test/r2.pdf', '{"size": 500}'),
    ('reports', 'rbi-test/r3.pptx', '{"size": 600}'), ('reports', 'N-A/r9.pdf', '{"size": 700}'),
    ('library-etalons', 'e/1.jpg', '{"size": 10}'), ('library-practices', 'p/1.pdf', '{"size": 20}');

  res := res || pg_temp.t((select array_agg(x order by o) from quality.rbi_transfer_tables() with ordinality x(x, o)
                            where x in ('shared_reports', 'shared_report_snapshots')) = array['shared_reports', 'shared_report_snapshots'],
                          'отчёты в списке таблиц, отчёты раньше снимков');
  res := res || pg_temp.t('reports' = any (quality.rbi_transfer_buckets()), 'бакет reports в списке');

  create temp table fp_before as select * from quality.rbi_transfer_public_fingerprint();
  insert into quality.rbi_transfer_projects(core_company_id, old_code, core_project_id) values (c, 'rbi-test', p);
  insert into quality.rbi_transfer_people(core_company_id, old_profile_id, email, user_id) values (c, prof_o, 'owner-036@test.invalid', uo);

  -- 1) один объект
  perform * from quality.rbi_transfer_run(c, 'obj-a');
  res := res || pg_temp.t((select string_agg(id, ',' order by id) from quality.shared_reports where core_company_id = c) = 'rep1,rep3',
                          'объект: отчёты А (и удалённый — по названию объекта), без Б и чужого кода');
  res := res || pg_temp.t((select string_agg(id, ',' order by id) from quality.shared_report_snapshots where core_company_id = c) = 'snap_rep1',
                          'объект: снимок своего отчёта');
  res := res || pg_temp.t((select array_agg(old_bucket || ':' || old_name order by old_bucket, old_name) from quality.rbi_transfer_files where core_company_id = c)
    = array['inspection-photos:rbi-test/inspections/i1/1_0/photo_a', 'reports:rbi-test/r1.pdf', 'reports:rbi-test/r3.pptx'],
    'объект: в списке файлы отчётов и картинка из снимка');
  res := res || pg_temp.t(not exists (select 1 from quality.rbi_transfer_verify(c, 'obj-a') where not ok and t not like 'файлы%'), 'объект: сверка строк старое = новое');
  res := res || pg_temp.t((select not ok from quality.rbi_transfer_verify(c, 'obj-a') where t like 'файлы reports%'), 'объект: файлы не скопированы — бакет не ok');
  perform pg_temp.copy_files(c);
  for r in select * from quality.rbi_transfer_verify(c, 'obj-a') where not ok loop
    res := res || 'FAIL объект, сверка ' || r.t || ': ' || coalesce(r.old_eligible::text, '-') || ' ≠ ' || coalesce(r.new_rows::text, '-') || E'\n';
  end loop;
  select sum(inserted) into n from quality.rbi_transfer_run(c, 'obj-a');
  res := res || pg_temp.t(n = 0, 'повтор объекта: 0 новых (есть ' || n || ')');

  -- ссылки, код проекта, объект ядра, автор
  select to_jsonb(q) into j from quality.shared_reports q where core_company_id = c and id = 'rep1';
  res := res || pg_temp.t(j ->> 'file_url' = url || 'quality-reports/' || c || '/rbi-test/r1.pdf', 'file_url → бакет компании');
  res := res || pg_temp.t(j ->> 'project_code' = p::text and (j ->> 'core_project_id')::uuid = p, 'отчёт: код проекта → объект ядра');
  res := res || pg_temp.t((j ->> 'created_by_auth_user_id')::uuid = uo and (j ->> 'core_created_by')::uuid = uo, 'отчёт: автор = учётка владельца');
  res := res || pg_temp.t(j ->> 'public_token' = 'tok1' and j ->> 'project_canonical_key' = 'obj-a', 'отчёт: токен и объект сохранены');
  select html_content into s from quality.shared_report_snapshots where core_company_id = c and id = 'snap_rep1';
  res := res || pg_temp.t(s like '%' || url || 'quality-inspection-photos/' || c || '/rbi-test/inspections/i1/1_0/photo_a"%'
    and s like '%' || url || 'quality-reports/' || c || '/rbi-test/r1.pdf"%' and s not like '%/object/public/reports/%'
    and s not like '%/object/public/inspection-photos/%', 'HTML снимка: ссылки → бакеты компании');
  res := res || pg_temp.t(s like '%"project_code":"' || p || '","note":"rbi-test"%' and length(s) > 30000, 'HTML снимка: код проекта → объект, прочее и размер — как было');

  -- видимость по закреплённым объектам (033): инженер А видит отчёт и снимок А, инженер Б — нет; чужая компания — ничего
  perform pg_temp.as_user(uo, c);
  res := res || pg_temp.t(pg_temp.seen('shared_reports') = 'rep1,rep3' and pg_temp.seen('shared_report_snapshots') = 'snap_rep1', 'владелец видит отчёты объекта');
  perform pg_temp.as_user(ue1, c);
  res := res || pg_temp.t(pg_temp.seen('shared_reports') like 'rep1%' and pg_temp.seen('shared_report_snapshots') = 'snap_rep1',
                          'инженер объекта А видит отчёт и снимок (видит ' || pg_temp.seen('shared_reports') || ' / ' || pg_temp.seen('shared_report_snapshots') || ')');
  perform pg_temp.as_user(ue2, c);
  res := res || pg_temp.t(pg_temp.seen('shared_reports') = '' and pg_temp.seen('shared_report_snapshots') = '',
                          'инженер объекта Б не видит отчёт А (видит ' || pg_temp.seen('shared_reports') || ' / ' || pg_temp.seen('shared_report_snapshots') || ')');
  perform pg_temp.as_user(ux, cx);
  res := res || pg_temp.t(pg_temp.seen('shared_reports') = '' and pg_temp.seen('shared_report_snapshots') = '', 'чужая компания не видит');
  reset role;

  -- 2) очистка: 0 строк компании (снимки и отчёты тоже)
  perform * from quality.rbi_transfer_clear(c);
  res := res || pg_temp.t(not exists (select 1 from quality.shared_reports where core_company_id = c)
    and not exists (select 1 from quality.shared_report_snapshots where core_company_id = c), 'очистка: отчётов и снимков 0');

  -- 3) полный перенос — пачками (036a): все таблицы без снимков; затем снимки и список файлов
  perform pg_temp.objects(c);
  begin
    perform * from quality.rbi_transfer_run_part(c, array['shared_reports', 'нет_такой'], false);
    res := res || 'FAIL пачка с неизвестной таблицей — не отказ' || E'\n';
  exception when sqlstate 'P0001' then null;
  end;
  perform pg_temp.as_user(uo, c);
  begin
    perform * from quality.rbi_transfer_run_part(c, array['shared_reports'], false);
    res := res || 'FAIL клиенту доступен перенос пачками' || E'\n';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform * from quality.rbi_transfer_run_part(c, array(select x from quality.rbi_transfer_tables() x where x <> 'shared_report_snapshots'), false);
  res := res || pg_temp.t(not exists (select 1 from quality.shared_report_snapshots where core_company_id = c)
    and not exists (select 1 from quality.rbi_transfer_files where core_company_id = c and old_bucket = 'library-etalons'), 'пачка 1: без снимков и без списка файлов');
  perform * from quality.rbi_transfer_run_part(c, array['shared_report_snapshots'], true);
  res := res || pg_temp.t((select string_agg(id, ',' order by id) from quality.shared_reports where core_company_id = c) = 'rep1,rep2,rep3', 'полный: отчёты 3 (без чужого кода)');
  res := res || pg_temp.t((select string_agg(id, ',' order by id) from quality.shared_report_snapshots where core_company_id = c) = 'snap_free,snap_rep1,snap_rep2',
                          'полный: снимки 3 (без снимка отчёта с чужим кодом; без отчёта — по коду)');
  res := res || pg_temp.t((select old_all - old_eligible from quality.rbi_transfer_verify(c) where t = 'shared_report_snapshots') = 1, 'сверка показывает 1 непереносимый снимок');
  res := res || pg_temp.t((select not ok from quality.rbi_transfer_verify(c) where t like 'файлы reports%'), 'полный: файлы не докопированы — бакет не ok');
  perform pg_temp.copy_files(c);
  for r in select * from quality.rbi_transfer_verify(c) where not ok loop
    res := res || 'FAIL сверка ' || r.t || ': ' || coalesce(r.old_eligible::text, '-') || ' ≠ ' || coalesce(r.new_rows::text, '-') || E'\n';
  end loop;
  res := res || pg_temp.t((select count(*) from quality.rbi_transfer_verify(c) where t like 'файлы %(в бакете%') = 11, 'сверка: строка на каждый из 11 бакетов');
  res := res || pg_temp.t((select old_all = 4 and old_eligible = 4 and new_rows = 4 from quality.rbi_transfer_verify(c) where t like 'файлы reports%'), 'reports: 4 в бакете = в списке = скопировано');
  res := res || pg_temp.t((select ok from quality.rbi_transfer_verify(c) where t like 'файлы library-etalons%')
    and (select ok from quality.rbi_transfer_verify(c) where t like 'файлы library-practices%'), 'эталоны и практики: файлы по бакету ok');
  select sum(inserted) into n from quality.rbi_transfer_run(c);
  res := res || pg_temp.t(n = 0, 'повтор полного: 0 новых (есть ' || n || ')');
  perform pg_temp.as_user(ue2, c);
  res := res || pg_temp.t(pg_temp.seen('shared_reports') = 'rep2' and pg_temp.seen('shared_report_snapshots') like '%snap_rep2%',
                          'полный: инженер Б видит отчёт Б (видит ' || pg_temp.seen('shared_reports') || ')');
  reset role;

  -- сверка ловит: другой размер копии; удалённую копию
  update storage.objects set metadata = '{"size": 401}' where bucket_id = 'quality-reports' and name = c || '/rbi-test/r1.pdf';
  res := res || pg_temp.t((select not ok from quality.rbi_transfer_verify(c) where t like 'файлы reports%'), 'сверка ловит другой размер');
  delete from storage.objects where bucket_id = 'quality-reports' and name = c || '/rbi-test/r1.pdf';
  res := res || pg_temp.t((select not ok and new_rows = 3 from quality.rbi_transfer_verify(c) where t like 'файлы reports%'), 'сверка ловит отсутствующую копию');

  -- public и бакеты РБИ не изменились
  select count(*) into n from (select * from fp_before except select * from quality.rbi_transfer_public_fingerprint()) d;
  res := res || pg_temp.t(n = 0, 'public до = после (различий ' || n || ')');

  raise exception 'FAIL всего: % %', (length(res) - length(replace(res, 'FAIL', ''))) / 4, E'\n' || res using errcode = 'P0001';
end $$;
