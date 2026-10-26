-- P2-0027. Подготовка компании «RBI» к переносу (SQL Editor, по разрешению владельца; повтор безопасен).
-- Те же функции, что экран «Администрирование» и «Объекты» (права и журнал — как при работе в приложении):
--   от имени администратора платформы — компания «RBI», модули Качество и Стройконтроль, администратор компании = владелец;
--   от имени владельца — объект ядра для старого проекта rbi-test. Затем сопоставления: rbi-test → объект, профиль владельца → почта.
-- ПЕРЕД ЗАПУСКОМ заполнить три значения в строке «параметры» ниже.
begin;
create temp table _p on commit drop as
select 'ПОЧТА_ВЛАДЕЛЬЦА'::text owner_email,          -- параметры: почта входа владельца в Платформу 2.0
       'НАЗВАНИЕ_ОБЪЕКТА'::text project_name,        --            объект ядра для старого проекта rbi-test
       'Кондратьев И. Н.'::text owner_old_name;      --            имя владельца в старом профиле (rbi-test)

do $$
declare
  v_email text; v_name text; v_old text;
  v_admin uuid; v_owner uuid; v_c uuid; v_p uuid; v_prof uuid;
begin
  select owner_email, project_name, owner_old_name into v_email, v_name, v_old from _p;
  select id into v_owner from auth.users where lower(email) = lower(btrim(v_email));
  if v_owner is null then raise exception 'Нет учётки с почтой %', v_email; end if;
  select user_id into v_admin from core.platform_admins order by created_at limit 1;
  if v_admin is null then raise exception 'Нет администратора платформы'; end if;
  select id into v_prof from public.rbi_engineer_profiles where project_code = 'rbi-test' and inspector_name = v_old;
  if v_prof is null then raise exception 'Нет старого профиля «%» в rbi-test', v_old; end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select id into v_c from core.companies where name = 'RBI';
  if v_c is null then v_c := public.pf_platform_create_company('RBI', false); end if;
  perform public.pf_platform_set_module(v_c, 'quality', true);
  perform public.pf_platform_set_module(v_c, 'construction', true);
  perform public.pf_platform_set_company_admin(v_c, v_email);

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select core_project_id into v_p from quality.rbi_transfer_projects where core_company_id = v_c and old_code = 'rbi-test';
  if v_p is null then
    perform set_config('quality.object_sync', '1', true);   -- P2-0035 (039b): контейнер — не объект Качества
    v_p := public.pf_create_project(v_c, v_name, 'rbi-test');
    perform set_config('quality.object_sync', '', true);
    insert into quality.rbi_transfer_projects(core_company_id, old_code, core_project_id) values (v_c, 'rbi-test', v_p);
  end if;
  update core.projects set quality_container = true where id = v_p and not quality_container;   -- P2-0035: служебный контейнер, скрыт из списков
  insert into quality.rbi_transfer_people(core_company_id, old_profile_id, email, user_id) values (v_c, v_prof, lower(btrim(v_email)), v_owner)
  on conflict (core_company_id, old_profile_id) do update set email = excluded.email, user_id = excluded.user_id;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

select c.name company, c.id company_id, pr.name project, pr.id project_id,
       (select string_agg(module, ', ' order by module) from core.company_modules m where m.company_id = c.id and m.enabled) modules,
       (select count(*) from quality.rbi_transfer_people x where x.core_company_id = c.id) people
  from core.companies c join quality.rbi_transfer_projects tp on tp.core_company_id = c.id join core.projects pr on pr.id = tp.core_project_id
 where c.name = 'RBI';
commit;
