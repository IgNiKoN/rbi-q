-- P2-0007. Факт прораба: бригады, записи факта (ввод, исправление с историей, перебор на подтверждение РП, пачка «закрыть этаж»).
-- Только planfact.* и public.pf_*. Объекты RBI/Quality, Auth/PostgREST и Storage не затрагивает. Применять после 008 — ФАЙЛОМ (урок 006a).
-- Запись — только через public.pf_* (security definer, право проверяется внутри, company_id берётся из проекта);
-- клиенту — только SELECT по RLS. Запись факта не удаляется и не меняется: исправление — новая запись, старая → superseded.
-- Накопленный факт позиции = Σ qty записей status = 'accepted' (planfact.fact_totals — единственная функция расчёта).

-- 1. Допуск перебора плана (в %, по проекту)
alter table planfact.projects add column if not exists fact_tolerance_pct numeric not null default 2
  check (fact_tolerance_pct >= 0 and fact_tolerance_pct <= 100);

-- 2. Действия каталога и шаблоны ролей
insert into planfact.permission_catalog(action, description) values
  ('planfact.fact.approve',     'Факт: подтверждение перебора плана и исправление чужих записей'),
  ('planfact.brigades.manage',  'Справочник бригад компании')
on conflict (action) do nothing;

insert into planfact.role_template_permissions(template_code, action)
select t.code, a.action
from (values ('company_admin'), ('project_manager')) t(code)
cross join (values ('planfact.fact.approve'), ('planfact.brigades.manage')) a(action)
on conflict do nothing;
insert into planfact.role_template_permissions(template_code, action) values ('pto', 'planfact.brigades.manage')
on conflict do nothing;

-- Администратор подтверждает перебор и исправляет чужие записи, поэтому должен и видеть факт (в 002 у него planfact.fact.view не было).
insert into planfact.role_template_permissions(template_code, action) values ('company_admin', 'planfact.fact.view')
on conflict do nothing;

-- Дозаполнение ролей, уже созданных из этих шаблонов (свои роли с template_code is null не трогаем).
insert into planfact.company_role_permissions(role_id, company_id, action)
select r.id, r.company_id, p.action
from planfact.company_roles r
join planfact.role_template_permissions p on p.template_code = r.template_code
where r.template_code in ('company_admin', 'project_manager', 'pto') and p.action in ('planfact.fact.approve', 'planfact.brigades.manage', 'planfact.fact.view')
on conflict do nothing;

-- 3. Бригады компании
create table if not exists planfact.brigades (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references planfact.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  leader_name text check (leader_name is null or length(leader_name) <= 120),
  phone text check (phone is null or length(phone) <= 40),
  archived_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists brigades_name_uq on planfact.brigades(company_id, lower(btrim(name))) where archived_at is null;

-- 4. Записи факта
create table if not exists planfact.fact_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  project_id uuid not null,
  position_id uuid not null references planfact.vor_positions(id),
  brigade_id uuid not null references planfact.brigades(id),
  work_date date not null,
  qty numeric not null check (qty > 0 and qty < 1000000000),
  workers int check (workers is null or (workers >= 0 and workers <= 10000)),
  man_hours numeric check (man_hours is null or (man_hours >= 0 and man_hours <= 1000000)),
  note text check (note is null or length(note) <= 1000),
  status text not null check (status in ('accepted', 'pending_approval', 'rejected', 'superseded')),
  corrects_id uuid references planfact.fact_entries(id),
  correction_reason text check (correction_reason is null or length(correction_reason) <= 1000),
  batch_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),
  foreign key (project_id, company_id) references planfact.projects(id, company_id) on delete cascade
);
create index if not exists fact_entries_position_idx on planfact.fact_entries(position_id, status);
create index if not exists fact_entries_project_idx on planfact.fact_entries(project_id, status, created_at desc);
create index if not exists fact_entries_batch_idx on planfact.fact_entries(batch_id) where batch_id is not null;

-- 5. Сторож: записи не удаляются; менять можно только решение/статус и только изнутри pf_* (флаг транзакции);
--    позиция, бригада и проект записи должны принадлежать одной компании/проекту.
create or replace function planfact.fact_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog, planfact as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Запись факта удалять нельзя — исправьте её с причиной' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if coalesce(current_setting('planfact.fact_tx', true), '') <> '1' then
      raise exception 'Факт вносится только через функции платформы' using errcode = '42501';
    end if;
    if not exists (select 1 from planfact.vor_positions p where p.id = new.position_id
                   and p.project_id = new.project_id and p.company_id = new.company_id) then
      raise exception 'Позиция не принадлежит проекту' using errcode = '22023';
    end if;
    if not exists (select 1 from planfact.brigades b where b.id = new.brigade_id and b.company_id = new.company_id) then
      raise exception 'Бригада не принадлежит компании' using errcode = '22023';
    end if;
    return new;
  end if;
  -- UPDATE
  if coalesce(current_setting('planfact.fact_tx', true), '') <> '1' then
    raise exception 'Запись факта изменять нельзя — исправьте её с причиной' using errcode = '42501';
  end if;
  if (new.id, new.company_id, new.project_id, new.position_id, new.brigade_id, new.work_date, new.qty, new.workers, new.man_hours,
      new.note, new.corrects_id, new.correction_reason, new.batch_id, new.created_by, new.created_at)
     is distinct from
     (old.id, old.company_id, old.project_id, old.position_id, old.brigade_id, old.work_date, old.qty, old.workers, old.man_hours,
      old.note, old.corrects_id, old.correction_reason, old.batch_id, old.created_by, old.created_at) then
    raise exception 'Объём, дату и бригаду записи факта изменять нельзя' using errcode = '42501';
  end if;
  if old.status in ('rejected', 'superseded') and new.status is distinct from old.status then
    raise exception 'Закрытую запись факта изменять нельзя' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists fact_entries_guard on planfact.fact_entries;
create trigger fact_entries_guard before insert or update or delete on planfact.fact_entries
  for each row execute function planfact.fact_guard();

-- 6. RLS: чтение факта — по праву planfact.fact.view в проекте; бригады — члены компании; прямой записи нет
alter table planfact.brigades enable row level security;
alter table planfact.fact_entries enable row level security;
drop policy if exists brigades_select on planfact.brigades;
create policy brigades_select on planfact.brigades for select to authenticated
  using (planfact.is_company_member(company_id));
drop policy if exists fact_entries_select on planfact.fact_entries;
create policy fact_entries_select on planfact.fact_entries for select to authenticated
  using (planfact.has_permission(project_id, 'planfact.fact.view'));
revoke all on planfact.brigades, planfact.fact_entries from public, anon, authenticated;
grant select on planfact.brigades, planfact.fact_entries to authenticated;

-- 7. Служебные функции (клиенту не выдаются)
-- Проект для ввода факта: право planfact.fact.create (по проекту или на всю компанию), проект не в архиве. Возвращает компанию.
create or replace function planfact.require_fact_create(p_project uuid)
returns uuid language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_arch timestamptz;
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.fact.create') then
    raise exception 'Нет права вносить факт' using errcode = '42501';
  end if;
  select company_id, archived_at into v_company, v_arch from planfact.projects where id = p_project;
  if v_arch is not null then
    raise exception 'Проект в архиве — сначала верните его из архива' using errcode = '22023';
  end if;
  return v_company;
end $$;

-- Право подтверждать/отклонять и исправлять чужие записи; проект не в архиве. Возвращает компанию.
create or replace function planfact.require_fact_approve(p_project uuid)
returns uuid language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_arch timestamptz;
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.fact.approve') then
    raise exception 'Нет права подтверждать факт' using errcode = '42501';
  end if;
  select company_id, archived_at into v_company, v_arch from planfact.projects where id = p_project;
  if v_arch is not null then
    raise exception 'Проект в архиве — сначала верните его из архива' using errcode = '22023';
  end if;
  return v_company;
end $$;

-- Право вести справочник бригад: на всю компанию или хотя бы в одном её проекте.
create or replace function planfact.can_brigades_company(p_company uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select auth.uid() is not null and (planfact.has_company_permission(p_company, 'planfact.brigades.manage')
    or exists (select 1 from planfact.projects pr where pr.company_id = p_company
               and planfact.has_permission(pr.id, 'planfact.brigades.manage')));
$$;

-- Накопленный факт позиций проекта — ЕДИНСТВЕННЫЙ расчёт (экран, сводка, КС-2 берут его): Σ accepted; ждущие подтверждения — отдельно.
create or replace function planfact.fact_totals(p_project uuid)
returns table(position_id uuid, plan_qty numeric, fact_qty numeric, pending_qty numeric, pending_count int)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  select p.id, p.qty,
         coalesce(sum(e.qty) filter (where e.status = 'accepted'), 0),
         coalesce(sum(e.qty) filter (where e.status = 'pending_approval'), 0),
         (count(e.id) filter (where e.status = 'pending_approval'))::int
  from planfact.vor_positions p
  left join planfact.fact_entries e on e.position_id = p.id
  where p.project_id = p_project
  group by p.id, p.qty;
$$;

-- Дата «сегодня» для проверки «не в будущем» (Москва: у всех объектов MVP часовой пояс МСК).
create or replace function planfact.fact_today()
returns date language sql stable set search_path = pg_catalog as $$
  select (now() at time zone 'Europe/Moscow')::date;
$$;

-- Вставка записи факта: проверки полей, перебор плана, блокировка позиции. Возвращает {id, status}.
-- p_corrects — исправляемая запись (её объём вычитается из итога при проверке перебора).
create or replace function planfact.fact_insert(p_company uuid, p_project uuid, p_position uuid, p_brigade uuid, p_date date,
                                                p_qty numeric, p_workers int, p_man_hours numeric, p_note text,
                                                p_batch uuid, p_corrects uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_pos planfact.vor_positions; v_tol numeric; v_qty numeric := round(p_qty, 3); v_sum numeric; v_old planfact.fact_entries;
        v_status text; v_id uuid;
begin
  select * into v_pos from planfact.vor_positions where id = p_position and project_id = p_project for update;
  if v_pos.id is null then raise exception 'Позиция не найдена в проекте' using errcode = '22023'; end if;
  if p_brigade is null or not exists (select 1 from planfact.brigades b where b.id = p_brigade and b.company_id = p_company) then
    raise exception 'Укажите бригаду' using errcode = '22023';
  end if;
  if not exists (select 1 from planfact.brigades b where b.id = p_brigade and b.archived_at is null) then
    raise exception 'Бригада в архиве — выберите действующую' using errcode = '22023';
  end if;
  if v_qty is null or v_qty <= 0 then raise exception 'Объём должен быть больше нуля' using errcode = '22023'; end if;
  if p_date is null then raise exception 'Укажите дату' using errcode = '22023'; end if;
  if p_date > planfact.fact_today() then raise exception 'Дата не может быть в будущем' using errcode = '22023'; end if;
  if p_workers is not null and (p_workers < 0 or p_workers > 10000) then raise exception 'Неверное число людей' using errcode = '22023'; end if;
  if p_man_hours is not null and (p_man_hours < 0 or p_man_hours > 1000000) then raise exception 'Неверное число чел.-ч' using errcode = '22023'; end if;

  select fact_tolerance_pct into v_tol from planfact.projects where id = p_project;
  select coalesce(sum(qty), 0) into v_sum from planfact.fact_entries where position_id = p_position and status = 'accepted';
  if p_corrects is not null then
    select * into v_old from planfact.fact_entries where id = p_corrects;
    if v_old.status = 'accepted' then v_sum := v_sum - v_old.qty; end if;
  end if;
  -- Исправление, не увеличивающее прежний объём записи, подтверждения не требует (перебор уже согласован или уменьшается).
  v_status := case when v_sum + v_qty > v_pos.qty * (1 + v_tol / 100) and not (p_corrects is not null and v_qty <= v_old.qty)
                   then 'pending_approval' else 'accepted' end;

  perform set_config('planfact.fact_tx', '1', true);
  insert into planfact.fact_entries(company_id, project_id, position_id, brigade_id, work_date, qty, workers, man_hours, note,
                                    status, corrects_id, correction_reason, batch_id)
  values (p_company, p_project, p_position, p_brigade, p_date, v_qty, p_workers, p_man_hours, nullif(btrim(coalesce(p_note, '')), ''),
          v_status, p_corrects, nullif(btrim(coalesce(p_reason, '')), ''), p_batch)
  returning id into v_id;
  -- Исправление, не требующее подтверждения, сразу заменяет старую запись.
  if p_corrects is not null and v_status = 'accepted' and v_old.status in ('accepted', 'pending_approval') then
    update planfact.fact_entries set status = 'superseded', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_reason), '')
    where id = p_corrects;
  end if;
  perform set_config('planfact.fact_tx', '0', true);
  perform planfact.log_admin_change(p_company, p_project, 'fact_entries', v_id, case when p_corrects is null then 'INSERT' else 'CORRECT' end,
    case when p_corrects is not null then jsonb_build_object('entry', p_corrects, 'qty', v_old.qty) end,
    jsonb_build_object('position_id', p_position, 'qty', v_qty, 'status', v_status, 'work_date', p_date, 'batch_id', p_batch,
                       'reason', nullif(btrim(coalesce(p_reason, '')), '')));
  return jsonb_build_object('id', v_id, 'status', v_status);
exception when others then
  perform set_config('planfact.fact_tx', '0', true);
  raise;
end $$;

-- 8. Бригады: RPC
create or replace function public.pf_brigade_list(p_company uuid, p_archived boolean default false)
returns table(id uuid, name text, leader_name text, phone text, archived_at timestamptz, can_manage boolean)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_company is null or auth.uid() is null or not planfact.is_company_member(p_company) then
    raise exception 'Нет доступа к компании' using errcode = '42501';
  end if;
  return query
  select b.id, b.name, b.leader_name, b.phone, b.archived_at, planfact.can_brigades_company(p_company) from planfact.brigades b
  where b.company_id = p_company and (coalesce(p_archived, false) or b.archived_at is null)
  order by (b.archived_at is not null), lower(b.name), b.id;
end $$;

-- Создать (p_id = null) или изменить бригаду. Имя уникально среди действующих бригад компании.
create or replace function public.pf_brigade_save(p_company uuid, p_id uuid, p_name text, p_leader text default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_name text := btrim(coalesce(p_name, '')); v_id uuid := p_id; v_old planfact.brigades;
begin
  if p_company is null or auth.uid() is null or not planfact.can_brigades_company(p_company) then
    raise exception 'Нет права вести справочник бригад' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 120 then raise exception 'Укажите название бригады (до 120 знаков)' using errcode = '22023'; end if;
  if exists (select 1 from planfact.brigades b where b.company_id = p_company and b.archived_at is null
             and lower(btrim(b.name)) = lower(v_name) and b.id is distinct from p_id) then
    raise exception 'Бригада «%» уже есть', v_name using errcode = '23505';
  end if;
  if p_id is null then
    insert into planfact.brigades(company_id, name, leader_name, phone)
    values (p_company, v_name, nullif(btrim(coalesce(p_leader, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''))
    returning id into v_id;
    perform planfact.log_admin_change(p_company, null, 'brigades', v_id, 'INSERT', null, jsonb_build_object('name', v_name));
  else
    select * into v_old from planfact.brigades where id = p_id and company_id = p_company;
    if v_old.id is null then raise exception 'Бригада не найдена' using errcode = '22023'; end if;
    update planfact.brigades set name = v_name, leader_name = nullif(btrim(coalesce(p_leader, '')), ''),
           phone = nullif(btrim(coalesce(p_phone, '')), '') where id = p_id;
    perform planfact.log_admin_change(p_company, null, 'brigades', p_id, 'UPDATE', jsonb_build_object('name', v_old.name),
      jsonb_build_object('name', v_name));
  end if;
  return v_id;
end $$;

-- В архив / из архива. Вернуть из архива нельзя, если есть действующая бригада с таким именем.
create or replace function public.pf_brigade_archive(p_brigade uuid, p_archived boolean default true)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_b planfact.brigades;
begin
  select * into v_b from planfact.brigades where id = p_brigade;
  if v_b.id is null or auth.uid() is null or not planfact.can_brigades_company(v_b.company_id) then
    raise exception 'Нет права вести справочник бригад' using errcode = '42501';
  end if;
  if not coalesce(p_archived, true) and exists (select 1 from planfact.brigades b where b.company_id = v_b.company_id
       and b.archived_at is null and lower(btrim(b.name)) = lower(btrim(v_b.name)) and b.id <> v_b.id) then
    raise exception 'Бригада «%» уже есть среди действующих', v_b.name using errcode = '23505';
  end if;
  update planfact.brigades set archived_at = case when coalesce(p_archived, true) then coalesce(archived_at, now()) else null end
  where id = p_brigade;
  perform planfact.log_admin_change(v_b.company_id, null, 'brigades', p_brigade, case when coalesce(p_archived, true) then 'ARCHIVE' else 'RESTORE' end,
    null, jsonb_build_object('name', v_b.name));
end $$;

-- 9. Ввод факта
-- Одна запись. Возвращает {id, status}: accepted | pending_approval (перебор плана сверх допуска проекта).
create or replace function public.pf_fact_add(p_position uuid, p_brigade uuid, p_date date, p_qty numeric,
                                              p_workers int default null, p_man_hours numeric default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_project uuid; v_company uuid;
begin
  select project_id into v_project from planfact.vor_positions where id = p_position;
  if v_project is null then raise exception 'Позиция не найдена' using errcode = '22023'; end if;
  v_company := planfact.require_fact_create(v_project);
  return planfact.fact_insert(v_company, v_project, p_position, p_brigade, p_date, p_qty, p_workers, p_man_hours, p_note, null, null, null);
end $$;

-- Пачка «закрыть этаж»: одна бригада и дата на все строки; p_items = [{position_id, qty, man_hours?}] ≤ 500.
-- Любая ошибка откатывает всю пачку. Правило перебора — к каждой строке отдельно. Возвращает {batch_id, accepted, pending}.
create or replace function public.pf_fact_add_batch(p_project uuid, p_brigade uuid, p_date date, p_items jsonb,
                                                    p_workers int default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_batch uuid := gen_random_uuid(); it jsonb; v_res jsonb; v_acc int := 0; v_pen int := 0; v_seen uuid[] := '{}'; v_pos uuid;
begin
  v_company := planfact.require_fact_create(p_project);
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'В пачке нет строк' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'В пачке не больше 500 строк' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_pos := (it ->> 'position_id')::uuid;
    if v_pos is null or v_pos = any(v_seen) then raise exception 'Позиция указана дважды или не указана' using errcode = '22023'; end if;
    v_seen := v_seen || v_pos;
    v_res := planfact.fact_insert(v_company, p_project, v_pos, p_brigade, p_date, (it ->> 'qty')::numeric, p_workers,
                                  (it ->> 'man_hours')::numeric, p_note, v_batch, null, null);
    if v_res ->> 'status' = 'accepted' then v_acc := v_acc + 1; else v_pen := v_pen + 1; end if;
  end loop;
  return jsonb_build_object('batch_id', v_batch, 'accepted', v_acc, 'pending', v_pen);
end $$;

-- Исправление записи новой записью с причиной (p_qty = 0 — отмена, новая запись не создаётся).
-- Исправлять: автор своей записи (право fact.create) или любой при праве fact.approve. Только accepted / pending_approval.
-- Если новый объём даёт перебор — новая запись ждёт подтверждения, старая остаётся в итоге до решения РП.
create or replace function public.pf_fact_correct(p_entry uuid, p_qty numeric, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_e planfact.fact_entries; v_reason text := btrim(coalesce(p_reason, '')); v_company uuid; v_ok boolean;
begin
  select * into v_e from planfact.fact_entries where id = p_entry;
  if v_e.id is null or auth.uid() is null or not planfact.has_permission(v_e.project_id, 'planfact.fact.view') then
    raise exception 'Запись не найдена' using errcode = '22023';
  end if;
  v_ok := planfact.has_permission(v_e.project_id, 'planfact.fact.approve')
          or (v_e.created_by = auth.uid() and planfact.has_permission(v_e.project_id, 'planfact.fact.create'));
  if not v_ok then raise exception 'Нет права исправлять эту запись' using errcode = '42501'; end if;
  if exists (select 1 from planfact.projects where id = v_e.project_id and archived_at is not null) then
    raise exception 'Проект в архиве — сначала верните его из архива' using errcode = '22023';
  end if;
  if v_e.status not in ('accepted', 'pending_approval') then
    raise exception 'Эта запись уже закрыта — исправить её нельзя' using errcode = '22023';
  end if;
  if exists (select 1 from planfact.fact_entries c where c.corrects_id = p_entry and c.status in ('accepted', 'pending_approval')) then
    raise exception 'Запись уже исправлена — откройте историю' using errcode = '22023';
  end if;
  if v_reason = '' then raise exception 'Укажите причину исправления' using errcode = '22023'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Объём не может быть отрицательным' using errcode = '22023'; end if;
  v_company := v_e.company_id;
  -- блокировка позиции на время исправления (как при вводе)
  perform 1 from planfact.vor_positions where id = v_e.position_id for update;
  if round(p_qty, 3) = 0 then
    perform set_config('planfact.fact_tx', '1', true);
    update planfact.fact_entries set status = 'superseded', decided_by = auth.uid(), decided_at = now(), decision_note = v_reason
    where id = p_entry;
    perform set_config('planfact.fact_tx', '0', true);
    perform planfact.log_admin_change(v_company, v_e.project_id, 'fact_entries', p_entry, 'CANCEL',
      jsonb_build_object('qty', v_e.qty), jsonb_build_object('reason', v_reason));
    return jsonb_build_object('id', p_entry, 'status', 'superseded');
  end if;
  return planfact.fact_insert(v_company, v_e.project_id, v_e.position_id, v_e.brigade_id, v_e.work_date, p_qty, v_e.workers,
                              v_e.man_hours, coalesce(p_note, v_e.note), v_e.batch_id, p_entry, v_reason);
exception when others then
  perform set_config('planfact.fact_tx', '0', true);
  raise;
end $$;

-- Решение РП по перебору. p_approve = true — запись входит в итог (и заменяет исправляемую); false — отклонить (нужен комментарий).
create or replace function public.pf_fact_decide(p_entry uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_e planfact.fact_entries; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_e from planfact.fact_entries where id = p_entry;
  if v_e.id is null or auth.uid() is null or not planfact.has_permission(v_e.project_id, 'planfact.fact.view') then
    raise exception 'Запись не найдена' using errcode = '22023';
  end if;
  perform planfact.require_fact_approve(v_e.project_id);
  if v_e.status <> 'pending_approval' then raise exception 'Запись не ждёт подтверждения' using errcode = '22023'; end if;
  if not coalesce(p_approve, false) and v_note is null then raise exception 'Напишите причину отказа' using errcode = '22023'; end if;
  perform 1 from planfact.vor_positions where id = v_e.position_id for update;
  perform set_config('planfact.fact_tx', '1', true);
  update planfact.fact_entries set status = case when coalesce(p_approve, false) then 'accepted' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = v_note where id = p_entry;
  if coalesce(p_approve, false) and v_e.corrects_id is not null then
    update planfact.fact_entries set status = 'superseded', decided_by = auth.uid(), decided_at = now(),
           decision_note = coalesce(v_e.correction_reason, v_note)
    where id = v_e.corrects_id and status in ('accepted', 'pending_approval');
  end if;
  perform set_config('planfact.fact_tx', '0', true);
  perform planfact.log_admin_change(v_e.company_id, v_e.project_id, 'fact_entries', p_entry,
    case when coalesce(p_approve, false) then 'APPROVE' else 'REJECT' end,
    jsonb_build_object('qty', v_e.qty, 'status', v_e.status), jsonb_build_object('note', v_note));
exception when others then
  perform set_config('planfact.fact_tx', '0', true);
  raise;
end $$;

-- 10. Чтение
-- Накопленный факт позиций проекта (единый расчёт planfact.fact_totals).
create or replace function public.pf_fact_position_totals(p_project uuid)
returns table(position_id uuid, plan_qty numeric, fact_qty numeric, pending_qty numeric, pending_count int)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.fact.view') then
    raise exception 'Нет права видеть факт' using errcode = '42501';
  end if;
  return query select * from planfact.fact_totals(p_project);
end $$;

-- Работы места (p_location = null — весь проект) вместе с вложенными (этаж → квартиры): план, факт, ждёт подтверждения.
create or replace function public.pf_fact_positions(p_project uuid, p_location uuid default null)
returns table(position_id uuid, location_id uuid, location_path text, location_type text, work_type_id uuid, work_name text,
              unit_code text, plan_qty numeric, fact_qty numeric, pending_qty numeric, pending_count int, last_rejected_note text)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.fact.view') then
    raise exception 'Нет права видеть факт' using errcode = '42501';
  end if;
  if p_location is not null and not exists (select 1 from planfact.locations l where l.id = p_location and l.project_id = p_project and l.deleted_at is null) then
    raise exception 'Место не найдено' using errcode = '22023';
  end if;
  return query
  with recursive sub as (
    select l.id from planfact.locations l where l.project_id = p_project and l.deleted_at is null
      and ((p_location is null and l.parent_id is null) or l.id = p_location)
    union all
    select c.id from planfact.locations c join sub s on c.parent_id = s.id where c.deleted_at is null
  )
  select p.id, p.location_id, planfact.location_path(p.location_id), l.node_type, p.work_type_id, w.name, u.code,
         t.plan_qty, t.fact_qty, t.pending_qty, t.pending_count,
         (select e.decision_note from planfact.fact_entries e where e.position_id = p.id and e.status = 'rejected'
            order by e.decided_at desc, e.id desc limit 1)
  from planfact.vor_positions p
  join sub on sub.id = p.location_id
  join planfact.locations l on l.id = p.location_id
  join planfact.work_types w on w.id = p.work_type_id
  join planfact.units u on u.id = p.unit_id
  join planfact.fact_totals(p_project) t on t.position_id = p.id
  where p.project_id = p_project
  order by l.depth, l.sort_order, l.name, w.name, p.id;
end $$;

-- История позиции: все записи (в том числе заменённые и отклонённые), кто/когда/почему.
create or replace function public.pf_fact_history(p_position uuid)
returns table(id uuid, status text, qty numeric, work_date date, brigade_name text, workers int, man_hours numeric, note text,
              corrects_id uuid, correction_reason text, batch_id uuid, created_by_email text, created_at timestamptz,
              decided_by_email text, decided_at timestamptz, decision_note text)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_project uuid;
begin
  select p.project_id into v_project from planfact.vor_positions p where p.id = p_position;
  if v_project is null or auth.uid() is null or not planfact.has_permission(v_project, 'planfact.fact.view') then
    raise exception 'Нет права видеть факт' using errcode = '42501';
  end if;
  return query
  select e.id, e.status, e.qty, e.work_date, b.name, e.workers, e.man_hours, e.note, e.corrects_id, e.correction_reason, e.batch_id,
         cu.email::text, e.created_at, du.email::text, e.decided_at, e.decision_note
  from planfact.fact_entries e
  join planfact.brigades b on b.id = e.brigade_id
  left join auth.users cu on cu.id = e.created_by
  left join auth.users du on du.id = e.decided_by
  where e.position_id = p_position
  order by e.created_at desc, e.id desc;
end $$;

-- Очередь РП «На подтверждение» по проекту.
create or replace function public.pf_fact_pending(p_project uuid)
returns table(id uuid, position_id uuid, location_path text, work_name text, unit_code text, plan_qty numeric, fact_qty numeric,
              qty numeric, work_date date, brigade_name text, note text, corrects_id uuid, correction_reason text,
              created_by_email text, created_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  perform planfact.require_fact_approve(p_project);
  return query
  select e.id, e.position_id, planfact.location_path(p.location_id), w.name, u.code, t.plan_qty, t.fact_qty, e.qty, e.work_date,
         b.name, e.note, e.corrects_id, e.correction_reason, cu.email::text, e.created_at
  from planfact.fact_entries e
  join planfact.vor_positions p on p.id = e.position_id
  join planfact.work_types w on w.id = p.work_type_id
  join planfact.units u on u.id = p.unit_id
  join planfact.brigades b on b.id = e.brigade_id
  join planfact.fact_totals(p_project) t on t.position_id = e.position_id
  left join auth.users cu on cu.id = e.created_by
  where e.project_id = p_project and e.status = 'pending_approval'
  order by e.created_at, e.id;
end $$;

-- 11. Журнал компании: + бригады и факт (тело как в 008 + фильтр table_name)
drop function if exists public.pf_list_company_audit(uuid, int);
create function public.pf_list_company_audit(p_company uuid, p_limit int default 50)
returns table(at timestamptz, actor_email text, action text, record_id uuid, subject_email text, old_data jsonb, new_data jsonb,
              table_name text)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  perform planfact.require_roles_admin(p_company);
  return query
  select a.at, u.email::text, a.action, a.record_id, su.email::text, a.old_data, a.new_data, a.table_name
  from planfact.audit_log a
  left join auth.users u on u.id = a.actor
  left join auth.users su on su.id = (coalesce(a.new_data, a.old_data) ->> 'user_id')::uuid
  where a.company_id = p_company and a.table_name in ('company_roles', 'role_assignments', 'projects', 'locations', 'units',
                                                       'vor_imports', 'vor_profiles', 'work_types', 'vor_dictionary',
                                                       'price_items', 'overhead_templates', 'estimates', 'kp_revisions',
                                                       'brigades', 'fact_entries')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- 12. Права на выполнение
revoke all on function planfact.fact_guard(), planfact.require_fact_create(uuid), planfact.require_fact_approve(uuid),
  planfact.fact_totals(uuid), planfact.fact_today(),
  planfact.fact_insert(uuid, uuid, uuid, uuid, date, numeric, int, numeric, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function planfact.can_brigades_company(uuid) from public, anon;
grant execute on function planfact.can_brigades_company(uuid) to authenticated;
revoke all on function public.pf_brigade_list(uuid, boolean), public.pf_brigade_save(uuid, uuid, text, text, text),
  public.pf_brigade_archive(uuid, boolean), public.pf_fact_add(uuid, uuid, date, numeric, int, numeric, text),
  public.pf_fact_add_batch(uuid, uuid, date, jsonb, int, text), public.pf_fact_correct(uuid, numeric, text, text),
  public.pf_fact_decide(uuid, boolean, text), public.pf_fact_position_totals(uuid), public.pf_fact_positions(uuid, uuid),
  public.pf_fact_history(uuid), public.pf_fact_pending(uuid), public.pf_list_company_audit(uuid, int) from public, anon;
grant execute on function public.pf_brigade_list(uuid, boolean), public.pf_brigade_save(uuid, uuid, text, text, text),
  public.pf_brigade_archive(uuid, boolean), public.pf_fact_add(uuid, uuid, date, numeric, int, numeric, text),
  public.pf_fact_add_batch(uuid, uuid, date, jsonb, int, text), public.pf_fact_correct(uuid, numeric, text, text),
  public.pf_fact_decide(uuid, boolean, text), public.pf_fact_position_totals(uuid), public.pf_fact_positions(uuid, uuid),
  public.pf_fact_history(uuid), public.pf_fact_pending(uuid), public.pf_list_company_audit(uuid, int) to authenticated;
