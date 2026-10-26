/// <reference types="node" />
/** Экран «КС-2» (P2-0008b, этап 3) на подставном сервере: доступ, договорная КП, новый акт, предложение системы
 *  (факт 10 + 5 за разные даты → акт по первой дате = 10; материал = 10 × норма; цены из КП), правка и сохранение редакции. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { makeFakeKs2 } from './ks2-fake.ts';
import type { FakeFact, FakeSrc } from './ks2-fake.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { Ks2Tab } = await import('../ks2/Ks2Tab.ts');
const { actRowsOf, actHeader } = await import('../ks2/model.ts');
const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const SRC: FakeSrc[] = [
  { id: 's12', row_no: 12, number: '1.1', name: 'Штукатурка стен «Альфа»', unit: 'м2', kind: 'work', price: 300 },
  { id: 's13', row_no: 13, number: '1.1.1', name: 'Смесь «Бета»', unit: 'кг', kind: 'material', parent: 's12', norm: 9, price: 12.5 },
  { id: 's14', row_no: 14, number: '1.2', name: 'Окраска стен', unit: 'м2', kind: 'work', price: null }];
const FACTS: FakeFact[] = [{ src: 's12', date: '2026-10-05', qty: 10 }, { src: 's12', date: '2026-10-15', qty: 5 }];
const PTO = ['planfact.ks2.edit'];

function setup(perms = PTO, opts: { canEdit?: boolean; contract?: boolean } = {}) {
  const f = makeFakeKs2(SRC, FACTS, opts);
  const vor = { async listProjects() { return [{ id: 'pr1', name: 'ЖК Тест', company_id: 'c1' }]; }, async permissions() { return perms; } } as any;
  return { ...f, vor };
}
function mount(s: any) {
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(Ks2Tab, { api: s.api, vor: s.vor } as N)));
  return el as N;
}
function typeIn(input: N, value: string): void {
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}
function pick(sel: N, value: string): void {
  Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, 'value')!.set!.call(sel, value);
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
}
const submit = (f: N) => f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
const row = (el: N, rn: number) => el.querySelector(`[data-row="${rn}"]`);
const txt = (el: N, sel: string) => String(el.querySelector(sel)?.textContent || '');

async function newAct(el: N, from: string, to: string, no?: string) {
  el.querySelector('[data-testid="k2-new"]').click(); await tick();
  const f = el.querySelector('[data-testid="k2-new-form"]');
  if (no) typeIn(f.querySelector('[name="no"]'), no);
  typeIn(f.querySelector('[name="from"]'), from);
  typeIn(f.querySelector('[name="to"]'), to);
  submit(f); await tick(); await tick();
}

test('без прав на КС-2 — понятное сообщение', async () => {
  const el = mount(setup(['planfact.fact.view']));
  await tick();
  assert.ok(el.querySelector('[data-testid="k2-noaccess"]'));
});

test('нет договорной КП — экран просит выбрать, «Новый акт» скрыт; выбор КП открывает создание', async () => {
  const s = setup(PTO, { contract: false });
  const el = mount(s);
  await tick(); await tick();
  assert.ok(el.querySelector('[data-testid="k2-need-contract"]'));
  assert.equal(el.querySelector('[data-testid="k2-new"]'), null);
  pick(el.querySelector('[data-testid="k2-contract-select"]'), 'kp1'); await tick(); await tick();
  assert.ok(s.calls.includes('setContract'));
  assert.ok(el.querySelector('[data-testid="k2-new"]'));
});

test('просмотр (руководство): без выбора КП и без «Новый акт»', async () => {
  const el = mount(setup(['planfact.ks2.view'], { canEdit: false }));
  await tick(); await tick();
  assert.equal(el.querySelector('[data-testid="k2-contract-select"]'), null);
  assert.equal(el.querySelector('[data-testid="k2-new"]'), null);
  assert.match(txt(el, '[data-testid="k2-contract"]'), /Смета «Альфа» · ред\. 1/);
});

test('новый акт за период по первой дате: работа 10, материал 10 × 9 = 90, цены из КП, итог', async () => {
  const s = setup();
  const el = mount(s);
  await tick(); await tick();
  assert.equal(el.querySelector('[data-testid="k2-new-no"]')?.value, undefined); // форма ещё закрыта
  await newAct(el, '2026-10-01', '2026-10-10');
  assert.ok(el.querySelector('[data-testid="k2-act"]'));
  assert.match(txt(el, '.k2-act-title'), /Акт № 1/);
  const w = row(el, 12), m = row(el, 13);
  assert.ok(w && m, 'строки 12 и 13 есть');
  assert.equal(row(el, 14), null, 'строка без факта не показывается');
  assert.equal(txt(w, '.k2-c-sys'), '10');
  assert.equal(w.querySelector('[data-testid="k2-qty"]').value, '10');
  assert.equal(w.querySelector('[data-testid="k2-price"]').value, '300');
  assert.equal(txt(m, '.k2-c-sys'), '90');
  assert.equal(m.querySelector('[data-testid="k2-price"]').value, '12,5');
  assert.match(txt(el, '[data-testid="k2-total"]'), /4\s?125,00/); // 10 × 300 + 90 × 12,5
});

test('правка объёма и цены: отметка «правка ПТО», сумма пересчитана, сохранение — редакция 1 с предложением рядом', async () => {
  const s = setup();
  const el = mount(s);
  await tick(); await tick();
  await newAct(el, '2026-10-01', '2026-10-10');
  const w = row(el, 12);
  typeIn(w.querySelector('[data-testid="k2-qty"]'), '9,5'); await tick();
  assert.ok(row(el, 12).classList.contains('k2-row--edited'));
  assert.match(txt(row(el, 12), '.k2-c-sum'), /2\s?850,00/);
  typeIn(el.querySelector('[data-field="contract_no"]'), 'Д-17/26'); await tick();
  el.querySelector('[data-testid="k2-save"]').click(); await tick(); await tick();
  assert.match(txt(el, '[data-testid="k2-notice"]'), /Сохранена редакция 1/);
  const rev = s.acts[0].revs[0];
  const r12 = rev.snapshot.rows.find((r: N) => r.row_no === 12)!;
  assert.equal(r12.sys_qty, 10); assert.equal(r12.qty, 9.5);
  assert.equal(rev.snapshot.header.contract_no, 'Д-17/26');
  assert.ok(row(el, 12).classList.contains('k2-row--edited'), 'после перезагрузки правка видна');
  // «Как система» возвращает предложение
  row(el, 12).querySelector('[data-testid="k2-reset"]').click(); await tick();
  assert.equal(row(el, 12).querySelector('[data-testid="k2-qty"]').value, '10');
  // исключение строки
  row(el, 13).querySelector('[data-testid="k2-exclude"]').click(); await tick();
  assert.ok(row(el, 13).classList.contains('k2-row--excluded'));
  assert.match(txt(el, '[data-testid="k2-total"]'), /3\s?000,00/);
});

test('сведение строк: правки ПТО по source_row_id, шапка из редакции, номер и период — из акта', () => {
  const d: N = { act: { id: 'a1', project_id: 'p', act_no: '7', act_date: '2026-10-31', period_from: '2026-10-01', period_to: '2026-10-31', status: 'draft', kp_revision_id: 'k', annul_reason: null },
    requisites: { customer: 'старый' },
    proposal: [{ source_row_id: 'x', import_id: 'i', row_no: 1, number: null, name: 'А', unit_text: null, kind: 'work', total_qty: 5, prev_qty: 0, sys_qty: 5, price: 2 },
               { source_row_id: 'y', import_id: 'i', row_no: 2, number: '2', name: 'Б', unit_text: 'м2', kind: 'work', total_qty: 3, prev_qty: 1, sys_qty: 2, price: null }],
    last_revision: { id: 'r', revision_no: 1, total: 0, created_at: '', snapshot: { header: { customer: 'новый', act_no: '1' }, rows: [{ source_row_id: 'x', qty: 4, price: 3, excluded: false }, { source_row_id: 'z', qty: 9, price: 9, excluded: false }] } } };
  const rows = actRowsOf(d);
  assert.deepEqual(rows.map((r) => [r.source_row_id, r.qty, r.price, r.sys_qty]), [['x', 4, 3, 5], ['y', 2, null, 2]]);
  assert.equal(rows[0].unit, '');
  const h = actHeader(d);
  assert.equal(h.customer, 'новый'); assert.equal(h.act_no, '7'); assert.equal(h.period_from, '2026-10-01');
  d.proposal = null;
  assert.deepEqual(actRowsOf(d).map((r) => r.source_row_id), ['x', 'z'], 'выданный акт — снимок как есть');
});

// --- Этап 4: редакции, скачивание, выдача, аннулирование (сценарий владельца до второго акта) ---
const { readWorkbook } = await import('../vor/xlsx-reader.ts');
function mountAct(s: any, saved: { bytes: Uint8Array; name: string }[]) {
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  const { Ks2Act } = s;
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(Ks2Act, { api: s.api, actId: s.actId, canEdit: true, onBack: () => {}, save: (b: Uint8Array, n: string) => saved.push({ bytes: b, name: n }) } as N)));
  return el as N;
}

test('сценарий: правка → сохранить → скачать → выдать → второй акт без выданного объёма → аннулировать', async () => {
  const s = setup();
  const { Ks2Act } = await import('../ks2/Ks2Act.ts');
  const saved: { bytes: Uint8Array; name: string }[] = [];
  const actId = (await s.api.createAct('pr1', '1', '2026-10-31', '2026-10-01', '2026-10-31') as N).value;
  const el = mountAct({ ...s, Ks2Act, actId }, saved);
  await tick(); await tick();
  assert.equal(el.querySelector('[data-testid="k2-download"]'), null, 'до сохранения скачать нельзя');
  assert.equal(el.querySelector('[data-testid="k2-issue"]'), null, 'до сохранения выдать нельзя');
  typeIn(row(el, 12).querySelector('[data-testid="k2-qty"]'), '12'); await tick();
  typeIn(el.querySelector('[data-field="contract_no"]'), 'Д-17/26'); await tick();
  el.querySelector('[data-testid="k2-save"]').click(); await tick(); await tick();
  assert.ok(!el.querySelector('[data-testid="k2-download"]').disabled);
  el.querySelector('[data-testid="k2-download"]').click(); await tick(); await tick(); await tick();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'КС-2 № 1 (ред. 1).xlsx');
  const flat = (await readWorkbook(saved[0].bytes)).sheets[0].rows.flat();
  assert.ok(flat.includes('Д-17/26') && flat.includes('Штукатурка стен «Альфа»'), 'в файле шапка и строки заказчика');
  assert.ok(flat.includes(12 * 300 + 135 * 12.5), 'итог в файле = 12 × 300 + 135 × 12,5');
  // несохранённая правка блокирует выдачу и скачивание
  typeIn(row(el, 12).querySelector('[data-testid="k2-qty"]'), '11'); await tick();
  assert.ok(el.querySelector('[data-testid="k2-issue"]').disabled && el.querySelector('[data-testid="k2-download"]').disabled);
  el.querySelector('[data-testid="k2-save"]').click(); await tick(); await tick();
  // история: 2 редакции, скачать первую
  el.querySelector('[data-testid="k2-history-btn"]').click(); await tick(); await tick();
  assert.equal(el.querySelectorAll('[data-testid="k2-history"] .k2-hrow').length, 2);
  el.querySelector('[data-revision="1"] [data-testid="k2-rev-download"]').click(); await tick(); await tick(); await tick();
  assert.equal(saved[1].name, 'КС-2 № 1 (ред. 1).xlsx');
  // выдать — с подтверждением
  el.querySelector('[data-testid="k2-issue"]').click(); await tick();
  assert.match(txt(el, '[data-testid="k2-issue-confirm"]'), /Выдать акт № 1 \(редакция 2\)/);
  el.querySelector('[data-testid="k2-issue-yes"]').click(); await tick(); await tick();
  assert.match(txt(el, '[data-testid="k2-notice"]'), /Акт выдан/);
  assert.equal(el.querySelector('[data-testid="k2-save"]'), null, 'выданный акт не правится');
  assert.equal(el.querySelector('[data-testid="k2-qty"]'), null);
  assert.equal(el.querySelector('[data-testid="k2-issue"]'), null, 'повторной выдачи нет');
  assert.equal(s.acts[0].status, 'issued');
  // второй акт: выданные 11 не попадают, остаток 15 − 11 = 4
  const a2 = (await s.api.createAct('pr1', '2', '2026-10-31', '2026-10-01', '2026-10-31') as N).value;
  const el2 = mountAct({ ...s, Ks2Act, actId: a2 }, saved);
  await tick(); await tick();
  assert.equal(txt(row(el2, 12), '.k2-c-prev'), '11');
  assert.equal(txt(row(el2, 12), '.k2-c-sys'), '4');
  // аннулировать первый — без причины нельзя, с причиной объём возвращается
  el.querySelector('[data-testid="k2-annul"]').click(); await tick();
  el.querySelector('[data-testid="k2-annul-yes"]').click(); await tick();
  assert.match(txt(el, '[role="alert"]'), /причину/);
  typeIn(el.querySelector('[data-testid="k2-annul-reason"]'), 'Заказчик не подписал'); await tick();
  el.querySelector('[data-testid="k2-annul-yes"]').click(); await tick(); await tick();
  assert.match(txt(el, '[data-testid="k2-notice"]'), /аннулирован/);
  assert.equal(s.acts[0].status, 'annulled');
  const el3 = mountAct({ ...s, Ks2Act, actId: a2 }, saved);
  await tick(); await tick();
  assert.equal(txt(row(el3, 12), '.k2-c-sys'), '15', 'после аннулирования весь факт снова доступен');
});

test('выдача без цены — понятный отказ сервера на экране', async () => {
  const f = makeFakeKs2(SRC, [...FACTS, { src: 's14', date: '2026-10-05', qty: 3 }]);
  const { Ks2Act } = await import('../ks2/Ks2Act.ts');
  const actId = (await f.api.createAct('pr1', '1', '2026-10-31', '2026-10-01', '2026-10-31') as N).value;
  const el = mountAct({ ...f, Ks2Act, actId }, []);
  await tick(); await tick();
  assert.ok(row(el, 14).classList.contains('k2-row--unpriced'));
  assert.match(txt(el, '[data-testid="k2-problems"]'), /Нет цены у 1/);
  el.querySelector('[data-testid="k2-save"]').click(); await tick(); await tick();
  el.querySelector('[data-testid="k2-issue"]').click(); await tick();
  el.querySelector('[data-testid="k2-issue-yes"]').click(); await tick(); await tick();
  assert.match(txt(el, '[role="alert"]'), /Нет цены/);
  assert.equal(f.acts[0].status, 'draft');
});

// --- Этап 5: свой бланк ---
const ExcelJS = (await import('exceljs')).default;
async function tplBytes(bad = false): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Акт');
  ws.getCell('A1').value = 'Акт № {акт_номер}, заказчик {заказчик}' + (bad ? ' {инн}' : '');
  ws.getRow(3).values = ['{№}', '{наименование}', '{количество}', '{стоимость}'];
  ws.getCell('D5').value = '{итого}';
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
function chooseFile(input: N, bytes: Uint8Array, name: string): void {
  const file = new win.File([bytes as N], name);
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
}
const until = async (f: () => boolean) => { for (let i = 0; i < 50 && !f(); i++) await tick(); };

test('бланк: неизвестная метка — список ошибок, на сервер не уходит; годный — загружен, виден, убирается', async () => {
  const s = setup();
  const el = mount(s);
  await tick(); await tick();
  assert.match(txt(el, '[data-testid="k2-template"]'), /не загружен/);
  assert.match(txt(el, '[data-testid="k2-template"]'), /\{наименование\}/, 'список меток на экране');
  chooseFile(el.querySelector('[data-testid="k2-tpl-file"]'), await tplBytes(true), 'бланк.xlsx');
  await until(() => !!el.querySelector('[data-testid="k2-tpl-errors"]'));
  assert.match(txt(el, '[data-testid="k2-tpl-errors"]'), /Неизвестные метки: \{инн\}/);
  assert.ok(!s.calls.includes('saveTemplate'));
  chooseFile(el.querySelector('[data-testid="k2-tpl-file"]'), new TextEncoder().encode('x'), 'бланк.pdf');
  await tick();
  assert.match(txt(el, '[data-testid="k2-tpl-errors"]'), /\.xlsx/);
  chooseFile(el.querySelector('[data-testid="k2-tpl-file"]'), await tplBytes(), 'Бланк заказчика.xlsx');
  await until(() => !!el.querySelector('[data-testid="k2-tpl-notice"]'));
  assert.match(txt(el, '[data-testid="k2-tpl-notice"]'), /загружен: лист «Акт», строка-образец 3/);
  await until(() => txt(el, '[data-testid="k2-template"] summary').includes('Бланк заказчика.xlsx'));
  assert.match(txt(el, '[data-testid="k2-template"] summary'), /Бланк заказчика\.xlsx/);
  el.querySelector('[data-testid="k2-tpl-clear"]').click();
  await until(() => txt(el, '[data-testid="k2-template"] summary').includes('не загружен'));
  assert.match(txt(el, '[data-testid="k2-template"] summary'), /не загружен/);
});

test('скачивание акта: бланк проекта (по умолчанию) или унифицированная форма', async () => {
  const s = setup();
  await s.api.saveTemplate('pr1', 'Бланк.xlsx', (await import('../ks2/template.ts')).toBase64(await tplBytes()));
  const { Ks2Act } = await import('../ks2/Ks2Act.ts');
  const saved: { bytes: Uint8Array; name: string }[] = [];
  const actId = (await s.api.createAct('pr1', '5', '2026-10-31', '2026-10-01', '2026-10-31') as N).value;
  await s.api.save(actId, { ...(await import('../ks2/form.ts')).emptyKs2Header(), customer: 'АО «Бета»', act_no: '5' }, [], '');
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(Ks2Act, { api: s.api, actId, canEdit: true, hasTemplate: true, onBack: () => {}, save: (b: Uint8Array, n: string) => saved.push({ bytes: b, name: n }) } as N)));
  await tick(); await tick();
  assert.equal((el as N).querySelector('[data-testid="k2-form-template"]').getAttribute('aria-selected'), 'true');
  (el as N).querySelector('[data-testid="k2-download"]').click();
  await until(() => saved.length === 1);
  const a = new ExcelJS.Workbook(); await a.xlsx.load(saved[0].bytes as unknown as ArrayBuffer);
  const ws = a.getWorksheet('Акт')!;
  assert.equal(ws.getCell('A1').value, 'Акт № 5, заказчик АО «Бета»');
  assert.equal(ws.getCell('B3').value, 'Штукатурка стен «Альфа»'); assert.equal(ws.getCell('B4').value, 'Смесь «Бета»');
  assert.equal(ws.getCell('D6').value, 15 * 300 + 135 * 12.5, 'итог сдвинут на 1 строку');
  (el as N).querySelector('[data-testid="k2-form-unified"]').click(); await tick();
  (el as N).querySelector('[data-testid="k2-download"]').click();
  await until(() => saved.length === 2);
  const flat = (await readWorkbook(saved[1].bytes)).sheets[0].rows.flat();
  assert.ok(flat.includes('0322005'), 'унифицированная форма');
});
