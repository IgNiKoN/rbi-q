-- P2-0006c. Справочник цен компании, тендерная смета с настраиваемыми надбавками, КП в форме заказчика и редакции КП.
-- Только planfact.* и public.pf_*. Объекты RBI/Quality, Auth/PostgREST и Storage не затрагивает (файл КП не хранится —
-- только снимок цен и итогов и SHA-256 исходника). Таблицы и функции 007 не меняются (кроме pf_list_company_audit — список таблиц).
-- Применять после 007 — ФАЙЛОМ (не через буфер обмена: урок 006a).
-- Цены — коммерческая тайна: читать и менять цены, шаблон надбавок, сметы и КП может только обладатель права
-- planfact.estimate.manage (прораб — нет). Запись — только через public.pf_* (security definer, право внутри,
-- company_id берётся из проекта); клиенту — только SELECT по RLS. Редакция КП неизменяема (функций изменения нет + триггер).

-- 1. Действие каталога и шаблоны ролей
insert into planfact.permission_catalog(action, description) values
  ('planfact.estimate.manage', 'Цены, шаблон надбавок, сметы и КП (коммерческая тайна: просмотр и изменение)')
on conflict (action) do nothing;

insert into planfact.role_template_permissions(template_code, action)
select t.code, 'planfact.estimate.manage' from (values ('company_admin'), ('project_manager'), ('pto')) t(code)
on conflict do nothing;

-- Дозаполнение ролей, уже созданных из этих шаблонов (свои роли с template_code is null не трогаем).
insert into planfact.company_role_permissions(role_id, company_id, action)
select r.id, r.company_id, p.action
from planfact.company_roles r
join planfact.role_template_permissions p on p.template_code = r.template_code
where r.template_code in ('company_admin', 'project_manager', 'pto') and p.action = 'planfact.estimate.manage'
on conflict do nothing;

-- 2. Справочник цен компании (работы — по виду работ; материалы — по нормализованному наименованию и ЕИ строки)
create table if not exists planfact.price_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references planfact.companies(id) on delete cascade,
  kind text not null check (kind in ('work', 'material')),
  work_type_id uuid references planfact.work_types(id),
  name text not null check (length(btrim(name)) between 1 and 500),
  canon_name text not null,
  unit_text text not null default '',                                  -- ЕИ материала (нормализованная), '' — без ЕИ
  price_labor numeric check (price_labor >= 0 and price_labor < 1e12),       -- расценка работы
  price_material numeric check (price_material >= 0 and price_material < 1e12), -- цена материала / «материалы в составе работы»
  price_date date not null default current_date,
  note text check (length(note) <= 2000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((kind = 'work') = (work_type_id is not null))
);
create unique index if not exists price_items_work_uq on planfact.price_items(company_id, work_type_id)
  where kind = 'work' and deleted_at is null;
create unique index if not exists price_items_material_uq on planfact.price_items(company_id, canon_name, unit_text)
  where kind = 'material' and deleted_at is null;

create table if not exists planfact.price_history (
  id bigint generated always as identity primary key,
  company_id uuid not null references planfact.companies(id) on delete cascade,
  price_item_id uuid not null references planfact.price_items(id) on delete cascade,
  old_labor numeric, new_labor numeric, old_material numeric, new_material numeric,
  price_date date not null,
  source text not null check (source ~ '^(manual|import:[0-9a-f-]{36}|estimate:[0-9a-f-]{36})$'),
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index if not exists price_history_item_idx on planfact.price_history(price_item_id, changed_at desc);

-- 3. Шаблон надбавок компании (один на компанию) и его строки.
-- Строка: section — закрытый список; method — закрытый список (произвольных формул нет):
--   percent_of — params.percent % от суммы базы; qty_rate — произведение params.factors (чел. × мес. × ставка);
--   fixed — params.amount; gross_up — досчёт до 100 % по доле params.share: база ÷ share × 100 − база («÷ 78 × 100»).
-- base = {totals: ['labor'|'material'], sections: [...], lines: [key...]} — сумма итогов сметы, секций (строк «в итог») и строк.
create table if not exists planfact.overhead_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references planfact.companies(id) on delete cascade,
  name text not null default 'Шаблон надбавок компании',
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists planfact.overhead_lines (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references planfact.overhead_templates(id) on delete cascade,
  company_id uuid not null,
  sort int not null,
  key text not null check (key ~ '^[A-Za-z0-9_-]{1,40}$'),
  section text not null check (section in ('materials', 'fot_smr', 'fot_itr', 'household', 'other', 'profit', 'office', 'vat')),
  name text not null check (length(btrim(name)) between 1 and 300),
  comment text check (length(comment) <= 2000),
  method text not null check (method in ('percent_of', 'qty_rate', 'fixed', 'gross_up')),
  base jsonb not null default '{}'::jsonb,
  params jsonb not null default '{}'::jsonb,
  in_total boolean not null default true,
  unique (template_id, key)
);

-- 4. Сметы проекта (по одной или нескольким подтверждённым загрузкам ВОР), цены строк, копия надбавок
create table if not exists planfact.estimates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  project_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 300),
  import_ids uuid[] not null check (cardinality(import_ids) between 1 and 20),
  area_m2 numeric check (area_m2 > 0 and area_m2 < 1e9),
  status text not null default 'draft' check (status in ('draft')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (project_id, company_id) references planfact.projects(id, company_id) on delete cascade
);
create index if not exists estimates_project_idx on planfact.estimates(project_id, created_at desc);

-- Цена строки сметы. Объёмы и нормы не копируются — берутся из vor_source_rows (единый источник).
create table if not exists planfact.estimate_rows (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null,
  project_id uuid not null,
  source_row_id uuid not null references planfact.vor_source_rows(id),
  price_labor numeric check (price_labor >= 0 and price_labor < 1e12),
  price_material numeric check (price_material >= 0 and price_material < 1e12),
  price_source text not null default 'none' check (price_source in ('reference', 'manual', 'none')),
  price_item_id uuid references planfact.price_items(id),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (estimate_id, source_row_id),
  foreign key (estimate_id, project_id) references planfact.estimates(id, project_id) on delete cascade
);

create table if not exists planfact.estimate_overheads (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null,
  project_id uuid not null,
  sort int not null,
  key text not null check (key ~ '^[A-Za-z0-9_-]{1,40}$'),
  section text not null check (section in ('materials', 'fot_smr', 'fot_itr', 'household', 'other', 'profit', 'office', 'vat')),
  name text not null check (length(btrim(name)) between 1 and 300),
  comment text check (length(comment) <= 2000),
  method text not null check (method in ('percent_of', 'qty_rate', 'fixed', 'gross_up')),
  base jsonb not null default '{}'::jsonb,
  params jsonb not null default '{}'::jsonb,
  in_total boolean not null default true,
  unique (estimate_id, key),
  foreign key (estimate_id, project_id) references planfact.estimates(id, project_id) on delete cascade
);

-- 5. Редакции КП — неизменяемый снимок (LP-09): цены по row_no каждой загрузки, надбавки, итоги, ₽/м²
create table if not exists planfact.kp_revisions (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null,
  project_id uuid not null,
  company_id uuid not null,
  revision_no int not null check (revision_no > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  total numeric not null check (total >= 0 and total < 1e15),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  note text check (length(note) <= 2000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (estimate_id, revision_no),
  foreign key (estimate_id, project_id) references planfact.estimates(id, project_id)
);

create or replace function planfact.kp_guard_immutable()
returns trigger language plpgsql security definer set search_path = pg_catalog, planfact as $$
begin
  raise exception 'Редакцию КП изменить или удалить нельзя — сформируйте новую' using errcode = '42501';
end $$;
drop trigger if exists kp_revisions_guard on planfact.kp_revisions;
create trigger kp_revisions_guard before update or delete on planfact.kp_revisions for each row execute function planfact.kp_guard_immutable();

-- 6. Служебные функции (клиенту не выдаются)
-- Право работать с ценами компании: на всю компанию или хотя бы в одном её проекте.
create or replace function planfact.can_estimate_company(p_company uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, planfact as $$
  select auth.uid() is not null and (planfact.has_company_permission(p_company, 'planfact.estimate.manage')
    or exists (select 1 from planfact.projects pr where pr.company_id = p_company
               and planfact.has_permission(pr.id, 'planfact.estimate.manage')));
$$;

create or replace function planfact.require_estimate_company(p_company uuid)
returns void language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_company is null or not planfact.can_estimate_company(p_company) then
    raise exception 'Нет права работать с ценами и сметами' using errcode = '42501';
  end if;
end $$;

-- Проект для сметы: право planfact.estimate.manage (по проекту или на всю компанию), проект не в архиве. Возвращает компанию.
create or replace function planfact.require_estimate_manage(p_project uuid)
returns uuid language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_arch timestamptz;
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.estimate.manage') then
    raise exception 'Нет права работать со сметами' using errcode = '42501';
  end if;
  select company_id, archived_at into v_company, v_arch from planfact.projects where id = p_project;
  if v_arch is not null then
    raise exception 'Проект в архиве — сначала верните его из архива' using errcode = '22023';
  end if;
  return v_company;
end $$;

-- Смета для чтения (p_write = false) или изменения. Чужая/недоступная — «не найдена».
create or replace function planfact.require_estimate(p_estimate uuid, p_write boolean)
returns planfact.estimates language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_e planfact.estimates;
begin
  select * into v_e from planfact.estimates where id = p_estimate;
  if v_e.id is null or auth.uid() is null or not planfact.has_permission(v_e.project_id, 'planfact.estimate.manage') then
    raise exception 'Смета не найдена' using errcode = '22023';
  end if;
  if p_write then perform planfact.require_estimate_manage(v_e.project_id); end if;
  return v_e;
end $$;

-- Проверка строк надбавок (шаблон или смета): структура, закрытые списки, ссылки, отсутствие циклов.
-- Возвращает строки в виде [{sort, key, section, name, comment, method, base, params, in_total}].
create or replace function planfact.check_overhead_lines(p_lines jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog as $$
declare
  v_out jsonb := '[]'::jsonb; e record; v_keys text[] := '{}'; v_key text; v_section text; v_method text; v_base jsonb; v_params jsonb;
  v_sections text[] := array['materials', 'fot_smr', 'fot_itr', 'household', 'other', 'profit', 'office', 'vat'];
  v_deps jsonb := '{}'::jsonb; v_secmap jsonb := '{}'::jsonb; v_done text[] := '{}'; v_progress boolean; k text; d text; v_ok boolean;
  v_n numeric; x jsonb;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'Ожидается массив строк надбавок' using errcode = '22023'; end if;
  if jsonb_array_length(p_lines) > 200 then raise exception 'Не более 200 строк надбавок' using errcode = '22023'; end if;
  for e in select j, ord from jsonb_array_elements(p_lines) with ordinality as t(j, ord) order by ord loop
    if jsonb_typeof(e.j) <> 'object' then raise exception 'Строка надбавок — не объект' using errcode = '22023'; end if;
    v_key := e.j ->> 'key'; v_section := e.j ->> 'section'; v_method := e.j ->> 'method';
    if v_key is null or v_key !~ '^[A-Za-z0-9_-]{1,40}$' or v_key = any(v_keys) then raise exception 'Неверный или повторный ключ строки надбавок: %', v_key using errcode = '22023'; end if;
    if v_section is null or not (v_section = any(v_sections)) then raise exception 'Неизвестный раздел надбавок: %', v_section using errcode = '22023'; end if;
    if v_method is null or v_method not in ('percent_of', 'qty_rate', 'fixed', 'gross_up') then raise exception 'Неизвестный способ расчёта: %', v_method using errcode = '22023'; end if;
    if length(btrim(coalesce(e.j ->> 'name', ''))) not between 1 and 300 then raise exception 'Пустое или слишком длинное название строки надбавок' using errcode = '22023'; end if;
    if length(coalesce(e.j ->> 'comment', '')) > 2000 then raise exception 'Слишком длинный комментарий' using errcode = '22023'; end if;
    v_base := coalesce(e.j -> 'base', '{}'::jsonb); v_params := coalesce(e.j -> 'params', '{}'::jsonb);
    if jsonb_typeof(v_base) <> 'object' or jsonb_typeof(v_params) <> 'object' then raise exception 'База и параметры — объекты' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_object_keys(v_base) b where b not in ('totals', 'sections', 'lines')) then raise exception 'Неизвестная база надбавки' using errcode = '22023'; end if;
    for k in select jsonb_object_keys(v_base) loop
      if jsonb_typeof(v_base -> k) <> 'array' or exists (select 1 from jsonb_array_elements(v_base -> k) a where jsonb_typeof(a) <> 'string') then
        raise exception 'База надбавки — списки строк' using errcode = '22023';
      end if;
    end loop;
    if exists (select 1 from jsonb_array_elements_text(coalesce(v_base -> 'totals', '[]')) a where a not in ('labor', 'material')) then raise exception 'Неизвестный итог сметы в базе' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements_text(coalesce(v_base -> 'sections', '[]')) a where not (a = any(v_sections))) then raise exception 'Неизвестный раздел в базе' using errcode = '22023'; end if;
    if v_method in ('percent_of', 'gross_up') and coalesce(jsonb_array_length(v_base -> 'totals'), 0) + coalesce(jsonb_array_length(v_base -> 'sections'), 0) + coalesce(jsonb_array_length(v_base -> 'lines'), 0) = 0 then
      raise exception 'У строки «%» не выбрана база', e.j ->> 'name' using errcode = '22023';
    end if;
    -- параметры способа
    if v_method = 'percent_of' then
      if jsonb_typeof(v_params -> 'percent') <> 'number' then raise exception 'Не задан процент у строки «%»', e.j ->> 'name' using errcode = '22023'; end if;
      v_n := (v_params ->> 'percent')::numeric; if v_n < -1000 or v_n > 1000 then raise exception 'Процент вне диапазона' using errcode = '22023'; end if;
    elsif v_method = 'gross_up' then
      if jsonb_typeof(v_params -> 'share') <> 'number' then raise exception 'Не задана доля у строки «%»', e.j ->> 'name' using errcode = '22023'; end if;
      v_n := (v_params ->> 'share')::numeric; if v_n <= 0 or v_n > 100 then raise exception 'Доля — от 0 до 100 %%' using errcode = '22023'; end if;
    elsif v_method = 'fixed' then
      if jsonb_typeof(v_params -> 'amount') <> 'number' then raise exception 'Не задана сумма у строки «%»', e.j ->> 'name' using errcode = '22023'; end if;
      if abs((v_params ->> 'amount')::numeric) >= 1e13 then raise exception 'Сумма вне диапазона' using errcode = '22023'; end if;
    else
      if jsonb_typeof(v_params -> 'factors') <> 'array' or jsonb_array_length(v_params -> 'factors') not between 1 and 10 then
        raise exception 'У строки «%» нужно от 1 до 10 множителей', e.j ->> 'name' using errcode = '22023';
      end if;
      for x in select a from jsonb_array_elements(v_params -> 'factors') a loop
        if jsonb_typeof(x) <> 'number' or abs((x #>> '{}')::numeric) >= 1e12 then raise exception 'Множитель — число' using errcode = '22023'; end if;
      end loop;
    end if;
    if e.j ? 'in_total' and jsonb_typeof(e.j -> 'in_total') <> 'boolean' then raise exception 'Флажок «в итог» — да/нет' using errcode = '22023'; end if;
    v_keys := v_keys || v_key;
    v_secmap := v_secmap || jsonb_build_object(v_section, coalesce(v_secmap -> v_section, '[]'::jsonb) || to_jsonb(v_key));
    v_out := v_out || jsonb_build_object('sort', e.ord, 'key', v_key, 'section', v_section, 'name', btrim(e.j ->> 'name'),
      'comment', nullif(e.j ->> 'comment', ''), 'method', v_method,
      'base', jsonb_strip_nulls(jsonb_build_object('totals', v_base -> 'totals', 'sections', v_base -> 'sections', 'lines', v_base -> 'lines')),
      'params', v_params, 'in_total', coalesce((e.j ->> 'in_total')::boolean, true));
  end loop;
  -- ссылки на строки существуют; зависимости: строки базы + все строки разделов базы
  for e in select j from jsonb_array_elements(v_out) j loop
    if exists (select 1 from jsonb_array_elements_text(coalesce(e.j #> '{base,lines}', '[]')) a where not (a = any(v_keys))) then
      raise exception 'Строка «%» ссылается на несуществующую строку', e.j ->> 'name' using errcode = '22023';
    end if;
    v_deps := v_deps || jsonb_build_object(e.j ->> 'key',
      coalesce(e.j #> '{base,lines}', '[]'::jsonb) ||
      coalesce((select jsonb_agg(m) from jsonb_array_elements_text(coalesce(e.j #> '{base,sections}', '[]')) s,
                jsonb_array_elements(coalesce(v_secmap -> s, '[]'::jsonb)) m), '[]'::jsonb));
  end loop;
  -- циклы: снимаем строки, все зависимости которых уже сняты; не удалось снять все — цикл
  loop
    v_progress := false;
    foreach k in array v_keys loop
      continue when k = any(v_done);
      v_ok := true;
      for d in select jsonb_array_elements_text(v_deps -> k) loop
        if not (d = any(v_done)) then v_ok := false; exit; end if;
      end loop;
      if v_ok then v_done := v_done || k; v_progress := true; end if;
    end loop;
    exit when not v_progress;
  end loop;
  if cardinality(v_done) < cardinality(v_keys) then
    raise exception 'Строки надбавок ссылаются друг на друга по кругу (в т. ч. через свой раздел) — проверьте базы' using errcode = '22023';
  end if;
  return v_out;
end $$;

-- Шаблон по умолчанию — строки листа «Расчет» образца 0_СЕБЕС (решение владельца: методика уточнится на пилоте, всё правится).
create or replace function planfact.overhead_default_lines()
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_array(
    jsonb_build_object('key', 'mat', 'section', 'materials', 'name', 'Материалы', 'method', 'percent_of', 'base', '{"totals":["material"]}'::jsonb, 'params', '{"percent":100}'::jsonb),
    jsonb_build_object('key', 'mat_delivery', 'section', 'materials', 'name', 'Доставка', 'comment', '3,5 % от материалов', 'method', 'percent_of', 'base', '{"lines":["mat"]}'::jsonb, 'params', '{"percent":3.5}'::jsonb),
    jsonb_build_object('key', 'mat_consumables', 'section', 'materials', 'name', 'Расходники', 'comment', '8 % от материалов', 'method', 'percent_of', 'base', '{"lines":["mat"]}'::jsonb, 'params', '{"percent":8}'::jsonb),
    jsonb_build_object('key', 'mat_tools', 'section', 'materials', 'name', 'Инструмент', 'comment', '3 % от материалов', 'method', 'percent_of', 'base', '{"lines":["mat"]}'::jsonb, 'params', '{"percent":3}'::jsonb),
    jsonb_build_object('key', 'smr', 'section', 'fot_smr', 'name', 'СМР', 'method', 'percent_of', 'base', '{"totals":["labor"]}'::jsonb, 'params', '{"percent":100}'::jsonb),
    jsonb_build_object('key', 'smr_helpers', 'section', 'fot_smr', 'name', 'Подсобники и грузчики', 'comment', '8 чел. × 12 мес.: ставка × смен × чел. × мес.', 'method', 'qty_rate', 'params', '{"factors":[5500,24,8,12]}'::jsonb),
    jsonb_build_object('key', 'smr_clean_uk', 'section', 'fot_smr', 'name', 'Клининг перед ОВП и УК', 'comment', 'S квартир, МОП, ЛК × 250 ₽/м²', 'method', 'qty_rate', 'params', '{"factors":[6364.17,250]}'::jsonb),
    jsonb_build_object('key', 'smr_clean_owner', 'section', 'fot_smr', 'name', 'Клининг перед дольщиком', 'comment', 'S квартир × 200 ₽/м²', 'method', 'qty_rate', 'params', '{"factors":[4663.11,200]}'::jsonb),
    jsonb_build_object('key', 'smr_handover', 'section', 'fot_smr', 'name', 'Передача дольщику', 'comment', '7 500 ₽ за квартиру', 'method', 'qty_rate', 'params', '{"factors":[124,7500]}'::jsonb),
    jsonb_build_object('key', 'smr_form2', 'section', 'fot_smr', 'name', 'На форму 2', 'comment', 'досчёт до 100 %: ÷ 78 × 100', 'method', 'gross_up', 'base', '{"lines":["smr","smr_helpers","smr_clean_uk","smr_clean_owner","smr_handover"]}'::jsonb, 'params', '{"share":78}'::jsonb),
    jsonb_build_object('key', 'itr', 'section', 'fot_itr', 'name', 'ИТР (р. п., прорабы, кладовщик)', 'comment', 'ставка × чел. × мес.', 'method', 'qty_rate', 'params', '{"factors":[150000,5,12]}'::jsonb),
    jsonb_build_object('key', 'itr_tax', 'section', 'fot_itr', 'name', 'Налоги ИТР', 'comment', '43 %', 'method', 'percent_of', 'base', '{"lines":["itr"]}'::jsonb, 'params', '{"percent":43}'::jsonb),
    jsonb_build_object('key', 'hh_cabins', 'section', 'household', 'name', 'Бытовки — аренда', 'comment', '6 бытовок × 12 мес.', 'method', 'qty_rate', 'params', '{"factors":[15000,6,12]}'::jsonb),
    jsonb_build_object('key', 'hh_cabins_delivery', 'section', 'household', 'name', 'Бытовки — доставка', 'comment', '6 привозов/вывозов', 'method', 'qty_rate', 'params', '{"factors":[6,60000]}'::jsonb),
    jsonb_build_object('key', 'hh_territory', 'section', 'household', 'name', 'Содержание территории', 'comment', '4 000 ₽ за бытовку в месяц', 'method', 'qty_rate', 'params', '{"factors":[4000,6,12]}'::jsonb),
    jsonb_build_object('key', 'hh_toilets', 'section', 'household', 'name', 'Туалетные кабины — аренда', 'comment', '4 туалета × 12 мес.', 'method', 'qty_rate', 'params', '{"factors":[3500,4,12]}'::jsonb),
    jsonb_build_object('key', 'hh_toilets_delivery', 'section', 'household', 'name', 'Туалетные кабины — доставка', 'comment', '4 привоза/вывоза', 'method', 'qty_rate', 'params', '{"factors":[4,10000]}'::jsonb),
    jsonb_build_object('key', 'hh_power', 'section', 'household', 'name', 'Электроэнергия', 'comment', '13 ₽/кВт·ч', 'method', 'qty_rate', 'params', '{"factors":[3700,12,13]}'::jsonb),
    jsonb_build_object('key', 'hh_waste', 'section', 'household', 'name', 'Вывоз мусора', 'comment', '25 пухто', 'method', 'qty_rate', 'params', '{"factors":[25,19800]}'::jsonb),
    jsonb_build_object('key', 'hh_silomat', 'section', 'household', 'name', 'Аренда силомата и силосов', 'comment', '2 комплекта × 3 месяца; в итог не входит', 'method', 'qty_rate', 'params', '{"factors":[146400,2,3]}'::jsonb, 'in_total', false),
    jsonb_build_object('key', 'profit', 'section', 'profit', 'name', 'Сметная прибыль', 'comment', '20 % от ФОТ СМР + ФОТ ИТР', 'method', 'percent_of', 'base', '{"sections":["fot_smr","fot_itr"]}'::jsonb, 'params', '{"percent":20}'::jsonb),
    jsonb_build_object('key', 'office', 'section', 'office', 'name', 'Содержание офиса (12 месяцев)', 'comment', 'ПТО, снабжение, сметчик, СДО, бухгалтерия, экономист, гл. инженер, директор; аренда и канцелярия', 'method', 'qty_rate', 'params', '{"factors":[2600000,12]}'::jsonb),
    jsonb_build_object('key', 'vat', 'section', 'vat', 'name', 'НДС минимально необходимый', 'comment', '22 % от ФОТ ИТР, хоз-быта, прибыли, офиса и доставки', 'method', 'percent_of', 'base', '{"sections":["fot_itr","household"],"lines":["profit","office","mat_delivery"]}'::jsonb, 'params', '{"percent":22}'::jsonb)
  );
$$;

-- Шаблон компании: есть — id; нет — создаётся из шаблона по умолчанию.
create or replace function planfact.ensure_overhead_template(p_company uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_id uuid; v_lines jsonb;
begin
  select id into v_id from planfact.overhead_templates where company_id = p_company;
  if v_id is not null then return v_id; end if;
  insert into planfact.overhead_templates(company_id) values (p_company) on conflict (company_id) do nothing returning id into v_id;
  if v_id is null then select id into v_id from planfact.overhead_templates where company_id = p_company; return v_id; end if;
  v_lines := planfact.check_overhead_lines(planfact.overhead_default_lines());
  insert into planfact.overhead_lines(template_id, company_id, sort, key, section, name, comment, method, base, params, in_total)
  select v_id, p_company, (j ->> 'sort')::int, j ->> 'key', j ->> 'section', j ->> 'name', j ->> 'comment', j ->> 'method',
         j -> 'base', j -> 'params', (j ->> 'in_total')::boolean
  from jsonb_array_elements(v_lines) j;
  perform planfact.log_admin_change(p_company, null, 'overhead_templates', v_id, 'INSERT', null,
    jsonb_build_object('lines', jsonb_array_length(v_lines), 'source', 'default'));
  return v_id;
end $$;

-- Подстановка цен справочника в строки сметы: p_all = true — во все строки, кроме ручных; иначе только в строки p_rows.
create or replace function planfact.estimate_fill_reference(p_estimate uuid, p_company uuid, p_rows uuid[] default null)
returns int language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_n int;
begin
  with ref as (
    select er.id as row_id, pi.id as item_id, pi.price_labor, pi.price_material
    from planfact.estimate_rows er
    join planfact.vor_source_rows s on s.id = er.source_row_id
    left join planfact.price_items pi on pi.company_id = p_company and pi.deleted_at is null and (
         (s.kind = 'work' and pi.kind = 'work' and pi.work_type_id = s.work_type_id)
      or (s.kind = 'material' and pi.kind = 'material' and pi.canon_name = planfact.canon_name(s.name)
          and pi.unit_text = lower(btrim(coalesce(s.unit_text, '')))))
    where er.estimate_id = p_estimate
      and (case when p_rows is null then er.price_source <> 'manual' else er.source_row_id = any(p_rows) end)
  )
  update planfact.estimate_rows er set
    price_labor = case when s.kind = 'work' then ref.price_labor end,
    price_material = ref.price_material,
    price_source = case when ref.item_id is null then 'none' else 'reference' end,
    price_item_id = ref.item_id, updated_by = auth.uid(), updated_at = now()
  from ref, planfact.vor_source_rows s
  where er.id = ref.row_id and s.id = er.source_row_id
    and (er.price_labor, er.price_material, er.price_source, er.price_item_id) is distinct from
        (case when s.kind = 'work' then ref.price_labor end, ref.price_material, case when ref.item_id is null then 'none' else 'reference' end, ref.item_id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 7. RLS: чтение — только с правом planfact.estimate.manage; записи напрямую нет
alter table planfact.price_items        enable row level security;
alter table planfact.price_history      enable row level security;
alter table planfact.overhead_templates enable row level security;
alter table planfact.overhead_lines     enable row level security;
alter table planfact.estimates          enable row level security;
alter table planfact.estimate_rows      enable row level security;
alter table planfact.estimate_overheads enable row level security;
alter table planfact.kp_revisions       enable row level security;
drop policy if exists price_items_select on planfact.price_items;
create policy price_items_select on planfact.price_items for select to authenticated
  using (deleted_at is null and planfact.can_estimate_company(company_id));
drop policy if exists price_history_select on planfact.price_history;
create policy price_history_select on planfact.price_history for select to authenticated
  using (planfact.can_estimate_company(company_id));
drop policy if exists overhead_templates_select on planfact.overhead_templates;
create policy overhead_templates_select on planfact.overhead_templates for select to authenticated
  using (planfact.can_estimate_company(company_id));
drop policy if exists overhead_lines_select on planfact.overhead_lines;
create policy overhead_lines_select on planfact.overhead_lines for select to authenticated
  using (planfact.can_estimate_company(company_id));
drop policy if exists estimates_select on planfact.estimates;
create policy estimates_select on planfact.estimates for select to authenticated
  using (planfact.has_permission(project_id, 'planfact.estimate.manage'));
drop policy if exists estimate_rows_select on planfact.estimate_rows;
create policy estimate_rows_select on planfact.estimate_rows for select to authenticated
  using (planfact.has_permission(project_id, 'planfact.estimate.manage'));
drop policy if exists estimate_overheads_select on planfact.estimate_overheads;
create policy estimate_overheads_select on planfact.estimate_overheads for select to authenticated
  using (planfact.has_permission(project_id, 'planfact.estimate.manage'));
drop policy if exists kp_revisions_select on planfact.kp_revisions;
create policy kp_revisions_select on planfact.kp_revisions for select to authenticated
  using (planfact.has_permission(project_id, 'planfact.estimate.manage'));
revoke all on planfact.price_items, planfact.price_history, planfact.overhead_templates, planfact.overhead_lines,
  planfact.estimates, planfact.estimate_rows, planfact.estimate_overheads, planfact.kp_revisions from public, anon, authenticated;
grant select on planfact.price_items, planfact.price_history, planfact.overhead_templates, planfact.overhead_lines,
  planfact.estimates, planfact.estimate_rows, planfact.estimate_overheads, planfact.kp_revisions to authenticated;

-- 8. Справочник цен
create or replace function public.pf_price_list(p_company uuid)
returns table(id uuid, kind text, work_type_id uuid, name text, unit_text text, unit_code text, price_labor numeric,
              price_material numeric, price_date date, note text, updated_at timestamptz, updated_by_email text)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  perform planfact.require_estimate_company(p_company);
  return query
  select pi.id, pi.kind, pi.work_type_id, coalesce(w.name, pi.name), pi.unit_text, u.code, pi.price_labor, pi.price_material,
         pi.price_date, pi.note, pi.updated_at, uu.email::text
  from planfact.price_items pi
  left join planfact.work_types w on w.id = pi.work_type_id
  left join planfact.units u on u.id = w.unit_id
  left join auth.users uu on uu.id = pi.updated_by
  where pi.company_id = p_company and pi.deleted_at is null
  order by pi.kind desc, coalesce(w.name, pi.name);
end $$;

-- Пачка цен [{kind, work_type_id | name + unit_text, price_labor, price_material, price_date, note}] ≤ 5 000.
-- Есть такая строка — меняются заданные (не null) цены, иначе создаётся. Каждое изменение цены — в истории с источником.
-- p_source: 'manual' | 'import:<id загрузки ВОР компании>' | 'estimate:<id сметы компании>'. Возвращает {created, updated, unchanged}.
create or replace function public.pf_price_upsert(p_company uuid, p_items jsonb, p_source text default 'manual')
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare r record; v_old planfact.price_items; v_id uuid; v_created int := 0; v_updated int := 0; v_same int := 0;
        v_canon text; v_unit text; v_name text; v_labor numeric; v_mat numeric; v_date date;
begin
  perform planfact.require_estimate_company(p_company);
  if p_source is null or p_source !~ '^(manual|import:[0-9a-f-]{36}|estimate:[0-9a-f-]{36})$' then
    raise exception 'Неверный источник цены' using errcode = '22023';
  end if;
  if p_source like 'import:%' and not exists (select 1 from planfact.vor_imports where id = substr(p_source, 8)::uuid and company_id = p_company) then
    raise exception 'Загрузка ВОР не найдена' using errcode = '22023';
  end if;
  if p_source like 'estimate:%' and not exists (select 1 from planfact.estimates e where e.id = substr(p_source, 10)::uuid and e.company_id = p_company
                                                and planfact.has_permission(e.project_id, 'planfact.estimate.manage')) then
    raise exception 'Смета не найдена' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Ожидается массив' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) > 5000 then raise exception 'Не более 5 000 цен за один вызов' using errcode = '22023'; end if;
  for r in select * from jsonb_to_recordset(p_items) as x(kind text, work_type_id uuid, name text, unit_text text,
                                                          price_labor numeric, price_material numeric, price_date date, note text) loop
    if r.kind not in ('work', 'material') then raise exception 'Тип строки цены — работа или материал' using errcode = '22023'; end if;
    if (r.price_labor is not null and (r.price_labor < 0 or r.price_labor >= 1e12))
       or (r.price_material is not null and (r.price_material < 0 or r.price_material >= 1e12)) then
      raise exception 'Цена должна быть числом от 0' using errcode = '22023';
    end if;
    v_date := coalesce(r.price_date, current_date);
    if r.kind = 'work' then
      select w.name into v_name from planfact.work_types w where w.id = r.work_type_id and w.company_id = p_company and w.deleted_at is null;
      if v_name is null then raise exception 'Вид работ не найден' using errcode = '22023'; end if;
      v_canon := planfact.canon_name(v_name); v_unit := '';
      select * into v_old from planfact.price_items where company_id = p_company and kind = 'work' and work_type_id = r.work_type_id and deleted_at is null;
    else
      v_name := btrim(regexp_replace(coalesce(r.name, ''), '\s+', ' ', 'g'));
      if v_name = '' or length(v_name) > 500 then raise exception 'Пустое или слишком длинное наименование материала' using errcode = '22023'; end if;
      if r.price_labor is not null then raise exception 'У материала нет расценки работы' using errcode = '22023'; end if;
      v_canon := planfact.canon_name(v_name); v_unit := lower(btrim(coalesce(r.unit_text, '')));
      if length(v_unit) > 50 then raise exception 'Слишком длинная ЕИ' using errcode = '22023'; end if;
      select * into v_old from planfact.price_items where company_id = p_company and kind = 'material' and canon_name = v_canon and unit_text = v_unit and deleted_at is null;
    end if;
    if v_old.id is null then
      insert into planfact.price_items(company_id, kind, work_type_id, name, canon_name, unit_text, price_labor, price_material, price_date, note)
      values (p_company, r.kind, case when r.kind = 'work' then r.work_type_id end, v_name, v_canon, v_unit, r.price_labor, r.price_material, v_date, nullif(btrim(coalesce(r.note, '')), ''))
      returning id into v_id;
      insert into planfact.price_history(company_id, price_item_id, new_labor, new_material, price_date, source)
      values (p_company, v_id, r.price_labor, r.price_material, v_date, p_source);
      perform planfact.log_admin_change(p_company, null, 'price_items', v_id, 'INSERT', null,
        jsonb_build_object('name', v_name, 'kind', r.kind, 'price_labor', r.price_labor, 'price_material', r.price_material, 'source', p_source));
      v_created := v_created + 1;
    else
      v_labor := coalesce(r.price_labor, v_old.price_labor); v_mat := coalesce(r.price_material, v_old.price_material);
      if v_labor is not distinct from v_old.price_labor and v_mat is not distinct from v_old.price_material
         and (r.note is null or nullif(btrim(r.note), '') is not distinct from v_old.note) then
        v_same := v_same + 1;
      else
        update planfact.price_items set price_labor = v_labor, price_material = v_mat,
          price_date = case when (v_labor, v_mat) is distinct from (v_old.price_labor, v_old.price_material) then v_date else price_date end,
          note = case when r.note is null then note else nullif(btrim(r.note), '') end, updated_by = auth.uid(), updated_at = now()
        where id = v_old.id;
        if (v_labor, v_mat) is distinct from (v_old.price_labor, v_old.price_material) then
          insert into planfact.price_history(company_id, price_item_id, old_labor, new_labor, old_material, new_material, price_date, source)
          values (p_company, v_old.id, v_old.price_labor, v_labor, v_old.price_material, v_mat, v_date, p_source);
        end if;
        perform planfact.log_admin_change(p_company, null, 'price_items', v_old.id, 'UPDATE',
          jsonb_build_object('name', v_old.name, 'price_labor', v_old.price_labor, 'price_material', v_old.price_material),
          jsonb_build_object('name', v_old.name, 'price_labor', v_labor, 'price_material', v_mat, 'source', p_source));
        v_updated := v_updated + 1;
      end if;
    end if;
    v_old := null;
  end loop;
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'unchanged', v_same);
end $$;

create or replace function public.pf_price_delete(p_item uuid)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_old planfact.price_items;
begin
  select * into v_old from planfact.price_items where id = p_item and deleted_at is null;
  if v_old.id is null or not planfact.can_estimate_company(v_old.company_id) then raise exception 'Цена не найдена' using errcode = '22023'; end if;
  update planfact.price_items set deleted_at = now(), updated_by = auth.uid(), updated_at = now() where id = p_item;
  perform planfact.log_admin_change(v_old.company_id, null, 'price_items', p_item, 'DELETE',
    jsonb_build_object('name', v_old.name, 'price_labor', v_old.price_labor, 'price_material', v_old.price_material), null);
end $$;

create or replace function public.pf_price_history(p_item uuid)
returns table(changed_at timestamptz, changed_by_email text, old_labor numeric, new_labor numeric, old_material numeric,
              new_material numeric, price_date date, source text)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid;
begin
  select company_id into v_company from planfact.price_items where id = p_item;
  if v_company is null or not planfact.can_estimate_company(v_company) then raise exception 'Цена не найдена' using errcode = '22023'; end if;
  return query
  select h.changed_at, u.email::text, h.old_labor, h.new_labor, h.old_material, h.new_material, h.price_date, h.source
  from planfact.price_history h left join auth.users u on u.id = h.changed_by
  where h.price_item_id = p_item order by h.changed_at desc, h.id desc limit 200;
end $$;

-- 9. Шаблон надбавок компании
create or replace function public.pf_overhead_template(p_company uuid)
returns table(key text, section text, name text, comment text, method text, base jsonb, params jsonb, in_total boolean, sort int)
language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_id uuid;
begin
  perform planfact.require_estimate_company(p_company);
  v_id := planfact.ensure_overhead_template(p_company);
  return query
  select l.key, l.section, l.name, l.comment, l.method, l.base, l.params, l.in_total, l.sort
  from planfact.overhead_lines l where l.template_id = v_id order by l.sort;
end $$;

create or replace function public.pf_overhead_save_template(p_company uuid, p_lines jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_id uuid; v_lines jsonb; v_old jsonb;
begin
  perform planfact.require_estimate_company(p_company);
  v_lines := planfact.check_overhead_lines(p_lines);
  v_id := planfact.ensure_overhead_template(p_company);
  select jsonb_agg(jsonb_build_object('key', key, 'name', name, 'method', method, 'params', params, 'in_total', in_total) order by sort)
    into v_old from planfact.overhead_lines where template_id = v_id;
  delete from planfact.overhead_lines where template_id = v_id;
  insert into planfact.overhead_lines(template_id, company_id, sort, key, section, name, comment, method, base, params, in_total)
  select v_id, p_company, (j ->> 'sort')::int, j ->> 'key', j ->> 'section', j ->> 'name', j ->> 'comment', j ->> 'method',
         j -> 'base', j -> 'params', (j ->> 'in_total')::boolean
  from jsonb_array_elements(v_lines) j;
  update planfact.overhead_templates set updated_by = auth.uid(), updated_at = now() where id = v_id;
  perform planfact.log_admin_change(p_company, null, 'overhead_templates', v_id, 'UPDATE', jsonb_build_object('lines', v_old),
    (select jsonb_build_object('lines', jsonb_agg(jsonb_build_object('key', j ->> 'key', 'name', j ->> 'name', 'method', j ->> 'method',
       'params', j -> 'params', 'in_total', (j ->> 'in_total')::boolean))) from jsonb_array_elements(v_lines) j));
  return jsonb_array_length(v_lines);
end $$;

-- 10. Сметы
create or replace function public.pf_estimate_create(p_project uuid, p_name text, p_imports uuid[], p_area numeric default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_company uuid; v_id uuid; v_name text := btrim(coalesce(p_name, '')); v_tpl uuid; v_bad int; v_imports uuid[];
begin
  v_company := planfact.require_estimate_manage(p_project);
  if v_name = '' or length(v_name) > 300 then raise exception 'Введите название сметы' using errcode = '22023'; end if;
  select array_agg(distinct x) into v_imports from unnest(coalesce(p_imports, '{}')) x where x is not null;
  if v_imports is null or cardinality(v_imports) > 20 then raise exception 'Выберите от 1 до 20 загрузок ВОР' using errcode = '22023'; end if;
  select count(*) into v_bad from unnest(v_imports) x
  where not exists (select 1 from planfact.vor_imports i where i.id = x and i.project_id = p_project and i.status = 'confirmed');
  if v_bad > 0 then raise exception 'Смета строится только по подтверждённым загрузкам ВОР этого проекта' using errcode = '22023'; end if;
  if p_area is not null and (p_area <= 0 or p_area >= 1e9) then raise exception 'Площадь — положительное число' using errcode = '22023'; end if;
  insert into planfact.estimates(company_id, project_id, name, import_ids, area_m2)
  values (v_company, p_project, v_name, v_imports, p_area) returning id into v_id;
  insert into planfact.estimate_rows(estimate_id, project_id, source_row_id)
  select v_id, p_project, s.id from planfact.vor_source_rows s
  where s.import_id = any(v_imports) and s.kind in ('work', 'material');
  perform planfact.estimate_fill_reference(v_id, v_company, null);
  v_tpl := planfact.ensure_overhead_template(v_company);
  insert into planfact.estimate_overheads(estimate_id, project_id, sort, key, section, name, comment, method, base, params, in_total)
  select v_id, p_project, sort, key, section, name, comment, method, base, params, in_total
  from planfact.overhead_lines where template_id = v_tpl;
  perform planfact.log_admin_change(v_company, p_project, 'estimates', v_id, 'INSERT', null,
    jsonb_build_object('name', v_name, 'import_ids', to_jsonb(v_imports), 'area_m2', p_area));
  return v_id;
end $$;

create or replace function public.pf_estimate_update(p_estimate uuid, p_name text, p_area numeric)
returns void language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_e planfact.estimates; v_name text := btrim(coalesce(p_name, ''));
begin
  v_e := planfact.require_estimate(p_estimate, true);
  if v_name = '' or length(v_name) > 300 then raise exception 'Введите название сметы' using errcode = '22023'; end if;
  if p_area is not null and (p_area <= 0 or p_area >= 1e9) then raise exception 'Площадь — положительное число' using errcode = '22023'; end if;
  update planfact.estimates set name = v_name, area_m2 = p_area, updated_at = now() where id = p_estimate;
  perform planfact.log_admin_change(v_e.company_id, v_e.project_id, 'estimates', p_estimate, 'UPDATE',
    jsonb_build_object('name', v_e.name, 'area_m2', v_e.area_m2), jsonb_build_object('name', v_name, 'area_m2', p_area));
end $$;

create or replace function public.pf_estimate_list(p_project uuid)
returns table(id uuid, name text, import_ids uuid[], area_m2 numeric, rows int, unpriced int, revisions int,
              created_at timestamptz, created_by_email text, updated_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  if p_project is null or auth.uid() is null or not planfact.has_permission(p_project, 'planfact.estimate.manage') then
    raise exception 'Нет права работать со сметами' using errcode = '42501';
  end if;
  return query
  select e.id, e.name, e.import_ids, e.area_m2,
         (select count(*)::int from planfact.estimate_rows r where r.estimate_id = e.id),
         (select count(*)::int from planfact.estimate_rows r where r.estimate_id = e.id and r.price_labor is null and r.price_material is null),
         (select count(*)::int from planfact.kp_revisions k where k.estimate_id = e.id),
         e.created_at, u.email::text, e.updated_at
  from planfact.estimates e left join auth.users u on u.id = e.created_by
  where e.project_id = p_project order by e.created_at desc;
end $$;

-- Строки сметы в структуре ВОР заказчика: объёмы и нормы — из исходника, цены — сметы, подсказка — из справочника.
create or replace function public.pf_estimate_rows(p_estimate uuid)
returns table(source_row_id uuid, import_id uuid, row_no int, kind text, number text, name text, unit_text text, qty numeric,
              norm numeric, parent_row_no int, work_type_id uuid, price_labor numeric, price_material numeric, price_source text,
              ref_item_id uuid, ref_labor numeric, ref_material numeric, ref_date date)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_e planfact.estimates;
begin
  v_e := planfact.require_estimate(p_estimate, false);
  return query
  select s.id, s.import_id, s.row_no, s.kind, s.number, s.name, s.unit_text, s.qty, s.norm, w.row_no, s.work_type_id,
         er.price_labor, er.price_material, er.price_source, pi.id, pi.price_labor, pi.price_material, pi.price_date
  from planfact.vor_source_rows s
  left join planfact.estimate_rows er on er.estimate_id = p_estimate and er.source_row_id = s.id
  left join planfact.vor_source_rows w on w.id = s.parent_row_id
  left join planfact.price_items pi on pi.company_id = v_e.company_id and pi.deleted_at is null and (
       (s.kind = 'work' and pi.kind = 'work' and pi.work_type_id = s.work_type_id)
    or (s.kind = 'material' and pi.kind = 'material' and pi.canon_name = planfact.canon_name(s.name)
        and pi.unit_text = lower(btrim(coalesce(s.unit_text, '')))))
  where s.import_id = any(v_e.import_ids) and s.kind in ('group', 'work', 'material', 'context')
  order by array_position(v_e.import_ids, s.import_id), s.row_no;
end $$;

-- Ручные цены строк: [{source_row_id, price_labor, price_material}] ≤ 5 000; {source_row_id, reset: true} — вернуть цену справочника.
create or replace function public.pf_estimate_set_prices(p_estimate uuid, p_items jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_e planfact.estimates; v_n int; v_bad int; v_reset uuid[];
begin
  v_e := planfact.require_estimate(p_estimate, true);
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Ожидается массив' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_items);
  if v_n > 5000 then raise exception 'Не более 5 000 строк за один вызов' using errcode = '22023'; end if;
  select count(*) into v_bad from jsonb_to_recordset(p_items) as x(source_row_id uuid, price_labor numeric, price_material numeric, reset boolean)
  where not exists (select 1 from planfact.estimate_rows r where r.estimate_id = p_estimate and r.source_row_id = x.source_row_id)
     or (x.price_labor is not null and (x.price_labor < 0 or x.price_labor >= 1e12))
     or (x.price_material is not null and (x.price_material < 0 or x.price_material >= 1e12))
     or (x.price_labor is not null and exists (select 1 from planfact.vor_source_rows s where s.id = x.source_row_id and s.kind = 'material'));
  if v_bad > 0 then raise exception 'Строка не из этой сметы или неверная цена (число от 0; у материала нет расценки работы)' using errcode = '22023'; end if;
  update planfact.estimate_rows r set price_labor = x.price_labor, price_material = x.price_material, price_source = 'manual',
         updated_by = auth.uid(), updated_at = now()
  from jsonb_to_recordset(p_items) as x(source_row_id uuid, price_labor numeric, price_material numeric, reset boolean)
  where r.estimate_id = p_estimate and r.source_row_id = x.source_row_id and not coalesce(x.reset, false);
  select array_agg(x.source_row_id) into v_reset from jsonb_to_recordset(p_items) as x(source_row_id uuid, reset boolean) where coalesce(x.reset, false);
  if v_reset is not null then
    update planfact.estimate_rows set price_source = 'none' where estimate_id = p_estimate and source_row_id = any(v_reset);
    perform planfact.estimate_fill_reference(p_estimate, v_e.company_id, v_reset);
  end if;
  update planfact.estimates set updated_at = now() where id = p_estimate;
  perform planfact.log_admin_change(v_e.company_id, v_e.project_id, 'estimates', p_estimate, 'UPDATE', null,
    jsonb_build_object('prices', v_n, 'items', (select jsonb_agg(j) from (select j from jsonb_array_elements(p_items) j limit 50) t)));
  return v_n;
end $$;

-- Подставить цены справочника заново во все строки, кроме ручных. Возвращает число изменённых строк.
create or replace function public.pf_estimate_refill(p_estimate uuid)
returns int language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_e planfact.estimates; v_n int;
begin
  v_e := planfact.require_estimate(p_estimate, true);
  v_n := planfact.estimate_fill_reference(p_estimate, v_e.company_id, null);
  if v_n > 0 then
    update planfact.estimates set updated_at = now() where id = p_estimate;
    perform planfact.log_admin_change(v_e.company_id, v_e.project_id, 'estimates', p_estimate, 'UPDATE', null, jsonb_build_object('refill', v_n));
  end if;
  return v_n;
end $$;

create or replace function public.pf_estimate_overheads(p_estimate uuid)
returns table(key text, section text, name text, comment text, method text, base jsonb, params jsonb, in_total boolean, sort int)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  perform planfact.require_estimate(p_estimate, false);
  return query
  select o.key, o.section, o.name, o.comment, o.method, o.base, o.params, o.in_total, o.sort
  from planfact.estimate_overheads o where o.estimate_id = p_estimate order by o.sort;
end $$;

-- Надбавки сметы (своя копия; шаблон компании не меняется).
create or replace function public.pf_estimate_save_overheads(p_estimate uuid, p_lines jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_e planfact.estimates; v_lines jsonb;
begin
  v_e := planfact.require_estimate(p_estimate, true);
  v_lines := planfact.check_overhead_lines(p_lines);
  delete from planfact.estimate_overheads where estimate_id = p_estimate;
  insert into planfact.estimate_overheads(estimate_id, project_id, sort, key, section, name, comment, method, base, params, in_total)
  select p_estimate, v_e.project_id, (j ->> 'sort')::int, j ->> 'key', j ->> 'section', j ->> 'name', j ->> 'comment', j ->> 'method',
         j -> 'base', j -> 'params', (j ->> 'in_total')::boolean
  from jsonb_array_elements(v_lines) j;
  update planfact.estimates set updated_at = now() where id = p_estimate;
  perform planfact.log_admin_change(v_e.company_id, v_e.project_id, 'estimates', p_estimate, 'UPDATE', null,
    jsonb_build_object('overheads', jsonb_array_length(v_lines)));
  return jsonb_array_length(v_lines);
end $$;

-- 11. Редакции КП (снимок считает клиент общей функцией расчёта; сервер хранит неизменяемо)
create or replace function public.pf_kp_create(p_estimate uuid, p_file_sha256 text, p_snapshot jsonb, p_total numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, planfact as $$
declare v_e planfact.estimates; v_no int; v_id uuid;
begin
  v_e := planfact.require_estimate(p_estimate, true);
  if p_file_sha256 is null or p_file_sha256 !~ '^[0-9a-f]{64}$'
     or not exists (select 1 from planfact.vor_imports i where i.id = any(v_e.import_ids) and i.file_sha256 = p_file_sha256) then
    raise exception 'Файл не совпадает ни с одной загрузкой ВОР этой сметы' using errcode = '22023';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then raise exception 'Нет снимка КП' using errcode = '22023'; end if;
  if pg_column_size(p_snapshot) > 5000000 then raise exception 'Снимок КП слишком большой' using errcode = '22023'; end if;
  if p_total is null or p_total < 0 or p_total >= 1e15 then raise exception 'Неверный итог КП' using errcode = '22023'; end if;
  if length(coalesce(p_note, '')) > 2000 then raise exception 'Слишком длинное примечание' using errcode = '22023'; end if;
  perform 1 from planfact.estimates where id = p_estimate for update;   -- последовательная нумерация редакций
  select coalesce(max(revision_no), 0) + 1 into v_no from planfact.kp_revisions where estimate_id = p_estimate;
  insert into planfact.kp_revisions(estimate_id, project_id, company_id, revision_no, snapshot, total, file_sha256, note)
  values (p_estimate, v_e.project_id, v_e.company_id, v_no, p_snapshot, round(p_total, 2), p_file_sha256, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  perform planfact.log_admin_change(v_e.company_id, v_e.project_id, 'kp_revisions', v_id, 'INSERT', null,
    jsonb_build_object('estimate', v_e.name, 'revision_no', v_no, 'total', round(p_total, 2)));
  return jsonb_build_object('id', v_id, 'revision_no', v_no);
end $$;

create or replace function public.pf_kp_list(p_estimate uuid)
returns table(id uuid, revision_no int, total numeric, file_sha256 text, note text, created_at timestamptz, created_by_email text)
language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
begin
  perform planfact.require_estimate(p_estimate, false);
  return query
  select k.id, k.revision_no, k.total, k.file_sha256, k.note, k.created_at, u.email::text
  from planfact.kp_revisions k left join auth.users u on u.id = k.created_by
  where k.estimate_id = p_estimate order by k.revision_no desc;
end $$;

create or replace function public.pf_kp_get(p_revision uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, planfact as $$
declare v_k planfact.kp_revisions;
begin
  select * into v_k from planfact.kp_revisions where id = p_revision;
  if v_k.id is null then raise exception 'Редакция КП не найдена' using errcode = '22023'; end if;
  perform planfact.require_estimate(v_k.estimate_id, false);
  return jsonb_build_object('id', v_k.id, 'revision_no', v_k.revision_no, 'total', v_k.total, 'file_sha256', v_k.file_sha256,
    'note', v_k.note, 'created_at', v_k.created_at, 'snapshot', v_k.snapshot);
end $$;

-- 12. Журнал компании: + цены, шаблон надбавок, сметы, КП (тело как в 007 + фильтр table_name)
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
                                                       'price_items', 'overhead_templates', 'estimates', 'kp_revisions')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- 13. Права на выполнение
revoke all on function planfact.kp_guard_immutable(), planfact.require_estimate_company(uuid),
  planfact.require_estimate_manage(uuid), planfact.require_estimate(uuid, boolean), planfact.check_overhead_lines(jsonb),
  planfact.overhead_default_lines(), planfact.ensure_overhead_template(uuid), planfact.estimate_fill_reference(uuid, uuid, uuid[])
  from public, anon, authenticated;
-- Проверка права вызывается из политик RLS (как is_project_member/has_permission): только вошедшим, о своих правах.
revoke all on function planfact.can_estimate_company(uuid) from public, anon;
grant execute on function planfact.can_estimate_company(uuid) to authenticated;
revoke all on function public.pf_price_list(uuid), public.pf_price_upsert(uuid, jsonb, text), public.pf_price_delete(uuid),
  public.pf_price_history(uuid), public.pf_overhead_template(uuid), public.pf_overhead_save_template(uuid, jsonb),
  public.pf_estimate_create(uuid, text, uuid[], numeric), public.pf_estimate_update(uuid, text, numeric), public.pf_estimate_list(uuid),
  public.pf_estimate_rows(uuid), public.pf_estimate_set_prices(uuid, jsonb), public.pf_estimate_refill(uuid),
  public.pf_estimate_overheads(uuid), public.pf_estimate_save_overheads(uuid, jsonb),
  public.pf_kp_create(uuid, text, jsonb, numeric, text), public.pf_kp_list(uuid), public.pf_kp_get(uuid),
  public.pf_list_company_audit(uuid, int)
  from public, anon;
grant execute on function public.pf_price_list(uuid), public.pf_price_upsert(uuid, jsonb, text), public.pf_price_delete(uuid),
  public.pf_price_history(uuid), public.pf_overhead_template(uuid), public.pf_overhead_save_template(uuid, jsonb),
  public.pf_estimate_create(uuid, text, uuid[], numeric), public.pf_estimate_update(uuid, text, numeric), public.pf_estimate_list(uuid),
  public.pf_estimate_rows(uuid), public.pf_estimate_set_prices(uuid, jsonb), public.pf_estimate_refill(uuid),
  public.pf_estimate_overheads(uuid), public.pf_estimate_save_overheads(uuid, jsonb),
  public.pf_kp_create(uuid, text, jsonb, numeric, text), public.pf_kp_list(uuid), public.pf_kp_get(uuid),
  public.pf_list_company_audit(uuid, int)
  to authenticated;
