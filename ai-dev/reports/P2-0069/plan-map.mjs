// P2-0069 этап 5: раскладка каждого красного светофора по шагам плана переезда → migration-plan.md (таблица) и plan.html (раздел описи).
// Запуск: node ai-dev/reports/P2-0069/plan-map.mjs (PGlite не нужен — читает опись). Красное без шага — ошибка.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluate, RULES, RULE_CODES } from '../../../tests/server/schema-lint.mjs';

const DIR = fileURLToPath(new URL('./', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const inv = JSON.parse(readFileSync(ROOT + 'ai-dev/reference/schema-inventory.json', 'utf8'));
const ev = evaluate(inv.tables.map((t) => ({ schema: t.id.split('.')[0], name: t.id.split('.')[1], rls: t.rls, pk: t.pk, fk: t.fk, cols: t.cols })));

/** Шаги плана: группа, что меняется, способ, CRITICAL, порядок, оценка, блок очереди. */
export const STEPS = {
  'Я1': { group: 'Ядро', what: 'кто создал (created_by) у компании, роли, контрагента, проекта; пометка удаления у подразделения', how: 'добавить колонку (created_by uuid default auth.uid(), deleted_at); старые строки — автор из core.audit_log, где есть', critical: 'нет (добавляющая миграция ядра)', order: 1, est: '0,5 дня', block: 'P2-0053 «Демо-стенд» — создаёт компании, проекты и контрагентов' },
  'ПФ1': { group: 'План/Факт', what: 'ВОР: updated_at, deleted_at, created_at у словаря и указателя редакции, внешние ключи company_id / project_id', how: 'добавить колонки и внешние ключи (данные уже согласованы — проверка до внешнего ключа)', critical: 'нет', order: 2, est: '0,5 дня', block: 'P2-0050 / 0050b «Адресная ВОР» — трогает загрузку и позиции ВОР' },
  'ПФ2': { group: 'План/Факт', what: 'сметы, КП, КС-2, шаблоны надбавок: updated_at, created_at, deleted_at, created_by, внешний ключ company_id', how: 'добавить колонки и внешние ключи; переименований нет (код читает через RPC — проверить по коду в блоке)', critical: 'нет', order: 3, est: '0,5 дня', block: 'P2-0065 «Документы и печать» — печать КП и КС-2' },
  'ПФ3': { group: 'План/Факт', what: 'деньги с валютой: смета, КП, КС-2, прайс, история цены, план работ', how: 'currency (по умолчанию RUB) у проекта и прайса, ставка НДС; строки — валюта родителя (вопрос Архитектору №3)', critical: 'да — деньги', order: 4, est: '1 день', block: 'P2-0065 «Документы и печать» (суммы в печатных формах)' },
  'ПФ4': { group: 'План/Факт', what: 'бригады и план работ: updated_at, deleted_at; итоги отправки факта — внешние ключи', how: 'бригады переезжают в ядро (договор → бригада); planfact.works читает экран «Работы» (src/modules/planfact/PlanfactWorks.ts) — добавить колонки, не убирать', critical: 'нет', order: 5, est: '0,5 дня', block: 'блок карты 3 «Договоры и бригады»' },
  'К1': { group: 'Качество — ключ', what: 'ключ записи — id text + компания (около 50 таблиц Качества, СК и Стройконтроля)', how: 'вопрос Архитектору №1: класс исключения «id с устройства» или uuid рядом; переименований нет', critical: 'да — все записи Качества', order: 9, est: 'после решения', block: 'P2-0063 «Уборка» (блок карты 7)' },
  'К2': { group: 'Качество — автор', what: 'автор по id вместо ФИО / текста', how: 'поле рядом core_created_by uuid (уже есть в 17 таблицах), заполнить по сопоставлению людей (040b, 040c), писать в оба, старое снять уборкой', critical: 'да — боевые данные Качества', order: 6, est: '1 день', block: 'P2-0063 «Уборка»' },
  'К3': { group: 'Качество — компания/проект/место', what: 'место по id в проверках, черновиках и справочнике подрядчиков (сейчас — название секции, этажа, помещения)', how: 'поле рядом core_location_id, заполнить по дереву мест ядра (P2-0045, P2-0054), писать в оба; название — снимок для печати', critical: 'да — боевые данные Качества', order: 7, est: '1–2 дня', block: 'блок карты 6 «Места ведёт ядро»' },
  'К4': { group: 'Качество — компания/проект/место', what: 'фирма по id (договоры, профили, черновики), пункт чек-листа по id', how: 'фирма — поле рядом core_counterparty_id (как 039a); пункт — после шаблонов чек-листов в ядре', critical: 'да — боевые данные Качества', order: 8, est: '1 день', block: 'блоки карты 3 «Договоры и бригады» и 4 «Шаблоны чек-листов в ядре»' },
  'К5': { group: 'Качество — прочее', what: 'created_at и deleted_at там, где их нет; удаление флагом у реестра файлов', how: 'добавить created_at default now(), deleted_at рядом с is_deleted; флаг снять уборкой', critical: 'нет (добавляющая)', order: 6, est: '0,5 дня', block: 'P2-0063 «Уборка»' },
  'К6': { group: 'Качество — ключ', what: 'ссылки текстом на записи Качества (проверка, отчёт, родитель места)', how: 'переходят вместе с ключом (шаг К1)', critical: 'да', order: 9, est: 'с К1', block: 'P2-0063 «Уборка»' },
  'С1': { group: 'Стройконтроль', what: 'construction_*_v2: место по id, автор по id, пункт чек-листа по id', how: 'поле рядом core_location_id / core_created_by, заполнить, писать в оба', critical: 'да — боевые данные СК', order: 5, est: '1 день', block: '4б «Ролевая модель Стройконтроля» и P2-0057 «PDF-планы» (этажи и квартиры v2)' },
  'С2': { group: 'Стройконтроль', what: 'construction_* без _v2 — старые таблицы RBI', how: 'их читает синхронизация Качества (js/services/sync/*, storage-db.core.js) — поле рядом как С1; снять, когда синхронизация перейдёт на v2', critical: 'да — боевые данные', order: 10, est: '0,5 дня', block: 'P2-0063 «Уборка»' },
  'СК': { group: 'прочее — Аналитика внешнего СК', what: 'sk_*: ключ, автор текстом, нет пометки удаления, фирма названием', how: 'модуль переходный (MODULES 5.5) — вопрос Архитектору №2: класс «переходный модуль» или минимум (автор, удаление) при касании', critical: 'нет', order: 11, est: 'после решения', block: 'при отмирании модуля / P2-0063' }
};

function stepOf(e, rule) {
  const { schema, name } = e;
  if (schema === 'core') return 'Я1';
  if (schema === 'planfact') {
    if (rule === 'money') return 'ПФ3';
    if (name.startsWith('vor_')) return 'ПФ1';
    if (['brigades', 'works', 'fact_submissions'].includes(name)) return 'ПФ4';
    return 'ПФ2';
  }
  if (name.startsWith('sk_')) return 'СК';
  if (name.startsWith('construction_')) return rule === 'key' ? 'К1' : name.endsWith('_v2') ? 'С1' : 'С2';
  if (rule === 'key') return 'К1';
  if (rule === 'author') return 'К2';
  if (rule === 'axis') return 'К3';
  if (rule === 'refs') return /фирма|item_id/.test(e.rules.refs.note) ? 'К4' : 'К6';
  if (rule === 'time' || rule === 'delete') return 'К5';
  return null;
}

const rows = [];
for (const e of ev) for (const r of RULE_CODES) if (e.rules[r].s === 'red') {
  const s = stepOf(e, r);
  if (!s || !STEPS[s]) throw new Error(`красное без шага: ${e.id} ${r}`);
  rows.push({ id: e.id, rule: r, note: e.rules[r].note, step: s });
}
const title = (r) => RULES.find((x) => x.code === r).title;
const order = Object.entries(STEPS).sort((a, b) => a[1].order - b[1].order);
const count = (s) => rows.filter((x) => x.step === s).length;

writeFileSync(DIR + 'plan-map.md', `<!-- создано plan-map.mjs: красных ${rows.length}, все с шагом -->
| Таблица | Правило | Что не так | Шаг |
|---|---|---|---|
${rows.map((x) => `| \`${x.id}\` | ${title(x.rule)} | ${x.note} | ${x.step} |`).join('\n')}
`);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
writeFileSync(DIR + 'plan.html', `<h2>План переезда</h2>
<div class="card"><p>Каждое красное (${rows.length}) отнесено к шагу и к блоку очереди, который всё равно трогает эти таблицы (MODULES §9). Качество — только «поле рядом», без переименований (решение владельца 30.10.2026). Подробно — <code>ai-dev/reports/P2-0069/migration-plan.md</code>.</p></div>
<div class="scroll"><table><thead><tr><th>Шаг</th><th>Группа</th><th>Что меняется</th><th>Красных</th><th>CRITICAL</th><th>Блок</th></tr></thead><tbody>
${order.map(([k, s]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(s.group)}</td><td>${esc(s.what)}</td><td class="num">${count(k)}</td><td>${esc(s.critical)}</td><td>${esc(s.block)}</td></tr>`).join('\n')}
</tbody></table></div>
`);
console.log(`красных ${rows.length}, все с шагом; по шагам: ${order.map(([k]) => `${k} ${count(k)}`).join(', ')}`);
