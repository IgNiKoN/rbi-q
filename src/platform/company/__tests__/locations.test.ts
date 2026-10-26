/// <reference types="node" />
/** «Структура проекта» (P2-0005): ленивое дерево, добавить с подсказкой уровня, переименовать, удалить ветку, генератор с предпросмотром. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { LocationsTree } from '../LocationsTree.ts';
import { generatedNodeCount } from '../../core/projects.service.ts';
import type { GenerateParams, LocationNode, ProjectItem, ProjectsApi } from '../../core/projects.service.ts';
import type { Result } from '../company.service.ts';
import type { PlanNodeType } from '../../../services/locations/types.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
// Глобалы нужны ДО загрузки react-dom (иначе React не слушает событие input у полей) — поэтому динамический import.
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const click = (b: N) => b.dispatchEvent(new win.Event('click', { bubbles: true }));
const submit = (f: N) => f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
function setInput(el: N, value: string): void {
  const proto = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value');
  proto!.set!.call(el, value);
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
}

const PROJECT: ProjectItem = { id: 'p1', name: 'ЖК Тест', code: null, archived_at: null, created_at: '2026-10-21T00:00:00Z', can_manage: true };

interface Row { id: string; parent: string | null; type: PlanNodeType; name: string; order: number; deleted: boolean }

function fakeTree(opts: { fail?: string } = {}) {
  let seq = 0;
  const rows: Row[] = [];
  const calls: string[] = [];
  const live = (parent: string | null) => rows.filter((r) => !r.deleted && r.parent === parent).sort((a, b) => a.order - b.order);
  const node = (r: Row): LocationNode => ({ id: r.id, parent_id: r.parent, node_type: r.type, name: r.name, sort_order: r.order, area: null, depth: 1, path: r.name, child_count: live(r.id).length });
  const add = (parent: string | null, type: PlanNodeType, name: string): string => {
    const id = 'n' + (++seq); rows.push({ id, parent, type, name, order: live(parent).length + 1, deleted: false }); return id;
  };
  const res = <T = null>(value: T): Result<T> => opts.fail ? { ok: false, message: opts.fail } : { ok: true, value };
  const subtree = (id: string): Row[] => [rows.find((r) => r.id === id)!, ...live(id).flatMap((c) => subtree(c.id))];
  const api = {
    async listLocations(_p: string, parent: string | null) { calls.push('list:' + parent); return live(parent).map(node); },
    async addLocation(_p: string, parent: string | null, type: PlanNodeType, name: string) { calls.push(`add:${parent}:${type}:${name}`); return res(opts.fail ? '' : add(parent, type, name)); },
    async renameLocation(id: string, name: string) { calls.push(`rename:${id}:${name}`); if (!opts.fail) rows.find((r) => r.id === id)!.name = name; return res(null); },
    async deleteLocation(id: string, cascade: boolean) {
      calls.push(`delete:${id}:${cascade}`);
      if (opts.fail) return res(0);
      const all = subtree(id); all.forEach((r) => { r.deleted = true; }); return res(all.length);
    },
    async generateBuilding(p: GenerateParams) {
      calls.push(`gen:${p.name}:${p.sections}:${p.floors}:${p.apartmentsPerFloor}:${p.firstFloor}`);
      if (opts.fail) return res('');
      const b = add(p.parentId, 'building', p.name);
      for (let s = 1; s <= p.sections; s++) { const sid = add(b, 'section', 'Секция ' + s);
        for (let f = 1; f <= p.floors; f++) { const fid = add(sid, 'floor', 'эт. ' + (p.firstFloor + f - 1));
          for (let a = 1; a <= p.apartmentsPerFloor; a++) add(fid, 'apartment', 'кв. ' + ((s - 1) * p.floors * p.apartmentsPerFloor + (f - 1) * p.apartmentsPerFloor + a)); } }
      return res(b);
    }
  } as unknown as ProjectsApi;
  return { api, calls, rows, add, live };
}

function mountTree(api: ProjectsApi, canManage = true, project: ProjectItem = PROJECT) {
  const el: N = win.document.createElement('div'); win.document.body.appendChild(el);
  flushSync(() => createRoot(el).render(createElement(LocationsTree, { api, project, canManage, onBack: () => undefined })));
  return el;
}
const rowOf = (el: N, name: string): N => [...el.querySelectorAll('[data-node-id]')].find((n: N) => n.querySelector('.lt-name b')?.textContent === name);

test('формула генератора: 2×5×4 = 53 узла (корпус + 2 + 10 + 40)', () => {
  assert.equal(generatedNodeCount(2, 5, 4), 53);
  assert.equal(generatedNodeCount(1, 1, 0), 3);
});

test('пустой проект: подсказка; корень грузится один раз', async () => {
  const t = fakeTree(); const el: N = mountTree(t.api); await tick();
  assert.ok(el.querySelector('[data-testid="lt-empty"]'));
  assert.deepEqual(t.calls, ['list:null']);
});

test('генератор: предпросмотр «будет создано N узлов», создание, дерево раскрывается лениво', async () => {
  const t = fakeTree(); const el: N = mountTree(t.api); await tick();
  click(el.querySelector('[data-testid="lt-gen-open"]')); await tick();
  const inputs = el.querySelector('[data-testid="lt-gen"]').querySelectorAll('input');
  setInput(inputs[0], 'Корпус А'); setInput(inputs[1], '2'); setInput(inputs[2], '5'); setInput(inputs[3], '4'); await tick();
  assert.ok(el.querySelector('[data-testid="lt-preview"]').textContent.includes('Будет создано 53 узлов'));
  submit(el.querySelector('[data-testid="lt-gen"]')); await tick();
  assert.deepEqual(t.calls.filter((c) => c.startsWith('gen:')), ['gen:Корпус А:2:5:4:1']);
  assert.equal(t.rows.length, 53);
  const b = rowOf(el, 'Корпус А'); assert.ok(b);
  assert.equal(el.querySelectorAll('[data-node-id]').length, 1, 'дети не загружены, пока корпус не раскрыт');
  click(b.querySelector('.lt-toggle')); await tick();
  assert.equal(el.querySelectorAll('[data-node-id]').length, 3, 'корпус + 2 секции');
  click(rowOf(el, 'Секция 2').querySelector('.lt-toggle')); await tick();
  assert.equal(el.querySelectorAll('[data-node-id]').length, 8);
});

test('генератор: больше 5000 узлов — кнопка «Создать» отключена, причина показана', async () => {
  const t = fakeTree(); const el: N = mountTree(t.api); await tick();
  click(el.querySelector('[data-testid="lt-gen-open"]')); await tick();
  const inputs = el.querySelector('[data-testid="lt-gen"]').querySelectorAll('input');
  setInput(inputs[1], '10'); setInput(inputs[2], '100'); setInput(inputs[3], '10'); await tick();
  assert.ok(el.querySelector('[data-testid="lt-preview"]').textContent.includes('больше 5000'));
  assert.equal(el.querySelector('[data-testid="lt-gen-go"]').disabled, true);
});

test('добавить узел: подсказка следующего уровня, можно выбрать другой (уровни пропускаются)', async () => {
  const t = fakeTree(); const b = t.add(null, 'building', 'Корпус 1');
  const el: N = mountTree(t.api); await tick();
  click(rowOf(el, 'Корпус 1').querySelector('[data-testid="lt-add"]')); await tick();
  const form: N = el.querySelector('[data-testid="lt-add-form"]');
  assert.equal(form.elements.namedItem('type').value, 'section');
  form.elements.namedItem('type').value = 'apartment'; form.elements.namedItem('name').value = ' кв. 1 ';
  submit(form); await tick();
  assert.deepEqual(t.calls.filter((c) => c.startsWith('add:')), [`add:${b}:apartment:кв. 1`]);
  assert.ok(rowOf(el, 'Корпус 1').querySelector('.lt-count'));
});

test('переименование и удаление листа', async () => {
  const t = fakeTree(); t.add(null, 'building', 'Корпус 1');
  const el: N = mountTree(t.api); await tick();
  click(rowOf(el, 'Корпус 1').querySelector('[data-testid="lt-rename"]')); await tick();
  const form: N = el.querySelector('.lt-row form'); form.elements.namedItem('name').value = 'Корпус Б'; submit(form); await tick();
  assert.ok(rowOf(el, 'Корпус Б'));
  click(rowOf(el, 'Корпус Б').querySelector('[data-testid="lt-delete"]')); await tick();
  assert.ok(el.querySelector('[data-testid="lt-confirm"]').textContent.includes('Удалить «Корпус Б»?'));
  click(el.querySelector('[data-testid="lt-delete-yes"]')); await tick();
  assert.ok(t.calls.some((c) => c.startsWith('delete:') && c.endsWith(':false')));
  assert.ok(el.querySelector('[data-testid="lt-empty"]'));
});

test('удаление ветки — только с подтверждением, уходят все вложенные', async () => {
  const t = fakeTree(); const b = t.add(null, 'building', 'Корпус 1'); const s = t.add(b, 'section', 'Секция 1'); t.add(s, 'floor', 'эт. 1');
  const el: N = mountTree(t.api); await tick();
  click(rowOf(el, 'Корпус 1').querySelector('[data-testid="lt-delete"]')); await tick();
  assert.ok(el.querySelector('[data-testid="lt-confirm"]').textContent.includes('вместе со всеми вложенными'));
  assert.equal(t.calls.filter((c) => c.startsWith('delete:')).length, 0, 'до подтверждения сервер не вызывается');
  click(el.querySelector('[data-testid="lt-delete-yes"]')); await tick();
  assert.deepEqual(t.calls.filter((c) => c.startsWith('delete:')), [`delete:${b}:true`]);
  assert.ok(el.textContent.includes('Удалено узлов: 3'));
});

test('без права — только просмотр: нет кнопок правки и генератора', async () => {
  const t = fakeTree(); t.add(null, 'building', 'Корпус 1');
  const el: N = mountTree(t.api, false); await tick();
  assert.ok(rowOf(el, 'Корпус 1'));
  assert.ok(!el.querySelector('[data-testid="lt-gen-open"]') && !el.querySelector('[data-testid="lt-add"]') && !el.querySelector('[data-testid="lt-delete"]'));
});

test('проект в архиве — только просмотр', async () => {
  const t = fakeTree(); t.add(null, 'building', 'Корпус 1');
  const el: N = mountTree(t.api, true, { ...PROJECT, archived_at: '2026-10-21T00:00:00Z' }); await tick();
  assert.ok(!el.querySelector('[data-testid="lt-gen-open"]'));
  assert.ok(el.textContent.includes('в архиве'));
});

test('отказ сервера показан текстом сервера', async () => {
  const t = fakeTree({ fail: 'Узел с таким названием уже есть на этом уровне' });
  const el: N = mountTree(t.api); await tick();
  click(el.querySelector('[data-testid="lt-add-root"]')); await tick();
  const form: N = el.querySelector('[data-testid="lt-add-form"]'); form.elements.namedItem('name').value = 'Корпус'; submit(form); await tick();
  assert.equal(el.querySelector('[role="alert"]').textContent, 'Узел с таким названием уже есть на этом уровне');
});
