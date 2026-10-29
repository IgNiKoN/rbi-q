/// <reference types="node" />
/** P2-0068: длинный реестр рисуется порциями по 100 — «Показать ещё (N)», дорисовка следующей порции; счётчики, «Выбрать всё»,
 *  итоги групп и строки для Excel — по всем отфильтрованным строкам; смена фильтра — снова первая порция; открытая строка видна. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement: h, useState } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const ui = await import('../../../platform/ui/index.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

interface Row { id: string; corp: string; st: string; tone: 'grey' | 'green' }
// 4500 позиций: 3 корпуса по 1500; «Ждёт РП» — 410 строк.
const ROWS: Row[] = Array.from({ length: 4500 }, (_, i) => ({ id: String(i), corp: `Корпус ${(i % 3) + 1}`, st: i % 11 === 0 ? 'Ждёт РП' : 'В работе', tone: i % 2 ? 'grey' : 'green' }));
const COLS: N[] = [{ id: 'id', label: 'Позиция', value: (r: Row) => '№ ' + r.id, fixed: true }, { id: 'corp', label: 'Корпус', value: (r: Row) => r.corp }];
const FILTERS: N[] = [{ id: 'st', label: 'Статус', get: (r: Row) => r.st }, { id: 'corp', label: 'Корпус', get: (r: Row) => r.corp }];
const GROUP = { label: 'Корпус', key: (r: Row) => r.corp };

function mount(el: N): N {
  const box = win.document.createElement('div');
  win.document.body.appendChild(box);
  flushSync(() => createRoot(box as unknown as HTMLElement).render(el));
  return box;
}
const click = (el: N) => flushSync(() => { el.click(); });
const qa = (box: N, sel: string): N[] => Array.from(box.querySelectorAll(sel));
const drawn = (box: N): number => qa(box, 'tr[data-row]').length;
const more = (box: N): N => box.querySelector('[data-testid="p2-reg-more-rows"]');

let stateNow: N = null;
let selNow: Set<string> = new Set();
function Harness(props: { rows?: Row[]; group?: boolean; openKey?: string; f?: Record<string, string[]> }): N {
  const [state, setState] = useState({ ...ui.EMPTY_STATE, group: !!props.group, f: props.f || {} });
  const [sel, setSel] = useState(new Set<string>());
  stateNow = state; selNow = sel;
  return h(ui.RegistryTable as N, {
    testId: 'reg', rows: props.rows || ROWS, rowKey: (r: Row) => r.id, columns: COLS, filters: FILTERS, state, onState: setState,
    groupBy: GROUP, toneOf: (r: Row) => r.tone, selected: sel, onSelect: setSel, empty: 'Позиций нет', quick: { filter: 'st' }, openKey: props.openKey,
    onOpen: () => {} });
}

test('4500 строк: нарисовано 100 и «Показать ещё (4400)»; нажатие — следующие 100; «Показано» — по всем', () => {
  assert.equal(ui.REGISTRY_CHUNK, 100);
  const box = mount(h(Harness, {}));
  assert.equal(drawn(box), 100);
  assert.equal(more(box).textContent, 'Показать ещё (4400)');
  assert.ok(more(box).className.includes('pf-btn pf-btn--ghost'), 'кнопка — как «Показать ещё» во «Вводе факта»');
  assert.match(box.querySelector('[data-testid="p2-reg-shown"]').textContent, /4500 из 4500/);
  click(more(box));
  assert.equal(drawn(box), 200);
  assert.equal(more(box).textContent, 'Показать ещё (4300)');
  assert.equal(qa(box, '[data-testid="p2-reg-quick"] button')[0].textContent, 'Все4500');
});

test('«Выбрать всё» — 4500, а не нарисованные 100; Excel получает все 4500 (а по фильтру — 410)', () => {
  const box = mount(h(Harness, {}));
  click(box.querySelector('[data-testid="p2-reg-select-all"]'));
  assert.equal(selNow.size, 4500);
  assert.equal(box.querySelector('[data-testid="p2-reg-selected"]').textContent, 'Выбрано: 4500');
  assert.equal(drawn(box), 100, 'выбор не дорисовывает весь список');
  const all = ui.registryRows(ROWS, { filters: FILTERS, columns: COLS, state: stateNow, groupBy: GROUP });
  assert.equal(all.length, 4500);
  const wait = ui.registryRows(ROWS, { filters: FILTERS, columns: COLS, state: { ...stateNow, f: { st: ['Ждёт РП'] } }, groupBy: GROUP });
  assert.equal(wait.length, 410);
});

test('фильтр «Ждёт РП» — снова первая порция; счётчик 410; «Выбрать всё» — 410; снятие фильтра — снова 100', () => {
  const box = mount(h(Harness, {}));
  click(more(box)); click(more(box));
  assert.equal(drawn(box), 300);
  const q = qa(box, '[data-testid="p2-reg-q"]').find((b) => b.getAttribute('data-value') === 'Ждёт РП');
  assert.equal(q.textContent, 'Ждёт РП410');
  click(q);
  assert.equal(drawn(box), 100);
  assert.equal(more(box).textContent, 'Показать ещё (310)');
  click(box.querySelector('[data-testid="p2-reg-select-all"]'));
  assert.equal(selNow.size, 410);
  click(qa(box, '[data-testid="p2-reg-quick"] button')[0]);
  assert.equal(drawn(box), 100);
});

test('сортировка сбрасывает на первую порцию', () => {
  const box = mount(h(Harness, {}));
  click(more(box));
  assert.equal(drawn(box), 200);
  click(box.querySelector('[data-testid="p2-reg-sort"][data-col="corp"]'));
  assert.equal(drawn(box), 100);
});

test('группы: итог «Всего: 1500» и счётчики статусов по всем строкам группы; порция — по строкам, дальние группы ждут', () => {
  const box = mount(h(Harness, { group: true }));
  const heads = qa(box, '[data-testid="p2-reg-group"]');
  assert.equal(heads.length, 1, 'вторая и третья группы — после дорисовки');
  assert.match(heads[0].textContent, /Корпус 1.*Всего: 1500/);
  const counts = qa(box, '[data-group="Корпус 1"] [data-testid="p2-reg-count"]').map((b) => Number(b.textContent));
  assert.equal(counts.reduce((a, b) => a + b, 0), 1500);
  assert.equal(drawn(box), 100);
  assert.equal(more(box).textContent, 'Показать ещё (4400)');
  click(heads[0]);   // свернуть «Корпус 1» — его строки не в счёт, порция идёт во «Корпус 2»
  assert.deepEqual(qa(box, '[data-testid="p2-reg-group"]').map((b) => b.querySelector('b').textContent), ['Корпус 1', 'Корпус 2']);
  assert.equal(drawn(box), 100);
  assert.equal(qa(box, '[data-group="Корпус 2"] tr[data-row]').length, 100);
  assert.equal(more(box).textContent, 'Показать ещё (2900)');
});

test('открытая по адресу строка № 3000 нарисована; остальное — порциями после неё', () => {
  const box = mount(h(Harness, { openKey: '3000' }));
  assert.ok(box.querySelector('tr[data-row="3000"].p2-reg__row--open'));
  assert.equal(drawn(box), 3001);
  assert.equal(more(box).textContent, 'Показать ещё (1499)');
});

test('короткий список — без кнопки; пустой и «ничего не найдено» — как раньше', () => {
  const short = mount(h(Harness, { rows: ROWS.slice(0, 100) }));
  assert.equal(drawn(short), 100);
  assert.equal(more(short), null);
  const empty = mount(h(Harness, { rows: [] }));
  assert.equal(empty.querySelector('[data-testid="p2-reg-empty"]').textContent, 'Позиций нет');
  assert.equal(more(empty), null);
  const none = mount(h(Harness, { rows: ROWS.slice(1, 5), f: { st: ['Ждёт РП'] } }));
  assert.equal(none.querySelector('[data-testid="p2-reg-empty"]').textContent, 'Ничего не найдено — измените или сбросьте фильтры.');
  assert.equal(more(none), null);
});
