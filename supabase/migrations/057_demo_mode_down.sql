-- P2-0053: откат 057_demo_mode_up.sql. Посетители выходят из демо (назначения отозваны, участие в демо-компании выключено —
-- доступа к её данным у них не остаётся), сторож и правило файлов снимаются, функции списков людей и pf_my_platform —
-- как до 057, администратор платформы — как раньше. Роли «… — демо» остаются обычными ролями демо-компании (без людей);
-- демо-компания остаётся обычной тестовой компанией (её сброс — scripts/demo/reset.sql).
begin;

do $$
begin
  if to_regclass('core.demo_visits') is null then
    raise exception '057 не применена — откатывать нечего' using errcode = 'P0001';
  end if;
end $$;

-- посетители — из демо
update core.role_assignments a set revoked_at = now()
  from core.demo_visits v where v.assignment_id = a.id and a.revoked_at is null;
update core.role_assignments a set revoked_at = now()
  from core.demo_roles d where d.role_id = a.role_id and a.revoked_at is null;
update core.company_members m set disabled_at = now()
  from core.demo_visits v where v.company_id = m.company_id and v.user_id = m.user_id and m.disabled_at is null;

drop policy if exists demo_visitor_no_insert on storage.objects;
drop policy if exists demo_visitor_no_update on storage.objects;
drop policy if exists demo_visitor_no_delete on storage.objects;

do $$
declare r record;
begin
  for r in select tgrelid::regclass t from pg_trigger where tgname = 'zzzzz_demo_guard' and not tgisinternal loop
    execute format('drop trigger zzzzz_demo_guard on %s', r.t);
  end loop;
end $$;

create or replace function planfact.is_platform_admin()
returns boolean language sql stable security definer set search_path = pg_catalog, planfact, core as $$
  select auth.uid() is not null and exists (select 1 from core.platform_admins where user_id = auth.uid());
$$;

create function pg_temp.patch(p_fn regprocedure, p_from text[], p_to text[])
returns void language plpgsql as $$
declare v_new text := pg_get_functiondef(p_fn); i int;
begin
  for i in 1..cardinality(p_from) loop
    if position(p_from[i] in v_new) = 0 then
      raise exception '057_down: в % не найдено место правки «%»', p_fn, p_from[i] using errcode = 'P0001';
    end if;
    v_new := replace(v_new, p_from[i], p_to[i]);
  end loop;
  execute v_new;
end $$;

select pg_temp.patch('public.pf_list_company_members(uuid)'::regprocedure,
  array[' and not core.is_demo_visitor(p_company, m.user_id)'], array['']);
select pg_temp.patch('public.pf_who_can(uuid, uuid, uuid)'::regprocedure,
  array[' and not core.is_demo_visitor(p_company, a.user_id)'], array['']);
select pg_temp.patch('public.pf_platform_companies()'::regprocedure,
  array[' and not core.is_demo_visitor(c.id, m.user_id)'], array['']);
select pg_temp.patch('public.pf_my_platform()'::regprocedure,
  array[', c.is_demo from core.companies c, me', ', ''is_demo'', comp.is_demo'],
  array[' from core.companies c, me', '']);
select pg_temp.patch('quality.member_by_email(uuid, text)'::regprocedure,
  array[' and not core.is_demo_visitor(p_company, m.user_id)'], array['']);
drop function pg_temp.patch(regprocedure, text[], text[]);

drop function if exists public.pf_demo_leave();
drop function if exists public.pf_demo_enter(text);
drop function if exists public.pf_demo_roles();
drop function if exists public.pf_demo_setup(uuid, jsonb);
drop function if exists core.demo_guard();
drop function if exists core.demo_actions(text);
drop function if exists core.demo_admin_action(text);
drop function if exists core.demo_file_ok(text);
drop function if exists core.request_company_text();
drop function if exists core.is_demo_visitor(uuid, uuid);
drop function if exists core.my_demo_company();
drop table if exists core.demo_visits;
drop table if exists core.demo_roles;
drop index if exists core.companies_one_demo_uq;
alter table core.companies drop column if exists is_demo;

commit;
