/// <reference types="node" />
/** P2-0011 этап 3: архив скрыт во всех списках выбора объекта (ВОР, Факт, Смета, КС-2 — общий ProjectPicker), «Показать архив»,
 *  архивный — «только просмотр»; в Факте у архивного объекта нет «Внести факт». Наименования вымышленные. */
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
const { ProjectPicker, firstProjectId, visibleProjects } = await import('../ProjectPicker.ts');
const { FactTab } = await import('../fact/FactTab.ts');
const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const LIST = [{ id: 'old', name: 'ЖК Старый', archived_at: '2026-01-01T00:00:00Z' }, { id: 'a', name: 'ЖК Альфа', archived_at: null }, { id: 'b', name: 'ЖК Бета', archived_at: null }];
const opts = (el: N): string[] => Array.from(el.querySelectorAll('option')).map((o: N) => o.textContent);

test('правило: по умолчанию первый действующий; архивные — только по «Показать архив» (и выбранный)', () => {
  assert.equal(firstProjectId(LIST), 'a');
  assert.equal(firstProjectId([LIST[0]]), 'old');                  // только архивные — показать, но «только просмотр»
  assert.deepEqual(visibleProjects(LIST, false, 'a').map((p) => p.id), ['a', 'b']);
  assert.deepEqual(visibleProjects(LIST, true, 'a').map((p) => p.id), ['old', 'a', 'b']);
  assert.deepEqual(visibleProjects(LIST, false, 'old').map((p) => p.id), ['old', 'a', 'b']);
});

test('ProjectPicker: архив скрыт → «Показать архив (1)» → «(архив)» в списке → выбор → «только просмотр» → «Скрыть архив» → действующий', async () => {
  let value = 'a';
  const el = win.document.createElement('div') as N;
  win.document.body.appendChild(el);
  const root = createRoot(el as unknown as HTMLElement);
  const draw = (): void => flushSync(() => root.render(createElement(ProjectPicker, { list: LIST, value, onChange: (id: string) => { value = id; draw(); } })));
  draw();
  assert.deepEqual(opts(el), ['ЖК Альфа', 'ЖК Бета']);
  const btn = el.querySelector('[data-testid="pp-archive"]');
  assert.equal(btn.textContent, 'Показать архив (1)');
  btn.click(); await tick();
  assert.deepEqual(opts(el), ['ЖК Старый (архив)', 'ЖК Альфа', 'ЖК Бета']);
  assert.equal(el.querySelector('[data-testid="pp-archived"]'), null);
  const sel = el.querySelector('select');
  Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, 'value')!.set!.call(sel, 'old');
  sel.dispatchEvent(new win.Event('change', { bubbles: true })); await tick();
  assert.equal(value, 'old');
  assert.equal(el.querySelector('[data-testid="pp-archived"]').textContent, 'Объект в архиве — только просмотр.');
  el.querySelector('[data-testid="pp-archive"]').click(); await tick();
  assert.equal(value, 'a', 'скрыли архив — выбран первый действующий');
  assert.deepEqual(opts(el), ['ЖК Альфа', 'ЖК Бета']);
});

test('ProjectPicker: без архива кнопки нет; один объект — подпись вместо списка', () => {
  const el = win.document.createElement('div') as N;
  win.document.body.appendChild(el);
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(ProjectPicker, { list: [LIST[1]], value: 'a', onChange: () => {} })));
  assert.equal(el.querySelector('[data-testid="pp-archive"]'), null);
  assert.equal(el.querySelector('select'), null);
  assert.match(el.textContent, /Проект: ЖК Альфа/);
});

const POS: FakePos[] = [{ id: 'p5', ancestors: ['f5'], location_id: 'f5', location_path: '5 этаж', location_type: 'floor', work: 'Штукатурка стен', unit: 'м²', plan: 100 }];
const NODES: Record<string, any[]> = { root: [{ id: 'f5', parent_id: null, node_type: 'floor', name: '5 этаж', path: '5 этаж', depth: 1, child_count: 0 }] };
async function factFor(list: N[]): Promise<N> {
  const f = makeFakeFact(POS, { me: 'foreman@test.invalid' });
  f.brigades.push({ id: 'b1', name: 'Иванов', leader_name: null, phone: null, archived_at: null, can_manage: true });
  const vor = { async listProjects() { return list; }, async permissions() { return ['planfact.fact.view', 'planfact.fact.create']; } } as N;
  const projects = { async listLocations(_p: string, parent: string | null) { return NODES[parent || 'root'] || []; } } as N;
  const el = win.document.createElement('div') as N;
  win.document.body.appendChild(el);
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(FactTab, { api: f.api, vor, projects, me: 'foreman@test.invalid' } as N)));
  for (let i = 0; i < 4; i++) await tick();
  el.querySelector('[data-location-id="f5"]').click();
  for (let i = 0; i < 4; i++) await tick();
  return el;
}

test('Факт: по умолчанию действующий объект с «Внести факт»; архивный — «только просмотр», кнопки ввода нет', async () => {
  const a = await factFor([{ id: 'old', name: 'ЖК Старый', company_id: 'c1', archived_at: '2026-01-01T00:00:00Z' }, { id: 'pr1', name: 'ЖК Тест', company_id: 'c1', archived_at: null }]);
  assert.match(a.textContent, /Проект: ЖК Тест/);
  assert.ok(a.querySelector('[data-testid="ft-enter"]'), 'действующий: кнопка ввода есть');
  const b = await factFor([{ id: 'old', name: 'ЖК Старый', company_id: 'c1', archived_at: '2026-01-01T00:00:00Z' }]);
  assert.ok(b.querySelector('[data-testid="pp-archived"]'));
  assert.equal(b.querySelector('[data-testid="ft-enter"]'), null, 'архивный: ввода нет');
});
