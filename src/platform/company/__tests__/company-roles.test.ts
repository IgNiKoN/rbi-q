/// <reference types="node" />
/** «Компания → Роли»: шаблоны только копируются, галочки по группам, сохранение, удаление, ошибки сервера, доступ. Подставной API, DOM — happy-dom. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { CompanyRoles } from '../CompanyRoles.ts';
import { CompanyApp, visibleTabs, rightsFrom } from '../CompanyApp.ts';
import { groupCatalog } from '../action-groups.ts';
import { mapCompanyError } from '../company.service.ts';
import type { CompanyApi, RoleRow, Result } from '../company.service.ts';
import type { AuthApi } from '../../auth/auth.service.ts';
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

const CATALOG = [
  { action: 'planfact.works.view', description: 'Просмотр работ плана' },
  { action: 'planfact.works.edit', description: 'Добавление и правка работ (ВОР, ГПР)' },
  { action: 'planfact.fact.create', description: 'Ввод фактического объёма' },
  { action: 'security.roles.assign', description: 'Назначение и отзыв ролей пользователей' }
];

function fakeApi(opts: { fail?: string } = {}) {
  const calls: string[] = [];
  let roles: RoleRow[] = [
    { id: 'tpl-for', name: 'Прораб / мастер', template_code: 'foreman', actions: ['planfact.fact.create', 'planfact.works.view'], active_assignments: 1 },
    { id: 'own', name: 'Мастер участка', template_code: null, actions: ['planfact.works.view'], active_assignments: 0 }
  ];
  const res = <T = null>(value: T): Result<T> => opts.fail ? { ok: false, message: opts.fail } : { ok: true, value };
  const api: CompanyApi = {
    async listContractors() { return [{ id: 'k1', name: 'ООО «Альфа-Строй»' }, { id: 'k2', name: 'Бета Монтаж', draft: true }]; },
    async myAdminCompanies() { return [{ company_id: 'c1', company_name: 'Альфа' }]; },
    async catalog() { return CATALOG; },
    async listRoles() { return roles; },
    async listMembers() { return []; },
    async addMember() { return { ok: false, message: 'нет' }; }, async resetPassword() { return { ok: false, message: 'нет' }; }, async disableMember() { return res(null); }, async setFullName() { return res(0); },
    async listProjects() { return []; },
    async listAudit() { return []; },
    async createRole(src, name) {
      calls.push(`create:${src}:${name}`);
      if (opts.fail) return res('');
      const s = roles.find((r) => r.id === src)!;
      roles = [...roles, { id: 'new', name, template_code: null, actions: [...s.actions], active_assignments: 0 }];
      return res('new');
    },
    async renameRole(id, name) { calls.push(`rename:${id}:${name}`); if (!opts.fail) roles = roles.map((r) => r.id === id ? { ...r, name } : r); return res(null); },
    async setRoleActions(id, actions) { calls.push(`actions:${id}:${[...actions].sort().join(',')}`); if (!opts.fail) roles = roles.map((r) => r.id === id ? { ...r, actions: [...actions].sort() } : r); return res(null); },
    async deleteRole(id) { calls.push(`delete:${id}`); if (!opts.fail) roles = roles.filter((r) => r.id !== id); return res(null); },
    async assignRole() { return res('a1'); },
    async revoke() { return res(null); }
  };
  return { api, calls };
}
function mountRoles(api: CompanyApi) {
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  flushSync(() => createRoot(el as N).render(createElement(CompanyRoles, { api, companyId: 'c1' })));
  return el as N;
}
const box = (el: N, action: string) => el.querySelector(`input[data-action="${action}"]`);

test('шаблон: пометка «только копия», галочки недоступны, нет удаления и сохранения', async () => {
  const el = mountRoles(fakeApi().api);
  await tick();
  assert.ok(el.querySelector('[data-testid=co-template-note]'));
  assert.equal(box(el, 'planfact.fact.create').checked, true);
  assert.equal(box(el, 'planfact.fact.create').disabled, true);
  assert.ok(!el.querySelector('[data-testid=co-delete]'));
  assert.ok(!el.querySelector('[data-testid=co-save-actions]'));
  assert.match(el.querySelector('[data-role-id=tpl-for]').textContent, /шаблон/);
});

test('галочки сгруппированы по-русски, подписи — из каталога сервера', async () => {
  const el = mountRoles(fakeApi().api);
  await tick();
  const legends = Array.from(el.querySelectorAll('legend')).map((l: N) => l.textContent);
  assert.deepEqual(legends, ['Работы и план', 'Факт', 'Безопасность']);
  assert.match(el.textContent, /Добавление и правка работ/);
});

test('копия шаблона: создаётся, выбирается, затем отмечаем действие и сохраняем', async () => {
  const { api, calls } = fakeApi();
  const el = mountRoles(api);
  await tick();
  const form = el.querySelector('[data-testid=co-copy]');
  form.querySelector('input[name=copyName]').value = 'Старший прораб';
  submit(form);
  await tick();
  assert.deepEqual(calls, ['create:tpl-for:Старший прораб']);
  assert.match(el.querySelector('[data-role-id=new]').className, /active/);
  assert.match(el.textContent, /создана/);
  const edit = box(el, 'planfact.works.edit');
  assert.equal(edit.disabled, false);
  edit.click();
  await tick();
  click(el.querySelector('[data-testid=co-save-actions]'));
  await tick();
  assert.equal(calls[1], 'actions:new:planfact.fact.create,planfact.works.edit,planfact.works.view');
  assert.match(el.textContent, /сохранены/);
});

test('сохранение недоступно, пока ничего не изменено', async () => {
  const el = mountRoles(fakeApi().api);
  await tick();
  click(el.querySelector('[data-role-id=own]'));
  await tick();
  assert.equal(el.querySelector('[data-testid=co-save-actions]').disabled, true);
});

test('отказ сервера показан текстом сервера', async () => {
  const el = mountRoles(fakeApi({ fail: 'Роль назначена сотрудникам — сначала отзовите назначения' }).api);
  await tick();
  click(el.querySelector('[data-role-id=own]'));
  await tick();
  click(el.querySelector('[data-testid=co-delete]'));
  await tick();
  click(el.querySelector('[data-testid=co-delete-yes]'));
  await tick();
  assert.match(el.querySelector('[role=alert]').textContent, /сначала отзовите назначения/);
});

test('удаление своей роли — с подтверждением', async () => {
  const { api, calls } = fakeApi();
  const el = mountRoles(api);
  await tick();
  click(el.querySelector('[data-role-id=own]'));
  await tick();
  click(el.querySelector('[data-testid=co-delete]'));
  await tick();
  assert.deepEqual(calls, []);
  click(el.querySelector('[data-testid=co-delete-yes]'));
  await tick();
  assert.deepEqual(calls, ['delete:own']);
  assert.ok(!el.querySelector('[data-role-id=own]'));
});

test('новое действие каталога без группы не теряется — «Прочее»', () => {
  const gr = groupCatalog([...CATALOG, { action: 'planfact.new.thing', description: 'Новое' }]);
  assert.equal(gr[gr.length - 1].title, 'Прочее');
  assert.equal(gr[gr.length - 1].items[0].action, 'planfact.new.thing');
});

test('ошибки: русский текст сервера как есть, остальное — понятным текстом', () => {
  assert.equal(mapCompanyError({ message: 'Роль-шаблон не меняется — сделайте копию' }), 'Роль-шаблон не меняется — сделайте копию');
  assert.equal(mapCompanyError({ code: '42501', message: 'forbidden' }), 'Нет права на это действие');
  assert.equal(mapCompanyError({ message: 'cannot assign a role to yourself' }), 'Нельзя назначить роль самому себе');
  assert.equal(mapCompanyError({ message: 'Failed to fetch' }), 'Нет связи с сервером. Попробуйте позже');
});

function fakeAuth(signed: boolean): AuthApi {
  return { async signIn() { return { ok: true }; }, async signOut() {}, async getEmail() { return signed ? 'pto@test.invalid' : null; }, async getAccess() { return []; } };
}
function mountApp(auth: AuthApi | null, api: CompanyApi | null) {
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  flushSync(() => createRoot(el as N).render(createElement(CompanyApp, { auth, api })));
  return el as N;
}

test('без права security.roles.assign — раздел говорит «нет права», ролей не грузит', async () => {
  const { api } = fakeApi();
  let rolesAsked = false;
  const el = mountApp(fakeAuth(true), { ...api, async myAdminCompanies() { return []; }, async listRoles(c) { rolesAsked = true; return api.listRoles(c); } });
  await tick();
  assert.ok(el.querySelector('[data-testid=co-noaccess]'));
  assert.equal(rolesAsked, false);
});

test('не вошёл — своей формы входа нет, «Войти» ведёт на общий экран; без сервера — сообщение', async () => {
  const el = mountApp(fakeAuth(false), fakeApi().api);
  await tick();
  assert.ok(el.querySelector('[data-testid=co-login]') && !el.querySelector('input[type=password]'));
  const off = mountApp(null, null);
  assert.ok(off.querySelector('[data-testid=co-offline]'));
});

test('администратор — вкладки компании, первая «Сотрудники»; «Роли» — по вкладке', async () => {
  win.history.replaceState(null, '', '/');
  const el = win.document.createElement('div') as N; win.document.body.appendChild(el);
  const root = createRoot(el);
  flushSync(() => root.render(createElement(CompanyApp, { auth: fakeAuth(true), api: fakeApi().api })));
  await tick(); await tick();
  assert.match(el.querySelector('[data-testid=co-user]').textContent, /Альфа/);
  assert.deepEqual([...el.querySelectorAll('[data-testid=co-tabs] [role=tab]')].map((t: N) => t.textContent),
    ['Сотрудники', 'Роли', 'Контрагенты', 'Оформление', 'Модули компании', 'Журнал'], 'без права на объекты/единицы — их вкладок нет');
  assert.ok(el.querySelector('[data-testid=co-members]'));
  click(el.querySelector('[data-tab=roles]')); await tick(); await tick();
  assert.ok(el.querySelector('[data-testid=co-roles]'));
  flushSync(() => root.unmount());   // экран «Компании» в приложении один — следующий тест не должен видеть этот
});

// P2-0038 этап 3: вкладки — по правам сервера
test('права на вкладки: управление ролями / объекты / единицы', () => {
  const acc = (p: boolean, u: boolean) => ({ company_id: 'c1', company_name: 'Альфа', can_manage_projects: p, can_manage_units: u, can_manage_roles: false, can_manage_counterparties: false });
  assert.deepEqual(visibleTabs(rightsFrom([], [acc(true, false)])), ['objects'], 'РП: только объекты');
  assert.deepEqual(visibleTabs(rightsFrom([], [acc(true, true)])), ['objects', 'directories'], 'ПТО: объекты и единицы');
  assert.deepEqual(visibleTabs(rightsFrom([], [acc(false, false)])), [], 'инженер — ничего');
  assert.deepEqual(visibleTabs(rightsFrom([{ company_id: 'c1', company_name: 'Альфа' }], [acc(true, true)])),
    ['members', 'roles', 'objects', 'counterparties', 'directories', 'branding', 'modules', 'audit']);
});

test('без права управлять ролями, но с правом на объекты — раздел открыт только с «Проектами» (P2-0047)', async () => {
  win.history.replaceState(null, '', '/#/settings/company/members');
  const { api } = fakeApi();
  const projects = { async myAccess() { return [{ company_id: 'c1', company_name: 'Альфа', can_manage_projects: true, can_manage_units: false, can_manage_roles: false, can_manage_counterparties: false }]; },
    async listProjects() { return []; } } as N;
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const root = createRoot(el as N);
  flushSync(() => root.render(createElement(CompanyApp, { auth: fakeAuth(true), api: { ...api, async myAdminCompanies() { return []; } }, projects })));
  await tick(); await tick(); await tick();
  assert.deepEqual([...(el as N).querySelectorAll('[data-testid=co-tabs] [role=tab]')].map((t: N) => t.textContent), ['Проекты']);
  assert.equal((el as N).querySelector('[data-testid=co-members]'), null, 'сотрудников не видно');
  assert.equal(win.location.hash, '#/settings/company/objects', 'прямой адрес закрытой вкладки → доступная');
  flushSync(() => root.unmount());
});
