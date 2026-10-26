/// <reference types="node" />
/**
 * Один вход в ядро (P2-0015, standards/SINGLE_SOURCE_OF_TRUTH.md): функции сервера для мастер-данных ядра (объекты, локации,
 * ЕИ, контрагенты, доступ к компании) вызываются только из src/platform/core/. Модули и разделы берут эти данные через сервис ядра.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../../', import.meta.url));
const CORE_DIR = join(SRC, 'platform', 'core');

/** RPC мастер-данных ядра. Не входят (модульные настройки и справочники модуля): pf_project_set_dates / _thresholds (сводка План/Факта),
 *  pf_vor_*work_type* (виды работ ведёт ВОР — ТД), pf_my_permissions / pf_my_context / pf_my_platform (права и вход — Auth). */
export const CORE_RPC = [
  'pf_my_projects', 'pf_my_company_access', 'pf_company_projects', 'pf_create_project', 'pf_update_project',
  'pf_list_locations', 'pf_location_path', 'pf_add_location', 'pf_rename_location', 'pf_move_location', 'pf_delete_location', 'pf_generate_building',
  'pf_list_units', 'pf_add_unit', 'pf_delete_unit',
  'pf_counterparties_list', 'pf_counterparties_save', 'pf_counterparties_archive', 'pf_project_counterparties', 'pf_project_set_counterparties'
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' || n === 'node_modules' ? [] : files(p);
    return /\.(ts|tsx|js)$/.test(n) ? [p] : [];
  });
}

/** Вызовы RPC ядра вне src/platform/core (строка с именем функции в кавычках). */
export function bypasses(list: { path: string; text: string }[]): string[] {
  const re = new RegExp(`['"\`](${CORE_RPC.join('|')})['"\`]`, 'g');
  return list.filter((f) => !f.path.startsWith('platform/core/'))
    .flatMap((f) => [...f.text.matchAll(re)].map((m) => `${f.path}: ${m[1]}`));
}

test('один вход в ядро: модули не вызывают RPC мастер-данных в обход src/platform/core', () => {
  const list = files(SRC).map((p) => ({ path: relative(SRC, p).split('\\').join('/'), text: readFileSync(p, 'utf8') }));
  assert.ok(list.some((f) => f.path === 'platform/core/core.service.ts'), 'сервис ядра найден');
  assert.ok(files(CORE_DIR).some((p) => readFileSync(p, 'utf8').includes("'pf_company_projects'")), 'объекты — в сервисе ядра');
  assert.deepEqual(bypasses(list), []);
});

test('проверка ловит обход: вызов RPC ядра из модуля', () => {
  assert.deepEqual(bypasses([
    { path: 'modules/x/x.service.ts', text: "c.rpc('pf_list_units', {}); c.rpc('pf_vor_positions')" },
    { path: 'platform/core/projects.service.ts', text: "c.rpc('pf_list_units')" }
  ]), ['modules/x/x.service.ts: pf_list_units']);
});
