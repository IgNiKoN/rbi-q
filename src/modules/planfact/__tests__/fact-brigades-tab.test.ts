/// <reference types="node" />
/** Экран «Справочники → Бригады» (P2-0007, этап 2) на подставном сервере: добавить две бригады, переименовать, отправить в архив,
 *  повтор имени — понятная ошибка, без права — только список. Наименования вымышленные. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { makeFakeFact } from './fact-fake.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { createElement } = await import('react');
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { BrigadesTab } = await import('../fact/BrigadesTab.ts');
const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const COMPANY = { company_id: 'c1', company_name: 'Альфа', can_manage_projects: true, can_manage_units: true, can_manage_roles: true };

function mount(api: any) {
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  flushSync(() => createRoot(el as unknown as HTMLElement).render(createElement(BrigadesTab, { api, company: COMPANY } as N)));
  return el as N;
}
function typeIn(input: N, value: string): void {
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}
const submit = (f: N) => f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));

test('бригады: добавить две, повтор имени — ошибка, переименовать, в архив и вернуть', async () => {
  const s = makeFakeFact([]);
  const el = mount(s.api);
  await tick();
  assert.ok(el.querySelector('[data-testid="br-empty"]'));
  for (const name of ['Иванов', 'Петров']) {
    const form = el.querySelector('[data-testid="br-add"]');
    typeIn(form.querySelector('[name="name"]'), name); typeIn(form.querySelector('[name="leader"]'), 'Бригадир ' + name);
    submit(form); await tick(); await tick();
  }
  assert.equal(el.querySelectorAll('[data-brigade-id]').length, 2);
  const form = el.querySelector('[data-testid="br-add"]');
  typeIn(form.querySelector('[name="name"]'), ' иванов '); submit(form); await tick(); await tick();
  assert.match(el.querySelector('[role="alert"]').textContent, /уже есть/);
  assert.equal(el.querySelectorAll('[data-brigade-id]').length, 2);

  el.querySelector('[data-brigade-id] [data-testid="br-edit"]').click(); await tick();
  const row = el.querySelector('form[data-brigade-id]');
  typeIn(row.querySelector('[name="name"]'), 'Иванов-Строй'); submit(row); await tick(); await tick();
  assert.match(el.textContent, /Иванов-Строй/);
  assert.match(el.querySelector('[role="status"]').textContent, /изменена/);

  el.querySelectorAll('[data-testid="br-archive"]')[1].click(); await tick(); await tick();
  assert.equal(el.querySelectorAll('[data-brigade-id]').length, 1, 'архивная бригада скрыта');
  el.querySelector('[data-testid="br-archived"]').click(); await tick(); await tick();
  assert.equal(el.querySelectorAll('[data-brigade-id]').length, 2);
  assert.match(el.textContent, /в архиве/);
  el.querySelectorAll('[data-testid="br-archive"]')[1].click(); await tick(); await tick();
  assert.doesNotMatch(el.textContent, /в архиве/, 'вернули из архива');
});

test('бригады: без права управления форм и кнопок нет', async () => {
  const s = makeFakeFact([], { canManage: false });
  await s.api.saveBrigade('c1', null, 'Сидоров', '', '').catch(() => null);
  s.brigades.push({ id: 'bx', name: 'Сидоров', leader_name: null, phone: null, archived_at: null, can_manage: false });
  const el = mount(s.api);
  await tick();
  assert.match(el.textContent, /Сидоров/);
  assert.equal(el.querySelector('[data-testid="br-add"]'), null);
  assert.equal(el.querySelector('[data-testid="br-edit"]'), null);
});
