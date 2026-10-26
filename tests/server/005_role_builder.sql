-- P2-0004b этап 1: тесты конструктора ролей (правила защиты §3 п.2, аудит, журнал). Всё откатывается; отчёт — ERROR P0001.
-- Запуск: после 005_up.sql (или вставить 005_up.sql перед этим файлом в одно окно SQL Editor — откатится вместе с тестом).
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); uadm2 uuid := gen_random_uuid(); upto uuid := gen_random_uuid();
  ufor uuid := gen_random_uuid(); ubadm uuid := gen_random_uuid(); uout uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  r_adm uuid; r_pto uuid; r_for uuid; r_badm uuid; r_bpto uuid; r_new uuid; r_adm2 uuid;
  a_adm uuid; a_new uuid; a_adm2 uuid;
  n int; b boolean; t text; arr text[]; res text := '';
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,uadm2,upto,ufor,ubadm,uout]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true),(cb,'Бета',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,uadm2),(ca,upto),(ca,ufor),(cb,ubadm),(cb,uout);
  insert into core.projects(id, company_id, name) values (pa,ca,'Проект А'),(pb,cb,'Проект Б');
  select id into r_adm from core.company_roles where company_id=ca and template_code='company_admin';
  select id into r_pto from core.company_roles where company_id=ca and template_code='pto';
  select id into r_for from core.company_roles where company_id=ca and template_code='foreman';
  select id into r_badm from core.company_roles where company_id=cb and template_code='company_admin';
  select id into r_bpto from core.company_roles where company_id=cb and template_code='pto';
  insert into core.role_assignments(company_id,user_id,role_id,project_id) values
    (ca,upto,r_pto,pa),(ca,ufor,r_for,pa),(cb,ubadm,r_badm,null);
  insert into core.role_assignments(company_id,user_id,role_id,project_id) values (ca,uadm,r_adm,null) returning id into a_adm;

  -- Администратор Альфы
  reset role; perform pg_temp.as_user(uadm);
  select count(*) into n from public.pf_my_admin_companies(); res := res || format(E'1 админ видит компаний для управления (1): %s\n', n);
  select count(*) into n from public.pf_list_company_roles(ca); res := res || format(E'2 ролей в списке (9): %s\n', n);
  select count(*) into n from public.pf_permission_catalog(); res := res || format(E'3 действий в каталоге (19): %s\n', n);
  begin r_new := public.pf_create_role(r_for, '  Старший прораб '); res := res || E'4 OK копия шаблона создана\n';
  exception when others then res := res || E'4 FAIL ' || sqlerrm || E'\n'; end;
  select actions into arr from public.pf_list_company_roles(ca) where id = r_new;
  select name into t from core.company_roles where id = r_new;
  res := res || format(E'5 копия: название «%s», действий как у прораба (%s): %s\n', t,
    (select count(*) from core.company_role_permissions where role_id=r_for), coalesce(array_length(arr,1),0));
  begin perform public.pf_create_role(r_pto, 'старший ПРОРАБ'); res := res || E'6 FAIL дубль названия\n';
  exception when others then res := res || E'6 OK дубль названия отклонён: ' || sqlerrm || E'\n'; end;
  begin perform public.pf_rename_role(r_for, 'Прораб 2'); res := res || E'7 FAIL шаблон переименован\n';
  exception when others then res := res || E'7 OK шаблон не переименовать: ' || sqlerrm || E'\n'; end;
  begin perform public.pf_set_role_actions(r_for, array['planfact.works.view']); res := res || E'8 FAIL действия шаблона изменены\n';
  exception when others then res := res || E'8 OK действия шаблона не меняются\n'; end;
  begin perform public.pf_delete_role(r_for); res := res || E'9 FAIL шаблон удалён\n';
  exception when others then res := res || E'9 OK шаблон не удалить\n'; end;
  begin perform public.pf_set_role_actions(r_new, array['planfact.works.view','planfact.no.such']); res := res || E'10 FAIL неизвестное действие принято\n';
  exception when others then res := res || E'10 OK неизвестное действие: ' || sqlerrm || E'\n'; end;
  begin perform public.pf_set_role_actions(r_new, arr || array['planfact.works.edit']); res := res || E'11 OK админ отметил works.edit (решение владельца: любое действие каталога)\n';
  exception when others then res := res || E'11 FAIL ' || sqlerrm || E'\n'; end;
  begin perform public.pf_rename_role(r_new, 'Старший прораб (Альфа)'); res := res || E'12 OK своя роль переименована\n';
  exception when others then res := res || E'12 FAIL ' || sqlerrm || E'\n'; end;
  begin perform public.pf_assign_role(uadm, r_new, pa); res := res || E'13 FAIL самоназначение\n';
  exception when others then res := res || E'13 OK самоназначение запрещено\n'; end;
  begin perform public.pf_assign_role(ufor, r_new, pb); res := res || E'14 FAIL проект Беты в назначении Альфы\n';
  exception when others then res := res || E'14 OK подмена проекта: ' || sqlerrm || E'\n'; end;
  begin perform public.pf_assign_role(uout, r_new, pa); res := res || E'15 FAIL назначен человек не из компании\n';
  exception when others then res := res || E'15 OK чужой сотрудник: ' || sqlerrm || E'\n'; end;
  begin perform public.pf_assign_role(ufor, r_new, pa, now() - interval '1 day'); res := res || E'16 FAIL срок в прошлом принят\n';
  exception when others then res := res || E'16 OK срок в прошлом: ' || sqlerrm || E'\n'; end;
  begin perform public.pf_create_role(r_bpto, 'Копия чужой'); res := res || E'17 FAIL копия роли Беты\n';
  exception when others then res := res || E'17 OK роль чужой компании не копируется\n'; end;
  begin a_new := public.pf_assign_role(ufor, r_new, pa); res := res || E'18 OK назначено прорабу на проект\n';
  exception when others then res := res || E'18 FAIL ' || sqlerrm || E'\n'; end;
  begin perform public.pf_assign_role(ufor, r_new, pa); res := res || E'19 FAIL дубль назначения\n';
  exception when others then res := res || E'19 OK дубль назначения отклонён\n'; end;
  select count(*) into n from public.pf_list_company_members(ca) where assignment_id = a_new and email like '%@test.invalid';
  res := res || format(E'20 назначение в списке сотрудников с почтой (1): %s\n', n);
  begin perform public.pf_delete_role(r_new); res := res || E'21 FAIL удалена роль с назначением\n';
  exception when others then res := res || E'21 OK роль с назначением не удалить: ' || sqlerrm || E'\n'; end;
  begin perform public.pf_revoke_assignment(a_adm); res := res || E'22 FAIL отозван последний админ\n';
  exception when others then res := res || E'22 OK последнего админа не отозвать: ' || sqlerrm || E'\n'; end;

  -- Права «живые»: прораб получает действие со следующего запроса
  reset role; perform pg_temp.as_user(ufor);
  select 'planfact.works.edit' = any(public.pf_my_permissions(pa)) into b; res := res || format(E'23 прораб: works.edit сразу в pf_my_permissions (true): %s\n', b);
  begin perform public.pf_add_work(pa,'Работа старшего прораба'); res := res || E'24 OK прораб добавил работу\n';
  exception when others then res := res || E'24 FAIL ' || sqlerrm || E'\n'; end;
  begin perform public.pf_list_company_roles(ca); res := res || E'25 FAIL прораб читает роли компании\n';
  exception when others then res := res || E'25 OK прораб не управляет ролями\n'; end;
  begin perform public.pf_set_role_actions(r_new, array['security.roles.assign']); res := res || E'26 FAIL прораб изменил роль\n';
  exception when others then res := res || E'26 OK прораб не меняет роли\n'; end;

  -- ПТО без security.roles.assign
  reset role; perform pg_temp.as_user(upto);
  select count(*) into n from public.pf_my_admin_companies(); res := res || format(E'27 ПТО: компаний для управления (0): %s\n', n);
  begin perform public.pf_create_role(r_for, 'ПТО-роль'); res := res || E'28 FAIL ПТО создал роль\n';
  exception when others then res := res || E'28 OK ПТО не создаёт роли\n'; end;
  begin perform public.pf_list_company_members(ca); res := res || E'29 FAIL ПТО читает сотрудников\n';
  exception when others then res := res || E'29 OK ПТО не видит сотрудников\n'; end;
  begin insert into core.company_role_permissions(role_id, company_id, action) values (r_pto, ca, 'security.roles.assign'); res := res || E'30 FAIL прямая запись действия роли\n';
  exception when others then res := res || E'30 OK прямая запись действия роли запрещена\n'; end;
  begin select count(*) into n from core.audit_log; res := res || E'31 FAIL прямой SELECT журнала\n';
  exception when others then res := res || E'31 OK прямой SELECT журнала закрыт\n'; end;

  -- Админ Беты против Альфы
  reset role; perform pg_temp.as_user(ubadm);
  begin perform public.pf_rename_role(r_new, 'взлом'); res := res || E'32 FAIL админ Беты переименовал роль Альфы\n';
  exception when others then res := res || E'32 OK админ Беты: переименование отклонено\n'; end;
  begin perform public.pf_set_role_actions(r_new, '{}'); res := res || E'33 FAIL админ Беты изменил роль Альфы\n';
  exception when others then res := res || E'33 OK админ Беты: действия отклонены\n'; end;
  begin perform public.pf_revoke_assignment(a_new); res := res || E'34 FAIL админ Беты отозвал назначение Альфы\n';
  exception when others then res := res || E'34 OK админ Беты: отзыв отклонён\n'; end;
  begin perform public.pf_list_company_audit(ca); res := res || E'35 FAIL админ Беты читает журнал Альфы\n';
  exception when others then res := res || E'35 OK админ Беты: журнал Альфы закрыт\n'; end;

  -- Второй админ: копия «Администратор компании», последний админ при смене действий
  reset role; perform pg_temp.as_user(uadm);
  r_adm2 := public.pf_create_role(r_adm, 'Администратор-2');
  a_adm2 := public.pf_assign_role(uadm2, r_adm2, null);
  begin perform public.pf_revoke_assignment(a_adm); res := res || E'36 OK при втором админе своё назначение отзывается\n';
  exception when others then res := res || E'36 FAIL ' || sqlerrm || E'\n'; end;
  reset role; perform pg_temp.as_user(uadm2);
  begin perform public.pf_set_role_actions(r_adm2, array['planfact.works.view']); res := res || E'37 FAIL снято последнее право назначать роли\n';
  exception when others then res := res || E'37 OK нельзя снять security.roles.assign у последнего админа\n'; end;
  begin perform public.pf_revoke_assignment(a_adm2); res := res || E'38 FAIL отозван последний админ\n';
  exception when others then res := res || E'38 OK последний админ не отзывается\n'; end;

  -- Отзыв: право пропадает; удаление роли; журнал
  begin perform public.pf_revoke_assignment(a_new); res := res || E'39 OK назначение прорабу отозвано\n';
  exception when others then res := res || E'39 FAIL ' || sqlerrm || E'\n'; end;
  reset role; perform pg_temp.as_user(ufor);
  select 'planfact.works.edit' = any(public.pf_my_permissions(pa)) into b; res := res || format(E'40 после отзыва works.edit (false): %s\n', b);
  begin perform public.pf_add_work(pa,'после отзыва'); res := res || E'41 FAIL после отзыва добавил работу\n';
  exception when others then res := res || E'41 OK после отзыва запрос отклонён\n'; end;
  reset role; perform pg_temp.as_user(uadm2);
  begin perform public.pf_delete_role(r_new); res := res || E'42 OK роль без назначений удалена\n';
  exception when others then res := res || E'42 FAIL ' || sqlerrm || E'\n'; end;
  select count(*) into n from public.pf_list_company_audit(ca, 200);
  res := res || format(E'43 записей журнала по ролям/назначениям (≥9): %s\n', n);
  select string_agg(distinct action, ',' order by action) into t from public.pf_list_company_audit(ca, 200);
  res := res || format(E'44 виды событий (ASSIGN,REVOKE,ROLE_ACTIONS,ROLE_CREATE,ROLE_DELETE,ROLE_RENAME): %s\n', t);
  select count(*) into n from public.pf_list_company_audit(ca, 200) where actor_email = uadm||'@test.invalid' and action='ASSIGN' and subject_email = ufor||'@test.invalid';
  res := res || format(E'45 журнал: кто назначил и кому (1): %s\n', n);
  select count(*) into n from public.pf_list_audit(pa, 200); res := res || format(E'46 журнал проекта: только работы (1 — «Работа старшего прораба»): %s\n', n);

  -- anon
  reset role; perform set_config('request.jwt.claims','',true); execute 'set local role anon';
  begin perform public.pf_create_role(r_for, 'anon'); res := res || E'47 FAIL anon создал роль\n';
  exception when others then res := res || E'47 OK anon отклонён\n'; end;
  begin perform public.pf_permission_catalog(); res := res || E'48 FAIL anon читает каталог\n';
  exception when others then res := res || E'48 OK anon: каталог закрыт\n'; end;
  reset role;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res,'FAIL','')))/4;
end $$;
