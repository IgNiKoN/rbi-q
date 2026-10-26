/// <reference types="node" />
/** Расчёт сметы (P2-0006c, этапы 4–5): работа = объём × расценка; материал = объём строки × цена, без объёма — объём работы × норма;
 *  итоги по листам; строки без цены; округление только при выводе. Синтетические данные. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcOverheads, calcRows, calcTotals, kop, rowQty } from '../estimate/calc.ts';
import type { EstimateRow, OverheadLine } from '../estimate/estimate.service.ts';

function r(p: Partial<EstimateRow> & { row_no: number; kind: EstimateRow['kind'] }): EstimateRow {
  return { source_row_id: `${p.import_id || 'i1'}:${p.row_no}`, import_id: 'i1', number: null, name: 'строка ' + p.row_no, unit_text: null, qty: null, norm: null,
    parent_row_no: null, work_type_id: null, price_labor: null, price_material: null, price_source: 'reference', ref_item_id: null, ref_labor: null,
    ref_material: null, ref_date: null, ...p };
}

test('rowQty: свой объём; у материала без объёма — объём работы × норма', () => {
  assert.equal(rowQty({ kind: 'material', qty: 5, norm: 2 }, 100), 5);
  assert.equal(rowQty({ kind: 'material', qty: null, norm: 7.5 }, 100), 750);
  assert.equal(rowQty({ kind: 'material', qty: null, norm: null }, 100), null);
  assert.equal(rowQty({ kind: 'work', qty: null, norm: 2 }, 100), null);
});

test('calcRows / calcTotals: суммы строк и листов как в Excel (без промежуточного округления)', () => {
  const rows = [
    r({ row_no: 4, kind: 'group' }),
    r({ row_no: 6, kind: 'work', qty: 83.32999999999998, price_labor: 300 }),
    r({ row_no: 7, kind: 'material', qty: 8.332999999999998, norm: 0.1, parent_row_no: 6, price_material: 12700 }),
    r({ row_no: 9, kind: 'material', qty: null, norm: 1.12, parent_row_no: 6, price_material: 48 }),
    r({ row_no: 10, kind: 'work', qty: 10, price_labor: 450, price_material: 450 }),       // «материалы в составе работы»
    r({ row_no: 11, kind: 'work', qty: 3, price_labor: null }),                            // без цены
    r({ row_no: 6, kind: 'work', import_id: 'i2', qty: 1, price_labor: 0.005 })
  ];
  const c = calcRows(rows);
  assert.equal(c.has('i1:4'), false, 'у группы сумм нет');
  assert.ok(Math.abs(c.get('i1:6')!.labor - 24999) < 1e-9);
  assert.ok(Math.abs(c.get('i1:7')!.material - 105829.1) < 1e-6);
  assert.ok(Math.abs(c.get('i1:9')!.qty! - 93.3296) < 1e-9, 'объём материала = объём работы × норма');
  assert.deepEqual([c.get('i1:10')!.labor, c.get('i1:10')!.material], [4500, 4500]);
  assert.equal(c.get('i1:11')!.priced, false);
  const t = calcTotals(rows, c);
  const i1 = t.byImport.get('i1')!;
  assert.equal(kop(i1.labor), 29499);
  assert.equal(kop(i1.material), kop(105829.1 + 93.3296 * 48 + 4500));
  assert.equal(i1.unpriced, 1);
  assert.equal(t.byImport.get('i2')!.labor, 0.005);
  assert.equal(kop(t.all.labor), 29499.01, 'округление — только итога');
  assert.equal(t.all.rows, 6);
});

test('kop: до копеек', () => {
  assert.equal(kop(26417036.792499997), 26417036.79);
  assert.equal(kop(1.005), 1.01);
  assert.equal(kop(213850266.75460497), 213850266.75);
});

// ---------- надбавки ----------
const L = (p: Partial<OverheadLine> & Pick<OverheadLine, 'key' | 'section' | 'method'>): OverheadLine =>
  ({ name: p.key, comment: null, base: {}, params: {}, in_total: true, ...p });

test('calcOverheads: способы percent_of / qty_rate / fixed / gross_up, разделы, «в итог», прямые, итог, ₽/м²', () => {
  const lines = [
    L({ key: 'm', section: 'materials', method: 'percent_of', base: { totals: ['material'] }, params: { percent: 100 } }),
    L({ key: 'd', section: 'materials', method: 'percent_of', base: { lines: ['m'] }, params: { percent: 3.5 } }),
    L({ key: 's', section: 'fot_smr', method: 'percent_of', base: { totals: ['labor'] }, params: { percent: 100 } }),
    L({ key: 'h', section: 'fot_smr', method: 'qty_rate', params: { factors: [5500, 24, 8, 12] } }),
    L({ key: 'g', section: 'fot_smr', method: 'gross_up', base: { lines: ['s', 'h'] }, params: { share: 78 } }),
    L({ key: 'x', section: 'household', method: 'fixed', params: { amount: 1000 } }),
    L({ key: 'y', section: 'household', method: 'qty_rate', params: { factors: [100, 2] }, in_total: false }),
    L({ key: 'p', section: 'profit', method: 'percent_of', base: { sections: ['fot_smr'] }, params: { percent: 20 } }),
    L({ key: 'v', section: 'vat', method: 'percent_of', base: { sections: ['household'], lines: ['p', 'y'] }, params: { percent: 22 } })];
  const r = calcOverheads(lines, { labor: 1_000_000, material: 200_000 }, 100);
  assert.equal(r.values.get('d'), 7000);
  assert.equal(r.values.get('h'), 12_672_000);
  const sh = 1_000_000 + 12_672_000;
  assert.ok(Math.abs(r.values.get('g')! - (sh / 78 * 100 - sh)) < 1e-6, 'досчёт ÷ 78 × 100');
  assert.equal(r.values.get('y'), 200, 'строка «не в итог» считается');
  assert.equal(r.sections.household, 1000, '…но в раздел не входит');
  assert.ok(Math.abs(r.sections.fot_smr - sh / 78 * 100) < 1e-6);
  assert.ok(Math.abs(r.values.get('p')! - r.sections.fot_smr * 0.2) < 1e-6);
  assert.ok(Math.abs(r.values.get('v')! - (1000 + r.values.get('p')! + 200) * 0.22) < 1e-6, 'база: раздел + строки (в т. ч. «не в итог», если выбрана явно)');
  assert.ok(Math.abs(r.direct - (207000 + r.sections.fot_smr + 1000)) < 1e-6);
  assert.ok(Math.abs(r.total - (r.direct + r.values.get('p')! + r.values.get('v')!)) < 1e-6);
  assert.ok(Math.abs(r.perM2! - r.total / 100) < 1e-9);
  assert.equal(calcOverheads(lines, { labor: 0, material: 0 }, null).perM2, null);
});

test('calcOverheads: цикл (в т. ч. через свой раздел) и ссылка на несуществующую строку — ошибка', () => {
  assert.throws(() => calcOverheads([L({ key: 'a', section: 'other', method: 'percent_of', base: { lines: ['b'] }, params: { percent: 1 } }),
    L({ key: 'b', section: 'other', method: 'percent_of', base: { lines: ['a'] }, params: { percent: 1 } })], { labor: 1, material: 1 }, null), /по кругу/);
  assert.throws(() => calcOverheads([L({ key: 'a', section: 'other', method: 'percent_of', base: { sections: ['other'] }, params: { percent: 1 } })], { labor: 1, material: 1 }, null), /по кругу/);
  assert.throws(() => calcOverheads([L({ key: 'a', section: 'other', method: 'percent_of', base: { lines: ['нет'] }, params: { percent: 1 } })], { labor: 1, material: 1 }, null), /несуществующую/);
});
