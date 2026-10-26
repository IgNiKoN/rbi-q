-- P2-0004 этап 4: суммы, журнал, неизменяемость. Всё откатывается; отчёт приходит как ERROR P0001.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
do $$
declare
  uadm uuid := gen_random_uuid(); upto uuid := gen_random_uuid(); ufor uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); pa uuid := gen_random_uuid();
  r_adm uuid; r_pto uuid; r_for uuid; n int; v numeric; t text; res text := '';
begin
  insert into auth.users(id, email) select u, u||'@test.invalid' from unnest(array[uadm,upto,ufor]) u;
  insert into core.companies(id, name, is_test) values (ca,'Альфа',true);
  insert into core.company_members(company_id, user_id) values (ca,uadm),(ca,upto),(ca,ufor);
  insert into core.projects(id, company_id, name) values (pa,ca,'Проект А');
  select id into r_adm from core.company_roles where company_id=ca and template_code='company_admin';
  select id into r_pto from core.company_roles where company_id=ca and template_code='pto';
  select id into r_for from core.company_roles where company_id=ca and template_code='foreman';
  insert into core.role_assignments(company_id,user_id,role_id,project_id) values (ca,uadm,r_adm,null),(ca,upto,r_pto,pa),(ca,ufor,r_for,pa);
  insert into planfact.works(company_id,project_id,name,created_by,plan_amount) values (ca,pa,'Работа А',upto,1000);

  select count(*) into n from core.audit_log where project_id=pa and action='INSERT';
  res := res || format(E'1 вставка записана в журнал (1): %s\n', n);

  reset role; perform pg_temp.as_user(upto);
  select plan_amount into v from public.pf_list_works(pa) limit 1; res := res || format(E'2 ПТО видит сумму (1000): %s\n', v);
  perform public.pf_add_work(pa, 'Работа ПТО');
  select count(*) into n from public.pf_list_audit(pa); res := res || format(E'3 ПТО читает журнал (0, нет audit.view): %s\n', n);
  begin select count(*) into n from core.audit_log; res := res || format(E'4 ПТО прямой select журнала (0): %s\n', n);
  exception when others then res := res || E'4 OK ' || sqlerrm || E'\n'; end;
  begin select plan_amount into v from planfact.works limit 1; res := res || E'5 FAIL прямое чтение суммы\n';
  exception when others then res := res || E'5 OK прямое чтение колонки суммы запрещено\n'; end;
  begin update core.audit_log set action='X'; res := res || E'6 FAIL правка журнала\n';
  exception when others then res := res || E'6 OK правка журнала запрещена\n'; end;
  begin delete from core.audit_log; res := res || E'7 FAIL удаление журнала\n';
  exception when others then res := res || E'7 OK удаление журнала запрещено\n'; end;

  reset role; perform pg_temp.as_user(ufor);
  select count(*) into n from public.pf_list_works(pa) where plan_amount is not null; res := res || format(E'8 прораб видит сумм (0): %s\n', n);
  select count(*) into n from public.pf_list_works(pa); res := res || format(E'9 прораб видит работ (2): %s\n', n);

  reset role; perform pg_temp.as_user(uadm);
  select count(*) into n from public.pf_list_audit(pa); res := res || format(E'10 админ видит записей журнала (2: Работа А и Работа ПТО): %s\n', n);
  select actor_email into t from public.pf_list_audit(pa) limit 1; res := res || format(E'11 автор в журнале (%s): %s\n', upto||'@test.invalid', t);
  select count(*) into n from public.pf_list_audit(pa) where (new_data ? 'plan_amount'); res := res || format(E'12 суммы в журнале у админа без money.view (0): %s\n', n);

  reset role;
  begin delete from core.audit_log; res := res || E'13 FAIL владелец удалил журнал\n';
  exception when others then res := res || E'13 OK даже владелец не удаляет журнал: ' || sqlerrm || E'\n'; end;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res,'FAIL','')))/4;
end $$;
