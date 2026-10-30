// P2-0070: кнопки Стройконтроля 2.0 по действию роли в области участия (rights.ts → правило устройства canAct);
// без входа почтой («кто я» нет) — прежний признак экрана.
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — правило устройства на JS без типов
import { canAct, kindOf, meFrom } from '../../../../js/services/sync/sync-access.policy.js';
import { allowed, can, noRightText } from '../rights.ts';

const W = globalThis as unknown as { RbiSyncAccess?: unknown };
function login(me: unknown): void {
  W.RbiSyncAccess = { deviceMe: () => me, kindOf, canAct };
}
const U1 = '11111111-1111-4111-8111-111111111111';
const acts = (xs: string[]) => meFrom({ userId: U1, name: 'Иванов', actions: xs,
  area: { admin: false, enabled: true, grants: [{ project: 'p1', place: null, places: null, actions: xs, counterparty: null }] } });

test('без «кто я» (вход по PIN) — прежний признак экрана', () => {
  delete W.RbiSyncAccess;
  assert.equal(allowed('construction.defects.close', {}), null);
  assert.equal(can('construction.defects.close', {}, true), true);
  login(null);
  assert.equal(can('construction.defects.close', {}, false), false);
});

test('по действию роли: снята галочка «Закрыть» — кнопки нет, «Вернуть» есть; чужой объект — нет', () => {
  login(acts(['construction.defects.view', 'construction.defects.reject', 'construction.acceptance.book']));
  const d = { id: 'd', core_project_id: 'p1', core_location_id: 'l1' };
  assert.equal(can('construction.defects.close', d, true), false);
  assert.equal(can('construction.defects.reject', d, false), true);
  assert.equal(can('construction.defects.reject', { ...d, core_project_id: 'p2' }, true), false);
  assert.equal(can('construction.acceptance.book', d, false), true, 'приёмка — свой вид записи');
  assert.equal(can('construction.acceptance.conduct', d, true), false);
  assert.equal(noRightText('construction.defects.close'), 'Нет права «Закрыть замечание»');
});

test('подписи отказа на экране = подписи каталога сервера (052)', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../../../../supabase/migrations/052_rights_mechanism_up.sql', import.meta.url), 'utf8');
  const { ACTION_LABELS } = await import('../rights.ts');
  for (const [action, label] of Object.entries(ACTION_LABELS)) {
    const m = sql.match(new RegExp("\\('" + action.replace(/\./g, '\\.') + "', 'construction', '[^']+', \\d+, '([^']+)'\\)"));
    assert.equal(m?.[1], label, action);
  }
});
