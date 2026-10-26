-- P2-0034: право quality.ai (034). Запуск: миграции до 033c → 034_quality_ai_seed.pglite.sql → 034_quality_ai_up.sql → этот файл.
-- Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N».
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
-- то, что вызывает функция pf-ai: quality.can(компания, null, {quality.ai}) от имени пользователя с заголовком компании
create or replace function pg_temp.ai(u uuid, company uuid, hdr uuid) returns boolean language plpgsql as $f$
declare v boolean;
begin
  perform pg_temp.as_user(u, hdr);
  begin v := quality.can(company, null, array['quality.ai']); exception when others then v := null; end;
  reset role;
  return v;
end $f$;

do $$
declare
  ca uuid := '03400000-0000-4000-8000-00000000000a'; cb uuid := '03400000-0000-4000-8000-00000000000b';
  udir uuid := '03400000-0000-4000-8000-000000000001'; uobs uuid := '03400000-0000-4000-8000-000000000002';
  uqc uuid := '03400000-0000-4000-8000-000000000003'; ucus uuid := '03400000-0000-4000-8000-000000000004';
  ueng uuid := '03400000-0000-4000-8000-000000000005'; ub uuid := '03400000-0000-4000-8000-000000000006';
  cn uuid := gen_random_uuid(); res text := ''; v_role uuid;
  has_ai text := 'select exists (select 1 from core.company_role_permissions p join core.company_roles r on r.id = p.role_id where r.company_id = $1 and r.name = $2 and p.action = ''quality.ai'')';
  b boolean;
begin
  res := res || pg_temp.t(exists (select 1 from core.permission_catalog where action = 'quality.ai'), 'справочник: quality.ai есть');
  res := res || pg_temp.t(exists (select 1 from core.role_template_permissions where template_code = 'qc_engineer' and action = 'quality.ai'),
                          'шаблон с quality.edit (Инженер СК) — получил');
  res := res || pg_temp.t(not exists (select 1 from core.role_template_permissions where template_code = 'customer' and action = 'quality.ai'),
                          'шаблон без quality.edit (Заказчик) — не получил');
  execute has_ai into b using ca, 'Директор';        res := res || pg_temp.t(b, 'роль РБИ «Директор» (без quality.edit) — получила');
  execute has_ai into b using ca, 'Инженер СК';      res := res || pg_temp.t(b, 'роль РБИ «Инженер СК» — получила');
  execute has_ai into b using ca, 'Наблюдатель 034'; res := res || pg_temp.t(not b, 'своя роль только с просмотром — не получила');
  res := res || pg_temp.t('quality.ai' = all (select unnest(array[quality.rbi_role_actions('director')]) intersect select 'quality.ai')
                          and 'quality.ai' = any (quality.rbi_role_actions('manager')) and 'quality.ai' = any (quality.rbi_role_actions('deputy_manager'))
                          and 'quality.ai' = any (quality.rbi_role_actions('engineer')) and 'quality.ai' = any (quality.rbi_role_actions('director')),
                          'перенос ролей РБИ выдаёт quality.ai всем четырём');

  -- проверка, которую делает pf-ai
  res := res || pg_temp.t(pg_temp.ai(udir, ca, ca) is true, 'Директор РБИ: можно');
  res := res || pg_temp.t(pg_temp.ai(ueng, ca, ca) is true, 'Инженер СК РБИ: можно');
  res := res || pg_temp.t(pg_temp.ai(uqc, ca, ca) is true, 'роль из шаблона Инженер СК: можно');
  res := res || pg_temp.t(pg_temp.ai(uobs, ca, ca) is false, 'своя роль без галочки: нельзя');
  res := res || pg_temp.t(pg_temp.ai(ucus, ca, ca) is false, 'Заказчик: нельзя');
  res := res || pg_temp.t(pg_temp.ai(ub, ca, ca) is false, 'чужая компания (заголовок чужой, не член): нельзя');
  res := res || pg_temp.t(pg_temp.ai(udir, cb, cb) is false, 'член A с заголовком B: нельзя');
  res := res || pg_temp.t(pg_temp.ai(udir, cb, ca) is false, 'компания в запросе ≠ компании заголовка: нельзя');
  res := res || pg_temp.t(coalesce(pg_temp.ai(null, ca, ca), false) is false, 'без входа: нельзя');
  res := res || pg_temp.t(pg_temp.ai(ub, cb, cb) is true, 'Бета: своя роль с quality.edit получила — можно');

  -- галочка снята в конструкторе ролей → отказ без правки приложения; поставлена обратно → можно
  select id into v_role from core.company_roles where company_id = ca and name = 'Директор';
  delete from core.company_role_permissions where role_id = v_role and action = 'quality.ai';
  res := res || pg_temp.t(pg_temp.ai(udir, ca, ca) is false, 'галочка снята: нельзя');
  insert into core.company_role_permissions(role_id, company_id, action) values (v_role, ca, 'quality.ai');
  res := res || pg_temp.t(pg_temp.ai(udir, ca, ca) is true, 'галочка поставлена: можно');
  -- модуль Качества у компании выключен → нельзя
  update core.company_modules set enabled = false where company_id = ca and module = 'quality';
  res := res || pg_temp.t(pg_temp.ai(udir, ca, ca) is false, 'модуль Качества выключен: нельзя');
  update core.company_modules set enabled = true where company_id = ca and module = 'quality';

  -- новая компания после 034: роли из шаблонов получают право как остальные права шаблона
  insert into core.companies(id, name, is_test) values (cn, 'Новая 034', true);
  res := res || pg_temp.t(
    (select count(*) from core.company_roles r where r.company_id = cn and r.template_code = 'qc_engineer'
        and exists (select 1 from core.company_role_permissions p where p.role_id = r.id and p.action = 'quality.ai'))
    = (select count(*) from core.company_roles r where r.company_id = cn and r.template_code = 'qc_engineer'),
    'новая компания: роль из шаблона с quality.edit — с quality.ai');

  -- клиент не может выдать себе право мимо конструктора ролей
  perform pg_temp.as_user(uobs, ca);
  begin
    insert into core.company_role_permissions(role_id, company_id, action)
      select id, ca, 'quality.ai' from core.company_roles where company_id = ca and name = 'Наблюдатель 034';
    res := res || 'FAIL наблюдатель выдал себе quality.ai напрямую' || E'\n';
  exception when others then null;
  end;
  reset role;

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
