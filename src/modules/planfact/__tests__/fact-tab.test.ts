/// <reference types="node" />
/** Экран «Факт» (P2-0007, этапы 3–6) на подставном сервере (правила миграции 009): навигация по местам, ввод, % сразу, ошибки полей,
 *  история и исправление, перебор → подтверждение РП, «закрыть этаж целиком». Наименования вымышленные. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { makeFakeFact } from './fact-fake.ts';
import type { FakePos } from './fact-fake.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { FactTab } = await import('../fact/FactTab.ts');
const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const POS: FakePos[] = [
  { id: 'p5', ancestors: ['b1', 'f5'], location_id: 'f5', location_path: 'Корпус 1 · 5 этаж', location_type: 'floor', work: 'Штукатурка стен', unit: 'м²', plan: 100 },
  { id: 'pk', ancestors: ['b1', 'f5', 'kv1'], location_id: 'kv1', location_path: 'Корпус 1 · 5 этаж · Кв. 1', location_type: 'apartment', work: 'Окраска стен', unit: 'м²', plan: 20 },
  { id: 'p6', ancestors: ['b1', 'f6'], location_id: 'f6', location_path: 'Корпус 1 · 6 этаж', location_type: 'floor', work: 'Штукатурка стен', unit: 'м²', plan: 50 }];
const NODES: Record<string, any[]> = {
  root: [{ id: 'b1', parent_id: null, node_type: 'building', name: 'Корпус 1', path: 'Корпус 1', depth: 1, child_count: 2 }],
  b1: [{ id: 'f5', parent_id: 'b1', node_type: 'floor', name: '5 этаж', path: 'Корпус 1 · 5 этаж', depth: 2, child_count: 1 }, { id: 'f6', parent_id: 'b1', node_type: 'floor', name: '6 этаж', path: 'Корпус 1 · 6 этаж', depth: 2, child_count: 0 }],
  f5: [{ id: 'kv1', parent_id: 'f5', node_type: 'apartment', name: 'Кв. 1', path: 'Корпус 1 · 5 этаж · Кв. 1', depth: 3, child_count: 0 }]
};
const FOREMAN = ['planfact.fact.view', 'planfact.fact.create'];
const PM = ['planfact.fact.view', 'planfact.fact.approve'];

function setup(perms = FOREMAN, me = 'foreman@test.invalid') {
  const f = makeFakeFact(POS, { me });
  f.brigades.push({ id: 'b1', name: 'Иванов', leader_name: null, phone: null, archived_at: null, can_manage: true }, { id: 'b2', name: 'Петров', leader_name: null, phone: null, archived_at: null, can_manage: true });
  const vor = { async listProjects() { return [{ id: 'pr1', name: 'ЖК Тест', company_id: 'c1' }]; }, async permissions() { return perms; } } as any;
  const projects = { async listLocations(_p: string, parent: string | null) { return NODES[parent || 'root'] || []; } } as any;
  return { ...f, vor, projects };
}
function mount(s: any, me = 'foreman@test.invalid', extra: Record<string, unknown> = {}) {
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(FactTab, { api: s.api, vor: s.vor, projects: s.projects, me, ...extra } as N)));
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
const card = (el: N, id: string) => el.querySelector(`[data-position-id="${id}"]`);
/** P2-0022: форма ввода — в окне факта (как в «Шахматке»), а не в карточке. */
const winForm = (el: N) => el.querySelector('[data-testid="ft-win"] [data-testid="ft-form"]');
async function toFloor5(el: N) {
  await tick();
  el.querySelector('[data-location-id="b1"]').click(); await tick(); await tick();
  el.querySelector('[data-location-id="f5"]').click(); await tick(); await tick();
}
async function enter(el: N, id: string, qty: string, brigade = 'b1') {
  card(el, id).querySelector('[data-testid="ft-enter"]').click(); await tick();
  const form = winForm(el);
  typeIn(form.querySelector('[name="qty"]'), qty); pick(form.querySelector('[name="brigade"]'), brigade); await tick();
  submit(form); await tick(); await tick();
}

test('ввод факта: этаж → работы этажа и квартиры с 0 %, 10 → 10 %, повторный ввод суммируется, ошибки полей', async () => {
  const s = setup();
  const el = mount(s);
  await toFloor5(el);
  assert.equal(el.querySelectorAll('[data-position-id]').length, 2, 'работы этажа и вложенной квартиры');
  assert.match(card(el, 'p5').querySelector('[data-testid="ft-pct"]').textContent, /^0 %$/);
  assert.match(card(el, 'pk').textContent, /Кв\. 1/, 'место квартиры подписано');
  assert.doesNotMatch(card(el, 'p5').querySelector('.ft-place')?.textContent || '', /Корпус/, 'свой этаж в подписи не повторяется');

  card(el, 'p5').querySelector('[data-testid="ft-enter"]').click(); await tick();
  let form = winForm(el);
  submit(form); await tick();
  assert.match(form.textContent, /Введите объём/);
  typeIn(form.querySelector('[name="qty"]'), '10'); submit(form); await tick();
  assert.match(form.textContent, /Выберите бригаду/);
  assert.equal(s.calls.filter((c: any) => c.fn === 'add').length, 0, 'без бригады на сервер не уходит');
  typeIn(form.querySelector('[name="qty"]'), '0'); pick(form.querySelector('[name="brigade"]'), 'b1'); submit(form); await tick();
  assert.match(form.textContent, /Введите объём/);
  typeIn(form.querySelector('[name="qty"]'), '10'); await tick();
  assert.match(form.querySelector('[data-testid="ft-after"]').textContent, /10 %/, 'прогноз до записи');
  submit(form); await tick(); await tick();
  assert.match(card(el, 'p5').querySelector('[data-testid="ft-nums"]').textContent, /факт 10 из 100 м²/);
  assert.equal(card(el, 'p5').querySelector('[data-testid="ft-pct"]').textContent, '10 %');
  assert.match(el.querySelector('[data-testid="ft-notice"]').textContent, /Записано: 10/);
  assert.equal((s.calls.find((c: any) => c.fn === 'add')!.args as any).brigadeId, 'b1');

  await enter(el, 'p5', '12,5');
  assert.equal(card(el, 'p5').querySelector('[data-testid="ft-pct"]').textContent, '22,5 %');
  card(el, 'p5').querySelector('[data-testid="ft-enter"]').click(); await tick();
  form = winForm(el);
  assert.equal(form.querySelector('[name="brigade"]').value, 'b1', 'бригада — последняя выбранная');
});

test('история и исправление: 10 → 8 с причиной — обе записи видны; без причины — отказ; отмена записи', async () => {
  const s = setup();
  const el = mount(s);
  await toFloor5(el);
  await enter(el, 'p5', '10');
  card(el, 'p5').querySelector('[data-testid="ft-history-btn"]').click(); await tick(); await tick();
  const hist = () => el.querySelector('[data-testid="ft-history"]');
  assert.equal(hist().querySelectorAll('[data-entry-id]').length, 1);
  hist().querySelector('[data-testid="ft-correct"]').click(); await tick();
  const form = hist().querySelector('[data-testid="ft-correct-form"]');
  typeIn(form.querySelector('[name="qty"]'), '8'); submit(form); await tick();
  assert.match(hist().textContent, /Укажите причину/);
  typeIn(form.querySelector('[name="reason"]'), 'ошиблись при замере'); submit(form); await tick(); await tick();
  assert.equal(hist().querySelectorAll('[data-entry-id]').length, 2, 'в истории обе записи');
  assert.ok(hist().querySelector('[data-status="superseded"]'));
  assert.match(hist().textContent, /ошиблись при замере/);
  assert.equal(card(el, 'p5').querySelector('[data-testid="ft-pct"]').textContent, '8 %');
  hist().querySelector('[data-testid="ft-correct"]').click(); await tick();
  const f2 = hist().querySelector('[data-testid="ft-correct-form"]');
  typeIn(f2.querySelector('[name="reason"]'), 'внесено ошибочно');
  hist().querySelector('[data-testid="ft-correct-cancel"]').click(); await tick(); await tick();
  assert.equal(card(el, 'p5').querySelector('[data-testid="ft-pct"]').textContent, '0 %');
  assert.equal(hist().querySelectorAll('[data-entry-id]').length, 2, 'после отмены запись остаётся в истории');
});

test('чужую запись прораб не исправляет (кнопки нет), РП — может', async () => {
  const s = setup(FOREMAN, 'foreman@test.invalid');
  const el = mount(s, 'other@test.invalid');
  await toFloor5(el);
  await enter(el, 'p5', '10');
  s.entries[0].created_by_email = 'someone@test.invalid';
  card(el, 'p5').querySelector('[data-testid="ft-history-btn"]').click(); await tick(); await tick();
  assert.equal(el.querySelector('[data-testid="ft-correct"]'), null, 'прораб: чужая запись без «Исправить»');
  const pm = setup(PM); pm.entries.push({ id: 'ex', position_id: 'p5', status: 'accepted', qty: 10, work_date: '2026-10-21', brigade_name: 'Иванов', workers: null, man_hours: null, note: null, corrects_id: null, correction_reason: null, batch_id: null, created_by_email: 'foreman@test.invalid', created_at: '2026-10-21T10:00:00Z', decided_by_email: null, decided_at: null, decision_note: null } as any);
  const el2 = mount(pm, 'pm@test.invalid');
  await toFloor5(el2);
  assert.equal(card(el2, 'p5').querySelector('[data-testid="ft-enter"]'), null, 'РП без fact.create не вносит факт');
  card(el2, 'p5').querySelector('[data-testid="ft-history-btn"]').click(); await tick(); await tick();
  assert.ok(el2.querySelector('[data-testid="ft-correct"]'), 'РП исправляет чужую запись');
});

test('перебор плана → ждёт РП (в итог не входит) → подтверждение / отказ с причиной', async () => {
  const s = setup();
  const el = mount(s);
  await toFloor5(el);
  await enter(el, 'p5', '10');
  await enter(el, 'p5', '95');
  assert.match(el.querySelector('[data-testid="ft-notice"]').textContent, /ждёт подтверждения РП/);
  assert.equal(card(el, 'p5').querySelector('[data-testid="ft-pct"]').textContent, '10 %', 'неподтверждённый перебор в % не входит');
  assert.match(card(el, 'p5').querySelector('[data-testid="ft-pending-badge"]').textContent, /Ждёт подтверждения РП: 95/);

  const pm = { ...s, vor: { async listProjects() { return [{ id: 'pr1', name: 'ЖК Тест', company_id: 'c1' }]; }, async permissions() { return PM; } } };
  // P2-0020: очередь РП — подвкладка «Ждёт подтверждения» (реестр); решение по одной записи — в карточке
  let count: number | null = -1;
  const el2 = mount(pm, 'pm@test.invalid', { mode: 'pending', onApprove: (n: number | null) => { count = n; } });
  await tick(); await tick();
  assert.equal(count, 1, 'счётчик подвкладки «Ждёт подтверждения»');
  assert.equal(el2.querySelectorAll('[data-testid="fp-table"] tr[data-row]').length, 1);
  el2.querySelector('[data-testid="p2-reg-open"]').click(); await tick(); await tick();
  el2.querySelector('[data-testid="ft-reject"]').click(); await tick();
  el2.querySelector('[data-testid="ft-reject-yes"]').click(); await tick();
  assert.match(el2.querySelector('[data-testid="ft-decide"] [role="alert"]').textContent, /причину отказа/, 'отказ без причины не проходит');
  typeIn(el2.querySelector('[data-testid="ft-reject-note"]'), 'лишний объём'); await tick();
  el2.querySelector('[data-testid="ft-reject-yes"]').click(); await tick(); await tick();
  assert.ok(el2.querySelector('[data-testid="p2-reg-empty"]'));
  assert.equal(count, 0, 'счётчик обновился после решения');
  // прораб видит причину отказа
  const el3 = mount(s);
  await toFloor5(el3);
  assert.match(card(el3, 'p5').querySelector('[data-testid="ft-rejected"]').textContent, /лишний объём/);
  // новый перебор → подтверждение
  await enter(el3, 'p5', '95');
  const el4 = mount(pm, 'pm@test.invalid', { mode: 'pending' });
  await tick(); await tick();
  el4.querySelector('[data-testid="p2-reg-open"]').click(); await tick(); await tick();
  el4.querySelector('[data-testid="ft-approve"]').click(); await tick(); await tick();
  const el5 = mount(pm, 'pm@test.invalid');
  await toFloor5(el5);
  assert.equal(card(el5, 'p5').querySelector('[data-testid="ft-pct"]').textContent, '105 %', 'после подтверждения вошёл в итог');
});

test('закрыть этаж целиком: остатки этажа и квартиры, правка строки и снятая галочка, одна пачка, этаж 100 % (кроме снятой)', async () => {
  const s = setup();
  const el = mount(s);
  await toFloor5(el);
  await enter(el, 'p5', '10');
  el.querySelector('[data-testid="ft-close-open"]').click(); await tick();
  const rows = () => el.querySelectorAll('[data-testid="ft-close-rows"] [data-position-id]');
  assert.equal(rows().length, 2);
  const q = (id: string) => el.querySelector(`[data-testid="ft-close-rows"] [data-position-id="${id}"] [data-testid="ft-close-qty"]`);
  assert.equal(q('p5').value, '90', 'остаток этажа: 100 − 10');
  assert.equal(q('pk').value, '20', 'остаток квартиры');
  assert.match(el.querySelector('[data-testid="ft-close-total"]').textContent, /2 из 2 строк.*110/);

  assert.equal(el.querySelector('[data-testid="ft-close-brigade"]').value, 'b1', 'бригада — последняя выбранная');
  pick(el.querySelector('[data-testid="ft-close-brigade"]'), ''); await tick();
  el.querySelector('[data-testid="ft-close-send"]').click(); await tick();
  assert.match(el.querySelector('[data-testid="ft-close"] [role="alert"]').textContent, /Выберите бригаду/);
  pick(el.querySelector('[data-testid="ft-close-brigade"]'), 'b2'); await tick();
  typeIn(q('p5'), '80'); await tick();
  el.querySelector('[data-testid="ft-close-rows"] [data-position-id="pk"] [data-testid="ft-close-on"]').click(); await tick();
  assert.match(el.querySelector('[data-testid="ft-close-total"]').textContent, /1 из 2 строк/);
  el.querySelector('[data-testid="ft-close-send"]').click(); await tick(); await tick();
  const batch = s.calls.find((c: any) => c.fn === 'addBatch')!.args as any;
  assert.deepEqual(batch.items, [{ position_id: 'p5', qty: 80 }]);
  assert.equal(batch.brigadeId, 'b2');
  assert.match(el.querySelector('[data-testid="ft-notice"]').textContent, /Записано строк: 1/);
  assert.equal(card(el, 'p5').querySelector('[data-testid="ft-pct"]').textContent, '90 %');
  assert.equal(card(el, 'pk').querySelector('[data-testid="ft-pct"]').textContent, '0 %', 'снятая строка не записана');

  // режим «на X %» и перебор в пачке уходит на подтверждение отдельной строкой
  el.querySelector('[data-testid="ft-close-open"]').click(); await tick();
  assert.equal(q('p5').value, '10', 'остаток этажа после первой пачки: 100 − 90');
  el.querySelector('[data-testid="ft-mode-pct"]').click(); await tick();
  typeIn(el.querySelector('[data-testid="ft-pct"]'), '50'); await tick();
  assert.equal(q('pk').value, '10');
  assert.equal(q('p5').value, '50');
  assert.ok(el.querySelector('[data-position-id="p5"] .ft-warn'), 'строка сверх плана помечена');
  pick(el.querySelector('[data-testid="ft-close-brigade"]'), 'b1'); await tick();
  el.querySelector('[data-testid="ft-close-send"]').click(); await tick(); await tick();
  assert.match(el.querySelector('[data-testid="ft-notice"]').textContent, /Записано строк: 2, из них ждут подтверждения РП: 1/);
  assert.equal(new Set(s.entries.filter((e: any) => e.batch_id).map((e: any) => e.batch_id)).size, 2, 'каждая отправка — своя пачка');
});

test('нет права на факт — понятное сообщение; пустой этаж; роль без ввода не видит «Внести»', async () => {
  const none = setup([]);
  const el = mount(none);
  await tick();
  assert.ok(el.querySelector('[data-testid="ft-noaccess"]'));
  const s = setup(['planfact.fact.view']);
  const el2 = mount(s);
  await tick();
  el2.querySelector('[data-location-id="b1"]').click(); await tick(); await tick();
  el2.querySelector('[data-location-id="f6"]').click(); await tick(); await tick();
  assert.equal(el2.querySelector('[data-testid="ft-enter"]'), null);
  assert.equal(el2.querySelector('[data-testid="ft-close-open"]'), null);
  assert.ok(card(el2, 'p6').querySelector('[data-testid="ft-history-btn"]'));
});

// P2-0022: «Ввод» открывает то же окно, что «Шахматка»; «День / Период».
const sel = (root: N, q: string) => root.querySelector(q);
function setDate(input: N, value: string): void { typeIn(input, value); input.dispatchEvent(new win.Event('change', { bubbles: true })); }
const isoShift = (d: string, n: number): string => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

test('P2-0022: «Внести факт» в «Вводе» — окно как в шахматке: «Внесено / Осталось», плитки, −/+, «День / Период», История; закрывается', async () => {
  const s = setup();
  const el = mount(s);
  await toFloor5(el);
  assert.equal(sel(el, '[data-testid="ft-win"]'), null, 'окна нет до нажатия');
  card(el, 'p5').querySelector('[data-testid="ft-enter"]').click(); await tick(); await tick();
  const w = sel(el, '[data-testid="ft-win"]');
  assert.ok(w, 'окно открыто');
  assert.equal(w.getAttribute('role'), 'dialog');
  assert.equal(card(el, 'p5').querySelector('[data-testid="ft-form"]'), null, 'формы в карточке больше нет');
  assert.match(w.textContent, /Штукатурка стен/);
  assert.match(sel(w, '[data-testid="ft-quick-sum"]').textContent, /Внесено 0 м².*Осталось 100 м²/);
  assert.equal(w.querySelectorAll('[data-testid="ft-steps"] .ft-step').length, 4, 'плитки 25/50/75/100 %');
  sel(w, '[data-pct="50"]').click(); await tick();
  assert.equal(sel(w, '[name="qty"]').value, '50', 'плитка «до 50 %» → 50');
  sel(w, '[data-testid="ft-plus"]').click(); await tick();
  assert.equal(sel(w, '[name="qty"]').value, '51');
  assert.ok(sel(w, '[data-testid="ft-mode-day"]').className.includes('pf-seg-btn--active'), 'по умолчанию — «День»');
  assert.equal(sel(w, '[name="date_from"]'), null);
  assert.match(sel(w, '[data-testid="ft-quick-history"]').textContent, /История \(0\)/);
  sel(w, '[data-testid="ft-quick-history"]').click(); await tick();
  assert.ok(sel(el, '[data-testid="ft-win"] [data-testid="ft-history-close"]'), 'история — в том же окне');
  sel(el, '[data-testid="ft-history-close"]').click(); await tick();
  assert.ok(sel(el, '[data-testid="ft-win"] [data-testid="ft-form"]'), 'назад к форме');
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick();
  assert.equal(sel(el, '[data-testid="ft-win"]'), null, 'Esc закрывает');
  card(el, 'p5').querySelector('[data-testid="ft-enter"]').click(); await tick();
  sel(el, '[data-testid="ft-win-backdrop"]').click(); await tick();
  assert.equal(sel(el, '[data-testid="ft-win"]'), null, 'нажатие мимо окна закрывает');
});

test('P2-0022: «Период» — «с … по …», проверки дат до сервера, одна запись с началом периода; история и журнал — «за период»', async () => {
  const s = setup();
  const el = mount(s);
  await toFloor5(el);
  card(el, 'p5').querySelector('[data-testid="ft-enter"]').click(); await tick(); await tick();
  const form = winForm(el);
  sel(form, '[data-testid="ft-mode-period"]').click(); await tick();
  assert.ok(sel(form, '[data-testid="ft-mode-period"]').className.includes('pf-seg-btn--active'));
  assert.ok(sel(form, '[name="date_from"]'), 'поле «С»');
  assert.match(form.textContent, /По/);
  const today = sel(form, '[name="date"]').value;
  typeIn(sel(form, '[name="qty"]'), '28'); pick(sel(form, '[name="brigade"]'), 'b1'); await tick();
  submit(form); await tick();
  assert.match(form.textContent, /начало и конец периода/, 'без «с» — отказ');
  setDate(sel(form, '[name="date_from"]'), isoShift(today, 1)); submit(form); await tick();
  assert.match(form.textContent, /позже конца|в будущем/);
  setDate(sel(form, '[name="date_from"]'), isoShift(today, -31)); submit(form); await tick();
  assert.match(form.textContent, /не больше 31 дня/);
  assert.equal(s.calls.filter((c: any) => c.fn === 'add').length, 0, 'с ошибкой периода на сервер не уходит');
  setDate(sel(form, '[name="date_from"]'), isoShift(today, -13)); submit(form); await tick(); await tick();
  const add = s.calls.find((c: any) => c.fn === 'add')!.args as any;
  assert.equal(add.periodFrom, isoShift(today, -13), 'начало периода — на сервер');
  assert.equal(add.date, today, 'конец периода — дата работ');
  assert.equal(add.qty, 28, 'общий объём — одной записью');
  assert.equal(sel(el, '[data-testid="ft-win"]'), null, 'после записи окно закрыто');
  const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  assert.match(sel(el, '[data-testid="ft-notice"]').textContent, new RegExp(`Записано: 28 м² за период ${dm(isoShift(today, -13)).replace('.', '\\.')}`));
  assert.match(card(el, 'p5').querySelector('[data-testid="ft-nums"]').textContent, /факт 28 из 100/);
  // История позиции
  card(el, 'p5').querySelector('[data-testid="ft-history-btn"]').click(); await tick(); await tick();
  assert.match(sel(el, '[data-testid="ft-hdate"]').textContent, new RegExp(`за период ${dm(isoShift(today, -13)).replace('.', '\\.')}–${dm(today).replace('.', '\\.')}`));
  // Обычная запись «День» — без периода
  await enter(el, 'p5', '2');
  const second = s.calls.filter((c: any) => c.fn === 'add')[1].args as any;
  assert.equal(second.periodFrom, undefined, '«День» — без периода (вызов как до 030)');
});
