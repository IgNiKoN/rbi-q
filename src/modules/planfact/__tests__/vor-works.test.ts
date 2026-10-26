/// <reference types="node" />
/** Черновик ВОР, «Виды работ» (P2-0006, этап 5): счётчики 🟢🟡🔴, 🟢 из словаря сохраняется сам, 🟡 пачкой, 🔴 — создать (без дублей), неизвестная ЕИ. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { VorWorks, verdicts } from '../vor/VorWorks.ts';
import type { DictEntry, Resolution, VorApi, VorRow, WorkType } from '../vor/vor.service.ts';
import type { ProjectsApi, UnitItem } from '../../../platform/core/projects.service.ts';
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

const W = (row_no: number, name: string, unit: string | null): VorRow => ({ id: 'r' + row_no, row_no, kind: 'work', number: null, name, unit_text: unit, qty: 10,
  norm: null, prices: {}, context: {}, parent_row_no: null, location_id: 'L', work_type_id: null, unit_id: null, match: null });
const UNITS: UnitItem[] = [{ id: 'm2', company_id: null, code: 'м²', name: 'м²', is_common: true }, { id: 'sht', company_id: null, code: 'шт.', name: 'шт', is_common: true }];

function setup(rows: VorRow[], types: WorkType[], dict: DictEntry[]) {
  const resolved: Resolution[] = [];
  const learned: { name: string; unit_text: string; work_type_id: string }[] = [];
  const createdTypes: { name: string; unit_id: string | null }[] = [];
  const units = UNITS.slice();
  const api = {
    async listWorkTypes() { return types.slice(); },
    async dictionary() { return dict.slice(); },
    async learn(_p: string, items: typeof learned) { learned.push(...items); for (const i of items) dict.push({ canon_name: i.name.toLowerCase(), unit_text: i.unit_text, work_type_id: i.work_type_id, hits: 1 }); return { ok: true, value: items.length }; },
    async addWorkTypes(_p: string, items: { name: string; unit_id: string | null }[]) {
      createdTypes.push(...items);
      const out = items.map((i, k) => { const id = 'new' + (types.length + k); return { ...i, id, created: true }; });
      out.forEach((o) => types.push({ id: o.id, code: null, name: o.name, unit_id: o.unit_id, unit_code: null }));
      return { ok: true, value: out };
    }
  } as unknown as VorApi;
  const projects = {
    async listUnits() { return units.slice(); },
    async addUnit(_c: string, code: string) { units.push({ id: 'u-' + code, company_id: 'c', code, name: code, is_common: false }); return { ok: true, value: 'u-' + code }; }
  } as unknown as ProjectsApi;
  let current = rows.slice();
  const save = async (items: Resolution[]) => {
    resolved.push(...items);
    current = current.map((r) => { const i = items.find((x) => x.row_no === r.row_no); return i ? { ...r, work_type_id: i.work_type_id, unit_id: i.unit_id, match: i.match } : r; });
    return true;
  };
  return { api, projects, save, resolved, learned, createdTypes, rows: () => current };
}

function mount(props: Record<string, unknown>) {
  const el = win.document.createElement('div');
  win.document.body.appendChild(el);
  const root = createRoot(el as unknown as HTMLElement);
  const render = (p: Record<string, unknown>) => flushSync(() => root.render(createElement(VorWorks, { projectId: 'p1', companyId: 'c', editable: true, canUnits: true, ...p } as N)));
  render(props);
  return { el: el as N, render };
}
const lights = (el: N) => Array.from(el.querySelectorAll('[data-testid="vor-lights"] button') as N[]).map((b: N) => b.textContent);

test('светофор: подтверждённая строка — 🟢 как есть; остальные — по словарю и справочнику', () => {
  const rows = [{ ...W(1, 'x', 'м2'), match: 'green' as const, work_type_id: 'w', unit_id: 'm2' }, W(2, 'Окраска стен', 'м2')];
  const v = verdicts(rows, UNITS, [], []);
  assert.deepEqual(v.map((x) => x.v.light), ['green', 'red']);
});

test('🟢 из словаря сохраняется сам; 🟡 подтверждается пачкой и пополняет словарь; счётчики', async () => {
  const types: WorkType[] = [{ id: 'w1', code: null, name: 'Устройство финишной отделки пола линолеумом', unit_id: 'm2', unit_code: 'м²' }];
  const dict: DictEntry[] = [{ canon_name: 'окраска стен в 2 слоя', unit_text: 'м²', work_type_id: 'w1', hits: 1 }];
  const rows = [W(1, 'Окраска стен в 2 слоя', 'м2'), W(2, 'Устройство финишной отделки полов линолеумом:', 'м2'), W(3, 'Монтаж лючков', 'шт')];
  const s = setup(rows, types, dict);
  const { el, render } = mount({ api: s.api, projects: s.projects, rows, save: s.save });
  await tick(); await tick();
  assert.deepEqual(lights(el), ['Все 3', '🟢 1', '🟡 1', '🔴 1']);
  assert.deepEqual(s.resolved.map((r) => [r.row_no, r.work_type_id, r.match]), [[1, 'w1', 'green']], '🟢 сохранён без действий ПТО');
  render({ api: s.api, projects: s.projects, rows: s.rows(), save: s.save }); await tick();
  el.querySelector('[data-testid="vor-confirm-yellow"]').click(); await tick(); await tick();
  assert.deepEqual(s.learned, [{ name: 'Устройство финишной отделки полов линолеумом:', unit_text: 'м²', work_type_id: 'w1' }]);
  assert.equal(s.rows().find((r) => r.row_no === 2)!.match, 'green');
});

test('🔴 «Создать виды работ для всех»: одинаковые наименования + ЕИ — один вид работ; строки становятся 🟢', async () => {
  const types: WorkType[] = [];
  const rows = [W(1, 'Монтаж лючков:', 'шт'), W(2, 'монтаж  лючков', 'шт.'), W(3, 'Окраска стен', 'м2')];
  const s = setup(rows, types, []);
  const { el, render } = mount({ api: s.api, projects: s.projects, rows, save: s.save });
  await tick();
  assert.deepEqual(lights(el), ['Все 3', '🟢 0', '🟡 0', '🔴 3']);
  el.querySelector('[data-testid="vor-create-red"]').click(); await tick(); await tick();
  assert.deepEqual(s.createdTypes, [{ name: 'Монтаж лючков', unit_id: 'sht' }, { name: 'Окраска стен', unit_id: 'm2' }]);
  assert.ok(s.rows().every((r) => r.match === 'green' && r.work_type_id));
  render({ api: s.api, projects: s.projects, rows: s.rows(), save: s.save }); await tick();
  assert.deepEqual(lights(el), ['Все 3', '🟢 3', '🟡 0', '🔴 0']);
});

test('неизвестная ЕИ: 🔴 с подсказкой и «Добавить ЕИ»; без права — только подсказка; без права ВОР — кнопок нет', async () => {
  const rows = [W(1, 'Пена монтажная', 'мл')];
  const s = setup(rows, [], []);
  const { el } = mount({ api: s.api, projects: s.projects, rows, save: s.save });
  await tick();
  assert.match(el.querySelector('[data-testid="vor-unknown-units"]').textContent, /«мл»/);
  el.querySelector('[data-testid="vor-add-unit"]').click(); await tick(); await tick();
  assert.equal(el.querySelector('[data-testid="vor-unknown-units"]'), null, 'после добавления ЕИ строка стала обычной 🔴');
  const s2 = setup(rows, [], []);
  const m2 = mount({ api: s2.api, projects: s2.projects, rows, save: s2.save, canUnits: false });
  await tick();
  assert.equal(m2.el.querySelector('[data-testid="vor-add-unit"]'), null);
  const s3 = setup([W(1, 'Окраска', 'м2')], [], []);
  const m3 = mount({ api: s3.api, projects: s3.projects, rows: [W(1, 'Окраска', 'м2')], save: s3.save, editable: false });
  await tick();
  assert.equal(m3.el.querySelector('[data-testid="vor-create-red"]'), null);
  assert.equal(m3.el.querySelector('[data-testid="vor-wt-select"]'), null);
});

test('пустая ЕИ: ПТО выбирает ЕИ у строки → сохраняется; дальше строка разбирается как обычная 🔴 с этой ЕИ', async () => {
  const rows = [W(1, 'Монтаж межкомнатных дверей', null)];
  const s = setup(rows, [], []);
  const { el, render } = mount({ api: s.api, projects: s.projects, rows, save: s.save });
  await tick();
  assert.match(el.querySelector('[data-testid="vor-unknown-units"]').textContent, /«пусто»/);
  const sel = el.querySelector('[data-testid="vor-unit-select"]');
  sel.value = 'sht'; sel.dispatchEvent(new win.Event('change', { bubbles: true })); await tick();
  assert.deepEqual(s.resolved.map((r) => [r.row_no, r.unit_id, r.match]), [[1, 'sht', null]]);
  render({ api: s.api, projects: s.projects, rows: s.rows(), save: s.save }); await tick();
  assert.equal(el.querySelector('[data-testid="vor-unknown-units"]'), null);
  el.querySelector('[data-testid="vor-create-red"]').click(); await tick(); await tick();
  assert.deepEqual(s.createdTypes, [{ name: 'Монтаж межкомнатных дверей', unit_id: 'sht' }]);
  assert.equal(s.learned[0].unit_text, '', 'словарь запоминает строку «без ЕИ»');
});

test('КВР / Номенклатура (P2-0012): в «Видах работ» только строки Номенклатуры, у каждой — пояснение; КВР не в списке', async () => {
  const kvr: VorRow = { ...W(1, 'КВР-группа 8', 'м2'), kind: 'group', qty: 41412.7 };
  const rows = [kvr, { ...W(2, 'Работа «Вид 13»', 'м2'), context: { kvr: 1, note: 'Пояснение 17' } }, { ...W(3, 'Работа «Вид 13»', 'м2'), context: { kvr: 1, note: 'Пояснение 18' } }];
  const s = setup(rows, [], []);
  const { el } = mount({ api: s.api, projects: s.projects, rows, save: s.save });
  await tick(); await tick();
  assert.deepEqual(lights(el)[0], 'Все 2');
  assert.deepEqual(Array.from(el.querySelectorAll('[data-testid="vor-wnote"]') as N[]).map((n: N) => n.textContent), ['Пояснение 17', 'Пояснение 18']);
  assert.equal(el.querySelector('[data-row="1"]'), null);
});
