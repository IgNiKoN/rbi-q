/// <reference types="node" />
/** P2-0057, этап 3: «Объекты и места» — PDF-планы: блок «План» карточки (загрузить, заменить, снять, версии, «Сделать текущей»),
 *  PDF на строку этажа — новая версия этого места, несколько PDF на экран — лист сопоставления по имени файла, «Отменить» —
 *  прежняя текущая версия, значок «есть план» в дереве, подсказка о точках замечаний, только просмотр без права. Подставной сервер. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import type { PlaceNode, PlacePlan, PlanTarget, ProjectCard, ProjectsApi } from '../../core/projects.service.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { ObjectsPlaces } = await import('../ObjectsPlaces.ts');
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const click = (b: N) => b.dispatchEvent(new win.Event('click', { bubbles: true }));
const tick = async (): Promise<void> => { await settle(); await settle(); };
const pdf = (name: string): N => new win.File(['%PDF-1.4'], name, { type: 'application/pdf' });
function drop(el: N, files: N[]): void {
  const ev: N = new win.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', { value: { types: ['Files'], files } });
  el.dispatchEvent(ev);
}
function pick(input: N, files: N[]): void {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
}

const PROJECT: ProjectCard = { id: 'p1', name: 'ЖК Тест', code: null, archived_at: null, created_at: '', can_manage: true, division_id: null, division_name: null,
  address: null, planned_start: null, planned_finish: null, manager_user_id: null, manager_name: null, stage: 'construction', our_role: null,
  timezone: 'Europe/Moscow', country: 'RU', object_count: 1, place_count: 6, places_led_by_quality: false };
const KINDS = [{ code: 'building', name: 'Корпус', sort_order: 1 }];
const P = (id: string, parent: string | null, type: string, name: string, kids = 0): PlaceNode => ({ id, parent_id: parent, node_type: type, object_kind: type === 'object' ? 'building' : null,
  name, build_no: null, bti_no: null, sort_order: 1, depth: 1, path: name, child_count: kids, apartment_count: null } as unknown as PlaceNode);

function fakeServer() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const tree: Record<string, PlaceNode[]> = {
    '': [P('k1', null, 'object', 'Корпус 1', 1)],
    k1: [P('s1', 'k1', 'section', 'Секция 1', 2)],
    s1: [P('f1', 's1', 'floor', 'эт. 1', 1), P('f2', 's1', 'floor', 'эт. 2', 0)],
    f1: [P('a1', 'f1', 'apartment', 'кв. 1')]
  };
  let docs: PlacePlan[] = [];
  let seq = 0;
  const add = (loc: string, name: string): { id: string; versionNo: number; previousId: string | null } => {
    const prev = docs.find((d) => d.location_id === loc && d.is_current) || null;
    docs.forEach((d) => { if (d.location_id === loc) d.is_current = false; });
    const no = docs.filter((d) => d.location_id === loc).length + 1;
    const id = 'd' + (++seq);
    docs.push({ id, location_id: loc, version_no: no, is_current: true, file_name: name, file_size: 2048, file_url: 'https://api.test/x/' + id + '.pdf',
      created_by: 'u1', author: 'Иванов Иван', created_at: '2026-10-31T09:00:00Z' });
    return { id, versionNo: no, previousId: prev ? prev.id : null };
  };
  const api = {
    async projectPlaces(_p: string, parent: string | null) { return (tree[parent || ''] || []).map((n) => ({ ...n })); },
    async savePlace() { return { ok: true, value: 'x' }; },
    async placePlans(p: string) { calls.push({ fn: 'list', args: [p] }); return { ok: true, value: docs.map((d) => ({ ...d })) }; },
    async uploadPlacePlan(t: PlanTarget, f: N) { calls.push({ fn: 'upload', args: [t, f.name] }); return { ok: true, value: add(t.id, f.name) }; },
    async setPlacePlan(id: string) {
      calls.push({ fn: 'set', args: [id] }); const d = docs.find((x) => x.id === id)!;
      const prev = docs.find((x) => x.location_id === d.location_id && x.is_current) || null;
      docs.forEach((x) => { if (x.location_id === d.location_id) x.is_current = x.id === id; });
      return { ok: true, value: { id, versionNo: d.version_no, previousId: prev ? prev.id : null } };
    },
    async removePlacePlan(loc: string) {
      calls.push({ fn: 'remove', args: [loc] }); const prev = docs.find((x) => x.location_id === loc && x.is_current) || null;
      docs.forEach((x) => { if (x.location_id === loc) x.is_current = false; });
      return { ok: true, value: { id: null, versionNo: null, previousId: prev ? prev.id : null } };
    },
    async placePins(loc: string) { calls.push({ fn: 'pins', args: [loc] }); return 3; }
  } as unknown as ProjectsApi;
  return { api, calls, get docs() { return docs; } };
}
function mount(api: ProjectsApi, project: ProjectCard = PROJECT) {
  const el: N = win.document.createElement('div'); win.document.body.appendChild(el);
  const root = createRoot(el);
  flushSync(() => root.render(createElement(ObjectsPlaces, { api, project, kinds: KINDS, companyId: 'c1' })));
  return { el, root };
}
const q = (el: N, id: string): N => el.querySelector(`[data-testid="${id}"]`) || win.document.querySelector(`[data-testid="${id}"]`);
const row = (el: N, name: string): N => [...el.querySelectorAll('[data-node-id]')].find((n: N) => n.querySelector('.p2-tree__name b')?.textContent === name);
async function openTo(el: N, name: string): Promise<void> {
  for (const n of ['Секция 1', 'эт. 1']) {
    const r = row(el, n);
    const tog = r && r.querySelector('[data-testid="p2-tree-toggle"]');
    if (tog && tog.getAttribute('aria-expanded') !== 'true') { click(tog); await tick(); }
    if (n === name) break;
  }
  click(row(el, name).querySelector('[data-testid="p2-tree-open"]')); await tick();
}

test('карточка этажа без плана: «Загрузить план» → файл в ядро (место, проект, компания) → версия 1; значок в дереве; «Отменить» снимает', async () => {
  const s = fakeServer(); const { el, root } = mount(s.api); await tick();
  await openTo(el, 'эт. 2');
  assert.match(q(el, 'op-plan-none').textContent, /Плана нет/);
  assert.equal(q(el, 'op-plan-upload').textContent, 'Загрузить план');
  pick(q(el, 'op-plan-file'), [pdf('Этаж 2.pdf')]); await tick(); await tick();
  assert.deepEqual(s.calls.find((c) => c.fn === 'upload')!.args, [{ id: 'f2', projectId: 'p1', companyId: 'c1' }, 'Этаж 2.pdf']);
  assert.ok(!s.calls.some((c) => c.fn === 'pins'), 'плана не было — точки не спрашиваем');
  assert.match(q(el, 'op-plan-current').textContent, /Этаж 2\.pdf.*версия 1/);
  assert.match(row(el, 'эт. 2').textContent, /есть план/);
  assert.match(q(el, 'op-toast').textContent, /План «эт\. 2»: версия 1/);
  click(q(el, 'op-undo')); await tick(); await tick();
  assert.deepEqual(s.calls.filter((c) => c.fn === 'remove').map((c) => c.args), [['f2']]);
  assert.match(q(el, 'op-plan-none').textContent, /План снят/);
  root.unmount();
});

test('замена: подсказка о точках, «Версии (2)», «Сделать текущей» первую, «Снять» и «Отменить» возвращает', async () => {
  const s = fakeServer(); const { el, root } = mount(s.api); await tick();
  await openTo(el, 'эт. 1');
  pick(q(el, 'op-plan-file'), [pdf('Этаж 1.pdf')]); await tick(); await tick();
  assert.equal(q(el, 'op-plan-upload').textContent, 'Заменить');
  pick(q(el, 'op-plan-file'), [pdf('Этаж 1 изм.pdf')]); await tick(); await tick();
  assert.match(q(el, 'op-toast').textContent, /версия 2.*На этом плане 3 замечания — точки останутся на тех же местах листа/);
  click(q(el, 'op-plan-versions-toggle')); await tick();
  const vers = el.querySelectorAll('[data-testid="op-plan-version"]');
  assert.equal(vers.length, 2);
  assert.match(vers[0].textContent, /№ 2.*текущая/);
  click(vers[1].querySelector('[data-testid="op-plan-v-current"]')); await tick(); await tick();
  assert.deepEqual(s.calls.filter((c) => c.fn === 'set').map((c) => c.args), [['d1']]);
  assert.match(q(el, 'op-plan-current').textContent, /Этаж 1\.pdf.*версия 1/);
  click(q(el, 'op-plan-remove')); await tick(); await tick();
  assert.match(q(el, 'op-plan-none').textContent, /План снят/);
  click(q(el, 'op-undo')); await tick(); await tick();
  assert.deepEqual(s.calls.filter((c) => c.fn === 'set').map((c) => c.args), [['d1'], ['d1']]);
  assert.match(q(el, 'op-plan-current').textContent, /версия 1/);
  root.unmount();
});

test('PDF на строку квартиры — новая версия этой квартиры; на строке подсветки «нельзя» нет', async () => {
  const s = fakeServer(); const { el, root } = mount(s.api); await tick();
  await openTo(el, 'эт. 1');
  const r = row(el, 'кв. 1').querySelector('.p2-tree__row');
  drop(r.querySelector('.p2-tree__name'), [pdf('кв 1.pdf')]); await tick(); await tick();
  assert.deepEqual(s.calls.find((c) => c.fn === 'upload')!.args, [{ id: 'a1', projectId: 'p1', companyId: 'c1' }, 'кв 1.pdf']);
  assert.ok(!r.className.includes('is-drop-no'));
  root.unmount();
});

test('несколько PDF на экран — лист «куда какой файл»: по имени, не нашлось — выберите, «Загрузить 2» и «Отменить» всё', async () => {
  const s = fakeServer(); const { el, root } = mount(s.api); await tick();
  drop(q(el, 'op-root'), [pdf('Этаж 1.pdf'), pdf('2 этаж.pdf'), pdf('Общий план.pdf')]); await tick(); await tick();
  const rows = el.ownerDocument.querySelectorAll('[data-testid="op-pm-row"]');
  assert.equal(rows.length, 3);
  const sel = [...el.ownerDocument.querySelectorAll('[data-testid="op-pm-select"]')].map((x: N) => x.value);
  assert.deepEqual(sel, ['f1', 'f2', '']);
  assert.match(rows[2].textContent, /нет номера/);
  assert.match(q(el, 'op-pm-sum').textContent, /Загрузим 2 из 3 файлов на 2 мест/);
  click(q(el, 'op-pm-go')); await tick(); await tick(); await tick();
  assert.deepEqual(s.calls.filter((c) => c.fn === 'upload').map((c) => [(c.args[0] as PlanTarget).id, c.args[1]]), [['f1', 'Этаж 1.pdf'], ['f2', '2 этаж.pdf']]);
  assert.ok(!q(el, 'op-plans-match'));
  assert.match(q(el, 'op-toast').textContent, /Загружено планов: 2/);
  click(q(el, 'op-undo')); await tick(); await tick();
  assert.deepEqual(s.calls.filter((c) => c.fn === 'remove').map((c) => c.args[0]).sort(), ['f1', 'f2']);
  root.unmount();
});

test('без права вести места: план виден и открывается, загрузки и «Снять» нет', async () => {
  const s = fakeServer();
  await s.api.uploadPlacePlan!({ id: 'f1', projectId: 'p1', companyId: 'c1' }, pdf('Этаж 1.pdf'));
  const { el, root } = mount(s.api, { ...PROJECT, can_manage: false }); await tick();
  await openTo(el, 'эт. 1');
  assert.match(q(el, 'op-plan-current').textContent, /Этаж 1\.pdf/);
  assert.ok(q(el, 'op-plan-open'));
  assert.ok(!q(el, 'op-plan-upload') && !q(el, 'op-plan-remove'));
  root.unmount();
});
