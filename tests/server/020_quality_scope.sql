-- P2-0018 этап 1: видимость по ролям (020) — матрица «роль × запись × действие». Всё откатывается; отчёт — ERROR P0001
-- с «FAIL всего: N». Запуск: после 020_quality_scope_up.sql. Пользователи и компании — тестовые (@test.invalid, is_test).
-- Записи Альфы: проверки i1 (объект 1, инженер 1, подрядчик К1), i2 (объект 1, инженер 2, К2), i3 (объект 2, инженер 1, К1);
-- задача t1 (объект 1, автор инженер 2, назначена инженеру 1, К1); пункты it1 (к i1), it2 (к i2);
-- замечания d1 (объект 1, К1), d2 (объект 1, К2), d3 (объект 2, К1); СК s1 (объект 1, ключ-синоним К1), s2 (объект 1, К2).
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate; end $f$;
create or replace function pg_temp.rows(q text) returns int language plpgsql as $f$
declare n int; begin execute q; get diagnostics n = row_count; return n; exception when others then return -1; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
-- Метки видимых строк таблицы (id = «метка-…»), через запятую по алфавиту; ошибка — «ERR:код».
create or replace function pg_temp.vis(tbl text) returns text language plpgsql as $f$
declare s text;
begin
  execute format('select coalesce(string_agg(split_part(id, ''-'', 1), '','' order by id), '''') from quality.%I where id like ''m20%%''', tbl) into s;
  return s;
exception when others then return 'ERR:' || sqlstate; end $f$;
-- Минимальная строка: обязательные колонки + project_code + id = метка; затем — значения из p_set (как служебная запись).
create or replace function pg_temp.mk(tbl text, pc text, mark text, author uuid, p_set text) returns void language plpgsql as $f$
declare c record; cols text := 'id'; vals text := quote_literal(mark || '-id');
begin
  for c in select a.attname, format_type(a.atttypid, a.atttypmod) typ
             from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = ('quality.' || tbl)::regclass and a.attnum > 0 and not a.attisdropped
              and a.attname not in ('id', 'core_company_id', 'core_project_id', 'core_created_by')
              and (a.attname = 'project_code' or (a.attnotnull and d.adbin is null)) order by a.attnum loop
    cols := cols || ', ' || quote_ident(c.attname);
    vals := vals || ', ' || case
      when c.attname = 'project_code' then quote_nullable(pc)
      when c.typ = 'text' then quote_literal(mark || '-' || c.attname)
      when c.typ = 'uuid' then 'gen_random_uuid()'
      when c.typ = 'boolean' then 'false'
      when c.typ in ('jsonb', 'json') then '''{}'''
      when c.typ in ('integer', 'bigint', 'numeric', 'smallint', 'double precision', 'real') then '1'
      when c.typ like 'timestamp%' then 'now()'
      when c.typ = 'date' then 'current_date'
      when c.typ like '%[]' then '''{}'''
      else 'null' end;
  end loop;
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(author::text, ''), true);   -- автор = кто создаёт (ставит сервер)
  execute format('insert into quality.%I (%s) values (%s)', tbl, cols, vals);
  if p_set is not null then execute format('update quality.%I set %s where id = %L', tbl, p_set, mark || '-id'); end if;
end $f$;

do $$
declare
  ua uuid := gen_random_uuid(); umg uuid := gen_random_uuid(); upm uuid := gen_random_uuid(); ufor uuid := gen_random_uuid();
  upto uuid := gen_random_uuid(); ucus uuid := gen_random_uuid(); uq1 uuid := gen_random_uuid(); uq2 uuid := gen_random_uuid();
  uc1 uuid := gen_random_uuid(); uc2 uuid := gen_random_uuid(); uc0 uuid := gen_random_uuid(); ueco uuid := gen_random_uuid();
  ucst uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid(); kcl uuid := gen_random_uuid(); kb uuid := gen_random_uuid();
  rcst uuid; v_id uuid; j jsonb; s text; n int; res text := '';
  r record;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid'
    from unnest(array[ua, umg, upm, ufor, upto, ucus, uq1, uq2, uc1, uc2, uc0, ueco, ucst, ub]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 020', true), (cb, 'Бета 020', true);
  insert into core.company_members(company_id, user_id)
    select ca, u from unnest(array[ua, umg, upm, ufor, upto, ucus, uq1, uq2, uc1, uc2, uc0, ueco, ucst]) u union all select cb, ub;
  insert into core.projects(id, company_id, name) values (p1, ca, 'Объект 1'), (p2, ca, 'Объект 2'), (pb, cb, 'Объект Б');
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.counterparties(id, company_id, name, inn, kinds) values
    (k1, ca, 'ООО «Альфа-Строй»', '7700000011', array['contractor']), (k2, ca, 'Бета Монтаж', '7700000022', array['contractor']),
    (kcl, ca, 'Заказчик-Девелопер', '7700000033', array['customer']), (kb, cb, 'Чужой подрядчик', '7700000044', array['contractor']);
  insert into quality.contractor_core_links(core_company_id, canonical_key, counterparty_id) values (ca, 'alfa_sinonim', k1);
  -- пользовательская роль конструктора: просмотр + правка Качества
  insert into core.company_roles(company_id, name) values (ca, 'Своя роль 020') returning id into rcst;
  insert into core.company_role_permissions(role_id, company_id, action) values (rcst, ca, 'quality.view'), (rcst, ca, 'quality.edit');
  insert into core.role_assignments(company_id, user_id, role_id, project_id, counterparty_id)
  select ca, x.u, (select id from core.company_roles where company_id = ca and template_code = x.tpl), x.p, x.k
  from (values (ua, 'company_admin', null::uuid, null::uuid), (umg, 'management', p1, null), (upm, 'project_manager', p1, null),
               (ufor, 'foreman', p1, null), (upto, 'pto', p1, null), (ucus, 'customer', p1, null),
               (uq1, 'qc_engineer', p1, null), (uq2, 'qc_engineer', p1, null),
               (uc1, 'contractor_rep', null, k1), (uc2, 'contractor_rep', p1, k2), (uc0, 'contractor_rep', p1, null),
               (ueco, 'economist', null, null)) x(u, tpl, p, k);
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values (ca, ucst, rcst, p1),
    (cb, ub, (select id from core.company_roles where company_id = cb and template_code = 'company_admin'), null);

  -- записи
  perform pg_temp.mk('rbi_inspections', p1::text, 'm20i1', uq1, 'contractor_name = ''ООО «Альфа-Строй»''');
  perform pg_temp.mk('rbi_inspections', p1::text, 'm20i2', uq2, 'contractor_name = ''Бета Монтаж''');
  perform pg_temp.mk('rbi_inspections', p2::text, 'm20i3', uq1, 'contractor_canonical_key = ''ооо_альфа_строй''');
  perform pg_temp.mk('rbi_inspections', pb::text, 'm20ib', ub, 'contractor_name = ''Чужой подрядчик''');
  perform pg_temp.mk('rbi_tasks', p1::text, 'm20t1', uq2, format('contractor_name = %L, assigned_to_auth_user_id = %L', 'ООО «Альфа-Строй»', uq1));
  perform pg_temp.mk('rbi_inspection_items', p1::text, 'm20it1', uq1, 'inspection_id = ''m20i1-id''');
  perform pg_temp.mk('rbi_inspection_items', p1::text, 'm20it2', uq2, 'inspection_id = ''m20i2-id''');
  perform pg_temp.mk('construction_defects', p1::text, 'm20d1', uq1, 'contractor = ''ООО «Альфа-Строй»''');
  perform pg_temp.mk('construction_defects', p1::text, 'm20d2', uq1, 'contractor = ''Бета Монтаж''');
  perform pg_temp.mk('construction_defects', p2::text, 'm20d3', uq1, 'contractor = ''ООО «Альфа-Строй»''');
  perform pg_temp.mk('sk_records', p1::text, 'm20s1', uq1, 'contractor_canonical_key = ''alfa_sinonim''');
  perform pg_temp.mk('sk_records', p1::text, 'm20s2', uq1, 'contractor_name = ''Бета Монтаж''');

  reset role;
  select count(*) into n from quality.rbi_inspections where id like 'm20%' and core_created_by is null;
  res := res || pg_temp.t(n = 0, 'автор записан у всех проверок (' || n || ' без автора)');

  -- 1. Видимость: роль → проверки | задачи | пункты | замечания | СК
  for r in select * from (values
    ('админ компании',              ua,   ca, 'm20i1,m20i2,m20i3', 'm20t1', 'm20it1,m20it2', 'm20d1,m20d2,m20d3', 'm20s1,m20s2'),
    ('руководство (назн. объект 1)', umg,  ca, 'm20i1,m20i2,m20i3', 'm20t1', 'm20it1,m20it2', 'm20d1,m20d2,m20d3', 'm20s1,m20s2'),
    ('РП объекта 1',                upm,  ca, 'm20i1,m20i2',       'm20t1', 'm20it1,m20it2', 'm20d1,m20d2',       'm20s1,m20s2'),
    ('прораб объекта 1',            ufor, ca, 'm20i1,m20i2',       'm20t1', 'm20it1,m20it2', 'm20d1,m20d2',       'm20s1,m20s2'),
    ('ПТО объекта 1',               upto, ca, 'm20i1,m20i2',       'm20t1', 'm20it1,m20it2', 'm20d1,m20d2',       'm20s1,m20s2'),
    ('заказчик объекта 1',          ucus, ca, 'm20i1,m20i2',       'm20t1', 'm20it1,m20it2', 'm20d1,m20d2',       'm20s1,m20s2'),
    ('инженер 1 (свои)',            uq1,  ca, 'm20i1',             'm20t1', 'm20it1',        'm20d1,m20d2',       'm20s1,m20s2'),
    ('инженер 2 (свои)',            uq2,  ca, 'm20i2',             'm20t1', 'm20it2',        'm20d1,m20d2',       'm20s1,m20s2'),
    ('подрядчик К1 (вся компания)', uc1,  ca, 'm20i1,m20i3',       'm20t1', 'm20it1',        'm20d1,m20d3',       'm20s1'),
    ('подрядчик К2 (объект 1)',     uc2,  ca, 'm20i2',             '',      'm20it2',        'm20d2',             'm20s2'),
    ('подрядчик без фирмы',         uc0,  ca, '',                  '',      '',              '',                  ''),
    ('экономист (без Качества)',    ueco, ca, '',                  '',      '',              '',                  ''),
    ('своя роль: просмотр+правка',  ucst, ca, '',                  '',      '',              '',                  'm20s1,m20s2'),
    ('админ Беты с заголовком Альфы', ub, ca, '',                  '',      '',              '',                  ''),
    ('подрядчик К1 с заголовком Беты', uc1, cb, '',                '',      '',              '',                  ''),
    ('админ Беты в Бете',           ub,   cb, 'm20ib',             '',      '',              '',                  '')
  ) v(l, u, c, ei, et, eit, ed, es) loop
    perform pg_temp.as_user(r.u, r.c);
    s := pg_temp.vis('rbi_inspections');      res := res || pg_temp.t(s = r.ei,  r.l || ': проверки «' || s || '», ждали «' || r.ei || '»');
    s := pg_temp.vis('rbi_tasks');            res := res || pg_temp.t(s = r.et,  r.l || ': задачи «' || s || '», ждали «' || r.et || '»');
    s := pg_temp.vis('rbi_inspection_items'); res := res || pg_temp.t(s = r.eit, r.l || ': пункты «' || s || '», ждали «' || r.eit || '»');
    s := pg_temp.vis('construction_defects'); res := res || pg_temp.t(s = r.ed,  r.l || ': замечания «' || s || '», ждали «' || r.ed || '»');
    s := pg_temp.vis('sk_records');           res := res || pg_temp.t(s = r.es,  r.l || ': СК «' || s || '», ждали «' || r.es || '»');
  end loop;
  reset role;
  perform pg_temp.as_user(null, ca);
  s := pg_temp.vis('rbi_inspections'); res := res || pg_temp.t(s like 'ERR:%' or s = '', 'anon: проверки не видны (' || s || ')');

  -- 2. Запись
  perform pg_temp.as_user(uq1, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.rbi_inspections set location = ''x'' where id = ''m20i1-id''') = 1, 'инженер правит свою проверку');
  res := res || pg_temp.t(pg_temp.rows('update quality.rbi_inspections set location = ''x'' where id = ''m20i2-id''') = 0, 'инженер не правит чужую проверку');
  res := res || pg_temp.t(pg_temp.rows('delete from quality.rbi_inspections where id = ''m20i2-id''') = 0, 'инженер не удаляет чужую проверку');
  perform pg_temp.rows(format('update quality.rbi_inspections set core_created_by = %L where id = ''m20i1-id''', uq2));
  reset role;
  res := res || pg_temp.t((select core_created_by from quality.rbi_inspections where id = 'm20i1-id') = uq1, 'автора проверки поменять нельзя');
  perform pg_temp.as_user(uq1, ca);
  s := pg_temp.err(format('insert into quality.rbi_inspections(id, project_code, core_created_by) values (''m20new-id'', %L, %L)', p1, uq2));
  reset role;
  res := res || pg_temp.t(s = 'OK' and (select core_created_by from quality.rbi_inspections where id = 'm20new-id') = uq1,
    'инженер создаёт проверку — автор он сам, подмена автора не работает (' || s || ')');
  perform pg_temp.as_user(uq1, ca);
  s := pg_temp.err(format('insert into quality.rbi_inspections(id, project_code) values (''m20new2-id'', %L)', p2));
  res := res || pg_temp.t(s <> 'OK', 'инженер не создаёт проверку на чужом объекте (' || s || ')');
  perform pg_temp.as_user(upm, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.rbi_inspections set location = ''x'' where id = ''m20i1-id''') = 0, 'РП не правит проверку');
  s := pg_temp.err(format('insert into quality.rbi_inspections(id, project_code) values (''m20pm-id'', %L)', p1));
  res := res || pg_temp.t(s <> 'OK', 'РП не создаёт проверку (' || s || ')');
  res := res || pg_temp.t(pg_temp.rows('update quality.construction_defects set updated_at = now() where id = ''m20d1-id''') = 0, 'РП не правит замечание');
  perform pg_temp.as_user(ufor, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.construction_defects set updated_at = now() where id = ''m20d1-id''') = 0, 'прораб не правит замечание');
  perform pg_temp.as_user(umg, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.rbi_inspections set location = ''x'' where id = ''m20i3-id''') = 0, 'руководство не правит');
  perform pg_temp.as_user(uc1, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.construction_defects set updated_at = now() where id = ''m20d1-id''') = 1, 'подрядчик правит замечание своей фирмы');
  res := res || pg_temp.t(pg_temp.rows('update quality.construction_defects set updated_at = now() where id = ''m20d2-id''') = 0, 'подрядчик не правит замечание чужой фирмы');
  res := res || pg_temp.t(pg_temp.rows('update quality.construction_defects set contractor = ''Бета Монтаж'' where id = ''m20d1-id''') = -1,
    'подрядчик не переводит замечание на чужую фирму');
  s := pg_temp.err(format('insert into quality.construction_defects(id, project_code, contractor) values (''m20dn-id'', %L, %L)', p1, 'Бета Монтаж'));
  res := res || pg_temp.t(s <> 'OK', 'подрядчик не создаёт замечание на чужую фирму (' || s || ')');
  res := res || pg_temp.t(pg_temp.rows('update quality.rbi_inspections set location = ''x'' where id = ''m20i1-id''') = 0, 'подрядчик не правит проверку Качества');
  perform pg_temp.as_user(ua, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.rbi_inspections set location = ''x'' where id = ''m20i2-id''') = 1, 'админ правит любую проверку');
  perform pg_temp.as_user(ub, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.rbi_inspections set location = ''x''') = 0, 'админ Беты не правит записи Альфы');

  -- 3. Назначение роли с фирмой подрядчика; экран Качества получает объекты и фирму
  perform pg_temp.as_user(ua, ca);
  s := pg_temp.err(format('select public.pf_assign_role(%L, %L, %L, null, %L)', uc0,
         (select id from core.company_roles where company_id = ca and template_code = 'contractor_rep'), p2, k2));
  res := res || pg_temp.t(s = 'OK', 'админ назначает подрядчика с фирмой (' || s || ')');
  reset role;
  res := res || pg_temp.t(exists (select 1 from core.role_assignments where user_id = uc0 and project_id = p2 and counterparty_id = k2), 'фирма записана в назначение');
  perform pg_temp.as_user(ua, ca);
  s := pg_temp.err(format('select public.pf_assign_role(%L, %L, %L, null, %L)', uc0,
         (select id from core.company_roles where company_id = ca and template_code = 'contractor_rep'), p1, kb));
  res := res || pg_temp.t(s = '22023', 'фирма чужой компании — отказ (' || s || ')');
  s := pg_temp.err(format('select public.pf_assign_role(%L, %L, %L, null, %L)', uc0,
         (select id from core.company_roles where company_id = ca and template_code = 'contractor_rep'), p1, kcl));
  res := res || pg_temp.t(s = '22023', 'контрагент не «подрядчик» — отказ (' || s || ')');
  s := pg_temp.err(format('select public.pf_assign_role(%L, %L)', ueco, (select id from core.company_roles where company_id = ca and template_code = 'pto')));
  res := res || pg_temp.t(s = 'OK', 'назначение без фирмы — как раньше (' || s || ')');
  select count(*) into n from public.pf_list_company_members(ca) where user_id = uc0 and counterparty_name = 'Бета Монтаж';
  res := res || pg_temp.t(n = 1, 'список людей показывает фирму (' || n || ')');
  perform pg_temp.as_user(uc0, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects') = '', 'подрядчик К2 на объекте 2 не видит замечаний объекта 1/2 чужой фирмы');
  perform pg_temp.as_user(uq1, ca);
  s := pg_temp.err(format('select public.pf_assign_role(%L, %L)', uq2, (select id from core.company_roles where company_id = ca and template_code = 'pto')));
  res := res || pg_temp.t(s = '42501', 'инженер не назначает роли (' || s || ')');

  perform pg_temp.as_user(uc1, ca); j := quality.my_access(null);
  res := res || pg_temp.t(j -> 'projects' = 'null'::jsonb and j #>> '{contractor,name}' = 'ООО «Альфа-Строй»'
    and j #> '{contractor,keys}' ? 'alfa_sinonim' and j -> 'templates' = '["contractor_rep"]', 'экран: подрядчик К1 — вся компания и фирма: ' || j::text);
  perform pg_temp.as_user(upm, ca); j := quality.my_access(null);
  res := res || pg_temp.t(j -> 'projects' = jsonb_build_array(p1) and j -> 'contractor' = 'null'::jsonb
    and j -> 'actions' = '["construction.view", "quality.view"]', 'экран: РП — объект 1, только просмотр: ' || j::text);
  perform pg_temp.as_user(umg, ca); j := quality.my_access(null);
  res := res || pg_temp.t(j -> 'actions' ? 'quality.scope.company' and not (j -> 'actions' ? 'quality.edit'), 'экран: руководство — вся компания, без правки: ' || j::text);

  -- 4. Шаблоны ролей
  reset role;
  select string_agg(template_code || ':' || action, ' ' order by template_code, action) into s from core.role_template_permissions
   where action like 'quality.%' or action like 'construction.%';
  -- после 033c: + справочник объектов и дерево локаций у шаблона «Администратор компании»
  s := replace(replace(s, 'company_admin:construction.objects.manage ', ''), 'company_admin:quality.objects.manage ', '');
  s := replace(replace(s, 'company_admin:quality.ai ', ''), 'qc_engineer:quality.ai ', '');  -- после 034
  res := res || pg_temp.t(s = 'company_admin:construction.edit company_admin:construction.manage company_admin:construction.view '
    || 'company_admin:quality.edit company_admin:quality.manage company_admin:quality.scope.company company_admin:quality.view '
    || 'contractor_rep:construction.edit contractor_rep:construction.view contractor_rep:quality.scope.contractor contractor_rep:quality.view '
    || 'customer:construction.view customer:quality.view foreman:construction.view foreman:quality.view '
    || 'management:construction.view management:quality.scope.company management:quality.view '
    || 'project_manager:construction.view project_manager:quality.view pto:construction.view pto:quality.view '
    || 'qc_engineer:construction.edit qc_engineer:construction.view qc_engineer:quality.edit qc_engineer:quality.view', 'шаблоны ролей: ' || s);

  raise exception 'ОТЧЁТ (откат):%FAIL всего: %', E'\n' || res, (select count(*) from regexp_matches(res, 'FAIL ', 'g')) using errcode = 'P0001';
end $$;
