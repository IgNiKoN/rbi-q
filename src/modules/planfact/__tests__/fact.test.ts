/** Расчёты экрана «Факт» (P2-0007): процент, остаток, разбор объёма, разбивка «закрыть этаж» — Σ по ЕИ равна заданному. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, fmtPeriod, fmtQty, parseQty, percent, periodError, remainder, round3, splitFloor, sumByUnit, todayMoscow, vorHints } from '../fact/fact.ts';

test('процент и остаток: 10 из 100 → 10 %, остаток 90; план 0 → 0 %; сверх плана — больше 100', () => {
  assert.equal(percent(10, 100), 10);
  assert.equal(percent(1, 3), 33.3);
  assert.equal(percent(5, 0), 0);
  assert.equal(percent(0, 100), 0);
  assert.equal(percent(105, 100), 105);
  assert.equal(remainder(100, 10), 90);
  assert.equal(remainder(100, 130), 0, 'остаток не бывает отрицательным');
  assert.equal(remainder(0.3, 0.1), 0.2, 'без хвостов двоичной дроби');
});

test('parseQty: запятая и точка, пробелы; пусто, минус, буквы — null', () => {
  assert.equal(parseQty('12,5'), 12.5);
  assert.equal(parseQty(' 1 234.567 '), 1234.567);
  assert.equal(parseQty('0,0004'), 0);
  for (const bad of ['', 'abc', '-3', '1,2,3', '1e3']) assert.equal(parseQty(bad), null, bad);
  assert.equal(fmtQty(1234.5), (1234.5).toLocaleString('ru-RU'));
  assert.equal(round3(1.0005 + 1.0005), 2.001);
});

test('закрыть этаж, 100 %: объём каждой строки = остаток', () => {
  const items = [{ id: 'a', unit: 'м²', plan: 100, fact: 10 }, { id: 'b', unit: 'м²', plan: 20, fact: 20 }, { id: 'c', unit: 'шт.', plan: 7, fact: 0 }];
  assert.deepEqual(splitFloor(items, { kind: 'remainder' }), { a: 90, b: 0, c: 7 });
});

test('закрыть этаж на X %: Σ по ЕИ равна заданному, разница округления уходит в последнюю позицию группы', () => {
  const items = [{ id: 'a', unit: 'м²', plan: 10, fact: 0 }, { id: 'b', unit: 'м²', plan: 10, fact: 0 }, { id: 'c', unit: 'м²', plan: 10, fact: 0 }, { id: 'd', unit: 'шт.', plan: 5, fact: 0 }];
  const r = splitFloor(items, { kind: 'percent', pct: 33.333 });
  const target = round3(30 * 0.33333);
  assert.equal(sumByUnit(items.filter((i) => i.unit === 'м²').map((i) => ({ unit: i.unit, qty: r[i.id] })))['м²'], target);
  assert.equal(r.d, round3(5 * 0.33333), 'другая ЕИ считается отдельно');
  const half = splitFloor([{ id: 'x', unit: 'м²', plan: 1, fact: 0 }, { id: 'y', unit: 'м²', plan: 1, fact: 0 }, { id: 'z', unit: 'м²', plan: 1, fact: 0 }], { kind: 'percent', pct: 50 });
  assert.equal(round3(half.x + half.y + half.z), 1.5);
});

test('закрыть этаж на 100 % от плана равно плану, на 0 % — нули', () => {
  const items = [{ id: 'a', unit: 'м²', plan: 33.333, fact: 5 }, { id: 'b', unit: 'м²', plan: 0.001, fact: 0 }];
  const full = splitFloor(items, { kind: 'percent', pct: 100 });
  assert.equal(round3(full.a + full.b), round3(33.333 + 0.001));
  assert.deepEqual(splitFloor(items, { kind: 'percent', pct: 0 }), { a: 0, b: 0 });
});

test('сегодняшняя дата — по Москве (в 22:30 UTC уже следующие сутки)', () => {
  assert.equal(todayMoscow(new Date('2026-10-21T22:30:00Z')), '2026-10-22');
  assert.equal(todayMoscow(new Date('2026-10-21T10:00:00Z')), '2026-10-21');
});

test('подсказка позиции (P2-0009, К3): «№ строки · раздел» — одинаковые названия на одном месте различимы', () => {
  const rows = [
    { row_no: 4, kind: 'group', number: null, name: 'Черновая отделка МОП 1-го этажа' },
    { row_no: 42, kind: 'group', number: null, name: '3 Стены (пом. Входные тамбуры)' },
    { row_no: 43, kind: 'work', number: '3.1', name: 'Затирка цементно-песчаным раствором' },
    { row_no: 60, kind: 'group', number: null, name: '4 Стены (пом. Встроенные: офис)' },
    { row_no: 61, kind: 'work', number: '4.1', name: 'Затирка цементно-песчаным раствором' },
    { row_no: 70, kind: 'work', number: null, name: 'Без номера' }];
  const h = vorHints([{ id: 'p1', import_id: 'i1', source_row_no: 43 }, { id: 'p2', import_id: 'i1', source_row_no: 61 },
    { id: 'p3', import_id: 'i1', source_row_no: 70 }, { id: 'p4', import_id: 'i1', source_row_no: null }, { id: 'p5', import_id: 'i9', source_row_no: 43 }],
    new Map([['i1', rows]]));
  assert.equal(h.get('p1'), '№ 3.1 · Стены (пом. Входные тамбуры)');
  assert.equal(h.get('p2'), '№ 4.1 · Стены (пом. Встроенные: офис)');
  assert.equal(h.get('p3'), 'Стены (пом. Встроенные: офис)', 'без номера — только раздел');
  assert.ok(!h.has('p4') && !h.has('p5'), 'без строки или без загрузки — без подсказки');
});

test('подсказка позиции с КВР (P2-0012): № · КВР · пояснение строки Номенклатуры — две одноимённые работы различаются', () => {
  const rows = [
    { row_no: 10, kind: 'group', number: '8.', name: 'КВР-группа 8' },
    { row_no: 11, kind: 'work', number: '8.', name: 'Работа «Вид 13»', context: { kvr: 10, note: 'Пояснение 17' } },
    { row_no: 12, kind: 'work', number: '8.', name: 'Работа «Вид 13»', context: { kvr: 10, note: 'Пояснение 18' } },
    { row_no: 13, kind: 'work', number: '8.', name: 'Работа «Вид 12»', context: null }
  ];
  const h = vorHints([{ id: 'a', import_id: 'i', source_row_no: 11 }, { id: 'b', import_id: 'i', source_row_no: 12 }, { id: 'c', import_id: 'i', source_row_no: 13 }],
    new Map([['i', rows]]));
  assert.equal(h.get('a'), '№ 8. · КВР-группа 8 · Пояснение 17');
  assert.equal(h.get('b'), '№ 8. · КВР-группа 8 · Пояснение 18');
  assert.equal(h.get('c'), '№ 8. · КВР-группа 8');
});

test('P2-0022: период «с … по …» — те же правила, что на сервере (030): ≤ 31 дня, начало ≤ конца, конец не в будущем', () => {
  const today = '2026-10-24';
  assert.equal(daysBetween('2026-10-01', '2026-10-31'), 30);
  assert.equal(periodError('2026-10-11', '2026-10-24', today), '', '14 дней — можно');
  assert.equal(periodError('2026-09-24', '2026-10-24', today), '', 'ровно 31 день — можно');
  assert.match(periodError('2026-09-23', '2026-10-24', today), /не больше 31 дня/);
  assert.match(periodError('2026-10-20', '2026-10-19', today), /Начало периода позже конца/);
  assert.match(periodError('2026-10-20', '2026-10-25', today), /в будущем/);
  assert.match(periodError('', '2026-10-24', today), /начало и конец/);
  assert.equal(periodError('2026-10-24', '2026-10-24', today), '', 'один день периодом — можно');
});

test('P2-0022: подпись «за период dd.mm–dd.mm»; запись за день — без подписи', () => {
  assert.equal(fmtPeriod('2026-10-11', '2026-10-24'), 'за период 11.10–24.10');
  assert.equal(fmtPeriod(null, '2026-10-24'), '');
  assert.equal(fmtPeriod(undefined, '2026-10-24'), '');
});
