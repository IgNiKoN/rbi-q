/// <reference types="node" />
/** Экран «Справочники → Цены» (P2-0006c, этап 3) на подставном сервере: работы по видам работ, правка цены в строке,
 *  материалы, нет права, «Взять цены из ВОР» — предпросмотр и запись с источником «загрузка». Наименования вымышленные. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { EstimateApi, PriceInput, PriceItem } from '../estimate/estimate.service.ts';
import type { VorApi, VorRow } from '../vor/vor.service.ts';
import { settle } from '../../../test-utils/settle.ts';

// Окружение браузера — ДО загрузки React: иначе React при загрузке решает, что событий ввода нет, и onChange текстовых полей не срабатывает.
const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { PricesTab } = await import('../estimate/PricesTab.ts');
const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const COMPANY = { company_id: 'c1', company_name: 'Альфа', can_manage_projects: true, can_manage_units: true, can_manage_roles: true };
const L_W = 'Цена за ед., руб. / Работа', L_M = 'Цена за ед., руб. / Материал';

function setup(opts: { denied?: boolean } = {}) {
  const prices: PriceItem[] = [];
  const calls: { items: PriceInput[]; source: string }[] = [];
  const api = {
    async listPrices() { return opts.denied ? { ok: false, message: 'Нет права работать с ценами и сметами' } : { ok: true, value: prices.map((p) => ({ ...p })) }; },
    async upsertPrices(_c: string, items: PriceInput[], source: string) {
      calls.push({ items, source });
      for (const i of items) {
        const ex = prices.find((p) => i.kind === 'work' ? p.work_type_id === i.work_type_id : p.kind === 'material' && p.name.toLowerCase() === String(i.name).toLowerCase());
        if (ex) { if (i.price_labor != null) ex.price_labor = i.price_labor; if (i.price_material != null) ex.price_material = i.price_material; }
        else prices.push({ id: 'p' + prices.length, kind: i.kind, work_type_id: i.work_type_id || null, name: i.name || 'вид ' + i.work_type_id, unit_text: i.unit_text || '',
          unit_code: null, price_labor: i.price_labor ?? null, price_material: i.price_material ?? null, price_date: '2026-10-21', note: null, updated_at: String(Date.now()), updated_by_email: null });
      }
      return { ok: true, value: { created: items.length, updated: 0, unchanged: 0 } };
    },
    async priceHistory() { return [{ changed_at: '2026-10-21T10:00:00Z', changed_by_email: 'pto@test.invalid', old_labor: null, new_labor: 12, old_material: null, new_material: null, price_date: '2026-10-21', source: 'manual' }]; },
    async deletePrice() { return { ok: true, value: null }; }
  } as unknown as EstimateApi;
  const rows: VorRow[] = [
    { id: 'a', row_no: 5, kind: 'work', number: null, name: 'Пол «Альфа»', unit_text: 'м2', qty: 10, norm: null, prices: { [L_W]: 100, [L_M]: null }, context: {}, parent_row_no: null, location_id: 'L', work_type_id: 'wt1', unit_id: 'm2', match: 'green' },
    { id: 'b', row_no: 6, kind: 'material', number: null, name: 'Смесь «Бета»', unit_text: 'кг', qty: 75, norm: 7.5, prices: { [L_W]: null, [L_M]: 2.5 }, context: {}, parent_row_no: 5, location_id: null, work_type_id: null, unit_id: null, match: null }];
  const vor = {
    async listProjects() { return [{ id: 'p1', name: 'ЖК Тест', company_id: 'c1' }]; },
    async listWorkTypes() { return [{ id: 'wt1', code: null, name: 'Устройство пола', unit_id: 'm2', unit_code: 'м²' }, { id: 'wt2', code: null, name: 'Окраска стен', unit_id: 'm2', unit_code: 'м²' }]; },
    async listImports() { return [{ id: 'imp1', file_name: 'вор.xlsx', sheet_name: 'Лист 1', status: 'confirmed', row_count: 2, works: 1, positions: 1, created_at: '', created_by_email: null, confirmed_at: '', profile_id: null },
      { id: 'imp2', file_name: 'черновик.xlsx', sheet_name: 'Лист', status: 'draft', row_count: 0, works: 0, positions: 0, created_at: '', created_by_email: null, confirmed_at: null, profile_id: null }]; },
    async importRows() { return rows; }
  } as unknown as VorApi;
  return { api, vor, prices, calls };
}

function mount(api: EstimateApi, vor: VorApi) {
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(PricesTab, { api, vor, company: COMPANY } as N)));
  return el as N;
}
function typeIn(input: N, value: string): void {
  const set = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
  set.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}
const blur = (input: N) => input.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true }));

test('работы: виды работ компании без цены видны; правка цены в строке пишет «вручную»', async () => {
  const s = setup();
  const el = mount(s.api, s.vor);
  await tick(); await tick();
  const rows = el.querySelectorAll('.pr-row');
  assert.equal(rows.length, 2);
  assert.match(el.textContent, /Устройство пола/);
  assert.match(el.textContent, /без цены/);
  const labor = el.querySelector('[data-key="w:wt1"] [data-testid="pr-labor"]');
  typeIn(labor, '1 234,5'); blur(labor); await tick(); await tick();
  assert.deepEqual(s.calls[0], { items: [{ kind: 'work', work_type_id: 'wt1', price_labor: 1234.5, price_material: null }], source: 'manual' });
  assert.match(el.querySelector('[role="status"]').textContent, /сохранена/);
  const bad = el.querySelector('[data-key="w:wt2"] [data-testid="pr-labor"]');
  typeIn(bad, '-3'); blur(bad); await tick();
  assert.equal(s.calls.length, 1, 'неверная цена не отправляется');
  assert.equal(bad.getAttribute('aria-invalid'), 'true');
  el.querySelector('[data-key="w:wt1"] [data-testid="pr-hist-btn"]').click(); await tick(); await tick();
  assert.match(el.querySelector('[data-testid="pr-history"]').textContent, /вручную/);
});

test('материалы: добавить материал; нет права — понятное сообщение', async () => {
  const s = setup();
  const el = mount(s.api, s.vor);
  await tick(); await tick();
  el.querySelector('[data-kind="material"]').click(); await tick();
  assert.ok(el.querySelector('[data-testid="pr-empty"]'));
  const form = el.querySelector('[data-testid="pr-add"]');
  typeIn(form.querySelector('[name="name"]'), 'Грунт «Гамма»'); typeIn(form.querySelector('[name="unit"]'), 'л'); typeIn(form.querySelector('[name="price"]'), '99,9');
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); await tick(); await tick();
  assert.deepEqual(s.calls[0].items, [{ kind: 'material', name: 'Грунт «Гамма»', unit_text: 'л', price_material: 99.9 }]);
  assert.match(el.textContent, /Грунт «Гамма»/);

  const d = setup({ denied: true });
  const el2 = mount(d.api, d.vor);
  await tick(); await tick();
  assert.ok(el2.querySelector('[data-testid="pr-noaccess"]'));
});

test('«Взять цены из загруженного ВОР»: только подтверждённые, колонки угаданы, применить → источник import:<id>', async () => {
  const s = setup();
  const el = mount(s.api, s.vor);
  await tick(); await tick();
  el.querySelector('[data-testid="pr-import-open"]').click(); await tick(); await tick();
  const boxes = el.querySelectorAll('[data-testid="pri-import"]');
  assert.equal(boxes.length, 1, 'черновик в список не попадает');
  boxes[0].click(); await tick();
  el.querySelector('[data-testid="pri-show"]').click(); await tick(); await tick();
  assert.equal(el.querySelector('[data-testid="pri-col-labor"]').value, L_W);
  assert.equal(el.querySelector('[data-testid="pri-col-material"]').value, L_M);
  assert.match(el.querySelector('[data-testid="pri-counts"]').textContent, /Новая · 2/);
  el.querySelector('[data-testid="pri-apply"]').click(); await tick(); await tick();
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].source, 'import:imp1');
  assert.deepEqual(s.calls[0].items, [{ kind: 'work', work_type_id: 'wt1', price_labor: 100, price_material: null },
    { kind: 'material', name: 'Смесь «Бета»', unit_text: 'кг', price_material: 2.5 }]);
  assert.match(el.querySelector('[role="status"]').textContent, /новых 2/);
  assert.equal(el.querySelector('[data-testid="pri-box"]'), null, 'панель закрыта после применения');
});
