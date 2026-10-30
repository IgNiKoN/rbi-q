-- P2-0071 (053), часть 1 из 2 — «до = после»: засев и снимок прав ДО миграции. Запуск — на схеме 052 (serverDb({ upto: '052' })),
-- затем 053_quality_rights_up.sql, затем 053_quality_rights_compare.check.sql (снимок ПОСЛЕ и сравнение).
-- Пользователи — как в РБИ: руководитель, директор, просмотр на компанию, инженеры с выбранными «объектами Качества» (один и два
-- объекта), инженер без объектов («только свои»), просмотр с объектом, подрядчик, роль План/Факт + Качество на объект и на секцию.
-- Записи: проверки (с пунктом), задачи (с исполнителем), запись без объекта, замечания Стройконтроля 2.0 на двух объектах,
-- эталон (общий раздел). Снимок: пользователь × запись × действие (видит, править, пометить удалённой, удалить, создать
-- на том же объекте; задачи — выполнить, переназначить) → произошло ли действие на самом деле.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, false);
  perform set_config('request.headers', json_build_object('x-company-id', current_setting('m53.ca'))::text, false);
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
    raise exception 'm53-rollback';
  exception when others then
    reset role;
    if sqlerrm <> 'm53-rollback' then ok := false; end if;
  end;
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

create table if not exists public.t053(phase text, usr text, tbl text, rec text, op text, ok boolean);

create or replace function pg_temp.capture(p_phase text) returns void language plpgsql as $f$
declare u record; r record; adm uuid := current_setting('m53.adm')::uuid; q text;
begin
  for u in select * from public.t053_users loop
    for r in select i.id, po.id po from quality.rbi_inspections i
               left join quality.project_objects po on po.core_object_id = i.core_object_id and po.core_company_id = i.core_company_id
              where i.id like '%-m53' loop
      insert into public.t053 values (p_phase, u.k, 'проверка', r.id, 'видит', pg_temp.sees(u.id, 'rbi_inspections', r.id));
      insert into public.t053 select p_phase, u.k, 'проверка', r.id, x.op,
          pg_temp.try(u.id, format('update quality.rbi_inspections set %s where id = %L', x.s, r.id),
                      format('select exists (select 1 from quality.rbi_inspections where id = %L and %s)', r.id, x.s))
        from (values ('править', 'template_title = ''m53-новый'''), ('пометить удалённой', 'is_deleted = true')) x(op, s);
      insert into public.t053 values (p_phase, u.k, 'проверка', r.id, 'удалить',
        pg_temp.try(u.id, format('delete from quality.rbi_inspections where id = %L', r.id),
                    format('select not exists (select 1 from quality.rbi_inspections where id = %L)', r.id)));
      insert into public.t053 values (p_phase, u.k, 'проверка', r.id, 'создать на объекте',
        pg_temp.try(u.id, format('insert into quality.rbi_inspections(id, core_company_id, project_code, "projectId", project_display_name, template_title) '
                                 'values (%L, %L, %L, %L, %L, ''m53'')', 'n-' || r.id, current_setting('m53.ca'), current_setting('m53.cont'), r.po,
                                 case when r.po is null then 'Неизвестный 053' end),
                    format('select exists (select 1 from quality.rbi_inspections where id = %L)', 'n-' || r.id)));
    end loop;
    for r in select id from quality.rbi_inspection_items where id like '%-m53' loop
      insert into public.t053 values (p_phase, u.k, 'пункт', r.id, 'видит', pg_temp.sees(u.id, 'rbi_inspection_items', r.id));
      insert into public.t053 values (p_phase, u.k, 'пункт', r.id, 'править',
        pg_temp.try(u.id, format('update quality.rbi_inspection_items set comment = ''m53'' where id = %L', r.id),
                    format('select exists (select 1 from quality.rbi_inspection_items where id = %L and comment = ''m53'')', r.id)));
    end loop;
    for r in select id from quality.rbi_tasks where id like '%-m53' loop
      insert into public.t053 values (p_phase, u.k, 'задача', r.id, 'видит', pg_temp.sees(u.id, 'rbi_tasks', r.id));
      insert into public.t053 select p_phase, u.k, 'задача', r.id, x.op,
          pg_temp.try(u.id, format('update quality.rbi_tasks set %s where id = %L', x.s, r.id),
                      format('select exists (select 1 from quality.rbi_tasks where id = %L and %s)', r.id, x.s))
        from (values ('править', 'title = ''m53-новый'''), ('выполнить', 'status = ''done'''),
                     ('переназначить', format('assigned_to_auth_user_id = %L', adm)), ('пометить удалённой', 'is_deleted = true')) x(op, s);
      insert into public.t053 values (p_phase, u.k, 'задача', r.id, 'удалить',
        pg_temp.try(u.id, format('delete from quality.rbi_tasks where id = %L', r.id),
                    format('select not exists (select 1 from quality.rbi_tasks where id = %L)', r.id)));
    end loop;
    for r in select id from quality.construction_defects_v2 where id like '%-m53' loop
      insert into public.t053 values (p_phase, u.k, 'замечание СК', r.id, 'видит', pg_temp.sees(u.id, 'construction_defects_v2', r.id));
    end loop;
    for r in select id from quality.shared_etalons where id like '%-m53' loop
      insert into public.t053 values (p_phase, u.k, 'эталон', r.id, 'видит', pg_temp.sees(u.id, 'shared_etalons', r.id));
      insert into public.t053 values (p_phase, u.k, 'эталон', r.id, 'править',
        pg_temp.try(u.id, format('update quality.shared_etalons set data = ''{"m": 53}'' where id = %L', r.id),
                    format('select exists (select 1 from quality.shared_etalons where id = %L and data = ''{"m": 53}'')', r.id)));
    end loop;
  end loop;
end $f$;

do $$
declare
  ca uuid := gen_random_uuid(); f1 uuid := gen_random_uuid(); cont uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid();
  uadm uuid := gen_random_uuid(); r_adm uuid; s1loc uuid; po1 text; po2 text; n_o1 text; n_o2 text;
  r_eng uuid; r_view uuid; r_mix uuid; r record; u uuid; ueng uuid; unoobj uuid; upart uuid; uadmin uuid;
begin
  perform set_config('m53.ca', ca::text, false);
  perform set_config('m53.cont', cont::text, false);  -- записи Качества РБИ — в проекте-контейнере (project_code)
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 053', true);
  insert into core.company_modules(company_id, module, enabled)
    select ca, m, true from unnest(array['quality', 'construction', 'planfact']) m on conflict (company_id, module) do update set enabled = true;
  insert into core.projects(id, company_id, name, quality_container) values (cont, ca, 'Контейнер 053', true);
  perform set_config('request.headers', json_build_object('x-company-id', ca)::text, false);
  insert into core.counterparties(id, company_id, name, inn, kinds) values (f1, ca, 'ООО Ромашка 053', '7700000531', array['contractor']);
  -- два объекта ядра с местами; объекты Качества и узлы — сервер (039b / 048)
  insert into auth.users(id, email) values (uadm, uadm || '@test.invalid');
  insert into core.company_members(company_id, user_id) values (ca, uadm);
  insert into core.company_roles(company_id, name) values (ca, 'Админ мест 053') returning id into r_adm;
  insert into core.company_role_permissions(role_id, company_id, action) values (r_adm, ca, 'planfact.projects.manage');
  insert into core.role_assignments(company_id, user_id, role_id) values (ca, uadm, r_adm);
  perform pg_temp.as_user(uadm);
  perform public.pf_save_project(ca, p1, '{"name": "ЖК-1 053"}');
  perform public.pf_save_project(ca, p2, '{"name": "ЖК-2 053"}');
  perform public.pf_save_place(p1, k1, null, 'object', 'Корпус 1', 'building');
  perform public.pf_save_place(p2, k2, null, 'object', 'Корпус 1', 'building');
  perform public.pf_fill_object(k1, 2, 1, 1);
  reset role;
  select l.id into s1loc from core.locations l where l.parent_id = k1 and l.name = 'Секция 1';
  select po.id into po1 from quality.project_objects po where po.core_company_id = ca and po.core_object_id = p1;
  select po.id into po2 from quality.project_objects po where po.core_company_id = ca and po.core_object_id = p2;
  select n.id into n_o1 from quality.location_nodes n where n.core_company_id = ca and n."nodeType" = 'object' and quality.node_root_project(n) = p1;
  select n.id into n_o2 from quality.location_nodes n where n.core_company_id = ca and n."nodeType" = 'object' and quality.node_root_project(n) = p2;
  if s1loc is null or po1 is null or po2 is null or n_o1 is null or n_o2 is null then raise exception 'засев 053: нет мест / объектов Качества'; end if;

  -- роли: шаблоны компании (создаются с компанией) и свои — как «Инженер СК» РБИ (Качество + Стройконтроль)
  insert into core.company_roles(company_id, name) values (ca, 'Инженер СК 053') returning id into r_eng;
  insert into core.company_roles(company_id, name) values (ca, 'Просмотр 053') returning id into r_view;
  insert into core.company_roles(company_id, name) values (ca, 'Прораб + Качество 053') returning id into r_mix;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_eng, ca, a from unnest(array['quality.view', 'quality.edit', 'quality.ai', 'construction.view', 'construction.edit',
                                        'construction.defects.view', 'construction.defects.create']) a
  union all select r_view, ca, 'quality.view'
  union all select r_mix, ca, a from unnest(array['planfact.fact.view', 'quality.view', 'quality.edit']) a;

  create table public.t053_users(k text primary key, id uuid not null);
  for r in select * from (values
      ('руководитель', 'company_admin', null::uuid, null::uuid, null::uuid, null::text[], null::uuid),
      ('директор', 'management', null, null, null, null, null),
      ('просмотр компании', 'pto', null, null, null, null, null),
      ('подрядчик F1', 'contractor_rep', null, null, null, null, f1),
      ('инженер ЖК-1', null, r_eng, null, null, array[po1], null),
      ('инженер ЖК-1 и ЖК-2', null, r_eng, null, null, array[po1, po2], null),
      ('инженер без объектов', null, r_eng, null, null, null, null),
      ('просмотр ЖК-1', null, r_view, null, null, array[po1], null),
      ('прораб + Качество ЖК-1', null, r_mix, p1, null, array[po1], null),
      ('прораб + Качество секция 1', null, r_mix, p1, s1loc, array[po1], null)) v(k, tpl, role, proj, loc, objs, cp) loop
    u := gen_random_uuid();
    insert into auth.users(id, email) values (u, u || '@test.invalid');
    insert into core.company_members(company_id, user_id) values (ca, u);
    insert into core.role_assignments(company_id, user_id, role_id, project_id, location_id, quality_objects, counterparty_id)
      values (ca, u, coalesce(r.role, (select id from core.company_roles where company_id = ca and template_code = r.tpl)),
              r.proj, r.loc, r.objs, r.cp);
    insert into public.t053_users values (r.k, u);
  end loop;
  select id into uadmin from public.t053_users where k = 'руководитель';
  select id into ueng from public.t053_users where k = 'инженер ЖК-1';
  select id into unoobj from public.t053_users where k = 'инженер без объектов';
  select id into upart from public.t053_users where k = 'прораб + Качество секция 1';
  perform set_config('m53.adm', uadmin::text, false);

  -- записи — сервером (объект и фирма — прямо, без распознавания по названию)
  perform set_config('request.jwt.claim.sub', '', false);  -- автор — из строки (set_author без входа не подменяет)
  perform set_config('request.jwt.claims', '', false);
  perform set_config('quality.object_bind', '1', false);
  insert into quality.rbi_inspections(id, core_company_id, project_code, core_object_id, core_created_by, core_counterparty_id, template_title) values
    ('i1-m53', ca, cont::text, p1, ueng, f1, 'т'), ('i2-m53', ca, cont::text, p1, unoobj, null, 'т'), ('i3-m53', ca, cont::text, p2, uadmin, null, 'т'),
    ('i4-m53', ca, cont::text, null, ueng, null, 'т'), ('i5-m53', ca, cont::text, p1, upart, null, 'т');
  insert into quality.rbi_inspection_items(id, inspection_id, project_code, item_id, core_company_id, core_created_by, core_object_id) values
    ('it1-m53', 'i1-m53', cont::text, 'п1', ca, ueng, p1);
  insert into quality.rbi_tasks(id, core_company_id, project_code, core_object_id, core_created_by, assigned_to_auth_user_id, core_counterparty_id, title, status) values
    ('t1-m53', ca, cont::text, p1, uadmin, ueng, null, 'т', 'pending'), ('t2-m53', ca, cont::text, p1, ueng, null, null, 'т', 'pending'),
    ('t3-m53', ca, cont::text, p2, uadmin, unoobj, null, 'т', 'pending'), ('t4-m53', ca, cont::text, p2, uadmin, null, f1, 'т', 'pending');
  perform set_config('quality.object_bind', '', false);
  insert into quality.construction_defects_v2(id, core_company_id, core_created_by, "locationId", status, text, history) values
    ('d1-m53', ca, uadmin, n_o1, 'issued', 'т', '[]'), ('d2-m53', ca, uadmin, n_o2, 'issued', 'т', '[]');
  insert into quality.shared_etalons(id, core_company_id, project_code, data) values ('e1-m53', ca, cont::text, '{}');
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

select pg_temp.capture('до');
select phase, count(*) n, count(*) filter (where ok) yes from public.t053 group by phase;
