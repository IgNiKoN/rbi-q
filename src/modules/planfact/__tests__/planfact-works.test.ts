/// <reference types="node" />
/** «План/Факт» из базы: права определяют, что видно (кнопка, суммы, журнал); добавление работы. Подставной DataApi, DOM — happy-dom. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { PlanfactWorks } from '../PlanfactWorks.ts';
import type { DataApi, WorkRow } from '../data.service.ts';
import { settle, until } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
before(() => {
  g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
  g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
});
const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const W = (id: string, name: string, amount: number | null): WorkRow => ({ id, name, unit: 'м3', plan_qty: 10, plan_amount: amount, created_at: '2026-10-20T10:00:00Z' });

function fakeApi(perms: string[], opts: { addError?: string } = {}) {
  const added: string[] = [];
  const store: Record<string, WorkRow[]> = {
    p1: [W('1', 'Фундамент', perms.includes('planfact.money.view') ? 4800000 : null)],
    p2: [W('2', 'Кладка', null)]
  };
  const api: DataApi = {
    async listProjects() { return [{ id: 'p1', name: 'Объект 1', company_id: 'c' }, { id: 'p2', name: 'Объект 2', company_id: 'c' }]; },
    async listWorks(p) { return store[p]; },
    async permissions() { return perms; },
    async addWork(p, name) {
      if (opts.addError) return { ok: false, message: opts.addError };
      added.push(name); store[p] = [...store[p], W('n' + added.length, name, null)]; return { ok: true };
    },
    async listAudit() { return [{ at: '2026-10-20T10:05:00Z', actor_email: 'pto@test.invalid', action: 'INSERT', record_id: '1', old_data: null, new_data: { name: 'Фундамент' } }]; }
  };
  return { api, added };
}
function mount(api: DataApi) {
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  flushSync(() => createRoot(el as N).render(createElement(PlanfactWorks, { api })));
  return el as N;
}
const submit = (f: N) => f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
const click = (b: N) => b.dispatchEvent(new win.Event('click', { bubbles: true }));

test('ПТО: видит кнопку «Добавить работу» и сумму, журнала нет', async () => {
  const el = mount(fakeApi(['planfact.works.view', 'planfact.works.edit', 'planfact.money.view']).api);
  await until(() => el.querySelector('[data-work-id]'));
  assert.ok(el.querySelector('[data-testid=pf-add]'));
  assert.ok(el.querySelector('[data-testid=pf-money-col]'));
  assert.match(el.textContent, /4\s?800\s?000/);
  assert.ok(!el.querySelector('[data-testid=pf-audit]'));
});

test('прораб: кнопки и колонки сумм нет', async () => {
  const el = mount(fakeApi(['planfact.works.view', 'planfact.fact.create']).api);
  await until(() => el.querySelector('[data-work-id]'));
  assert.ok(el.querySelector('[data-work-id]'));
  assert.ok(!el.querySelector('[data-testid=pf-add]'));
  assert.ok(!el.querySelector('[data-testid=pf-money-col]'));
});

test('администратор: виден журнал «кто — что — когда»', async () => {
  const el = mount(fakeApi(['planfact.works.view', 'planfact.audit.view']).api);
  await until(() => el.querySelector('[data-work-id]'));
  const a = el.querySelector('[data-testid=pf-audit]');
  assert.ok(a && /pto@test\.invalid/.test(a.textContent) && /Добавлена работа «Фундамент»/.test(a.textContent));
});

test('добавление работы: форма → сервер → строка в таблице', async () => {
  const { api, added } = fakeApi(['planfact.works.view', 'planfact.works.edit']);
  const el = mount(api);
  await until(() => el.querySelector('[data-work-id]'));
  click(el.querySelector('[data-testid=pf-add]'));
  await tick();
  (el.querySelector('input[name=name]') as N).value = 'Монтаж колонн';
  (el.querySelector('input[name=qty]') as N).value = '48';
  submit(el.querySelector('[data-testid=pf-addform]'));
  await tick();
  assert.deepEqual(added, ['Монтаж колонн']);
  assert.match(el.textContent, /Монтаж колонн/);
  assert.ok(!el.querySelector('[data-testid=pf-addform]'));
});

test('сервер отказал → понятное сообщение, форма остаётся', async () => {
  const el = mount(fakeApi(['planfact.works.view', 'planfact.works.edit'], { addError: 'Недостаточно прав для добавления работы' }).api);
  await until(() => el.querySelector('[data-work-id]'));
  click(el.querySelector('[data-testid=pf-add]'));
  await tick();
  (el.querySelector('input[name=name]') as N).value = 'Работа';
  submit(el.querySelector('[data-testid=pf-addform]'));
  await tick();
  assert.match(el.textContent, /Недостаточно прав/);
  assert.ok(el.querySelector('[data-testid=pf-addform]'));
});

test('переключатель проекта показывает работы выбранного проекта', async () => {
  const el = mount(fakeApi(['planfact.works.view']).api);
  await until(() => el.querySelector('[data-work-id]'));
  assert.match(el.textContent, /Фундамент/);
  const sel = el.querySelector('select') as N;
  sel.value = 'p2';
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick();
  assert.match(el.textContent, /Кладка/);
  assert.ok(!/Фундамент/.test(el.querySelector('tbody').textContent));
});
