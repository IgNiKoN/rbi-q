// P2-0069: стандарт таблиц сервера в виде проверки — чтение схемы (PGlite со всеми миграциями), светофор по правилам
// ai-dev/standards/DATA_TABLES.md, классы исключений и потолок старых нарушений (ai-dev/reference/schema-debt.json).
// Один источник правил: им пользуются опись (scripts/schema-inventory.mjs) и сторож (src/platform/core/__tests__/migrations-lint.test.ts).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Разделы, которые подчиняются стандарту. */
export const SCOPE = ['core', 'planfact', 'quality'];

/** Разделы вне стандарта — в описи перечисляются, светофор не считается. */
export const OUT_OF_SCOPE = {
  public: 'таблицы старого приложения RBI (в описи — модель для PGlite, 018_public_model); данные перенесены в quality',
  p2_backup: 'резервные копии перед переносом людей (040a1); снять после ~20.11.2026 — ТД №240',
  auth: 'учётные записи Supabase (в описи — модель для PGlite); схемой владеет Supabase',
  storage: 'файлы Supabase Storage (в описи — модель для PGlite); схемой владеет Supabase'
};

/** Правила стандарта: код → название и «почему» простым языком (полный текст — DATA_TABLES.md). */
export const RULES = [
  { code: 'key', title: 'Ключ id uuid', why: 'запись узнаётся одинаково на телефоне и на сервере; id создаётся на устройстве — повторная отправка не делает дубль' },
  { code: 'company', title: 'Компания company_id', why: 'граница данных: чужая компания записи не видит' },
  { code: 'axis', title: 'Проект и место — по id', why: 'поиск и права — только по id; название — подпись, его можно поменять' },
  { code: 'author', title: 'Автор created_by uuid', why: 'автор — учётная запись; ФИО меняется, поэтому оно только подпись' },
  { code: 'time', title: 'Время с часовым поясом', why: 'created_at / updated_at одинаково читаются в любом часовом поясе' },
  { code: 'delete', title: 'Удаление — пометка deleted_at', why: 'ничего не стирается: удалённое можно найти и вернуть' },
  { code: 'refs', title: 'Ссылки — uuid с внешним ключом', why: 'база сама не даёт сослаться на несуществующую запись; фирма — по id, не по названию' },
  { code: 'names', title: 'Имена snake_case', why: 'одно написание имён во всех таблицах' },
  { code: 'rls', title: 'Защита строк (RLS)', why: 'без неё таблица открыта всем учёткам сервера' },
  { code: 'money', title: 'Деньги — numeric и валюта', why: 'сумма без валюты и с дробной ошибкой — не деньги' }
];
export const RULE_CODES = RULES.map((r) => r.code);

/** Классы исключений: какие правила класс снимает (жёлтый вместо красного) и почему. */
export const CLASSES = {
  catalog: { title: 'Каталог платформы', waives: ['key', 'company', 'author', 'delete'], why: 'общий для всех компаний справочник: ключ — код, правит только платформа' },
  link: { title: 'Связка', waives: ['key', 'author', 'delete'], why: 'пара значений и есть запись: ключ — составной, изменения пишет журнал core.audit_log' },
  journal: { title: 'Журнал / событие', waives: ['key', 'delete'], why: 'только добавление: запись не правится и не удаляется, updated_at не нужен; исправление — новой записью' },
  child: { title: 'Дочерняя строка', waives: ['company', 'author', 'delete', 'time'], why: 'живёт и удаляется вместе с родителем; компания, автор и время — у родителя' },
  single: { title: 'Одна запись на владельца', waives: ['key', 'author', 'delete'], why: 'ключ — владелец (пользователь, проект, компания): профиль или настройки' },
  root: { title: 'Сама компания', waives: ['company'], why: 'это и есть граница данных' },
  bridge: { title: 'Мост / служебная', waives: ['key', 'author', 'delete', 'time', 'axis', 'refs'], why: 'временная таблица переноса или сопоставления; снимается уборкой с датой (спека п. 14, TECH_DEBT)' },
  'quality-legacy': { title: 'Качество из RBI', waives: ['names'], why: 'решение владельца 30.10.2026: таблицы Качества не переименовываем, правильные поля добавляем рядом' }
};

/** Таблица → классы и причина (бывший LEGACY линтера P2-0015 + Качество). Таблицы quality.* получают «quality-legacy» сами. */
export const TABLES = {
  'core.companies': { classes: ['root'], why: 'сама компания' },
  'core.company_members': { classes: ['link'], why: 'связка компания–пользователь, составной ключ; выключение — disabled_at' },
  'core.permission_catalog': { classes: ['catalog'], why: 'каталог прав платформы' },
  'core.role_templates': { classes: ['catalog'], why: 'каталог шаблонов ролей' },
  'core.role_template_permissions': { classes: ['catalog', 'link'], why: 'каталог платформы, составной ключ' },
  'core.company_role_permissions': { classes: ['link'], why: 'связка роль–право, составной ключ' },
  'core.company_modules': { classes: ['link'], why: 'связка компания–модуль, составной ключ' },
  'core.module_catalog': { classes: ['catalog'], why: 'каталог модулей' },
  'core.project_stages': { classes: ['catalog'], why: 'справочник платформы: стадии проекта (P2-0047)' },
  'core.object_kinds': { classes: ['catalog'], why: 'справочник платформы: виды объектов (P2-0047)' },
  'core.project_roles': { classes: ['catalog'], why: 'справочник платформы: роль компании в проекте (P2-0047)' },
  'core.platform_admins': { classes: ['single'], why: 'администраторы платформы, ключ — пользователь' },
  'core.user_profiles': { classes: ['single'], why: 'одно ФИО на учётку во всех компаниях, ключ — пользователь (P2-0028)' },
  'core.audit_log': { classes: ['journal'], why: 'журнал изменений, ключ bigint по порядку', waive: { author: 'автор — поле actor', refs: 'журнал хранит id и после удаления записи' } },
  'core.role_assignments': { why: 'назначение не удаляется, а отзывается', waive: { delete: 'отзыв — revoked_at / revoked_by' } },
  'planfact.vor_source_rows': { classes: ['child'], why: 'строки загрузки ВОР — компания через загрузку' },
  'planfact.vor_links': { classes: ['child'], why: 'связи позиций ВОР — компания через загрузку' },
  'planfact.estimate_rows': { classes: ['child'], why: 'строки сметы — компания через смету' },
  'planfact.estimate_overheads': { classes: ['child'], why: 'надбавки сметы — компания через смету' },
  'planfact.overhead_lines': { classes: ['child'], why: 'строки шаблона надбавок' },
  'planfact.ks2_settings': { classes: ['single'], why: 'настройки КС-2, ключ — проект' },
  'planfact.price_history': { classes: ['journal'], why: 'история цены, ключ bigint', waive: { author: 'автор — поле changed_by' } },
  'planfact.vor_position_events': { classes: ['journal'], why: 'события позиции ВОР' },
  'planfact.vor_heads': { why: 'указатель на текущую редакцию ВОР', waive: { author: 'автор переключения — changed_by', delete: 'живёт, пока жива ВОР' } },
  'planfact.fact_entries': { classes: ['journal'], why: 'факт — события (§9 п. 3): исправление — новой записью corrects_id, решение — поля decided_*' },
  'planfact.fact_submissions': { classes: ['journal'], why: 'итог отправки факта с устройства (повтор без дубля, P2-0064)' },
  'planfact.kp_revisions': { classes: ['journal'], why: 'редакция КП неизменяема (§9 п. 4)' },
  'planfact.ks2_revisions': { classes: ['journal'], why: 'редакция КС-2 неизменяема (§9 п. 4)' },
  'quality.rbi_transfer_projects': { classes: ['bridge'], why: 'перенос из RBI: старый код → проект ядра' },
  'quality.rbi_transfer_people': { classes: ['bridge'], why: 'перенос из RBI: старый профиль → учётка' },
  'quality.rbi_transfer_files': { classes: ['bridge'], why: 'перенос из RBI: копирование файлов' },
  'quality.rbi_transfer_runs': { classes: ['bridge', 'journal'], why: 'перенос из RBI: журнал запусков' },
  'quality.contractor_core_links': { classes: ['bridge'], why: 'мост «ключ подрядчика Качества → контрагент ядра»' },
  'quality.contractor_aliases': { classes: ['bridge'], why: 'мост: написания подрядчика → ключ' },
  'quality.object_aliases': { classes: ['bridge'], why: 'мост: написания объекта → ключ' },
  'quality.location_node_aliases': { classes: ['bridge'], why: 'мост: написания места → узел' },
  'quality.rbi_inspection_items': { classes: ['child'], why: 'пункты проверки — живут с проверкой' },
  'quality.rbi_inspection_photos': { classes: ['child'], why: 'фото пункта проверки — живут с проверкой' },
  'quality.rbi_sync_queue': { classes: ['journal'], why: 'очередь отправки с устройства' },
  'quality.rbi_error_logs': { classes: ['journal'], why: 'журнал ошибок приложения' },
  'quality.project_settings': { classes: ['single'], why: 'настройки проекта Качества, ключ — проект' },
  'quality.rbi_company_settings': { classes: ['single'], why: 'настройки компании Качества, ключ — компания' }
};

/** Модуль таблицы по каталогу reference/MODULES.md. */
export function moduleOf(schema, name) {
  if (schema === 'core') return 'Ядро платформы («Компания»)';
  if (schema === 'planfact') return /^(fact_|works$|brigades$)/.test(name) ? 'План/Факт · Производство (5.1.2)' : 'План/Факт · Сметы и КС-2 (5.1.1)';
  if (schema === 'quality') {
    if (name.startsWith('sk_')) return 'Аналитика внешнего СК (5.5)';
    if (name.startsWith('construction_')) return 'Стройконтроль (5.3)';
    if (name.startsWith('rbi_transfer_')) return 'Перенос из RBI (служебное)';
    return 'Качество (5.2)';
  }
  return schema;
}

/** Схема из базы: таблицы, колонки, ключ, внешние ключи, RLS. Только pg_catalog — данных не читает. */
export async function readSchema(db) {
  const tables = (await db.query(`
    select n.nspname as schema, c.relname as name, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'extensions')
    order by 1, 2`)).rows;
  const cols = (await db.query(`
    select n.nspname as schema, c.relname as tbl, a.attname as name, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as nn
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'extensions')
    order by 1, 2, a.attnum`)).rows;
  const cons = (await db.query(`
    select n.nspname as schema, c.relname as tbl, k.contype as type,
      array(select a.attname from unnest(k.conkey) with ordinality u(num, o) join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.num order by u.o)::text[] as cols,
      case when k.contype = 'f' then k.confrelid::regclass::text end as ref
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
    where k.contype in ('p', 'f') and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'extensions')
    order by 1, 2, 3`)).rows;
  const byId = new Map(tables.map((t) => [`${t.schema}.${t.name}`, { schema: t.schema, name: t.name, rls: t.rls, pk: [], cols: [], fk: {} }]));
  for (const c of cols) byId.get(`${c.schema}.${c.tbl}`)?.cols.push([c.name, c.type, c.nn]);
  for (const k of cons) {
    const t = byId.get(`${k.schema}.${k.tbl}`);
    if (!t) continue;
    if (k.type === 'p') t.pk = k.cols;
    else for (const col of k.cols) (t.fk[col] ||= []).includes(k.ref) || t.fk[col].push(k.ref);
  }
  return [...byId.values()];
}

/** Хеш всего, из чего PGlite строит схему: миграции *_up.sql и модели *_model.pglite.sql. Опись устарела, если хеш другой. */
export function migrationsHash(root) {
  const h = createHash('sha256');
  const add = (dir, re) => readdirSync(join(root, dir)).filter((f) => re.test(f)).sort()
    .forEach((f) => h.update(`${dir}/${f}\n`).update(readFileSync(join(root, dir, f))));
  add('supabase/migrations', /_up\.sql$/);
  add('tests/server', /_model\.pglite\.sql$/);
  return h.digest('hex').slice(0, 16);
}

// ——— правила ———
const TZ = 'timestamp with time zone';
const isSnake = (s) => /^[a-z][a-z0-9_]*$/.test(s);
const PROJECT_UUID = ['project_id', 'core_project_id', 'core_object_id'];
const PROJECT_TEXT = ['project_code', 'projectId', 'project_canonical_key'];
const PLACE_UUID = ['location_id', 'core_location_id'];
const PLACE_TEXT = ['locationId', 'location_id', 'object_id', 'building_id', 'floor_id', 'location', 'section', 'floor', 'room'];
const AUTHOR_BRIDGE = ['core_created_by', 'created_by_auth_user_id'];
const AUTHOR_TEXT = ['created_by', 'updated_by', 'deleted_by', 'owner', 'uploaded_by'];
const SOFT_DELETE_BOOL = ['is_deleted', '_deleted', 'deleted', 'archived', 'is_archived'];
const CONTRACTOR_TEXT = ['contractor', 'contractor_raw', 'contractor_canonical_key', 'assigned_contractor', 'contractorId', 'contractor_name'];
const CONTRACTOR_UUID = ['counterparty_id', 'core_counterparty_id'];
/** Похожи на ссылку, но не ссылаются на запись: id устройства, группы отправки, многотабличные ссылки журналов. */
export const NOT_REF = { device_id: 'id устройства', client_id: 'id с устройства для повтора без дубля', batch_id: 'группа отправки, не запись',
  import_batch: 'группа загрузки, не запись', record_id: 'журнал: ссылка на запись любой таблицы', source_record_id: 'очередь: запись любой таблицы',
  entity_id: 'реестр файлов: запись любой таблицы' };
const isUserRef = (n) => n === 'user_id' || /_user_id$/.test(n) || n === 'auth_user_id';
const isRefName = (n) => n !== 'id' && (/_id$/.test(n) || /[a-z]Id$/.test(n)) && !(n in NOT_REF);

const R = (s, n = 0, note = '') => ({ s, n, note });

/** Светофор одной таблицы: правило → { s: green|yellow|red|na, n: число нарушений, note }. */
export function evaluateTable(t) {
  const id = `${t.schema}.${t.name}`;
  const col = new Map(t.cols.map(([n, ty, nn]) => [n, { ty, nn }]));
  const has = (n, pred = () => true) => col.has(n) && pred(col.get(n).ty);
  const uuid = (ty) => ty === 'uuid';
  const text = (ty) => ty === 'text' || ty.startsWith('character');
  const list = (names, pred) => names.filter((n) => has(n, pred));
  const cfg = TABLES[id] || {};
  const classes = [...(cfg.classes || []), ...(t.schema === 'quality' ? ['quality-legacy'] : [])];
  const out = {};

  // ключ
  out.key = t.pk.length === 1 && t.pk[0] === 'id' && has('id', uuid) ? R('green')
    : R('red', 1, t.pk.length === 0 ? 'нет первичного ключа' : t.pk.length > 1 ? `составной ключ (${t.pk.join(', ')})` : `ключ ${t.pk[0]} ${col.get(t.pk[0])?.ty}`);

  // компания
  const oldCompany = list(['companyId', 'company_id'], text);
  if (has('company_id', uuid)) out.company = col.get('company_id').nn ? R('green') : R('red', 1, 'company_id может быть пустым');
  else if (has('core_company_id', uuid)) out.company = R('yellow', 0, `мост: core_company_id${oldCompany.length ? ` рядом со старым ${oldCompany.join(', ')} (текст)` : ''}`);
  else out.company = R('red', 1, oldCompany.length ? `компания только текстом (${oldCompany.join(', ')})` : 'нет company_id');

  // проект / объект / место
  const pU = list(PROJECT_UUID, uuid), pT = list(PROJECT_TEXT, text), lU = list(PLACE_UUID, uuid), lT = list(PLACE_TEXT, text);
  if (!pU.length && !pT.length && !lU.length && !lT.length) out.axis = R('na');
  else {
    const bad = [];
    if (pT.length && !pU.length) bad.push(`проект только текстом (${pT.join(', ')})`);
    if (lT.length && !lU.length) bad.push(`место только текстом (${lT.join(', ')})`);
    out.axis = bad.length ? R('red', bad.length, bad.join('; '))
      : pT.length || lT.length ? R('yellow', 0, `мост: текст рядом с id (${[...pT, ...lT].join(', ')})`) : R('green');
  }

  // автор
  const aText = list(AUTHOR_TEXT, text), aBridge = list(AUTHOR_BRIDGE, uuid);
  if (has('created_by', uuid)) out.author = aText.length ? R('yellow', 0, `мост: старый автор текстом рядом (${aText.join(', ')})`) : R('green');
  else if (aBridge.length) out.author = R('yellow', 0, `мост: автор по id в ${aBridge.join(', ')}${aText.length ? `; старое текстом — ${aText.join(', ')}` : ''}`);
  else {
    const other = t.cols.filter(([n, ty]) => /_by$/.test(n) && uuid(ty)).map(([n]) => n);
    out.author = R('red', 1, aText.length ? `автор только текстом (${aText.join(', ')})` : `нет created_by uuid${other.length ? ` (есть ${other.join(', ')})` : ''}`);
  }

  // время
  const journal = classes.includes('journal');
  const noTz = t.cols.filter(([, ty]) => ty === 'timestamp without time zone').map(([n]) => n);
  const tBad = [...noTz.map((n) => `${n} без часового пояса`)];
  if (!has('created_at', (ty) => ty === TZ) && !(journal && (has('at', (ty) => ty === TZ) || has('changed_at', (ty) => ty === TZ)))) tBad.push('нет created_at');
  if (!journal && !has('updated_at', (ty) => ty === TZ)) tBad.push('нет updated_at');
  out.time = tBad.length ? R('red', tBad.length, tBad.join('; ')) : R('green');

  // удаление
  const bools = list(SOFT_DELETE_BOOL, (ty) => ty === 'boolean');
  if (has('deleted_at', (ty) => ty === TZ)) out.delete = bools.length ? R('yellow', 0, `мост: ${bools.join(', ')} рядом с deleted_at`) : R('green');
  else {
    const alt = ['archived_at', 'disabled_at', 'revoked_at'].filter((n) => col.has(n));
    out.delete = R('red', 1 + bools.length, [bools.length ? `удаление флагом (${bools.join(', ')})` : 'нет deleted_at', alt.length ? `есть ${alt.join(', ')} — это не удаление` : ''].filter(Boolean).join('; '));
  }

  // ссылки
  const axisCols = new Set([...PROJECT_UUID, ...PROJECT_TEXT, ...PLACE_UUID, ...PLACE_TEXT, 'companyId', 'contractorId']);
  const textRefs = t.cols.filter(([n, ty]) => isRefName(n) && text(ty) && !axisCols.has(n) && !(n === 'company_id')).map(([n]) => n);
  const noFk = t.cols.filter(([n, ty]) => (isRefName(n) || /^core_.*_id$/.test(n)) && uuid(ty) && !isUserRef(n) && !t.fk[n]).map(([n]) => n);
  const cT = list(CONTRACTOR_TEXT, text), cU = list(CONTRACTOR_UUID, uuid);
  const rBad = [...(textRefs.length ? [`ссылка текстом (${textRefs.join(', ')})`] : []), ...(noFk.length ? [`нет внешнего ключа (${noFk.join(', ')})`] : []),
    ...(cT.length && !cU.length ? [`фирма только названием (${cT.join(', ')})`] : [])];
  const rCount = textRefs.length + noFk.length + (cT.length && !cU.length ? 1 : 0);
  const anyRef = t.cols.some(([n]) => isRefName(n) || /^core_.*_id$/.test(n)) || cT.length;
  out.refs = rCount ? R('red', rCount, rBad.join('; '))
    : !anyRef ? R('na') : cT.some((n) => n !== 'contractor_name') ? R('yellow', 0, `мост: название фирмы рядом с id (${cT.join(', ')})`) : R('green');

  // имена
  const badNames = [...(isSnake(t.name) ? [] : [t.name]), ...t.cols.map(([n]) => n).filter((n) => !isSnake(n))];
  out.names = badNames.length ? R('red', badNames.length, `не snake_case: ${badNames.join(', ')}`) : R('green');

  // RLS
  out.rls = t.rls ? R('green') : R('red', 1, 'RLS выключен');

  // деньги
  const money = t.cols.filter(([n, ty]) => /(price|amount|total|cost|sum|labor|material)/.test(n) && /^(numeric|real|double precision|money|integer|bigint)/.test(ty));
  if (!money.length) out.money = R('na');
  else {
    const mBad = money.filter(([, ty]) => !ty.startsWith('numeric')).map(([n, ty]) => `${n} ${ty}`);
    if (!has('currency')) mBad.push(`нет валюты (суммы: ${money.map(([n]) => n).join(', ')})`);
    out.money = mBad.length ? R('red', mBad.length, mBad.join('; ')) : R('green');
  }

  // исключения: класс или правило таблицы снимает красный/жёлтый → жёлтый с причиной
  for (const code of RULE_CODES) {
    const r = out[code];
    if (r.s === 'green' || r.s === 'na') continue;
    const own = cfg.waive?.[code];
    const cls = classes.find((c) => CLASSES[c].waives.includes(code));
    if (own || cls) out[code] = R('yellow', 0, `${own ? `исключение: ${own}` : `класс «${CLASSES[cls].title}»: ${cfg.why || CLASSES[cls].why}`}${r.note ? ` — ${r.note}` : ''}`);
  }
  return { id, schema: t.schema, name: t.name, module: moduleOf(t.schema, t.name), classes, why: cfg.why || '', rules: out };
}

export const evaluate = (tables) => tables.filter((t) => SCOPE.includes(t.schema)).map(evaluateTable);

/** Нарушения (только красные): таблица → правило → число. */
export function debtOf(evaluation) {
  const debt = {};
  for (const e of evaluation) {
    const d = {};
    for (const code of RULE_CODES) if (e.rules[code].s === 'red') d[code] = e.rules[code].n;
    debt[e.id] = d;
  }
  return debt;
}

const ruleTitle = (code) => RULES.find((r) => r.code === code).title;

/** Сравнение с потолком: fresh — новая таблица с нарушением, grew — стало больше, lower — стало меньше (снизить потолок). */
export function compareDebt(evaluation, ceiling) {
  const known = ceiling.tables || {};
  const fresh = [], grew = [], lower = [];
  for (const e of evaluation) {
    const cap = known[e.id];
    for (const code of RULE_CODES) {
      const r = e.rules[code], n = r.s === 'red' ? r.n : 0;
      if (!cap) { if (n) fresh.push(`новая таблица ${e.id}: правило «${ruleTitle(code)}» — ${r.note}`); continue; }
      const c = cap[code] || 0;
      if (n > c) grew.push(`${e.id}: правило «${ruleTitle(code)}» — нарушений стало ${n}, потолок ${c}: ${r.note}`);
      else if (n < c) lower.push(`${e.id}: правило «${ruleTitle(code)}» — нарушений ${n}, потолок ${c}: снизьте потолок`);
    }
  }
  const ids = new Set(evaluation.map((e) => e.id));
  for (const id of Object.keys(known)) if (!ids.has(id)) lower.push(`${id}: таблицы больше нет — уберите её из потолка`);
  return { fresh, grew, lower };
}
