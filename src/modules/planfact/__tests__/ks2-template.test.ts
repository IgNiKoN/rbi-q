/// <reference types="node" />
/** Свой бланк КС-2 (P2-0008b, этап 5): синтетические бланки с вымышленными данными — метки, строка-образец с объединением,
 *  подписи ниже таблицы (объединения и высоты сдвигаются), неизвестные метки, формулы ниже образца, размер, повреждённый файл. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { checkTemplate, fillTemplate, toBase64, fromBase64, TEMPLATE_MAX_BYTES } from '../ks2/template.ts';
import { emptyKs2Header, type Ks2Row, type Ks2Snapshot } from '../ks2/form.ts';

const row = (p: Partial<Ks2Row>): Ks2Row => ({ source_row_id: crypto.randomUUID(), row_no: 1, number: '1', name: 'Работа', unit: 'м2', kind: 'work',
  sys_qty: 1, sys_price: 1, qty: 1, price: 1, excluded: false, total_qty: 1, prev_qty: 0, ...p });
const snap = (): Ks2Snapshot => ({
  header: { ...emptyKs2Header(), customer: 'АО «Заказчик-Бета»', contractor: 'ООО «Подряд-Гамма»', object: 'Корпус 1', contract_no: 'Д-17/26', contract_date: '2026-03-01',
    act_no: '3', act_date: '2026-10-31', period_from: '2026-10-01', period_to: '2026-10-31' },
  rows: [row({ row_no: 12, number: '1.1', name: 'Штукатурка «Альфа»', qty: 14, price: 450 }), row({ row_no: 13, number: '1.1.1', name: 'Смесь «Бета»', unit: 'кг', kind: 'material', qty: 135, price: 14.2 }),
    row({ row_no: 14, number: '1.2', name: 'Исключённая', excluded: true }), row({ row_no: 15, number: '1.3', name: 'Окраска', qty: 2.5, price: 215 })],
});

async function blank(opts: { extraTag?: string; twoSamples?: boolean; formulaBelow?: boolean; vMerge?: boolean } = {}): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Акт');
  ws.columns = [{ width: 6 }, { width: 12 }, { width: 30 }, { width: 10 }, { width: 8 }, { width: 12 }, { width: 14 }, { width: 16 }];
  ws.getCell('A1').value = 'АКТ № {акт_номер} от {акт_дата} за {период_с} — {период_по}'; ws.mergeCells('A1:H1');
  ws.getCell('A2').value = 'Заказчик: {заказчик}; подрядчик: {подрядчик}; объект: {объект}; договор {договор}' + (opts.extraTag ? ` ${opts.extraTag}` : '');
  ws.getRow(4).values = ['№', 'Поз.', 'Наименование', null, 'ЕИ', 'Кол-во', 'Цена', 'Стоимость'];
  ws.getRow(5).values = ['{№}', '{номер}', '{наименование}', null, '{ЕИ}', '{количество}', '{цена}', '{стоимость}'];
  ws.mergeCells('C5:D5'); ws.getRow(5).height = 28;
  ws.getCell('H5').numFmt = '#,##0.00'; ws.getCell('C5').font = { italic: true, name: 'Arial', size: 9 };
  ws.getCell('A5').border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  if (opts.vMerge) ws.mergeCells('A5:A6');
  if (opts.twoSamples) ws.getCell('C9').value = '{наименование}';
  ws.getCell('G7').value = 'Итого:'; ws.getCell('H7').value = '{итого}'; ws.getCell('H7').numFmt = '#,##0.00';
  ws.getRow(8).height = 40;
  ws.getCell('A8').value = 'Сдал'; ws.mergeCells('B8:D8');
  if (opts.formulaBelow) ws.getCell('H10').value = { formula: 'SUM(H5:H5)', result: 0 };
  ws.pageSetup.printArea = 'A1:H8';
  const t = wb.addWorksheet('Титул'); t.getCell('B2').value = '{заказчик}';
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

test('проверка: годный бланк — метки найдены, строка-образец 5', async () => {
  const c = await checkTemplate(await blank());
  assert.equal(c.ok, true, c.errors.join(' '));
  assert.equal(c.sheet, 'Акт'); assert.equal(c.sampleRow, 5);
  assert.ok(['акт_номер', 'итого', 'наименование', 'стоимость', 'договор'].every((t) => c.tags.includes(t)));
});

test('проверка: неизвестные метки — список; две строки-образца; формулы ниже; вертикальное объединение; не xlsx; > 2 МБ', async () => {
  let c = await checkTemplate(await blank({ extraTag: '{инн_заказчика} {ИТОГО}' }));
  assert.equal(c.ok, false); assert.deepEqual(c.unknown.sort(), ['ИТОГО', 'инн_заказчика'].sort());
  assert.match(c.errors[0], /Неизвестные метки: \{инн_заказчика\}, \{ИТОГО\}/);
  c = await checkTemplate(await blank({ twoSamples: true }));
  assert.match(c.errors.join(' '), /Строка-образец должна быть одна.*стр\. 5.*стр\. 9/);
  c = await checkTemplate(await blank({ formulaBelow: true }));
  assert.match(c.errors.join(' '), /формулы \(H10\)/);
  c = await checkTemplate(await blank({ vMerge: true }));
  assert.match(c.errors.join(' '), /по вертикали \(A5:A6\)/);
  const wb = new ExcelJS.Workbook(); wb.addWorksheet('Пусто').getCell('A1').value = 'нет меток';
  c = await checkTemplate(new Uint8Array(await wb.xlsx.writeBuffer()));
  assert.match(c.errors[0], /Нет строки-образца/);
  c = await checkTemplate(new TextEncoder().encode('это не Excel'));
  assert.match(c.errors[0], /не читается как Excel/);
  c = await checkTemplate(new Uint8Array(TEMPLATE_MAX_BYTES + 1));
  assert.match(c.errors[0], /больше 2 МБ/);
});

test('заполнение: строка-образец размножена с оформлением, объединения и подписи сдвинуты, шапка и итог', async () => {
  const out = await fillTemplate(await blank(), snap());
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(out as unknown as ArrayBuffer);
  const ws = wb.getWorksheet('Акт')!;
  assert.equal(ws.getCell('A1').value, 'АКТ № 3 от 31.10.2026 за 01.10.2026 — 31.10.2026');
  assert.equal(ws.getCell('A2').value, 'Заказчик: АО «Заказчик-Бета»; подрядчик: ООО «Подряд-Гамма»; объект: Корпус 1; договор № Д-17/26 от 01.03.2026');
  // 3 строки акта (исключённая не идёт) → строки 5, 6, 7
  const got = [5, 6, 7].map((r) => [ws.getCell(`A${r}`).value, ws.getCell(`B${r}`).value, ws.getCell(`C${r}`).value, ws.getCell(`E${r}`).value, ws.getCell(`F${r}`).value, ws.getCell(`G${r}`).value, ws.getCell(`H${r}`).value]);
  assert.deepEqual(got, [[1, '1.1', 'Штукатурка «Альфа»', 'м2', 14, 450, 6300], [2, '1.1.1', 'Смесь «Бета»', 'кг', 135, 14.2, 1917], [3, '1.3', 'Окраска', 'м2', 2.5, 215, 537.5]]);
  for (const r of [5, 6, 7]) {
    assert.equal(ws.getRow(r).height, 28, `высота строки ${r}`);
    assert.equal(ws.getCell(`H${r}`).numFmt, '#,##0.00');
    assert.equal(ws.getCell(`C${r}`).font?.italic, true);
    assert.equal(ws.getCell(`A${r}`).border?.top?.style, 'thin');
  }
  const merges = [...(ws.model.merges as string[])].sort();
  assert.deepEqual(merges, ['A1:H1', 'B10:D10', 'C5:D5', 'C6:D6', 'C7:D7'].sort(), 'объединения: образец в каждой строке, подпись сдвинута на 2');
  assert.equal(ws.getCell('H9').value, 8754.5, 'итог — числом, сдвинут на 2 строки');
  assert.equal(ws.getCell('H9').numFmt, '#,##0.00');
  assert.equal(ws.getCell('A10').value, 'Сдал'); assert.equal(ws.getRow(10).height, 40, 'высота подписи сдвинута вместе со строкой');
  assert.equal(ws.pageSetup.printArea, 'A1:H10', 'область печати расширена');
  assert.equal(wb.getWorksheet('Титул')!.getCell('B2').value, 'АО «Заказчик-Бета»', 'метки и на других листах');
});

test('одна строка акта — без вставки; негодный бланк и пустой акт — понятный отказ', async () => {
  const s = snap(); s.rows = [s.rows[0]];
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await fillTemplate(await blank(), s)) as unknown as ArrayBuffer);
  const ws = wb.getWorksheet('Акт')!;
  assert.equal(ws.getCell('C5').value, 'Штукатурка «Альфа»'); assert.equal(ws.getCell('H7').value, 6300); assert.equal(ws.getCell('A8').value, 'Сдал');
  await assert.rejects(fillTemplate(await blank({ formulaBelow: true }), snap()), /Бланк проекта не подходит/);
  const e = snap(); e.rows.forEach((r) => { r.excluded = true; });
  await assert.rejects(fillTemplate(await blank(), e), /нет ни одной строки/);
});

test('base64 туда-обратно', () => {
  const b = new Uint8Array(70000).map((_, i) => i % 256);
  assert.deepEqual(fromBase64(toBase64(b)), b);
});
