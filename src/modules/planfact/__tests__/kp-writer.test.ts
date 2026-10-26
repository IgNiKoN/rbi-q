/// <reference types="node" />
/** Запись цен в файл заказчика (P2-0006c, этап 1): синтетические файлы (вымышленные наименования) — объединённые ячейки,
 *  формулы, два листа, скрытые строки, ширины колонок. Всё, кроме вписанных ячеек, должно остаться как было. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { patchXlsx, patchSheetXml, setFullCalcOnLoad, showAndActivate, setTabSelected, assertSameFile, listParts, colLetters, crc32 } from '../vor/xlsx-writer.ts';
import { readWorkbook, sha256Hex } from '../vor/xlsx-reader.ts';

async function sample(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet('Титул');
  a.getCell('A1').value = 'Объект «Альфа»';
  a.mergeCells('A1:D1');
  const s = wb.addWorksheet('ФКП');
  s.columns = [{ width: 6 }, { width: 40 }, { width: 8 }, { width: 10 }, { width: 12, style: { numFmt: '#,##0.00' } }, { width: 12 }, { width: 14 }];
  s.addRow(['№', 'Наименование', 'Ед.', 'Объём', 'Цена работы', 'Цена материала', 'Стоимость']);
  s.mergeCells('A2:G2');
  s.getCell('A2').value = 'Секция 1';
  s.addRow([1, 'Окраска «Гамма»', 'м2', 10, 5, null, { formula: 'D3*(E3+F3)', result: 50 }]);
  s.addRow([2, 'Смесь «Бета»', 'кг', 7.5, null, 2, { formula: 'D4*(E4+F4)', result: 15 }]);
  s.getRow(5).values = [3, 'Скрытая строка', 'шт', 1, 1, 1, 2];
  s.getRow(5).hidden = true;
  s.getCell('E3').numFmt = '0.00';
  s.getCell('E7').value = { formula: 'SUM(E3:E5)', result: 6 };
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

test('colLetters и crc32', () => {
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(colLetters), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('patchXlsx: вписаны только нужные ячейки, остальное без изменений', async () => {
  const src = await sample();
  const res = await patchXlsx(src, 'ФКП', [
    { rowNo: 3, col: 4, value: 123.456 },  // E3 — было 5, со стилем
    { rowNo: 4, col: 4, value: 7 },        // E4 — ячейки нет
    { rowNo: 4, col: 5, value: 3.1 },      // F4
    { rowNo: 3, col: 6, value: 999 },      // G3 — формула → не трогаем
    { rowNo: 12, col: 4, value: 1 },       // строки нет
  ]);
  assert.deepEqual(res.written.sort(), ['E12', 'E3', 'E4', 'F4']);
  assert.deepEqual(res.skippedFormula, ['G3']);

  const before = await readWorkbook(src);
  const after = await readWorkbook(res.bytes);
  assert.deepEqual(after.sheets.map((s) => s.name), before.sheets.map((s) => s.name));
  assert.deepEqual(after.sheets[0], before.sheets[0]);
  const expect = new Map([['E3', 123.46], ['E4', 7], ['F4', 3.1], ['E12', 1]]);
  const b = before.sheets[1].rows, c = after.sheets[1].rows;
  for (let r = 0; r < Math.max(b.length, c.length); r++) {
    for (let k = 0; k < Math.max(b[r]?.length ?? 0, c[r]?.length ?? 0); k++) {
      const ref = colLetters(k) + (r + 1);
      const want = expect.has(ref) ? expect.get(ref) : (b[r]?.[k] ?? null);
      assert.equal(c[r]?.[k] ?? null, want, ref);
    }
  }

  const pb = await listParts(src), pa = await listParts(res.bytes);
  assert.deepEqual([...pa.keys()], [...pb.keys()]);
  const changed = [...pb.keys()].filter((k) => Buffer.compare(Buffer.from(pb.get(k)!), Buffer.from(pa.get(k)!)) !== 0);
  assert.deepEqual(changed.sort(), ['xl/workbook.xml', 'xl/worksheets/sheet2.xml']);
  const sb = new TextDecoder().decode(pb.get('xl/worksheets/sheet2.xml')), sa = new TextDecoder().decode(pa.get('xl/worksheets/sheet2.xml'));
  for (const re of [/<mergeCell\b[^>]*>/g, /<cols>[\s\S]*?<\/cols>/g, /<row\b[^>]*hidden="1"[^>]*>/g, /<f>[^<]*<\/f>/g]) {
    assert.deepEqual(sa.match(re), sb.match(re), String(re));
  }
  assert.match(sa, /<c r="E3" s="\d+"><v>123.46<\/v><\/c>/, 'стиль ячейки сохранён');
  assert.match(new TextDecoder().decode(pa.get('xl/workbook.xml')), /fullCalcOnLoad="1"/);

  const again = new ExcelJS.Workbook();
  await again.xlsx.load(res.bytes.slice().buffer as ArrayBuffer); // файл открывается
  assert.equal(again.getWorksheet('ФКП')!.getCell('E3').value, 123.46);
});

test('patchXlsx: нечего писать — файл байт-в-байт тот же; нет листа — отказ', async () => {
  const src = await sample();
  const res = await patchXlsx(src, 'ФКП', [{ rowNo: 3, col: 6, value: 1 }]);
  assert.equal(Buffer.compare(Buffer.from(res.bytes), Buffer.from(src)), 0);
  await assert.rejects(patchXlsx(src, 'Нет такого', [{ rowNo: 1, col: 0, value: 1 }]), /нет листа «Нет такого»/);
  await assert.rejects(patchXlsx(new Uint8Array([1, 2, 3]), 'ФКП', []), /не .xlsx/);
});

test('patchSheetXml: самозакрытые строка/ячейка, порядок колонок, неверные значения', () => {
  const xml = '<worksheet><cols><col min="2" max="3" style="7"/></cols><sheetData><row r="1"><c r="A1"/><c r="D1" t="s"><v>0</v></c></row><row r="3" s="4" customFormat="1"/></sheetData></worksheet>';
  const r = patchSheetXml(xml, [{ rowNo: 1, col: 3, value: 5 }, { rowNo: 1, col: 1, value: 2 }, { rowNo: 3, col: 0, value: 0.005 }, { rowNo: 2, col: 2, value: 1 }]);
  assert.equal(r.xml, '<worksheet><cols><col min="2" max="3" style="7"/></cols><sheetData><row r="1"><c r="A1"/><c r="B1" s="7"><v>2</v></c><c r="D1"><v>5</v></c></row><row r="2"><c r="C2" s="7"><v>1</v></c></row><row r="3" s="4" customFormat="1"><c r="A3" s="4"><v>0.01</v></c></row></sheetData></worksheet>');
  assert.equal(patchSheetXml('<worksheet><sheetData/></worksheet>', [{ rowNo: 2, col: 0, value: -0.001 }]).xml, '<worksheet><sheetData><row r="2"><c r="A2"><v>0</v></c></row></sheetData></worksheet>');
  assert.throws(() => patchSheetXml(xml, [{ rowNo: 1, col: 0, value: NaN }]), /числом/);
  assert.throws(() => patchSheetXml(xml, [{ rowNo: 0, col: 0, value: 1 }]), /адрес/);
  assert.throws(() => patchSheetXml('<worksheet/>', []), /нет таблицы/);
});

test('setFullCalcOnLoad: есть calcPr / нет calcPr', () => {
  assert.equal(setFullCalcOnLoad('<workbook><sheets/><calcPr calcId="1"/></workbook>'), '<workbook><sheets/><calcPr calcId="1" fullCalcOnLoad="1"/></workbook>');
  assert.equal(setFullCalcOnLoad('<workbook><calcPr fullCalcOnLoad="0"/></workbook>'), '<workbook><calcPr fullCalcOnLoad="1"/></workbook>');
  assert.equal(setFullCalcOnLoad('<workbook><sheets/><extLst/></workbook>'), '<workbook><sheets/><calcPr fullCalcOnLoad="1"/><extLst/></workbook>');
});

test('assertSameFile: тот же файл — ок, другой — отказ', async () => {
  const src = await sample();
  await assertSameFile(src, await sha256Hex(src));
  await assert.rejects(assertSameFile(src, 'ab'.repeat(32)), /другой файл/);
});

test('скрытый лист с ценами: становится видимым и открывается первым, прочие скрытые — скрыты', async () => {
  const wb = new ExcelJS.Workbook();
  const g = wb.addWorksheet('График', { views: [{ state: 'normal', tabSelected: true } as unknown as ExcelJS.WorksheetView] });
  g.getCell('A1').value = 'ГПР';
  const h1 = wb.addWorksheet('ФКП, 1', { state: 'hidden' });
  h1.getCell('A1').value = 'x';
  const h2 = wb.addWorksheet('ФКП, 2', { state: 'hidden' });
  h2.addRow(['Работа', 'Цена']); h2.addRow(['Окраска «Гамма»', null]);
  wb.views = [{ x: 0, y: 0, width: 100, height: 100, firstSheet: 0, activeTab: 0, visibility: 'visible' }];
  const src = new Uint8Array(await wb.xlsx.writeBuffer());
  const res = await patchXlsx(src, 'ФКП, 2', [{ rowNo: 2, col: 1, value: 5 }]);
  const parts = await listParts(res.bytes);
  const d = (k: string) => new TextDecoder().decode(parts.get(k));
  const wbx = d('xl/workbook.xml');
  assert.match(wbx, /<sheet [^>]*name="ФКП, 1"[^>]*state="hidden"/);
  assert.doesNotMatch(wbx, /<sheet [^>]*name="ФКП, 2"[^>]*state=/);
  assert.match(wbx, /activeTab="2"/);
  assert.match(d('xl/worksheets/sheet3.xml'), /<sheetView tabSelected="1"/);
  assert.doesNotMatch(d('xl/worksheets/sheet1.xml'), /tabSelected="1"/);
  const after = await readWorkbook(res.bytes);
  assert.deepEqual(after.sheets.map((s) => s.hidden), [false, true, false]);
  assert.equal(after.sheets[2].rows[1][1], 5);
});

test('showAndActivate / setTabSelected: чистые функции', () => {
  const wb = '<workbook><bookViews><workbookView firstSheet="3" activeTab="3"/></bookViews><sheets><sheet name="А" r:id="1"/><sheet name="Б" state="veryHidden" r:id="2"/></sheets></workbook>';
  assert.equal(showAndActivate(wb, 'Б'), '<workbook><bookViews><workbookView firstSheet="1" activeTab="1"/></bookViews><sheets><sheet name="А" r:id="1"/><sheet name="Б" r:id="2"/></sheets></workbook>');
  assert.equal(showAndActivate('<workbook><bookViews><workbookView/></bookViews><sheets><sheet name="А"/></sheets></workbook>', 'А'), '<workbook><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="А"/></sheets></workbook>');
  assert.equal(setTabSelected('<worksheet><sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews></worksheet>', false), '<worksheet><sheetViews><sheetView workbookViewId="0"/></sheetViews></worksheet>');
  assert.equal(setTabSelected('<worksheet><dimension ref="A1"/><cols/><sheetData/></worksheet>', true), '<worksheet><dimension ref="A1"/><sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews><cols/><sheetData/></worksheet>');
});
