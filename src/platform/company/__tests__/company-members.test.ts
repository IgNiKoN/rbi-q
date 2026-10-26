/// <reference types="node" />
/** «Компания → Сотрудники» и «Журнал»: список назначений, назначить (проект/все, срок), отозвать, ошибки сервера. Подставной API, DOM — happy-dom. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { CompanyMembers, endOfDayIso } from '../CompanyMembers.ts';
import { CompanyAudit, auditText } from '../CompanyAudit.ts';
import type { CompanyApi, MemberRow, Result } from '../company.service.ts';
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

const A = (id: string, user: string, email: string, role: string, project: string | null, active: boolean, validTo: string | null = null): MemberRow => ({
  user_id: user, email, assignment_id: id, role_id: 'r-' + role, role_name: role, project_id: project ? 'p1' : null, project_name: project,
  valid_from: '2026-10-01T00:00:00Z', valid_to: validTo, is_active: active
});

function fakeApi(opts: { fail?: string } = {}) {
  const calls: string[] = [];
  let members: MemberRow[] = [
    A('a-adm', 'u-adm', 'alfa-admin@test.invalid', 'Администратор компании', null, true),
    { ...A('a-for', 'u-for', 'alfa-foreman@test.invalid', 'Прораб / мастер', 'Проект Альфа', true), full_name: 'Петров П.П.', managed: true },
    A('a-old', 'u-for', 'alfa-foreman@test.invalid', 'Инженер ПТО', 'Проект Альфа', false, '2026-10-10T20:59:59Z'),
    { user_id: 'u-new', email: 'new@test.invalid', assignment_id: null, role_id: null, role_name: null, project_id: null, project_name: null, valid_from: null, valid_to: null, is_active: null }
  ];
  const res = <T = null>(value: T): Result<T> => opts.fail ? { ok: false, message: opts.fail } : { ok: true, value };
  const api: CompanyApi = {
    async listContractors() { return [{ id: 'k1', name: 'ООО «Альфа-Строй»' }, { id: 'k2', name: 'Бета Монтаж', draft: true }]; },
    async myAdminCompanies() { return []; }, async catalog() { return []; }, async listAudit() { return []; },
    async listRoles() { return [{ id: 'r-senior', name: 'Старший прораб', template_code: null, actions: [], active_assignments: 0 },
      { id: 'r-con', name: 'Представитель подрядчика', template_code: 'contractor_rep', actions: ['quality.view', 'quality.scope.contractor'], active_assignments: 0 },
      { id: 'r-eng', name: 'Инженер СК', template_code: null, actions: ['quality.view', 'quality.edit'], active_assignments: 0 }]; },
    async listQualityObjects() { return [{ id: 'obj_1', name: 'Большевиков,22 (Гений)' }, { id: 'obj_2', name: 'Школа 400 (Крыленко)' }]; },
    async listMembers() { return members; },
    async listProjects() { return [{ id: 'p1', name: 'Проект Альфа', company_id: 'c1' }, { id: 'pb', name: 'Проект Бета', company_id: 'c2' }]; },
    async createRole() { return res(''); }, async renameRole() { return res(null); }, async setRoleActions() { return res(null); }, async deleteRole() { return res(null); },
    async assignRole(u, r, p, to, cp, objs) {
      calls.push(`assign:${u}:${r}:${p}:${to}` + (cp ? `:${cp}` : '') + (objs && objs.length ? `:objs=${objs.join(',')}` : ''));
      if (!opts.fail) members = [...members, { ...A('a-new', u, 'alfa-foreman@test.invalid', cp ? 'Представитель подрядчика' : 'Старший прораб', p ? 'Проект Альфа' : null, true, to),
        counterparty_id: cp || null, counterparty_name: cp === 'k1' ? 'ООО «Альфа-Строй»' : null }];
      return res('a-new');
    },
    async revoke(id) { calls.push(`revoke:${id}`); if (!opts.fail) members = members.filter((m) => m.assignment_id !== id); return res(null); },
    async addMember(co, email, name, role, project) {
      calls.push(`add:${co}:${email}:${name}:${role}:${project}`);
      if (opts.fail) return { ok: false, message: opts.fail };
      const existing = email === 'old@test.invalid';
      members = [...members, { ...A('a-added', 'u-added', email.toLowerCase(), 'Старший прораб', project ? 'Проект Альфа' : null, true),
        full_name: name, must_change_password: !existing, managed: !existing }];
      return { ok: true, value: { user_id: 'u-added', temp_password: existing ? null : 'Tmp7Pass9wordQ', created: !existing } };
    },
    async setFullName(u, name) {
      calls.push(`name:${u}:${name}`);
      if (opts.fail) return { ok: false, message: opts.fail };
      members = members.map((m) => m.user_id === u ? { ...m, full_name: name } : m);
      return { ok: true, value: 3 };
    },
    async resetPassword(co, u) { calls.push(`reset:${co}:${u}`); return res('NewTmp8Pass2xy'); },
    async disableMember(co, u) {
      calls.push(`disable:${co}:${u}`);
      if (!opts.fail) members = members.filter((m) => m.user_id !== u || !m.assignment_id).concat(members.some((m) => m.user_id === u)
        ? [{ ...members.find((m) => m.user_id === u)!, assignment_id: null, role_id: null, role_name: null, project_id: null, project_name: null, is_active: null, disabled_at: '2026-10-25T10:00:00Z' }] : []);
      return res(null);
    }
  };
  return { api, calls };
}
function mount(api: CompanyApi) {
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  flushSync(() => createRoot(el as N).render(createElement(CompanyMembers, { api, companyId: 'c1', me: 'alfa-admin@test.invalid' })));
  return el as N;
}
function fill(form: N, v: Record<string, string>) {
  for (const [k, val] of Object.entries(v)) form.querySelector(`[name=${k}]`).value = val;
}

test('список: почта, роль, проект или «Все проекты», срок; истёкшее помечено; без ролей — «нет ролей»', async () => {
  const el = mount(fakeApi().api);
  await tick();
  const text = el.querySelector('[data-testid=co-members]').textContent;
  assert.match(text, /alfa-admin@test\.invalid \(вы\)/);
  assert.match(text, /Все проекты/);
  assert.match(text, /бессрочно/);
  assert.match(text, /истекло/);
  assert.match(text, /нет ролей/);
  assert.match(el.querySelector('[data-assignment-id=a-old]').className, /co-inactive/);
});

test('в выборе сотрудника себя назначить нельзя; проекты — только своей компании', async () => {
  const el = mount(fakeApi().api);
  await tick();
  const me = Array.from(el.querySelectorAll('select[name=user] option')).find((o: N) => o.value === 'u-adm') as N;
  assert.equal(me.disabled, true);
  const projects = Array.from(el.querySelectorAll('select[name=project] option')).map((o: N) => o.textContent);
  assert.deepEqual(projects, ['Все проекты компании', 'Проект Альфа']);
});

test('назначить роль на проект со сроком → сервер получает проект и конец дня', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  const form = el.querySelector('[data-testid=co-assign]');
  fill(form, { user: 'u-for', role: 'r-senior', project: 'p1', until: '2026-12-31' });
  submit(form);
  await tick();
  assert.equal(calls[0], `assign:u-for:r-senior:p1:${endOfDayIso('2026-12-31')}`);
  assert.match(el.textContent, /Роль назначена/);
  assert.ok(el.querySelector('[data-assignment-id=a-new]'));
});

test('«все проекты» и без срока → null и null', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  const form = el.querySelector('[data-testid=co-assign]');
  fill(form, { user: 'u-for', role: 'r-senior' });
  submit(form);
  await tick();
  assert.equal(calls[0], 'assign:u-for:r-senior:null:null');
});

test('не выбран сотрудник — подсказка, на сервер не уходит', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  submit(el.querySelector('[data-testid=co-assign]'));
  await tick();
  assert.deepEqual(calls, []);
  assert.match(el.querySelector('[role=alert]').textContent, /Выберите сотрудника и роль/);
});

test('отказ сервера при назначении — текст сервера', async () => {
  const el = mount(fakeApi({ fail: 'Срок окончания уже прошёл' }).api);
  await tick();
  const form = el.querySelector('[data-testid=co-assign]');
  fill(form, { user: 'u-for', role: 'r-senior', until: '2020-01-01' });
  submit(form);
  await tick();
  assert.match(el.querySelector('[role=alert]').textContent, /Срок окончания уже прошёл/);
});

test('отозвать — с подтверждением, строка исчезает', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  click(el.querySelector('[data-assignment-id=a-for] [data-testid=co-revoke]'));
  await tick();
  assert.deepEqual(calls, []);
  click(el.querySelector('[data-assignment-id=a-for] [data-testid=co-revoke-yes]'));
  await tick();
  assert.deepEqual(calls, ['revoke:a-for']);
  assert.ok(!el.querySelector('[data-assignment-id=a-for]'));
});

test('последнего админа сервер не даёт отозвать — сообщение видно', async () => {
  const el = mount(fakeApi({ fail: 'Нельзя: в компании не останется ни одного администратора ролей' }).api);
  await tick();
  click(el.querySelector('[data-assignment-id=a-adm] [data-testid=co-revoke]'));
  await tick();
  click(el.querySelector('[data-assignment-id=a-adm] [data-testid=co-revoke-yes]'));
  await tick();
  assert.match(el.querySelector('[role=alert]').textContent, /не останется ни одного администратора/);
});
const AR = (action: string, old_data: Record<string, unknown> | null, new_data: Record<string, unknown> | null, subject: string | null = null) =>
  ({ at: '2026-10-21T10:00:00Z', actor_email: 'alfa-admin@test.invalid', action, record_id: 'x', subject_email: subject, old_data, new_data });

test('журнал компании: понятные фразы по ролям и назначениям', () => {
  assert.equal(auditText(AR('ROLE_CREATE', null, { name: 'Старший прораб' })), 'Создана роль «Старший прораб»');
  assert.match(auditText(AR('ROLE_ACTIONS', { name: 'С', actions: ['planfact.works.view'] }, { name: 'С', actions: ['planfact.works.edit', 'planfact.works.view'] })), /добавлено: planfact\.works\.edit/);
  assert.match(auditText(AR('ASSIGN', null, { role_name: 'Старший прораб', project_id: 'p1' }, 'alfa-foreman@test.invalid')), /Назначена роль «Старший прораб» → alfa-foreman@test\.invalid \(проект\)/);
  assert.equal(auditText(AR('REVOKE', { role_name: 'Старший прораб' }, null, 'alfa-foreman@test.invalid')), 'Отозвана роль «Старший прораб» у alfa-foreman@test.invalid');
  assert.equal(auditText(AR('ROLE_DELETE', { name: 'Старший прораб' }, null)), 'Удалена роль «Старший прораб»');
});

test('журнал компании: таблица «когда — кто — что»', async () => {
  const { api } = fakeApi();
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const withAudit: CompanyApi = { ...api, async listAudit() { return [AR('ROLE_CREATE', null, { name: 'Старший прораб' })]; } };
  flushSync(() => createRoot(el as N).render(createElement(CompanyAudit, { api: withAudit, companyId: 'c1' })));
  await tick();
  const t = (el as N).querySelector('[data-testid=co-audit]').textContent;
  assert.match(t, /alfa-admin@test\.invalid/);
  assert.match(t, /Создана роль «Старший прораб»/);
});

test('роль «только своя фирма»: появляется выбор фирмы из «Контрагентов» и подсказка; без фирмы — не отправляется; фирма видна в списке', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  assert.equal(el.querySelector('[data-testid=co-firm]'), null, 'обычная роль — без выбора фирмы');
  const form = el.querySelector('[data-testid=co-assign]');
  const role = form.querySelector('[name=role]');
  role.value = 'r-con';
  role.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick();
  const firm = el.querySelector('[data-testid=co-firm]');
  assert.ok(firm, 'выбор фирмы показан');
  assert.deepEqual(Array.from(firm.querySelectorAll('option')).map((o: N) => o.textContent), ['— выберите —', 'ООО «Альфа-Строй»', 'Бета Монтаж (нужен ИНН)']);
  assert.match(el.querySelector('[data-testid=co-firm-hint]').textContent, /только записи этой фирмы/);
  fill(form, { user: 'u-for' });
  submit(form); await tick();
  assert.deepEqual(calls, []);
  assert.match(el.querySelector('[role=alert]').textContent, /Выберите фирму подрядчика/);
  fill(form, { user: 'u-for', firm: 'k1' });
  submit(form); await tick();
  assert.deepEqual(calls, ['assign:u-for:r-con:null:null:k1']);
  assert.match(el.querySelector('[data-assignment-id=a-new]').textContent, /Представитель подрядчика · ООО «Альфа-Строй»/);
  assert.equal(el.querySelector('[data-testid=co-firm]'), null, 'после назначения форма сброшена');
});

test('P2-0028: ФИО в списке и в выборе сотрудника; без ФИО — почта', async () => {
  const el = mount(fakeApi().api);
  await tick();
  const row = el.querySelector('[data-user-id=u-for]');
  assert.match(row.textContent, /Петров П\.П\./);
  assert.match(row.textContent, /alfa-foreman@test\.invalid/);
  const opt = Array.from(el.querySelectorAll('select[name=user] option')).find((o: N) => o.value === 'u-for') as N;
  assert.equal(opt.textContent, 'Петров П.П. · alfa-foreman@test.invalid');
});

test('P2-0028: добавить сотрудника → сервер получает почту, ФИО, роль, объект; временный пароль показан один раз', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  click(el.querySelector('[data-testid=co-add-open]'));
  await tick();
  const form = el.querySelector('[data-testid=co-add]');
  fill(form, { email: 'New.Man@test.invalid', full_name: 'Новиков Н.Н.', role: 'r-senior', project: 'p1' });
  submit(form);
  await tick();
  assert.equal(calls[0], 'add:c1:New.Man@test.invalid:Новиков Н.Н.:r-senior:p1');
  const box = el.querySelector('[data-testid=co-temp]');
  assert.ok(box, 'окно временного пароля');
  assert.equal(el.querySelector('[data-testid=co-temp-pw]').textContent, 'Tmp7Pass9wordQ');
  assert.match(box.textContent, /Больше этот пароль не покажем/);
  assert.match(box.textContent, /new\.man@test\.invalid/);
  assert.match(el.querySelector('[data-user-id=u-added]').textContent, /ещё не сменил временный пароль/);
  click(el.querySelector('[data-testid=co-temp-done]'));
  await tick();
  assert.equal(el.querySelector('[data-testid=co-temp]'), null, '«Готово» — пароль исчез');
  assert.ok(!el.textContent.includes('Tmp7Pass9wordQ'));
});

test('P2-0028: «Скопировать» кладёт пароль в буфер', async () => {
  const copied: string[] = [];
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: async (t: string) => { copied.push(t); } }, configurable: true });
  const el = mount(fakeApi().api);
  await tick();
  click(el.querySelector('[data-testid=co-add-open]'));
  await tick();
  const form = el.querySelector('[data-testid=co-add]');
  fill(form, { email: 'a@test.invalid', full_name: 'Аа Б.В.', role: 'r-senior' });
  submit(form);
  await tick();
  click(el.querySelector('[data-testid=co-temp-copy]'));
  await tick();
  assert.deepEqual(copied, ['Tmp7Pass9wordQ']);
  assert.equal(el.querySelector('[data-testid=co-temp-copy]').textContent, 'Скопировано');
});

test('P2-0028: почта уже с учёткой — без пароля, понятное сообщение; пустые поля — подсказка без запроса', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  click(el.querySelector('[data-testid=co-add-open]'));
  await tick();
  let form = el.querySelector('[data-testid=co-add]');
  submit(form);
  await tick();
  assert.deepEqual(calls, []);
  assert.match(el.querySelector('[role=alert]').textContent, /почту, ФИО и роль/);
  fill(form, { email: 'old@test.invalid', full_name: 'Старый С.С.', role: 'r-senior' });
  submit(form);
  await tick();
  assert.equal(el.querySelector('[data-testid=co-temp]'), null);
  assert.match(el.textContent, /уже есть учётка/);
  form = el.querySelector('[data-testid=co-add]');
  assert.equal(form, null, 'форма закрыта');
});

test('P2-0028: отказ сервера при добавлении — текст сервера', async () => {
  const el = mount(fakeApi({ fail: 'Сотрудник с этой почтой уже есть в компании' }).api);
  await tick();
  click(el.querySelector('[data-testid=co-add-open]'));
  await tick();
  const form = el.querySelector('[data-testid=co-add]');
  fill(form, { email: 'x@test.invalid', full_name: 'Икс И.И.', role: 'r-senior' });
  submit(form);
  await tick();
  assert.match(el.querySelector('[role=alert]').textContent, /уже есть в компании/);
});

test('P2-0028: «Сбросить пароль» — только учётке компании, с подтверждением; новый пароль показан', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  assert.equal(el.querySelector('[data-user-id=u-adm] [data-testid=co-reset]'), null, 'себе — нет кнопок');
  assert.equal(el.querySelector('[data-user-id=u-new] [data-testid=co-reset]'), null, 'учётка не компании — сброса нет');
  click(el.querySelector('[data-user-id=u-for] [data-testid=co-reset]'));
  await tick();
  assert.deepEqual(calls, []);
  click(el.querySelector('[data-user-id=u-for] [data-testid=co-reset-yes]'));
  await tick();
  assert.deepEqual(calls, ['reset:c1:u-for']);
  assert.equal(el.querySelector('[data-testid=co-temp-pw]').textContent, 'NewTmp8Pass2xy');
  assert.match(el.querySelector('[data-testid=co-temp]').textContent, /Петров П\.П\./);
});

test('P2-0028: «Отключить доступ» — с подтверждением; человек помечен, без ролей и кнопок, в выборе его нет', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  click(el.querySelector('[data-user-id=u-for] [data-testid=co-disable]'));
  await tick();
  click(el.querySelector('[data-user-id=u-for] [data-testid=co-disable-yes]'));
  await tick();
  assert.deepEqual(calls, ['disable:c1:u-for']);
  const row = el.querySelector('[data-user-id=u-for]');
  assert.ok(row.querySelector('[data-testid=co-badge-disabled]'));
  assert.equal(row.querySelector('[data-testid=co-disable]'), null);
  assert.match(el.textContent, /Доступ отключён: Петров П\.П\./);
  const opts = Array.from(el.querySelectorAll('select[name=user] option')).map((o: N) => o.value);
  assert.ok(!opts.includes('u-for'));
});

test('P2-0028: «Изменить ФИО» — сервер получает новое ФИО, список обновлён, сказано сколько записей обновлено; себе — тоже можно', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  assert.ok(el.querySelector('[data-user-id=u-adm] [data-testid=co-name-edit]'), 'своё ФИО — можно');
  click(el.querySelector('[data-user-id=u-for] [data-testid=co-name-edit]'));
  await tick();
  const form = el.querySelector('[data-user-id=u-for] [data-testid=co-name-form]');
  assert.equal(form.querySelector('[name=full_name]').value, 'Петров П.П.');
  form.querySelector('[name=full_name]').value = 'Петров Пётр Петрович';
  submit(form);
  await tick();
  assert.deepEqual(calls, ['name:u-for:Петров Пётр Петрович']);
  assert.match(el.querySelector('[data-user-id=u-for]').textContent, /Петров Пётр Петрович/);
  assert.match(el.textContent, /обновлено записей: 3/);
  assert.equal(el.querySelector('[data-testid=co-name-form]'), null);
});

test('P2-0033: объекты Качества — только для роли с Качеством; отмеченные уходят на сервер по id; в таблице — названия', async () => {
  const { api, calls } = fakeApi();
  const base = api.listMembers;
  api.listMembers = async (co) => [...await base(co), { ...A('a-eng', 'u-for', 'alfa-foreman@test.invalid', 'Инженер СК', null, true),
    quality_objects: [{ id: 'obj_1', name: 'Большевиков,22 (Гений)' }] }];
  const el = mount(api);
  await tick();
  assert.match(el.querySelector('[data-assignment-id=a-eng]').textContent, /Объекты: Большевиков,22 \(Гений\)/);
  assert.doesNotMatch(el.querySelector('[data-assignment-id=a-adm]').textContent, /Объекты:/);
  const form = el.querySelector('[data-testid=co-assign]');
  const role = form.querySelector('select[name=role]');
  role.value = 'r-senior'; role.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick();
  assert.equal(el.querySelector('[data-testid=co-objects]'), null, 'роль без Качества — без выбора объектов');
  role.value = 'r-eng'; role.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick();
  const boxes = Array.from(el.querySelectorAll('[data-testid=co-objects] input[name=qobj]')) as N[];
  assert.deepEqual(boxes.map((b) => b.value), ['obj_1', 'obj_2']);
  boxes[1].checked = true;
  fill(form, { user: 'u-for' });
  submit(form);
  await tick();
  assert.equal(calls[0], 'assign:u-for:r-eng:null:null:objs=obj_2');
});

test('P2-0033: ничего не отмечено — назначение на все объекты (без списка)', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  const form = el.querySelector('[data-testid=co-assign]');
  const role = form.querySelector('select[name=role]');
  role.value = 'r-eng'; role.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick();
  fill(form, { user: 'u-for' });
  submit(form);
  await tick();
  assert.equal(calls[0], 'assign:u-for:r-eng:null:null');
});

test('P2-0033 (L7): ошибка списка объектов Качества не ломает экран — назначение без выбора объектов', async () => {
  const { api } = fakeApi();
  api.listQualityObjects = async () => { throw new Error('function pf_list_quality_objects does not exist'); };
  const el = mount(api);
  await tick();
  assert.ok(el.querySelector('[data-testid=co-assign]'));
  assert.match(el.textContent, /Петров П\.П\./);
  const role = el.querySelector('[data-testid=co-assign] select[name=role]');
  role.value = 'r-eng'; role.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick();
  assert.equal(el.querySelector('[data-testid=co-objects]'), null);
});
