/// <reference types="node" />
/** Разбор ВОР (P2-0006, этап 1): три формы на синтетических образцах (вымышленные наименования), ГПР → «не ВОР», числа, места, итоги. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheet, parseNum, parseContextTitle, findHeader, contextLabel, MAX_ROWS, headerSignature, editColumn, columnMapFrom } from '../vor/parse.ts';
import type { Cell, SheetData } from '../vor/parse.ts';
import { readWorkbook, cellValue, looksLikeXlsx } from '../vor/xlsx-reader.ts';

const N = null;
const HEAD_FKP = 'Цена за ед., руб.';
const SUM_FKP = 'Стоимость, руб.';

/** Форма «ФКП»: реквизиты сверху, шапка в 2 строки (объединённые ячейки повторяются), нумерация колонок,
 *  «Секция N» + «кв. …» справа от таблицы, материал = строка с нормой расхода, корпус — только в «Итого Корпус N». */
function fkp(): SheetData {
  const rows: Cell[][] = [
    ['Форма коммерческого предложения'],
    [],
    ['№ п/п', 'Наименование работ', 'Ед. изм.', 'Норма расхода', 'Объём', HEAD_FKP, HEAD_FKP, SUM_FKP, SUM_FKP],
    ['№ п/п', 'Наименование работ', 'Ед. изм.', 'Норма расхода', 'Объём', 'Работа', 'Материал', 'Работа', 'Материал'],
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 'Комплекс работ по отделке квартир'],
    [2, 'Секция 1', N, N, N, N, N, N, N, N, N, 'кв. 3, 16, 24'],
    [3, 'КИО'],
    [4, 'Устройство пола «Альфа»', 'м2', N, 100.5, 10, N, 1005, N],
    [5, 'Смесь «Бета»', 'кг', 7.5, '753,75', N, 2, N, 1507.5],
    [6, 'Окраска стен «Гамма»', 'м.п.', N, '1 200,25', 5, N, 6001.25, N],
    [7, 'Секция 2', N, N, N, N, N, N, N, N, N, 'кв. 75, 78'],
    [8, 'Окраска стен «Гамма»', 'м.п.', N, 20, 5, N, 100, N],
    [9, 'Итого Корпус 7 с НДС 20%:', N, N, N, N, N, 7106.25, 1507.5],
    [10, 'Секция 1', N, N, N, N, N, N, N, N, N, 'кв. 6'],
    [11, 'Устройство пола «Альфа»', 'м2', N, 8, 10, N, 80, N],
    [N, 'ИТОГО по корпусам с НДС 20%:', N, N, N, N, N, 7186.25, 1507.5],
    [N, 'в т.ч. НДС 20%', N, N, N, N, N, N, 1449],
    [N, N, N, N, 91250.73],
    [1, 'Авансирование, % (указать вариант)', 'Авансирование, % (указать вариант)'],
    [N, 'Руководитель организации:']
  ];
  return { name: 'ФКП, синтетика', rows };
}

/** Форма «себестоимость»: колонка Г/Р/М без подписи, номера 1 / 1.1 / 1.1.1, норма «0,1» строкой, работа без ЕИ. */
function sebes(): SheetData {
  return { name: 'себес синтетика', rows: [
    [N, '№ п/п', 'Наименование работ', 'Ед. изм.', 'Норма расхода', 'Количество', 'Стоимость единицы, руб.', 'Стоимость единицы, руб.'],
    [N, '№ п/п', 'Наименование работ', 'Ед. изм.', 'Норма расхода', 'Количество', 'Работа', 'Материалы'],
    [N, 1, 2, 3, 4, 5, 6, 7],
    ['Г', N, 'Черновая отделка МОП'],
    ['Г', 1, 'Полы'],
    ['Р', '1.1', 'Устройство слоя «Дельта»', 'м2', N, 83.32999999999998, 300, N],
    ['М', '1.1.1', 'Утеплитель «Эпсилон»', 'м3', '0,1', 8.333, N, 12700],
    ['М', '1.1.2', 'Плёнка «Дзета»', 'м2', '1,12', 93.33, N, 48],
    ['Р', '1.2', 'Монтаж дверей «Эта»', N, N, 149, 3100, N],
    ['М', '1.2.1', 'Дверной блок «Тета»', 'шт', N, 149, N, 8240],
    ['Р', '1.3', 'Стяжка «Йота»', 'м2', N, 50, 500, N],
    [N, N, N, N, N, N, N, N, 'ИТОГО:']
  ] };
}

/** «Ведомость договорной цены»: реквизиты подрядчика, шапка в 3 строки, «Артикул», «Материалы / СМР / Всего». */
function los(): SheetData {
  const P = 'Стоимость ед-цы, руб.';
  return { name: 'ЛОС синтетика', rows: [
    [N, 'Организация', N, N],
    [N, 'ИНН', N, N],
    [N, N, N, N, N, N, N, 'Приложение № 1'],
    [N, N, 'ВЕДОМОСТЬ ДОГОВОРНОЙ ЦЕНЫ'],
    ['№ пп', 'Наименование', 'Артикул, марка, поставщик', 'Ед. изм.', 'Объём', P, P, P],
    ['№ пп', 'Наименование', 'Артикул, марка, поставщик', 'Ед. изм.', 'Объём', P, P, P],
    ['№ пп', 'Наименование', 'Артикул, марка, поставщик', 'Ед. изм.', 'Объём', 'Материалы', 'СМР', 'Всего'],
    [1, 2, 3, 4, 5, 6, 7, 8],
    [1, 'Земляные работы'],
    ['1.1', 'Разработка грунта «Каппа»', N, 'м3', 2840.072, N, 500, 500],
    ['1.2', 'Песок «Лямбда»', 'ГОСТ 0000', 'м3', 66, 900, N, 900],
    [2, 'Монтаж оборудования'],
    ['2.1', 'Очистное сооружение «Мю»', 'ООО «Пример»', 'компл.', 1, N, N, N],
    [N, 'ВСЕГО С НДС:', N, N, N, N, N, N],
    [N, 'Режим налогообложения', 'ОСНО/УСН'],
    [N, 'Гарантийный срок', '60 месяцев']
  ] };
}

/** ГПР: та же шапка ВОР + колонки-даты. */
function gpr(): SheetData {
  return { name: 'График', rows: [
    ['График производства работ'],
    [N, '№ п/п', 'Наименование работ', 'Ед. изм.', 'Количество', 'Норма выработки', '1-3', '5-10', '12-17', '19-24', '26-31', '2-7'],
    ['Р', '1.3', 'Стяжка «Йота»', 'м2', 6143.79, 40, 6, 6, 6, N, N, N]
  ] };
}

test('числа: «0,1», «1 200,25», хвосты двоичной арифметики, не-числа', () => {
  assert.equal(parseNum('0,1'), 0.1);
  assert.equal(parseNum('1 200,25'), 1200.25);
  assert.equal(parseNum('1 234,5'), 1234.5);
  assert.equal(parseNum(83.32999999999998), 83.33);
  assert.equal(parseNum('12.6 '), 12.6);
  assert.equal(parseNum('м2'), null);
  assert.equal(parseNum(''), null);
  assert.equal(parseNum(null), null);
});

test('заголовки места: Корпус / Секция / Этаж / Этажи N-M / составной; прочее — не место', () => {
  assert.deepEqual(parseContextTitle('Секция 1'), { section: '1' });
  assert.deepEqual(parseContextTitle('Корпус 7'), { building: '7' });
  assert.deepEqual(parseContextTitle('Этаж 2'), { floor: { from: 2, to: 2 } });
  assert.deepEqual(parseContextTitle('Этажи 4-12'), { floor: { from: 4, to: 12 } });
  assert.deepEqual(parseContextTitle('Секция 1, Этаж 3'), { section: '1', floor: { from: 3, to: 3 } });
  assert.equal(parseContextTitle('КИО'), null);
  assert.equal(parseContextTitle('Секция дверная распашная'), null);
  assert.equal(parseContextTitle('Комплекс работ по отделке 3 этажа'), null);
});

test('ФКП: шапка 2 строки + нумерация, работа/материал по норме, места и квартиры, корпус из «Итого Корпус N», подписи — skip', () => {
  const r = parseSheet(fkp());
  assert.equal(r.isVor, true);
  assert.deepEqual(r.headerRows, [3, 4]);
  assert.equal(r.columns?.name, 1); assert.equal(r.columns?.unit, 2); assert.equal(r.columns?.norm, 3); assert.equal(r.columns?.qty, 4);
  assert.equal(r.columns?.prices.length, 4);
  assert.equal(r.columns?.prices[0].label, `${HEAD_FKP} / Работа`);
  const by = (no: number) => r.rows.find((x) => x.rowNo === no)!;
  assert.equal(by(6).kind, 'group');
  assert.equal(by(7).kind, 'context');
  assert.equal(by(8).kind, 'group');
  assert.equal(by(9).kind, 'work');
  assert.equal(by(10).kind, 'material');
  assert.equal(by(10).parentRowNo, 9);
  assert.equal(by(10).qty, 753.75);
  assert.equal(by(11).qty, 1200.25);
  assert.deepEqual(by(9).context, { building: '7', section: '1', apartments: 'кв. 3, 16, 24' });
  assert.deepEqual(by(13).context, { building: '7', section: '2', apartments: 'кв. 75, 78' });
  assert.deepEqual(by(16).context, { section: '1', apartments: 'кв. 6' }, 'после «Итого Корпус 7» корпус не наследуется');
  assert.equal(contextLabel(by(9).context), 'Корпус 7 · Секция 1 · кв. 3, 16, 24');
  for (const no of [14, 17, 18, 19, 20, 21]) assert.equal(by(no).kind, 'skip', `строка ${no} — не данные`);
  assert.equal(r.stats.works, 4); assert.equal(r.stats.materials, 1);
});

test('ФКП: сверка итогов — Σ по корпусу и Σ по всем корпусам сходятся; «в т.ч. НДС» не сверяется; расхождение видно', () => {
  const r = parseSheet(fkp());
  assert.ok(r.checks.length >= 4);
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
  const bad = fkp();
  bad.rows[13][7] = 9999;
  const r2 = parseSheet(bad);
  const c = r2.checks.find((x) => x.rowNo === 14 && x.label.endsWith('Работа'))!;
  assert.equal(c.ok, false); assert.equal(c.actual, 7106.25);
});

test('себестоимость: колонка Г/Р/М без подписи, материал — дочерний к работе, норма «0,1», работа без ЕИ остаётся работой', () => {
  const r = parseSheet(sebes());
  assert.equal(r.columns?.type, 0);
  const by = (no: number) => r.rows.find((x) => x.rowNo === no)!;
  assert.equal(by(4).kind, 'group'); assert.equal(by(5).kind, 'group');
  assert.equal(by(6).kind, 'work'); assert.equal(by(6).qty, 83.33); assert.equal(by(6).number, '1.1');
  assert.equal(by(7).kind, 'material'); assert.equal(by(7).norm, 0.1); assert.equal(by(7).parentRowNo, 6);
  assert.equal(by(9).kind, 'work'); assert.equal(by(9).unitText, null);
  assert.equal(by(10).parentRowNo, 9);
  assert.equal(by(12).kind, 'skip');
  assert.deepEqual(r.stats, { total: 9, works: 3, materials: 3, groups: 2, context: 0, worksWithUnit: 2, worksWithQty: 3 });
});

test('ведомость договорной цены: шапка ниже реквизитов (3 строки), «Артикул» не мешает, реквизиты после итога — skip', () => {
  const r = parseSheet(los());
  assert.equal(r.isVor, true);
  assert.deepEqual(r.headerRows, [5, 6, 7]);
  assert.equal(r.columns?.name, 1); assert.equal(r.columns?.unit, 3); assert.equal(r.columns?.qty, 4); assert.equal(r.columns?.norm, null);
  assert.deepEqual(r.columns?.prices.map((p) => p.label), ['Стоимость ед-цы, руб. / Материалы', 'Стоимость ед-цы, руб. / СМР', 'Стоимость ед-цы, руб. / Всего']);
  assert.equal(r.stats.works, 3);
  assert.equal(r.rows.find((x) => x.rowNo === 13)!.unitText, 'компл.');
  for (const no of [15, 16]) assert.equal(r.rows.find((x) => x.rowNo === no)!.kind, 'skip');
});

test('ГПР и лист без шапки → «не похоже на ВОР» с причиной; > 10 000 строк — понятный отказ', () => {
  const g = parseSheet(gpr());
  assert.equal(g.isVor, false); assert.match(g.reason || '', /график/i);
  const e = parseSheet({ name: 'Расчёт', rows: [['Площадь', 12], ['Периметр', 14]] });
  assert.equal(e.isVor, false); assert.match(e.reason || '', /шапк/);
  const big = parseSheet({ name: 'Большой', rows: Array.from({ length: MAX_ROWS + 1 }, () => ['x']) });
  assert.equal(big.isVor, false); assert.match(big.reason || '', /10000/);
});

test('ЕИ из подписи колонки объёма, если колонки ЕИ нет; заголовок места в колонке «Поз.»', () => {
  const r = parseSheet({ name: 'Двери', rows: [
    ['№ п/п', 'Поз.', 'Наименование', 'Описание', 'Количество изделий, шт', 'Цена, руб.'],
    [1, 2, 3, 4, 5, 6],
    [1, 'Секция 4'],
    [2, 'Этажи 4-12'],
    [3, N, 'Монтаж дверного блока «Омега»', 'Полотно глухое', 162, N]
  ] });
  const w = r.rows.find((x) => x.kind === 'work')!;
  assert.equal(w.unitText, 'шт');
  assert.deepEqual(w.context, { section: '4', floor: { from: 4, to: 12 } });
  assert.equal(contextLabel(w.context), 'Секция 4 · Этажи 4–12');
});

test('шапка не находится за пределами первых 40 строк', () => {
  const rows: Cell[][] = Array.from({ length: 45 }, () => [N]);
  rows.push(['№', 'Наименование', 'Ед. изм.', 'Объём']);
  assert.equal(findHeader(rows), null);
});

test('чтение .xlsx: значения формул из кэша, формула без кэша → null, скрытый лист читается, не-xlsx → понятная ошибка', async () => {
  const mod = await import('exceljs');
  const Excel = (mod as unknown as { default: { Workbook: new () => any } }).default; // eslint-disable-line @typescript-eslint/no-explicit-any
  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet('ВОР');
  ws.addRow(['№', 'Наименование работ', 'Ед. изм.', 'Объём', 'Стоимость']);
  ws.addRow([1, 'Работа «Сигма»', 'м2', '0,5', { formula: 'D2*2', result: 1 }]);
  ws.addRow([2, 'Работа «Тау»', 'м2', 3, { formula: 'D3*2' }]);
  ws.mergeCells('B5:C5');
  ws.getCell('B5').value = 'Итого';
  const hidden = wb.addWorksheet('Скрытый', { state: 'hidden' });
  hidden.addRow(['x']);
  const buf = new Uint8Array(await wb.xlsx.writeBuffer());
  assert.equal(looksLikeXlsx(buf), true);
  const book = await readWorkbook(buf);
  assert.deepEqual(book.sheets.map((s) => [s.name, !!s.hidden]), [['ВОР', false], ['Скрытый', true]]);
  assert.deepEqual(book.sheets[0].rows[1], [1, 'Работа «Сигма»', 'м2', '0,5', 1]);
  assert.equal(book.sheets[0].rows[2][4], null);
  assert.equal(book.sheets[0].rows[4][2], 'Итого', 'объединённая ячейка отдаёт значение главной');
  const r = parseSheet(book.sheets[0]);
  assert.equal(r.rows[0].qty, 0.5);
  await assert.rejects(readWorkbook(new TextEncoder().encode('не excel')), /не файл Excel/);
  assert.equal(cellValue({ richText: [{ text: 'а' }, { text: 'б' }] }), 'аб');
  assert.equal(cellValue({ error: '#REF!' }), null);
});

test('подпись формы: «Кол-во»/«Объём», «НДС 20 %»/«НДС» — одна форма; другой порядок колонок — другая', () => {
  const a = headerSignature(['№ п/п', 'Наименование работ', 'Ед. изм.', 'Норма расхода', 'Объём', 'Цена, в т.ч. НДС 20% / Работа', 'Цена, в т.ч. НДС 20% / Материал']);
  const b = headerSignature(['№ п/п', 'Наименование работ', 'Ед.изм.', 'Норма расхода', 'Кол-во', 'Цена, в том числе НДС / Работа', 'Цена, в том числе НДС / Материал', '', '']);
  const c = headerSignature(['№ п/п', 'Ед. изм.', 'Наименование работ', 'Норма расхода', 'Объём']);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a, 'number|name|unit|norm|qty|цена:работа|цена:материал');
  assert.equal(parseSheet(fkp()).signature, parseSheet({ ...fkp(), name: 'другой лист' }).signature);
});

test('правка колонок: роль переезжает, прежняя роль колонки снимается, колонка уходит из цен; «Наименование» не снять', () => {
  const r = parseSheet(fkp());
  const m = r.columns!;
  const e1 = editColumn(m, r.labels, 'qty', 3);   // «Объём» → колонка нормы
  assert.equal(e1.qty, 3); assert.equal(e1.norm, null);
  const e2 = editColumn(m, r.labels, 'unit', 5);  // ЕИ → первая колонка цен
  assert.equal(e2.unit, 5); assert.equal(e2.prices.some((p) => p.col === 5), false);
  assert.equal(editColumn(m, r.labels, 'name', null), m);
  assert.equal(editColumn(m, r.labels, 'unit', 1), m, 'колонку «Наименования» другой роли не отдать');
  // правка сразу меняет разбор: «Объём» = колонка нормы → у работы объёма нет
  const re = parseSheet(fkp(), e1);
  assert.equal(re.rows.find((x) => x.rowNo === 9)!.qty, null);
  const e3 = editColumn({ ...m, unit: null }, ['', '', '', '', 'Количество изделий, шт'], 'qty', 4);
  assert.equal(e3.unitDefault, 'шт');
});

test('карта колонок из профиля: верная → ColumnMap, без «Наименования» или мусор → null', () => {
  const m = parseSheet(fkp()).columns!;
  assert.deepEqual(columnMapFrom(JSON.parse(JSON.stringify(m))), m);
  assert.equal(columnMapFrom({ unit: 2 }), null);
  assert.equal(columnMapFrom('x'), null);
  assert.deepEqual(columnMapFrom({ name: 1, unit: 'b', prices: [{ label: 'x', col: 5 }, { bad: 1 }] }),
    { number: null, name: 1, unit: null, qty: null, norm: null, type: null, unitDefault: null, prices: [{ label: 'x', col: 5 }] });
});

test('корпус не указан, номера секций пошли заново → блоки 1, 2 (без слияния секций разных корпусов); с корпусом — блоков нет', () => {
  const rows: Cell[][] = [
    ['№', 'Наименование работ', 'Ед. изм.', 'Объём'],
    [1, 'Секция 1'], [2, 'Пол «Альфа»', 'м2', 1],
    [3, 'Секция 2'], [4, 'Пол «Альфа»', 'м2', 2],
    [5, 'Секция 2'], [6, 'Пол «Альфа»', 'м2', 3],
    [7, 'Секция 3'], [8, 'Пол «Альфа»', 'м2', 4],
    [N, 'ИТОГО:']
  ];
  const r = parseSheet({ name: 'ФКП 141', rows });
  const w = r.rows.filter((x) => x.kind === 'work').map((x) => [x.context.block, x.context.section]);
  assert.deepEqual(w, [[1, '1'], [1, '2'], [2, '2'], [2, '3']]);
  assert.equal(contextLabel(r.rows.find((x) => x.rowNo === 6)!.context), 'Блок 2 (корпус не указан) · Секция 2');
  const one = parseSheet({ name: 'без повторов', rows: [rows[0], rows[1], rows[2], rows[3], rows[4]] });
  assert.ok(one.rows.every((x) => x.context.block === undefined), 'номера не повторялись — блоков нет');
  assert.ok(parseSheet(fkp()).rows.every((x) => x.context.block === undefined), 'корпус из «Итого Корпус N» — блоков нет');
});
