-- P2-0018 этап 6: подрядчики Качества ↔ ядро — исправления 022 (ТД №119). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N». Запуск: после 022.
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ' ' || sqlerrm; end $f$;
create or replace function pg_temp.cnt(q text) returns int language plpgsql as $f$
declare n int; begin execute q into n; return n; exception when others then return -1; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;

do $$
declare
  ua uuid := gen_random_uuid(); uqc uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  k1 uuid; kd uuid; n int; s text; res text := ''; i int; j jsonb;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[ua, uqc]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 022', true);
  insert into core.company_members(company_id, user_id) values (ca, ua), (ca, uqc);
  insert into core.projects(id, company_id, name) values (pa, ca, 'Спутник'), (pb, ca, 'Второй');
  insert into core.company_modules(company_id, module, enabled)
    select ca, m, true from unnest(array['quality', 'construction']) m on conflict (company_id, module) do update set enabled = true;
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, ua,  (select id from core.company_roles where company_id = ca and template_code = 'company_admin'), null),
    (ca, uqc, (select id from core.company_roles where company_id = ca and template_code = 'qc_engineer'), null);

  -- 1. Журнал: черновик из Качества — с автором
  perform pg_temp.as_user(uqc, ca);
  s := pg_temp.err(format('insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id) values (%L, ''novyi_022'', ''Новый 022'', %L)', pa, ca));
  res := res || pg_temp.t(s = 'OK', 'инженер добавляет подрядчика в Качестве (' || s || ')');
  reset role;
  select id into kd from core.counterparties where company_id = ca and name = 'Новый 022';
  select new_data into j from core.audit_log where record_id = kd and action = 'INSERT' and actor = uqc;
  res := res || pg_temp.t(j is not null and j ->> 'by' = uqc::text and j #>> '{via,canonical_key}' = 'novyi_022' and j ->> 'source' = 'quality',
    'журнал: автор и откуда — ' || coalesce(j::text, 'нет записи с автором'));

  -- 2. Лимит 20 черновиков за сутки на пользователя (1 уже есть)
  perform pg_temp.as_user(uqc, ca);
  for i in 2..20 loop
    perform pg_temp.err(format('insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id) values (%L, %L, %L, %L)',
      pa, 'lim_022_' || i, 'Лимит 022 №' || i, ca));
  end loop;
  reset role;
  select count(*) into n from core.counterparties where company_id = ca and draft;
  res := res || pg_temp.t(n = 20, 'до лимита — 20 черновиков (' || n || ')');
  perform pg_temp.as_user(uqc, ca);
  s := pg_temp.err(format('insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id) values (%L, ''lim_022_21'', ''Лимит 022 №21'', %L)', pa, ca));
  res := res || pg_temp.t(s like '42501%За сутки%', '21-й черновик за сутки — отказ с понятным текстом (' || s || ')');
  reset role;
  delete from quality.contractor_directory where core_company_id = ca and project_code = pb::text and canonical_key = 'novyi_022';
  perform pg_temp.as_user(uqc, ca);
  s := pg_temp.err(format('insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id) values (%L, ''novyi_022'', ''Новый 022'', %L)', pb, ca));
  res := res || pg_temp.t(s = 'OK', 'уже известный подрядчик — без лимита (' || s || ')');
  perform pg_temp.as_user(ua, ca);
  s := pg_temp.err(format('insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id) values (%L, ''adm_022'', ''Админа 022'', %L)', pa, ca));
  res := res || pg_temp.t(s = 'OK', 'лимит — у каждого пользователя свой (' || s || ')');
  -- 025: администратор (право вести «Контрагентов») лимитом не ограничен
  reset role;
  if exists (select 1 from pg_proc where proname = 'on_directory_insert' and pronamespace = 'quality'::regnamespace
             and prosrc like '%025: лимит%') then
    for i in 1..20 loop
      perform set_config('request.jwt.claim.sub', ua::text, true);
      insert into core.audit_log(company_id, table_name, record_id, action, actor, new_data)
        values (ca, 'counterparties', gen_random_uuid(), 'INSERT', ua, '{"source": "quality"}');
    end loop;
    perform pg_temp.as_user(ua, ca);
    s := pg_temp.err(format('insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id) values (%L, ''adm2_022'', ''Админа-2 022'', %L)', pa, ca));
    res := res || pg_temp.t(s = 'OK', 'администратор после 20 за сутки — без лимита (' || s || ')');
  end if;

  -- 3. Правка в ядре не воскрешает удалённую в Качестве строку
  reset role;
  insert into core.counterparties(company_id, name, inn, kinds) values (ca, 'Ядро 022', '7700000222', array['contractor']) returning id into k1;
  select count(*) into n from quality.contractor_directory where core_company_id = ca and canonical_key = quality.contractor_key('Ядро 022') and not is_deleted;
  res := res || pg_temp.t(n = 2, 'подрядчик ядра — на обоих объектах (' || n || ')');
  update quality.contractor_directory set is_deleted = true where core_company_id = ca and project_code = pa::text and canonical_key = quality.contractor_key('Ядро 022');
  update core.counterparties set name = 'Ядро 022' , inn = '7700000223' where id = k1;
  select count(*) into n from quality.contractor_directory where core_company_id = ca and canonical_key = quality.contractor_key('Ядро 022') and not is_deleted;
  res := res || pg_temp.t(n = 1, 'правка в ядре не воскресила удалённую в Качестве строку (живых ' || n || ')');
  res := res || pg_temp.t((select inn from quality.contractor_directory where core_company_id = ca and project_code = pb::text and canonical_key = quality.contractor_key('Ядро 022')) = '7700000223',
    'правка в ядре дошла до живой строки (ИНН)');

  -- 4. Архив / снятие вида «подрядчик» — убрать; вернуть — снова видно
  update core.counterparties set archived_at = now() where id = k1;
  select count(*) into n from quality.contractor_directory where core_company_id = ca and canonical_key = quality.contractor_key('Ядро 022') and not is_deleted;
  res := res || pg_temp.t(n = 0, 'архив контрагента — нет в справочнике Качества (' || n || ')');
  update core.counterparties set archived_at = null where id = k1;
  select count(*) into n from quality.contractor_directory where core_company_id = ca and canonical_key = quality.contractor_key('Ядро 022') and not is_deleted;
  res := res || pg_temp.t(n = 2, 'из архива — снова в справочнике (' || n || ')');
  update core.counterparties set kinds = array['supplier'] where id = k1;
  select count(*) into n from quality.contractor_directory where core_company_id = ca and canonical_key = quality.contractor_key('Ядро 022') and not is_deleted;
  res := res || pg_temp.t(n = 0, 'снят вид «подрядчик» — нет в справочнике (' || n || ')');

  raise exception 'ОТЧЁТ (откат):%FAIL всего: %', E'\n' || res, (select count(*) from regexp_matches(res, 'FAIL ', 'g')) using errcode = 'P0001';
end $$;
