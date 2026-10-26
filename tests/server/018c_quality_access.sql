-- P2-0016: права экрана Качества (018c). Всё откатывается; отчёт — ERROR P0001 с «FAIL всего: N». Запуск: после 018c.
create or replace function pg_temp.as_user(u uuid, company uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.acc(p uuid) returns jsonb language plpgsql as $f$
declare j jsonb;
begin execute 'select quality.my_access($1)' into j using p; return j;
exception when others then return jsonb_build_object('error', sqlstate); end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;

do $$
declare
  ua uuid := gen_random_uuid(); ufor uuid := gen_random_uuid(); ucon uuid := gen_random_uuid(); ueco uuid := gen_random_uuid();
  ub uuid := gen_random_uuid(); ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
  pa uuid := gen_random_uuid(); pa2 uuid := gen_random_uuid(); j jsonb; res text := '';
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[ua, ufor, ucon, ueco, ub]) u;
  insert into core.companies(id, name, is_test) values (ca, 'Альфа 018c', true), (cb, 'Бета 018c', true);
  insert into core.company_members(company_id, user_id) values (ca, ua), (ca, ufor), (ca, ucon), (ca, ueco), (cb, ub);
  insert into core.projects(id, company_id, name) values (pa, ca, 'Спутник'), (pa2, ca, 'Второй');
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[ca, cb]) c, unnest(array['quality', 'construction']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.role_assignments(company_id, user_id, role_id, project_id) values
    (ca, ua,   (select id from core.company_roles where company_id = ca and template_code = 'company_admin'), null),
    (ca, ufor, (select id from core.company_roles where company_id = ca and template_code = 'foreman'), pa),
    (ca, ucon, (select id from core.company_roles where company_id = ca and template_code = 'contractor_rep'), null),
    (ca, ueco, (select id from core.company_roles where company_id = ca and template_code = 'economist'), null),
    (cb, ub,   (select id from core.company_roles where company_id = cb and template_code = 'company_admin'), null);

  perform pg_temp.as_user(ua, ca); j := pg_temp.acc(null);
  -- после 020: + quality.scope.company у админа; прораб — только просмотр
  -- после 033c: + справочник объектов и дерево локаций у админа (quality.objects.manage, construction.objects.manage) — вычитаются;
  -- после 034: + ИИ-помощник (quality.ai) — вычитается
  res := res || pg_temp.t((j -> 'actions') - 'quality.objects.manage' - 'construction.objects.manage' - 'quality.ai' = case
      when to_regprocedure('quality.row_visible(uuid,uuid,text[],text,uuid,uuid,text,text)') is not null then '["construction.edit", "construction.manage", "construction.view", "quality.edit", "quality.manage", "quality.scope.company", "quality.view"]'::jsonb
      else '["construction.edit", "construction.manage", "construction.view", "quality.edit", "quality.manage", "quality.view"]' end
    and j -> 'templates' = '["company_admin"]' and j ->> 'company_id' = ca::text, 'админ: все 6 действий, шаблон company_admin: ' || j::text);
  perform pg_temp.as_user(ufor, ca);
  j := pg_temp.acc(pa);
  res := res || pg_temp.t(j -> 'actions' = case when to_regprocedure('quality.row_visible(uuid,uuid,text[],text,uuid,uuid,text,text)') is not null then '["construction.view", "quality.view"]'::jsonb
      else '["construction.edit", "construction.view", "quality.view"]' end, 'прораб на своём объекте: ' || j::text);
  j := pg_temp.acc(pa2);
  res := res || pg_temp.t(j -> 'actions' = '[]' and j -> 'templates' = '[]', 'прораб на чужом объекте — ничего: ' || j::text);
  perform pg_temp.as_user(ucon, ca); j := pg_temp.acc(pa);
  res := res || pg_temp.t(j -> 'templates' = '["contractor_rep"]' and not (j -> 'actions') ? 'quality.edit', 'подрядчик: шаблон contractor_rep, без quality.edit: ' || j::text);
  perform pg_temp.as_user(ueco, ca); j := pg_temp.acc(null);
  res := res || pg_temp.t(j -> 'actions' = '[]', 'экономист — без действий Качества: ' || j::text);
  perform pg_temp.as_user(ub, ca); j := pg_temp.acc(null);
  res := res || pg_temp.t(j -> 'actions' = '[]' and j -> 'company_id' = 'null', 'Бета с заголовком Альфы — ничего: ' || j::text);
  perform pg_temp.as_user(ua, null); j := pg_temp.acc(null);
  res := res || pg_temp.t(j -> 'actions' = '[]', 'без текущей компании — ничего: ' || j::text);
  reset role; update core.company_modules set enabled = false where company_id = ca and module = 'quality';
  perform pg_temp.as_user(ua, ca); j := pg_temp.acc(null);
  res := res || pg_temp.t((j -> 'actions') - 'construction.objects.manage' = '["construction.edit", "construction.manage", "construction.view"]',
                          'Качество выключено — только Стройконтроль: ' || j::text);
  perform pg_temp.as_user(null, ca); j := pg_temp.acc(null);
  res := res || pg_temp.t(j ? 'error', 'anon — отказ: ' || j::text);
  reset role;
  raise exception E'ОТЧЁТ (откат):\n%\nFAIL всего: %', res, (length(res) - length(replace(res, 'FAIL', ''))) / 4;
end $$;
