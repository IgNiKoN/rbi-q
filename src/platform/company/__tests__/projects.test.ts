/// <reference types="node" />
/** «Проекты» (P2-0005): список, создать, переименовать, архив, только чтение, подвкладки «План/Факт». Подставной API, DOM — happy-dom. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { CompanyScope } from '../CompanyScope.ts';
import { ProjectsTab } from '../ProjectsTab.ts';
import { PlanfactApp, routeFromHash, ROUTE_EVENT } from '../../../modules/planfact/PlanfactApp.ts';
import { UnitsTab } from '../UnitsTab.ts';
import type { CompanyAccess, ProjectItem, ProjectsApi, UnitItem } from '../../core/projects.service.ts';
import type { Result } from '../company.service.ts';
import type { AuthApi } from '../../auth/auth.service.ts';
import type { PlanfactDemo } from '../../../modules/planfact/model.ts';
import demo from '../../../modules/planfact/demo-data.json' with { type: 'json' };
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
const click = (b: N) => b.dispatchEvent(new win.Event('click', { bubbles: true }));
const submit = (f: N) => f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));

export const ACCESS_ADMIN: CompanyAccess = { company_id: 'c1', company_name: 'Альфа', can_manage_projects: true, can_manage_units: true, can_manage_roles: true, can_manage_counterparties: true };
export const ACCESS_READ: CompanyAccess = { company_id: 'c1', company_name: 'Альфа', can_manage_projects: false, can_manage_units: false, can_manage_roles: false, can_manage_counterparties: false };

const P = (id: string, name: string, over: Partial<ProjectItem> = {}): ProjectItem =>
  ({ id, name, code: null, archived_at: null, created_at: '2026-10-21T00:00:00Z', can_manage: true, ...over });

export function fakeApi(opts: { fail?: string; access?: CompanyAccess[]; projects?: ProjectItem[]; units?: UnitItem[] } = {}) {
  const calls: string[] = [];
  let units: UnitItem[] = opts.units || [
    { id: 'u1', company_id: null, code: 'м²', name: 'Квадратный метр', is_common: true },
    { id: 'u2', company_id: null, code: 'шт.', name: 'Штука', is_common: true }];
  let projects = opts.projects || [P('p1', 'ЖК Тест', { code: 'T-1' })];
  const res = <T = null>(value: T): Result<T> => opts.fail ? { ok: false, message: opts.fail } : { ok: true, value };
  const api: ProjectsApi = {
    async myAccess() { return opts.access || [ACCESS_ADMIN]; },
    async listProjects() { return projects; },
    async createProject(_c, name, code) { calls.push(`create:${name}:${code}`); if (!opts.fail) projects = [...projects, P('p-new', name, { code: code || null })]; return res('p-new'); },
    async updateProject(id, name, code, archived) {
      calls.push(`update:${id}:${name}:${code}:${archived}`);
      if (!opts.fail) projects = projects.map((p) => p.id !== id ? p : { ...p, name, code: code || null, archived_at: archived === null ? p.archived_at : archived ? '2026-10-21T01:00:00Z' : null });
      return res(null);
    },
    async listLocations() { return []; }, async addLocation() { return res(''); }, async renameLocation() { return res(null); },
    async deleteLocation() { return res(0); }, async generateBuilding() { return res(''); },
    async listUnits() { return units; },
    async addUnit(_c, code, name) { calls.push(`addUnit:${code}:${name}`); if (!opts.fail) units = [...units, { id: 'u-new', company_id: 'c1', code, name, is_common: false }]; return res('u-new'); },
    async deleteUnit(id) { calls.push(`deleteUnit:${id}`); if (!opts.fail) units = units.filter((u) => u.id !== id); return res(null); }
  };
  return { api, calls };
}

function mountTab(api: ProjectsApi, company: CompanyAccess) {
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const root = createRoot(el as unknown as HTMLElement);
  flushSync(() => root.render(createElement(ProjectsTab, { api, company })));
  return el;
}

test('список проектов компании; код виден', async () => {
  const el: N = mountTab(fakeApi().api, ACCESS_ADMIN); await tick();
  assert.equal(el.querySelectorAll('[data-project-id]').length, 1);
  assert.ok(el.textContent.includes('ЖК Тест') && el.textContent.includes('T-1'));
});

test('создать проект: название и код уходят на сервер, проект появляется в списке', async () => {
  const { api, calls } = fakeApi(); const el: N = mountTab(api, ACCESS_ADMIN); await tick();
  const form: N = el.querySelector('[data-testid="pj-create"]');
  form.elements.namedItem('name').value = '  ЖК Новый '; form.elements.namedItem('code').value = 'N-2';
  submit(form); await tick();
  assert.deepEqual(calls, ['create:ЖК Новый:N-2']);
  assert.equal(el.querySelectorAll('[data-project-id]').length, 2);
  assert.ok(el.querySelector('[role="status"]'));
});

test('пустое название — ошибка, на сервер не уходит', async () => {
  const { api, calls } = fakeApi(); const el: N = mountTab(api, ACCESS_ADMIN); await tick();
  submit(el.querySelector('[data-testid="pj-create"]')); await tick();
  assert.deepEqual(calls, []);
  assert.ok(el.querySelector('[role="alert"]').textContent.includes('название'));
});

test('переименование проекта', async () => {
  const { api, calls } = fakeApi(); const el: N = mountTab(api, ACCESS_ADMIN); await tick();
  click(el.querySelector('[data-testid="pj-rename"]')); await tick();
  const form: N = el.querySelector('.pj-row--edit');
  form.elements.namedItem('name').value = 'ЖК Тест 2'; form.elements.namedItem('code').value = 'T-1';
  submit(form); await tick();
  assert.deepEqual(calls, ['update:p1:ЖК Тест 2:T-1:null']);
  assert.ok(el.textContent.includes('ЖК Тест 2'));
});

test('архив: проект уходит из списка, «Показать архив» возвращает его; из архива можно вернуть', async () => {
  const { api, calls } = fakeApi(); const el: N = mountTab(api, ACCESS_ADMIN); await tick();
  click(el.querySelector('[data-testid="pj-archive"]')); await tick();
  assert.deepEqual(calls, ['update:p1:ЖК Тест:T-1:true']);
  assert.equal(el.querySelectorAll('[data-project-id]').length, 0);
  assert.ok(el.querySelector('[data-testid="pj-empty"]'));
  click(el.querySelector('.pj-toggle')); await tick();
  assert.ok(el.textContent.includes('в архиве'));
  click(el.querySelector('[data-testid="pj-archive"]')); await tick();
  assert.equal(calls[1], 'update:p1:ЖК Тест:T-1:false');
});

test('без права — только чтение: нет формы создания и кнопок правки', async () => {
  const { api } = fakeApi({ projects: [P('p1', 'ЖК Тест', { can_manage: false })] });
  const el: N = mountTab(api, ACCESS_READ); await tick();
  assert.ok(el.querySelector('[data-project-id]'));
  assert.ok(!el.querySelector('[data-testid="pj-create"]'));
  assert.ok(!el.querySelector('[data-testid="pj-rename"]') && !el.querySelector('[data-testid="pj-archive"]'));
});

test('отказ сервера показан текстом сервера', async () => {
  const { api } = fakeApi({ fail: 'Нет права управлять проектами' }); const el: N = mountTab(api, ACCESS_ADMIN); await tick();
  const form: N = el.querySelector('[data-testid="pj-create"]');
  form.elements.namedItem('name').value = 'X'; submit(form); await tick();
  assert.equal(el.querySelector('[role="alert"]').textContent, 'Нет права управлять проектами');
});

test('нет доступа ни к одной компании — сообщение', async () => {
  const el: N = win.document.createElement('div'); win.document.body.appendChild(el);
  const { api } = fakeApi({ access: [] });
  flushSync(() => createRoot(el).render(createElement(CompanyScope, { api, render: () => createElement('div') }))); await tick();
  assert.ok(el.querySelector('[data-testid="pj-noaccess"]'));
});

test('адрес → страница модуля', () => {
  assert.deepEqual(routeFromHash('#/planfact'), { page: 'summary', sub: 'objects' });
  assert.equal(routeFromHash('#/planfact/directories/units').sub, 'units');
  assert.equal(routeFromHash('#/planfact/directories').page, 'directories');
  assert.equal(routeFromHash('#/planfact/directories/objects').page, 'directories');
  assert.equal(routeFromHash('#/planfact/что-то').page, 'summary');
  assert.equal(routeFromHash('#/planfact/summary').page, 'summary');
});

function fakeAuth(): AuthApi {
  return { async signIn() { return { ok: true }; }, async signOut() { /* нет */ }, async getEmail() { return 'adm@test.invalid'; },
    async getAccess() { return [{ company: 'Альфа', role: 'Администратор компании', projectId: null }]; } };
}
function mountApp(projects: ProjectsApi | null, onAccess?: (h: boolean) => void) {
  const el: N = win.document.createElement('div'); win.document.body.appendChild(el);
  flushSync(() => createRoot(el).render(createElement(PlanfactApp, { auth: fakeAuth(), data: demo as PlanfactDemo, api: null, projects, onAccess })));
  return el;
}

test('План/Факт: «Справочники» (#/planfact/directories) показывают проекты; модуль сообщает оболочке, что доступ есть', async () => {
  win.location.hash = '#/planfact/directories';
  const seen: boolean[] = [];
  const el = mountApp(fakeApi().api, (h) => seen.push(h)); await tick();
  assert.deepEqual(seen, [true]);
  assert.ok(el.querySelector('[data-testid="pj-projects"]'));
  assert.ok(el.textContent.includes('Справочники'));
  assert.ok(!el.querySelector('[data-testid="pf-tabs"]'), 'внутри страницы нет собственной панели вкладок — пункты в боковом меню');
});

test('План/Факт: #/planfact — не справочники (по умолчанию «Сводка», P2-0009); смена адреса переключает страницу', async () => {
  win.location.hash = '#/planfact';
  const el = mountApp(fakeApi().api); await tick();
  assert.ok(!el.querySelector('[data-testid="pj-projects"]'));
  win.location.hash = '#/planfact/directories'; win.dispatchEvent(new win.Event('hashchange')); await tick();
  assert.ok(el.querySelector('[data-testid="pj-projects"]'));
});

test('План/Факт: нет доступа к компании — справочники не открываются, оболочке сообщено «нет»', async () => {
  win.location.hash = '#/planfact/directories';
  const seen: boolean[] = [];
  const el = mountApp(fakeApi({ access: [] }).api, (h) => seen.push(h)); await tick();
  assert.deepEqual(seen, [false]);
  assert.ok(!el.querySelector('[data-testid="pj-projects"]'));
});

test('переход через роутер оболочки (history.pushState, без hashchange) тоже открывает «Справочники»', async () => {
  win.location.hash = '#/planfact';
  const el = mountApp(fakeApi().api); await tick();
  assert.ok(!el.querySelector('[data-testid="pj-projects"]'));
  win.history.pushState(null, '', '#/planfact/directories');   // так переходит AppRouter.navigate — hashchange не приходит
  win.dispatchEvent(new win.Event(ROUTE_EVENT)); await tick();
  assert.ok(el.querySelector('[data-testid="pj-projects"]'));
  win.history.pushState(null, '', '#/planfact'); win.dispatchEvent(new win.Event(ROUTE_EVENT)); await tick();
  assert.ok(!el.querySelector('[data-testid="pj-projects"]'));
});

function mountUnits(api: ProjectsApi, company: CompanyAccess) {
  const el: N = win.document.createElement('div'); win.document.body.appendChild(el);
  flushSync(() => createRoot(el).render(createElement(UnitsTab, { api, company })));
  return el;
}

test('единицы: общие отдельно от своих, у общих нет кнопки удаления', async () => {
  const el: N = mountUnits(fakeApi().api, ACCESS_ADMIN); await tick();
  assert.equal(el.querySelectorAll('[data-testid="un-common"] [data-unit-id]').length, 2);
  assert.ok(el.querySelector('[data-testid="un-own-empty"]'));
  assert.ok(!el.querySelector('[data-testid="un-common"] [data-testid="un-delete"]'));
  assert.ok(el.textContent.includes('м²') && el.textContent.includes('Квадратный метр'));
});

test('единицы: добавить свою — появляется в «своих», на сервер уходят обозначение и название', async () => {
  const { api, calls } = fakeApi(); const el: N = mountUnits(api, ACCESS_ADMIN); await tick();
  const form: N = el.querySelector('[data-testid="un-add"]');
  form.elements.namedItem('code').value = ' м² пола '; form.elements.namedItem('name').value = 'Площадь пола';
  submit(form); await tick();
  assert.deepEqual(calls, ['addUnit:м² пола:Площадь пола']);
  assert.equal(el.querySelectorAll('[data-testid="un-own"] [data-unit-id]').length, 1);
});

test('единицы: пустые поля — ошибка без вызова сервера; отказ сервера (дубль) показан', async () => {
  const t = fakeApi(); const el: N = mountUnits(t.api, ACCESS_ADMIN); await tick();
  submit(el.querySelector('[data-testid="un-add"]')); await tick();
  assert.deepEqual(t.calls, []);
  assert.ok(el.querySelector('[role="alert"]'));
  const f = fakeApi({ fail: 'Единица с таким обозначением уже есть' }); const el2: N = mountUnits(f.api, ACCESS_ADMIN); await tick();
  const form: N = el2.querySelector('[data-testid="un-add"]'); form.elements.namedItem('code').value = 'кг'; form.elements.namedItem('name').value = 'x';
  submit(form); await tick();
  assert.equal(el2.querySelector('[role="alert"]').textContent, 'Единица с таким обозначением уже есть');
});

test('единицы: удаление своей — только с подтверждением', async () => {
  const { api, calls } = fakeApi({ units: [{ id: 'u1', company_id: null, code: 'м²', name: 'Квадратный метр', is_common: true },
    { id: 'u9', company_id: 'c1', code: 'пог.м', name: 'Свой', is_common: false }] });
  const el: N = mountUnits(api, ACCESS_ADMIN); await tick();
  click(el.querySelector('[data-testid="un-delete"]')); await tick();
  assert.deepEqual(calls, []);
  click(el.querySelector('[data-testid="un-delete-yes"]')); await tick();
  assert.deepEqual(calls, ['deleteUnit:u9']);
  assert.ok(el.querySelector('[data-testid="un-own-empty"]'));
});

test('единицы: без права — только чтение', async () => {
  const { api } = fakeApi({ units: [{ id: 'u9', company_id: 'c1', code: 'пог.м', name: 'Свой', is_common: false }] });
  const el: N = mountUnits(api, ACCESS_READ); await tick();
  assert.ok(el.querySelector('[data-unit-id]'));
  assert.ok(!el.querySelector('[data-testid="un-add"]') && !el.querySelector('[data-testid="un-delete"]'));
});

test('справочники: вкладки «Объекты» / «Единицы» / «Бригады», переключение идёт через роутер оболочки', async () => {
  win.location.hash = '#/planfact/directories';
  const nav: string[] = [];
  (win as N).AppRouter = { navigate: (p: string) => { nav.push(p); win.history.pushState(null, '', p); win.dispatchEvent(new win.Event(ROUTE_EVENT)); } };
  const el = mountApp(fakeApi().api); await tick();
  assert.deepEqual([...el.querySelectorAll('[data-testid="pf-dirtabs"] [role="tab"]')].map((t: N) => t.textContent), ['Объекты', 'Единицы', 'Бригады']);
  assert.ok(el.querySelector('[data-testid="pj-projects"]'));
  click(el.querySelector('[data-sub="units"]')); await tick();
  assert.deepEqual(nav, ['#/planfact/directories/units']);
  assert.ok(el.querySelector('[data-testid="un-units"]') && !el.querySelector('[data-testid="pj-projects"]'));
  click(el.querySelector('[data-sub="objects"]')); await tick();
  assert.ok(el.querySelector('[data-testid="pj-projects"]'));
  delete (win as N).AppRouter;
});
