-- P2-0013 этап 1: администратор платформы и модули компаний (ADR-064 п. 2, 6). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
-- Запуск: после 014_up.sql (регрессия — tests/server/002…013a).
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then 'OK ' || l else 'FAIL ' || l end || E'\n' $f$;

do $$
declare
  uplat uuid := gen_random_uuid(); uadm uuid := gen_random_uuid(); ufor uuid := gen_random_uuid();
  unone uuid := gen_random_uuid(); ubpto uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); cc uuid;
  pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  j jsonb; c jsonb; n int; n2 int; b boolean; s text; a1 uuid; a2 uuid; res text := '';
  e_for text;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uplat, uadm, ufor, unone, ubpto]) u;
  e_for := ufor || '@TEST.invalid';
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 014', true), (cb, 'Бета 014', true);
  insert into core.company_members(company_id, user_id) values (ca, uadm), (ca, ufor), (ca, unone), (cb, ubpto);
  insert into core.projects(id, company_id, name) values (pa, ca, 'Проект А'), (pb, cb, 'Проект Б');
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, uadm,  (select id from core.company_roles where company_id = ca and template_code = 'company_admin'), null),
    (ca, ufor,  (select id from core.company_roles where company_id = ca and template_code = 'foreman'), pa),
    (cb, ubpto, (select id from core.company_roles where company_id = cb and template_code = 'pto'), pb);
  insert into planfact.works(company_id, project_id, name, created_by) values (ca, pa, 'Работа А', ufor), (cb, pb, 'Работа Б', ubpto);
  insert into core.platform_admins(user_id) values (uplat);

  -- 1. Каталог модулей
  -- (P2-0016: после 018 Качество и Стройконтроль тоже управляемые; P2-0031, 038: и База знаний — старых модулей не осталось)
  res := res || pg_temp.t((select managed from core.module_catalog where code = 'planfact')
                          and (select managed from core.module_catalog where code = 'knowledge')
                          and not exists (select 1 from core.module_catalog where not managed), 'каталог: все модули управляемые (planfact; 018 — Качество/Стройконтроль; 038 — База знаний)');

  -- 2. Прораб: кто я
  reset role; perform pg_temp.as_user(ufor);
  j := public.pf_my_platform();
  res := res || pg_temp.t(not (j ->> 'is_platform_admin')::boolean, 'прораб: не админ платформы');
  res := res || pg_temp.t(jsonb_array_length(j -> 'companies') = 1 and (j -> 'companies' -> 0 ->> 'id')::uuid = ca, 'прораб: одна компания — своя');
  res := res || pg_temp.t(j -> 'companies' -> 0 -> 'modules' = '["planfact"]'::jsonb, 'прораб: модули = ["planfact"]');
  res := res || pg_temp.t(not (j -> 'companies' -> 0 ->> 'can_manage_company')::boolean, 'прораб: «Компания» недоступна');
  res := res || pg_temp.t(j -> 'companies' -> 0 -> 'roles' ? 'Прораб / мастер', 'прораб: роль в ответе');
  res := res || pg_temp.t((select count(*) from planfact.works) = 1, 'прораб видит только свою работу');
  res := res || pg_temp.t(not planfact.has_permission(pb, 'planfact.works.view'), 'прораб: чужой проект — нет права');

  -- 3. Администратор компании
  reset role; perform pg_temp.as_user(uadm);
  j := public.pf_my_platform();
  res := res || pg_temp.t((j -> 'companies' -> 0 ->> 'can_manage_company')::boolean, 'админ компании: «Компания» доступна');
  res := res || pg_temp.t(not (j ->> 'is_platform_admin')::boolean, 'админ компании: не админ платформы');

  -- 4. Без роли
  reset role; perform pg_temp.as_user(unone);
  j := public.pf_my_platform();
  res := res || pg_temp.t(jsonb_array_length(j -> 'companies') = 0 and not (j ->> 'is_platform_admin')::boolean, 'без роли: компаний нет');

  -- 5. Модуль выключен (владелец БД) → у прораба пусто и прав нет
  reset role; update core.company_modules set enabled = false where company_id = ca and module = 'planfact';
  perform pg_temp.as_user(ufor);
  j := public.pf_my_platform();
  res := res || pg_temp.t(j -> 'companies' -> 0 -> 'modules' = '[]'::jsonb, 'модуль выключен: модулей нет');
  res := res || pg_temp.t(not planfact.has_permission(pa, 'planfact.works.view'), 'модуль выключен: works.view = false');
  res := res || pg_temp.t(cardinality(public.pf_my_permissions(pa)) = 0, 'модуль выключен: pf_my_permissions пусто');
  res := res || pg_temp.t((select count(*) from planfact.works) = 0, 'модуль выключен: работ не видно');

  -- 6. Админ платформы: видит всё в компаниях с включённым модулем, выключенный модуль закрыт и для него
  reset role; perform pg_temp.as_user(uplat);
  j := public.pf_my_platform();
  res := res || pg_temp.t((j ->> 'is_platform_admin')::boolean, 'админ платформы: признак');
  reset role; select count(*) into n from core.companies; select count(*) into n2 from core.permission_catalog; perform pg_temp.as_user(uplat);
  res := res || pg_temp.t(jsonb_array_length(j -> 'companies') = n, 'админ платформы: все компании (' || n || ')');
  select x into c from jsonb_array_elements(j -> 'companies') x where (x ->> 'id')::uuid = cb;
  res := res || pg_temp.t(c -> 'modules' = '["planfact"]'::jsonb and (c ->> 'can_manage_company')::boolean, 'админ платформы: Бета — модуль и «Компания»');
  select x into c from jsonb_array_elements(j -> 'companies') x where (x ->> 'id')::uuid = ca;
  res := res || pg_temp.t(c -> 'modules' = '[]'::jsonb and not (c ->> 'can_manage_company')::boolean, 'админ платформы: Альфа (модуль выключен) — пусто');
  res := res || pg_temp.t(planfact.has_permission(pb, 'planfact.money.view') and planfact.is_project_member(pb)
                          and planfact.has_company_permission(cb, 'security.roles.assign') and planfact.is_company_member(cb), 'админ платформы: права в Бете');
  res := res || pg_temp.t(not planfact.has_permission(pa, 'planfact.works.view') and not planfact.is_project_member(pa), 'админ платформы: Альфа с выключенным модулем — нет права');
  res := res || pg_temp.t(not planfact.has_permission(pb, 'planfact.no.such.action'), 'админ платформы: неизвестное действие — false');
  res := res || pg_temp.t(cardinality(public.pf_my_permissions(pb)) = n2, 'админ платформы: pf_my_permissions = весь каталог');
  res := res || pg_temp.t((select count(*) from planfact.works where project_id = pb) = 1, 'админ платформы видит работу Беты');
  res := res || pg_temp.t(exists (select 1 from public.pf_my_company_access() where company_id = cb)
                          and not exists (select 1 from public.pf_my_company_access() where company_id = ca), 'админ платформы: pf_my_company_access — только с включённым модулем');
  res := res || pg_temp.t((select count(*) from core.company_roles where company_id = cb) = 9, 'админ платформы: роли Беты видны (RLS)');

  -- 7. Список компаний
  select count(*) into n2 from public.pf_platform_companies();
  res := res || pg_temp.t(n2 = n, 'pf_platform_companies: все компании');
  select modules into c from public.pf_platform_companies() where id = ca;
  res := res || pg_temp.t((select (x ->> 'enabled')::boolean = false from jsonb_array_elements(c) x where x ->> 'code' = 'planfact')
                          and (select (x ->> 'enabled')::boolean = false and (x ->> 'managed')::boolean from jsonb_array_elements(c) x where x ->> 'code' = 'knowledge'),
                          'pf_platform_companies: planfact выключен, База знаний — с выключателем (038), выключена');
  res := res || pg_temp.t((select people from public.pf_platform_companies() where id = ca) = 3, 'pf_platform_companies: людей в Альфе 3');

  -- 8. Создать компанию
  cc := public.pf_platform_create_company('  Гамма 014  ', true);
  reset role;
  res := res || pg_temp.t((select name = 'Гамма 014' and is_test from core.companies where id = cc), 'создание: название без пробелов, тестовая');
  res := res || pg_temp.t((select count(*) from core.company_roles where company_id = cc) = 9
                          and (select enabled from core.company_modules where company_id = cc and module = 'planfact'), 'создание: 9 ролей, модуль включён');
  res := res || pg_temp.t(exists (select 1 from core.audit_log where company_id = cc and action = 'platform.company.create' and actor = uplat), 'создание: журнал');
  perform pg_temp.as_user(uplat);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_platform_create_company(%L)', 'гамма 014')) like '23505%', 'создание: дубль названия — отказ');
  res := res || pg_temp.t(pg_temp.err('select public.pf_platform_create_company(''  '')') like '22023%', 'создание: пустое название — отказ');

  -- 9. Модуль: включить/выключить
  perform public.pf_platform_set_module(cc, 'planfact', false);
  reset role;
  res := res || pg_temp.t(not (select enabled from core.company_modules where company_id = cc and module = 'planfact'), 'модуль выключен функцией');
  select count(*) into n from core.audit_log where company_id = cc and action = 'platform.module.set';
  res := res || pg_temp.t(n = 1, 'модуль: журнал');
  perform pg_temp.as_user(uplat);
  perform public.pf_platform_set_module(cc, 'planfact', false);
  reset role;
  res := res || pg_temp.t((select count(*) from core.audit_log where company_id = cc and action = 'platform.module.set') = 1, 'модуль: повтор без изменений — без записи');
  perform pg_temp.as_user(uplat);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_platform_set_module(%L, ''no_such'', false)', cc)) like '22023%', 'модуль: неизвестный — отказ (старых после 038 нет)');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_platform_set_module(%L, ''nope'', true)', cc)) like '22023%', 'модуль: неизвестный — отказ');
  perform public.pf_platform_set_module(ca, 'planfact', true);
  reset role; perform pg_temp.as_user(ufor);
  res := res || pg_temp.t(public.pf_my_platform() -> 'companies' -> 0 -> 'modules' = '["planfact"]'::jsonb and planfact.has_permission(pa, 'planfact.works.view'), 'модуль включён обратно: прораб снова видит');

  -- 10. Администратор компании по почте
  reset role; perform pg_temp.as_user(uplat);
  perform public.pf_platform_set_module(cc, 'planfact', true);
  a1 := public.pf_platform_set_company_admin(cc, e_for);
  a2 := public.pf_platform_set_company_admin(cc, ' ' || lower(e_for) || ' ');
  res := res || pg_temp.t(a1 is not null and a1 = a2, 'админ компании: назначен, повтор — то же назначение');
  reset role;
  res := res || pg_temp.t((select count(*) from core.audit_log where company_id = cc and action = 'platform.company_admin.set') = 1, 'админ компании: журнал один раз');
  perform pg_temp.as_user(ufor);
  select x into c from jsonb_array_elements(public.pf_my_platform() -> 'companies') x where (x ->> 'id')::uuid = cc;
  res := res || pg_temp.t((c ->> 'can_manage_company')::boolean and c -> 'modules' = '["planfact"]'::jsonb, 'прораб стал админом Гаммы: «Компания» и модуль');
  reset role; perform pg_temp.as_user(uplat);
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_platform_set_company_admin(%L, ''nobody@test.invalid'')', cc)) like '22023%', 'админ компании: нет учётки — отказ');
  res := res || pg_temp.t(pg_temp.err(format('select public.pf_platform_set_company_admin(%L, %L)', gen_random_uuid(), e_for)) like '22023%', 'админ компании: нет компании — отказ');

  -- 11. Не-админ платформы: отказ во всех pf_platform_*, таблицы закрыты
  foreach s in array array['select public.pf_platform_companies()',
                           'select public.pf_platform_create_company(''Взлом'')',
                           format('select public.pf_platform_set_module(%L, ''planfact'', false)', ca),
                           format('select public.pf_platform_set_company_admin(%L, %L)', ca, ufor || '@test.invalid')] loop
    reset role; perform pg_temp.as_user(uadm);
    res := res || pg_temp.t(pg_temp.err(s) like '42501%', 'админ компании: отказ — ' || left(s, 50));
    reset role; perform pg_temp.as_user(ufor);
    res := res || pg_temp.t(pg_temp.err(s) like '42501%', 'прораб: отказ — ' || left(s, 50));
  end loop;
  reset role; perform pg_temp.as_user(uadm);
  res := res || pg_temp.t(pg_temp.err('select count(*) from core.platform_admins') like '42501%', 'platform_admins клиенту закрыта (чтение)');
  res := res || pg_temp.t(pg_temp.err(format('insert into core.platform_admins values (%L)', uadm)) like '42501%', 'platform_admins: самоназначение — отказ');
  res := res || pg_temp.t(pg_temp.err('select count(*) from core.module_catalog') like '42501%', 'module_catalog клиенту закрыт');
  res := res || pg_temp.t(pg_temp.err('select planfact.is_platform_admin()') like '42501%', 'is_platform_admin клиенту не вызвать');
  res := res || pg_temp.t(pg_temp.err(format('update core.company_modules set enabled = false where company_id = %L', ca)) like '42501%', 'company_modules напрямую не меняется');
  reset role;
  res := res || pg_temp.t((select enabled from core.company_modules where company_id = ca and module = 'planfact')
                          and (select count(*) from core.companies where name = 'Взлом') = 0, 'после отказов ничего не изменилось');

  -- 12. anon
  perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon';
  res := res || pg_temp.t(pg_temp.err('select public.pf_my_platform()') like '42501%', 'anon: pf_my_platform закрыт');
  res := res || pg_temp.t(pg_temp.err('select public.pf_platform_companies()') like '42501%', 'anon: pf_platform_companies закрыт');
  reset role;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res, 'FAIL', ''))) / 4;
end $$;
