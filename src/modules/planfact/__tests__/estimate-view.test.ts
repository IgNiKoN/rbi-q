/// <reference types="node" />
/** Экран сметы (P2-0006c, этап 4) на подставном сервере: итоги по листу, ручная цена — пометка «вручную» и справочник не меняется,
 *  фильтр «без цены», «Записать ручные цены в справочник» (источник — смета), «Цены из файла ВОР». Наименования вымышленные. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { EstimateApi, EstimateRow, PriceInput, RowPrice } from '../estimate/estimate.service.ts';
import type { VorApi, VorRow } from '../vor/vor.service.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { EstimateView } = await import('../estimate/EstimateView.ts');

const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const L_W = 'Цена за ед. / Работа', L_M = 'Цена за ед. / Материал';

function row(p: Partial<EstimateRow> & { row_no: number; kind: EstimateRow['kind'] }): EstimateRow {
  return { source_row_id: 's' + p.row_no, import_id: 'imp1', number: null, name: 'строка ' + p.row_no, unit_text: 'м2', qty: null, norm: null, parent_row_no: null,
    work_type_id: null, price_labor: null, price_material: null, price_source: 'none', ref_item_id: null, ref_labor: null, ref_material: null, ref_date: null, ...p };
}

function setup() {
  let rows = [
    row({ row_no: 4, kind: 'group', name: 'Полы', price_source: null }),
    row({ row_no: 5, kind: 'work', name: 'Пол «Альфа»', qty: 100, work_type_id: 'wt1', price_labor: 10, price_source: 'reference', ref_item_id: 'p1', ref_labor: 10, ref_date: '2026-10-01' }),
    row({ row_no: 6, kind: 'material', name: 'Смесь «Бета»', unit_text: 'кг', qty: null, norm: 7.5, parent_row_no: 5, price_material: 2, price_source: 'reference', ref_item_id: 'p2', ref_material: 2 }),
    row({ row_no: 7, kind: 'work', name: 'Окраска «Гамма»', qty: 20, work_type_id: 'wt2' })];
  const set: RowPrice[][] = [], ups: { items: PriceInput[]; source: string; company: string }[] = [];
  const api = {
    async estimateRows() { return { ok: true, value: rows.map((r) => ({ ...r })) }; },
    async setPrices(_e: string, items: RowPrice[]) {
      set.push(items);
      rows = rows.map((r) => { const i = items.find((x) => x.source_row_id === r.source_row_id); return i ? { ...r, price_labor: i.price_labor ?? null, price_material: i.price_material ?? null, price_source: 'manual' } : r; });
      return { ok: true, value: items.length };
    },
    async upsertPrices(company: string, items: PriceInput[], source: string) { ups.push({ items, source, company }); return { ok: true, value: { created: 0, updated: items.length, unchanged: 0 } }; },
    async refill() { return { ok: true, value: 0 }; },
    async updateEstimate() { return { ok: true, value: null }; }
  } as unknown as EstimateApi;
  const src: VorRow[] = [5, 6, 7].map((n) => ({ id: 'v' + n, row_no: n, kind: n === 6 ? 'material' : 'work', number: null, name: '', unit_text: null, qty: null, norm: null,
    prices: (n === 5 ? { [L_W]: 10, [L_M]: null } : n === 6 ? { [L_M]: 2 } : { [L_W]: 33 }) as Record<string, number | null>, context: {}, parent_row_no: null, location_id: null, work_type_id: null, unit_id: null, match: null }));
  const vor = { async importRows() { return src; } } as unknown as VorApi;
  return { api, vor, set, ups };
}

function mount(s: ReturnType<typeof setup>) {
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  const estimate = { id: 'e1', name: 'Смета', import_ids: ['imp1'], area_m2: 100, rows: 3, unpriced: 1, revisions: 0, created_at: '', created_by_email: null, updated_at: '' };
  const imports = [{ id: 'imp1', file_name: 'вор.xlsx', sheet_name: 'Лист 1', status: 'confirmed', row_count: 4, works: 2, positions: 2, created_at: '', created_by_email: null, confirmed_at: '', profile_id: null }];
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(EstimateView, { api: s.api, vor: s.vor, estimate, imports, companyId: 'c1', onBack: () => {} } as N)));
  return el as N;
}
function typeIn(input: N, value: string): void {
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}
const blur = (input: N) => input.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true }));
const txt = (el: N, sel: string) => el.querySelector(sel).textContent.replace(/\s/g, ' ');

test('итоги листа, без цены, ручная цена → «вручную», справочник не трогается', async () => {
  const s = setup();
  const el = mount(s);
  await tick(); await tick();
  assert.equal(txt(el, '[data-testid="es-sum-labor"]'), '1 000,00');
  assert.equal(txt(el, '[data-testid="es-sum-material"]'), '1 500,00', 'материал: 100 × 7,5 × 2');
  assert.match(el.querySelector('[data-testid="es-totals"]').textContent, /без цены: 1/);
  el.querySelector('[data-filter="unpriced"]').click(); await tick();
  assert.deepEqual([...el.querySelectorAll('.es-row[data-row]')].map((n: N) => n.getAttribute('data-row')), ['7']);
  el.querySelector('[data-filter="all"]').click(); await tick();
  const f = el.querySelector('[data-row="5"] [data-testid="es-labor"]');
  typeIn(f, '12'); blur(f); await tick(); await tick();
  assert.deepEqual(s.set[0], [{ source_row_id: 's5', price_labor: 12, price_material: null }]);
  assert.equal(s.ups.length, 0, 'справочник не меняется');
  assert.equal(el.querySelector('[data-row="5"]').getAttribute('data-source'), 'manual');
  assert.match(el.querySelector('[data-row="5"]').textContent, /вручную/);
  assert.equal(txt(el, '[data-testid="es-sum-labor"]'), '1 200,00');
});

test('«Записать ручные цены в справочник» — источник смета; «Цены из файла ВОР» — только отличающиеся строки', async () => {
  const s = setup();
  const el = mount(s);
  await tick(); await tick();
  el.querySelector('[data-testid="es-from-file"]').click(); await tick(); await tick(); await tick();
  assert.deepEqual(s.set[0], [{ source_row_id: 's7', price_labor: 33, price_material: null }]);
  el.querySelector('[data-testid="es-to-ref"]').click(); await tick();
  el.querySelector('[data-testid="es-to-ref-apply"]').click(); await tick(); await tick();
  assert.deepEqual(s.ups[0], { company: 'c1', source: 'estimate:e1', items: [{ kind: 'work', work_type_id: 'wt2', price_labor: 33, price_material: null }] });
});
