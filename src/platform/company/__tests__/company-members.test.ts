/// <reference types="node" />
/**
 * «Компания → Сотрудники и доступ» (P2-0048 этап 4) и «Журнал»: список (одна строка на человека, фильтры, поиск), карточка
 * («Где работает» по группам роль × проект, «Изменить», «Отозвать»), мастер «Назначить» (pf_set_participation), «По проектам»,
 * добавление сотрудника, пароль, ФИО, отключение. Подставной API, DOM — happy-dom.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import type { Root } from 'react-dom/client';
import type { CompanyApi, MemberRow, ParticipationInput, Result } from '../company.service.ts';
import type { ProjectsApi, PlaceNode } from '../../core/projects.service.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
// Глобалы нужны ДО загрузки react-dom (иначе React не слушает событие input у полей поиска и даты) — поэтому динамический import.
g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
const { flushSync } = await import('react-dom');
const { createRoot } = await import('react-dom/client');
const { CompanyMembers, endOfDayIso } = await import('../CompanyMembers.ts');
const { CompanyAudit, auditText, filterAudit, auditKind, AUDIT_MAX } = await import('../CompanyAudit.ts');
const roots: Root[] = [];
afterEach(() => { while (roots.length) { const r = roots.pop()!; flushSync(() => r.unmount()); } win.document.body.innerHTML = ''; });
const tick = (): Promise<void> => settle();
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const click = (b: N) => b.dispatchEvent(new win.Event('click', { bubbles: true }));
const check = (b: N) => b.click();
const submit = (f: N) => f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
const choose = (sel: N, v: string) => { sel.value = v; sel.dispatchEvent(new win.Event('change', { bubbles: true })); };
const byText = (el: N, sel: string, text: string): N => Array.from(el.querySelectorAll(sel)).find((b: N) => b.textContent === text);
/** Открыть карточку сотрудника (телефон: список → карточка). */
async function openPerson(el: N, userId: string): Promise<N> {
  const row = el.querySelector(`[data-person=${userId}]`);
  if (row) { click(row); await tick(); }
  return el.querySelector(`[data-user-id=${userId}]`);
}
/** Действия по сотруднику — в меню «⋯» карточки; открыть меню и вернуть пункт (null — пункта нет). */
async function menuItem(el: N, userId: string, testId: string): Promise<N> {
  await openPerson(el, userId);
  const btn = el.querySelector(`[data-user-id=${userId}] [data-testid=co-person-menu]`);
  if (!btn) return null;
  if (btn.getAttribute('aria-expanded') !== 'true') { click(btn); await settle(); }
  return el.querySelector(`[data-user-id=${userId}] [data-testid=${testId}]`);
}

const A = (id: string, user: string, email: string, role: string, project: string | null, active: boolean, validTo: string | null = null): MemberRow => ({
  user_id: user, email, assignment_id: id, role_id: 'r-' + role, role_name: role, project_id: project ? 'p1' : null, project_name: project,
  valid_from: '2026-10-01T00:00:00Z', valid_to: validTo, is_active: active
});

const PLACES: PlaceNode[] = [
  { id: 'k1', parent_id: null, node_type: 'object', object_kind: 'building', name: 'Корпус 1', build_no: null, bti_no: null, sort_order: 1, depth: 1, path: 'Корпус 1', child_count: 3, apartment_count: null },
  ...[1, 2, 3].map((n) => ({ id: 's' + n, parent_id: 'k1', node_type: 'section' as const, object_kind: null, name: 'Секция ' + n, build_no: null, bti_no: null, sort_order: n, depth: 2,
    path: 'Корпус 1 · Секция ' + n, child_count: 0, apartment_count: null }))
];
const placesApi = { projectPlaces: async (_p: string, parent: string | null) => PLACES.filter((x) => x.parent_id === parent) } as unknown as ProjectsApi;

function fakeApi(opts: { fail?: string } = {}) {
  const calls: string[] = [];
  const sets: ParticipationInput[] = [];
  let members: MemberRow[] = [
    A('a-adm', 'u-adm', 'alfa-admin@test.invalid', 'Администратор компании', null, true),
    { ...A('a-for', 'u-for', 'alfa-foreman@test.invalid', 'Прораб / мастер', 'Проект Альфа', true), full_name: 'Петров П.П.', managed: true,
      location_id: 's1', location_path: 'Корпус 1 · Секция 1', fact_owner: true },
    { ...A('a-for2', 'u-for', 'alfa-foreman@test.invalid', 'Прораб / мастер', 'Проект Альфа', true), full_name: 'Петров П.П.', managed: true,
      location_id: 's2', location_path: 'Корпус 1 · Секция 2', fact_owner: true },
    { ...A('a-old', 'u-for', 'alfa-foreman@test.invalid', 'Инженер ПТО', 'Проект Альфа', false, '2026-10-10T20:59:59Z'), full_name: 'Петров П.П.', managed: true },
    { ...A('a-sid', 'u-sid', 'sidorova@test.invalid', 'Прораб / мастер', 'Проект Альфа', true), full_name: 'Сидорова Е.В.', managed: true, must_change_password: true,
      location_id: 's3', location_path: 'Корпус 1 · Секция 3' },
    { user_id: 'u-new', email: 'new@test.invalid', assignment_id: null, role_id: null, role_name: null, project_id: null, project_name: null, valid_from: null, valid_to: null, is_active: null }
  ];
  const res = <T = null>(value: T): Result<T> => opts.fail ? { ok: false, message: opts.fail } : { ok: true, value };
  const api: CompanyApi = {
    async listContractors() { return [{ id: 'k1', name: 'ООО «Альфа-Строй»' }, { id: 'k2', name: 'Бета Монтаж', draft: true }]; },
    async myAdminCompanies() { return []; }, async catalog() { return []; }, async listAudit() { return []; },
    async listRoles() { return [{ id: 'r-Прораб / мастер', name: 'Прораб / мастер', template_code: null, actions: ['planfact.fact.create'], active_assignments: 3 },
      { id: 'r-con', name: 'Представитель подрядчика', template_code: 'contractor_rep', actions: ['quality.view', 'quality.scope.contractor'], active_assignments: 0 },
      { id: 'r-eng', name: 'Инженер СК', template_code: null, actions: ['quality.view', 'quality.edit'], active_assignments: 0 }]; },
    async listQualityObjects() { return [{ id: 'obj_1', name: 'Большевиков,22 (Гений)' }, { id: 'obj_2', name: 'Школа 400 (Крыленко)' }]; },
    async listMembers() { return members; },
    async listProjects() { return [{ id: 'p1', name: 'Проект Альфа', company_id: 'c1' }, { id: 'pb', name: 'Проект Бета', company_id: 'c2' }]; },
    async createRole() { return res(''); }, async renameRole() { return res(null); }, async setRoleActions() { return res(null); }, async deleteRole() { return res(null); },
    async assignRole(u, r) { calls.push(`assign:${u}:${r}`); return res('a-x'); },
    async setParticipation(p) {
      sets.push(p); calls.push('set');
      if (opts.fail) return { ok: false, message: opts.fail };
      return { ok: true, value: { added: p.users.length * Math.max(1, p.locations.length), changed: 0, revoked: 0 } };
    },
    async revoke(id) { calls.push(`revoke:${id}`); if (!opts.fail) members = members.filter((m) => m.assignment_id !== id); return res(null); },
    async whoCan() { return { ok: true as const, value: [] }; },
    async addMember(co, email, name, role, project) {
      calls.push(`add:${co}:${email}:${name}:${role}:${project}`);
      if (opts.fail) return { ok: false, message: opts.fail };
      const existing = email === 'old@test.invalid';
      if (email === 'foreign@test.invalid') return { ok: true, value: { user_id: 'u-f', temp_password: 'Fr3shPass8wordZ', created: false } };   // P2-0035b: учётка другой компании
      members = [...members, { ...A('a-added', 'u-added', email.toLowerCase(), 'Прораб / мастер', project ? 'Проект Альфа' : null, true),
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
  return { api, calls, sets };
}
function mount(api: CompanyApi, projects: ProjectsApi | null = placesApi) {
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const r = createRoot(el as N); roots.push(r);
  flushSync(() => r.render(createElement(CompanyMembers, { api, companyId: 'c1', me: 'alfa-admin@test.invalid', projects })));
  return el as N;
}
function fill(form: N, v: Record<string, string>) {
  for (const [k, val] of Object.entries(v)) form.querySelector(`[name=${k}]`).value = val;
}
const wiz = (el: N): N => el.querySelector('[data-testid=co-wizard]');
const next = async (el: N) => { click(el.querySelector('[data-testid=co-wiz-next]')); await tick(); };

test('список: одна строка на человека — ФИО, «где работает», метки; «(вы)»; «нет ролей»; фильтры-счётчики и поиск', async () => {
  const el = mount(fakeApi().api);
  await tick();
  const rows = el.querySelectorAll('[data-person]');
  assert.equal(rows.length, 4, 'по строке на человека, не на назначение');
  const pet = el.querySelector('[data-person=u-for]');
  assert.match(pet.textContent, /Петров П\.П\./);
  assert.equal(pet.querySelector('[data-testid=co-where]').textContent, 'Прораб / мастер · Проект Альфа (Секция 1, Секция 2)');
  assert.match(pet.textContent, /факт/);
  assert.match(el.querySelector('[data-person=u-adm]').textContent, /alfa-admin@test\.invalid \(вы\)/);
  assert.match(el.querySelector('[data-person=u-adm]').textContent, /Администратор компании · вся компания/);
  assert.match(el.querySelector('[data-person=u-new]').textContent, /нет ролей/);
  assert.match(el.querySelector('[data-person=u-sid]').textContent, /пароль/);
  const n = (f: string) => el.querySelector(`[data-filter=${f}] .cm-n`).textContent;
  assert.deepEqual([n('all'), n('norole'), n('mustchange'), n('disabled')], ['4', '1', '1', '0']);
  click(el.querySelector('[data-filter=norole]')); await tick();
  assert.deepEqual(Array.from(el.querySelectorAll('[data-person]')).map((r: N) => r.dataset.person), ['u-new']);
  click(el.querySelector('[data-filter=all]')); await tick();
  const q = el.querySelector('[data-testid=co-search]');
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(q, 'секция 3'); q.dispatchEvent(new win.Event('input', { bubbles: true })); await tick();
  assert.deepEqual(Array.from(el.querySelectorAll('[data-person]')).map((r: N) => r.dataset.person), ['u-sid'], 'поиск по месту/проекту');
});

test('карточка: «Где работает» по группам «проект · роль», места, «отвечает за факт», срок; истёкшее серым; «‹ Сотрудники» — назад', async () => {
  const el = mount(fakeApi().api);
  await tick();
  const card = await openPerson(el, 'u-for');
  const groups = card.querySelectorAll('[data-group]');
  assert.equal(groups.length, 2, 'две группы: Прораб × Альфа (2 места) и ПТО × Альфа');
  assert.match(groups[0].textContent, /Проект Альфа · Прораб \/ мастер/);
  assert.equal(groups[0].querySelector('[data-testid=co-group-where]').textContent, 'Секция 1, Секция 2');
  assert.match(groups[0].textContent, /отвечает за факт/);
  assert.match(groups[0].textContent, /бессрочно/);
  assert.match(groups[1].textContent, /истекло/);
  assert.match(groups[1].className, /co-inactive/);
  assert.equal(el.querySelector('[data-testid=co-members] .cm-split').dataset.hasSel, '1');
  click(el.querySelector('[data-testid=co-back]')); await tick();
  assert.equal(el.querySelector('[data-testid=co-members] .cm-split').dataset.hasSel, '0');
  const none = await openPerson(el, 'u-new');
  assert.match(none.querySelector('[data-testid=co-noroles]').textContent, /нет ролей/);
});

test('мастер «Назначить»: 2 человека × Прораб × 2 секции × «отвечают за факт» → итог простыми словами → pf_set_participation; себя выбрать нельзя', async () => {
  const { api, sets } = fakeApi();
  const el = mount(api);
  await tick();
  click(el.querySelector('[data-testid=co-assign-open]')); await tick();
  assert.ok(wiz(el), 'мастер открыт (лист / панель)');
  assert.equal(el.querySelector('[data-pick=u-adm] input').disabled, true, 'себя — нельзя');
  await next(el);
  assert.match(el.querySelector('[data-testid=co-wiz-error]').textContent, /Выберите сотрудника/);
  check(el.querySelector('[data-pick=u-for] input')); check(el.querySelector('[data-pick=u-sid] input')); await tick();
  assert.match(el.querySelector('[data-testid=co-wiz-count]').textContent, /Выбрано: 2/);
  await next(el);
  await next(el);
  assert.match(el.querySelector('[data-testid=co-wiz-error]').textContent, /Выберите сотрудника и роль/);
  assert.equal(sets.length, 0);
  choose(el.querySelector('[data-testid=co-wiz-role]'), 'r-Прораб / мастер'); await tick();
  choose(el.querySelector('[data-testid=co-wiz-project]'), 'p1'); await tick();
  const projOpts = Array.from(el.querySelectorAll('[data-testid=co-wiz-project] option')).map((o: N) => o.textContent);
  assert.deepEqual(projOpts, ['— выберите —', 'Проект Альфа'], 'только проекты своей компании');
  const boxes = Array.from(el.querySelectorAll('[data-testid=co-wiz-tree] [data-testid=p2-tree-check]')) as N[];
  assert.deepEqual(boxes.map((b) => b.getAttribute('aria-label')), ['Корпус 1', 'Секция 1', 'Секция 2', 'Секция 3'], 'дерево мест проекта, первый объект раскрыт');
  check(boxes[1]); check(boxes[2]); await tick();
  assert.match(el.querySelector('[data-testid=co-wiz-picked]').textContent, /Корпус 1 · Секция 1, Корпус 1 · Секция 2/);
  check(el.querySelector('[data-testid=co-wiz-owner]')); await tick();
  await next(el);
  assert.equal(el.querySelector('[data-testid=co-wiz-who-sum]').textContent, 'Петров П.П., Сидорова Е.В.');
  assert.equal(el.querySelector('[data-testid=co-wiz-what]').textContent, '→ Прораб / мастер · Проект Альфа · Секция 1, Секция 2 · отвечают за факт · бессрочно');
  assert.match(el.querySelector('[data-testid=co-wiz-n]').textContent, /Будет 4 назначения/);
  assert.match(el.querySelector('[data-testid=co-wiz-replace]').textContent, /Петров П\.П\. — Секция 1, Секция 2; Сидорова Е\.В\. — Секция 3/,
    'кто уже участвует с этой ролью — предупреждение о замене мест');
  click(el.querySelector('[data-testid=co-wiz-save]')); await tick();
  assert.deepEqual(sets[0], { users: ['u-for', 'u-sid'], roleId: 'r-Прораб / мастер', projectId: 'p1', locations: ['s1', 's2'], factOwner: true,
    validTo: null, objects: [], counterpartyId: null });
  assert.equal(wiz(el), null, 'мастер закрыт');
  assert.match(el.querySelector('[data-testid=co-notice]').textContent, /Добавлено 4, изменено 0, отозвано 0/);
});

test('мастер: «Вся компания» и срок → проект null, конец дня; отказ сервера — текст сервера в мастере', async () => {
  const { api, sets } = fakeApi({ fail: 'Срок окончания уже прошёл' });
  const el = mount(api);
  await tick();
  click(el.querySelector('[data-testid=co-assign-open]')); await tick();
  check(el.querySelector('[data-pick=u-new] input')); await tick();
  await next(el);
  choose(el.querySelector('[data-testid=co-wiz-role]'), 'r-Прораб / мастер'); await tick();
  click(el.querySelector('[data-scope=company]')); await tick();
  assert.equal(el.querySelector('[data-testid=co-wiz-project]'), null);
  assert.equal(el.querySelector('[data-testid=co-wiz-owner]'), null, '«ответственный за факт» — только в проекте');
  const until = el.querySelector('[name=until]');
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(until, '2026-12-31');
  until.dispatchEvent(new win.Event('input', { bubbles: true })); await tick();
  await next(el);
  assert.match(el.querySelector('[data-testid=co-wiz-what]').textContent, /вся компания · до 31\.12\.2026/);
  click(el.querySelector('[data-testid=co-wiz-save]')); await tick();
  assert.equal(sets[0].projectId, null);
  assert.equal(sets[0].validTo, endOfDayIso('2026-12-31'));
  assert.ok(wiz(el), 'при ошибке мастер остаётся');
  assert.match(el.querySelector('[data-testid=co-wiz-error]').textContent, /Срок окончания уже прошёл/);
});

test('роль «только своя фирма»: выбор фирмы из «Контрагентов» и подсказка; без фирмы — не отправляется; фирма уходит на сервер', async () => {
  const { api, sets } = fakeApi();
  const el = mount(api);
  await tick();
  click(el.querySelector('[data-testid=co-assign-open]')); await tick();
  check(el.querySelector('[data-pick=u-new] input')); await tick();
  await next(el);
  assert.equal(el.querySelector('[data-testid=co-firm]'), null, 'обычная роль — без выбора фирмы');
  choose(el.querySelector('[data-testid=co-wiz-role]'), 'r-con'); await tick();
  const firm = el.querySelector('[data-testid=co-firm]');
  assert.ok(firm, 'выбор фирмы показан');
  assert.deepEqual(Array.from(firm.querySelectorAll('option')).map((o: N) => o.textContent), ['— выберите —', 'ООО «Альфа-Строй»', 'Бета Монтаж (нужен ИНН)']);
  assert.match(el.querySelector('[data-testid=co-firm-hint]').textContent, /только записи этой фирмы/);
  await next(el);
  assert.match(el.querySelector('[data-testid=co-wiz-error]').textContent, /Выберите фирму подрядчика/);
  choose(el.querySelector('[data-testid=co-firm]'), 'k1'); await tick();
  await next(el);
  assert.match(el.querySelector('[data-testid=co-wiz-what]').textContent, /фирма: ООО «Альфа-Строй»/);
  click(el.querySelector('[data-testid=co-wiz-save]')); await tick();
  assert.equal(sets[0].counterpartyId, 'k1');
  assert.equal(sets[0].roleId, 'r-con');
  assert.equal(sets[0].projectId, null, 'роль только Качества — на всю компанию');
});

test('роль только Качества: вместо проекта и дерева — «Объекты Качества»; отмеченные уходят по id; ничего — все объекты', async () => {
  const { api, sets } = fakeApi();
  const el = mount(api);
  await tick();
  click(el.querySelector('[data-testid=co-assign-open]')); await tick();
  check(el.querySelector('[data-pick=u-new] input')); await tick();
  await next(el);
  choose(el.querySelector('[data-testid=co-wiz-role]'), 'r-Прораб / мастер'); await tick();
  assert.equal(el.querySelector('[data-testid=co-objects]'), null, 'роль без Качества — без объектов');
  choose(el.querySelector('[data-testid=co-wiz-role]'), 'r-eng'); await tick();
  assert.ok(el.querySelector('[data-testid=co-wiz-qonly]'));
  assert.equal(el.querySelector('[data-testid=co-wiz-project]'), null);
  assert.equal(el.querySelector('[data-scope]'), null, '«Вся компания / Проект» не показывается');
  const boxes = Array.from(el.querySelectorAll('[data-testid=co-objects] input[name=qobj]')) as N[];
  assert.deepEqual(boxes.map((b) => b.value), ['obj_1', 'obj_2']);
  await next(el);
  assert.match(el.querySelector('[data-testid=co-wiz-what]').textContent, /Инженер СК · вся компания · все объекты Качества/);
  click(el.querySelector('[data-testid=co-wiz-back]')); await tick();
  check(el.querySelector('[data-testid=co-objects] input[value=obj_2]')); await tick();
  await next(el);
  assert.match(el.querySelector('[data-testid=co-wiz-what]').textContent, /объекты Качества: Школа 400 \(Крыленко\)/);
  click(el.querySelector('[data-testid=co-wiz-save]')); await tick();
  assert.deepEqual([sets[0].projectId, sets[0].objects, sets[0].locations], [null, ['obj_2'], []]);
});

test('«Изменить» у группы: мастер на шаге 2 с ролью, проектом, местами, «за факт»; убрали секцию 1 → на сервер одно место; та же роль — без отзыва', async () => {
  const { api, sets, calls } = fakeApi();
  const el = mount(api);
  await tick();
  const card = await openPerson(el, 'u-for');
  click(card.querySelector('[data-group] [data-testid=co-group-edit]')); await tick();
  assert.ok(el.querySelector('[data-testid=co-wiz-where]'), 'сразу шаг 2');
  assert.equal(el.querySelector('[data-testid=co-wiz-role]').value, 'r-Прораб / мастер');
  assert.equal(el.querySelector('[data-testid=co-wiz-project]').value, 'p1');
  assert.equal(el.querySelector('[data-testid=co-wiz-owner]').checked, true);
  const s1 = Array.from(el.querySelectorAll('[data-testid=p2-tree-check]')).find((b: N) => b.getAttribute('aria-label') === 'Секция 1') as N;
  assert.equal(s1.checked, true);
  check(s1); await tick();
  await next(el);
  assert.match(el.querySelector('[data-testid=co-wiz-what]').textContent, /Проект Альфа · Секция 2 · отвечает за факт/);
  click(el.querySelector('[data-testid=co-wiz-save]')); await tick();
  assert.deepEqual([sets[0].users, sets[0].locations, sets[0].factOwner], [['u-for'], ['s2'], true]);
  assert.deepEqual(calls, ['set'], 'та же роль и проект — сервер сам приводит к области, отдельного отзыва нет');
});

test('«Изменить» → «Отозвать»: подтверждение, отзываются все назначения группы; «Нет» — ничего', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  const card = await openPerson(el, 'u-for');
  click(card.querySelector('[data-group] [data-testid=co-group-edit]')); await tick();
  click(el.querySelector('[data-testid=co-wiz-revoke]')); await tick();
  assert.ok(el.querySelector('[data-testid=sui-dialog]'));
  click(byText(el, '[data-testid=sui-dialog] button', 'Нет')); await tick();
  assert.deepEqual(calls, []);
  click(el.querySelector('[data-testid=co-wiz-revoke]')); await tick();
  assert.match(el.querySelector('[data-testid=sui-dialog]').textContent, /роль «Прораб \/ мастер» · Проект Альфа · Секция 1, Секция 2/);
  click(el.querySelector('[data-testid=co-revoke-yes]')); await tick();
  assert.deepEqual(calls, ['revoke:a-for', 'revoke:a-for2']);
  assert.match(el.querySelector('[data-testid=co-notice]').textContent, /Отозвано назначений: 2/);
  assert.equal(el.querySelectorAll('[data-user-id=u-for] [data-group]').length, 1, 'группа исчезла');
});

test('последнего админа сервер не даёт отозвать — сообщение видно в мастере', async () => {
  const el = mount(fakeApi({ fail: 'Нельзя: в компании не останется ни одного администратора ролей' }).api);
  await tick();
  const card = await openPerson(el, 'u-adm');
  click(card.querySelector('[data-testid=co-group-edit]')); await tick();
  click(el.querySelector('[data-testid=co-wiz-revoke]')); await tick();
  click(el.querySelector('[data-testid=co-revoke-yes]')); await tick();
  assert.match(el.querySelector('[data-testid=co-wiz-error]').textContent, /не останется ни одного администратора/);
});

test('«По проектам»: кто назначен на узел (метка «факт»), узел без ответственного — пометка; «+» — мастер с проектом и местом', async () => {
  const el = mount(fakeApi().api);
  await tick();
  click(el.querySelector('[data-view=projects]')); await tick();
  const tree = el.querySelector('[data-testid=co-bp-tree]');
  const node = (id: string) => tree.querySelector(`[data-node-id=${id}]`);
  assert.match(node('s1').textContent, /Петров · факт/);
  assert.equal(node('s1').querySelector('[data-testid=co-no-owner]'), null);
  assert.match(node('s3').textContent, /Сидорова · Прораб \/ мастер/);
  assert.match(node('s3').querySelector('[data-testid=co-no-owner]').textContent, /нет ответственного за факт — вносит любой прораб проекта/);
  click(node('s3').querySelector('[data-testid=co-bp-add]')); await tick();
  assert.ok(el.querySelector('[data-testid=co-wiz-who]'), 'мастер с шага 1 «Кто»');
  check(el.querySelector('[data-pick=u-new] input')); await tick();
  await next(el);
  assert.equal(el.querySelector('[data-testid=co-wiz-project]').value, 'p1');
  assert.match(el.querySelector('[data-testid=co-wiz-picked]').textContent, /Корпус 1 · Секция 3/);
});

test('с главной «Настроек»: «+ Назначить» открывает мастер, «+ Сотрудник» — форму добавления', async () => {
  (win as N).RBI = { companyIntent: 'assign' };
  let el = mount(fakeApi().api);
  await tick();
  assert.ok(wiz(el));
  assert.equal((win as N).RBI.companyIntent, undefined, 'намерение использовано один раз');
  (win as N).RBI.companyIntent = 'add';
  win.dispatchEvent(new win.Event('company:route')); await tick();
  assert.ok(el.querySelector('[data-testid=co-add]'));
  el = mount(fakeApi().api);
  await tick();
  assert.equal(wiz(el), null);
});

test('P2-0028: ФИО в списке и карточке; без ФИО — почта', async () => {
  const el = mount(fakeApi().api);
  await tick();
  assert.match(el.querySelector('[data-person=u-for]').textContent, /Петров П\.П\./);
  assert.match(el.querySelector('[data-person=u-new]').textContent, /new@test\.invalid/);
  const card = await openPerson(el, 'u-for');
  assert.match(card.textContent, /alfa-foreman@test\.invalid/);
});

test('P2-0028: добавить сотрудника → сервер получает почту, ФИО, роль, объект; временный пароль показан один раз', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  assert.ok(el.querySelector('[data-testid=co-add-open-m]'), 'на телефоне кнопка внизу экрана');
  click(el.querySelector('[data-testid=co-add-open]'));
  await tick();
  const form = el.querySelector('[data-testid=co-add]');
  fill(form, { email: 'New.Man@test.invalid', full_name: 'Новиков Н.Н.', role: 'r-Прораб / мастер', project: 'p1' });
  submit(form);
  await tick();
  assert.equal(calls[0], 'add:c1:New.Man@test.invalid:Новиков Н.Н.:r-Прораб / мастер:p1');
  const box = el.querySelector('[data-testid=co-temp]');
  assert.ok(box, 'окно временного пароля');
  assert.equal(el.querySelector('[data-testid=co-temp-pw]').textContent, 'Tmp7Pass9wordQ');
  assert.match(box.textContent, /Больше этот пароль не покажем/);
  assert.match(box.textContent, /new\.man@test\.invalid/);
  assert.match((await openPerson(el, 'u-added')).textContent, /ещё не сменил временный пароль/);
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
  fill(form, { email: 'a@test.invalid', full_name: 'Аа Б.В.', role: 'r-Прораб / мастер' });
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
  fill(form, { email: 'old@test.invalid', full_name: 'Старый С.С.', role: 'r-Прораб / мастер' });
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
  fill(form, { email: 'x@test.invalid', full_name: 'Икс И.И.', role: 'r-Прораб / мастер' });
  submit(form);
  await tick();
  assert.match(el.querySelector('[role=alert]').textContent, /уже есть в компании/);
});

test('P2-0028: «Сбросить пароль» — только учётке компании, с подтверждением; новый пароль показан', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  assert.equal(await menuItem(el, 'u-adm', 'co-reset'), null, 'себе — нет сброса');
  assert.equal(await menuItem(el, 'u-adm', 'co-disable'), null, 'себе — нет отключения');
  assert.equal(await menuItem(el, 'u-new', 'co-reset'), null, 'учётка не компании — сброса нет');
  click(await menuItem(el, 'u-for', 'co-reset'));
  await tick();
  assert.deepEqual(calls, []);
  click(el.querySelector('[data-testid=co-reset-yes]'));
  await tick();
  assert.deepEqual(calls, ['reset:c1:u-for']);
  assert.equal(el.querySelector('[data-testid=co-temp-pw]').textContent, 'NewTmp8Pass2xy');
  assert.match(el.querySelector('[data-testid=co-temp]').textContent, /Петров П\.П\./);
});

test('P2-0028: «Отключить доступ» — с подтверждением; человек помечен, без ролей и кнопок, в мастере его нет', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  click(await menuItem(el, 'u-for', 'co-disable'));
  await tick();
  click(el.querySelector('[data-testid=co-disable-yes]'));
  await tick();
  assert.deepEqual(calls, ['disable:c1:u-for']);
  const card = el.querySelector('[data-user-id=u-for]');
  assert.ok(card.querySelector('[data-testid=co-badge-disabled]'));
  assert.equal(card.querySelector('[data-testid=co-person-menu]'), null, 'отключённому — без меню');
  assert.equal(card.querySelector('[data-testid=co-group-edit]'), null, 'и без «Изменить»');
  assert.equal(card.querySelector('[data-testid=co-add-part]'), null, 'и без «Добавить участие»');
  assert.match(el.querySelector('[data-person=u-for]').textContent, /доступ отключён/);
  assert.match(el.textContent, /Доступ отключён: Петров П\.П\./);
  click(el.querySelector('[data-testid=co-assign-open]')); await tick();
  assert.equal(el.querySelector('[data-pick=u-for]'), null);
});

test('P2-0028: «Изменить ФИО» — сервер получает новое ФИО, список обновлён, сказано сколько записей обновлено; себе — тоже можно', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  assert.ok(await menuItem(el, 'u-adm', 'co-name-edit'), 'своё ФИО — можно');
  click(await menuItem(el, 'u-for', 'co-name-edit'));
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

test('P2-0033: объекты Качества назначения видны в карточке названиями', async () => {
  const { api } = fakeApi();
  const base = api.listMembers;
  api.listMembers = async (co) => [...await base(co), { ...A('a-eng', 'u-for', 'alfa-foreman@test.invalid', 'Инженер СК', null, true), role_id: 'r-eng',
    quality_objects: [{ id: 'obj_1', name: 'Большевиков,22 (Гений)' }] }];
  const el = mount(api);
  await tick();
  const card = await openPerson(el, 'u-for');
  const g = Array.from(card.querySelectorAll('[data-group]')).find((x: N) => /Инженер СК/.test(x.textContent)) as N;
  assert.match(g.textContent, /Вся компания · Инженер СК/);
  assert.match(g.querySelector('[data-testid=co-row-objects]').textContent, /Объекты Качества: Большевиков,22 \(Гений\)/);
  assert.match(el.querySelector('[data-person=u-for]').textContent, /Инженер СК · Качество: Большевиков,22/);
  click(g.querySelector('[data-testid=co-group-edit]')); await tick();
  assert.equal(el.querySelector('[data-testid=co-objects] input[value=obj_1]').checked, true, '«Изменить» — объекты отмечены');
});

test('P2-0033 (L7): ошибка списка объектов Качества не ломает экран — назначение без выбора объектов', async () => {
  const { api } = fakeApi();
  api.listQualityObjects = async () => { throw new Error('function pf_list_quality_objects does not exist'); };
  const el = mount(api);
  await tick();
  assert.match(el.textContent, /Петров П\.П\./);
  click(el.querySelector('[data-testid=co-assign-open]')); await tick();
  check(el.querySelector('[data-pick=u-new] input')); await tick();
  await next(el);
  choose(el.querySelector('[data-testid=co-wiz-role]'), 'r-eng'); await tick();
  assert.equal(el.querySelector('[data-testid=co-objects]'), null);
});

test('без дерева мест (нет сервиса проектов) — назначение на весь проект', async () => {
  const { api, sets } = fakeApi();
  const el = mount(api, null);
  await tick();
  click(el.querySelector('[data-testid=co-assign-open]')); await tick();
  check(el.querySelector('[data-pick=u-new] input')); await tick();
  await next(el);
  choose(el.querySelector('[data-testid=co-wiz-role]'), 'r-Прораб / мастер'); await tick();
  choose(el.querySelector('[data-testid=co-wiz-project]'), 'p1'); await tick();
  assert.match(el.querySelector('[data-testid=co-wiz-places]').textContent, /недоступно/);
  await next(el);
  click(el.querySelector('[data-testid=co-wiz-save]')); await tick();
  assert.deepEqual(sets[0].locations, []);
});

test('сотрудники: меню «⋯» закрывается Escape; диалог «Нет» — ничего не уходит на сервер', async () => {
  const { api, calls } = fakeApi();
  const el = mount(api);
  await tick();
  click(await menuItem(el, 'u-for', 'co-disable'));
  await tick();
  assert.ok(el.querySelector('[data-testid=sui-dialog]'));
  click(byText(el, '[data-testid=sui-dialog] button', 'Нет')); await tick();
  assert.equal(el.querySelector('[data-testid=sui-dialog]'), null);
  assert.deepEqual(calls, []);
  const btn = el.querySelector('[data-user-id=u-for] [data-testid=co-person-menu]');
  click(btn); await tick();
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
  await tick();
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
});

test('P2-0035b: почта, учётку на которую создала другая компания, — новый временный пароль и пояснение «прежний пароль не действует»', async () => {
  const { api } = fakeApi();
  const el = mount(api);
  await tick();
  click(el.querySelector('[data-testid=co-add-open]'));
  await tick();
  const form = el.querySelector('[data-testid=co-add]');
  fill(form, { email: 'foreign@test.invalid', full_name: 'Иванов И.И.', role: 'r-Прораб / мастер' });
  submit(form);
  await tick();
  assert.equal(el.querySelector('[data-testid=co-temp-pw]').textContent, 'Fr3shPass8wordZ');
  assert.match(el.querySelector('[data-testid=co-temp-note]').textContent, /другая компания — прежний пароль больше не действует/);
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

// P2-0038 этап 2: журнал — фильтры (дата, кто, действие), «Показать ещё» (до 200 — больше сервер не отдаёт), карточки на телефоне
const AT = (at: string, actor: string | null, action: string, extra: Record<string, unknown> = {}) =>
  ({ at, actor_email: actor, action, record_id: 'x', subject_email: 'e@test.invalid', old_data: { role_name: 'Р', name: 'Р' }, new_data: { role_name: 'Р', name: 'Р' }, ...extra });

test('журнал: фильтр по дате (включительно), человеку и виду действия', () => {
  const rows = [AT('2026-10-20T09:00:00Z', 'a@test.invalid', 'ROLE_CREATE'), AT('2026-10-21T09:00:00Z', 'b@test.invalid', 'ASSIGN'),
    AT('2026-10-22T09:00:00Z', null, 'REVOKE'), AT('2026-10-22T10:00:00Z', 'a@test.invalid', 'UPDATE', { table_name: 'counterparties' })];
  const f = { from: '', to: '', who: '', kind: '' as const };
  assert.equal(filterAudit(rows, f).length, 4);
  assert.deepEqual(filterAudit(rows, { ...f, from: '2026-10-21', to: '2026-10-21' }).map((r) => r.action), ['ASSIGN']);
  assert.deepEqual(filterAudit(rows, { ...f, who: 'a@test.invalid' }).map((r) => r.action), ['ROLE_CREATE', 'UPDATE']);
  assert.deepEqual(filterAudit(rows, { ...f, who: 'система' }).map((r) => r.action), ['REVOKE']);
  assert.deepEqual(filterAudit(rows, { ...f, kind: 'assign' }).map((r) => r.action), ['ASSIGN', 'REVOKE']);
  assert.equal(auditKind(rows[3]), 'counterparties');
  assert.equal(auditKind(rows[0]), 'roles');
});

test('журнал: фильтр «Кто» в экране, «Показать ещё» просит больше записей и пропадает на пределе сервера', async () => {
  const { api } = fakeApi();
  const asked: number[] = [];
  const many = (n: number) => Array.from({ length: n }, (_, i) => AT(new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), i % 2 ? 'b@test.invalid' : 'a@test.invalid', 'ASSIGN'));
  const withAudit: CompanyApi = { ...api, async listAudit(_c, limit) { asked.push(limit || 0); return many(limit || 0); } };
  const el = win.document.createElement('div') as N; win.document.body.appendChild(el);
  flushSync(() => createRoot(el).render(createElement(CompanyAudit, { api: withAudit, companyId: 'c1' })));
  await tick();
  assert.deepEqual(asked, [100]);
  assert.equal(el.querySelectorAll('tbody tr').length, 100);
  const who = el.querySelector('[data-testid=co-audit-who]');
  who.value = 'b@test.invalid'; who.dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick();
  assert.equal(el.querySelectorAll('tbody tr').length, 50);
  assert.match(el.querySelector('[data-testid=co-audit-count]').textContent, /Показано 50 из 100/);
  click(el.querySelector('[data-testid=co-audit-more]'));
  await tick();
  assert.deepEqual(asked, [100, AUDIT_MAX]);
  assert.equal(el.querySelectorAll('tbody tr').length, 100, 'фильтр остаётся');
  assert.equal(el.querySelector('[data-testid=co-audit-more]'), null, 'на пределе сервера — кнопки нет');
  click(el.querySelector('[data-testid=co-audit-reset]'));
  await tick();
  assert.equal(el.querySelectorAll('tbody tr').length, AUDIT_MAX);
});

test('журнал: «CHANGE» (047) — понятная фраза и вид «Назначения»', () => {
  const r = AR('CHANGE', { fact_owner: false }, { fact_owner: true }, 'alfa-foreman@test.invalid');
  assert.equal(auditText(r), 'Изменено назначение — alfa-foreman@test.invalid: отвечает за факт');
  assert.equal(auditKind(r), 'assign');
});
