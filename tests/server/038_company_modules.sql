-- P2-0031 (038): выключатели модулей компании. Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N». Запуск: после 038_company_modules_up.sql.
-- Пользователи и компании — тестовые (@test.invalid, is_test). Альфа: Качество + Стройконтроль + План/Факт; Бета: только Качество.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', '{}', true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
-- модули компании c, доступные пользователю u (ответ pf_my_platform от его имени), через запятую
create or replace function pg_temp.mods(u uuid, c uuid) returns text language plpgsql as $f$
declare v text;
begin
  perform pg_temp.as_user(u);
  select string_agg(m, ',' order by m) into v
    from jsonb_array_elements(public.pf_my_platform() -> 'companies') x, jsonb_array_elements_text(x -> 'modules') m
   where x ->> 'id' = c::text;
  reset role;
  return coalesce(v, '');
exception when others then reset role; return 'ERR:' || sqlstate;
end $f$;
create or replace function pg_temp.set_mod(u uuid, c uuid, m text, e boolean) returns text language plpgsql as $f$
begin
  perform pg_temp.as_user(u);
  perform public.pf_platform_set_module(c, m, e);
  reset role;
  return 'OK';
exception when others then reset role; return sqlstate;
end $f$;

do $$
declare
  uadm uuid := gen_random_uuid(); uview uuid := gen_random_uuid(); ucus uuid := gen_random_uuid(); upf uuid := gen_random_uuid();
  ub uuid := gen_random_uuid(); upa uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); cn uuid := gen_random_uuid();
  r_adm uuid; r_view uuid; r_cus uuid; r_pf uuid; r_b uuid; res text := '';
begin
  -- 0. После 038: каталог и включение у существующих компаний
  res := res || pg_temp.t((select managed and access_action = 'quality.view' from core.module_catalog where code = 'knowledge'), 'knowledge — управляемый, по праву quality.view');
  res := res || pg_temp.t((select access_action is null from core.module_catalog where code = 'planfact')
                          and (select bool_and(access_action is null) from core.module_catalog where code in ('quality', 'construction')),
                          'planfact, quality, construction — по своим правам, как раньше');
  res := res || pg_temp.t(not exists (select 1 from core.company_modules q where q.module = 'quality' and q.enabled
                            and not exists (select 1 from core.company_modules k where k.company_id = q.company_id and k.module = 'knowledge' and k.enabled)),
                          'у всех компаний с Качеством База знаний включена');
  res := res || pg_temp.t((select managed and access_action = 'quality.ai' from core.module_catalog where code = 'ai'), 'ai — управляемый, по праву quality.ai');
  res := res || pg_temp.t(not exists (select 1 from core.companies c where not exists (
                            select 1 from core.company_modules m where m.company_id = c.id and m.module = 'ai' and m.enabled)),
                          'ИИ включён у всех существующих компаний');

  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[uadm, uview, ucus, upf, ub, upa]) u;
  insert into core.platform_admins(user_id) values (upa);
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 038', true), (cb, 'Бета 038', true), (cn, 'Новая 038', true);
  insert into core.company_members(company_id, user_id) select ca, u from unnest(array[uadm, uview, ucus, upf]) u union all select cb, ub;
  insert into core.company_modules(company_id, module, enabled)
    select ca, m, true from unnest(array['quality', 'construction', 'planfact', 'knowledge', 'ai']) m
    union all select cb, m, true from unnest(array['quality', 'knowledge', 'ai']) m
    on conflict (company_id, module) do update set enabled = true;
  delete from core.company_modules where company_id = cn;   -- как у новой компании без включённых модулей
  update core.company_modules set enabled = false where company_id = cb and module not in ('quality', 'knowledge', 'ai');
  insert into core.company_roles(company_id, name) values (ca, 'Админ 038') returning id into r_adm;
  insert into core.company_roles(company_id, name) values (ca, 'Наблюдатель 038') returning id into r_view;
  insert into core.company_roles(company_id, name) values (ca, 'Стройконтроль 038') returning id into r_cus;
  insert into core.company_roles(company_id, name) values (ca, 'План/Факт 038') returning id into r_pf;
  insert into core.company_roles(company_id, name) values (cb, 'Админ Б 038') returning id into r_b;
  insert into core.company_role_permissions(role_id, company_id, action)
  select r_adm, ca, a from unnest(array['quality.view', 'quality.edit', 'quality.manage', 'quality.ai', 'construction.view', 'construction.edit']) a
  union all select r_view, ca, 'quality.view'
  union all select r_cus, ca, 'construction.view'
  union all select r_pf, ca, a from unnest(array['planfact.fact.view']) a
  union all select r_b, cb, a from unnest(array['quality.view', 'quality.edit', 'quality.ai']) a;
  insert into core.role_assignments(company_id, user_id, role_id) values
    (ca, uadm, r_adm), (ca, uview, r_view), (ca, ucus, r_cus), (ca, upf, r_pf), (cb, ub, r_b);

  -- 1. Кто что видит при всём включённом
  res := res || pg_temp.t(pg_temp.mods(uadm, ca) = 'ai,construction,knowledge,quality', 'Админ: Качество, Стройконтроль, База знаний, ИИ: ' || pg_temp.mods(uadm, ca));
  res := res || pg_temp.t(pg_temp.mods(uview, ca) = 'knowledge,quality', 'с quality.view без quality.ai — База знаний есть, ИИ нет: ' || pg_temp.mods(uview, ca));
  res := res || pg_temp.t(pg_temp.mods(ucus, ca) = 'construction', 'без прав Качества — Базы знаний нет: ' || pg_temp.mods(ucus, ca));
  res := res || pg_temp.t(pg_temp.mods(upf, ca) = 'planfact', 'План/Факт — как раньше: ' || pg_temp.mods(upf, ca));
  res := res || pg_temp.t(pg_temp.mods(upa, ca) = 'ai,construction,knowledge,planfact,quality', 'админ платформы — все включённые: ' || pg_temp.mods(upa, ca));
  res := res || pg_temp.t(pg_temp.mods(null, ca) = 'ERR:42501', 'anon — отказ');

  -- 2. Выключатель «База знаний» — только админ платформы; только у этой компании
  res := res || pg_temp.t(pg_temp.set_mod(uadm, ca, 'knowledge', false) = '42501', 'админ компании не выключает модуль');
  res := res || pg_temp.t(pg_temp.set_mod(upa, ca, 'knowledge', false) = 'OK', 'админ платформы выключает Базу знаний');
  res := res || pg_temp.t(pg_temp.mods(uadm, ca) = 'ai,construction,quality', 'выключена — у Альфы пропала: ' || pg_temp.mods(uadm, ca));
  res := res || pg_temp.t(pg_temp.mods(ub, cb) = 'ai,knowledge,quality', 'у Беты осталась: ' || pg_temp.mods(ub, cb));
  res := res || pg_temp.t(exists (select 1 from core.audit_log where company_id = ca and action = 'platform.module.set'
                                    and new_data ->> 'module' = 'knowledge'), 'выключение записано в журнал');
  res := res || pg_temp.t(pg_temp.set_mod(upa, ca, 'knowledge', true) = 'OK' and pg_temp.mods(uadm, ca) = 'ai,construction,knowledge,quality', 'включили — вернулась');

  -- 3. База знаний живёт в хранилище Качества: Качество выключено — Базы знаний нет (и данные закрыты сервером, 018)
  res := res || pg_temp.t(pg_temp.set_mod(upa, ca, 'quality', false) = 'OK', 'админ платформы выключает Качество');
  res := res || pg_temp.t(pg_temp.mods(uadm, ca) = 'construction', 'Качество выключено — Базы знаний и ИИ нет: ' || pg_temp.mods(uadm, ca));
  res := res || pg_temp.t(pg_temp.mods(uview, ca) = '', 'наблюдатель без Качества — ничего: ' || pg_temp.mods(uview, ca));
  res := res || pg_temp.t(pg_temp.set_mod(upa, ca, 'quality', true) = 'OK' and pg_temp.mods(uview, ca) = 'knowledge,quality', 'Качество включили — всё вернулось');

  -- 3а. Выключатель «ИИ-помощник»: у Альфы пропал, у Беты остался; право quality.can не меняется (его проверяет pf-ai вместе с модулем)
  res := res || pg_temp.t(pg_temp.set_mod(upa, ca, 'ai', false) = 'OK', 'админ платформы выключает ИИ');
  res := res || pg_temp.t(pg_temp.mods(uadm, ca) = 'construction,knowledge,quality', 'ИИ выключен — у Альфы нет: ' || pg_temp.mods(uadm, ca));
  res := res || pg_temp.t(pg_temp.mods(ub, cb) = 'ai,knowledge,quality', 'у Беты ИИ есть: ' || pg_temp.mods(ub, cb));
  res := res || pg_temp.t(pg_temp.set_mod(upa, ca, 'ai', true) = 'OK' and pg_temp.mods(uadm, ca) = 'ai,construction,knowledge,quality', 'ИИ включили — вернулся');

  -- 4. Новая компания: модулей нет, пока не включат
  res := res || pg_temp.t(pg_temp.mods(upa, cn) = '', 'новая компания — без модулей');
  res := res || pg_temp.t(pg_temp.set_mod(upa, cn, 'knowledge', true) = 'OK' and pg_temp.mods(upa, cn) = '', 'База знаний без Качества — не появляется');
  res := res || pg_temp.t(pg_temp.set_mod(upa, cn, 'ai', true) = 'OK' and pg_temp.mods(upa, cn) = '', 'ИИ без Качества — не появляется');

  reset role;
  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
