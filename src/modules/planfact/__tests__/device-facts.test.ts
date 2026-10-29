/// <reference types="node" />
/** P2-0064 этап 3: факт этого телефона, не принятый сервером, — строки для пометок (одна запись и пачка из 20 строк одной записью),
 *  сумма по позиции, причина отказа; ушедшие и чужие модули — не в пометках. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unsentByPosition, unsentFacts, unsentLabel } from '../fact/deviceFacts.ts';
import type { DeviceRecord } from '../../../platform/services/offline/device-records.ts';
import { fmtQty } from '../fact/fact.ts';

const base = (id: string, over: Partial<DeviceRecord>): DeviceRecord => ({ id, slot: 's', module: 'planfact', kind: 'pf_fact', project: 'p-1', createdAt: '2026-10-29T10:00:00Z',
  authorId: 'u', payload: {}, view: {}, source: 'local', syncStatus: 'not_synced', ...over });

test('одна запись и пачка 20 строк: строки по позициям, сумма и причина', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ position_id: 'pos-' + (i % 4), qty: 2 }));
  const names = Object.fromEntries([0, 1, 2, 3].map((i) => ['pos-' + i, { work: 'Кладка', place: 'Этаж ' + i, unit: 'м³' }]));
  const list = unsentFacts([
    base('a', { payload: { kind: 'entry', position_id: 'pos-0', qty: 3, date: '2026-10-29' }, view: { workName: 'Кладка', locationPath: 'Этаж 0', unit: 'м³', brigade: 'Б' } }),
    base('b', { payload: { kind: 'batch', items, date: '2026-10-29' }, view: { items: names, brigade: 'Б' } }),
    base('c', { syncStatus: 'blocked', syncServerRejected: true, syncBlockReason: 'Сервер отклонил: Бригада в архиве', payload: { kind: 'entry', position_id: 'pos-1', qty: 1 }, view: { unit: 'м³' } }),
    base('d', { syncStatus: 'synced', payload: { kind: 'entry', position_id: 'pos-0', qty: 100 } }),
    base('e', { module: 'other', payload: { kind: 'entry', position_id: 'pos-0', qty: 100 } })
  ]);
  assert.equal(list.length, 22, '1 + 20 строк пачки + 1 отклонённая; ушедшая и чужой модуль — нет');
  assert.equal(list.filter((f) => f.recordId === 'b').length, 20);
  const m = unsentByPosition(list);
  assert.deepEqual(m.get('pos-0'), { qty: 3 + 10, n: 6, problem: '' });
  assert.deepEqual(m.get('pos-1'), { qty: 10 + 1, n: 6, problem: 'Сервер отклонил: Бригада в архиве' });
  assert.equal(unsentLabel(m.get('pos-0')!, 'м³', fmtQty), 'Не отправлено: 13 м³');
  assert.equal(unsentLabel(m.get('pos-1')!, 'м³', fmtQty), 'Сервер отклонил: Бригада в архиве');
  assert.equal(list.find((f) => f.recordId === 'b' && f.positionId === 'pos-2')!.place, 'Этаж 2');
});
