-- P2-0018 доработка 1: исправления области (023). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N». Запуск: после 023.
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

create or replace function pg_temp.visq() returns text language plpgsql as $f$
declare s text;
begin
  select coalesce(string_agg(action_type, ',' order by action_type), '') into s from quality.rbi_sync_queue where action_type like 'm20%';
  return s;
exception when others then return 'ERR:' || sqlstate; end $f$;

do $$
declare
  ua uuid := gen_random_uuid(); uq1 uuid := gen_random_uuid(); uq2 uuid := gen_random_uuid(); uc1 uuid := gen_random_uuid();
  upm uuid := gen_random_uuid(); umg uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); p1 uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid(); s text; n int; res text := '';
  r record;
begin
  insert into auth.users(id, email) values (ua, 'adm023@test.invalid'), (uq1, 'eng1-023@test.invalid'), (uq2, 'eng2-023@test.invalid'),
    (uc1, 'con023@test.invalid'), (upm, 'pm023@test.invalid'), (umg, 'mg023@test.invalid'), (ub, 'beta023@test.invalid');
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 023', true), (cb, 'Бета 023', true);
  insert into core.company_members(company_id, user_id) select ca, u from unnest(array[ua, uq1, uq2, uc1, upm, umg]) u union all select cb, ub;
  insert into core.projects(id, company_id, name) values (p1, ca, 'Объект 1'), (pb, cb, 'Объект Б');
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.counterparties(id, company_id, name, inn, kinds) values
    (k1, ca, 'ООО «Альфа-Строй»', '7700000011', array['contractor']), (k2, ca, 'Бета Монтаж', '7700000022', array['contractor']);
  insert into core.role_assignments(company_id, user_id, role_id, project_id, counterparty_id)
  select ca, x.u, (select id from core.company_roles where company_id = ca and template_code = x.tpl), x.p, x.k
  from (values (ua, 'company_admin', null::uuid, null::uuid), (uq1, 'qc_engineer', p1, null), (uq2, 'qc_engineer', p1, null),
               (uc1, 'contractor_rep', p1, k1), (upm, 'project_manager', p1, null), (umg, 'management', null, null)) x(u, tpl, p, k);
  insert into core.role_assignments(company_id, user_id, role_id) values (cb, ub, (select id from core.company_roles where company_id = cb and template_code = 'company_admin'));

  -- Стройконтроль 2.0: подрядчики-справочник и замечания v2
  perform set_config('request.headers', json_build_object('x-company-id', ca)::text, true);   -- строки уровня компании
  perform pg_temp.mk('contractors', null, 'm20k1', ua, format('canonical_key = %L, "displayName" = %L', quality.contractor_key('ООО «Альфа-Строй»'), 'ООО «Альфа-Строй»'));
  perform pg_temp.mk('contractors', null, 'm20k2', ua, format('canonical_key = %L, "displayName" = %L', quality.contractor_key('Бета Монтаж'), 'Бета Монтаж'));
  perform pg_temp.mk('construction_defects_v2', null, 'm20v1', uq1, '"contractorId" = ''m20k1-id''');
  perform pg_temp.mk('construction_defects_v2', null, 'm20v2', uq1, '"contractorId" = ''m20k2-id''');
  perform pg_temp.mk('construction_acceptance_v2', null, 'm20a1', uq1, '"contractorId" = ''m20k1-id''');
  perform pg_temp.mk('construction_acceptance_v2', null, 'm20a2', uq1, '"contractorId" = ''m20k2-id''');
  -- черновики и очередь: от инженеров 1 и 2; старый черновик без автора — по почте
  perform pg_temp.mk('rbi_draft_sessions', p1::text, 'm20d1', uq1, null);
  perform pg_temp.mk('rbi_draft_sessions', p1::text, 'm20d2', uq2, null);
  perform pg_temp.mk('rbi_draft_sessions', p1::text, 'm20d3', null, '"engineer_name" = ''eng1-023@test.invalid''');
  -- у очереди id — uuid: метка в action_type
  reset role; perform set_config('request.jwt.claim.sub', uq1::text, true);
  insert into quality.rbi_sync_queue(project_code, engineer_name, action_type, payload) values (p1::text, 'eng1-023@test.invalid', 'm20q1', '{}');
  perform set_config('request.jwt.claim.sub', uq2::text, true);
  insert into quality.rbi_sync_queue(project_code, engineer_name, action_type, payload) values (p1::text, 'eng2-023@test.invalid', 'm20q2', '{}');
  -- проверки: новая (автор сервер) и старая без автора (engineer_name = почта инженера 1)
  perform pg_temp.mk('rbi_inspections', p1::text, 'm20i1', uq1, null);
  perform pg_temp.mk('rbi_inspections', p1::text, 'm20i2', uq2, null);
  perform pg_temp.mk('rbi_inspections', p1::text, 'm20i3', null, '"engineer_name" = ''Eng1-023@test.invalid''');
  perform pg_temp.mk('rbi_inspection_items', p1::text, 'm20it3', null, 'inspection_id = ''m20i3-id''');
  reset role;
  res := res || pg_temp.t((select core_created_by from quality.rbi_draft_sessions where id = 'm20d1-id') = uq1, 'автор черновика ставит сервер');

  for r in select * from (values
    ('админ',          ua,  'm20v1,m20v2', 'm20a1,m20a2', 'm20d1,m20d2,m20d3', 'm20q1,m20q2', 'm20i1,m20i2,m20i3', 'm20it3'),
    ('руководство',    umg, 'm20v1,m20v2', 'm20a1,m20a2', '',                  '',            'm20i1,m20i2,m20i3', 'm20it3'),
    ('РП',             upm, 'm20v1,m20v2', 'm20a1,m20a2', '',                  '',            'm20i1,m20i2,m20i3', 'm20it3'),
    ('инженер 1',      uq1, 'm20v1,m20v2', 'm20a1,m20a2', 'm20d1,m20d3',       'm20q1',       'm20i1,m20i3',       'm20it3'),
    ('инженер 2',      uq2, 'm20v1,m20v2', 'm20a1,m20a2', 'm20d2',             'm20q2',       'm20i2',             ''),
    ('подрядчик К1',   uc1, 'm20v1',       'm20a1',       '',                  '',            '',                  ''),
    ('админ Беты (заголовок Альфы)', ub, '', '',          '',                  '',            '',                  '')
  ) v(l, u, ev, ea, ed, eq, ei, eit) loop
    perform pg_temp.as_user(r.u, ca);
    s := pg_temp.vis('construction_defects_v2');    res := res || pg_temp.t(s = r.ev,  r.l || ': замечания v2 «' || s || '», ждали «' || r.ev || '»');
    s := pg_temp.vis('construction_acceptance_v2'); res := res || pg_temp.t(s = r.ea,  r.l || ': приёмка v2 «' || s || '», ждали «' || r.ea || '»');
    s := pg_temp.vis('rbi_draft_sessions');         res := res || pg_temp.t(s = r.ed,  r.l || ': черновики «' || s || '», ждали «' || r.ed || '»');
    s := pg_temp.visq();             res := res || pg_temp.t(s = r.eq,  r.l || ': очередь «' || s || '», ждали «' || r.eq || '»');
    s := pg_temp.vis('rbi_inspections');            res := res || pg_temp.t(s = r.ei,  r.l || ': проверки «' || s || '», ждали «' || r.ei || '»');
    s := pg_temp.vis('rbi_inspection_items');       res := res || pg_temp.t(s = r.eit, r.l || ': пункты «' || s || '», ждали «' || r.eit || '»');
  end loop;

  -- запись
  perform pg_temp.as_user(uc1, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.construction_defects_v2 set updated_at = now() where id = ''m20v1-id''') = 1, 'подрядчик правит замечание v2 своей фирмы');
  res := res || pg_temp.t(pg_temp.rows('update quality.construction_defects_v2 set updated_at = now() where id = ''m20v2-id''') = 0, 'подрядчик не правит замечание v2 чужой фирмы');
  res := res || pg_temp.t(pg_temp.rows('update quality.construction_defects_v2 set "contractorId" = ''m20k2-id'' where id = ''m20v1-id''') = -1, 'подрядчик не переводит замечание v2 на чужую фирму');
  perform pg_temp.as_user(uq2, ca);
  res := res || pg_temp.t(pg_temp.rows('update quality.rbi_draft_sessions set updated_at = now() where id = ''m20d1-id''') = 0, 'инженер не правит чужой черновик');
  s := pg_temp.err(format('insert into quality.rbi_sync_queue(project_code, engineer_name, action_type, payload) values (%L, ''eng1-023@test.invalid'', ''m20qx'', ''{}'')', p1));
  reset role;
  res := res || pg_temp.t(s = 'OK' and (select core_created_by from quality.rbi_sync_queue where action_type = 'm20qx') = uq2, 'очередь: автор — вошедший, не подставленная почта (' || s || ')');
  -- пункты — только к существующей проверке
  perform pg_temp.as_user(uq1, ca);
  s := pg_temp.err(format('insert into quality.rbi_inspection_items(id, project_code, inspection_id, item_id) values (''m20itx-id'', %L, ''m20future-id'', ''x'')', p1));
  res := res || pg_temp.t(s <> 'OK', 'инженер не подкладывает пункт к несуществующей проверке (' || s || ')');
  s := pg_temp.err(format('insert into quality.rbi_inspection_items(id, project_code, inspection_id, item_id) values (''m20it1-id'', %L, ''m20i1-id'', ''x'')', p1));
  res := res || pg_temp.t(s = 'OK', 'инженер добавляет пункт к своей проверке (' || s || ')');
  s := pg_temp.err(format('insert into quality.rbi_inspection_items(id, project_code, inspection_id, item_id) values (''m20it2-id'', %L, ''m20i2-id'', ''x'')', p1));
  res := res || pg_temp.t(s <> 'OK', 'инженер не добавляет пункт к чужой проверке (' || s || ')');
  perform pg_temp.as_user(ua, ca);
  s := pg_temp.err(format('insert into quality.rbi_inspection_items(id, project_code, inspection_id, item_id) values (''m20ita-id'', %L, ''m20none-id'', ''x'')', p1));
  res := res || pg_temp.t(s = 'OK', 'админ (manage) — пункт без проверки можно (' || s || ')');

  -- справочник: подрядчик не привязывает чужой ключ к своей фирме
  perform pg_temp.as_user(uc1, ca);
  s := pg_temp.err(format('insert into quality.contractor_directory(project_code, canonical_key, display_name, inn, core_company_id) values (%L, ''chuzhoi_023'', ''Чужая 023'', ''7700000011'', %L)', p1, ca));
  reset role;
  -- после 024 подрядчик справочник только читает (вставка — отказ); в любом случае связи нет
  res := res || pg_temp.t((s = 'OK') = (to_regprocedure('quality.contractor_only(uuid)') is null and to_regprocedure('quality.contractor_only(uuid,uuid)') is null)
    and not exists (select 1 from quality.contractor_core_links where core_company_id = ca and canonical_key = 'chuzhoi_023'),
    'подрядчик: связи с фирмой нет (' || s || ')');
  perform pg_temp.as_user(uq1, ca);
  s := pg_temp.err(format('insert into quality.contractor_directory(project_code, canonical_key, display_name, core_company_id) values (%L, ''novyi_023'', ''Новый 023'', %L)', p1, ca));
  reset role;
  res := res || pg_temp.t(s = 'OK' and exists (select 1 from quality.contractor_core_links where core_company_id = ca and canonical_key = 'novyi_023'),
    'инженер: как раньше — черновик и связь (' || s || ')');

  -- вспомогательные функции — только своя текущая компания
  perform pg_temp.as_user(ub, cb);
  res := res || pg_temp.t(quality.member_by_email(ca, 'eng1-023@test.invalid') is null, 'member_by_email: чужая компания — пусто');
  res := res || pg_temp.t(quality.contractor_ref(ca, 'm20k1-id', 'name') is null, 'contractor_ref: чужая компания — пусто');
  perform pg_temp.as_user(null, ca);
  s := pg_temp.vis('rbi_draft_sessions'); res := res || pg_temp.t(s like 'ERR:%' or s = '', 'anon: черновики не видны (' || s || ')');

  raise exception 'ОТЧЁТ (откат):%FAIL всего: %', E'\n' || res, (select count(*) from regexp_matches(res, 'FAIL ', 'g')) using errcode = 'P0001';
end $$;
