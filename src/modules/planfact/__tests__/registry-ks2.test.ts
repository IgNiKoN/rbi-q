/// <reference types="node" />
/** «КС-2 → список актов» на реестре (P2-0020, этап 4): колонки, статусы палитрой, фильтры статус / год / месяц периода, выгрузка
 *  в Excel (видимые колонки), без money.view — колонки «Сумма» нет (экран и Excel); на экране КС-2 нажатие на номер открывает акт
 *  как раньше; вид в адресе #/planfact/ks2?… не сбрасывается маршрутом. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { makeFakeKs2 } from './ks2-fake.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/#/planfact/ks2' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.KeyboardEvent = win.KeyboardEvent;
const { createElement: h } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { Ks2Registry, ks2Columns, monthLabel } = await import('../ks2/Ks2Registry.ts');
const { Ks2Tab } = await import('../ks2/Ks2Tab.ts');
const { canonicalHash, routeFromHash } = await import('../PlanfactApp.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const tick = (): Promise<void> => settle();

const act = (id: string, no: string, from: string, to: string, status: string, total: number | null, extra: Record<string, unknown> = {}): N => ({
  id, act_no: no, act_date: to, period_from: from, period_to: to, status, total, revisions: 1, last_revision_id: null, issued_at: null, issued_by_email: null,
  annul_reason: null, annulled_at: null, created_at: to + 'T09:00:00Z', ...extra });
const ACTS = [
  act('a4', '4', '2026-10-01', '2026-10-31', 'draft', 1500.5),
  act('a3', '3', '2026-09-01', '2026-09-30', 'issued', 2000, { issued_by_email: 'pto@test.invalid', issued_at: '2026-10-02T10:00:00Z' }),
  act('a2', '2', '2026-08-01', '2026-08-31', 'annulled', 700, { annul_reason: 'ошибка в объёмах' }),
  act('a1', '1', '2025-12-01', '2025-12-31', 'issued', 300, { issued_by_email: 'pto@test.invalid', issued_at: '2026-01-10T10:00:00Z' })];

async function mount(el: N): Promise<N> {
  const box = win.document.createElement('div');
  win.document.body.appendChild(box);
  flushSync(() => createRoot(box as unknown as HTMLElement).render(el));
  await tick(); await tick();
  return box;
}
const click = (el: N): void => flushSync(() => { el.click(); });
const qa = (box: N, sel: string): N[] => Array.from(box.querySelectorAll(sel));
const rowIds = (box: N): string[] => qa(box, '[data-testid="k2r-table"] tr[data-row]').map((r) => r.getAttribute('data-row'));
async function filterBy(box: N, filter: string, value: string): Promise<void> {
  click(box.querySelector('[data-testid="p2-reg-filter"]'));
  click(box.querySelector(`[data-filter="${filter}"] [data-value="${value}"]`));
  click(box.querySelector('[data-testid="p2-reg-panel-apply"]'));
  await tick();
}
const reg = (extra: Record<string, unknown> = {}) => h(Ks2Registry, { acts: ACTS, canMoney: true, onOpen: () => undefined, companyId: 'c1', user: 'u@test.invalid', ...extra } as N);

test('колонки и статусы палитрой: номер, дата, период, статус (с причиной аннулирования), сумма, редакции, выдал', async () => {
  win.history.replaceState(null, '', '#/planfact/ks2');
  const box = await mount(reg());
  assert.deepEqual(qa(box, '[data-testid="p2-reg-sort"]').map((b) => b.textContent), ['№ акта', 'Дата акта', 'Период', 'Статус', 'Сумма, ₽', 'Редакций', 'Выдал']);
  const r = (id: string, col: string) => box.querySelector(`tr[data-row="${id}"] [data-col="${col}"]`);
  assert.equal(r('a4', 'no').textContent, '№ 4');
  assert.equal(r('a4', 'period').textContent, '01.10.2026 — 31.10.2026');
  assert.match(r('a4', 'sum').textContent, /1\s500,50/);
  assert.deepEqual(['a4', 'a3', 'a2'].map((id) => r(id, 'status').querySelector('[data-testid="k2r-status"]').className.match(/--(\w+)/)?.[1]), ['yellow', 'green', 'grey']);
  assert.match(r('a2', 'status').textContent, /Аннулирован.*ошибка в объёмах/);
  assert.equal(r('a3', 'issued').textContent, 'pto@test.invalid, 02.10.2026');
});

test('фильтры: статус, год и месяц периода (подпись месяца по-русски); вид — в адресе', async () => {
  win.history.replaceState(null, '', '#/planfact/ks2');
  const box = await mount(reg());
  await filterBy(box, 'status', 'issued');
  assert.deepEqual(rowIds(box).sort(), ['a1', 'a3']);
  await filterBy(box, 'year', '2026');
  assert.deepEqual(rowIds(box), ['a3'], 'статус И год');
  assert.equal(win.location.hash, '#/planfact/ks2?f.status=issued&f.year=2026');
  click(box.querySelector('[data-testid="p2-reg-reset"]')); await tick();
  await filterBy(box, 'month', '2026-08');
  assert.deepEqual(rowIds(box), ['a2']);
  assert.match(box.querySelector('[data-testid="p2-reg-chips"]').textContent, /Месяц периода: Август 2026/);
  assert.equal(monthLabel('2025-12'), 'Декабрь 2025');
  win.history.replaceState(null, '', '#/planfact/ks2');
});

test('без money.view — колонки «Сумма» нет ни на экране, ни в Excel', async () => {
  const ExcelJS: N = (await import('exceljs')).default;
  const files: { bytes: Uint8Array; name: string }[] = [];
  const box = await mount(reg({ canMoney: false, save: (bytes: Uint8Array, name: string) => files.push({ bytes, name }) }));
  assert.ok(!qa(box, '[data-testid="p2-reg-sort"]').some((b) => b.textContent.includes('Сумма')));
  assert.equal(box.querySelector('[data-col="sum"]'), null);
  click(box.querySelector('[data-testid="k2r-export-all"]')); await tick();
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(files[0].bytes);
  const head = (wb.worksheets[0].getRow(1).values as N[]).slice(1);
  assert.deepEqual(head, ['№ акта', 'Дата акта', 'Период', 'Статус', 'Редакций', 'Выдал']);
  assert.match(files[0].name, /^Акты КС-2 \d\d\.\d\d\.\d{4}\.xlsx$/);
  assert.equal(ks2Columns(true).some((c) => c.id === 'sum'), true);
});

test('выгрузка в Excel: суммы — числа с сервера, выбранные строки', async () => {
  const ExcelJS: N = (await import('exceljs')).default;
  const files: { bytes: Uint8Array; name: string }[] = [];
  const box = await mount(reg({ save: (bytes: Uint8Array, name: string) => files.push({ bytes, name }) }));
  click(box.querySelector('tr[data-row="a4"] [data-testid="p2-reg-select"]'));
  click(box.querySelector('tr[data-row="a2"] [data-testid="p2-reg-select"]'));
  click(box.querySelector('[data-testid="k2r-export-selected"]')); await tick();
  const ws = (await (async () => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(files[0].bytes); return wb; })()).worksheets[0];
  assert.equal(ws.rowCount, 3);
  assert.deepEqual((ws.getRow(2).values as N[]).slice(1, 6), ['4', '2026-10-31', '01.10.2026 — 31.10.2026', 'черновик', 1500.5]);
  assert.equal((ws.getRow(3).values as N[])[4], 'аннулирован: ошибка в объёмах');
});

test('экран КС-2: список на реестре, нажатие на номер открывает акт как раньше; «назад» — снова список', async () => {
  win.history.replaceState(null, '', '#/planfact/ks2');
  const f = makeFakeKs2([{ id: 's12', row_no: 12, number: '1.1', name: 'Штукатурка', unit: 'м2', kind: 'work', price: 300 }], [{ src: 's12', date: '2026-10-05', qty: 10 }], { contract: true });
  await f.api.createAct('pr1', '1', '2026-10-31', '2026-10-01', '2026-10-31');
  const vor = { async listProjects() { return [{ id: 'pr1', name: 'ЖК Тест', company_id: 'c1' }]; }, async permissions() { return ['planfact.ks2.edit', 'planfact.money.view']; } } as N;
  const box = await mount(h(Ks2Tab, { api: f.api, vor, me: 'pto@test.invalid' } as N));
  await tick();
  assert.ok(box.querySelector('[data-testid="k2-registry"]'));
  assert.deepEqual(rowIds(box).length, 1);
  click(box.querySelector('[data-testid="p2-reg-open"]')); await tick(); await tick();
  assert.ok(box.querySelector('[data-testid="k2-act"]'), 'открыт акт (Ks2Act)');
  assert.match(String(box.querySelector('.k2-act-title')?.textContent), /Акт № 1/);
  click(box.querySelector('[data-testid="k2-back"]')); await tick(); await tick();
  assert.equal(box.querySelector('[data-testid="k2-act"]'), null);
  assert.equal(rowIds(box).length, 1, 'снова список на реестре');
});

test('маршрут: #/planfact/ks2?вид — страница КС-2, адрес не сбрасывается', () => {
  const all = { company: true, estimate: true, ks2: true, fact: true, brigades: true };
  assert.equal(routeFromHash('#/planfact/ks2?f.status=issued').page, 'ks2');
  assert.equal(canonicalHash('#/planfact/ks2?f.status=issued', all), null);
  assert.equal(canonicalHash('#/planfact/ks2?f.status=issued', { ...all, ks2: false }), '#/planfact');
  assert.equal(canonicalHash('#/planfact/ksx?f=1', all), '#/planfact');
});
