// P2-0016 (ADR-068). Генератор миграции 018_quality из снимка структуры сервера (scripts/quality-schema/server-snapshot.json,
// снят запросом tests/server/018_quality_snapshot.sql — только чтение). Структура таблиц quality.* = public.* того же имени
// (колонки, типы, значения по умолчанию, ключи, проверки, индексы) + core_company_id / core_project_id, без политик и триггеров RBI.
// Запуск: node scripts/gen-quality-schema.mjs → supabase/migrations/018_quality_up.sql, 018_quality_down.sql.
// Таблица снимка без классификации ниже → ошибка (стоп-условие этапа 1).
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const snap = JSON.parse(readFileSync(`${ROOT}scripts/quality-schema/server-snapshot.json`, 'utf8'));

// Класс: project — project_code обязан быть объектом ядра; company — запись компании (project_code, если это объект ядра, — проверяется).
// Модуль: какие права дают доступ (quality / construction / оба). Запись: edit или manage (настройки компании).
const Q = ['quality'], C = ['construction'], QC = ['quality', 'construction'];
export const TABLES = {
  rbi_inspections: ['project', Q], rbi_inspection_items: ['project', Q], rbi_inspection_photos: ['project', Q],
  rbi_tasks: ['project', Q], project_fmea: ['project', Q], project_interventions: ['project', Q],
  project_meetings: ['project', Q], project_schedule_stages: ['project', Q], sk_records: ['project', Q],
  sk_data_bundles: ['project', Q], shared_reports: ['project', Q], construction_defects: ['project', C],

  rbi_draft_sessions: ['company', Q], rbi_engineer_ratings: ['company', Q], sk_volumes: ['company', Q],
  sk_import_batches: ['company', Q], sk_category_map: ['company', Q], sk_contractor_map: ['company', Q],
  sk_mapping: ['company', Q], shared_checklists: ['company', Q], shared_docs: ['company', Q],
  shared_etalons: ['company', Q], shared_feedback: ['company', Q], shared_nodes: ['company', Q],
  shared_practices: ['company', Q], shared_report_snapshots: ['company', Q], shared_report_templates: ['company', Q],
  shared_twi_cards: ['company', Q], app_assistant_kb: ['company', Q],

  construction_acceptance: ['company', C], construction_buildings: ['company', C], construction_floors: ['company', C],
  construction_objects: ['company', C], construction_units: ['company', C], construction_acceptance_v2: ['company', C],
  construction_defects_v2: ['company', C], construction_floors_v2: ['company', C], construction_units_v2: ['company', C],
  location_nodes: ['company', C], location_node_aliases: ['company', C], contracts: ['company', C],

  contractors: ['company', QC], contractor_aliases: ['company', QC], contractor_directory: ['company', QC],
  contractor_normalization_queue: ['company', QC], object_aliases: ['company', QC], object_normalization_queue: ['company', QC],
  project_objects: ['company', QC], file_registry: ['company', QC], rbi_engineer_profiles: ['company', QC],
  rbi_error_logs: ['company', QC], rbi_sync_queue: ['company', QC],
  project_settings: ['company', QC, 'manage'], allowed_projects: ['company', QC, 'manage'], rbi_company_settings: ['company', QC, 'manage'],
};
// В хранилище компаний не переносятся: старый План/Факт RBI (plan_fact_*) и таблицы, которых нет в коде Качества.
export const SKIPPED = ['construction_buildings_v2', 'construction_objects_v2', 'contractor_aliases_v2', 'issue_items', 'issues', 'sk_records_v2'];
// Уникальности, по которым клиент делает upsert (onConflict), — без company: значения уже различаются по компаниям
// (inspector_id — случайный; путь файла начинается с компании; company_id настроек = компания, ставит триггер).
const KEEP_GLOBAL_UNIQUE = new Set(['inspector_id', 'bucket,storage_path', 'company_id']);

const unknown = Object.keys(snap.tables).filter((t) => !t.startsWith('plan_fact_') && !TABLES[t] && !SKIPPED.includes(t));
const missing = Object.keys(TABLES).filter((t) => !snap.tables[t]);
if (unknown.length || missing.length) {
  throw new Error(`Классификация не совпадает со снимком: без класса ${unknown.join(', ') || '—'}; нет на сервере ${missing.join(', ') || '—'}`);
}

const q = (id) => (/^[a-z_][a-z0-9_]*$/.test(id) ? id : `"${id.replace(/"/g, '""')}"`);
const split = (s, sep) => (s ? s.split(sep) : []);
const lit = (s) => `'${s.replace(/'/g, "''")}'`;

const names = Object.keys(TABLES).sort();
const up = [];
const down = [];

up.push(`-- P2-0016 этап 1 (ADR-068). Хранилище Качества и Стройконтроля по компаниям: раздел \`quality\`.
-- СГЕНЕРИРОВАНО scripts/gen-quality-schema.mjs из снимка сервера ${snap.taken} — не править руками.
-- ${names.length} таблиц: структура как у public.<таблица> (без политик, триггеров и данных RBI) + core_company_id (компания ядра)
-- и core_project_id (объект ядра). Компания записи: объект ядра из project_code или заголовок «текущая компания» (x-company-id),
-- только если пользователь в ней состоит. RLS на каждой таблице: право модуля в компании; anon — ничего.
-- Объекты RBI (public.*, бакеты) не затрагивает. Применять после 017a, одним запросом. Откат — 018_quality_down.sql.
begin;

do $$
begin
  if to_regnamespace('quality') is not null then
    raise exception 'Раздел quality уже есть — 018 применена (повтор — только после 018_quality_down.sql)' using errcode = 'P0001';
  end if;
end $$;

create schema quality;
grant usage on schema quality to authenticated;

-- 1. Модули Качество и Стройконтроль — управляемые (включаются у компании), права модулей.
update core.module_catalog set managed = true where code in ('quality', 'construction');
insert into core.permission_catalog(action, description) values
  ('quality.view', 'Качество: просмотр'),
  ('quality.edit', 'Качество: проверки, задачи, отчёты'),
  ('quality.manage', 'Качество: настройки, справочники, роли'),
  ('construction.view', 'Стройконтроль: просмотр'),
  ('construction.edit', 'Стройконтроль: замечания, приёмка'),
  ('construction.manage', 'Стройконтроль: настройки, справочники')
on conflict (action) do nothing;
insert into core.role_template_permissions(template_code, action)
select t, a from (values
  ('company_admin', 'quality.view'), ('company_admin', 'quality.edit'), ('company_admin', 'quality.manage'),
  ('company_admin', 'construction.view'), ('company_admin', 'construction.edit'), ('company_admin', 'construction.manage'),
  ('project_manager', 'quality.view'), ('project_manager', 'quality.edit'), ('project_manager', 'quality.manage'),
  ('project_manager', 'construction.view'), ('project_manager', 'construction.edit'), ('project_manager', 'construction.manage'),
  ('qc_engineer', 'quality.view'), ('qc_engineer', 'quality.edit'), ('qc_engineer', 'construction.view'), ('qc_engineer', 'construction.edit'),
  ('foreman', 'quality.view'), ('foreman', 'construction.view'), ('foreman', 'construction.edit'),
  ('contractor_rep', 'quality.view'), ('contractor_rep', 'construction.view'), ('contractor_rep', 'construction.edit'),
  ('pto', 'quality.view'), ('pto', 'construction.view'),
  ('management', 'quality.view'), ('management', 'construction.view'),
  ('customer', 'quality.view'), ('customer', 'construction.view')
) v(t, a)
on conflict do nothing;
insert into core.company_role_permissions(role_id, company_id, action)
select r.id, r.company_id, tp.action
from core.company_roles r join core.role_template_permissions tp on tp.template_code = r.template_code
where tp.action like 'quality.%' or tp.action like 'construction.%'
on conflict do nothing;

-- 2. Текущая компания запроса: заголовок x-company-id, только если пользователь в ней состоит (или администратор платформы).
create or replace function quality.request_company()
returns uuid language plpgsql stable security definer set search_path = pg_catalog, core, planfact as $$
declare v text := nullif(btrim(coalesce(current_setting('request.headers', true), '')::text), '');
begin
  if v is null or auth.uid() is null then return null; end if;
  v := (v::json) ->> 'x-company-id';
  if v is null or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  if not planfact.is_company_member(v::uuid) then return null; end if;
  return v::uuid;
end $$;

-- 3. Право: компания = текущая компания запроса, модуль включён у компании, у пользователя есть действие
--    (назначение на всю компанию или на этот объект; для записей без объекта — любое действующее назначение в компании).
create or replace function quality.can(p_company uuid, p_project uuid, p_actions text[])
returns boolean language sql stable security definer set search_path = pg_catalog, core, planfact as $$
  select p_company is not null and p_company = quality.request_company() and exists (
    select 1 from unnest(p_actions) act
    join core.permission_catalog pc on pc.action = act
    join core.company_modules cm on cm.company_id = p_company and cm.module = split_part(act, '.', 1) and cm.enabled
    where planfact.is_platform_admin() or exists (
      select 1 from core.role_assignments a
      join core.company_role_permissions rp on rp.role_id = a.role_id and rp.company_id = a.company_id and rp.action = act
      where a.company_id = p_company and a.user_id = auth.uid()
        and (p_project is null or a.project_id is null or a.project_id = p_project)
        and a.revoked_at is null and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())));
$$;

-- 4. Привязка записи к компании и объекту (до вставки/изменения). Аргументы: класс таблицы, есть ли project_code.
create or replace function quality.bind_company()
returns trigger language plpgsql security definer set search_path = pg_catalog, core as $$
declare
  v_pc text;
  v_proj core.projects;
begin
  if tg_op = 'UPDATE' and new.core_company_id is distinct from old.core_company_id then
    raise exception 'Компанию записи менять нельзя' using errcode = '42501';
  end if;
  if tg_argv[1] = '1' then
    v_pc := to_jsonb(new) ->> 'project_code';
    if v_pc ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select * into v_proj from core.projects where id = v_pc::uuid;
    end if;
  end if;
  if v_proj.id is null and tg_argv[0] = 'project' then
    raise exception 'Объект не найден: выберите объект из «Объектов» компании' using errcode = '42501';
  end if;
  if v_proj.id is not null then
    new.core_project_id := v_proj.id;
    new.core_company_id := coalesce(new.core_company_id, v_proj.company_id);
  else
    new.core_project_id := null;
    new.core_company_id := coalesce(new.core_company_id, quality.request_company());
  end if;
  if new.core_company_id is null then
    raise exception 'Не выбрана компания' using errcode = '42501';
  end if;
  if tg_table_name = 'rbi_company_settings' then
    new.company_id := new.core_company_id::text;  -- настройки — одна строка на компанию
  end if;
  return new;
end $$;
`);

up.push('-- 5. Таблицы');
for (const t of names) {
  const [cls, mods, writeLevel = 'edit'] = TABLES[t];
  const s = snap.tables[t];
  const cols = split(s.cols, ' ‖ ').map((c) => c.split(' ¦ '));
  const hasPc = cols.some((c) => c[0] === 'project_code');
  if (cls === 'project' && !hasPc) throw new Error(`${t}: класс project без project_code`);
  const lines = cols.map(([n, type, notnull, def, ident]) => {
    if ((ident || '').trim()) throw new Error(`${t}.${n}: identity/generated не поддержан`);
    return `  ${q(n)} ${type}${def ? ` default ${def}` : ''}${notnull === 'true' ? ' not null' : ''}`;
  });
  lines.push('  core_company_id uuid not null references core.companies(id) on delete cascade');
  lines.push('  core_project_id uuid');
  up.push(`create table if not exists quality.${t} (\n${lines.join(',\n')}\n);`);
  up.push(`alter table quality.${t} add constraint ${t}_core_project_fk foreign key (core_project_id, core_company_id)
  references core.projects(id, company_id) on delete cascade;`);
  for (const c of split(s.cons, ' ‖ ')) {
    const [name, type, def] = c.split(' ¦ ');
    if (type === 'f') continue;  // внешние ключи — ниже, внутри quality
    let d = def;
    if (type === 'u') {
      const colsU = d.match(/^UNIQUE \((.*)\)$/)[1].replace(/"/g, '');
      if (!colsU.split(', ').includes('project_code') && !KEEP_GLOBAL_UNIQUE.has(colsU.replace(/, /g, ','))) {
        d = d.replace('UNIQUE (', 'UNIQUE (core_company_id, ');
      }
    }
    up.push(`alter table quality.${t} add constraint ${q(name)} ${d};`);
  }
  for (const ix of split(s.idx, ' ‖ ')) {
    const [, def] = ix.split(' ¦ ');
    let d = def.replace(` ON public.${t} `, ` ON quality.${t} `);
    if (!d.includes(` ON quality.${t} `)) throw new Error(`${t}: индекс не распознан: ${def}`);
    const m = d.match(/^CREATE UNIQUE INDEX .* USING \w+ \(([^)]*)\)/);
    if (m && !m[1].replace(/"/g, '').split(', ').includes('project_code') && !KEEP_GLOBAL_UNIQUE.has(m[1].replace(/"/g, '').replace(/, /g, ','))) {
      d = d.replace(/USING (\w+) \(/, 'USING $1 (core_company_id, ');
    }
    up.push(`${d};`);
  }
  up.push(`create index if not exists ${t}_core_company_idx on quality.${t} (core_company_id, core_project_id);`);
  up.push(`create trigger ${t}_bind_company before insert or update on quality.${t}
  for each row execute function quality.bind_company(${lit(cls)}, ${lit(hasPc ? '1' : '0')});`);
  const view = lit(`{${mods.map((m) => `${m}.view`).join(',')}}`);
  const write = lit(`{${mods.map((m) => `${m}.${writeLevel}`).join(',')}}`);
  up.push(`alter table quality.${t} enable row level security;
create policy ${t}_select on quality.${t} for select to authenticated using (quality.can(core_company_id, core_project_id, ${view}));
create policy ${t}_insert on quality.${t} for insert to authenticated with check (quality.can(core_company_id, core_project_id, ${write}));
create policy ${t}_update on quality.${t} for update to authenticated using (quality.can(core_company_id, core_project_id, ${write}))
  with check (quality.can(core_company_id, core_project_id, ${write}));
create policy ${t}_delete on quality.${t} for delete to authenticated using (quality.can(core_company_id, core_project_id, ${write}));
grant select, insert, update, delete on quality.${t} to authenticated;
`);
}

up.push('-- 6. Внешние ключи между таблицами quality (как в public)');
for (const t of names) {
  for (const c of split(snap.tables[t].cons, ' ‖ ')) {
    const [name, type, def] = c.split(' ¦ ');
    if (type !== 'f') continue;
    const m = def.match(/REFERENCES (\w+)\(/);
    if (m[1] === 'users') { up.push(`alter table quality.${t} add constraint ${q(name)} ${def.replace('REFERENCES users(', 'REFERENCES auth.users(')};`); continue; }
    if (!TABLES[m[1]]) throw new Error(`${t}: ссылка на неперенесённую таблицу ${m[1]}`);
    // Ссылка — только на запись своей компании: (колонка, core_company_id) → (id, core_company_id).
    const fk = def.match(/^FOREIGN KEY \((.+)\) REFERENCES (\w+)\((\w+)\)(.*)$/);
    if (!fk) throw new Error(`${t}: внешний ключ не распознан: ${def}`);
    up.push(`alter table quality.${fk[2]} add constraint ${fk[2]}_${fk[3]}_company_key unique (${fk[3]}, core_company_id);`);
    up.push(`alter table quality.${t} add constraint ${q(name)} FOREIGN KEY (${fk[1]}, core_company_id) REFERENCES quality.${fk[2]}(${fk[3]}, core_company_id)${fk[4]};`);
  }
}

up.push(`
-- 7. Права на выполнение: проверки — для RLS (authenticated); триггер — никому.
revoke all on function quality.request_company(), quality.can(uuid, uuid, text[]), quality.bind_company() from public, anon, authenticated;
grant execute on function quality.request_company(), quality.can(uuid, uuid, text[]) to authenticated;
revoke all on all tables in schema quality from anon;

commit;
`);

down.push(`-- P2-0016: откат 018_quality_up.sql. СГЕНЕРИРОВАНО scripts/gen-quality-schema.mjs.
-- Удаляет раздел quality со всеми данными компаний, права модулей Качество/Стройконтроль; модули снова неуправляемые.
-- Раздел quality перед откатом убрать из API (настройка PGRST_DB_SCHEMAS). Применять до 017a_core_review_down.sql.
begin;

do $$
begin   -- P2-0018: сторож порядка откатов (ТД №117) — ошибка до любых изменений
  if to_regprocedure('quality.row_visible(uuid,uuid,text[],text,uuid,uuid,text,text)') is not null then
    raise exception 'Сначала откатите 020: 020_quality_scope_down.sql' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'counterparties_to_quality' and tgrelid = 'core.counterparties'::regclass) then
    raise exception 'Сначала откатите 018e: 018e_quality_contractors_down.sql' using errcode = 'P0001';
  end if;
  if to_regclass('storage.buckets') is not null then
    if exists (select 1 from storage.buckets where id like 'quality-%') then
      raise exception 'Сначала откатите 018d (бакеты quality-*): 018d_quality_storage_down.sql' using errcode = 'P0001';
    end if;
  end if;
end $$;

drop schema if exists quality cascade;
delete from core.company_role_permissions where action in
  ('quality.view', 'quality.edit', 'quality.manage', 'construction.view', 'construction.edit', 'construction.manage');
delete from core.role_template_permissions where action in
  ('quality.view', 'quality.edit', 'quality.manage', 'construction.view', 'construction.edit', 'construction.manage');
delete from core.permission_catalog where action in
  ('quality.view', 'quality.edit', 'quality.manage', 'construction.view', 'construction.edit', 'construction.manage');
update core.module_catalog set managed = false where code in ('quality', 'construction');

commit;
`);

writeFileSync(`${ROOT}supabase/migrations/018_quality_up.sql`, up.join('\n'));
writeFileSync(`${ROOT}supabase/migrations/018_quality_down.sql`, down.join('\n'));
console.log(`018_quality: ${names.length} таблиц, пропущено ${SKIPPED.length} + plan_fact_*`);

// Модель public.* из того же снимка — ТОЛЬКО для PGlite (проверка tests/server/018_quality_structure.sql локально).
const model = [`-- P2-0016: ТОЛЬКО ДЛЯ PGlite. Таблицы public.* Качества из снимка сервера ${snap.taken} (структура, без данных и политик).
-- СГЕНЕРИРОВАНО scripts/gen-quality-schema.mjs. Боевой сервер этот файл не выполняет.`];
for (const t of names) {
  const s = snap.tables[t];
  const cols = split(s.cols, ' ‖ ').map((c) => c.split(' ¦ '));
  model.push(`drop table if exists public.${t} cascade;`);
  model.push(`create table public.${t} (\n${cols.map(([n, type, nn, def]) => `  ${q(n)} ${type}${def ? ` default ${def}` : ''}${nn === 'true' ? ' not null' : ''}`).join(',\n')}\n);`);
}
for (const t of names) {
  const s = snap.tables[t];
  for (const c of split(s.cons, ' ‖ ')) {
    const [name, type, def] = c.split(' ¦ ');
    if (type === 'f') continue;
    model.push(`alter table public.${t} add constraint ${q(name)} ${def};`);
  }
  for (const ix of split(s.idx, ' ‖ ')) model.push(`${ix.split(' ¦ ')[1]};`);
}
for (const t of names) {
  for (const c of split(snap.tables[t].cons, ' ‖ ')) {
    const [name, type, def] = c.split(' ¦ ');
    if (type === 'f') model.push(`alter table public.${t} add constraint ${q(name)} ${def.replace('REFERENCES users(', 'REFERENCES auth.users(')};`);
  }
}
writeFileSync(`${ROOT}tests/server/018_public_model.pglite.sql`, model.join('\n') + '\n');
