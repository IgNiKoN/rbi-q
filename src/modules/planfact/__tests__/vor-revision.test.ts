/// <reference types="node" />
/** Новая редакция ВОР (P2-0006b, этап 2): сопоставление «название + ЕИ + место», 🟡 / 🔴, решения ПТО, ошибки с номером строки. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRevision, applyYellow, blockers, acceptPayload, rowErrors, rowKey } from '../vor/revision.ts';
import type { BaseRow, NextRow, Decisions } from '../vor/revision.ts';
import type { ParsedRow } from '../vor/parse.ts';

const S1F5 = { building: '1', section: '1', floor: { from: 5, to: 5 } };
const S1F6 = { building: '1', section: '1', floor: { from: 6, to: 6 } };
let seq = 0;
function b(row_no: number, name: string, qty: number, ctx = S1F5, o: Partial<BaseRow> = {}): BaseRow {
  seq++;
  return { source_row_id: 'r' + seq, row_no, number: String(row_no), name, unit_text: 'м2', qty, context: ctx, location_id: 'L' + JSON.stringify(ctx),
    work_type_id: 'W:' + name.toLowerCase(), unit_id: 'm2', position_id: 'p' + seq, position_qty: qty, fact_qty: 0, pending_qty: 0, ...o };
}
function n(row_no: number, name: string, qty: number | null, ctx = S1F5, o: Partial<NextRow> = {}): NextRow {
  return { row_no, number: String(row_no), name, unit_text: 'м2', qty, context: ctx, location_id: 'L' + JSON.stringify(ctx),
    work_type_id: 'W:' + name.toLowerCase(), unit_id: 'm2', ...o };
}
const none: Decisions = { yellow: {}, red: {} };

test('ключ: регистр и пробелы названия, «м2» = «м²», место — по контексту, номер строки не входит', () => {
  assert.equal(rowKey({ name: '  Штукатурка   СТЕН ', unit_text: 'м²', context: S1F5 }), rowKey({ name: 'штукатурка стен', unit_text: 'кв.м', context: S1F5 }));
  assert.notEqual(rowKey({ name: 'Штукатурка стен', unit_text: 'м2', context: S1F5 }), rowKey({ name: 'Штукатурка стен', unit_text: 'м2', context: S1F6 }));
  assert.notEqual(rowKey({ name: 'Штукатурка стен', unit_text: 'м2', context: S1F5 }), rowKey({ name: 'Штукатурка стен', unit_text: 'м3', context: S1F5 }));
});

test('вставка строки в начало и сдвиг нумерации — совпавшие строки не превращаются в «удалено + добавлено»', () => {
  const base = [b(10, 'Штукатурка стен', 100), b(11, 'Окраска стен', 20), b(12, 'Стяжка пола', 30)];
  const next = [n(10, 'Грунтовка стен', 10), n(11, 'Штукатурка стен', 100), n(12, 'Окраска стен', 20), n(13, 'Стяжка пола', 30)];
  const c = compareRevision(base, next);
  assert.deepEqual(c.counts, { added: 1, removed: 0, changed: 0, same: 3, yellow: 0, red: 0 });
  assert.equal(c.items.find((i) => i.group === 'added')!.next!.name, 'Грунтовка стен');
  const p = acceptPayload(c, none);
  assert.deepEqual(p.items.map((x) => [x.row_no, x.position_id]), [[10, null], [11, base[0].position_id], [12, base[1].position_id], [13, base[2].position_id]]);
  assert.deepEqual(p.red, []);
});

test('смена объёма — «изменился», не «без изменений»; объём ниже факта — 🔴 «факт больше объёма» (без решения)', () => {
  const base = [b(1, 'Штукатурка стен', 50, S1F6, { fact_qty: 10 }), b(2, 'Окраска стен', 20)];
  const c = compareRevision(base, [n(1, 'Штукатурка стен', 5, S1F6), n(2, 'Окраска стен', 20.0000000001)]);
  assert.equal(c.counts.changed, 1);
  assert.equal(c.counts.same, 1);
  const ch = c.items.find((i) => i.group === 'changed')!;
  assert.equal(ch.red, 'fact_over_qty');
  assert.deepEqual(blockers(c, none), []);
  // объём пропал (пусто) — тоже изменение
  assert.equal(compareRevision([b(1, 'Окраска стен', 20)], [n(1, 'Окраска стен', null)]).counts.changed, 1);
});

test('смена ЕИ или места — это другая строка (удалено + добавлено), не «без изменений»', () => {
  const c1 = compareRevision([b(1, 'Окраска стен', 20)], [n(1, 'Окраска стен', 20, S1F5, { unit_text: 'м.п.', unit_id: 'mp' })]);
  assert.deepEqual([c1.counts.added, c1.counts.removed, c1.counts.same], [1, 1, 0]);
  const c2 = compareRevision([b(1, 'Окраска стен', 20)], [n(1, 'Окраска стен', 20, S1F6)]);
  assert.deepEqual([c2.counts.added, c2.counts.removed, c2.counts.same], [1, 1, 0]);
});

test('удалена строка с фактом — 🔴 «факт без плана», «Принять» ждёт решения; без факта — просто «удалено»', () => {
  const base = [b(1, 'Стяжка пола', 30, S1F5, { fact_qty: 5, pending_qty: 35 }), b(2, 'Окраска стен', 20), b(3, 'Штукатурка стен', 100)];
  const next = [n(1, 'Грунтовка стен', 10), n(2, 'Штукатурка стен', 100)];
  const c = compareRevision(base, next);
  assert.deepEqual([c.counts.removed, c.counts.red], [2, 1]);
  const red = c.items.find((i) => i.red === 'fact_without_plan')!;
  assert.equal(red.base!.name, 'Стяжка пола');
  assert.deepEqual(blockers(c, none), ['Факт без плана — нужно решение: 1']);
  const d: Decisions = { yellow: {}, red: { [red.key]: { action: 'move', toRowNo: 1 } } };
  assert.deepEqual(blockers(c, d), []);
  const p = acceptPayload(c, d);
  assert.deepEqual(p.red, [{ position_id: base[0].position_id, action: 'move', to_row_no: 1 }]);
  assert.deepEqual(acceptPayload(c, { yellow: {}, red: { [red.key]: { action: 'keep' } } }).red, [{ position_id: base[0].position_id, action: 'keep' }]);
});

test('дубль названия в одном месте — 🟡, пары: сначала с тем же объёмом, затем по порядку', () => {
  const base = [b(5, 'Монтаж лючков', 3), b(6, 'Монтаж лючков', 7)];
  const c = compareRevision(base, [n(8, 'Монтаж лючков', 7), n(9, 'Монтаж лючков', 4)]);
  assert.equal(c.counts.yellow, 2);
  const p = acceptPayload(c, { yellow: Object.fromEntries(c.items.map((i) => [i.key, 'same'])), red: {} });
  assert.deepEqual(p.items.map((x) => [x.row_no, x.position_id]), [[8, base[1].position_id], [9, base[0].position_id]]);
  assert.deepEqual(blockers(c, none), ['Не подтверждено 🟡: 2']);
});

test('похожее название (та же ЕИ и место) — 🟡 кандидат; «разные» — распадается на удалено + добавлено (с 🔴 при факте)', () => {
  const base = [b(1, 'Монтаж ревизионных пластиковых лючков в с/у', 12, S1F5, { fact_qty: 4 })];
  const c = compareRevision(base, [n(1, 'Монтаж ревизионных лючков в с/у', 12, S1F5, { work_type_id: base[0].work_type_id })]);
  assert.equal(c.items[0].yellow, 'similar');
  assert.equal(c.items[0].group, 'same');
  const k = c.items[0].key;
  assert.deepEqual(acceptPayload(c, { yellow: { [k]: 'same' }, red: {} }).items, [{ row_no: 1, position_id: base[0].position_id }]);
  const split = applyYellow(c, { [k]: 'split' });
  assert.deepEqual([split.counts.added, split.counts.removed, split.counts.red], [1, 1, 1]);
  // разные работы — не похожие: удалено + добавлено
  const c2 = compareRevision([b(1, 'Оштукатуривание стен', 10)], [n(1, 'Оштукатуривание порогов балконов', 10)]);
  assert.deepEqual([c2.counts.added, c2.counts.removed, c2.counts.yellow], [1, 1, 0]);
});

test('тот же ключ, но другой вид работ дерева — 🟡 «атрибуты»; «та же строка» запрещена', () => {
  const base = [b(1, 'Окраска стен', 20)];
  const c = compareRevision(base, [n(1, 'Окраска стен', 20, S1F5, { work_type_id: 'W:другой' })]);
  assert.equal(c.items[0].yellow, 'attrs');
  const k = c.items[0].key;
  assert.match(blockers(c, { yellow: { [k]: 'same' }, red: {} })[0], /«та же строка» нельзя: стр\. 1/);
  assert.deepEqual(blockers(c, { yellow: { [k]: 'split' }, red: {} }), []);
});

test('ошибки с номером строки: нет ЕИ, объём 0 / пусто, место не найдено, итог и КВР не сходятся — по порядку строк', () => {
  const r = (rowNo: number, unitText: string | null, qty: number | null, kind: ParsedRow['kind'] = 'work'): ParsedRow =>
    ({ rowNo, kind, number: null, name: 'Работа ' + rowNo, unitText, qty, norm: null, prices: {}, context: {}, parentRowNo: null, raw: [] });
  const errs = rowErrors([r(57, null, 3), r(112, 'м2', 0), r(113, 'м2', null), r(114, '', 5, 'group'), r(115, 'м2', 7)],
    [{ rowNo: 200, label: 'Стоимость', expected: 100, actual: 90, ok: false }, { rowNo: 201, label: 'Стоимость', expected: 1, actual: 1, ok: true }],
    [{ kvrRowNo: 150, kvrName: 'КВР', name: 'x', unit: 'м²', expected: 10, actual: 9, ok: false, rowNos: [151] }],
    [140]);
  assert.deepEqual(errs.map((e) => `${e.rowNo}: ${e.reason}`), [
    '57: нет ЕИ', '112: объём 0 или пусто', '113: объём 0 или пусто', '140: место не найдено',
    '150: сумма позиций 9 ≠ объёму строки 10 (м²)', '200: итог «Стоимость» 100 ≠ сумме строк 90']);
  assert.deepEqual(rowErrors([r(1, 'м2', 1)]), []);
});
