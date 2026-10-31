-- P2-0078 (059), часть 1 из 2 — права чтения «до = после»: засев и снимок ДО миграции. Запуск — на схеме 057
-- (run-pglite.mjs --upto 057 --then 059_rls_fast.seed.pglite.sql --then 059_rls_fast_up.sql 059_rls_fast_compare.check.sql).
-- Люди — каждая роль и область: шаблоны компании, просмотр на компанию / проект / два проекта / секцию / контейнер, «своя фирма»
-- (с id фирмы, без него, с «…manage», на секции), «вся компания» на проекте, «только своё» (на компанию, проект, секцию, фирму,
-- контейнер), только Качество, только Стройконтроль, «…manage» на контейнере, истёкшее / отозванное / будущее назначение,
-- администратор платформы, он же посетитель демо, чужая компания, участник двух компаний, запрос без компании, компания без
-- модуля Качества. Записи — в КАЖДОЙ таблице quality.* с правилом чтения: все сочетания компании, проекта (нет, контейнер,
-- ЖК-1, ЖК-2, проект другой компании), объекта, автора, исполнителя и фирмы, какие есть в таблице (засев без триггеров —
-- сочетания задаются прямо). Снимок: человек × таблица → какие записи видит (SELECT под его учёткой и компанией).
-- Варианты каталога (признак «запись без места» у действий): как есть / у всех «…view» — нет / «своя» — правило 053 для всех.
create or replace function pg_temp.as_user(u uuid, co uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, false);
  perform set_config('request.headers', case when co is null then '' else json_build_object('x-company-id', co)::text end, false);
  if u is not null then execute 'set role authenticated'; end if;
end $f$;

create table public.t059_users(k text primary key, id uuid not null, co uuid);
create table public.t059_tables(t text primary key, key text not null, n int, err text);
create table public.t059(phase text, variant text, usr text, tbl text, ids text[], err text);
-- правила таблиц Качества до 059 — для сверки после отката (059_rls_fast_compare.check.sql)
create table public.t059_pol as select tablename::text t, policyname::text p, cmd::text, permissive::text, roles::text,
  coalesce(qual, '') qual, coalesce(with_check, '') wc from pg_policies where schemaname = 'quality';

create or replace function pg_temp.capture(p_phase text, p_variant text, p_part_only boolean) returns void language plpgsql as $f$
declare u record; t record; v text[]; e text;
begin
  for u in select * from public.t059_users w
            where not p_part_only or exists (select 1 from core.role_assignments a where a.user_id = w.id and a.location_id is not null)
            order by k loop
    for t in select * from public.t059_tables where err is null order by 1 loop
      v := null; e := null;
      begin
        perform pg_temp.as_user(u.id, u.co);
        execute format('select coalesce(array_agg(%s order by %s), ''{}'') from quality.%I', t.key, t.key, t.t) into v;
      exception when others then e := sqlerrm;
      end;
      reset role;
      insert into public.t059 values (p_phase, p_variant, u.k, t.t, v, e);
    end loop;
  end loop;
end $f$;

-- снимок по трём вариантам каталога (каталог возвращается как был); признак «запись без места» действует только на участника
-- части проекта — варианты 2 и 3 снимаются только у них
create or replace function pg_temp.capture_all(p_phase text) returns void language plpgsql as $f$
begin
  create temp table if not exists t059_catalog as select action, unplaced from core.permission_catalog;
  perform pg_temp.capture(p_phase, 'каталог как есть', false);
  update core.permission_catalog set unplaced = null where action like '%.view';
  perform pg_temp.capture(p_phase, 'просмотр: запись без места — только своя', true);
  update core.permission_catalog set unplaced = 'own' where area_scoped;
  perform pg_temp.capture(p_phase, 'все действия: запись без места — своя', true);
  update core.permission_catalog c set unplaced = x.unplaced from t059_catalog x where x.action = c.action;
end $f$;

do $$
declare
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  cont uuid := gen_random_uuid(); p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid();
  bcont uuid := gen_random_uuid(); bp uuid := gen_random_uuid();
  k1 uuid := gen_random_uuid(); s1 uuid := gen_random_uuid(); a1 uuid := gen_random_uuid(); d1 uuid := gen_random_uuid();
  k2 uuid := gen_random_uuid();
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid();
  v_view text[]; r record; u uuid; rid uuid; uo record;
  u_sec uuid; u_imp uuid; u_ctr uuid; u_own_ctr uuid; u_own_p1 uuid;
  t record; cols text[]; sel text; n int; ax text[];
begin
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 059', true), (cb, 'Бета 059', true);
  insert into core.company_modules(company_id, module, enabled)
    select ca, m, true from unnest(array['quality', 'construction', 'planfact']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_modules(company_id, module, enabled) values (cb, 'construction', true), (cb, 'quality', false)
    on conflict (company_id, module) do update set enabled = excluded.enabled;
  insert into core.projects(id, company_id, name, quality_container) values
    (cont, ca, 'Контейнер 059', true), (p1, ca, 'ЖК-1 059', false), (p2, ca, 'ЖК-2 059', false),
    (bcont, cb, 'Контейнер Б 059', true), (bp, cb, 'ЖК Б 059', false);
  set local session_replication_role = replica;
  insert into core.locations(id, company_id, project_id, parent_id, node_type, name, canonical_key, object_kind) values
    (k1, ca, p1, null, 'object', 'Корпус 1', 'корпус 1', 'building'), (s1, ca, p1, k1, 'section', 'Секция 1', 'секция 1', null),
    (a1, ca, p1, s1, 'apartment', 'Кв. 1', 'кв 1', null), (d1, ca, p1, s1, 'floor', 'Этаж (удалён)', 'этаж удалён', null),
    (k2, ca, p2, null, 'object', 'Корпус 1', 'корпус 1', 'building');
  update core.locations set deleted_at = now() where id = d1;
  set local session_replication_role = origin;
  insert into core.counterparties(id, company_id, name, inn, kinds) values
    (f1, ca, 'ООО Ромашка 059', '7700000591', array['contractor']), (f2, ca, 'ООО Лютик 059', '7700000592', array['contractor']);
  -- сопоставление «название фирмы в записи → фирма» (Стройконтроль 1, роль «своя фирма»)
  insert into quality.contractor_core_links(core_company_id, canonical_key, counterparty_id)
    values (ca, quality.contractor_key('ромашка-алиас 059'), f1);

  -- роли: просмотр всего (все «…view» Качества и Стройконтроля), с «своя фирма», с «вся компания», «только своё» (действия
  -- записи без просмотра), только Качество, только Стройконтроль, «…manage»
  v_view := array(select action from core.permission_catalog where action like '%.view' and (action like 'quality.%' or action like 'construction.%'));
  create temp table t059_roles(k text primary key, acts text[]) on commit drop;
  insert into t059_roles values
    ('просмотр', v_view),
    ('просмотр + своя фирма', v_view || array['quality.scope.contractor']),
    ('просмотр + своя фирма + manage', v_view || array['quality.scope.contractor', 'quality.manage', 'construction.manage']),
    ('просмотр + вся компания', v_view || array['quality.scope.company']),
    ('только своё', array(select action from core.permission_catalog where action like 'quality.%' and unplaced = 'own')),
    ('только своё + своя фирма', array(select action from core.permission_catalog where action like 'quality.%' and unplaced = 'own')
                                 || array['quality.scope.contractor']),
    ('только Качество', array['quality.view']),
    ('только Стройконтроль', array['construction.view']),
    ('manage', array['quality.view', 'quality.manage', 'quality.objects.manage', 'quality.sk.view']);
  create temp table t059_rid(k text, co uuid, id uuid) on commit drop;
  for r in select * from t059_roles loop
    insert into core.company_roles(company_id, name) values (ca, r.k || ' 059') returning id into rid;
    insert into core.company_role_permissions(role_id, company_id, action) select rid, ca, a from unnest(r.acts) a on conflict do nothing;
    insert into t059_rid values (r.k, ca, rid);
    insert into core.company_roles(company_id, name) values (cb, r.k || ' Б 059') returning id into rid;
    insert into core.company_role_permissions(role_id, company_id, action) select rid, cb, a from unnest(r.acts) a on conflict do nothing;
    insert into t059_rid values (r.k, cb, rid);
  end loop;
  insert into t059_rid select 'шаблон ' || template_code, company_id, id from core.company_roles
   where company_id in (ca, cb) and template_code is not null;

  -- люди: (ключ, компания запроса, назначения: роль, компания, проект, место, фирма, с, по, отозвано)
  create temp table t059_asg(k text, role text, co uuid, proj uuid, loc uuid, cp uuid, vf timestamptz, vt timestamptz, rv timestamptz) on commit drop;
  insert into t059_asg values
    ('01 руководитель', 'шаблон company_admin', ca, null, null, null, null, null, null),
    ('02 директор', 'шаблон management', ca, null, null, null, null, null, null),
    ('03 ПТО', 'шаблон pto', ca, null, null, null, null, null, null),
    ('04 подрядчик F1 (шаблон)', 'шаблон contractor_rep', ca, null, null, f1, null, null, null),
    ('05 просмотр компании', 'просмотр', ca, null, null, null, null, null, null),
    ('06 просмотр ЖК-1', 'просмотр', ca, p1, null, null, null, null, null),
    ('07 просмотр ЖК-1 и ЖК-2', 'просмотр', ca, p1, null, null, null, null, null),
    ('07 просмотр ЖК-1 и ЖК-2', 'просмотр', ca, p2, null, null, null, null, null),
    ('08 просмотр секция 1', 'просмотр', ca, p1, s1, null, null, null, null),
    ('09 просмотр без объектов', 'просмотр', ca, cont, null, null, null, null, null),
    ('10 фирма F1 на ЖК-1', 'просмотр + своя фирма', ca, p1, null, f1, null, null, null),
    ('11 фирма без id', 'просмотр + своя фирма', ca, null, null, null, null, null, null),
    ('12 фирма F1 + manage', 'просмотр + своя фирма + manage', ca, p1, null, f1, null, null, null),
    ('13 фирма F1 секция 1', 'просмотр + своя фирма', ca, p1, s1, f1, null, null, null),
    ('14 вся компания на ЖК-1', 'просмотр + вся компания', ca, p1, null, null, null, null, null),
    ('15 только своё', 'только своё', ca, null, null, null, null, null, null),
    ('16 только своё ЖК-1', 'только своё', ca, p1, null, null, null, null, null),
    ('17 только своё секция 1', 'только своё', ca, p1, s1, null, null, null, null),
    ('18 своё фирма F1', 'только своё + своя фирма', ca, p1, null, f1, null, null, null),
    ('19 своё без объектов', 'только своё', ca, cont, null, null, null, null, null),
    ('20 Качество ЖК-2', 'только Качество', ca, p2, null, null, null, null, null),
    ('21 Стройконтроль', 'только Стройконтроль', ca, null, null, null, null, null, null),
    ('22 manage без объектов', 'manage', ca, cont, null, null, null, null, null),
    ('23 истекло', 'просмотр', ca, null, null, null, null, now() - interval '1 day', null),
    ('24 отозвано', 'просмотр', ca, null, null, null, null, null, now() - interval '1 day'),
    ('25 с завтра', 'просмотр', ca, null, null, null, now() + interval '1 day', null, null),
    ('27 админ платформы — посетитель демо', 'просмотр', ca, p2, null, null, null, null, null),
    ('29 участник двух компаний', 'просмотр', cb, null, null, null, null, null, null),
    ('30 без компании в запросе', 'просмотр', ca, null, null, null, null, null, null),
    ('31 Б руководитель', 'шаблон company_admin', cb, null, null, null, null, null, null),
    ('32 Б просмотр (Качество выключено)', 'просмотр', cb, null, null, null, null, null, null),
    ('34 просмотр корпус 1', 'просмотр', ca, p1, k1, null, null, null, null),
    ('35 своя фирма без фирмы секция 1', 'просмотр + своя фирма', ca, p1, s1, null, null, null, null);
  create temp table t059_who(k text primary key, co uuid, members uuid[]) on commit drop;
  insert into t059_who select k, case when k like '30 %' then null when k like '3_ Б%' then cb else ca end,
         case when k like '29 %' then array[ca, cb] when k like '3_ Б%' then array[cb] else array[ca] end
    from (select distinct k from t059_asg) x;
  insert into t059_who values ('26 админ платформы', ca, array[ca]), ('28 чужая компания', ca, array[cb]),
    ('33 без назначений', ca, array[ca]);
  for uo in select * from t059_who loop
    u := gen_random_uuid();
    insert into auth.users(id, email) values (u, u || '@test.invalid');
    insert into core.company_members(company_id, user_id) select m, u from unnest(uo.members) m;
    insert into public.t059_users values (uo.k, u, uo.co);
  end loop;
  insert into core.role_assignments(company_id, user_id, role_id, project_id, location_id, counterparty_id, valid_from, valid_to, revoked_at)
  select a.co, w.id, rl.id, a.proj, a.loc, a.cp, coalesce(a.vf, now() - interval '1 hour'), a.vt, a.rv
    from t059_asg a join public.t059_users w on w.k = a.k join t059_rid rl on rl.k = a.role and rl.co = a.co;
  if (select count(*) from core.role_assignments a join public.t059_users w on w.id = a.user_id) <> (select count(*) from t059_asg) then
    raise exception 'засев 059: не все назначения (нет шаблона роли?)';
  end if;
  insert into core.platform_admins(user_id) select id from public.t059_users where k like '26 %' or k like '27 %';
  set local session_replication_role = replica;   -- посетитель демо: демо-роль не нужна для проверки
  insert into core.demo_visits(company_id, user_id, demo_role_id) select ca, id, gen_random_uuid() from public.t059_users where k like '27 %';
  set local session_replication_role = origin;

  select id into u_sec from public.t059_users where k = '17 только своё секция 1';
  select id into u_imp from public.t059_users where k = '15 только своё';
  select id into u_ctr from public.t059_users where k = '13 фирма F1 секция 1';
  select id into u_own_ctr from public.t059_users where k = '18 своё фирма F1';
  select id into u_own_p1 from public.t059_users where k = '16 только своё ЖК-1';

  -- записи: каждая таблица quality.* с правилом чтения, все сочетания осей, какие есть в таблице и влияют на правило; прочие
  -- обязательные поля — уникальным текстом / нулём / пустым. Без триггеров (оси — прямо, как их поставил бы сервер).
  -- Оси: компания × проект, объект, автор, исполнитель, фирма; место (Стройконтроль 2.0); название фирмы (Стройконтроль 1);
  -- почта инженера и владелец черновика (только у записи без автора); проверка (пункты и фото).
  create temp table ax_copr on commit drop as
    select * from (values (ca, null::uuid), (ca, cont), (ca, p1), (ca, p2), (cb, null), (cb, bcont), (cb, bp)) v(co, pr);
  create temp table ax_ob on commit drop as select * from (values (null::uuid), (cont), (p1), (p2)) v(ob);
  create temp table ax_au on commit drop as select * from (values (null::uuid), (u_sec), (u_imp), (u_ctr), (u_own_ctr), (u_own_p1)) v(au);
  create temp table ax_asg on commit drop as select * from (values (null::uuid), (u_imp), (u_own_p1)) v(asg);
  create temp table ax_cp on commit drop as select * from (values (null::uuid), (f1), (f2)) v(cp);
  create temp table ax_lo on commit drop as select * from (values (null::uuid), (k1), (s1), (a1), (d1), (k2)) v(lo);
  create temp table ax_ctr on commit drop as
    select * from (values (null::text), ('ООО Ромашка 059'), ('ромашка-алиас 059'), ('ООО «Лютик» 059'), ('неизвестный 059'), ('')) v(ctr);
  create temp table ax_en on commit drop as
    select * from (values (null::text), (u_imp || '@test.invalid'), (' ' || upper(u_sec::text) || '@test.invalid '),
                          ('chuzhoi-059@test.invalid'), ('не почта')) v(en);
  create temp table ax_ow on commit drop as select * from (values (null::uuid), (u_imp)) v(ow);
  create temp table ax_ins(ins text) on commit drop;
  set local session_replication_role = replica;
  for t in select x.t from (select distinct pp.tablename::text t from pg_policies pp where pp.schemaname = 'quality' and pp.cmd = 'SELECT') x
            order by x.t in ('rbi_inspection_items', 'rbi_inspection_photos'), x.t loop
    if t.t = 'rbi_inspection_items' and not exists (select 1 from ax_ins) then
      -- проверки для пунктов и фото: разные по видимости (выборка) и несуществующая
      insert into ax_ins select id from quality.rbi_inspections where core_company_id = ca order by md5(id) limit 24;
      insert into ax_ins select id from quality.rbi_inspections where core_company_id = cb order by md5(id) limit 3;
      insert into ax_ins values ('r59-нет-такой-проверки');
    end if;
    select array_agg(column_name::text order by ordinal_position) into cols from information_schema.columns
     where table_schema = 'quality' and table_name = t.t;
    ax := array_remove(array[
      case when cols && array['core_company_id', 'company_id'] then 'ax_copr' end,
      case when 'core_object_id' = any(cols) and t.t not like 'rbi_inspection\_%' then 'ax_ob' end,
      case when 'core_created_by' = any(cols) then 'ax_au' end,
      case when 'assigned_to_auth_user_id' = any(cols) then 'ax_asg' end,
      case when 'core_counterparty_id' = any(cols) then 'ax_cp' end,
      case when t.t in ('construction_acceptance_v2', 'construction_defects_v2') then 'ax_lo' end,
      case when t.t in ('construction_acceptance', 'construction_defects') then 'ax_ctr' end,
      case when t.t in ('rbi_inspections', 'rbi_tasks', 'rbi_draft_sessions', 'rbi_sync_queue') then 'ax_en' end,
      case when t.t = 'rbi_draft_sessions' then 'ax_ow' end,
      case when t.t like 'rbi_inspection\_%' then 'ax_ins' end], null);
    sel := 'select x.*, md5(row_to_json(x)::text) h from (select * from ' || array_to_string(ax, ' cross join ') || ') x where true'
      || case when 'ax_en' = any(ax) then ' and (x.en is null or x.au is null)' else '' end
      || case when 'ax_ow' = any(ax) then ' and (x.ow is null or x.au is null)' else '' end
      || case when t.t like 'rbi_inspection\_%' then ' and x.pr is null' else '' end
      -- обязательная ось (проект у sk_links) — без пустых значений
      || coalesce((select string_agg(' and x.pr is not null', '') from information_schema.columns
                    where table_schema = 'quality' and table_name = t.t and is_nullable = 'NO' and column_name in ('core_project_id', 'project_id')), '');
    begin
      execute format('insert into quality.%I(%s) select %s from (%s) x on conflict do nothing',
        t.t,
        (select string_agg(quote_ident(column_name), ', ' order by ordinal_position) from information_schema.columns
          where table_schema = 'quality' and table_name = t.t
            and (is_nullable = 'NO' and column_default is null
                 or column_name in ('core_company_id', 'company_id', 'core_project_id', 'project_id', 'core_object_id', 'core_created_by',
                                    'assigned_to_auth_user_id', 'core_counterparty_id', 'core_location_id', 'contractor', 'engineer_name',
                                    'owner_auth_user_id', 'inspection_id'))),
        (select string_agg(case
            when column_name in ('core_company_id', 'company_id') then 'x.co'
            when column_name in ('core_project_id', 'project_id') then case when 'ax_copr' = any(ax) then 'x.pr' else 'null' end
            when column_name = 'core_object_id' then case when 'ax_ob' = any(ax) then 'x.ob' else 'null' end
            when column_name = 'core_created_by' then 'x.au'
            when column_name = 'assigned_to_auth_user_id' then 'x.asg'
            when column_name = 'core_counterparty_id' then 'x.cp'
            when column_name = 'core_location_id' then case when 'ax_lo' = any(ax) then 'x.lo' else 'null' end
            when column_name = 'contractor' and 'ax_ctr' = any(ax) then 'x.ctr'
            when column_name = 'engineer_name' and 'ax_en' = any(ax) then case when is_nullable = 'NO' then 'coalesce(x.en, '''')' else 'x.en' end
            when column_name = 'owner_auth_user_id' then case when 'ax_ow' = any(ax) then 'x.ow' else 'null' end
            when column_name = 'inspection_id' and 'ax_ins' = any(ax) then 'x.ins'
            when data_type = 'uuid' then format('md5(x.h || %L)::uuid', column_name)
            when t.t = 'sk_links' and column_name = 'kind' then '''place'''
            when data_type in ('text', 'character varying') then format('''r59-'' || x.h || %L', column_name)
            when data_type in ('integer', 'bigint', 'smallint', 'numeric') then '0'
            when data_type = 'boolean' then 'false'
            when data_type = 'date' then 'current_date'
            when data_type like 'timestamp%' then 'now()'
            when data_type = 'jsonb' then '''{}''::jsonb'
            when data_type = 'json' then '''{}''::json'
            when data_type = 'ARRAY' then '''{}'''
            else 'null' end, ', ' order by ordinal_position) from information_schema.columns
          where table_schema = 'quality' and table_name = t.t
            and (is_nullable = 'NO' and column_default is null
                 or column_name in ('core_company_id', 'company_id', 'core_project_id', 'project_id', 'core_object_id', 'core_created_by',
                                    'assigned_to_auth_user_id', 'core_counterparty_id', 'core_location_id', 'contractor', 'engineer_name',
                                    'owner_auth_user_id', 'inspection_id'))),
        sel);
      get diagnostics n = row_count;
      insert into public.t059_tables values (t.t, case when 'id' = any(cols) then 'id::text' else 'ctid::text' end, n, null);
    exception when others then
      insert into public.t059_tables values (t.t, '-', 0, sqlerrm);
    end;
  end loop;
  set local session_replication_role = origin;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
end $$;

select pg_temp.capture_all('до');
select count(*) filter (where err is null) seeded, count(*) filter (where err is not null) not_seeded,
       string_agg(t || ': ' || left(err, 120), E'\n') filter (where err is not null) errors from public.t059_tables;
