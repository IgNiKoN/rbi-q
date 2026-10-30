-- Заготовка «новая таблица модуля» (P2-0072; стандарт ai-dev/standards/DATA_TABLES.md, правила 1–10). Копировать в миграцию
-- модуля и заменить: __schema__ — раздел модуля (planfact, core …), __table__ — имя по словарю reference/GLOSSARY.md (snake_case),
-- __view__ / __edit__ — действия каталога прав core.permission_catalog (например planfact.fact.view / planfact.fact.create).
-- Сторож проверяет заготовку сам: npm run test:schema применяет её в PGlite — все правила зелёные (или «не относится»).
-- Номер записи создаёт устройство: window.RbiIds.newId() / stableId() (js/services/record-id.service.js) — повтор без дубля.
create table __schema__.__table__ (
  id uuid primary key default gen_random_uuid(),                       -- 1. ключ uuid (с устройства)
  company_id uuid not null references core.companies (id),             -- 2. компания — граница данных
  project_id uuid references core.projects (id),                       -- 3. проект и место — по id (объект — тоже место)
  location_id uuid references core.locations (id),
  title text not null default '',
  -- 10. деньги: amount numeric(18, 2), валюта — у родителя (смета, КП, КС-2, прайс, договор, проект) по внешнему ключу,
  --     или своя колонка currency text not null; суммы в jsonb сторож не видит — не хранить
  created_by uuid default auth.uid() references auth.users (id),      -- 4. автор — учётка (ФИО — только подпись)
  created_at timestamptz not null default now(),                       -- 5. время с часовым поясом
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                                              -- 6. удаление — пометкой, ничего не стирается
  deleted_by uuid references auth.users (id)
);
create index __table___company_project_idx on __schema__.__table__ (company_id, project_id);
comment on table __schema__.__table__ is '__table__: <что хранит, одной строкой>';

-- 9. Защита строк — в той же миграции: deny-by-default, права — единый механизм core.row_allowed (052), не по названию роли.
alter table __schema__.__table__ enable row level security;
revoke all on __schema__.__table__ from public, anon;
grant select, insert, update on __schema__.__table__ to authenticated;
create policy __table___select on __schema__.__table__ for select to authenticated
  using (core.row_allowed(company_id, project_id, location_id, array['__view__'], created_by, null));
create policy __table___insert on __schema__.__table__ for insert to authenticated
  with check (core.row_allowed(company_id, project_id, location_id, array['__edit__'], auth.uid(), null));
create policy __table___update on __schema__.__table__ for update to authenticated
  using (core.row_allowed(company_id, project_id, location_id, array['__edit__'], created_by, null))
  with check (core.row_allowed(company_id, project_id, location_id, array['__edit__'], created_by, null));
