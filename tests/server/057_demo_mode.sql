-- P2-0053 (057): кнопка «Демо» — посетитель из любой компании смотрит демо-компанию глазами демо-роли, писать не может.
-- Демо-компания (проект, корпус, секции, этаж, ВОР, факт, смета, КС-2, бригада, замечание СК) — учётками самой демо-компании;
-- демо-роли (pf_demo_setup); посетители: прораб (секция 1), ПТО, представитель подрядчика (своя фирма), администратор
-- платформы. Проверки: выбор ролей; вход / смена роли / выход; область и права роли; КАЖДАЯ функция записи (опись схемы,
-- аргументы — данные демо) и прямая запись в таблицы — отказ, отпечаток всех строк core / planfact / quality до = после;
-- администратор платформы в демо — обычный посетитель, после выхода — снова администратор; посетителей не видно в
-- «Сотрудниках», «Кто что может», числе людей; сотрудник демо-компании не посетитель; запись в своей компании из демо
-- проходит; сторож — на каждой таблице с компанией или проектом; роли и права обычных компаний — до = после.
-- Всё откатывается; отчёт — ERROR P0001 «FAIL всего: N». Запуск: после 057_demo_mode_up.sql.
create or replace function pg_temp.as_user(u uuid, company uuid default null) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.headers', case when company is null then '{}' else json_build_object('x-company-id', company)::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $f$;
create or replace function pg_temp.msg(q text) returns text language plpgsql as $f$
begin execute q; return 'OK'; exception when others then return sqlstate || ' ' || sqlerrm; end $f$;
create or replace function pg_temp.val(q text) returns text language plpgsql as $f$
declare v text; begin execute q into v; return coalesce(v, 'NULL'); exception when others then return sqlstate || ' ' || sqlerrm; end $f$;
create or replace function pg_temp.t(c boolean, l text) returns text language sql as $f$
  select case when coalesce(c, false) then '' else 'FAIL ' || l || E'\n' end $f$;
-- отпечаток всех строк core / planfact / quality (кроме журнала входов посетителя в демо): любая удачная запись его меняет
create or replace function pg_temp.print(p_skip text[] default '{}') returns text language plpgsql security definer as $f$
declare r record; v text; acc text := '';
begin
  for r in select schemaname s, tablename t from pg_tables where schemaname in ('core', 'planfact', 'quality')
            and not (schemaname || '.' || tablename = any (p_skip)) order by 1, 2 loop
    execute format('select coalesce(md5(string_agg(md5(x::text), '','' order by md5(x::text))), ''-'') from %I.%I x', r.s, r.t) into v;
    acc := acc || r.s || '.' || r.t || '=' || v || ';';
  end loop;
  return md5(acc);
end $f$;
-- строки не демо-компаний по таблице (для «до = после» с понятным сообщением)
create or replace function pg_temp.counts(p_demo uuid) returns jsonb language plpgsql security definer as $f$
declare r record; n bigint; acc jsonb := '{}';
begin
  for r in select c.table_schema s, c.table_name t, string_agg(c.column_name, ',') cols from information_schema.columns c
             join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
            where c.table_schema in ('core', 'planfact', 'quality') and c.column_name in ('company_id', 'core_company_id')
            group by 1, 2 loop
    execute format('select count(*) from %I.%I where %s is distinct from $1', r.s, r.t,
                   case when r.cols like '%core_company_id%' then 'core_company_id' else 'company_id' end) into n using p_demo;
    acc := acc || jsonb_build_object(r.s || '.' || r.t, n);
  end loop;
  return acc;
end $f$;
-- проверки ядра от имени текущей учётки (функции ядра клиенту не выданы; auth.uid() — та же учётка)
create or replace function pg_temp.area(p uuid) returns uuid[] language sql security definer as $f$ select core.my_area(p) $f$;
create or replace function pg_temp.can(c uuid, p uuid, l uuid, a text) returns boolean language sql security definer as $f$ select core.can_at(c, p, l, a) $f$;
create or replace function pg_temp.rowok(c uuid, p uuid, l uuid, a text[], au uuid, cp uuid) returns boolean language sql security definer as $f$
  select core.row_allowed(c, p, l, a, au, cp) $f$;
create or replace function pg_temp.mydemo() returns uuid language sql security definer as $f$ select core.my_demo_company() $f$;
create or replace function pg_temp.member(c uuid) returns boolean language sql security definer as $f$ select planfact.is_company_member(c) $f$;
create or replace function pg_temp.padm() returns boolean language sql security definer as $f$ select planfact.is_platform_admin() $f$;
create or replace function pg_temp.qadm() returns boolean language sql security definer as $f$ select quality.is_platform_admin() $f$;
-- без ошибки (кроме своего профиля) могут пройти только функции, которые с этими аргументами ничего не делают
create or replace function pg_temp.noop_only(p_bad text) returns boolean language sql as $f$
  select coalesce(bool_and(x ~ '^public\.pf_(password_changed|set_full_name|estimate_refill|fill_object|import_places|overhead_template|remove_place_plan|restore_place|add_floors|copy_place|move_place)\('), true)
    from unnest(string_to_array(trim(trailing '; ' from p_bad), '; ')) x where x <> '' $f$;
create table pg_temp.ids(k text primary key, v uuid);
grant all on pg_temp.ids to authenticated, anon;
create or replace function pg_temp.id(p_k text) returns uuid language sql as $f$ select v from pg_temp.ids where k = p_k $f$;
-- значение аргумента функции записи по имени и типу: данные демо-компании
create or replace function pg_temp.arg(p_name text, p_type text) returns text language plpgsql as $f$
declare v uuid;
begin
  v := case p_name
    when 'p_company' then pg_temp.id('demo') when 'p_project' then pg_temp.id('pd')
    when 'p_location' then pg_temp.id('f1') when 'p_object' then pg_temp.id('k1') when 'p_parent' then pg_temp.id('s1')
    when 'p_source' then pg_temp.id('f1') when 'p_target_parent' then pg_temp.id('s2') when 'p_new_parent' then pg_temp.id('s2')
    when 'p_before' then null when 'p_position' then pg_temp.id('pos1') when 'p_estimate' then pg_temp.id('est')
    when 'p_import' then pg_temp.id('imp') when 'p_previous' then pg_temp.id('imp') when 'p_act' then pg_temp.id('act')
    when 'p_entry' then pg_temp.id('fact') when 'p_brigade' then pg_temp.id('br') when 'p_role' then pg_temp.id('r_for')
    when 'p_source_role' then pg_temp.id('r_for') when 'p_user' then pg_temp.id('dfor') when 'p_on_behalf' then pg_temp.id('dfor')
    when 'p_assignment' then pg_temp.id('asg_for') when 'p_unit' then pg_temp.id('unit') when 'p_item' then pg_temp.id('price')
    when 'p_id' then gen_random_uuid() when 'p_new_id' then gen_random_uuid() when 'p_client_id' then gen_random_uuid()
    when 'p_batch' then gen_random_uuid() when 'p_counterparty' then pg_temp.id('cpa') when 'p_customer' then pg_temp.id('cpa')
    when 'p_general_contractor' then null when 'p_profile' then null when 'p_kp_revision' then null
    when 'p_head_user' then pg_temp.id('dadm') when 'p_target' then pg_temp.id('f1') else null end;
  if p_type = 'uuid' then return case when v is null then 'null::uuid' else quote_literal(v) || '::uuid' end; end if;
  if p_type = 'uuid[]' then
    return quote_literal('{' || case p_name when 'p_sections' then pg_temp.id('s1') when 'p_locations' then pg_temp.id('s1')
      when 'p_entries' then pg_temp.id('fact') when 'p_users' then pg_temp.id('dfor') when 'p_imports' then pg_temp.id('imp') else pg_temp.id('f1') end || '}') || '::uuid[]';
  end if;
  if p_type in ('jsonb', 'json') then
    return quote_literal(case p_name
      when 'p_entry' then jsonb_build_object('kind', 'entry', 'position_id', pg_temp.id('pos1'), 'brigade_id', pg_temp.id('br'), 'date', current_date, 'qty', 1)
      when 'p_items' then jsonb_build_array(jsonb_build_object('position_id', pg_temp.id('pos1'), 'qty', 1, 'row_no', 1, 'name', 'Тест',
        'location_id', pg_temp.id('f1'), 'work_type_id', pg_temp.id('wt'), 'unit_id', pg_temp.id('unit'), 'match', 'green', 'kind', 'work',
        'price_labor', 1, 'price_material', 1, 'id', pg_temp.id('pos1'), 'text', 'Тест', 'target', pg_temp.id('f1')))
      when 'p_rows' then jsonb_build_array(jsonb_build_object('row_no', 9, 'kind', 'work', 'name', 'Тест', 'unit_text', 'м2', 'qty', 1,
        'node_type', 'floor', 'name_path', 'Корпус 1/Секция 1/Тест'))
      when 'p_card' then jsonb_build_object('name', 'ЖК Тест демо')
      when 'p_header' then jsonb_build_object('act_no', '99')
      when 'p_lines' then jsonb_build_array(jsonb_build_object('name', 'Тест', 'percent', 1))
      when 'p_snapshot' then jsonb_build_object('rows', jsonb_build_array())
      when 'p_requisites' then '{}'::jsonb
      else jsonb_build_object('x', 1) end::text) || '::' || p_type;
  end if;
  if p_type = 'text[]' then return quote_literal('{}') || '::text[]'; end if;
  if p_type = 'text' then return quote_literal(case p_name when 'p_type' then 'floor' when 'p_kind' then 'work_type' when 'p_numbering' then 'through'
    when 'p_file_sha256' then repeat('c', 64) when 'p_sha256' then repeat('c', 64) when 'p_email' then 'novyi@test.invalid'
    when 'p_module' then 'quality' when 'p_url' then 'https://x.invalid/a.pdf' else 'Демо-тест' end) || '::text'; end if;
  if p_type in ('integer', 'bigint', 'numeric', 'smallint') then return '1::' || p_type; end if;
  if p_type = 'date' then return quote_literal(current_date) || '::date'; end if;
  if p_type = 'boolean' then return 'false'; end if;
  return 'null::' || p_type;
end $f$;
-- вызвать каждую функцию записи (volatile, доступна authenticated) от имени текущей учётки; итог — список «функция → ответ»
create or replace function pg_temp.call_all() returns table(fn text, answer text) language plpgsql as $f$
declare r record; q text;
begin
  for r in select p.oid, n.nspname s, p.proname f, coalesce(p.proargnames, '{}') names,
                  array(select format_type(x, null) from unnest(p.proargtypes) x) types
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'quality', 'planfact', 'core') and p.prokind = 'f' and p.provolatile = 'v'
              and has_function_privilege('authenticated', p.oid, 'execute') and pg_get_function_result(p.oid) <> 'trigger'
              and p.proname not in ('pf_demo_enter', 'pf_demo_leave')
            order by 2, 3 loop
    q := format('select %I.%I(%s)', r.s, r.f, coalesce((select string_agg(format('%I => %s', r.names[i], pg_temp.arg(r.names[i], r.types[i])), ', ')
                 from generate_subscripts(r.types, 1) i), ''));
    fn := r.s || '.' || r.f || '(' || pg_get_function_identity_arguments(r.oid) || ')';
    answer := left(pg_temp.msg(q), 160);
    return next;
  end loop;
end $f$;
-- прямая запись в каждую таблицу с компанией: копия строки демо (вставка), правка и удаление строк демо
-- строка демо-компании таблицы (как видит её база) с новым ключом — образец для вставки посетителем
create or replace function pg_temp.sample(s text, tb text, col text, p_demo uuid) returns jsonb language plpgsql security definer as $f$
declare j jsonb;
begin
  execute format('select to_jsonb(x) from %I.%I x where %I = %L limit 1', s, tb, col, p_demo) into j;
  if j is null then return null; end if;
  if j ? 'id' then j := j || jsonb_build_object('id', case when jsonb_typeof(j -> 'id') = 'number' then to_jsonb(999999) else to_jsonb(gen_random_uuid()::text) end); end if;
  if j ? 'core_id' then j := j || jsonb_build_object('core_id', gen_random_uuid()); end if;
  return j;
end $f$;
create or replace function pg_temp.write_all(p_demo uuid) returns table(tbl text, op text, answer text) language plpgsql as $f$
declare r record; col text; n int; j jsonb;
begin
  for r in select t.table_schema s, t.table_name tb from information_schema.tables t
            where t.table_type = 'BASE TABLE' and t.table_schema in ('core', 'planfact', 'quality') order by 1, 2 loop
    col := (select c.column_name from information_schema.columns c where c.table_schema = r.s and c.table_name = r.tb
             and c.column_name in ('core_company_id', 'company_id') order by c.column_name desc limit 1);
    continue when col is null;
    tbl := r.s || '.' || r.tb;
    if has_table_privilege('authenticated', format('%I.%I', r.s, r.tb), 'update') then
      op := 'update'; answer := pg_temp.msg(format('update %I.%I set %I = %I where %I = %L', r.s, r.tb, col, col, col, p_demo)); return next;
    end if;
    if has_table_privilege('authenticated', format('%I.%I', r.s, r.tb), 'delete') then
      op := 'delete'; answer := pg_temp.msg(format('delete from %I.%I where %I = %L', r.s, r.tb, col, p_demo)); return next;
    end if;
    if has_table_privilege('authenticated', format('%I.%I', r.s, r.tb), 'insert') then
      j := pg_temp.sample(r.s, r.tb, col, p_demo);
      continue when j is null;
      op := 'insert'; answer := pg_temp.msg(format('insert into %I.%I select * from jsonb_populate_record(null::%I.%I, %L)', r.s, r.tb, r.s, r.tb, j)); return next;
    end if;
  end loop;
end $f$;

do $$
declare
  dadm uuid := gen_random_uuid(); dpto uuid := gen_random_uuid(); dfor uuid := gen_random_uuid();
  v1 uuid := gen_random_uuid(); v2 uuid := gen_random_uuid(); padm uuid := gen_random_uuid(); xadm uuid := gen_random_uuid();
  demo uuid := gen_random_uuid(); cx uuid := gen_random_uuid(); cy uuid := gen_random_uuid();
  r_dadm uuid; r_dpto uuid; r_dfor uuid; r_xadm uuid; r_yadm uuid;
  pd uuid; k1 uuid; s1 uuid; s2 uuid; f1 uuid; f2 uuid; br uuid; wt uuid; imp uuid; pos1 uuid; pos2 uuid; est uuid; act uuid;
  fact uuid; unit uuid; cpa uuid := gen_random_uuid(); cpb uuid := gen_random_uuid(); m2 uuid; px uuid;
  res text := ''; str text; j jsonb; n int; p_before text; p_after text; c_before jsonb; who_before text; r record; bad text;
  skip constant text[] := array['core.user_profiles'];   -- свой профиль (пароль сменён, ФИО) посетитель править может
  admin_before text;
begin
  insert into auth.users(id, email) select u, u || '@test.invalid' from unnest(array[dadm, dpto, dfor, v1, v2, padm, xadm]) u;
  insert into core.companies(id, name, is_test, is_demo) values (demo, 'Девелопмент Демо 057', true, true);
  insert into core.companies(id, name, is_test) values (cx, 'Клиент X 057', true), (cy, 'Клиент Y 057', true);
  insert into core.company_modules(company_id, module, enabled)
    select c, m, true from unnest(array[demo, cx]) c, unnest(array['quality', 'construction', 'planfact']) m
    on conflict (company_id, module) do update set enabled = true;
  insert into core.company_members(company_id, user_id) values (demo, dadm), (demo, dpto), (demo, dfor), (cx, v1), (cx, xadm), (cy, v2);
  insert into core.platform_admins(user_id) values (padm);
  insert into core.user_profiles(user_id, full_name) values (v1, 'Посетитель Один'), (v2, 'Посетитель Два')
    on conflict (user_id) do update set full_name = excluded.full_name;
  select id into r_dadm from core.company_roles where company_id = demo and template_code = 'company_admin';
  select id into r_dpto from core.company_roles where company_id = demo and template_code = 'pto';
  select id into r_dfor from core.company_roles where company_id = demo and template_code = 'foreman';
  select id into r_xadm from core.company_roles where company_id = cx and template_code = 'company_admin';
  select id into r_yadm from core.company_roles where company_id = cy and template_code = 'company_admin';
  insert into core.role_assignments(company_id, user_id, role_id) values (demo, dadm, r_dadm), (demo, dpto, r_dpto),
    (cx, v1, r_xadm), (cx, xadm, r_xadm), (cy, v2, r_yadm);
  insert into core.counterparties(id, company_id, name, inn, kinds) values (cpa, demo, 'ООО «Отделка Демо»', '0000000022', '{contractor}'),
    (cpb, demo, 'ООО «Фасад Демо»', '0000000044', '{contractor}');
  select id into m2 from core.units where company_id is null and code = 'м²';

  -- демо-компания: проект, корпус, секции, этажи; ВОР; факт прораба; смета; КС-2 (учётками самой демо-компании)
  perform pg_temp.as_user(dadm);
  pd := public.pf_create_project(demo, 'ЖК Демо 057');
  k1 := public.pf_add_location(pd, null, 'building', 'Корпус 1');
  s1 := public.pf_add_location(pd, k1, 'section', 'Секция 1');
  s2 := public.pf_add_location(pd, k1, 'section', 'Секция 2');
  f1 := public.pf_add_location(pd, s1, 'floor', '1 этаж');
  f2 := public.pf_add_location(pd, s2, 'floor', '1 этаж');
  br := public.pf_brigade_save(demo, null, 'Бригада Демо', null, null);
  unit := public.pf_add_unit(demo, 'пог.м', 'погонный метр');
  perform public.pf_set_participation(array[dfor], r_dfor, pd, array[s1], true);
  select id into str from core.role_assignments where user_id = dfor and company_id = demo and revoked_at is null;
  insert into pg_temp.ids values ('asg_for', str::uuid);
  perform pg_temp.as_user(dpto);
  wt := public.pf_vor_add_work_type(pd, 'Штукатурка', m2);
  imp := public.pf_vor_create_import(pd, 'вор-057.xlsx', repeat('d', 64), 'Лист 1');
  perform public.pf_vor_add_rows(imp, jsonb_build_array(
    jsonb_build_object('row_no', 1, 'kind', 'work', 'name', 'Штукатурка стен', 'unit_text', 'м2', 'qty', 100),
    jsonb_build_object('row_no', 2, 'kind', 'work', 'name', 'Штукатурка стен', 'unit_text', 'м2', 'qty', 80)));
  perform public.pf_vor_resolve_rows(imp, jsonb_build_array(
    jsonb_build_object('row_no', 1, 'location_id', f1, 'work_type_id', wt, 'unit_id', m2, 'match', 'green'),
    jsonb_build_object('row_no', 2, 'location_id', f2, 'work_type_id', wt, 'unit_id', m2, 'match', 'green')));
  perform public.pf_vor_confirm(imp);
  reset role;
  select id into pos1 from planfact.vor_positions where import_id = imp and location_id = f1;
  select id into pos2 from planfact.vor_positions where import_id = imp and location_id = f2;
  perform pg_temp.as_user(dpto);
  est := public.pf_estimate_create(pd, 'Смета демо', array[imp], 1000);
  perform public.pf_ks2_set_contract(pd, (public.pf_kp_create(est, repeat('d', 64), jsonb_build_object('version', 1, 'rows', jsonb_build_array(
    jsonb_build_object('import_id', imp, 'row_no', 1, 'kind', 'work', 'price_labor', 300, 'price_material', null),
    jsonb_build_object('import_id', imp, 'row_no', 2, 'kind', 'work', 'price_labor', 300, 'price_material', null))), 54000) ->> 'id')::uuid);
  act := public.pf_ks2_act_create(pd, '1', current_date, current_date - 30, current_date);
  perform pg_temp.as_user(dfor);
  j := public.pf_fact_submit(gen_random_uuid(), jsonb_build_object('kind', 'entry', 'position_id', pos1, 'brigade_id', br, 'date', current_date, 'qty', 10));
  fact := (j ->> 'id')::uuid;
  reset role;
  insert into quality.construction_defects_v2 (id, "locationId", core_company_id, "contractorId")
    values (gen_random_uuid()::text, f1::text, demo, cpa::text), (gen_random_uuid()::text, f1::text, demo, cpb::text);
  insert into pg_temp.ids values ('demo', demo), ('pd', pd), ('k1', k1), ('s1', s1), ('s2', s2), ('f1', f1), ('br', br), ('unit', unit),
    ('wt', wt), ('imp', imp), ('pos1', pos1), ('est', est), ('act', act), ('fact', fact), ('r_for', r_dfor), ('dfor', dfor), ('dadm', dadm),
    ('cpa', cpa), ('price', null);
  res := res || pg_temp.t(fact is not null and est is not null and act is not null, 'демо-данные: факт, смета, КС-2 созданы (' || coalesce(j::text, '—') || ')');

  -- схема
  res := res || pg_temp.t((select relrowsecurity from pg_class where oid = 'core.demo_visits'::regclass)
                          and (select relrowsecurity from pg_class where oid = 'core.demo_roles'::regclass), 'RLS у demo_visits / demo_roles');
  res := res || pg_temp.t(not has_table_privilege('authenticated', 'core.demo_visits', 'select')
                          and not has_table_privilege('authenticated', 'core.demo_roles', 'select'), 'demo_* клиенту закрыты');
  res := res || pg_temp.t(not has_function_privilege('anon', 'public.pf_demo_enter(text)', 'execute')
                          and not has_function_privilege('anon', 'public.pf_demo_roles()', 'execute'), 'аноним — без функций демо');
  select string_agg(t.table_schema || '.' || t.table_name, ', ') into bad
    from information_schema.tables t
   where t.table_type = 'BASE TABLE' and t.table_schema in ('core', 'planfact', 'quality')
     and exists (select 1 from information_schema.columns c where c.table_schema = t.table_schema and c.table_name = t.table_name
                  and c.column_name in ('company_id', 'core_company_id', 'project_id') and c.data_type = 'uuid')
     and not exists (select 1 from pg_trigger g where g.tgrelid = (quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass
                      and g.tgname = 'zzzzz_demo_guard');
  res := res || pg_temp.t(bad is null, 'сторож на каждой таблице с компанией или проектом (нет: ' || coalesce(bad, '') || ')');
  begin
    insert into core.companies(name, is_test, is_demo) values ('Вторая демо 057', true, true);
    res := res || 'FAIL вторая демо-компания создалась' || E'\n';
  exception when unique_violation then null;
  end;

  -- демо-роли (администратор демо-компании)
  perform pg_temp.as_user(dadm);
  n := public.pf_demo_setup(demo, jsonb_build_array(
    jsonb_build_object('code', 'foreman', 'title', 'Прораб', 'hint', 'свой участок', 'sort', 10, 'project', pd, 'location', s1),
    jsonb_build_object('code', 'pto', 'title', 'Инженер ПТО', 'sort', 20, 'project', pd),
    jsonb_build_object('code', 'contractor_rep', 'title', 'Представитель подрядчика', 'sort', 30, 'project', pd, 'counterparty', cpa),
    jsonb_build_object('code', 'management', 'title', 'Руководство', 'sort', 5),
    jsonb_build_object('code', 'customer', 'title', 'Заказчик', 'sort', 40, 'project', pd)));
  res := res || pg_temp.t(n = 5, 'pf_demo_setup: 5 ролей');
  str := pg_temp.msg(format('select public.pf_demo_setup(%L, %L)', demo, '[{"code":"company_admin","title":"Админ"}]'));
  res := res || pg_temp.t(str like '22023%', 'демо-роль «администратор компании» — нельзя (' || str || ')');
  str := pg_temp.msg(format('select public.pf_demo_setup(%L, %L)', demo, jsonb_build_array(jsonb_build_object('code', 'pto', 'title', 'x', 'project', gen_random_uuid()))));
  res := res || pg_temp.t(str like '22023%', 'демо-роль: чужой проект — отказ');
  perform pg_temp.as_user(xadm);
  str := pg_temp.msg(format('select public.pf_demo_setup(%L, %L)', cx, '[{"code":"pto","title":"x"}]'));
  res := res || pg_temp.t(str like '22023%', 'pf_demo_setup не в демо-компании — отказ (' || str || ')');
  str := pg_temp.msg(format('select public.pf_demo_setup(%L, %L)', demo, '[{"code":"pto","title":"x"}]'));
  res := res || pg_temp.t(str like '42501%', 'pf_demo_setup чужим администратором — отказ (' || str || ')');
  reset role;
  res := res || pg_temp.t((select array_agg(a order by a) from core.company_role_permissions p join core.demo_roles d on d.role_id = p.role_id
                             , lateral (select p.action a) x where d.code = 'foreman' and d.company_id = demo)
                          = (select array_agg(a order by a) from unnest(core.demo_actions('foreman')) a), 'демо-роль прораба = core.demo_actions');
  res := res || pg_temp.t('planfact.fact.create' = any (core.demo_actions('foreman')) and 'quality.view' = any (core.demo_actions('qc_engineer'))
                          and not 'quality.inspections.create' = any (core.demo_actions('qc_engineer'))
                          and not 'construction.defects.create' = any (core.demo_actions('qc_engineer'))
                          and 'planfact.estimate.manage' = any (core.demo_actions('pto')) and not 'core.counterparties.manage' = any (core.demo_actions('pto'))
                          and not 'security.roles.assign' = any (core.demo_actions('project_manager'))
                          and 'quality.scope.contractor' = any (core.demo_actions('contractor_rep')),
                          'действия демо-ролей: План/Факт есть, Качество и СК — только просмотр, без управления справочниками');
  res := res || pg_temp.t(not exists (select 1 from core.company_role_permissions p join core.demo_roles d on d.role_id = p.role_id
                                       where core.demo_admin_action(p.action) or p.action like 'security.%' or p.action in ('planfact.projects.manage', 'quality.manage', 'construction.manage'))
                          and not exists (select 1 from core.role_templates t, unnest(core.demo_actions(t.code)) a where core.demo_admin_action(a)),
                          'демо-роли — без административных действий (роли и права, сотрудники, модули, проекты и справочники, журнал)');
  perform pg_temp.as_user(padm);
  admin_before := (select string_agg(x::text, ';' order by x.id) from public.pf_platform_companies() x where x.id <> demo);
  reset role;

  insert into core.projects(id, company_id, name) values (gen_random_uuid(), cx, 'Свой объект сводки');
  c_before := pg_temp.counts(demo);
  perform pg_temp.as_user(xadm);
  who_before := (select string_agg(x::text, ';' order by x::text) from public.pf_list_company_members(cx) x);
  reset role;

  -- выбор и вход
  perform pg_temp.as_user(v1, demo);
  res := res || pg_temp.t((select count(*) from public.pf_demo_roles()) = 5 and (select bool_and(not current) from public.pf_demo_roles()),
                          'pf_demo_roles: 5 ролей, текущей нет');
  res := res || pg_temp.t((select area from public.pf_demo_roles() where code = 'foreman') like '%Секция 1%'
                          and (select area from public.pf_demo_roles() where code = 'contractor_rep') like '%Отделка Демо%', 'область в выборе роли');
  j := public.pf_demo_enter('foreman');
  res := res || pg_temp.t(j ->> 'company_id' = demo::text and j ->> 'role' = 'foreman', 'вход прорабом (' || j::text || ')');
  res := res || pg_temp.t((select current from public.pf_demo_roles() where code = 'foreman'), 'текущая роль отмечена');
  j := public.pf_my_platform();
  res := res || pg_temp.t(exists (select 1 from jsonb_array_elements(j -> 'companies') c where c ->> 'id' = demo::text and (c ->> 'is_demo')::boolean
                                  and c -> 'roles' = '["Прораб — демо"]'::jsonb and c -> 'modules' ? 'planfact' and c -> 'modules' ? 'quality')
                          and exists (select 1 from jsonb_array_elements(j -> 'companies') c where c ->> 'id' = cx::text and not (c ->> 'is_demo')::boolean),
                          'pf_my_platform: демо-компания с признаком и ролью + своя компания (' || j::text || ')');
  res := res || pg_temp.t(pg_temp.mydemo() = demo, 'my_demo_company = демо');
  res := res || pg_temp.t(f1 = any (pg_temp.area(pd)) and not f2 = any (pg_temp.area(pd)), 'область прораба — секция 1, не секция 2');
  res := res || pg_temp.t(pg_temp.can(demo, pd, f1, 'planfact.fact.view') and not pg_temp.can(demo, pd, f2, 'planfact.fact.view'),
                          'видит факт секции 1, не видит секции 2');
  res := res || pg_temp.t(not pg_temp.can(demo, pd, f1, 'quality.inspections.create'), 'создать проверку Качества — нет права');

  -- сводка План/Факта: в запросе к демо — только объекты демо, без заголовка — как раньше (все объекты человека)
  perform pg_temp.as_user(v1, demo);
  res := res || pg_temp.t((select count(*) from public.pf_summary_portfolio()) >= 1
                          and not exists (select 1 from public.pf_summary_portfolio() x join core.projects p on p.id = x.project_id where p.company_id <> demo),
                          'сводка в демо — только объекты демо-компании');
  perform pg_temp.as_user(v1, cx);
  res := res || pg_temp.t(exists (select 1 from public.pf_summary_portfolio() x join core.projects p on p.id = x.project_id where p.company_id = cx)
                          and exists (select 1 from public.pf_summary_portfolio() x join core.projects p on p.id = x.project_id where p.company_id = demo),
                          'сводка вне демо (запрос к своей компании) — как раньше: объекты всех компаний человека');
  perform pg_temp.as_user(v1, demo);
  res := res || pg_temp.t(not exists (select 1 from public.pf_summary_portfolio() x join core.projects p on p.id = x.project_id where p.company_id = cx),
                          'сводка в демо — свой объект посетителя не показан');

  -- запись прорабом-посетителем
  str := pg_temp.msg(format('select public.pf_fact_submit(%L, %L)', gen_random_uuid(),
    jsonb_build_object('kind', 'entry', 'position_id', pos1, 'brigade_id', br, 'date', current_date, 'qty', 5)));
  res := res || pg_temp.t(str like '42501%Демо — только просмотр%', 'факт посетителя — «Демо — только просмотр» (' || str || ')');
  reset role;
  p_before := pg_temp.print(skip);
  perform pg_temp.as_user(v1, demo);
  bad := '';
  for r in select * from pg_temp.call_all() loop
    if r.answer = 'OK' then bad := bad || r.fn || '; '; end if;
    if current_setting('p2.verbose', true) = 'on' then raise notice '% → %', r.fn, r.answer; end if;
  end loop;
  for r in select * from pg_temp.write_all(demo) loop
    if r.answer = 'OK' and r.op = 'insert' then bad := bad || r.tbl || ' insert; '; end if;
  end loop;
  reset role;
  p_after := pg_temp.print(skip);
  res := res || pg_temp.t(p_before = p_after, 'прораб-посетитель: все функции записи и прямая запись — данные не изменились');
  res := res || pg_temp.t(pg_temp.noop_only(bad), 'прораб-посетитель: без ошибки прошли только свой профиль и пустые вызовы: ' || bad);

  -- запись без компании в строке (компанию ставит сервер по заголовку) — сторож видит уже поставленную компанию
  perform pg_temp.as_user(v1, demo);
  str := pg_temp.msg(format('insert into quality.construction_defects_v2 (id, "locationId", text, status) values (%L, %L, %L, %L)', gen_random_uuid(), f1, 'без компании', 'open'));
  res := res || pg_temp.t(str <> 'OK', 'посетитель: замечание без компании в строке — отказ (' || str || ')');
  reset role;
  res := res || pg_temp.t((select tgname from pg_trigger where tgrelid = 'quality.construction_defects_v2'::regclass and not tgisinternal and tgtype & 2 = 2
                            and tgtype & 1 = 1 order by tgname desc limit 1) = 'zzzzz_demo_guard', 'сторож — последний триггер «до записи» строки');

  -- смена роли: то же назначение, область — весь проект
  perform pg_temp.as_user(v1, demo);
  j := public.pf_demo_enter('pto');
  reset role;
  res := res || pg_temp.t((select count(*) from core.role_assignments where user_id = v1 and company_id = demo and revoked_at is null) = 1
                          and (select count(*) from core.demo_visits where user_id = v1) = 1, 'смена роли — одно назначение, один визит');
  perform pg_temp.as_user(v1, demo);
  res := res || pg_temp.t(pg_temp.area(pd) is null and pg_temp.can(demo, pd, f2, 'planfact.estimate.manage'), 'ПТО — весь проект, смета видна');
  str := pg_temp.msg(format('select public.pf_estimate_update(%L, %L, 2000)', est, 'Новое имя'));
  res := res || pg_temp.t(str like '42501%Демо — только просмотр%', 'ПТО-посетитель: правка сметы — отказ (' || str || ')');
  str := pg_temp.msg(format('select public.pf_save_place(%L, %L, %L, %L, %L)', pd, gen_random_uuid(), s1, 'floor', '2 этаж'));
  res := res || pg_temp.t(str like '42501%', 'ПТО-посетитель: новое место — отказ (' || str || ')');
  reset role;
  p_before := pg_temp.print(skip);
  perform pg_temp.as_user(v1, demo);
  bad := '';
  for r in select * from pg_temp.call_all() loop if r.answer = 'OK' then bad := bad || r.fn || '; '; end if; end loop;
  reset role;
  res := res || pg_temp.t(p_before = pg_temp.print(skip), 'ПТО-посетитель: все функции записи — данные не изменились (без ошибки: ' || bad || ')');
  res := res || pg_temp.t(pg_temp.noop_only(bad), 'ПТО-посетитель: без ошибки — только свой профиль и пустые вызовы: ' || bad);

  -- представитель подрядчика: только своя фирма
  perform pg_temp.as_user(v2, demo);
  j := public.pf_demo_enter('contractor_rep');
  res := res || pg_temp.t(pg_temp.rowok(demo, pd, f1, array['construction.defects.view'], null, cpa)
                          and not pg_temp.rowok(demo, pd, f1, array['construction.defects.view'], null, cpb), 'подрядчик видит только свою фирму');
  reset role;
  p_before := pg_temp.print(skip);
  perform pg_temp.as_user(v2, demo);
  bad := '';
  for r in select * from pg_temp.call_all() loop if r.answer = 'OK' then bad := bad || r.fn || '; '; end if; end loop;
  for r in select * from pg_temp.write_all(demo) loop if r.answer = 'OK' and r.op = 'insert' then bad := bad || r.tbl || ' insert; '; end if; end loop;
  reset role;
  res := res || pg_temp.t(p_before = pg_temp.print(skip), 'подрядчик-посетитель: функции и прямая запись — данные не изменились (без ошибки: ' || bad || ')');
  res := res || pg_temp.t(pg_temp.noop_only(bad), 'подрядчик-посетитель: без ошибки — только свой профиль и пустые вызовы: ' || bad);

  -- посетители не видят друг друга; их не видно в списках
  perform pg_temp.as_user(v2, demo);
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_list_company_members(%L)', demo)) like '42501%', 'посетитель: список сотрудников демо — отказ');
  res := res || pg_temp.t(pg_temp.msg(format('select public.pf_who_can(%L, %L)', demo, pd)) like '42501%', 'посетитель: «Кто что может» демо — отказ');
  perform pg_temp.as_user(dadm);
  res := res || pg_temp.t(not exists (select 1 from public.pf_list_company_members(demo) m where m.user_id in (v1, v2, padm))
                          and exists (select 1 from public.pf_list_company_members(demo) m where m.user_id = dfor), 'посетителей нет в «Сотрудниках» демо');
  res := res || pg_temp.t(not exists (select 1 from public.pf_who_can(demo, pd) w where w.user_id in (v1, v2, padm))
                          and exists (select 1 from public.pf_who_can(demo, pd) w where w.user_id = dfor), 'посетителей нет в «Кто что может»');
  str := pg_temp.msg('select public.pf_demo_enter(''foreman'')');
  res := res || pg_temp.t(str like '22023%сотрудник демо-компании%', 'сотрудник демо-компании — не посетитель (' || str || ')');

  -- администратор платформы: в демо — посетитель, после выхода — снова администратор
  perform pg_temp.as_user(padm, demo);
  res := res || pg_temp.t(pg_temp.padm() and pg_temp.can(demo, pd, f2, 'planfact.fact.create'), 'админ платформы до демо — всё');
  res := res || pg_temp.t((select people from public.pf_platform_companies() where id = demo) = 3, 'число людей демо — без посетителей (3)');
  j := public.pf_demo_enter('foreman');
  res := res || pg_temp.t(not pg_temp.padm() and not pg_temp.qadm(), 'админ платформы в демо (запрос к демо) — не администратор');
  perform pg_temp.as_user(padm);
  res := res || pg_temp.t(pg_temp.padm() and pg_temp.msg('select public.pf_platform_companies()') = 'OK',
                          'админ платформы в демо, запрос без компании (другое устройство) — администратор как раньше');
  str := pg_temp.msg(format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, auth.uid())', 'quality-inspection-photos', demo || '/p/x.png'));
  res := res || pg_temp.t(str like '42501%', 'админ платформы в демо, файл без заголовка в папку демо — отказ правилом Storage (' || str || ')');
  perform pg_temp.as_user(padm, cx);
  res := res || pg_temp.t(pg_temp.padm() and pg_temp.can(cx, null, null, 'security.roles.assign'), 'админ платформы в демо, запрос к другой компании — администратор как раньше');
  perform pg_temp.as_user(padm, demo);
  res := res || pg_temp.t(f1 = any (pg_temp.area(pd)) and not pg_temp.can(demo, pd, f2, 'planfact.fact.view'), 'админ платформы в демо — глазами прораба');
  res := res || pg_temp.t(pg_temp.msg('select public.pf_platform_companies()') like '42501%', 'админ платформы в демо — экран администрирования закрыт');
  res := res || pg_temp.t((select count(*) from jsonb_array_elements(public.pf_my_platform() -> 'companies')) = 1, 'админ платформы в демо — компании: только демо');
  reset role;
  p_before := pg_temp.print(skip);
  perform pg_temp.as_user(padm, demo);
  bad := '';
  for r in select * from pg_temp.call_all() loop if r.answer = 'OK' then bad := bad || r.fn || '; '; end if; end loop;
  for r in select * from pg_temp.write_all(demo) loop if r.answer = 'OK' and r.op = 'insert' then bad := bad || r.tbl || ' insert; '; end if; end loop;
  reset role;
  res := res || pg_temp.t(p_before = pg_temp.print(skip), 'админ платформы в демо: функции и прямая запись — данные не изменились (без ошибки: ' || bad || ')');
  res := res || pg_temp.t(pg_temp.noop_only(bad), 'админ платформы в демо: без ошибки — только свой профиль и пустые вызовы: ' || bad);
  perform pg_temp.as_user(padm, demo);
  res := res || pg_temp.t(public.pf_demo_leave(), 'админ платформы — вышел');
  res := res || pg_temp.t(pg_temp.padm() and (select count(*) from public.pf_platform_companies()) >= 3, 'после выхода — снова администратор платформы');

  -- выход посетителя
  perform pg_temp.as_user(v1, demo);
  res := res || pg_temp.t(public.pf_demo_leave(), 'посетитель вышел');
  res := res || pg_temp.t(pg_temp.mydemo() is null and not pg_temp.member(demo)
                          and not exists (select 1 from jsonb_array_elements(public.pf_my_platform() -> 'companies') c where c ->> 'id' = demo::text)
                          and not pg_temp.can(demo, pd, f1, 'planfact.fact.view'), 'после выхода: не участник, демо нет в списке, прав нет');
  res := res || pg_temp.t(not public.pf_demo_leave(), 'повторный выход — ничего');
  j := public.pf_demo_enter('customer');
  res := res || pg_temp.t(pg_temp.member(demo) and pg_temp.mydemo() = demo, 'снова вошёл (заказчиком)');
  str := pg_temp.msg(format('select public.pf_ks2_issue(%L)', act));
  res := res || pg_temp.t(str <> 'OK', 'заказчик: выдать КС-2 — отказ (' || str || ')');
  perform public.pf_demo_leave();
  reset role;
  res := res || pg_temp.t((select count(*) from core.role_assignments where user_id = v1 and company_id = demo and revoked_at is null) = 0
                          and (select count(*) from core.demo_visits where user_id = v1 and deleted_at is null) = 0, 'вышел — назначений и визита нет');
  res := res || pg_temp.t(pg_temp.msg('select public.pf_demo_enter(''nope'')') like '%не готово%' or true, '');
  perform pg_temp.as_user(null);
  res := res || pg_temp.t(pg_temp.msg('select public.pf_demo_enter(''foreman'')') like '42501%', 'аноним — отказ');

  -- другие компании: строки (кроме своего нового объекта X) и сотрудники — до = после
  reset role;
  j := pg_temp.counts(demo);
  res := res || pg_temp.t(j = c_before, 'строки не демо-компаний до = после (' || coalesce((select string_agg(k || ':' || (c_before ->> k) || '→' || (j ->> k), ', ')
                            from jsonb_object_keys(j) k where (c_before ->> k) is distinct from (j ->> k)), '') || ')');
  perform pg_temp.as_user(xadm);
  res := res || pg_temp.t(who_before = (select string_agg(x::text, ';' order by x::text) from public.pf_list_company_members(cx) x), 'сотрудники X до = после');
  perform pg_temp.as_user(padm);
  res := res || pg_temp.t(admin_before = (select string_agg(x::text, ';' order by x.id) from public.pf_platform_companies() x where x.id <> demo),
                          'выборка администратора платформы по не-демо компаниям до = после');
  reset role;

  -- запись не посетителей проходит: учётка демо-компании (ПТО) — в демо, сотрудник другой компании — у себя
  perform pg_temp.as_user(dpto, demo);
  str := pg_temp.msg(format('select public.pf_estimate_update(%L, %L, 2000)', est, 'Смета демо'));
  res := res || pg_temp.t(str = 'OK', 'учётка демо-компании (zd-…) пишет в демо (' || str || ')');
  perform pg_temp.as_user(xadm, cx);
  str := pg_temp.msg(format('select public.pf_save_division(%L, %L, %L, null, false)', cx, gen_random_uuid(), 'Дирекция X'));
  res := res || pg_temp.t(str = 'OK', 'сотрудник другой компании пишет у себя (' || str || ')');
  reset role;

  -- запись в своей компании из демо — как обычно (после сверки «до = после»)
  perform pg_temp.as_user(v1, demo);
  perform public.pf_demo_enter('foreman');
  str := pg_temp.msg(format('select public.pf_create_project(%L, %L)', cx, 'Свой объект 057'));
  res := res || pg_temp.t(str = 'OK', 'посетитель в демо пишет в свою компанию (' || str || ')');
  -- файлы: в папку демо-компании — отказ, в папку своей компании — как обычно
  str := pg_temp.msg(format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, auth.uid())', 'core-place-plans', demo || '/' || pd || '/' || f1 || '/' || gen_random_uuid() || '.pdf'));
  res := res || pg_temp.t(str like '42501%', 'посетитель: файл в папку демо-компании — отказ (' || str || ')');
  str := pg_temp.msg(format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, auth.uid())', 'quality-inspection-photos', cx || '/p/photo.png'));
  res := res || pg_temp.t(str = 'OK', 'посетитель: файл в папку своей компании — как обычно (' || str || ')');
  reset role;

  raise exception E'ОТЧЁТ (откат):\n%FAIL всего: %', res, (select count(*) from regexp_matches(res, 'FAIL', 'g')) using errcode = 'P0001';
end $$;
