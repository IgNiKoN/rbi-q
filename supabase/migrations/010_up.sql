-- P2-0008b. Проект КС-2: настройки проекта (договорная редакция КП, реквизиты, свой бланк), акты, неизменяемые редакции актов,
-- выдача и аннулирование. Только planfact.* и public.pf_*. Объекты RBI/Quality, Auth/PostgREST и Storage не затрагивает.
-- Применять после 009 — ФАЙЛОМ (урок 006a).
-- Запись — только через public.pf_* (security definer, право planfact.ks2.edit проверяется внутри, company_id берётся из проекта);
-- клиенту — только SELECT по RLS (planfact.ks2.view или planfact.ks2.edit).
-- Объём — ЕДИНЫЙ расчёт факта planfact.fact_totals (EXTEND: необязательные границы дат). Цены — только договорная редакция КП.
-- «Выставлено ранее» — только итог ПТО выданных (не аннулированных) актов.

-- 1. Действие просмотра и шаблоны ролей (матрица ТЗ, строка «Проект КС-2»: ПТО/РП/экономист — да (ks2.edit, есть с 002),
--    руководство — просмотр)
insert into planfact.permission_catalog(action, description) values
  ('planfact.ks2.view', 'Проект КС-2: просмотр')
on conflict (action) do nothing;
insert into planfact.role_template_permissions(template_code, action) values ('management', 'planfact.ks2.view')
on conflict do nothing;
-- Дозаполнение ролей, уже созданных из шаблона (свои роли с template_code is null не трогаем).
insert into planfact.company_role_permissions(role_id, company_id, action)
select r.id, r.company_id, 'planfact.ks2.view'
from planfact.company_roles r
where r.template_code = 'management'
on conflict do nothing;

-- 2. Факт за период: EXTEND единственного расчёта. Прежний вызов fact_totals(p_project) возвращает то же, что в 009.
drop function if exists planfact.fact_totals(uuid);
create or replace function planfact.fact_totals(p_project uuid, p_from date default null, p_to date default null)
returns table(position_id uuid, plan_qty numeric, fact_qty numeric, pending_qty numeric, pending_count int)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  select p.id, p.qty,
         coalesce(sum(e.qty) filter (where e.status = 'accepted'), 0),
         coalesce(sum(e.qty) filter (where e.status = 'pending_approval'), 0),
         (count(e.id) filter (where e.status = 'pending_approval'))::int
  from planfact.vor_positions p
  left join planfact.fact_entries e on e.position_id = p.id
       and (p_from is null or e.work_date >= p_from) and (p_to is null or e.work_date <= p_to)
  where p.project_id = p_project
  group by p.id, p.qty;
$$;

-- 3. Настройки КС-2 проекта
create table if not exists planfact.ks2_settings (
  project_id uuid primary key,
  company_id uuid not null,
  contract_kp_revision_id uuid references planfact.kp_revisions(id),
  requisites jsonb not null default '{}'::jsonb check (jsonb_typeof(requisites) = 'object'),
  template bytea check (template is null or octet_length(template) <= 2097152),
  template_name text check (template_name is null or length(template_name) <= 300),
  template_sha256 text check (template_sha256 is null or template_sha256 ~ '^[0-9a-f]{64}$'),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, company_id) references planfact.projects(id, company_id) on delete cascade
);

-- 4. Акты и редакции
create table if not exists planfact.ks2_acts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  project_id uuid not null,
  act_no text not null check (length(btrim(act_no)) between 1 and 50),
  act_date date not null,
  period_from date not null,
  period_to date not null,
  kp_revision_id uuid not null references planfact.kp_revisions(id),
  status text not null default 'draft' check (status in ('draft', 'issued', 'annulled')),
  issued_revision_id uuid,
  issued_by uuid,
  issued_at timestamptz,
  annul_reason text check (annul_reason is null or length(annul_reason) <= 1000),
  annulled_by uuid,
  annulled_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (period_from <= period_to),
  check ((status = 'draft') = (issued_revision_id is null)),
  check (status <> 'annulled' or annul_reason is not null),
  unique (id, project_id),
  foreign key (project_id, company_id) references planfact.projects(id, company_id) on delete cascade
);
create index if not exists ks2_acts_project_idx on planfact.ks2_acts(project_id, created_at desc);
-- Номер акта уникален среди неаннулированных актов проекта.
create unique index if not exists ks2_acts_no_uq on planfact.ks2_acts(project_id, lower(btrim(act_no))) where status <> 'annulled';

create table if not exists planfact.ks2_revisions (
  id uuid primary key default gen_random_uuid(),
  act_id uuid not null,
  project_id uuid not null,
  company_id uuid not null,
  revision_no int not null check (revision_no > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and jsonb_typeof(snapshot -> 'rows') = 'array'),
  total numeric not null check (total >= 0 and total < 1e15),
  note text check (note is null or length(note) <= 2000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (act_id, revision_no),
  foreign key (act_id, project_id) references planfact.ks2_acts(id, project_id)
);
alter table planfact.ks2_acts drop constraint if exists ks2_acts_issued_revision_fk;
alter table planfact.ks2_acts add constraint ks2_acts_issued_revision_fk foreign key (issued_revision_id) references planfact.ks2_revisions(id);

-- 5. Сторожа (второй рубеж после проверок в pf_*): редакции неизменяемы и добавляются только к черновику;
--    акт не удаляется; выданный акт меняется только на «аннулирован»; аннулированный — не меняется.
create or replace function planfact.ks2_revision_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog, planfact as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Редакцию акта КС-2 изменить или удалить нельзя — сохраните новую' using errcode = '42501';
  end if;
  if not exists (select 1 from planfact.ks2_acts a where a.id = new.act_id and a.project_id = new.project_id
                 and a.company_id = new.company_id and a.status = 'draft') then
    raise exception 'Акт уже выдан — новая редакция невозможна' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists ks2_revisions_guard on planfact.ks2_revisions;
create trigger ks2_revisions_guard before insert or update or delete on planfact.ks2_revisions
  for each row execute function planfact.ks2_revision_guard();

create or replace function planfact.ks2_act_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog, planfact as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Акт КС-2 удалить нельзя — аннулируйте его с причиной' using errcode = '42501';
  end if;
  if (new.id, new.company_id, new.project_id, new.created_by, new.created_at)
     is distinct from (old.id, old.company_id, old.project_id, old.created_by, old.created_at) then
    raise exception 'Принадлежность акта менять нельзя' using errcode = '42501';
  end if;
  if old.status = 'annulled' then
    raise exception 'Аннулированный акт изменить нельзя' using errcode = '42501';
  end if;
  if old.status = 'issued' and (new.status <> 'annulled'
     or (new.act_no, new.act_date, new.period_from, new.period_to, new.kp_revision_id, new.issued_revision_id, new.issued_by, new.issued_at)
        is distinct from (old.act_no, old.act_date, old.period_from, old.period_to, old.kp_revision_id, old.issued_revision_id, old.issued_by, old.issued_at)) then
    raise exception 'Выданный акт изменить нельзя — аннулируйте его с причиной' using errcode = '42501';
  end if;
  if old.status = 'draft' and new.status = 'annulled' then
    raise exception 'Аннулировать можно только выданный акт' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists ks2_acts_guard on planfact.ks2_acts;
create trigger ks2_acts_guard before update or delete on planfact.ks2_acts
  for each row execute function planfact.ks2_act_guard();

-- 6. RLS: чтение — право ks2.view или ks2.edit в проекте; прямой записи нет
create or replace function planfact.can_ks2_view(p_project uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select auth.uid() is not null and (planfact.has_permission(p_project, 'planfact.ks2.view')
                                     or planfact.has_permission(p_project, 'planfact.ks2.edit'));
$$;
alter table planfact.ks2_settings enable row level security;
alter table planfact.ks2_acts enable row level security;
alter table planfact.ks2_revisions enable row level security;
drop policy if exists ks2_settings_select on planfact.ks2_settings;
create policy ks2_settings_select on planfact.ks2_settings for select to authenticated using (planfact.can_ks2_view(project_id));
drop policy if exists ks2_acts_select on planfact.ks2_acts;
create policy ks2_acts_select on planfact.ks2_acts for select to authenticated using (planfact.can_ks2_view(project_id));
drop policy if exists ks2_revisions_select on planfact.ks2_revisions;
create policy ks2_revisions_select on planfact.ks2_revisions for select to authenticated using (planfact.can_ks2_view(project_id));
revoke all on planfact.ks2_settings, planfact.ks2_acts, planfact.ks2_revisions from public, anon, authenticated;
grant select on planfact.ks2_settings, planfact.ks2_acts, planfact.ks2_revisions to authenticated;

-- 7. Служебные функции (клиенту не выдаются)
-- Просмотр КС-2 проекта. Возвращает компанию.
create or replace function planfact.require_ks2_view(p_project uuid)
returns uuid language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid;
begin
  if p_project is null or not planfact.can_ks2_view(p_project) then
    raise exception 'Нет права видеть КС-2' using errcode = '42501';
  end if;
  select company_id into v_company from planfact.projects where id = p_project;
  return v_company;
end $$;

-- Правка КС-2: право ks2.edit, проект не в архиве. Возвращает компанию.
create or replace function planfact.require_ks2_edit(p_project uuid)
returns uuid language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_arch timestamptz;
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.ks2.edit') then
    raise exception 'Нет права вести КС-2' using errcode = '42501';
  end if;
  select company_id, archived_at into v_company, v_arch from planfact.projects where id = p_project;
  if v_arch is not null then
    raise exception 'Проект в архиве — сначала верните его из архива' using errcode = '22023';
  end if;
  return v_company;
end $$;

-- Договорная редакция КП проекта (или ошибка, если не выбрана).
create or replace function planfact.ks2_contract_kp(p_project uuid)
returns uuid language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_kp uuid;
begin
  select contract_kp_revision_id into v_kp from planfact.ks2_settings where project_id = p_project;
  if v_kp is null then
    raise exception 'Выберите договорную редакцию КП проекта' using errcode = '22023';
  end if;
  return v_kp;
end $$;

-- Предложение системы по строкам заказчика (ЕДИНЫЙ расчёт для экрана и сохранения).
-- total_qty — принятый факт по p_to включительно, разложенный через связки (× share); материал — объём родительской работы × норма
-- (нормы нет — отношение объёмов материала и работы в ВОР); prev_qty — итог ПТО выданных актов (кроме p_skip_act);
-- sys_qty = total_qty − prev_qty (не меньше 0) — ещё не закрытый факт; price — из редакции КП по row_no
-- (работа — работа + материал строки, если в ВОР у работы есть цена материала; материал — цена материала).
-- Строки без факта и без выставленного объёма не возвращаются.
create or replace function planfact.ks2_rows(p_project uuid, p_to date, p_kp uuid, p_skip_act uuid default null)
returns table(source_row_id uuid, import_id uuid, row_no int, number text, name text, unit_text text, kind text,
              total_qty numeric, prev_qty numeric, sys_qty numeric, price numeric)
language sql stable security definer set search_path = pg_catalog, planfact as $$
  with kp as (
    select k.snapshot, e.import_ids from planfact.kp_revisions k join planfact.estimates e on e.id = k.estimate_id
    where k.id = p_kp and k.project_id = p_project
  ), src as (
    select s.* from planfact.vor_source_rows s, kp
    where s.project_id = p_project and s.import_id = any(kp.import_ids) and s.kind in ('work', 'material')
  ), ft as (
    select * from planfact.fact_totals(p_project, null, p_to)
  ), wt as (
    select l.source_row_id, sum(ft.fact_qty * l.share) q
    from planfact.vor_links l join ft on ft.position_id = l.position_id
    where l.project_id = p_project group by l.source_row_id
  ), tot as (
    select s.id, round(case when s.kind = 'work' then coalesce(w.q, 0)
                            else coalesce(pw.q, 0) * coalesce(s.norm, case when par.qty > 0 then s.qty / par.qty end, 0) end, 3) t
    from src s
    left join wt w on w.source_row_id = s.id
    left join planfact.vor_source_rows par on par.id = s.parent_row_id
    left join wt pw on pw.source_row_id = s.parent_row_id
  ), prev as (
    select (r ->> 'source_row_id')::uuid id, sum((r ->> 'qty')::numeric) q
    from planfact.ks2_acts a
    join planfact.ks2_revisions v on v.id = a.issued_revision_id
    cross join jsonb_array_elements(v.snapshot -> 'rows') r
    where a.project_id = p_project and a.status = 'issued' and a.id is distinct from p_skip_act
      and not coalesce((r ->> 'excluded')::boolean, false)
    group by 1
  ), pr as (
    select (r ->> 'import_id')::uuid imp, (r ->> 'row_no')::int rn, (r ->> 'price_labor')::numeric pl, (r ->> 'price_material')::numeric pm
    from kp cross join jsonb_array_elements(kp.snapshot -> 'rows') r
  )
  select s.id, s.import_id, s.row_no, s.number, s.name, s.unit_text, s.kind,
         t.t, round(coalesce(p.q, 0), 3), greatest(t.t - round(coalesce(p.q, 0), 3), 0),
         case when s.kind = 'work' then case when pr.pl is null and pr.pm is null then null else coalesce(pr.pl, 0) + coalesce(pr.pm, 0) end
              else pr.pm end
  from src s
  join tot t on t.id = s.id
  cross join kp
  left join prev p on p.id = s.id
  left join pr on pr.imp = s.import_id and pr.rn = s.row_no
  where t.t > 0 or coalesce(p.q, 0) > 0
  order by array_position(kp.import_ids, s.import_id), s.row_no;
$$;

-- Шапка акта из присланного json: только известные поля, строки до 500 знаков.
create or replace function planfact.ks2_header(p jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog as $$
declare k text; v text; out jsonb := '{}'::jsonb;
begin
  foreach k in array array['investor', 'customer', 'contractor', 'construction', 'object', 'contract_no', 'contract_date',
                           'act_no', 'act_date', 'period_from', 'period_to', 'customer_signer', 'contractor_signer'] loop
    v := btrim(coalesce(p ->> k, ''));
    if length(v) > 500 then raise exception 'Слишком длинное поле шапки: %', k using errcode = '22023'; end if;
    out := out || jsonb_build_object(k, v);
  end loop;
  return out;
end $$;

-- 8. RPC: настройки и бланк
-- Настройки КС-2 проекта + список редакций КП проекта (для выбора договорной) + следующий номер акта.
create or replace function public.pf_ks2_settings(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_s planfact.ks2_settings; v_next int;
begin
  perform planfact.require_ks2_view(p_project);
  select * into v_s from planfact.ks2_settings where project_id = p_project;
  select coalesce(max((substring(act_no from '^\s*(\d{1,9})\s*$'))::int), 0) + 1 into v_next
  from planfact.ks2_acts where project_id = p_project and status <> 'annulled';
  return jsonb_build_object(
    'contract_kp_revision_id', v_s.contract_kp_revision_id,
    'requisites', coalesce(v_s.requisites, '{}'::jsonb),
    'template_name', v_s.template_name, 'template_sha256', v_s.template_sha256,
    'template_size', octet_length(v_s.template),
    'can_edit', planfact.has_permission(p_project, 'planfact.ks2.edit')
                and not exists (select 1 from planfact.projects where id = p_project and archived_at is not null),
    'next_act_no', v_next::text,
    'kp_revisions', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'estimate_name', e.name, 'revision_no', k.revision_no,
                                                                  'total', k.total, 'created_at', k.created_at)
                                               order by k.created_at desc)
                              from planfact.kp_revisions k join planfact.estimates e on e.id = k.estimate_id
                              where k.project_id = p_project), '[]'::jsonb));
end $$;

-- Выбрать договорную редакцию КП проекта.
create or replace function public.pf_ks2_set_contract(p_project uuid, p_kp_revision uuid)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_old uuid;
begin
  v_company := planfact.require_ks2_edit(p_project);
  if p_kp_revision is null or not exists (select 1 from planfact.kp_revisions where id = p_kp_revision and project_id = p_project) then
    raise exception 'Редакция КП не найдена в проекте' using errcode = '22023';
  end if;
  select contract_kp_revision_id into v_old from planfact.ks2_settings where project_id = p_project;
  insert into planfact.ks2_settings(project_id, company_id, contract_kp_revision_id) values (p_project, v_company, p_kp_revision)
  on conflict (project_id) do update set contract_kp_revision_id = excluded.contract_kp_revision_id, updated_by = auth.uid(), updated_at = now();
  perform planfact.log_admin_change(v_company, p_project, 'ks2_settings', p_project, 'CONTRACT_KP',
    jsonb_build_object('kp_revision_id', v_old), jsonb_build_object('kp_revision_id', p_kp_revision));
end $$;

-- Свой бланк КС-2 (.xlsx в base64, ≤ 2 МБ). p_data = null — убрать бланк (будет унифицированная форма).
create or replace function public.pf_ks2_template_save(p_project uuid, p_name text, p_data text)
returns text language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_bytes bytea; v_sha text; v_name text := btrim(coalesce(p_name, ''));
begin
  v_company := planfact.require_ks2_edit(p_project);
  if p_data is not null then
    begin v_bytes := decode(p_data, 'base64');
    exception when others then raise exception 'Файл бланка повреждён' using errcode = '22023'; end;
    if octet_length(v_bytes) > 2097152 then raise exception 'Бланк больше 2 МБ' using errcode = '22023'; end if;
    if octet_length(v_bytes) < 4 or substring(v_bytes from 1 for 2) <> '\x504b'::bytea then
      raise exception 'Бланк должен быть файлом .xlsx' using errcode = '22023';
    end if;
    if v_name = '' or length(v_name) > 300 then raise exception 'Укажите имя файла бланка' using errcode = '22023'; end if;
    v_sha := encode(sha256(v_bytes), 'hex');
  end if;
  insert into planfact.ks2_settings(project_id, company_id, template, template_name, template_sha256)
  values (p_project, v_company, v_bytes, case when v_bytes is null then null else v_name end, v_sha)
  on conflict (project_id) do update set template = excluded.template, template_name = excluded.template_name,
    template_sha256 = excluded.template_sha256, updated_by = auth.uid(), updated_at = now();
  perform planfact.log_admin_change(v_company, p_project, 'ks2_settings', p_project, case when v_bytes is null then 'TEMPLATE_CLEAR' else 'TEMPLATE' end,
    null, case when v_bytes is null then null else jsonb_build_object('name', v_name, 'sha256', v_sha, 'size', octet_length(v_bytes)) end);
  return v_sha;
end $$;

-- Бланк проекта (base64) или null.
create or replace function public.pf_ks2_template(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_s planfact.ks2_settings;
begin
  perform planfact.require_ks2_view(p_project);
  select * into v_s from planfact.ks2_settings where project_id = p_project;
  if v_s.template is null then return null; end if;
  return jsonb_build_object('name', v_s.template_name, 'sha256', v_s.template_sha256, 'data', encode(v_s.template, 'base64'));
end $$;

-- 9. RPC: акты
-- Список актов проекта: последняя редакция, её сумма, число редакций.
create or replace function public.pf_ks2_acts(p_project uuid)
returns table(id uuid, act_no text, act_date date, period_from date, period_to date, status text, total numeric, revisions int,
              last_revision_id uuid, issued_at timestamptz, issued_by_email text, annul_reason text, annulled_at timestamptz,
              created_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  perform planfact.require_ks2_view(p_project);
  return query
  select a.id, a.act_no, a.act_date, a.period_from, a.period_to, a.status, lr.total, (select count(*)::int from planfact.ks2_revisions v where v.act_id = a.id),
         lr.id, a.issued_at, iu.email::text, a.annul_reason, a.annulled_at, a.created_at
  from planfact.ks2_acts a
  left join lateral (select v.id, v.total from planfact.ks2_revisions v where v.act_id = a.id
                     and (a.issued_revision_id is null or v.id = a.issued_revision_id)
                     order by v.revision_no desc limit 1) lr on true
  left join auth.users iu on iu.id = a.issued_by
  where a.project_id = p_project
  order by a.created_at desc, a.id desc;
end $$;

-- Новый черновик акта за период (цены — договорная редакция КП проекта). Возвращает id.
create or replace function public.pf_ks2_act_create(p_project uuid, p_act_no text, p_act_date date, p_from date, p_to date)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_kp uuid; v_no text := btrim(coalesce(p_act_no, '')); v_id uuid;
begin
  v_company := planfact.require_ks2_edit(p_project);
  v_kp := planfact.ks2_contract_kp(p_project);
  if v_no = '' or length(v_no) > 50 then raise exception 'Укажите номер акта (до 50 знаков)' using errcode = '22023'; end if;
  if p_act_date is null or p_from is null or p_to is null then raise exception 'Укажите дату акта и период' using errcode = '22023'; end if;
  if p_from > p_to then raise exception 'Начало периода позже конца' using errcode = '22023'; end if;
  if exists (select 1 from planfact.ks2_acts where project_id = p_project and status <> 'annulled' and lower(btrim(act_no)) = lower(v_no)) then
    raise exception 'Акт № % уже есть', v_no using errcode = '23505';
  end if;
  insert into planfact.ks2_acts(company_id, project_id, act_no, act_date, period_from, period_to, kp_revision_id)
  values (v_company, p_project, v_no, p_act_date, p_from, p_to, v_kp) returning id into v_id;
  perform planfact.log_admin_change(v_company, p_project, 'ks2_acts', v_id, 'INSERT', null,
    jsonb_build_object('act_no', v_no, 'period_from', p_from, 'period_to', p_to, 'kp_revision_id', v_kp));
  return v_id;
end $$;

-- Акт: шапка, статус, предложение системы (для черновика — пересчёт на сейчас по договорной КП) и последняя редакция.
create or replace function public.pf_ks2_act(p_act uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_a planfact.ks2_acts; v_kp uuid; v_last planfact.ks2_revisions;
begin
  select * into v_a from planfact.ks2_acts where id = p_act;
  if v_a.id is null or not planfact.can_ks2_view(v_a.project_id) then raise exception 'Акт не найден' using errcode = '22023'; end if;
  select * into v_last from planfact.ks2_revisions v where v.act_id = p_act
    and (v_a.issued_revision_id is null or v.id = v_a.issued_revision_id) order by v.revision_no desc limit 1;
  if v_a.status = 'draft' then
    select contract_kp_revision_id into v_kp from planfact.ks2_settings where project_id = v_a.project_id;
  end if;
  return jsonb_build_object(
    'act', to_jsonb(v_a) - 'company_id',
    'requisites', coalesce((select requisites from planfact.ks2_settings where project_id = v_a.project_id), '{}'::jsonb),
    'proposal', case when v_a.status = 'draft' then coalesce((
       select jsonb_agg(to_jsonb(r)) from planfact.ks2_rows(v_a.project_id, v_a.period_to, coalesce(v_kp, v_a.kp_revision_id), v_a.id) r), '[]'::jsonb) end,
    'last_revision', case when v_last.id is null then null else jsonb_build_object('id', v_last.id, 'revision_no', v_last.revision_no,
       'snapshot', v_last.snapshot, 'total', v_last.total, 'created_at', v_last.created_at) end);
end $$;

-- Сохранить редакцию черновика. p_header — шапка; p_rows = [{source_row_id, qty, price, excluded}] — итог ПТО
-- (строки, которых нет в p_rows, берутся по предложению системы). Предложение, «с начала работ» и «выставлено ранее»
-- пересчитывает сервер. Номер и дата акта берутся из шапки; реквизиты запоминаются для следующих актов. Возвращает № редакции.
create or replace function public.pf_ks2_save(p_act uuid, p_header jsonb, p_rows jsonb, p_note text default null)
returns int language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_a planfact.ks2_acts; v_company uuid; v_kp uuid; v_h jsonb; v_no text; v_date date; v_rows jsonb := '[]'::jsonb;
        v_total numeric := 0; v_rev int; r record; e jsonb; v_qty numeric; v_price numeric; v_exc boolean; v_ids uuid[] := '{}';
begin
  select * into v_a from planfact.ks2_acts where id = p_act for update;
  if v_a.id is null or not planfact.can_ks2_view(v_a.project_id) then raise exception 'Акт не найден' using errcode = '22023'; end if;
  v_company := planfact.require_ks2_edit(v_a.project_id);
  if v_a.status <> 'draft' then raise exception 'Акт уже выдан — изменить его нельзя' using errcode = '42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Нет строк акта' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 20000 then raise exception 'Слишком много строк' using errcode = '22023'; end if;
  v_kp := planfact.ks2_contract_kp(v_a.project_id);

  v_h := planfact.ks2_header(coalesce(p_header, '{}'::jsonb));
  v_no := nullif(v_h ->> 'act_no', '');
  if v_no is null then v_no := v_a.act_no; end if;
  if length(v_no) > 50 then raise exception 'Номер акта — до 50 знаков' using errcode = '22023'; end if;
  begin v_date := coalesce(nullif(v_h ->> 'act_date', '')::date, v_a.act_date);
  exception when others then raise exception 'Неверная дата акта' using errcode = '22023'; end;
  if (v_h ->> 'contract_date') <> '' then
    begin perform (v_h ->> 'contract_date')::date;
    exception when others then raise exception 'Неверная дата договора' using errcode = '22023'; end;
  end if;
  if exists (select 1 from planfact.ks2_acts where project_id = v_a.project_id and id <> p_act and status <> 'annulled'
             and lower(btrim(act_no)) = lower(v_no)) then
    raise exception 'Акт № % уже есть', v_no using errcode = '23505';
  end if;
  v_h := v_h || jsonb_build_object('act_no', v_no, 'act_date', v_date::text, 'period_from', v_a.period_from::text, 'period_to', v_a.period_to::text);

  for r in select * from planfact.ks2_rows(v_a.project_id, v_a.period_to, v_kp, p_act) loop
    v_ids := v_ids || r.source_row_id;
    select x.v into e from jsonb_array_elements(p_rows) as x(v) where (x.v ->> 'source_row_id') = r.source_row_id::text limit 1;
    if e is null then
      v_qty := r.sys_qty; v_price := r.price; v_exc := false;
    else
      begin
        v_qty := round((e ->> 'qty')::numeric, 3);
        v_price := case when e ->> 'price' is null then null else round((e ->> 'price')::numeric, 2) end;
        v_exc := coalesce((e ->> 'excluded')::boolean, false);
      exception when others then raise exception 'Неверное число в строке %', r.row_no using errcode = '22023'; end;
      if v_qty is null or v_qty < 0 or v_qty >= 1e9 then raise exception 'Неверный объём в строке %', r.row_no using errcode = '22023'; end if;
      if v_price is not null and (v_price < 0 or v_price >= 1e12) then raise exception 'Неверная цена в строке %', r.row_no using errcode = '22023'; end if;
    end if;
    v_rows := v_rows || jsonb_build_object('source_row_id', r.source_row_id, 'import_id', r.import_id, 'row_no', r.row_no,
      'number', coalesce(r.number, ''), 'name', r.name, 'unit', coalesce(r.unit_text, ''), 'kind', r.kind,
      'sys_qty', r.sys_qty, 'sys_price', r.price, 'qty', v_qty, 'price', v_price, 'excluded', v_exc,
      'total_qty', r.total_qty, 'prev_qty', r.prev_qty);
    if not v_exc and v_qty > 0 then v_total := v_total + round(v_qty * coalesce(v_price, 0), 2); end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_rows) as x(v) where not coalesce((x.v ->> 'source_row_id') = any(v_ids::text[]), false)) then
    raise exception 'Строка не входит в акт (нет факта по ней) — обновите экран' using errcode = '22023';
  end if;

  select coalesce(max(revision_no), 0) + 1 into v_rev from planfact.ks2_revisions where act_id = p_act;
  insert into planfact.ks2_revisions(act_id, project_id, company_id, revision_no, snapshot, total, note)
  values (p_act, v_a.project_id, v_company, v_rev,
          jsonb_build_object('version', 1, 'header', v_h, 'rows', v_rows, 'kp_revision_id', v_kp), v_total,
          nullif(btrim(coalesce(p_note, '')), ''));
  update planfact.ks2_acts set act_no = v_no, act_date = v_date, kp_revision_id = v_kp where id = p_act;
  insert into planfact.ks2_settings(project_id, company_id, requisites)
  values (v_a.project_id, v_company, v_h - array['act_no', 'act_date', 'period_from', 'period_to'])
  on conflict (project_id) do update set requisites = excluded.requisites, updated_by = auth.uid(), updated_at = now();
  perform planfact.log_admin_change(v_company, v_a.project_id, 'ks2_acts', p_act, 'REVISION', null,
    jsonb_build_object('revision_no', v_rev, 'total', v_total, 'act_no', v_no));
  return v_rev;
end $$;

-- Выдать акт: фиксирует последнюю редакцию. Нельзя без строк, без цен, и если после сохранения выдан другой акт по тем же строкам.
create or replace function public.pf_ks2_issue(p_act uuid)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_a planfact.ks2_acts; v_company uuid; v_last planfact.ks2_revisions; n int;
begin
  select * into v_a from planfact.ks2_acts where id = p_act;
  if v_a.id is null or not planfact.can_ks2_view(v_a.project_id) then raise exception 'Акт не найден' using errcode = '22023'; end if;
  v_company := planfact.require_ks2_edit(v_a.project_id);
  -- одна выдача за раз в проекте: блокировка всех актов проекта
  perform 1 from planfact.ks2_acts where project_id = v_a.project_id order by id for update;
  select * into v_a from planfact.ks2_acts where id = p_act;
  if v_a.status <> 'draft' then raise exception 'Акт уже выдан' using errcode = '22023'; end if;
  select * into v_last from planfact.ks2_revisions where act_id = p_act order by revision_no desc limit 1;
  if v_last.id is null then raise exception 'Сначала сохраните акт' using errcode = '22023'; end if;
  select count(*) into n from jsonb_array_elements(v_last.snapshot -> 'rows') r
  where not (r ->> 'excluded')::boolean and (r ->> 'qty')::numeric > 0;
  if n = 0 then raise exception 'В акте нет ни одной строки с объёмом' using errcode = '22023'; end if;
  select count(*) into n from jsonb_array_elements(v_last.snapshot -> 'rows') r
  where not (r ->> 'excluded')::boolean and (r ->> 'qty')::numeric > 0 and r ->> 'price' is null;
  if n > 0 then raise exception 'Нет цены у % строк(и) — акт без цен выдать нельзя', n using errcode = '22023'; end if;
  select count(*) into n
  from jsonb_array_elements(v_last.snapshot -> 'rows') r
  join planfact.ks2_rows(v_a.project_id, v_a.period_to, (v_last.snapshot ->> 'kp_revision_id')::uuid, p_act) k
       on k.source_row_id = (r ->> 'source_row_id')::uuid
  where not (r ->> 'excluded')::boolean and (r ->> 'qty')::numeric > 0 and k.prev_qty > (r ->> 'prev_qty')::numeric;
  if n > 0 then
    raise exception 'После сохранения выдан другой акт по тем же строкам (%) — откройте акт и сохраните заново', n using errcode = '22023';
  end if;
  update planfact.ks2_acts set status = 'issued', issued_revision_id = v_last.id, issued_by = auth.uid(), issued_at = now() where id = p_act;
  perform planfact.log_admin_change(v_company, v_a.project_id, 'ks2_acts', p_act, 'ISSUE', null,
    jsonb_build_object('revision_no', v_last.revision_no, 'total', v_last.total, 'act_no', v_a.act_no));
end $$;

-- Аннулировать выданный акт с причиной — его объёмы снова доступны следующим актам.
create or replace function public.pf_ks2_annul(p_act uuid, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_a planfact.ks2_acts; v_company uuid; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_a from planfact.ks2_acts where id = p_act for update;
  if v_a.id is null or not planfact.can_ks2_view(v_a.project_id) then raise exception 'Акт не найден' using errcode = '22023'; end if;
  v_company := planfact.require_ks2_edit(v_a.project_id);
  if v_a.status <> 'issued' then raise exception 'Аннулировать можно только выданный акт' using errcode = '22023'; end if;
  if v_reason = '' or length(v_reason) > 1000 then raise exception 'Укажите причину аннулирования' using errcode = '22023'; end if;
  update planfact.ks2_acts set status = 'annulled', annul_reason = v_reason, annulled_by = auth.uid(), annulled_at = now() where id = p_act;
  perform planfact.log_admin_change(v_company, v_a.project_id, 'ks2_acts', p_act, 'ANNUL', null,
    jsonb_build_object('reason', v_reason, 'act_no', v_a.act_no));
end $$;

-- История редакций акта (без снимков) и одна редакция целиком.
create or replace function public.pf_ks2_revisions(p_act uuid)
returns table(id uuid, revision_no int, total numeric, note text, created_by_email text, created_at timestamptz, issued boolean)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_a planfact.ks2_acts;
begin
  select * into v_a from planfact.ks2_acts a where a.id = p_act;
  if v_a.id is null or not planfact.can_ks2_view(v_a.project_id) then raise exception 'Акт не найден' using errcode = '22023'; end if;
  return query
  select v.id, v.revision_no, v.total, v.note, u.email::text, v.created_at, v.id = v_a.issued_revision_id
  from planfact.ks2_revisions v left join auth.users u on u.id = v.created_by
  where v.act_id = p_act order by v.revision_no desc;
end $$;

create or replace function public.pf_ks2_revision(p_revision uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v planfact.ks2_revisions;
begin
  select * into v from planfact.ks2_revisions where id = p_revision;
  if v.id is null or not planfact.can_ks2_view(v.project_id) then raise exception 'Редакция не найдена' using errcode = '22023'; end if;
  return jsonb_build_object('id', v.id, 'act_id', v.act_id, 'revision_no', v.revision_no, 'snapshot', v.snapshot, 'total', v.total,
                            'created_at', v.created_at);
end $$;

-- 10. Журнал компании: + КС-2 (тело как в 009 + фильтр table_name)
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
                                                       'brigades', 'fact_entries', 'ks2_settings', 'ks2_acts')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- 11. Права на выполнение
revoke all on function planfact.fact_totals(uuid, date, date), planfact.ks2_revision_guard(), planfact.ks2_act_guard(),
  planfact.require_ks2_view(uuid), planfact.require_ks2_edit(uuid), planfact.ks2_contract_kp(uuid),
  planfact.ks2_rows(uuid, date, uuid, uuid), planfact.ks2_header(jsonb) from public, anon, authenticated;
revoke all on function planfact.can_ks2_view(uuid) from public, anon;
grant execute on function planfact.can_ks2_view(uuid) to authenticated;
revoke all on function public.pf_ks2_settings(uuid), public.pf_ks2_set_contract(uuid, uuid), public.pf_ks2_template_save(uuid, text, text),
  public.pf_ks2_template(uuid), public.pf_ks2_acts(uuid), public.pf_ks2_act_create(uuid, text, date, date, date), public.pf_ks2_act(uuid),
  public.pf_ks2_save(uuid, jsonb, jsonb, text), public.pf_ks2_issue(uuid), public.pf_ks2_annul(uuid, text), public.pf_ks2_revisions(uuid),
  public.pf_ks2_revision(uuid), public.pf_list_company_audit(uuid, int) from public, anon;
grant execute on function public.pf_ks2_settings(uuid), public.pf_ks2_set_contract(uuid, uuid), public.pf_ks2_template_save(uuid, text, text),
  public.pf_ks2_template(uuid), public.pf_ks2_acts(uuid), public.pf_ks2_act_create(uuid, text, date, date, date), public.pf_ks2_act(uuid),
  public.pf_ks2_save(uuid, jsonb, jsonb, text), public.pf_ks2_issue(uuid), public.pf_ks2_annul(uuid, text), public.pf_ks2_revisions(uuid),
  public.pf_ks2_revision(uuid), public.pf_list_company_audit(uuid, int) to authenticated;
