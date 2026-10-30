/// <reference types="node" />
/**
 * Сторож таблиц (P2-0069, стандарт ai-dev/standards/DATA_TABLES.md; было — линтер миграций P2-0015 только для core / planfact).
 * Проверяет опись ai-dev/reference/schema-inventory.json (схема всех миграций, снятая PGlite) по правилам tests/server/schema-lint.mjs:
 * (а) новая таблица любого раздела (core, planfact, quality) с нарушением без исключения — FAIL;
 * (б) у старых таблиц нарушений больше потолка ai-dev/reference/schema-debt.json — FAIL; меньше — FAIL с просьбой снизить потолок.
 * Опись устарела (миграции изменились) — FAIL с командой обновления. По свежей схеме без описи — npm run test:schema (нужен P2_PGLITE).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const LINT = new URL('../../../../tests/server/schema-lint.mjs', import.meta.url).href;
const read = (p: string) => JSON.parse(readFileSync(ROOT + p, 'utf8'));

type Col = [string, string, boolean];
interface Table { schema: string; name: string; rls: boolean; pk: string[]; fk: Record<string, string[]>; cols: Col[] }
interface InvTable { id: string; rls: boolean; pk: string[]; fk: Record<string, string[]>; cols: Col[] }
interface Rule { s: 'green' | 'yellow' | 'red' | 'na'; n: number; note: string }
interface Lint {
  evaluate(t: Table[]): { id: string; rules: Record<string, Rule> }[];
  compareDebt(e: unknown, ceiling: unknown): { fresh: string[]; grew: string[]; lower: string[] };
  migrationsHash(root: string): string;
}

const lint = (): Promise<Lint> => import(LINT);
const inventory = read('ai-dev/reference/schema-inventory.json') as { migrationsHash: string; tables: InvTable[] };
const ceiling = read('ai-dev/reference/schema-debt.json');
const tables: Table[] = inventory.tables.map((t) => ({ schema: t.id.split('.')[0], name: t.id.split('.')[1], rls: t.rls, pk: t.pk, fk: t.fk, cols: t.cols }));
const byId = (id: string) => structuredClone(tables.find((t) => `${t.schema}.${t.name}` === id)!);
const UPDATE = 'P2_PGLITE=<папка> node scripts/schema-inventory.mjs';

test('сторож таблиц: опись совпадает с миграциями', async () => {
  const { migrationsHash } = await lint();
  assert.equal(inventory.migrationsHash, migrationsHash(ROOT), `опись устарела — миграции изменились. Обновите: ${UPDATE}`);
});

test('сторож таблиц: новых нарушений нет, старых — не больше потолка', async () => {
  const { evaluate, compareDebt } = await lint();
  const e = evaluate(tables);
  assert.ok(e.some((t) => t.id === 'core.counterparties') && e.some((t) => t.id.startsWith('quality.')), 'опись видит core и quality');
  const { fresh, grew, lower } = compareDebt(e, ceiling);
  assert.deepEqual([...fresh, ...grew], [], 'нарушение стандарта ai-dev/standards/DATA_TABLES.md');
  assert.deepEqual(lower, [], `нарушений стало меньше — снизьте потолок: ${UPDATE} --update-debt`);
});

test('сторож таблиц: новая таблица без company_id и с автором текстом — FAIL с понятным текстом', async () => {
  const { evaluate, compareDebt } = await lint();
  const bad: Table = { schema: 'quality', name: 'things', rls: true, pk: ['id'], fk: {},
    cols: [['id', 'uuid', true], ['created_by', 'text', false], ['created_at', 'timestamp with time zone', true], ['updated_at', 'timestamp with time zone', true], ['deleted_at', 'timestamp with time zone', false]] };
  const { fresh } = compareDebt(evaluate([...tables, bad]), ceiling);
  assert.deepEqual(fresh, [
    'новая таблица quality.things: правило «Компания company_id» — нет company_id',
    'новая таблица quality.things: правило «Автор created_by uuid» — автор только текстом (created_by)'
  ]);
});

test('сторож таблиц: у старой таблицы нарушений стало больше — FAIL; меньше — просьба снизить потолок', async () => {
  const { evaluate, compareDebt } = await lint();
  const grown = byId('planfact.vor_profiles');
  grown.cols.push(['is_deleted', 'boolean', false]);
  assert.deepEqual(compareDebt(evaluate([...tables.filter((t) => t.name !== 'vor_profiles'), grown]), ceiling).grew,
    ['planfact.vor_profiles: правило «Удаление — пометка deleted_at» — нарушений стало 2, потолок 1: удаление флагом (is_deleted)']);
  const fixed = byId('core.divisions');
  fixed.cols.push(['deleted_at', 'timestamp with time zone', false]);
  assert.deepEqual(compareDebt(evaluate([...tables.filter((t) => t.name !== 'divisions'), fixed]), ceiling).lower,
    ['core.divisions: правило «Удаление — пометка deleted_at» — нарушений 0, потолок 1: снизьте потолок']);
});

test('сторож таблиц: исключения прежнего линтера (до правила) — жёлтые по ключу и компании, не красные', async () => {
  const { evaluate } = await lint();
  const legacy = ['companies', 'company_members', 'permission_catalog', 'role_templates', 'role_template_permissions', 'company_role_permissions',
    'company_modules', 'audit_log', 'platform_admins', 'module_catalog', 'user_profiles', 'project_stages', 'object_kinds', 'project_roles']
    .map((n) => `core.${n}`).concat(['vor_source_rows', 'vor_links', 'price_history', 'estimate_rows', 'estimate_overheads', 'ks2_settings'].map((n) => `planfact.${n}`));
  const e = evaluate(tables);
  for (const id of legacy) {
    const t = e.find((x) => x.id === id);
    assert.ok(t, `${id} есть в описи`);
    assert.notEqual(t.rules.key.s, 'red', `${id}: ключ`);
    assert.notEqual(t.rules.company.s, 'red', `${id}: компания`);
  }
});

test('P2-0072: правило 10 — сумма в строке без валюты: валюта у родителя по внешнему ключу — зелёный, без неё — красный', async () => {
  const { evaluate } = await lint();
  const T = 'timestamp with time zone';
  const base: Col[] = [['id', 'uuid', true], ['company_id', 'uuid', true], ['created_by', 'uuid', false], ['created_at', T, true], ['updated_at', T, true],
    ['deleted_at', T, false]];
  const parent = (name: string, currency: boolean): Table => ({ schema: 'planfact', name, rls: true, pk: ['id'], fk: { company_id: ['core.companies'] },
    cols: [...base, ...(currency ? [['currency', 'text', true] as Col] : [])] });
  const row = (name: string, to: string): Table => ({ schema: 'planfact', name, rls: true, pk: ['id'], fk: { company_id: ['core.companies'], doc_id: [to] },
    cols: [...base, ['doc_id', 'uuid', true], ['amount', 'numeric(18,2)', true]] });
  const e = evaluate([...tables, parent('m72_docs', true), parent('m72_nocur', false), row('m72_rows', 'planfact.m72_docs'), row('m72_bad', 'planfact.m72_nocur')]);
  const money = (id: string) => e.find((x) => x.id === id)!.rules.money;
  assert.deepEqual(money('planfact.m72_rows'), { s: 'green', n: 0, note: 'валюта у родителя planfact.m72_docs' });
  assert.equal(money('planfact.m72_bad').s, 'red');
  assert.match(money('planfact.m72_bad').note, /нет валюты ни в строке, ни у родителя \(суммы: amount\)/);
});

test('P2-0072: мост номеров Качества (054) — ключ id text + core_id uuid и ссылки текстом рядом со связью по uuid — жёлтые с причиной', async () => {
  const { evaluate } = await lint();
  const e = evaluate(tables);
  const rule = (id: string, code: string) => e.find((x) => x.id === id)!.rules[code];
  const k = rule('quality.rbi_inspections', 'key');
  assert.equal(k.s, 'yellow');
  assert.match(k.note, /мост: core_id uuid рядом со старым ключом \(core_company_id uuid, id text\)/);
  const r = rule('quality.shared_report_snapshots', 'refs');
  assert.equal(r.s, 'yellow');
  assert.match(r.note, /report_id → core_report_id/);
  assert.equal(rule('quality.location_nodes', 'refs').s, 'yellow');
  // без моста — по-прежнему красный: ключ id text без core_id
  const noBridge = byId('quality.rbi_tasks');
  noBridge.cols = noBridge.cols.filter(([n]) => n !== 'core_id');
  assert.equal(evaluate([noBridge])[0].rules.key.s, 'red');
});
