-- P2-0004 этап 4: суммы под правом money.view, журнал аудита изменений работ, чтение работ/журнала через функции.
-- Только добавляет/заменяет объекты planfact и public.pf_*. Объекты RBI/Quality не затрагивает. Применять после 003.

alter table planfact.works add column if not exists plan_amount numeric;  -- плановая сумма, ₽ (видна только с planfact.money.view)

-- Журнал аудита: пишется только триггером, изменить/удалить нельзя.
create table if not exists planfact.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  project_id uuid not null,
  table_name text not null,
  record_id uuid not null,
  action text not null,
  actor uuid,
  at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create index if not exists audit_log_project_idx on planfact.audit_log(project_id, at desc);
alter table planfact.audit_log enable row level security;
drop policy if exists audit_log_select on planfact.audit_log;
create policy audit_log_select on planfact.audit_log for select to authenticated
  using (planfact.has_permission(project_id, 'planfact.audit.view'));

create or replace function planfact.audit_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end $$;
drop trigger if exists audit_log_no_change on planfact.audit_log;
create trigger audit_log_no_change before update or delete on planfact.audit_log
  for each row execute function planfact.audit_immutable();

create or replace function planfact.log_works_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare r planfact.works;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  insert into planfact.audit_log(company_id, project_id, table_name, record_id, action, actor, old_data, new_data)
  values (r.company_id, r.project_id, 'works', r.id, tg_op, auth.uid(),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return r;
end $$;
drop trigger if exists works_audit on planfact.works;
create trigger works_audit after insert or update or delete on planfact.works
  for each row execute function planfact.log_works_change();

-- Права: сумму напрямую читать нельзя (колонка исключена), журнал — только через политику/функцию.
revoke all on planfact.audit_log from public, anon, authenticated;
grant select on planfact.audit_log to authenticated;
revoke select on planfact.works from authenticated;
grant select (id, company_id, project_id, name, unit, plan_qty, created_by, created_at) on planfact.works to authenticated;
revoke all on function planfact.log_works_change(), planfact.audit_immutable() from public, anon, authenticated;

-- Работы проекта: право works.view проверяется внутри; сумма отдаётся только при money.view.
drop function if exists public.pf_list_works(uuid);
create or replace function public.pf_list_works(p_project uuid)
returns table(id uuid, name text, unit text, plan_qty numeric, plan_amount numeric, created_by uuid, created_at timestamptz)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  select w.id, w.name, w.unit, w.plan_qty,
         case when planfact.has_permission(p_project, 'planfact.money.view') then w.plan_amount end,
         w.created_by, w.created_at
  from planfact.works w
  where w.project_id = p_project and planfact.has_permission(p_project, 'planfact.works.view')
  order by w.created_at, w.id;
$$;

-- Журнал проекта: право audit.view; автор — почта; суммы из before/after скрыты без money.view.
create or replace function public.pf_list_audit(p_project uuid, p_limit int default 50)
returns table(at timestamptz, actor_email text, action text, record_id uuid, old_data jsonb, new_data jsonb)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  select a.at, u.email::text, a.action, a.record_id,
         case when planfact.has_permission(p_project, 'planfact.money.view') then a.old_data else a.old_data - 'plan_amount' end,
         case when planfact.has_permission(p_project, 'planfact.money.view') then a.new_data else a.new_data - 'plan_amount' end
  from planfact.audit_log a left join auth.users u on u.id = a.actor
  where a.project_id = p_project and planfact.has_permission(p_project, 'planfact.audit.view')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke all on function public.pf_list_works(uuid), public.pf_list_audit(uuid, int) from public, anon;
grant execute on function public.pf_list_works(uuid), public.pf_list_audit(uuid, int) to authenticated;

-- Тестовые суммы для тестовых компаний (is_test).
update planfact.works w set plan_amount = v.amount
from (values ('Устройство фундаментной плиты', 4800000), ('Монтаж колонн', 1920000), ('Кладка стен', 6300000)) as v(name, amount)
where w.name = v.name and w.plan_amount is null
  and exists (select 1 from planfact.companies c where c.id = w.company_id and c.is_test);
