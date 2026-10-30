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
// @ts-expect-error — обёртка оболочки на JS без типов
import { companyTabsFor } from '../../../../js/modules/company/index.js';
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

// как отдаёт сервер после 052 (pf_permission_catalog): модуль, группа, порядок, подпись
const PF = { module: 'planfact', module_name: 'План/Факт' };
const CATALOG = [
  { action: 'planfact.works.view', description: 'Просмотр работ плана', ...PF, group_name: 'Работы и план', sort: 1010, label: 'Просмотр работ плана', area_scoped: true },
  { action: 'planfact.works.edit', description: 'Добавление и правка работ (ВОР, ГПР)', ...PF, group_name: 'Работы и план', sort: 1020, label: 'Добавление и правка работ (ВОР, ГПР)' },
  { action: 'planfact.fact.create', description: 'Ввод фактического объёма', ...PF, group_name: 'Факт', sort: 1120, label: 'Ввод фактического объёма', area_scoped: true },
  { action: 'security.roles.assign', description: 'Назначение и отзыв ролей пользователей', module: null, module_name: 'Компания', group_name: 'Сотрудники и справочники',
    sort: 9010, label: 'Назначение и отзыв ролей пользователей' }
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
    async listMembers() { return [
      { user_id: 'u1', email: 'a@x', assignment_id: 'a1', role_id: 'tpl-for', role_name: 'Прораб / мастер', project_id: 'p1', project_name: 'А', valid_from: null, valid_to: null, is_active: true },
      { user_id: 'u1', email: 'a@x', assignment_id: 'a2', role_id: 'tpl-for', role_name: 'Прораб / мастер', project_id: 'p1', project_name: 'А', valid_from: null, valid_to: null, is_active: true },
      { user_id: 'u2', email: 'b@x', assignment_id: 'a3', role_id: 'tpl-for', role_name: 'Прораб / мастер', project_id: null, project_name: null, valid_from: null, valid_to: null, is_active: false }]; },
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
    async setParticipation() { return { ok: true, value: { added: 0, changed: 0, revoked: 0 } }; },
    async revoke() { return res(null); },
    async whoCan() { return { ok: true as const, value: [] }; }
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
  const legends = Array.from(el.querySelectorAll('.cr-group summary b')).map((l: N) => l.textContent);
  assert.deepEqual(legends, ['Работы и план', 'Факт', 'Сотрудники и справочники'], 'P2-0070: группы — из каталога сервера');
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

test('администратор — первая «Сотрудники»; внутри только вкладки «Сотрудники · Роли и права · Кто что может» (P2-0048, P2-0070), «Роли» — по вкладке', async () => {
  win.history.replaceState(null, '', '/');
  const el = win.document.createElement('div') as N; win.document.body.appendChild(el);
  const root = createRoot(el);
  flushSync(() => root.render(createElement(CompanyApp, { auth: fakeAuth(true), api: fakeApi().api })));
  await tick(); await tick();
  assert.match(el.querySelector('[data-testid=co-user]').textContent, /Альфа/);
  assert.deepEqual([...el.querySelectorAll('[data-testid=co-tabs] [role=tab]')].map((t: N) => t.textContent),
    ['Сотрудники', 'Роли и права', 'Кто что может'], 'остальные разделы — в левой колонке «Настроек»');
  assert.ok(el.querySelector('[data-testid=co-members]'));
  click(el.querySelector('[data-tab=roles]')); await tick(); await tick();
  assert.ok(el.querySelector('[data-testid=co-roles]'));
  assert.equal(el.querySelector('[data-tab=roles]').getAttribute('aria-selected'), 'true');
  win.history.replaceState(null, '', '/#/settings/company/audit'); win.dispatchEvent(new win.Event('hashchange')); await tick(); await tick();
  assert.equal(el.querySelector('[data-testid=co-tabs]'), null, 'в «Журнале» своей полосы вкладок нет');
  flushSync(() => root.unmount());   // экран «Компании» в приложении один — следующий тест не должен видеть этот
});

// P2-0038 этап 3: вкладки — по правам сервера
test('права на вкладки: управление ролями / объекты / единицы', () => {
  const acc = (p: boolean, u: boolean) => ({ company_id: 'c1', company_name: 'Альфа', can_manage_projects: p, can_manage_units: u, can_manage_roles: false, can_manage_counterparties: false });
  assert.deepEqual(visibleTabs(rightsFrom([], [acc(true, false)])), ['objects'], 'РП: только объекты');
  assert.deepEqual(visibleTabs(rightsFrom([], [acc(true, true)])), ['objects', 'directories'], 'ПТО: объекты и единицы');
  assert.deepEqual(visibleTabs(rightsFrom([], [acc(false, false)])), [], 'инженер — ничего');
  assert.deepEqual(visibleTabs(rightsFrom([{ company_id: 'c1', company_name: 'Альфа' }], [acc(true, true)])),
    ['members', 'roles', 'who', 'objects', 'counterparties', 'directories', 'branding', 'modules', 'audit']);
});

// P2-0048: левая колонка «Настроек» узнаёт вкладки без загрузки бандла — та же таблица прав, что у CompanyApp
test('обёртка «Компании»: вкладки по правам совпадают с visibleTabs', () => {
  const keys = ['admin', 'projects', 'units', 'platform'] as const;
  for (let m = 0; m < 16; m++) {
    const r = { admin: !!(m & 1), projects: !!(m & 2), units: !!(m & 4), platform: !!(m & 8) };
    assert.deepEqual(companyTabsFor(r), visibleTabs(r), keys.filter((k) => r[k]).join('+') || 'нет прав');
  }
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
  assert.equal((el as N).querySelector('[data-testid=co-tabs]'), null, 'полосы вкладок нет (разделы — в левой колонке «Настроек»)');
  assert.equal((el as N).querySelector('[data-company-tab]').getAttribute('data-company-tab'), 'objects');
  assert.equal((el as N).querySelector('[data-testid=co-members]'), null, 'сотрудников не видно');
  assert.equal(win.location.hash, '#/settings/company/objects', 'прямой адрес закрытой вкладки → доступная');
  flushSync(() => root.unmount());
});

test('P2-0048: строка роли «что может · у N чел.» (люди, не назначения); группы — счётчик «k из n»; телефон — список → роль и «‹ Роли»', async () => {
  const el = mountRoles(fakeApi().api);
  await tick();
  const metas = Array.from(el.querySelectorAll('[data-testid=co-role-meta]')).map((m: N) => m.textContent);
  assert.deepEqual(metas, ['Работы и план, Факт · у 1 чел.', 'Работы и план · не назначена']);
  assert.equal(el.querySelector('[data-testid=co-roles]').dataset.detail, '0', 'сначала список');
  click(el.querySelector('[data-role-id=own]')); await tick();
  assert.equal(el.querySelector('[data-testid=co-roles]').dataset.detail, '1', 'выбрана роль — её панель');
  const counts = Array.from(el.querySelectorAll('[data-testid=co-group-count]')).map((c: N) => c.textContent);
  assert.deepEqual(counts, ['1 из 2', '0 из 1', '0 из 1']);
  box(el, 'planfact.fact.create').click(); await tick();
  assert.equal(el.querySelectorAll('[data-testid=co-group-count]')[1].textContent, '1 из 1');
  assert.match(el.querySelector('[data-testid=co-role-sum]').textContent, /Может: Работы и план, Факт/);
  assert.ok(el.querySelector('[data-testid=co-cancel-actions]'));
  click(el.querySelector('[data-testid=co-cancel-actions]')); await tick();
  assert.equal(el.querySelectorAll('[data-testid=co-group-count]')[1].textContent, '0 из 1', '«Отменить изменения» вернул галочки');
  click(el.querySelector('[data-testid=co-roles-back]')); await tick();
  assert.equal(el.querySelector('[data-testid=co-roles]').dataset.detail, '0');
});

test('P2-0070: группы из каталога — порядок сервера, несколько модулей → строка роли называет модули', async () => {
  const { abilities } = await import('../action-groups.ts');
  const sk = { action: 'construction.defects.close', description: 'Стройконтроль: закрыть замечание', module: 'construction', module_name: 'Стройконтроль',
    group_name: 'Замечания', sort: 3060, label: 'Закрыть замечание', area_scoped: true };
  const cat = [sk, ...CATALOG];
  assert.deepEqual(groupCatalog(cat).map((x) => x.title), ['Работы и план', 'Факт', 'Замечания', 'Сотрудники и справочники'], 'по порядку каталога');
  assert.deepEqual(abilities(['planfact.works.view', 'planfact.fact.create'], cat), ['Работы и план', 'Факт'], 'один модуль — группы');
  assert.deepEqual(abilities(['planfact.works.view', 'construction.defects.close'], cat), ['План/Факт', 'Стройконтроль'], 'несколько модулей — модули');
  assert.equal(groupCatalog(cat).find((x) => x.title === 'Замечания')!.items[0].label, 'Закрыть замечание');
});

test('P2-0071: «Доступ к модулю» — выключить снимает все действия модуля, включить ставит его просмотр; ядро и другие модули не трогает', async () => {
  const { moduleOn, setModuleAccess } = await import('../action-groups.ts');
  const cat = [
    { action: 'quality.view', description: 'Просмотр', module: 'quality', module_name: 'Качество', group_name: 'База знаний и справочники', sort: 2910, label: 'Просмотр', area_scoped: false },
    { action: 'quality.inspections.view', description: 'Видеть все', module: 'quality', module_name: 'Качество', group_name: 'Проверки', sort: 2110, label: 'Просмотр всех', area_scoped: true },
    { action: 'quality.inspections.create', description: 'Проводить', module: 'quality', module_name: 'Качество', group_name: 'Проверки', sort: 2120, label: 'Создание', area_scoped: true },
    { action: 'construction.defects.view', description: 'Замечания', module: 'construction', module_name: 'Стройконтроль', group_name: 'Замечания', sort: 3010, label: 'Видеть', area_scoped: true },
    { action: 'security.roles.assign', description: 'Роли', module: null, module_name: 'Компания', group_name: 'Сотрудники и справочники', sort: 9010, label: null, area_scoped: false }
  ] as unknown as Parameters<typeof moduleOn>[1];
  const role = new Set(['quality.inspections.create', 'construction.defects.view', 'security.roles.assign']);
  assert.equal(moduleOn(role, cat, 'quality'), true);
  const off = setModuleAccess(role, cat, 'quality', false);
  assert.deepEqual([...off].sort(), ['construction.defects.view', 'security.roles.assign']);
  assert.equal(moduleOn(off, cat, 'quality'), false);
  const on = setModuleAccess(off, cat, 'quality', true);
  assert.deepEqual([...on].filter((a) => a.startsWith('quality.')).sort(), ['quality.inspections.view', 'quality.view'], 'включить — просмотр модуля');
});
