-- P2-0004 этап 2: тесты прав (AUTH_AND_ACCESS §7 п.1,2,3,4,5,7,8). Всё откатывается; отчёт приходит как ERROR P0001.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid();
  ubpto uuid := gen_random_uuid(); umulti uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  r_adm uuid; r_pto uuid; r_for uuid; r_ptob uuid; r_forb uuid; a_pto uuid;
  n int; b boolean; res text := '';
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor,ubpto,umulti]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values
    (ca,uadm),(ca,upto),(ca,ufor),(ca,umulti),(cb,ubpto),(cb,umulti);
  insert into core.projects(id, company_id, name) values (pa,ca,'Проект А'),(pb,cb,'Проект Б');
  select id into r_adm from core.company_roles where company_id=ca and template_code='company_admin';
  select id into r_pto from core.company_roles where company_id=ca and template_code='pto';
  select id into r_for from core.company_roles where company_id=ca and template_code='foreman';
  select id into r_ptob from core.company_roles where company_id=cb and template_code='pto';
  select id into r_forb from core.company_roles where company_id=cb and template_code='foreman';
  insert into core.role_assignments(company_id,user_id,role_id,project_id) values
    (ca,uadm,r_adm,null),(ca,upto,r_pto,pa),(ca,ufor,r_for,pa),(cb,ubpto,r_ptob,pb),
    (ca,umulti,r_for,pa),(cb,umulti,r_ptob,pb);
  insert into planfact.works(company_id,project_id,name,created_by) values (ca,pa,'Работа А',upto),(cb,pb,'Работа Б',ubpto);

  select count(*) into n from core.company_roles where company_id=ca;
  res := res || format(E'1 ролей-шаблонов в компании (9): %s\n', n);
  select count(*) into n from core.role_templates;
  res := res || format(E'2 шаблонов (9): %s\n', n);

  -- ПТО Альфы
  reset role; perform pg_temp.as_user(upto);
  select planfact.has_permission(pa,'planfact.works.edit') into b; res := res || format(E'3 ПТО works.edit (true): %s\n', b);
  select planfact.has_permission(pa,'planfact.no.such.action') into b; res := res || format(E'4 неизвестное действие (false): %s\n', b);
  select planfact.has_permission(pb,'planfact.works.view') into b; res := res || format(E'5 ПТО Альфы works.view в проекте Беты (false): %s\n', b);
  begin perform public.pf_add_work(pa,'Работа ПТО'); res := res || E'6 OK ПТО добавил работу\n';
  exception when others then res := res || E'6 FAIL ПТО не смог добавить: ' || sqlerrm || E'\n'; end;
  begin insert into planfact.works(company_id,project_id,name,created_by) values (cb,pb,'x',upto); res := res || E'7 FAIL вставка в проект Беты\n';
  exception when others then res := res || E'7 OK вставка в чужой проект отклонена\n'; end;

  -- Прораб Альфы (мимо кнопки: прямой запрос)
  reset role; perform pg_temp.as_user(ufor);
  select count(*) into n from planfact.works; res := res || format(E'8 прораб видит работ (2: Работа А и Работа ПТО): %s\n', n);
  select planfact.has_permission(pa,'planfact.money.view') into b; res := res || format(E'9 прораб money.view (false): %s\n', b);
  begin perform public.pf_add_work(pa,'взлом прораба'); res := res || E'10 FAIL прораб добавил работу (RPC)\n';
  exception when others then res := res || E'10 OK прораб отклонён (RPC)\n'; end;
  begin insert into planfact.works(company_id,project_id,name,created_by) values (ca,pa,'x',ufor); res := res || E'11 FAIL прораб вставил напрямую\n';
  exception when others then res := res || E'11 OK прораб отклонён (прямой insert)\n'; end;
  begin insert into core.role_assignments(company_id,user_id,role_id) values (ca,ufor,r_adm); res := res || E'12 FAIL прямая запись назначения\n';
  exception when others then res := res || E'12 OK прямая запись назначения запрещена\n'; end;
  begin perform public.pf_assign_role(ufor, r_pto, pa); res := res || E'13 FAIL прораб назначил себе роль\n';
  exception when others then res := res || E'13 OK прораб не назначает роли: ' || sqlerrm || E'\n'; end;

  -- Пользователь двух компаний
  reset role; perform pg_temp.as_user(umulti);
  select planfact.has_permission(pa,'planfact.works.edit') into b; res := res || format(E'14 multi: edit в Альфе, где он прораб (false): %s\n', b);
  select planfact.has_permission(pb,'planfact.works.edit') into b; res := res || format(E'15 multi: edit в Бете, где он ПТО (true): %s\n', b);

  -- Администратор: самоназначение и чужая компания
  reset role; perform pg_temp.as_user(uadm);
  begin perform public.pf_assign_role(uadm, r_pto, null); res := res || E'16 FAIL админ назначил роль себе\n';
  exception when others then res := res || E'16 OK самоназначение запрещено: ' || sqlerrm || E'\n'; end;
  begin perform public.pf_assign_role(ufor, r_ptob, null); res := res || E'17 FAIL админ Альфы выдал роль Беты\n';
  exception when others then res := res || E'17 OK роль чужой компании выдать нельзя\n'; end;
  begin a_pto := public.pf_assign_role(ufor, r_pto, pa); res := res || E'18 OK админ назначил прорабу роль ПТО\n';
  exception when others then res := res || E'18 FAIL ' || sqlerrm || E'\n'; end;

  -- Изменение назначения действует на следующий запрос без повторного входа
  reset role; perform pg_temp.as_user(ufor);
  begin perform public.pf_add_work(pa,'Работа после назначения'); res := res || E'19 OK прораб с назначенной ролью ПТО добавил работу\n';
  exception when others then res := res || E'19 FAIL ' || sqlerrm || E'\n'; end;
  reset role; perform pg_temp.as_user(uadm);
  perform public.pf_revoke_assignment(a_pto);
  reset role; perform pg_temp.as_user(ufor);
  begin perform public.pf_add_work(pa,'после отзыва'); res := res || E'20 FAIL после отзыва добавил работу\n';
  exception when others then res := res || E'20 OK после отзыва назначения запрос отклонён\n'; end;

  -- Отзыв/срок
  reset role; update core.role_assignments set valid_to = now() - interval '1 minute' where user_id = upto;
  perform pg_temp.as_user(upto);
  select count(*) into n from planfact.works; res := res || format(E'21 истёкшее назначение: работ видно (0): %s\n', n);

  -- Модуль выключен
  reset role; update core.company_modules set enabled=false where company_id=ca;
  perform pg_temp.as_user(ufor);
  select count(*) into n from planfact.works; res := res || format(E'22 модуль выключен: работ видно (0): %s\n', n);
  select planfact.has_permission(pa,'planfact.works.view') into b; res := res || format(E'23 модуль выключен: works.view (false): %s\n', b);
  reset role; perform pg_temp.as_user(ubpto);
  select count(*) into n from planfact.works; res := res || format(E'24 другая компания продолжает работать (1): %s\n', n);

  -- anon и справочники
  reset role; perform set_config('request.jwt.claims','',true); execute 'set local role anon';
  begin perform planfact.has_permission(pa,'planfact.works.view'); res := res || E'25 FAIL anon вызвал has_permission\n';
  exception when others then res := res || E'25 OK anon отклонён\n'; end;
  reset role; perform pg_temp.as_user(ubpto);
  begin select count(*) into n from core.role_templates; res := res || E'26 FAIL чтение шаблонов\n';
  exception when others then res := res || E'26 OK шаблоны напрямую не читаются\n'; end;
  reset role;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res,'FAIL','')))/4;
end $$;
