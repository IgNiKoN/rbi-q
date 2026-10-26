/// <reference types="node" />
/** «Факт → Ждёт подтверждения» на реестре (P2-0020, этап 2) на подставном сервере (правила 009/028): строки = очередь pf_fact_pending,
 *  фильтры (корпус, работа, прораб, бригада, дата) и группы по корпусу, «Выбрано: N» → подтверждение / отказ пачкой одной операцией
 *  (отказ без причины — нельзя), больше 500 — частями, отказ сервера показан и ничего не меняет, карточка с историей позиции,
 *  вид из адреса; подвкладка — счётчик и только при праве fact.approve; адреса #/planfact/fact/pending. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { makeFakeFact } from './fact-fake.ts';
import type { FakePos } from './fact-fake.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/#/planfact/fact/pending' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
g.HTMLInputElement = win.HTMLInputElement; g.KeyboardEvent = win.KeyboardEvent;
const { createElement: h } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { PendingRegistry, decideInParts, toPendingRow } = await import('../fact/PendingRegistry.ts');
const { FactTab } = await import('../fact/FactTab.ts');
const { canonicalHash, factSubFromHash, FACT_SUBS } = await import('../PlanfactApp.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const tick = (): Promise<void> => settle();

const POS: FakePos[] = [
  { id: 'a5', ancestors: ['k1', 'f5'], location_id: 'f5', location_path: 'Корпус 1 · 5 этаж', location_type: 'floor', work: 'Штукатурка стен', unit: 'м²', plan: 10 },
  { id: 'a6', ancestors: ['k1', 'f6'], location_id: 'f6', location_path: 'Корпус 1 · 6 этаж', location_type: 'floor', work: 'Окраска стен', unit: 'м²', plan: 10 },
  { id: 'b5', ancestors: ['k2', 'g5'], location_id: 'g5', location_path: 'Корпус 2 · 5 этаж', location_type: 'floor', work: 'Штукатурка стен', unit: 'м²', plan: 10 },
  { id: 'b6', ancestors: ['k2', 'g6'], location_id: 'g6', location_path: 'Корпус 2 · 6 этаж', location_type: 'floor', work: 'Стяжка пола', unit: 'м²', plan: 10 }];

/** Четыре записи ждут РП: двое прорабов, две бригады, две даты; одна — «через РП». */
function stand(opts: { failBatch?: string } = {}) {
  const f = makeFakeFact(POS, { me: 'pm@test.invalid', ...opts });
  const add = (id: string, pos: string, qty: number, date: string, brigade: string, by: string, note: string | null = null) => f.entries.push({
    id, position_id: pos, status: 'pending_approval', qty, work_date: date, brigade_name: brigade, workers: null, man_hours: null, note,
    corrects_id: null, correction_reason: null, batch_id: null, created_by_email: by, created_at: `2026-10-2${f.entries.length}T08:00:00Z`,
    decided_by_email: null, decided_at: null, decision_note: null } as N);
  add('e1', 'a5', 12, '2026-10-22', 'Иванов', 'ivanov@test.invalid');
  add('e2', 'a6', 11, '2026-10-23', 'Петров', 'petrov@test.invalid');
  add('e3', 'b5', 15, '2026-10-23', 'Иванов', 'ivanov@test.invalid', 'Закрытие через РП');
  add('e4', 'b6', 13, '2026-10-22', 'Петров', 'petrov@test.invalid');
  return f;
}
async function mount(el: N): Promise<N> {
  const box = win.document.createElement('div');
  win.document.body.appendChild(box);
  flushSync(() => createRoot(box as unknown as HTMLElement).render(el));
  await tick(); await tick();
  return box;
}
const click = (el: N): void => flushSync(() => { el.click(); });
const qa = (box: N, sel: string): N[] => Array.from(box.querySelectorAll(sel));
const rowIds = (box: N): string[] => qa(box, '[data-testid="fp-table"] tr[data-row]').map((r) => r.getAttribute('data-row'));
function typeIn(input: N, value: string): void {
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}
const reg = (f: ReturnType<typeof stand>, extra: Record<string, unknown> = {}) =>
  h(PendingRegistry, { api: f.api, projectId: 'pr1', companyId: 'c1', user: 'pm@test.invalid', ...extra } as N);
async function filterBy(box: N, filter: string, value: string): Promise<void> {
  click(box.querySelector('[data-testid="p2-reg-filter"]'));
  click(box.querySelector(`[data-filter="${filter}"] [data-value="${value}"]`));
  click(box.querySelector('[data-testid="p2-reg-panel-apply"]'));
  await tick();
}

test('строки = очередь сервера; колонки; группы по корпусу; фильтры корпус / работа / прораб / бригада / дата', async () => {
  win.history.replaceState(null, '', '#/planfact/fact/pending');
  const f = stand();
  const box = await mount(reg(f));
  const q = await f.api.pending('pr1');
  assert.ok(q.ok);
  assert.deepEqual([...rowIds(box)].sort(), q.value.map((e) => e.id).sort(), 'очередь совпадает с pf_fact_pending');
  assert.deepEqual(qa(box, '[data-testid="p2-reg-group"] b').map((b) => b.textContent), ['Корпус 1', 'Корпус 2']);
  const heads = qa(box, '[data-testid="p2-reg-sort"]').map((b) => b.textContent);
  for (const c of ['Работа', 'Место', 'Объём', 'План', 'Принято', 'Дата работ', 'Бригада', 'Прораб', 'Пометка', 'Через РП', 'Исправление']) assert.ok(heads.includes(c), c);
  const r3 = box.querySelector('tr[data-row="e3"]');
  assert.ok(r3.querySelector('[data-testid="fp-viapm"]'), '«через РП» отмечено');
  assert.equal(r3.querySelector('[data-col="date"]').textContent, '23.10.2026');
  assert.equal(r3.querySelector('[data-col="qty"]').textContent, '15 м²');

  await filterBy(box, 'corp', 'Корпус 2');
  assert.deepEqual(rowIds(box).sort(), ['e3', 'e4']);
  await filterBy(box, 'author', 'ivanov@test.invalid');
  assert.deepEqual(rowIds(box), ['e3'], 'корпус И прораб');
  click(box.querySelector('[data-testid="p2-reg-reset"]')); await tick();
  await filterBy(box, 'brigade', 'Петров');
  assert.deepEqual(rowIds(box).sort(), ['e2', 'e4']);
  click(box.querySelector('[data-testid="p2-reg-reset"]')); await tick();
  await filterBy(box, 'date', '2026-10-22');
  assert.deepEqual(rowIds(box).sort(), ['e1', 'e4']);
  assert.match(box.querySelector('[data-testid="p2-reg-chips"]').textContent, /Дата работ: 22\.10\.2026/);
  assert.match(win.location.hash, /^#\/planfact\/fact\/pending\?f\.date=2026-10-22$/, 'вид — в адресе');
  click(box.querySelector('[data-testid="p2-reg-reset"]')); await tick();
  await filterBy(box, 'work', 'Штукатурка стен');
  assert.deepEqual(rowIds(box).sort(), ['e1', 'e3']);
});

test('вид из адреса открывает те же фильтры', async () => {
  win.history.replaceState(null, '', '#/planfact/fact/pending?f.corp=%D0%9A%D0%BE%D1%80%D0%BF%D1%83%D1%81%201');
  const box = await mount(reg(stand()));
  assert.deepEqual(rowIds(box).sort(), ['e1', 'e2']);
  win.history.replaceState(null, '', '#/planfact/fact/pending');
});

test('«Выбрано: N» → «Подтвердить N» одной операцией: все в итоге, очередь пуста, счётчик обновлён', async () => {
  const f = stand();
  let changed = 0;
  const box = await mount(reg(f, { onChanged: () => { changed++; } }));
  await filterBy(box, 'corp', 'Корпус 1');
  click(box.querySelector('[data-testid="p2-reg-select-all"]'));
  assert.equal(box.querySelector('[data-testid="p2-reg-selected"]').textContent, 'Выбрано: 2');
  assert.equal(box.querySelector('[data-testid="fp-approve"]').textContent, 'Подтвердить 2');
  click(box.querySelector('[data-testid="fp-approve"]')); await tick();
  const calls = f.calls.filter((c) => c.fn === 'decideBatch');
  assert.equal(calls.length, 1, 'одна операция на сервере');
  assert.deepEqual((calls[0].args as N).ids.sort(), ['e1', 'e2']);
  assert.equal((calls[0].args as N).approve, true);
  assert.deepEqual(f.entries.filter((e) => e.status === 'accepted').map((e) => e.id).sort(), ['e1', 'e2']);
  assert.match(box.querySelector('[data-testid="fp-notice"]').textContent, /Подтверждено: 2/);
  assert.equal(changed, 1, 'счётчик подвкладки перечитан');
  assert.equal(box.querySelector('[data-testid="p2-reg-selbar"]'), null, 'выбор снят');
  click(box.querySelector('[data-testid="p2-reg-reset"]')); await tick();
  assert.deepEqual(rowIds(box).sort(), ['e3', 'e4'], 'в очереди — только нерешённые');
});

test('отказ пачкой: без причины — нельзя (сервер не вызывается); одна причина на все', async () => {
  const f = stand();
  const box = await mount(reg(f));
  click(box.querySelector('tr[data-row="e2"] [data-testid="p2-reg-select"]'));
  click(box.querySelector('tr[data-row="e4"] [data-testid="p2-reg-select"]'));
  click(box.querySelector('[data-testid="fp-reject"]'));
  click(box.querySelector('[data-testid="fp-reject-yes"]')); await tick();
  assert.match(box.querySelector('[data-testid="fp-batch-error"]').textContent, /причину отказа/);
  assert.equal(f.calls.filter((c) => c.fn === 'decideBatch').length, 0);
  typeIn(box.querySelector('[data-testid="fp-reject-note"]'), '   '); await tick();
  click(box.querySelector('[data-testid="fp-reject-yes"]')); await tick();
  assert.equal(f.calls.filter((c) => c.fn === 'decideBatch').length, 0, 'пробелы — не причина');
  typeIn(box.querySelector('[data-testid="fp-reject-note"]'), 'нет исполнительной'); await tick();
  assert.equal(box.querySelector('[data-testid="fp-reject-yes"]').textContent, 'Отклонить 2');
  click(box.querySelector('[data-testid="fp-reject-yes"]')); await tick();
  const calls = f.calls.filter((c) => c.fn === 'decideBatch');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, { ids: ['e2', 'e4'], approve: false, note: 'нет исполнительной' });
  assert.deepEqual(f.entries.filter((e) => e.status === 'rejected').map((e) => [e.id, e.decision_note]), [['e2', 'нет исполнительной'], ['e4', 'нет исполнительной']]);
  assert.match(box.querySelector('[data-testid="fp-notice"]').textContent, /Отклонено: 2/);
});

test('отказ сервера показан, ничего не изменилось, выбор сохранён', async () => {
  const f = stand({ failBatch: 'Не все записи ждут подтверждения в этом объекте — обновите список' });
  const box = await mount(reg(f));
  click(box.querySelector('[data-testid="p2-reg-select-all"]'));
  click(box.querySelector('[data-testid="fp-approve"]')); await tick();
  assert.match(box.querySelector('[data-testid="fp-notice"][role="alert"]').textContent, /обновите список\. Ничего не изменилось/);
  assert.equal(f.entries.filter((e) => e.status === 'pending_approval').length, 4);
  assert.equal(box.querySelector('[data-testid="p2-reg-selected"]').textContent, 'Выбрано: 4');
});

test('больше 500 — частями по 500; ошибка части — остановка, решённые раньше части названы', async () => {
  const sizes: number[] = [];
  let fail = 0;
  const api = { async decideBatch(_p: string, ids: string[], approve: boolean) {
    sizes.push(ids.length);
    if (fail && sizes.length === fail) return { ok: false, message: 'Нет права подтверждать факт' };
    return { ok: true, value: { approved: approve ? ids.length : 0, rejected: approve ? 0 : ids.length } };
  } } as N;
  const ids = Array.from({ length: 1201 }, (_, i) => `x${i}`);
  assert.deepEqual(await decideInParts(api, 'pr1', ids, true, ''), { done: 1201, error: '' });
  assert.deepEqual(sizes, [500, 500, 201]);
  sizes.length = 0; fail = 2;
  assert.deepEqual(await decideInParts(api, 'pr1', ids, false, 'причина'), { done: 500, error: 'Нет права подтверждать факт' });
  assert.deepEqual(sizes, [500, 500], 'после ошибки дальше не идём');
});

test('карточка: запись, «после подтверждения», история позиции, решение по одной; «пред. / след.» по списку', async () => {
  const f = stand();
  const box = await mount(reg(f));
  click(box.querySelector('tr[data-row="e1"] [data-testid="p2-reg-open"]')); await tick();
  const side = box.querySelector('[data-testid="p2-side"]');
  assert.match(side.textContent, /Штукатурка стен/);
  assert.match(box.querySelector('[data-testid="fp-card-nums"]').textContent, /12 м².*0 из 10 м².*120 %/);
  assert.ok(f.calls.some((c) => c.fn === 'history' && c.args === 'a5'), 'история позиции — pf_fact_history');
  assert.equal(box.querySelector('[data-testid="p2-side-pos"]').textContent, '1 из 4');
  click(box.querySelector('[data-testid="p2-side-next"]')); await tick();
  assert.equal(box.querySelector('[data-testid="p2-side-pos"]').textContent, '2 из 4');
  click(box.querySelector('[data-testid="ft-approve"]')); await tick();
  assert.ok(f.calls.some((c) => c.fn === 'decide' && (c.args as N).eid === 'e2' && (c.args as N).approve === true), 'решение по одной — pf_fact_decide');
  assert.equal(box.querySelector('[data-testid="p2-side"]'), null, 'карточка закрылась');
  assert.deepEqual(rowIds(box).sort(), ['e1', 'e3', 'e4']);
});

test('строка очереди: «после подтверждения» без процента у исправления', () => {
  const base = { id: 'x', position_id: 'p', location_path: 'Корпус 3 · 1 этаж', work_name: 'W', unit_code: 'м', plan_qty: 100, fact_qty: 90, qty: 20, work_date: '2026-10-24',
    brigade_name: 'Б', note: null, corrects_id: null, correction_reason: null, created_by_email: null, created_at: '2026-10-24T08:00:00Z' };
  const r = toPendingRow(base);
  assert.deepEqual([r.corp, r.afterPct, r.author, r.viaPm, r.correction], ['Корпус 3', 110, '—', false, '']);
  const c = toPendingRow({ ...base, corrects_id: 'y', correction_reason: 'перемерили' });
  assert.deepEqual([c.afterPct, c.correction], [null, 'перемерили']);
});

test('подвкладка: счётчик при fact.approve; без права — null и понятное сообщение вместо реестра', async () => {
  const f = stand();
  const projects = { async listLocations() { return []; } } as N;
  const vorOf = (perms: string[]) => ({ async listProjects() { return [{ id: 'pr1', name: 'ЖК Тест', company_id: 'c1' }]; }, async permissions() { return perms; } }) as N;
  let count: number | null | undefined;
  const box = await mount(h(FactTab, { api: f.api, vor: vorOf(['planfact.fact.view', 'planfact.fact.approve']), projects, me: 'pm@test.invalid', mode: 'pending', onApprove: (n: number | null) => { count = n; } } as N));
  await tick();
  assert.equal(count, 4);
  assert.ok(box.querySelector('[data-testid="fp-registry"]'));
  let count2: number | null | undefined;
  const box2 = await mount(h(FactTab, { api: f.api, vor: vorOf(['planfact.fact.view', 'planfact.fact.create']), projects, me: 'f@test.invalid', mode: 'pending', onApprove: (n: number | null) => { count2 = n; } } as N));
  await tick();
  assert.equal(count2, null, 'без fact.approve подвкладки нет');
  assert.equal(box2.querySelector('[data-testid="fp-registry"]'), null);
  assert.ok(box2.querySelector('[data-testid="ft-noapprove"]'));
  assert.ok(FACT_SUBS.find((t) => t.id === 'pending')?.approve, 'подвкладка помечена как требующая права');
});

test('адреса: #/planfact/fact/pending[?вид] — подвкладка «Ждёт подтверждения»; неизвестная — на «Ввод»', () => {
  const all = { company: true, estimate: true, ks2: true, fact: true, brigades: true };
  assert.equal(factSubFromHash('#/planfact/fact/pending'), 'pending');
  assert.equal(factSubFromHash('#/planfact/fact/pending?f.corp=A'), 'pending');
  assert.equal(factSubFromHash('#/planfact/fact?x=1'), 'entry');
  assert.equal(canonicalHash('#/planfact/fact/pending', all), null);
  assert.equal(canonicalHash('#/planfact/fact/pending?f.corp=%D0%9A', all), null);
  assert.equal(canonicalHash('#/planfact/fact/pendingx', all), '#/planfact/fact');
  assert.equal(canonicalHash('#/planfact/fact/pending', { ...all, fact: false }), '#/planfact');
});
