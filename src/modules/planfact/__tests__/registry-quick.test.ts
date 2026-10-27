/// <reference types="node" />
/** P2-0046: реестр оболочки по утверждённым макетам — фильтр-кнопки со счётчиками (quick), строка телефона (compact),
 *  галочки только после «Выбрать» (selectMode). Без новых свойств реестр прежний. */
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

interface Row { id: string; st: string; sum: number }
const ROWS: Row[] = [{ id: '6', st: 'Черновик', sum: 18 }, { id: '5', st: 'Выдан', sum: 21 }, { id: '4', st: 'Аннулирован', sum: 9 }, { id: '3', st: 'Выдан', sum: 9.1 }];
const COLS: N[] = [{ id: 'id', label: 'Акт', value: (r: Row) => '№ ' + r.id, fixed: true }, { id: 'sum', label: 'Сумма', value: (r: Row) => r.sum, align: 'right' }];
const FILTERS: N[] = [{ id: 'st', label: 'Статус', get: (r: Row) => r.st }];

function mount(el: N): N {
  const box = win.document.createElement('div');
  win.document.body.appendChild(box);
  flushSync(() => createRoot(box as unknown as HTMLElement).render(el));
  return box;
}
const click = (el: N) => flushSync(() => { el.click(); });
const qa = (box: N, sel: string): N[] => Array.from(box.querySelectorAll(sel));
const shown = (box: N): string[] => qa(box, 'tr[data-row]').map((r) => r.getAttribute('data-row'));

let selNow: Set<string> = new Set();
function Harness(props: { quick?: boolean; compact?: boolean; selectMode?: boolean; onOpen?: (r: Row) => void }): N {
  const [state, setState] = useState({ ...ui.EMPTY_STATE });
  const [sel, setSel] = useState(new Set<string>());
  selNow = sel;
  return h(ui.RegistryTable as N, {
    testId: 'reg', rows: ROWS, rowKey: (r: Row) => r.id, columns: COLS, filters: FILTERS, state, onState: setState, selected: sel, onSelect: setSel, empty: 'Актов нет',
    quick: props.quick ? { filter: 'st' } : undefined, compact: props.compact ? (r: Row) => h('b', { 'data-c': r.id }, `№ ${r.id} · ${r.st}`) : undefined,
    selectMode: props.selectMode, onOpen: props.onOpen });
}

test('quick: «Все 4» и значения со счётчиками; нажатие — только эти строки, повторное — снова все', () => {
  const box = mount(h(Harness, { quick: true }));
  const chips = qa(box, '[data-testid="p2-reg-quick"] button');
  assert.deepEqual(chips.map((b) => b.textContent), ['Все4', 'Аннулирован1', 'Выдан2', 'Черновик1']);
  assert.equal(chips[0].getAttribute('aria-pressed'), 'true');
  click(qa(box, '[data-testid="p2-reg-q"][data-value="Выдан"]')[0]);
  assert.deepEqual(shown(box), ['5', '3']);
  assert.equal(qa(box, '[data-testid="p2-reg-q"][data-value="Выдан"]')[0].getAttribute('aria-pressed'), 'true');
  click(qa(box, '[data-testid="p2-reg-q"][data-value="Выдан"]')[0]);
  assert.deepEqual(shown(box), ['6', '5', '4', '3']);
  click(qa(box, '[data-testid="p2-reg-q"][data-value="Черновик"]')[0]);
  click(qa(box, '[data-testid="p2-reg-quick"] button')[0]);
  assert.equal(shown(box).length, 4, '«Все» снимает фильтр');
});

test('без новых свойств — как раньше: галочки на месте, ни кнопок-фильтров, ни строки телефона', () => {
  const box = mount(h(Harness, {}));
  assert.equal(qa(box, '[data-testid="p2-reg-quick"]').length, 0);
  assert.equal(qa(box, '[data-testid="p2-reg-compact"]').length, 0);
  assert.equal(qa(box, '[data-testid="p2-reg-select"]').length, 4);
  assert.equal(qa(box, '[data-testid="p2-reg-pick"]').length, 0);
});

test('compact: у каждой строки — ячейка телефона; с onOpen она открывает строку', () => {
  const opened: string[] = [];
  const box = mount(h(Harness, { compact: true, selectMode: true, onOpen: (r: Row) => opened.push(r.id) }));
  const cells = qa(box, '[data-testid="p2-reg-compact"]');
  assert.equal(cells.length, 4);
  assert.equal(cells[0].textContent, '№ 6 · Черновик');
  assert.ok(box.querySelector('.p2-reg--compact'));
  click(cells[1].querySelector('button'));
  assert.deepEqual(opened, ['5']);
});

test('selectMode: галочек нет до «Выбрать»; «Готово» снимает выбор и прячет галочки', () => {
  const box = mount(h(Harness, { selectMode: true }));
  assert.equal(qa(box, '[data-testid="p2-reg-select"]').length, 0);
  assert.ok(box.querySelector('.p2-reg--nocheck'));
  const pick = qa(box, '[data-testid="p2-reg-pick"]')[0];
  assert.equal(pick.textContent, 'Выбрать');
  click(pick);
  assert.equal(qa(box, '[data-testid="p2-reg-select"]').length, 4);
  flushSync(() => { qa(box, '[data-testid="p2-reg-select"]')[0].click(); });
  assert.equal(selNow.size, 1);
  assert.equal(qa(box, '[data-testid="p2-reg-pick"]')[0].textContent, 'Готово');
  click(qa(box, '[data-testid="p2-reg-pick"]')[0]);
  assert.equal(selNow.size, 0);
  assert.equal(qa(box, '[data-testid="p2-reg-select"]').length, 0);
});
