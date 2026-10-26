/// <reference types="node" />
/** КС-2 по унифицированной форме (P2-0008b, этап 1): синтетический снимок с вымышленными данными. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWorkbook } from '../vor/xlsx-reader.ts';
import { writeUnifiedKs2, actTotal, actRows, rowCost, ks2Problems, isEdited, ruDate, ks2FileName, emptyKs2Header, type Ks2Row, type Ks2Snapshot } from '../ks2/form.ts';

const row = (p: Partial<Ks2Row>): Ks2Row => ({
  source_row_id: crypto.randomUUID(), row_no: 1, number: '1', name: 'Работа', unit: 'м2', kind: 'work',
  sys_qty: 1, sys_price: 1, qty: 1, price: 1, excluded: false, total_qty: 1, prev_qty: 0, ...p,
});

export function sampleSnapshot(): Ks2Snapshot {
  return {
    header: { ...emptyKs2Header(), investor: 'ООО «Инвест-Альфа»', customer: 'АО «Заказчик-Бета»', contractor: 'ООО «Подряд-Гамма»',
      construction: 'ЖК «Вымышленный»', object: 'Корпус 1', contract_no: 'Д-17/26', contract_date: '2026-03-01',
      act_no: '3', act_date: '2026-10-31', period_from: '2026-10-01', period_to: '2026-10-31',
      contractor_signer: 'Начальник участка Иванов И. И.', customer_signer: 'Инженер ТН Петров П. П.' },
    rows: [
      row({ row_no: 5, number: '1.1', name: 'Штукатурка стен «Альфа» по маякам', unit: 'м2', qty: 120.5, sys_qty: 120.5, price: 333.33, sys_price: 333.33 }),
      row({ row_no: 6, number: '1.1.1', name: 'Смесь «Бета»', unit: 'кг', kind: 'material', qty: 1084.5, sys_qty: 1084.5, price: 12.17, sys_price: 12.17 }),
      row({ row_no: 7, number: '1.2', name: 'Очень длинное наименование работы '.repeat(8).trim(), unit: 'м2', qty: 0.335, price: 1000.005 }),
      row({ row_no: 8, number: '1.3', name: 'Исключённая строка', excluded: true, qty: 50, price: 100 }),
      row({ row_no: 9, number: '1.4', name: 'Нулевой объём', qty: 0, price: 100 }),
    ],
  };
}

test('суммы до копеек; исключённые и нулевые строки не идут в акт', () => {
  const s = sampleSnapshot();
  assert.deepEqual(actRows(s).map((r) => r.row_no), [5, 6, 7]);
  assert.equal(rowCost(s.rows[0]), 40166.27); // 120.5 × 333.33 = 40166.265
  assert.equal(rowCost(s.rows[1]), 13198.37); // 1084.5 × 12.17 = 13198.365
  assert.equal(rowCost(s.rows[2]), 335); // 0.335 × 1000.005 = 335.00167
  assert.equal(actTotal(s), 53699.64);
});

test('правка ПТО видна; проблемы: нет строк, нет цены', () => {
  const s = sampleSnapshot();
  assert.equal(isEdited(s.rows[0]), false);
  assert.equal(isEdited(s.rows[2]), true);
  assert.equal(isEdited(s.rows[3]), true);
  assert.deepEqual(ks2Problems(s), []);
  s.rows[1].price = null;
  assert.match(ks2Problems(s)[0], /Нет цены у 1/);
  assert.match(ks2Problems({ header: s.header, rows: [] })[0], /нет ни одной строки/);
});

test('даты и имя файла', () => {
  assert.equal(ruDate('2026-10-31'), '31.10.2026');
  assert.equal(ruDate(''), '');
  assert.equal(ks2FileName('3/А', 2), 'КС-2 № 3-А (ред. 2).xlsx');
  assert.equal(ks2FileName('', 1), 'КС-2 № б-н (ред. 1).xlsx');
});

test('0 строк — отказ', async () => {
  const s = sampleSnapshot();
  s.rows.forEach((r) => { r.excluded = true; });
  await assert.rejects(writeUnifiedKs2(s), /нет ни одной строки/);
});

test('Excel: шапка, строки заказчика, итог = сумме строк', async () => {
  const s = sampleSnapshot();
  const bytes = await writeUnifiedKs2(s);
  const wb = await readWorkbook(bytes);
  assert.equal(wb.sheets.length, 1);
  const g = wb.sheets[0].rows;
  const flat = g.flat().filter((v) => v !== null);
  for (const t of ['0322005', 'АО «Заказчик-Бета»', 'ООО «Подряд-Гамма»', 'ООО «Инвест-Альфа»', 'ЖК «Вымышленный»', 'Корпус 1', 'Д-17/26', '01.03.2026', '31.10.2026', '01.10.2026', 'О ПРИЁМКЕ ВЫПОЛНЕННЫХ РАБОТ', 'Начальник участка Иванов И. И.', 'Инженер ТН Петров П. П.']) {
    assert.ok(flat.includes(t), `нет «${t}»`);
  }
  const dataRows = g.filter((r) => typeof r[0] === 'number' && typeof r[7] === 'number' && typeof r[2] === 'string' && r[2] !== 'Наименование работ');
  assert.deepEqual(dataRows.map((r) => r[1]), ['1.1', '1.1.1', '1.2']);
  assert.deepEqual(dataRows.map((r) => r[4]), ['м2', 'кг', 'м2']);
  assert.deepEqual(dataRows.map((r) => r[5]), [120.5, 1084.5, 0.335]);
  assert.deepEqual(dataRows.map((r) => r[7]), [40166.27, 13198.37, 335]);
  const itog = g.find((r) => r[0] === 'Итого')!;
  assert.equal(itog[7], 53699.64);
  const sum = dataRows.reduce((a, r) => a + Math.round((r[7] as number) * 100), 0) / 100;
  assert.equal(sum, itog[7]);
  assert.ok(!flat.includes('Исключённая строка') && !flat.includes('Нулевой объём'));
});
