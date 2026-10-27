/// <reference types="node" />
/** P2-0048 этап 5: «моя область» в План/Факте — плашка, «В вашей области нет позиций», «За кого» у РП, «внёс … за …» в истории.
 *  Сервер — подставной (AreaApi / FactApi); правила области и отказы — на сервере (047), здесь только показ. Имена вымышленные. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const A = await import('../area.ts');
const { FactEntryForm } = await import('../fact/FactEntryForm.ts');
const { FloorClose } = await import('../fact/FloorClose.ts');
const { historyItem } = await import('../fact/factStatus.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const IV = { user_id: 'u-iv', full_name: 'Иванов А. И.', email: 'ivanov@test.invalid' };
const PE = { user_id: 'u-pe', full_name: 'Петров П. П.', email: 'petrov@test.invalid' };
const RP = 'rp@test.invalid';

function areaApi(area: Record<string, unknown> | null, owners: Record<string, typeof IV[]>, paths: Record<string, string> = {}): N {
  return {
    myArea: async () => (area ? A.normArea(area) : null),
    locationPath: async (l: string) => paths[l] || null,
    placeOwners: async (l: string) => (area && area.can_on_behalf ? { ok: true, value: owners[l] || [] } : { ok: false, message: 'Нет права вносить факт «за кого»' }),
  };
}
const pos = (id: string, loc: string): N => ({ position_id: id, location_id: loc, location_path: 'Корпус 1 · ' + loc, location_type: 'floor', work_type_id: 'w', work_name: 'Штукатурка ' + id,
  unit_code: 'м²', plan_qty: 100, fact_qty: 0, pending_qty: 0, pending_count: 0, last_rejected_note: null });
function fakeFact(): N {
  const calls: N[] = [];
  return { calls, api: { add: async (p: string, e: N) => { calls.push({ fn: 'add', p, e }); return { ok: true, value: { id: 'e1', status: 'accepted' } }; },
    addBatch: async (b: N) => { calls.push({ fn: 'addBatch', b }); return { ok: true, value: { batch_id: 'b1', accepted: b.items.length, pending: 0 } }; } } };
}
function mount(el: N): { root: N; div: N } {
  const div = document.createElement('div'); document.body.appendChild(div);
  const root = createRoot(div as N); flushSync(() => root.render(el)); return { root, div };
}
const BR = [{ id: 'br1', name: 'Бригада 1', leader_name: null, phone: null, archived_at: null, can_manage: true }];
function setInput(el: N, v: string): void {
  const proto = Object.getPrototypeOf(el); const d = Object.getOwnPropertyDescriptor(proto, 'value'); d!.set!.call(el, v);
  el.dispatchEvent(new (win as N).Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

test('область: путь — общий префикс один раз; часть / весь проект; пустой список', () => {
  assert.equal(A.areaText(['Корпус 1 · Секция 1', 'Корпус 1 · Секция 2']), 'Корпус 1 · Секция 1, Секция 2');
  assert.equal(A.areaText(['Корпус 1 · Секция 3']), 'Корпус 1 · Секция 3');
  assert.equal(A.areaText(['Корпус 1 · Секция 1', 'Паркинг']), 'Корпус 1 · Секция 1, Паркинг');
  const part = A.normArea({ full: false, locations: ['s1'], fact_owner: [], can_on_behalf: false });
  assert.equal(A.isPartial(part), true);
  assert.equal(A.isPartial(A.normArea({ full: true, locations: [], fact_owner: ['project'], can_on_behalf: true })), false);
  assert.equal(A.emptyText(part, 'Нет работ'), 'В вашей области нет позиций.');
  assert.equal(A.emptyText(null, 'Нет работ'), 'Нет работ');
});

test('«за кого»: нет ответственных или я сам — как обычно; один ответственный — выбрать; смешанная пачка — разделить', () => {
  assert.deepEqual(A.onBehalfPlan([[], []], RP), { kind: 'none' });
  assert.deepEqual(A.onBehalfPlan([[{ ...IV, email: RP }]], RP), { kind: 'none' });
  assert.deepEqual(A.onBehalfPlan([[IV], [IV, PE]], RP), { kind: 'pick', owners: [IV] });
  assert.equal(A.onBehalfPlan([[IV], []], RP).kind, 'split');
  assert.equal(A.onBehalfPlan([[IV], [PE]], RP).kind, 'split');
});

test('история: «внёс РП за Иванова» (имя — из загруженных ответственных, иначе почта); у самого ответственного — «за вас»', async () => {
  A.setAreaService(areaApi({ full: true, locations: [], fact_owner: [], can_on_behalf: true }, { s1: [IV] }));
  assert.equal(A.authorText(RP, IV.email, ''), `внёс ${RP} за ${IV.email}`);
  await A.loadOwners('s1');
  assert.equal(A.authorText(RP, IV.email, ''), `внёс ${RP} за Иванов А. И.`);
  assert.equal(A.authorText(RP, IV.email, IV.email), `внёс ${RP} за вас`);
  assert.equal(A.authorText(RP, null, ''), RP);
  const row: N = { id: 'e', status: 'accepted', qty: 5, work_date: '2026-10-20', brigade_name: 'Б', workers: null, man_hours: null, note: null, corrects_id: null, correction_reason: null,
    batch_id: null, created_by_email: RP, created_at: '2026-10-20T10:00:00Z', decided_by_email: null, decided_at: null, decision_note: null, on_behalf_email: IV.email };
  assert.equal(historyItem(row, 'м²').who, `внёс ${RP} за Иванов А. И.`);
});

test('плашка: часть проекта — «Ваша область: …» и «вы отвечаете за факт»; весь проект — плашки нет', async () => {
  A.setAreaService(areaApi({ full: false, locations: ['s1', 's2'], fact_owner: ['s1', 's2'], can_on_behalf: false }, {}, { s1: 'Корпус 1 · Секция 1', s2: 'Корпус 1 · Секция 2' }));
  const m = mount(createElement(A.AreaBadge, { projectId: 'pa' }));
  await settle();
  const el = m.div.querySelector('[data-testid="pf-area"]');
  assert.ok(el, 'плашка есть');
  assert.match(el.textContent, /Ваша область: Корпус 1 · Секция 1, Секция 2/);
  assert.ok(m.div.querySelector('[data-testid="pf-area-owner"]'));
  m.root.unmount();
  A.setAreaService(areaApi({ full: true, locations: [], fact_owner: [], can_on_behalf: true }, {}));
  const m2 = mount(createElement(A.AreaBadge, { projectId: 'pa' }));
  await settle();
  assert.equal(m2.div.querySelector('[data-testid="pf-area"]'), null);
  m2.root.unmount();
});

test('ввод факта РП по месту с ответственным: без «за кого» — подсказка до отправки; с выбором — pf_fact_add_for (onBehalf)', async () => {
  A.setAreaService(areaApi({ full: true, locations: [], fact_owner: [], can_on_behalf: true }, { s1: [IV, PE] }));
  const f = fakeFact();
  let saved = '';
  const m = mount(createElement(FactEntryForm, { api: f.api, pos: pos('p1', 's1'), brigades: BR, lastBrigade: 'br1', onBrigade: () => {}, onCancel: () => {}, onSaved: (s: string) => { saved = s; },
    projectId: 'pa', me: RP }));
  await settle();
  const sel = m.div.querySelector('[data-testid="ft-behalf-select"]');
  assert.ok(sel, 'поле «За кого» есть');
  assert.deepEqual(Array.from(sel.querySelectorAll('option')).map((o: N) => o.textContent).slice(1), ['Иванов А. И.', 'Петров П. П.']);
  setInput(m.div.querySelector('[data-testid="ft-qty"]'), '5');
  m.div.querySelector('[data-testid="ft-save"]').click();
  await settle();
  assert.match(m.div.querySelector('[role="alert"]').textContent, /Укажите, за кого вносите/);
  assert.equal(f.calls.length, 0, 'без выбора на сервер не ушло');
  setInput(sel, 'u-iv');
  m.div.querySelector('[data-testid="ft-save"]').click();
  await settle();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].e.onBehalf, 'u-iv');
  assert.match(saved, /Записано/);
  m.root.unmount();
});

test('прораб (не РП): поля «За кого» нет, вызов — прежний pf_fact_add; отказ сервера показывается его текстом', async () => {
  A.setAreaService(areaApi({ full: false, locations: ['s3'], fact_owner: [], can_on_behalf: false }, {}));
  const msg = 'Факт по этому месту вносит ответственный: Иванов А. И.. РП может внести за него — с отметкой «за кого»';
  const api: N = { add: async () => ({ ok: false, message: msg }) };
  const m = mount(createElement(FactEntryForm, { api, pos: pos('p1', 's1'), brigades: BR, lastBrigade: 'br1', onBrigade: () => {}, onCancel: () => {}, onSaved: () => {}, projectId: 'pa', me: PE.email }));
  await settle();
  assert.equal(m.div.querySelector('[data-testid="ft-behalf"]'), null);
  setInput(m.div.querySelector('[data-testid="ft-qty"]'), '5');
  m.div.querySelector('[data-testid="ft-save"]').click();
  await settle();
  assert.equal(m.div.querySelector('[role="alert"]').textContent, msg);
  assert.ok(m.div.querySelector('[data-testid="ft-form"]'), 'форма на месте');
  m.root.unmount();
});

test('пачка РП: места одного ответственного — pf_fact_add_batch_for; места с ответственным и без — подсказка разделить', async () => {
  A.setAreaService(areaApi({ full: true, locations: [], fact_owner: [], can_on_behalf: true }, { s1: [IV], s2: [IV] }));
  const f = fakeFact();
  const m = mount(createElement(FloorClose, { api: f.api, projectId: 'pa', place: { id: 's', name: 'Секции 1–2' }, positions: [pos('p1', 's1'), pos('p2', 's2')], brigades: BR, lastBrigade: 'br1',
    onBrigade: () => {}, onClose: () => {}, onDone: () => {}, me: RP }));
  await settle();
  const sel = m.div.querySelector('[data-testid="ft-behalf-select"]');
  assert.equal(sel.value, '', 'выбор — явный, даже при одном ответственном');
  m.div.querySelector('[data-testid="ft-close-send"]').click();
  await settle();
  assert.match(m.div.querySelector('[role="alert"]').textContent, /Укажите, за кого вносите/);
  assert.equal(f.calls.length, 0);
  setInput(sel, 'u-iv');
  m.div.querySelector('[data-testid="ft-close-send"]').click();
  await settle();
  assert.equal(f.calls[0].fn, 'addBatch');
  assert.equal(f.calls[0].b.onBehalf, 'u-iv');
  m.root.unmount();
  A.setAreaService(areaApi({ full: true, locations: [], fact_owner: [], can_on_behalf: true }, { s1: [IV] }));
  const f2 = fakeFact();
  const m2 = mount(createElement(FloorClose, { api: f2.api, projectId: 'pa', place: { id: 's', name: 'Корпус' }, positions: [pos('p1', 's1'), pos('p3', 's3')], brigades: BR, lastBrigade: 'br1',
    onBrigade: () => {}, onClose: () => {}, onDone: () => {}, me: RP }));
  await settle();
  assert.ok(m2.div.querySelector('[data-testid="ft-behalf-split"]'));
  m2.div.querySelector('[data-testid="ft-close-send"]').click();
  await settle();
  assert.equal(f2.calls.length, 0);
  assert.match(m2.div.querySelector('[role="alert"]').textContent, /разделите пачку/);
  m2.root.unmount();
  A.setAreaService(undefined);
});
