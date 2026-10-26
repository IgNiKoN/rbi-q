-- P2-0044 этап 1 (043): кабинет подрядчика на замечаниях Стройконтроля. Фирма записей _v2 — по id контрагента ядра
-- (через справочник фирм объекта); подрядчик видит свою фирму, берёт «В работу» и «Устранено» (история дописывается),
-- не создаёт, не удаляет, не закрывает и не отклоняет замечания; инженер — как раньше; приёмки — заявку подаёт сам.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 043_contractor_cabinet_up.sql.
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
create or replace function pg_temp.vis(tbl text) returns text language plpgsql as $f$
declare s text;
begin
  execute format('select coalesce(string_agg(split_part(id, ''-'', 1), '','' order by id collate "C"), '''') from quality.%I where id like ''%%-m43''', tbl) into s;
  return s;
exception when others then return 'ERR:' || sqlstate; end $f$;
create or replace function pg_temp.cid(tbl text, mark text) returns uuid language plpgsql as $f$
declare v uuid; begin reset role; execute format('select core_counterparty_id from quality.%I where id = %L', tbl, mark || '-m43') into v; return v; end $f$;
create or replace function pg_temp.mk(tbl text, mark text, author uuid, p_set text) returns void language plpgsql as $f$
declare c record; cols text := 'id'; vals text := quote_literal(mark || '-m43');
begin
  for c in select a.attname, format_type(a.atttypid, a.atttypmod) typ
             from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = ('quality.' || tbl)::regclass and a.attnum > 0 and not a.attisdropped
              and a.attname not in ('id', 'core_company_id', 'core_project_id', 'core_created_by', 'core_object_id', 'core_counterparty_id')
              and (a.attname = 'project_code' or (a.attnotnull and d.adbin is null)) order by a.attnum loop
    cols := cols || ', ' || quote_ident(c.attname);
    vals := vals || ', ' || case
      when c.attname = 'project_code' then quote_literal(current_setting('m43.pc'))
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
  perform set_config('request.jwt.claim.sub', coalesce(author::text, ''), true);
  execute format('insert into quality.%I (%s) values (%s)', tbl, cols, vals);
  if p_set is not null then execute format('update quality.%I set %s where id = %L', tbl, p_set, mark || '-m43'); end if;
end $f$;

do $$
declare
  ueng uuid := gen_random_uuid(); uc1 uuid := gen_random_uuid(); uc2 uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); pa uuid := gen_random_uuid(); f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid();
  d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid(); r_eng uuid; r_con uuid; res text := ''; n int; h jsonb;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[ueng, uc1, uc2]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 043', true);
  insert into core.company_members(company_id, user_id) select ca, u from unnest(array[ueng, uc1, uc2]) u;
  insert into core.company_modules(company_id, module, enabled)
    select ca, m, true from unnest(array['quality', 'construction']) m on conflict (company_id, module) do update set enabled = true;
  insert into core.projects(id, company_id, name) values (pa, ca, 'Объекты Альфы 043');
  insert into core.counterparties(id, company_id, name, inn, kinds) values
    (f1, ca, 'ООО Ромашка', '7700000041', array['contractor']), (f2, ca, 'Лютик', '7700000042', array['contractor']);
  insert into core.company_roles(company_id, name) values (ca, 'Инженер 043') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (ca, 'Подрядчик 043') returning id into r_con;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_eng, ca, a from unnest(array['quality.view', 'construction.view', 'construction.edit']) a
  union all select r_con, ca, a from unnest(array['quality.view', 'construction.view', 'construction.edit', 'quality.scope.contractor']) a;
  insert into core.role_assignments(company_id, user_id, role_id, counterparty_id) values
    (ca, ueng, r_eng, null), (ca, uc1, r_con, f1), (ca, uc2, r_con, f2);
  perform set_config('request.headers', json_build_object('x-company-id', ca)::text, true);
  -- справочник фирм объекта (контрагенты ядра выкладываются в него сервером, 018e); написание в справочнике — другое, ключ тот же
  insert into quality.contractor_directory(id, project_code, canonical_key, display_name, core_company_id) values
    (d1, pa::text, quality.contractor_key('ООО Ромашка'), 'Ромашка (подрядчик)', ca),
    (d2, pa::text, quality.contractor_key('Лютик'), 'ЛЮТИК', ca)
  on conflict do nothing;
  select id into d1 from quality.contractor_directory where core_company_id = ca and canonical_key = quality.contractor_key('ООО Ромашка') order by created_at limit 1;
  select id into d2 from quality.contractor_directory where core_company_id = ca and canonical_key = quality.contractor_key('Лютик') order by created_at limit 1;
  update quality.contractor_directory set display_name = 'Ромашка (подрядчик)' where id = d1;

  perform set_config('m43.pc', pa::text, true);
  perform pg_temp.mk('construction_defects_v2', 'x1', ueng, format('core_company_id = %L, "contractorId" = %L, status = %L, history = %L', ca, d1, 'issued', '[]'));
  perform pg_temp.mk('construction_defects_v2', 'x2', ueng, format('core_company_id = %L, "contractorId" = %L, status = %L', ca, d2, 'issued'));
  perform pg_temp.mk('construction_defects_v2', 'x3', ueng, format('core_company_id = %L, "contractorId" = %L, status = %L', ca, d1, 'rejected'));
  perform pg_temp.mk('construction_acceptance_v2', 'a1', ueng, format('core_company_id = %L, "contractorId" = %L', ca, d1));
  perform pg_temp.mk('construction_defects', 'v1', ueng, format('core_company_id = %L, contractor = %L, status = %L', ca, 'ООО Ромашка', 'issued'));

  -- 1. Фирма записи по номеру
  res := res || pg_temp.t(pg_temp.cid('construction_defects_v2', 'x1') = f1 and pg_temp.cid('construction_defects_v2', 'x2') = f2
                          and pg_temp.cid('construction_acceptance_v2', 'a1') = f1, 'contractorId → справочник объекта → F1/F2');

  -- 2. Подрядчик F1 видит свою фирму (другое написание в справочнике не мешает), чужую — нет
  perform pg_temp.as_user(uc1, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = 'x1,x3', 'подрядчик F1: замечания своей фирмы (' || pg_temp.vis('construction_defects_v2') || ')');
  res := res || pg_temp.t(pg_temp.vis('construction_acceptance_v2') = 'a1', 'подрядчик F1: приёмка своей фирмы');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_defects_v2 set status = 'in_progress' where id = 'x2-m43'$q$) = 0,
                          'подрядчик F1 не правит чужое замечание');

  -- 3. Разрешённые переходы: «В работу», «Устранено» с фото в истории, «Повторно предъявить»
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_defects_v2 set status = 'in_progress' where id = 'x1-m43'$q$) = 1,
                          'подрядчик: issued → in_progress');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_defects_v2 set status = 'fixed',
      history = coalesce(history, '[]') || '[{"status": "fixed", "photo": "f.jpg"}]' where id = 'x1-m43'$q$) = 1,
                          'подрядчик: in_progress → fixed с фото в истории');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_defects_v2 set status = 'fixed',
      history = coalesce(history, '[]') || '[{"status": "fixed"}]' where id = 'x3-m43'$q$) = 1,
                          'подрядчик: rejected → fixed (повторно предъявить)');

  -- 4. Запрещено подрядчику
  res := res || pg_temp.t(pg_temp.err($q$update quality.construction_defects_v2 set status = 'closed' where id = 'x1-m43'$q$) = '42501', 'подрядчик не закрывает');
  res := res || pg_temp.t(pg_temp.err($q$update quality.construction_defects_v2 set status = 'rejected' where id = 'x1-m43'$q$) = '42501', 'подрядчик не отклоняет');
  res := res || pg_temp.t(pg_temp.err($q$update quality.construction_defects_v2 set status = 'issued' where id = 'x1-m43'$q$) = '42501', 'подрядчик не возвращает в «выдано»');
  -- прочие поля сервер оставляет прежними (приложение присылает строку целиком)
  res := res || pg_temp.t(pg_temp.err(format($q$update quality.construction_defects_v2 set "contractorId" = %L where id = 'x1-m43'$q$, d2)) = '42501',
                          'подрядчик не переводит замечание на другую фирму');
  perform pg_temp.rows($q$update quality.construction_defects_v2 set text = 'другое', deadline = now() + interval '30 day',
      is_deleted = true where id = 'x1-m43'$q$);
  reset role;
  select count(*) into n from quality.construction_defects_v2 where id = 'x1-m43' and text is distinct from 'другое'
     and deadline is null and not is_deleted and "contractorId" = d1::text and core_counterparty_id = f1 and status = 'fixed';
  res := res || pg_temp.t(n = 1, 'подрядчик не меняет текст, срок, фирму и пометку удаления');
  perform pg_temp.as_user(uc1, ca);
  -- правка как upsert (так отправляет приложение): статус — да, остальное — прежнее; новое замечание — нет
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.construction_defects_v2(id, core_company_id, "contractorId", status, history, text)
      values ('x3-m43', %L, %L, 'fixed', (select history from quality.construction_defects_v2 where id = 'x3-m43'), 'чужой текст')
      on conflict (id, core_company_id) do update set status = excluded.status, history = excluded.history, text = excluded.text$q$, ca, d1)) = 'OK',
                          'подрядчик: правка upsert-ом проходит');
  reset role;
  res := res || pg_temp.t((select text from quality.construction_defects_v2 where id = 'x3-m43') is distinct from 'чужой текст',
                          'upsert подрядчика не меняет текст');
  perform pg_temp.as_user(uc1, ca);
  res := res || pg_temp.t(pg_temp.err($q$update quality.construction_defects_v2 set history = '[]' where id = 'x1-m43'$q$) = '42501', 'подрядчик не стирает историю');
  res := res || pg_temp.t(pg_temp.err($q$delete from quality.construction_defects_v2 where id = 'x1-m43'$q$) = '42501', 'подрядчик не удаляет замечание');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.construction_defects_v2(id, core_company_id, "contractorId", status)
      values ('n1-m43', %L, %L, 'issued')$q$, ca, d1)) = '42501', 'подрядчик не создаёт замечание');
  res := res || pg_temp.t(pg_temp.err($q$delete from quality.construction_defects where id = 'v1-m43'$q$) = '42501', 'подрядчик не удаляет замечание (v1)');
  res := res || pg_temp.t(pg_temp.err($q$update quality.construction_defects set status = 'closed' where id = 'v1-m43'$q$) = '42501', 'подрядчик не закрывает (v1)');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_defects set status = 'in_progress' where id = 'v1-m43'$q$) = 1, 'подрядчик: v1 «В работу»');
  -- приёмка: заявку подрядчик подаёт сам, как раньше
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.construction_acceptance_v2(id, core_company_id, "contractorId", status)
      values ('a2-m43', %L, %L, 'requested')$q$, ca, d1)) = 'OK', 'подрядчик подаёт заявку на приёмку своей фирмы');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.construction_acceptance_v2(id, core_company_id, "contractorId", status)
      values ('a3-m43', %L, %L, 'requested')$q$, ca, d2)) <> 'OK', 'подрядчик не подаёт заявку за чужую фирму');
  -- функции 043 закрыты
  res := res || pg_temp.t(pg_temp.err(format('select quality.contractor_limited(%L, null)', ca)) = '42501', 'contractor_limited закрыта');
  res := res || pg_temp.t(pg_temp.err(format('select quality.construction_counterparty(%L, %L)', ca, d1)) = '42501', 'construction_counterparty закрыта');

  -- 5. Инженер: принимает, отклоняет, создаёт, удаляет — как раньше
  perform pg_temp.as_user(ueng, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = 'x1,x2,x3', 'инженер видит все замечания');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_defects_v2 set status = 'closed' where id = 'x1-m43'$q$) = 1, 'инженер принимает');
  res := res || pg_temp.t(pg_temp.rows($q$update quality.construction_defects_v2 set status = 'rejected' where id = 'x3-m43'$q$) = 1, 'инженер отклоняет');
  res := res || pg_temp.t(pg_temp.err(format($q$insert into quality.construction_defects_v2(id, core_company_id, "contractorId", status)
      values ('n2-m43', %L, %L, 'issued')$q$, ca, d2)) = 'OK', 'инженер создаёт замечание');
  res := res || pg_temp.t(pg_temp.rows($q$delete from quality.construction_defects_v2 where id = 'n2-m43'$q$) = 1, 'инженер удаляет замечание');

  -- 6. Подрядчик видит итог; переименование фирмы в «Контрагентах» — записи на месте
  reset role;
  update core.counterparties set name = 'ООО Ромашка-Плюс' where id = f1;
  perform pg_temp.as_user(uc1, ca);
  select status into h from (select to_jsonb(status) status from quality.construction_defects_v2 where id = 'x1-m43') s;
  res := res || pg_temp.t(h = '"closed"', 'подрядчик видит «Принято»');
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = 'x1,x3', 'после переименования фирмы — те же замечания');
  perform pg_temp.as_user(uc2, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') = 'x2', 'подрядчик F2 видит только свою фирму');
  perform pg_temp.as_user(null, ca);
  res := res || pg_temp.t(pg_temp.vis('construction_defects_v2') in ('', 'ERR:42501'), 'anon не видит замечания');

  reset role;
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
