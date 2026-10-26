/// <reference types="node" />
/** Справочник цен (P2-0006c, этап 3): колонки цен, предпросмотр «Взять цены из ВОР», конфликты двух листов, старые цены, ввод. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessPriceColumns, guessTotalColumns, unitPrice, buildImportPreview, previewCounts, applyItems, isStale, parsePriceInput, priceKey, money } from '../estimate/prices.ts';
import type { VorRow } from '../vor/vor.service.ts';
import type { PriceItem } from '../estimate/estimate.service.ts';

const L_W = 'Стоимость единицы с НДС 22%, руб. / Работа', L_M = 'Стоимость единицы с НДС 22%, руб. / Материалы', L_T = 'Стоимость всего с НДС 22%, руб. / Работа';

function row(p: Partial<VorRow> & { row_no: number; kind: VorRow['kind']; name: string }): VorRow {
  return { id: 'r' + p.row_no, number: null, unit_text: null, qty: null, norm: null, prices: {}, context: {}, parent_row_no: null,
    location_id: null, work_type_id: null, unit_id: null, match: null, ...p };
}
const price = (p: Partial<PriceItem> & { kind: PriceItem['kind']; name: string }): PriceItem => ({
  id: 'p-' + p.name, work_type_id: null, unit_text: '', unit_code: null, price_labor: null, price_material: null,
  price_date: '2026-10-01', note: null, updated_at: '', updated_by_email: null, ...p });

test('guessPriceColumns: три формы заказчиков', () => {
  assert.deepEqual(guessPriceColumns([L_W, L_M, 'Стоимость единицы с НДС 22%, руб. / Всего', L_T, 'Стоимость всего с НДС 22%, руб. / Материалы']), { labor: L_W, material: L_M });
  assert.deepEqual(guessPriceColumns(['Цена за ед. стоимость, руб., в том числе НДС 22% / Работа', 'Цена за ед. стоимость, руб., в том числе НДС 22% / Материал', 'Стоимость, руб., в том числе НДС 22% / Работа']),
    { labor: 'Цена за ед. стоимость, руб., в том числе НДС 22% / Работа', material: 'Цена за ед. стоимость, руб., в том числе НДС 22% / Материал' });
  assert.deepEqual(guessPriceColumns(['Стоимость ед-цы, руб, в т.ч. НДС 22% / Материалы', 'Стоимость ед-цы, руб, в т.ч. НДС 22% / СМР', 'Стоимость всего, руб, в т.ч. НДС 22% / СМР']),
    { labor: 'Стоимость ед-цы, руб, в т.ч. НДС 22% / СМР', material: 'Стоимость ед-цы, руб, в т.ч. НДС 22% / Материалы' });
  assert.deepEqual(guessPriceColumns(['Сумма']), { labor: null, material: null });
});

test('buildImportPreview: новые, без изменений, изменятся, конфликт двух листов; строки без цены и без вида работ пропущены', () => {
  const cols = { labor: L_W, material: L_M };
  const s1 = { importId: 'i1', label: 'лист 1', columns: cols, rows: [
    row({ row_no: 5, kind: 'work', name: 'Пол «Альфа»', work_type_id: 'wt1', prices: { [L_W]: 100, [L_M]: null } }),
    row({ row_no: 6, kind: 'material', name: 'Смесь  «Бета»', unit_text: 'Кг', prices: { [L_W]: 999, [L_M]: 12.5 } }),
    row({ row_no: 7, kind: 'work', name: 'Окраска', work_type_id: 'wt2', prices: { [L_W]: 50 } }),
    row({ row_no: 8, kind: 'work', name: 'Без вида', prices: { [L_W]: 7 } }),
    row({ row_no: 9, kind: 'material', name: 'Без цены', prices: { [L_M]: 0 } }),
    row({ row_no: 10, kind: 'group', name: 'Полы', prices: { [L_W]: 1 } })] };
  const s2 = { importId: 'i2', label: 'лист 2', columns: cols, rows: [
    row({ row_no: 5, kind: 'work', name: 'Пол «Альфа»', work_type_id: 'wt1', prices: { [L_W]: 100 } }),
    row({ row_no: 6, kind: 'material', name: 'смесь «бета»', unit_text: 'кг ', prices: { [L_M]: 13 } }),
    row({ row_no: 11, kind: 'work', name: 'Двери', work_type_id: 'wt3', prices: { [L_W]: 900 } })] };
  const current = [price({ kind: 'work', name: 'Окраска', work_type_id: 'wt2', price_labor: 50 }), price({ kind: 'work', name: 'Двери', work_type_id: 'wt3', price_labor: 800 })];
  const items = buildImportPreview([s1, s2], current, (id) => ({ wt1: 'Устройство пола', wt2: 'Окраска', wt3: 'Монтаж дверей' } as Record<string, string>)[id] || null);
  const by = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(items.length, 4);
  assert.equal(by['w:wt1'].status, 'new'); assert.equal(by['w:wt1'].name, 'Устройство пола'); assert.equal(by['w:wt1'].candidates.length, 1);
  assert.equal(by['w:wt2'].status, 'same');
  assert.equal(by['w:wt3'].status, 'changed');
  const m = by[priceKey('material', null, 'смесь «бета»', 'кг')];
  assert.equal(m.status, 'conflict'); assert.deepEqual(m.candidates.map((c) => [c.material, c.importId]), [[12.5, 'i1'], [13, 'i2']]);
  assert.equal(m.candidates[0].labor, null, 'у материала нет расценки работы');
  assert.deepEqual(previewCounts(items), { new: 1, changed: 1, same: 1, conflict: 1 });

  const skip = applyItems(items, {});
  assert.deepEqual([...skip.keys()].sort(), ['i1', 'i2']);
  assert.equal([...skip.values()].flat().length, 2, 'конфликт без выбора не пишется');
  const chosen = applyItems(items, { [m.key]: 1 });
  assert.deepEqual(chosen.get('i2'), [{ kind: 'work', work_type_id: 'wt3', price_labor: 900, price_material: null },
    { kind: 'material', name: 'Смесь «Бета»', unit_text: 'кг', price_material: 13 }]);
  assert.deepEqual(chosen.get('i1'), [{ kind: 'work', work_type_id: 'wt1', price_labor: 100, price_material: null }]);
});

test('повтор после применения — всё «без изменений»', () => {
  const cols = { labor: L_W, material: L_M };
  const s = { importId: 'i1', label: '', columns: cols, rows: [row({ row_no: 5, kind: 'work', name: 'x', work_type_id: 'wt1', prices: { [L_W]: 100.123456 } })] };
  const items = buildImportPreview([s], [price({ kind: 'work', name: 'x', work_type_id: 'wt1', price_labor: 100.123456 })], () => 'x');
  assert.deepEqual(previewCounts(items), { new: 0, changed: 0, same: 1, conflict: 0 });
  assert.equal(applyItems(items, {}).size, 0);
});

test('isStale, parsePriceInput, money', () => {
  const now = new Date('2026-10-21T12:00:00');
  assert.equal(isStale('2026-07-01', now), true);
  assert.equal(isStale('2026-08-01', now), false);
  assert.equal(isStale('плохо', now), false);
  assert.equal(parsePriceInput(' 1 234,50 '), 1234.5);
  assert.equal(parsePriceInput(''), null);
  assert.ok(Number.isNaN(parsePriceInput('-5')));
  assert.ok(Number.isNaN(parsePriceInput('abc')));
  assert.equal(money(1234.5).replace(/\s/g, ' '), '1 234,50');
  assert.equal(money(null), '');
});

test('цена из суммы (P2-0009, К2): нет цены за единицу, есть сумма строки → сумма ÷ объём; цена есть — берётся она', () => {
  const labels = ['Стоимость единицы с НДС 22%, руб. / Работа', 'Стоимость единицы с НДС 22%, руб. / Материалы', 'Стоимость единицы с НДС 22%, руб. / Всего',
    'Стоимость всего с НДС 22%, руб. / Работа', 'Стоимость всего с НДС 22%, руб. / Материалы', 'Стоимость всего с НДС 22%, руб. / Всего'];
  assert.deepEqual(guessTotalColumns(labels), { labor: 'Стоимость всего с НДС 22%, руб. / Работа', material: 'Стоимость всего с НДС 22%, руб. / Материалы' });
  assert.deepEqual(guessPriceColumns(labels), { labor: 'Стоимость единицы с НДС 22%, руб. / Работа', material: 'Стоимость единицы с НДС 22%, руб. / Материалы' });
  assert.equal(unitPrice(null, 848196, 1884.88), 450, 'ламинат из «Спутника»: 848 196 ÷ 1 884,88 = 450');
  assert.equal(unitPrice(300, 24999, 83.33), 300, 'цена за единицу важнее суммы');
  assert.equal(unitPrice(0, 100, 10), 0, 'нулевая цена — это цена');
  assert.equal(unitPrice(null, 100, 3), 33.33, 'до копеек');
  assert.equal(unitPrice(null, null, 10), null);
  assert.equal(unitPrice(null, 100, 0), null, 'нет объёма — нет цены');
  assert.equal(unitPrice(null, -5, 10), null);
});
