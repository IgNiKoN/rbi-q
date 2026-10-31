-- P2-0078 (059): pf_my_permissions_all(объекты) = pf_my_permissions(объект) по каждому — у каждой роли и области: шаблоны компании,
-- назначение на компанию / на объект / на два объекта / на место (действия с областью и без), истёкшее, отозванное, с завтра,
-- администратор платформы, он же посетитель демо (в своей и в чужой компании запроса), участник без назначений, сотрудник другой
-- компании, компания без модуля План/Факта, без входа. Время — 20 объектов одним вызовом против 20 вызовов.
-- Запуск: node tests/server/run-pglite.mjs 059_pf_permissions.sql (PGlite, все миграции). Отчёт — ERROR P0001 «FAIL всего: N».
create or replace function pg_temp.as_user(u uuid, co uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, false);
  perform set_config('request.headers', case when co is null then '' else json_build_object('x-company-id', co)::text end, false);
  if u is not null then execute 'set role authenticated'; end if;
end $f$;

do $$
declare
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); p uuid[]; pb uuid[]; loc uuid := gen_random_uuid();
  r_area uuid; r_mix uuid; rid uuid; u uuid; w record; x record; v_all text[]; v_one text[]; bad int := 0; checks int := 0; nonempty int := 0; msg text := '';
  t0 timestamptz; ms_all numeric := 0; ms_one numeric := 0;
begin
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 059п', true), (cb, 'Бета 059п', true);
  insert into core.company_modules(company_id, module, enabled) select ca, m, true from unnest(array['planfact', 'quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_modules(company_id, module, enabled) values (cb, 'planfact', false), (cb, 'quality', true)
    on conflict (company_id, module) do update set enabled = excluded.enabled;
  p := array(select gen_random_uuid() from generate_series(1, 20));
  pb := array(select gen_random_uuid() from generate_series(1, 3));
  insert into core.projects(id, company_id, name) select q, ca, 'ЖК ' || i from unnest(p) with ordinality t(q, i);
  insert into core.projects(id, company_id, name) select q, cb, 'ЖК Б ' || i from unnest(pb) with ordinality t(q, i);
  set local session_replication_role = replica;
  insert into core.locations(id, company_id, project_id, node_type, name, canonical_key, object_kind) values (loc, ca, p[1], 'object', 'Корпус', 'корпус', 'building');
  set local session_replication_role = origin;
  -- роли: действия с областью и без (План/Факт и ядро), смешанная
  insert into core.company_roles(company_id, name) values (ca, 'Область 059п') returning id into r_area;
  insert into core.company_role_permissions(role_id, company_id, action)
    select r_area, ca, action from core.permission_catalog where action like 'planfact.%' or action like 'core.%';
  insert into core.company_roles(company_id, name) values (ca, 'Смешанная 059п') returning id into r_mix;
  insert into core.company_role_permissions(role_id, company_id, action)
    select r_mix, ca, action from core.permission_catalog where action like 'planfact.fact.%' or action = 'planfact.vor.manage';
  create temp table t59p(k text primary key, id uuid, co uuid) on commit drop;
  for w in select * from (values
      ('руководитель', 'company_admin', null::uuid, null::int, null::interval, false, null::interval, ca),
      ('ПТО', 'pto', null, null, null, false, null, ca),
      ('прораб на объект 1', 'foreman', null, 1, null, false, null, ca),
      ('область на компанию', null, r_area, null, null, false, null, ca),
      ('область на объект 2', null, r_area, 2, null, false, null, ca),
      ('область на месте объекта 1', null, r_area, 1, null, false, null, ca),
      ('смешанная на объекты 3 и 4', null, r_mix, 3, null, false, null, ca),
      ('истекло', null, r_area, null, interval '-1 day', false, null, ca),
      ('отозвано', null, r_area, null, null, true, null, ca),
      ('с завтра', null, r_area, null, null, false, interval '1 day', ca)) v(k, tpl, role, pi, vt, rv, vf, co) loop
    u := gen_random_uuid();
    insert into auth.users(id, email) values (u, u || '@test.invalid');
    insert into core.company_members(company_id, user_id) values (ca, u);
    select coalesce(w.role, (select id from core.company_roles where company_id = ca and template_code = w.tpl)) into rid;
    if rid is null then raise exception 'нет роли %', w.k; end if;
    insert into core.role_assignments(company_id, user_id, role_id, project_id, location_id, valid_from, valid_to, revoked_at)
      values (ca, u, rid, case when w.pi is null then null else p[w.pi] end, case when w.k like '%месте%' then loc end,
              now() - interval '1 hour' + coalesce(w.vf, interval '0'), now() + w.vt, case when w.rv then now() end);
    if w.k like 'смешанная%' then
      insert into core.role_assignments(company_id, user_id, role_id, project_id, valid_from) values (ca, u, rid, p[4], now() - interval '1 hour');
    end if;
    insert into t59p values (w.k, u, w.co);
  end loop;
  -- без назначений, админ платформы, админ — посетитель демо компании запроса, чужая компания
  for w in select * from (values ('без назначений', ca, false, false), ('админ платформы', ca, true, false),
                                 ('админ — посетитель демо (своя компания)', ca, true, true), ('админ — посетитель демо (запрос в Б)', cb, true, true),
                                 ('сотрудник Б', cb, false, false)) v(k, co, adm, demo) loop
    u := gen_random_uuid();
    insert into auth.users(id, email) values (u, u || '@test.invalid');
    insert into core.company_members(company_id, user_id) values (case when w.k = 'сотрудник Б' then cb else ca end, u);
    if w.adm then insert into core.platform_admins(user_id) values (u); end if;
    if w.demo then
      set local session_replication_role = replica;
      insert into core.demo_visits(company_id, user_id, demo_role_id) values (ca, u, gen_random_uuid());
      set local session_replication_role = origin;
    end if;
    if w.k = 'сотрудник Б' then
      insert into core.role_assignments(company_id, user_id, role_id, valid_from)
        select cb, u, id, now() - interval '1 hour' from core.company_roles where company_id = cb and template_code = 'company_admin';
    end if;
    insert into t59p values (w.k, u, w.co);
  end loop;
  insert into t59p values ('без входа', null, ca);

  for w in select * from t59p order by k loop
    perform pg_temp.as_user(w.id, w.co);
    t0 := clock_timestamp();
    create temp table if not exists t59p_all(project_id uuid, actions text[]);
    truncate t59p_all;
    insert into t59p_all select * from public.pf_my_permissions_all(p || pb);
    ms_all := ms_all + extract(epoch from clock_timestamp() - t0) * 1000;
    for x in select unnest(p || pb) pid loop
      t0 := clock_timestamp();
      v_one := public.pf_my_permissions(x.pid);
      ms_one := ms_one + extract(epoch from clock_timestamp() - t0) * 1000;
      v_all := coalesce((select actions from t59p_all where project_id = x.pid), '{}');
      checks := checks + 1;
      if cardinality(v_one) > 0 then nonempty := nonempty + 1; end if;
      if v_one is distinct from v_all then
        bad := bad + 1;
        msg := msg || format(E'FAIL %s · объект %s: по одному %s, пакетом %s\n', w.k, array_position(p || pb, x.pid), cardinality(v_one), cardinality(v_all));
      end if;
    end loop;
    reset role;
  end loop;
  if (select count(*) from t59p where k <> 'без входа') < 15 or nonempty < 100 or nonempty = checks then
    bad := bad + 1; msg := msg || E'FAIL засев: мало разных ответов\n';
  end if;
  raise exception E'ОТЧЁТ 059 pf_my_permissions_all: людей %, проверок %, совпало %, непустых %; время: пакетом % мс, по одному % мс\n%FAIL всего: %',
    (select count(*) from t59p), checks, checks - bad, nonempty, round(ms_all), round(ms_one), left(msg, 3000), bad using errcode = 'P0001';
end $$;
