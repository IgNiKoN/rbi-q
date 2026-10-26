-- P2-0016 этап 7: подрядчики Качества = контрагенты ядра (018e). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
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
  ua uuid := gen_random_uuid(); uqc uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  pc uuid := gen_random_uuid(); k1 uuid; ks uuid; kd uuid; n int; s text; res text := ''; j record;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[ua, uqc, ub]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 018e', true), (cb, 'Бета 018e', true);
  insert into core.company_members(company_id, user_id) values (ca, ua), (ca, uqc), (cb, ub);
  insert into core.projects(id, company_id, name) values (pa, ca, 'Спутник'), (pb, ca, 'Второй');
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, ua,  (select id from core.company_roles where company_id = ca and template_code = 'company_admin'), null),
    (ca, uqc, (select id from core.company_roles where company_id = ca and template_code = 'qc_engineer'), null),
    (cb, ub,  (select id from core.company_roles where company_id = cb and template_code = 'company_admin'), null);

  -- ключ как в Качестве (makeCanonicalKey в JS)
  res := res || pg_temp.t(quality.contractor_key('ООО «Ромашка-Строй»') = 'ооо_ромашка_строй', 'ключ: ООО «Ромашка-Строй» → ' || quality.contractor_key('ООО «Ромашка-Строй»'));
  res := res || pg_temp.t(quality.contractor_key('Ёлка, ИП') = 'елка_ип', 'ключ: Ёлка, ИП');
  res := res || pg_temp.t(quality.contractor_key('  ') = 'unknown_contractor', 'ключ: пусто');

  -- 1. Ядро → Качество
  perform pg_temp.as_user(ua, ca);
  k1 := public.pf_counterparties_save(ca, null, 'ООО Монолит', '7701234567', null, array['contractor'], null);
  ks := public.pf_counterparties_save(ca, null, 'ООО Поставка', '7702000000', null, array['supplier'], null);
  reset role;
  select count(*) into n from quality.contractor_directory where core_company_id = ca and canonical_key = 'ооо_монолит' and inn = '7701234567';
  res := res || pg_temp.t(n = 2, 'подрядчик из «Контрагентов» — в Качестве на обоих объектах (' || n || ')');
  select count(*) into n from quality.contractor_directory where core_company_id = ca and canonical_key = 'ооо_поставка';
  res := res || pg_temp.t(n = 0, 'поставщик в подрядчики Качества не попадает (' || n || ')');
  perform pg_temp.as_user(uqc, ca);
  n := pg_temp.cnt(format('select count(*) from quality.contractor_directory where project_code = %L', pa));
  res := res || pg_temp.t(n = 1, 'технадзор видит подрядчика ядра в Качестве (' || n || ')');
  perform pg_temp.as_user(ub, cb);
  n := pg_temp.cnt('select count(*) from quality.contractor_directory');
  res := res || pg_temp.t(n = 0, 'Бета не видит подрядчиков Альфы (' || n || ')');

  -- 2. Качество → ядро: новый подрядчик — черновик без ИНН, один на компанию
  perform pg_temp.as_user(uqc, ca);
  s := pg_temp.err(format('insert into quality.contractor_directory(project_code, canonical_key, display_name) values (%L, %L, %L)',
                          pa, 'ооо_новострой', 'ООО Новострой'));
  res := res || pg_temp.t(s = 'OK', 'технадзор добавляет подрядчика в Качестве (' || s || ')');
  s := pg_temp.err(format('insert into quality.contractor_directory(project_code, canonical_key, display_name) values (%L, %L, %L) on conflict (project_code, canonical_key) do nothing',
                          pb, 'ооо_новострой', 'ООО Новострой'));
  reset role;
  select count(*), max(id::text)::uuid into n, kd from core.counterparties where company_id = ca and lower(name) = 'ооо новострой';
  res := res || pg_temp.t(n = 1, 'в «Контрагентах» — один контрагент (' || n || ')');
  select * into j from core.counterparties where id = kd;
  res := res || pg_temp.t(j.draft and j.inn is null and j.kinds = array['contractor'], 'это черновик без ИНН вида «подрядчик»');
  select count(*) into n from quality.contractor_directory where core_company_id = ca and canonical_key = 'ооо_новострой';
  res := res || pg_temp.t(n = 2, 'и он в Качестве на обоих объектах, без дублей (' || n || ')');
  select count(*) into n from core.audit_log where record_id = kd and action = 'INSERT' and new_data ->> 'source' = 'quality';
  res := res || pg_temp.t(n = 1, 'появление черновика — в журнале компании (' || n || ')');

  -- 3. Качество с ИНН существующего контрагента — не дубль: контрагент получает вид «подрядчик»
  perform pg_temp.as_user(uqc, ca);
  s := pg_temp.err(format('insert into quality.contractor_directory(project_code, canonical_key, display_name, inn) values (%L, %L, %L, %L)',
                          pa, 'поставка_плюс', 'Поставка плюс', '7702000000'));
  reset role;
  select count(*) into n from core.counterparties where company_id = ca and inn = '7702000000';
  res := res || pg_temp.t(n = 1, 'ИНН совпал — нового контрагента нет (' || n || ')');
  res := res || pg_temp.t((select 'contractor' = any(kinds) from core.counterparties where id = ks), 'поставщик стал и подрядчиком');

  -- 4. Администратор дозаполняет ИНН черновику — уже не черновик; список показывает признак
  perform pg_temp.as_user(ua, ca);
  select count(*) into n from public.pf_counterparties_list(ca) l where l.id = kd and l.draft;
  res := res || pg_temp.t(n = 1, 'список «Контрагенты»: черновик помечен (' || n || ')');
  perform public.pf_counterparties_save(ca, kd, 'ООО Новострой', '7709999999', null, array['contractor'], null);
  select count(*) into n from public.pf_counterparties_list(ca) l where l.id = kd and not l.draft and l.inn = '7709999999';
  res := res || pg_temp.t(n = 1, 'ИНН указан — не черновик (' || n || ')');
  reset role;
  select count(*) into n from quality.contractor_directory where core_company_id = ca and canonical_key = 'ооо_новострой' and inn = '7709999999';
  res := res || pg_temp.t(n = 2, 'ИНН дошёл до Качества (' || n || ')');
  s := pg_temp.err(format('insert into core.counterparties(company_id, name, kinds) values (%L, ''Без ИНН'', array[''contractor''])', ca));
  res := res || pg_temp.t(s <> 'OK', 'без ИНН и не черновик — нельзя (' || left(s, 5) || ')');

  -- 5. Новый объект — подрядчики компании на нём
  insert into core.projects(id, company_id, name) values (pc, ca, 'Третий');
  select count(*) into n from quality.contractor_directory where project_code = pc::text;
  res := res || pg_temp.t(n = 3, 'новый объект: 3 подрядчика компании в Качестве (' || n || ': '
    || (select string_agg(canonical_key, ', ') from quality.contractor_directory where project_code = pc::text) || ')');

  -- 6. Связи и функции — не клиенту
  perform pg_temp.as_user(ua, ca);
  n := pg_temp.cnt('select count(*) from quality.contractor_core_links');
  res := res || pg_temp.t(n = -1, 'таблица связей закрыта для клиента (' || n || ')');
  s := pg_temp.err('select quality.contractor_key(''x'')');
  res := res || pg_temp.t(s <> 'OK', 'служебные функции закрыты для клиента');
  reset role;

  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res, 'FAIL', ''))) / 4;
end $$;
