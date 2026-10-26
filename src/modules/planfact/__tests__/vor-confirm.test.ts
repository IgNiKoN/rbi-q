/// <reference types="node" />
/** Подтверждение ВОР (P2-0006, этап 6): блокировка до готовности, подтверждение, Σ позиций = объём строки, список позиций и фильтр по месту. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { VorDraft } from '../vor/VorDraft.ts';
import { VorPositions, sumByRow } from '../vor/VorPositions.ts';
import type { VorApi, VorImport, VorPosition, VorRow } from '../vor/vor.service.ts';
import type { LocationNode, ProjectsApi } from '../../../platform/core/projects.service.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
before(() => {
  g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
  g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
});
const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const IMP: VorImport = { id: 'i1', file_name: 'ФКП.xlsx', sheet_name: '142', status: 'draft', row_count: 2, works: 2, positions: 0,
  created_at: '2026-10-21T10:00:00Z', created_by_email: null, confirmed_at: null, profile_id: null };
const W = (row_no: number, qty: number | null, done: boolean): VorRow => ({ id: 'r' + row_no, row_no, kind: 'work', number: null, name: 'Работа ' + row_no,
  unit_text: 'м2', qty, norm: null, prices: {}, context: { section: '1' }, parent_row_no: null,
  location_id: 's1', work_type_id: done ? 'w' : null, unit_id: 'm2', match: done ? 'green' : null });
const P = (id: string, row: number, qty: number, loc = 's1', path = 'Секция 1'): VorPosition => ({ id, location_id: loc, location_path: path, work_type_id: 'w',
  work_type: 'Работа ' + row, unit_code: 'м²', qty, apartments_note: null, import_id: 'i1', file_name: 'ФКП.xlsx', source_row_no: row });
const NODES: LocationNode[] = [{ id: 's1', parent_id: null, node_type: 'section', name: 'Секция 1', sort_order: 0, area: null, depth: 1, path: 'Секция 1', child_count: 0 }];

function fake(rows: VorRow[], positions: VorPosition[]) {
  let confirmed = 0;
  const api = {
    async importRows() { return rows.map((r) => ({ ...r })); },
    async resolveRows() { return { ok: true, value: 0 }; },
    async listWorkTypes() { return [{ id: 'w', code: null, name: 'Работа', unit_id: 'm2', unit_code: 'м²' }]; },
    async dictionary() { return []; },
    async confirm() { confirmed++; return { ok: true, value: rows.length }; },
    async positions(_p: string, loc: string | null) { return positions.filter((x) => !loc || x.location_id === loc); }
  } as unknown as VorApi;
  const projects = {
    async listUnits() { return [{ id: 'm2', company_id: null, code: 'м²', name: 'м²', is_common: true }]; },
    async listLocations(_p: string, parent: string | null) { return NODES.filter((n) => n.parent_id === parent); }
  } as unknown as ProjectsApi;
  return { api, projects, confirmed: () => confirmed };
}
function mount(type: N, props: Record<string, unknown>) {
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  const root = createRoot(el as unknown as HTMLElement);
  const render = (p: Record<string, unknown>) => flushSync(() => root.render(createElement(type, p as N)));
  render(props);
  return { el: el as N, render };
}

test('Σ позиций = объём строки заказчика по каждой строке; расхождение и пропуск видны', () => {
  const rows = [W(1, 10, true), W(2, 0, true), W(3, 5.5, true)];
  assert.deepEqual(sumByRow(rows, [P('a', 1, 10), P('b', 2, 0), P('c', 3, 5.5)]), { rows: 3, ok: 3, bad: [] });
  const r = sumByRow(rows, [P('a', 1, 9.99), P('b', 2, 0)]);
  assert.deepEqual(r.bad, [{ row_no: 1, expected: 10, actual: 9.99 }, { row_no: 3, expected: 5.5, actual: 0 }]);
});

test('подтверждение заблокировано, пока есть неподтверждённые виды работ; готово → «Подтвердить ВОР» → позиции созданы', async () => {
  const notReady = fake([W(1, 10, true), W(2, 20, false)], []);
  const a = mount(VorDraft, { api: notReady.api, projects: notReady.projects, projectId: 'p1', companyId: 'c', imp: IMP, canManage: true, canProjects: true, canUnits: true, onBack: () => undefined, onChanged: () => undefined });
  await tick(); await tick();
  assert.equal(a.el.querySelector('[data-testid="vor-confirm"]').disabled, true);
  assert.match(a.el.querySelector('[data-ready="types"]').textContent, /✗ .*1 из 2/);
  const ready = fake([W(1, 10, true), W(2, 20, true)], []);
  let changed = 0;
  const b = mount(VorDraft, { api: ready.api, projects: ready.projects, projectId: 'p1', companyId: 'c', imp: IMP, canManage: true, canProjects: true, canUnits: true, onBack: () => undefined, onChanged: () => { changed++; } });
  await tick(); await tick();
  const btn = b.el.querySelector('[data-testid="vor-confirm"]');
  assert.equal(btn.disabled, false);
  btn.click(); await tick();
  assert.equal(ready.confirmed(), 1);
  assert.equal(changed, 1);
  assert.match(b.el.querySelector('[role="status"]').textContent, /создано позиций — 2/);
});

test('подтверждённая загрузка: только просмотр — позиции, Σ сходится, кнопок изменения нет', async () => {
  const f = fake([W(1, 10, true), W(2, 20, true)], [P('a', 1, 10), P('b', 2, 20)]);
  const { el } = mount(VorDraft, { api: f.api, projects: f.projects, projectId: 'p1', companyId: 'c', imp: { ...IMP, status: 'confirmed', confirmed_at: '2026-10-21T12:00:00Z' },
    canManage: true, canProjects: true, canUnits: true, onBack: () => undefined, onChanged: () => undefined });
  await tick(); await tick();
  assert.ok(el.querySelector('[data-testid="vor-confirmed"]'));
  assert.match(el.querySelector('[data-testid="vor-sum-check"]').textContent, /Суммы сходятся.*2 из 2/);
  assert.equal(el.querySelectorAll('[data-position]').length, 2);
  for (const id of ['vor-confirm', 'vor-create-missing', 'vor-create-red', 'vor-confirm-yellow', 'vor-wt-select']) assert.equal(el.querySelector(`[data-testid="${id}"]`), null, id);
});

test('позиции проекта: «место · вид работ · ЕИ · объём», фильтр по месту', async () => {
  const f = fake([], [P('a', 1, 399.89, 's1', 'Корпус 7 · Секция 1'), P('b', 2, 20, 's2', 'Корпус 7 · Секция 2')]);
  const { el } = mount(VorPositions, { api: f.api, projectId: 'p1' });
  await tick();
  assert.equal(el.querySelectorAll('[data-position]').length, 2);
  assert.match(el.querySelector('[data-position="a"]').textContent, /Корпус 7 · Секция 1.*Работа 1.*м².*399,89/);
  const sel = el.querySelector('[data-testid="vor-pos-place"]');
  sel.value = 's2'; sel.dispatchEvent(new win.Event('change', { bubbles: true })); await tick();
  assert.deepEqual(Array.from(el.querySelectorAll('[data-position]') as N[]).map((x: N) => x.dataset.position), ['b']);
});
