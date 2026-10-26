/// <reference types="node" />
/** КП (P2-0006c, этап 6): колонки трёх форм, снимок редакции, ячейки для записи по row_no (без цены — не пишется),
 *  отличия редакций (ровно изменённые строки и разница итогов), имя файла; запись в синтетический файл — цены = цены сметы. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { guessKpColumns, buildSnapshot, kpWrites, diffSnapshots, kpFileName } from '../estimate/kp.ts';
import { patchXlsx, listParts } from '../vor/xlsx-writer.ts';
import { readWorkbook } from '../vor/xlsx-reader.ts';
import type { EstimateRow, OverheadLine } from '../estimate/estimate.service.ts';

const P = (label: string, col: number) => ({ label, col });

test('guessKpColumns: себестоимость, ФКП, ЛОС', () => {
  assert.deepEqual(guessKpColumns([P('Стоимость единицы с НДС 22%, руб. / Работа', 6), P('Стоимость единицы с НДС 22%, руб. / Материалы', 7), P('Стоимость единицы с НДС 22%, руб. / Всего', 8),
    P('Стоимость всего с НДС 22%, руб. / Работа', 9), P('Стоимость всего с НДС 22%, руб. / Материалы', 10), P('Стоимость всего с НДС 22%, руб. / Всего', 11)]),
  { unitLabor: 6, unitMaterial: 7, unitTotal: 8, sumLabor: 9, sumMaterial: 10, sumTotal: 11 });
  assert.deepEqual(guessKpColumns([P('Цена за ед. стоимость, руб., в том числе НДС 22% / Работа', 5), P('Цена за ед. стоимость, руб., в том числе НДС 22% / Материал', 6),
    P('Цена за ед. стоимость, руб., в том числе НДС 22% / Итого', 7), P('Стоимость, руб., в том числе НДС 22% / Работа', 8), P('Стоимость, руб., в том числе НДС 22% / Материал', 9), P('Стоимость, руб., в том числе НДС 22% / Итого', 10)]),
  { unitLabor: 5, unitMaterial: 6, unitTotal: 7, sumLabor: 8, sumMaterial: 9, sumTotal: 10 });
  assert.deepEqual(guessKpColumns([P('Стоимость ед-цы, руб, в т.ч. НДС 22% / Материалы', 5), P('Стоимость ед-цы, руб, в т.ч. НДС 22% / СМР', 6), P('Стоимость всего, руб, в т.ч. НДС 22% / Всего', 10)]),
    { unitLabor: 6, unitMaterial: 5, unitTotal: null, sumLabor: null, sumMaterial: null, sumTotal: 10 });
});

function r(p: Partial<EstimateRow> & { row_no: number; kind: EstimateRow['kind'] }): EstimateRow {
  return { source_row_id: 's' + p.row_no, import_id: 'i1', number: null, name: 'строка ' + p.row_no, unit_text: null, qty: null, norm: null, parent_row_no: null, work_type_id: null,
    price_labor: null, price_material: null, price_source: 'reference', ref_item_id: null, ref_labor: null, ref_material: null, ref_date: null, ...p };
}
const ROWS = [r({ row_no: 4, kind: 'group' }), r({ row_no: 5, kind: 'work', qty: 10, price_labor: 100.005 }), r({ row_no: 6, kind: 'material', qty: null, norm: 2, parent_row_no: 5, price_material: 3 }),
  r({ row_no: 7, kind: 'work', qty: 4 }), r({ row_no: 8, kind: 'work', qty: 2, price_labor: 50, price_material: 10 })];
const LINES: OverheadLine[] = [{ key: 'm', section: 'materials', name: 'Материалы', comment: null, method: 'percent_of', base: { totals: ['material'] }, params: { percent: 100 }, in_total: true },
  { key: 's', section: 'fot_smr', name: 'СМР', comment: null, method: 'percent_of', base: { totals: ['labor'] }, params: { percent: 100 }, in_total: true }];

test('buildSnapshot + kpWrites: цены до копеек, суммы, строка без цены не пишется', () => {
  const snap = buildSnapshot({ id: 'e1', name: 'Смета', area_m2: 10 }, ROWS, LINES);
  assert.equal(snap.rows.length, 4);
  assert.deepEqual(snap.totals, { labor: 1100.05, material: 80, total: 1180.05, unpriced: 1 });
  assert.equal(snap.overheads!.total, 1180.05);
  assert.equal(snap.overheads!.per_m2, 118.01);
  const w = kpWrites(snap, 'i1', { unitLabor: 5, unitMaterial: 6, unitTotal: 7, sumLabor: 8, sumMaterial: 9, sumTotal: 10 });
  const at = (row: number) => w.filter((x) => x.rowNo === row).map((x) => [x.col, x.value]);
  assert.deepEqual(at(5), [[5, 100.01], [7, 100.01], [8, 1000.05], [10, 1000.05]]);
  assert.deepEqual(at(6), [[6, 3], [7, 3], [9, 60], [10, 60]], 'у материала нет расценки работы; объём = 10 × 2');
  assert.deepEqual(at(7), [], 'без цены — не пишется');
  assert.deepEqual(at(8), [[5, 50], [6, 10], [7, 60], [8, 100], [9, 20], [10, 120]]);
  assert.deepEqual(kpWrites(snap, 'другая', { unitLabor: 5, unitMaterial: null, unitTotal: null, sumLabor: null, sumMaterial: null, sumTotal: null }), []);
});

test('diffSnapshots: ровно изменённые строки и разница итогов', () => {
  const a = buildSnapshot({ id: 'e1', name: 'С', area_m2: null }, ROWS, LINES);
  const rows2 = ROWS.map((x) => x.row_no === 5 ? { ...x, price_labor: 110 } : x.row_no === 6 ? { ...x, price_material: 4 } : x.row_no === 7 ? { ...x, price_labor: 1 } : x);
  const b = buildSnapshot({ id: 'e1', name: 'С', area_m2: null }, rows2, LINES);
  const d = diffSnapshots(a, b);
  assert.deepEqual(d.rows.map((x) => x.row_no), [5, 6, 7]);
  assert.equal(d.direct, 123.95, '1100 + 80 + 4 + 120 − 1180,05');
  assert.equal(d.total, d.direct);
  assert.equal(d.rows.find((x) => x.row_no === 7)!.a!.price_labor, null);
  assert.equal(diffSnapshots(a, a).rows.length, 0);
});

test('kpFileName', () => {
  assert.equal(kpFileName('ГПР ФСК.xlsx', 2), 'ГПР ФСК_КП_ред2.xlsx');
  assert.equal(kpFileName('форма.XLSX', 1), 'форма_КП_ред1.xlsx');
});

test('запись снимка в синтетическую форму: цены в файле = цены сметы, формулы сумм не тронуты', async () => {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet('ФКП');
  s.getRow(4).values = ['', 'Полы'];
  s.getRow(5).values = [1, 'Пол «Альфа»', 'м2', 10, null, null, null, { formula: 'D5*F5', result: 0 } as never];
  s.getRow(6).values = [2, 'Смесь «Бета»', 'кг', 20, null, null, null, { formula: 'D6*G6', result: 0 } as never];
  s.getRow(8).values = [3, 'Двери «Гамма»', 'шт', 2];
  const src = new Uint8Array(await wb.xlsx.writeBuffer());
  const snap = buildSnapshot({ id: 'e1', name: 'С', area_m2: null }, ROWS, null);
  const res = await patchXlsx(src, 'ФКП', kpWrites(snap, 'i1', { unitLabor: 5, unitMaterial: 6, unitTotal: null, sumLabor: 7, sumMaterial: null, sumTotal: null }));
  assert.deepEqual(res.skippedFormula, ['H5'], 'формула суммы заказчика не перезаписывается');
  const after = (await readWorkbook(res.bytes)).sheets[0].rows;
  assert.equal(after[4][5], 100.01); assert.equal(after[5][6], 3); assert.equal(after[7][5], 50); assert.equal(after[7][6], 10); assert.equal(after[7][7], 100);
  const xml = new TextDecoder().decode((await listParts(res.bytes)).get('xl/worksheets/sheet1.xml'));
  assert.match(xml, /<c r="H5"[^>]*><f>D5\*F5<\/f>/, 'формула H5 на месте');
});
