-- P2-0070 (052), часть 1 из 2 — «до = после»: засев и снимок прав ДО миграции. Запуск — на схеме 051 (serverDb({ upto: '051' })),
-- затем 052_rights_mechanism_up.sql, затем 052_rights_mechanism_compare.check.sql (снимок ПОСЛЕ и сравнение).
-- Пользователи — по одному на каждую роль-шаблон компании и свои роли (инженер, подрядчик, только просмотр, руководитель,
-- инженер с участием на секцию, инженер одного объекта); записи — в секциях двух объектов, на узле-объекте, без места.
-- Снимок: пользователь × запись × действие (видит, в работу, устранено, закрыть, вернуть, текст, срок, подрядчик, пометка
-- удаления, удаление, создание; приёмка — видит, принять, время, отозвать, создание; Стройконтроль 1 — видит, закрыть) →
-- произошло ли действие на самом деле (сторож 043 молча оставляет подрядчику прежние поля — считается «не произошло»).
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, false);
  perform set_config('request.headers', json_build_object('x-company-id', current_setting('m52.ca'))::text, false);
  if u is not null then execute 'set role authenticated'; end if;
end $f$;
-- действие пользователя u: запрос q, затем (под сервером) проверка chk; всё откатывается
create or replace function pg_temp.try(u uuid, q text, chk text) returns boolean language plpgsql as $f$
declare ok boolean := false;
begin
  begin
    perform pg_temp.as_user(u);
    begin execute q; exception when others then null; end;
    reset role;
    execute chk into ok;
    raise exception 'm52-rollback';
  exception when others then
    if sqlerrm <> 'm52-rollback' then raise; end if;
  end;
  reset role;
  return coalesce(ok, false);
end $f$;
create or replace function pg_temp.sees(u uuid, tbl text, rid text) returns boolean language plpgsql as $f$
declare n int;
begin
  perform pg_temp.as_user(u);
  execute format('select count(*) from quality.%I where id = %L', tbl, rid) into n;
  reset role;
  return n = 1;
exception when others then reset role; return false;
end $f$;

create table if not exists public.t052(phase text, usr text, tbl text, rec text, op text, ok boolean);

create or replace function pg_temp.capture(p_phase text) returns void language plpgsql as $f$
declare u record; r record; d2 text := current_setting('m52.d2'); q text;
begin
  for u in select * from public.t052_users loop
    for r in select id, "locationId" loc, "contractorId" ctr from quality.construction_defects_v2 where id like '%-m52' loop
      insert into public.t052 values (p_phase, u.k, 'defect', r.id, 'видит', pg_temp.sees(u.id, 'construction_defects_v2', r.id));
      insert into public.t052 select p_phase, u.k, 'defect', r.id, x.op,
          pg_temp.try(u.id, format('update quality.construction_defects_v2 set %s where id = %L', x.s, r.id),
                      format('select exists (select 1 from quality.construction_defects_v2 where id = %L and %s)', r.id, x.c))
        from (values ('в работу', 'status = ''in_progress''', 'status = ''in_progress'''),
                     ('устранено', 'status = ''fixed''', 'status = ''fixed'''),
                     ('закрыть', 'status = ''closed''', 'status = ''closed'''),
                     ('вернуть', 'status = ''rejected''', 'status = ''rejected'''),
                     ('текст', 'text = ''m52-новый''', 'text = ''m52-новый'''),
                     ('срок', 'deadline = ''2030-01-01''', 'deadline = ''2030-01-01'''),
                     ('подрядчик', format('"contractorId" = %L', d2), format('"contractorId" = %L', d2)),
                     ('пометка удаления', 'is_deleted = true', 'is_deleted')) x(op, s, c);
      insert into public.t052 values (p_phase, u.k, 'defect', r.id, 'удаление',
        pg_temp.try(u.id, format('delete from quality.construction_defects_v2 where id = %L', r.id),
                    format('select not exists (select 1 from quality.construction_defects_v2 where id = %L)', r.id)));
      insert into public.t052 values (p_phase, u.k, 'defect', r.id, 'создать здесь',
        pg_temp.try(u.id, format('insert into quality.construction_defects_v2(id, core_company_id, "locationId", "contractorId", status) '
                                 'values (%L, %L, %L, %L, ''issued'')', 'n-' || r.id, current_setting('m52.ca'), r.loc, r.ctr),
                    format('select exists (select 1 from quality.construction_defects_v2 where id = %L)', 'n-' || r.id)));
    end loop;
    for r in select id, "locationId" loc, "contractorId" ctr from quality.construction_acceptance_v2 where id like '%-m52' loop
      insert into public.t052 values (p_phase, u.k, 'acceptance', r.id, 'видит', pg_temp.sees(u.id, 'construction_acceptance_v2', r.id));
      insert into public.t052 select p_phase, u.k, 'acceptance', r.id, x.op,
          pg_temp.try(u.id, format('update quality.construction_acceptance_v2 set %s where id = %L', x.s, r.id),
                      format('select exists (select 1 from quality.construction_acceptance_v2 where id = %L and %s)', r.id, x.s))
        from (values ('принять', 'status = ''accepted'''), ('время', 'requested_date = ''2030-01-01'''),
                     ('отозвать', 'is_deleted = true')) x(op, s);
      insert into public.t052 values (p_phase, u.k, 'acceptance', r.id, 'записаться здесь',
        pg_temp.try(u.id, format('insert into quality.construction_acceptance_v2(id, core_company_id, "locationId", "contractorId", status) '
                                 'values (%L, %L, %L, %L, ''pending'')', 'n-' || r.id, current_setting('m52.ca'), r.loc, r.ctr),
                    format('select exists (select 1 from quality.construction_acceptance_v2 where id = %L)', 'n-' || r.id)));
    end loop;
    for r in select id from quality.construction_defects where id like '%-m52' loop
      insert into public.t052 values (p_phase, u.k, 'defect_v1', r.id, 'видит', pg_temp.sees(u.id, 'construction_defects', r.id));
      insert into public.t052 values (p_phase, u.k, 'defect_v1', r.id, 'закрыть',
        pg_temp.try(u.id, format('update quality.construction_defects set status = ''closed'' where id = %L', r.id),
                    format('select exists (select 1 from quality.construction_defects where id = %L and status = ''closed'')', r.id)));
    end loop;
  end loop;
end $f$;

do $$
declare
  ca uuid := gen_random_uuid(); f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); d1 uuid; d2 uuid;
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid();
  uadm uuid := gen_random_uuid(); r_adm uuid; s1loc uuid; n_s1 text; n_s2 text; n_t1 text; n_o1 text; r_eng uuid; r_ctr uuid; r_view uuid; r_mgr uuid; r record; u uuid;
begin
  perform set_config('m52.ca', ca::text, false);
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 052', true);
  insert into core.company_modules(company_id, module, enabled)
    select ca, m, true from unnest(array['quality', 'construction', 'planfact']) m on conflict (company_id, module) do update set enabled = true;
  perform set_config('request.headers', json_build_object('x-company-id', ca)::text, false);
  insert into core.counterparties(id, company_id, name, inn, kinds) values
    (f1, ca, 'ООО Ромашка 052', '7700000521', array['contractor']), (f2, ca, 'Лютик 052', '7700000522', array['contractor']);
  -- два объекта ядра (места ведёт «Компания → Объекты и места», 048): корпус, секции, этажи; зеркало Качества — сервер
  insert into auth.users(id, email) values (uadm, uadm || '@test.invalid');
  insert into core.company_members(company_id, user_id) values (ca, uadm);
  insert into core.company_roles(company_id, name) values (ca, 'Админ мест 052') returning id into r_adm;
  insert into core.company_role_permissions(role_id, company_id, action) values (r_adm, ca, 'planfact.projects.manage');
  insert into core.role_assignments(company_id, user_id, role_id) values (ca, uadm, r_adm);
  perform pg_temp.as_user(uadm);
  perform public.pf_save_project(ca, p1, '{"name": "ЖК-1 052"}');
  perform public.pf_save_project(ca, p2, '{"name": "ЖК-2 052"}');
  perform public.pf_save_place(p1, k1, null, 'object', 'Корпус 1', 'building');
  perform public.pf_save_place(p2, k2, null, 'object', 'Корпус 1', 'building');
  perform public.pf_fill_object(k1, 2, 1, 1);
  perform public.pf_fill_object(k2, 1, 1, 1);
  reset role;
  select l.id into s1loc from core.locations l where l.parent_id = k1 and l.name = 'Секция 1';
  if s1loc is null then raise exception 'засев 052: нет мест'; end if;
  perform set_config('m52.p1', p1::text, false);
  insert into quality.contractor_directory(id, project_code, canonical_key, display_name, core_company_id) values
    (gen_random_uuid(), p1::text, quality.contractor_key('ООО Ромашка 052'), 'Ромашка 052', ca),
    (gen_random_uuid(), p1::text, quality.contractor_key('Лютик 052'), 'Лютик 052', ca) on conflict do nothing;
  select id into d1 from quality.contractor_directory where core_company_id = ca and canonical_key = quality.contractor_key('ООО Ромашка 052') limit 1;
  select id into d2 from quality.contractor_directory where core_company_id = ca and canonical_key = quality.contractor_key('Лютик 052') limit 1;
  perform set_config('m52.d2', d2::text, false);

  -- узлы Качества (как "locationId" записи): этаж секции 1 и 2 ЖК-1, этаж ЖК-2, узел-объект ЖК-1 (без места)
  select n.id into n_s1 from core.locations l join quality.location_nodes n on n.core_location_id = l.id where l.parent_id = s1loc;
  select n.id into n_s2 from core.locations s join core.locations l on l.parent_id = s.id join quality.location_nodes n on n.core_location_id = l.id
   where s.parent_id = k1 and s.name = 'Секция 2';
  select n.id into n_t1 from core.locations s join core.locations l on l.parent_id = s.id join quality.location_nodes n on n.core_location_id = l.id
   where s.parent_id = k2;
  select n.id into n_o1 from quality.location_nodes n where n.core_company_id = ca and n."nodeType" = 'object' and quality.node_root_project(n) = p1;
  if n_s1 is null or n_s2 is null or n_t1 is null or n_o1 is null then raise exception 'засев 052: нет узлов Качества'; end if;

  -- пользователи: по одному на каждую роль-шаблон (создаются с компанией) и свои роли
  create table public.t052_users(k text primary key, id uuid not null);
  for r in select id, template_code from core.company_roles where company_id = ca and template_code is not null order by template_code loop
    u := gen_random_uuid();
    insert into auth.users(id, email) values (u, u || '@test.invalid');
    insert into core.company_members(company_id, user_id) values (ca, u);
    insert into core.role_assignments(company_id, user_id, role_id, counterparty_id)
      values (ca, u, r.id, case when r.template_code = 'contractor_rep' then f1 end);
    insert into public.t052_users values ('шаблон ' || r.template_code, u);
  end loop;
  insert into core.company_roles(company_id, name) values (ca, 'Инженер 052') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (ca, 'Подрядчик 052') returning id into r_ctr;
  insert into core.company_roles(company_id, name) values (ca, 'Просмотр 052') returning id into r_view;
  insert into core.company_roles(company_id, name) values (ca, 'Руководитель 052') returning id into r_mgr;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_eng, ca, a from unnest(array['quality.view', 'construction.view', 'construction.edit', 'planfact.fact.view']) a
  union all select r_ctr, ca, a from unnest(array['quality.view', 'construction.view', 'construction.edit', 'quality.scope.contractor']) a
  union all select r_view, ca, a from unnest(array['quality.view', 'construction.view']) a
  union all select r_mgr, ca, a from unnest(array['quality.view', 'construction.view', 'construction.edit', 'construction.manage']) a;
  for r in select * from (values ('инженер', r_eng, null::uuid, null::uuid, null::uuid), ('подрядчик F1', r_ctr, null, null, f1),
                                 ('подрядчик F2', r_ctr, null, null, f2), ('просмотр', r_view, null, null, null),
                                 ('руководитель', r_mgr, null, null, null), ('инженер ЖК-2', r_eng, p2, null, null),
                                 ('инженер секции 1 ЖК-1', r_eng, p1, s1loc, null)) v(k, role, proj, loc, cp) loop
    u := gen_random_uuid();
    insert into auth.users(id, email) values (u, u || '@test.invalid');
    insert into core.company_members(company_id, user_id) values (ca, u);
    insert into core.role_assignments(company_id, user_id, role_id, project_id, location_id, counterparty_id)
      values (ca, u, r.role, r.proj, r.loc, r.cp);
    insert into public.t052_users values (r.k, u);
  end loop;

  -- записи (автор — инженер; одна — инженера секции на узле-объекте, без места)
  -- автор вставки — sub (set_author сервера), как 043 (pg_temp.mk); роль — сервер
  select id into u from public.t052_users where k = 'инженер';
  perform set_config('request.jwt.claim.sub', u::text, false);
  insert into quality.construction_defects_v2(id, core_company_id, core_created_by, "locationId", "contractorId", status, text, history) values
    ('s1-m52', ca, u, n_s1, d1, 'issued', 'т', '[]'), ('s2-m52', ca, u, n_s2, d2, 'issued', 'т', '[]'),
    ('o1-m52', ca, u, n_o1, d1, 'issued', 'т', '[]'), ('t1-m52', ca, u, n_t1, d1, 'issued', 'т', '[]'),
    ('none-m52', ca, u, null, d1, 'issued', 'т', '[]');
  insert into quality.construction_acceptance_v2(id, core_company_id, core_created_by, "locationId", "contractorId", status) values
    ('s1-m52', ca, u, n_s1, d1, 'pending'), ('s2-m52', ca, u, n_s2, d2, 'pending'), ('t1-m52', ca, u, n_t1, d1, 'pending'),
    ('none-m52', ca, u, null, d1, 'pending');
  select id into u from public.t052_users where k = 'инженер секции 1 ЖК-1';
  perform set_config('request.jwt.claim.sub', u::text, false);
  insert into quality.construction_defects_v2(id, core_company_id, core_created_by, "locationId", "contractorId", status, text, history) values
    ('own-m52', ca, u, n_o1, d1, 'issued', 'т', '[]');
  -- Стройконтроль 1 — для проверки «не изменился»
  insert into quality.construction_defects(id, core_company_id, project_code, contractor, status) values
    ('v1-m52', ca, p1::text, 'ООО Ромашка 052', 'issued');
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

select pg_temp.capture('до');
select phase, count(*) n, count(*) filter (where ok) yes from public.t052 group by phase;
