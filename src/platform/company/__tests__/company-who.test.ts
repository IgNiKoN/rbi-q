/// <reference types="node" />
/** P2-0070: «Сотрудники и доступ → Кто что может» — модули и колонки из каталога, люди и действия — ответ сервера (pf_who_can),
 *  выбор объекта и места уходит на сервер, телефон — карточки. Подставной API, DOM — happy-dom. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { CompanyWho, whoLine, whoModules } from '../CompanyWho.ts';
import type { CatalogRow, CompanyApi, WhoRow } from '../company.service.ts';
import type { PlaceItem } from '../AssignWizard.ts';
import { settle } from '../../../test-utils/settle.ts';

const win = new Window({ url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
before(() => {
  g.window = win; g.document = win.document; g.HTMLElement = win.HTMLElement; g.Node = win.Node;
  g.HTMLInputElement = win.HTMLInputElement; g.HTMLSelectElement = win.HTMLSelectElement; g.Event = win.Event; g.IS_REACT_ACT_ENVIRONMENT = false;
});
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

const SK = { module: 'construction', module_name: 'Стройконтроль', area_scoped: true };
const PF = { module: 'planfact', module_name: 'План/Факт' };
const CATALOG: CatalogRow[] = [
  { action: 'planfact.fact.create', description: 'Ввод фактического объёма', ...PF, group_name: 'Факт', sort: 1120, label: 'Ввод фактического объёма', area_scoped: true },
  { action: 'planfact.money.view', description: 'Просмотр денежных сумм', ...PF, group_name: 'Деньги и выплаты', sort: 1310, label: 'Просмотр денежных сумм' },
  { action: 'quality.view', description: 'Качество: просмотр', module: 'quality', module_name: 'Качество', group_name: 'Доступ', sort: 2010, label: 'Просмотр' },
  { action: 'construction.defects.view', description: 'Стройконтроль: видеть замечания', ...SK, group_name: 'Замечания', sort: 3010, label: 'Видеть замечания' },
  { action: 'construction.defects.close', description: 'Стройконтроль: закрыть замечание', ...SK, group_name: 'Замечания', sort: 3060, label: 'Закрыть замечание' },
  { action: 'construction.acceptance.view', description: 'Стройконтроль: видеть приёмки', ...SK, group_name: 'Приёмка', sort: 3110, label: 'Видеть приёмки' },
  { action: 'construction.view', description: 'Стройконтроль: просмотр', module: 'construction', module_name: 'Стройконтроль', group_name: 'Прежний доступ', sort: 3410, label: 'Просмотр' },
  { action: 'security.roles.assign', description: 'Назначение ролей', module: null, module_name: 'Компания', group_name: 'Сотрудники и справочники', sort: 9010 }
];
const ROWS: WhoRow[] = [
  { user_id: 'u1', full_name: 'Петров Пётр', email: 'p@x', roles: ['Инженер СК'], places: ['вся компания'], partial: false, firm: null,
    actions: ['construction.defects.view', 'construction.defects.close', 'construction.acceptance.view', 'construction.view'] },
  { user_id: 'u2', full_name: 'Козлов Дмитрий', email: 'k@x', roles: ['Инженер СК (без закрытия)'], places: ['Корпус 1 / Секция 1'], partial: true, firm: null,
    actions: ['construction.defects.view'] },
  { user_id: 'u3', full_name: 'Смирнов Олег', email: 's@x', roles: ['Подрядчик'], places: ['весь объект'], partial: false, firm: 'ООО «Каркас»',
    actions: ['construction.defects.view', 'quality.scope.contractor'] },
  { user_id: 'u4', full_name: 'Волков Илья', email: 'v@x', roles: ['Прораб'], places: ['Корпус 1 / Секция 2'], partial: true, firm: null,
    actions: ['planfact.fact.create'] }
];

function fake() {
  const calls: string[] = [];
  const api = {
    async catalog() { return CATALOG; },
    async listProjects() { return [{ id: 'p1', name: 'ЖК «Северный»', company_id: 'c1' }, { id: 'p2', name: 'Чужой', company_id: 'c2' }]; },
    async whoCan(_c: string, p: string, loc: string | null) { calls.push(`who:${p}:${loc ?? '-'}`); return { ok: true as const, value: ROWS }; },
    async listRoles() { return [{ id: 'r-sk', name: 'Инженер СК' }, { id: 'r-sk2', name: 'Инженер СК (без закрытия)' }, { id: 'r-pr', name: 'Прораб' }]; }
  } as unknown as CompanyApi;
  const places = async (_p: string, parent: string | null): Promise<PlaceItem[]> => parent === null
    ? [{ id: 'k1', parent_id: null, name: 'Корпус 1', node_type: 'building', path: 'Корпус 1', hasKids: true }]
    : [{ id: 's1', parent_id: 'k1', name: 'Секция 1', node_type: 'section', path: 'Корпус 1 / Секция 1', hasKids: true }];
  return { api, calls, places };
}
async function mount(api: CompanyApi, places: (p: string, parent: string | null) => Promise<PlaceItem[]>, onOpen?: (t: 'roles' | 'members', id: string) => void) {
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  flushSync(() => createRoot(el as N).render(createElement(CompanyWho, { api, companyId: 'c1', loadPlaces: places, onOpen })));
  await settle(); await settle(); await settle();
  return el as N;
}
const cols = (el: N) => Array.from(el.querySelectorAll('[data-testid=co-who-table] thead tr:last-child th')).map((x: N) => x.textContent);

test('модули экрана — из каталога: только модули с действиями по участию; прежний доступ и Качество — нет', () => {
  assert.deepEqual(whoModules(CATALOG).map((m) => m.name), ['План/Факт', 'Стройконтроль']);
  assert.deepEqual(whoModules(CATALOG)[1].groups.map((x) => x.title), ['Замечания', 'Приёмка']);
  assert.equal(whoLine(ROWS[1]), 'Инженер СК (без закрытия) · только Корпус 1 / Секция 1');
  assert.equal(whoLine(ROWS[0]), 'Инженер СК · вся компания');
});

test('таблица: колонки — подписи каталога, люди и галочки — ответ сервера; модуль переключается', async () => {
  const { api, calls, places } = fake();
  const el = await mount(api, places);
  assert.deepEqual(calls, ['who:p1:-'], 'объект компании, весь объект');
  assert.equal(el.querySelectorAll('[data-testid=co-who-project] option').length, 1, 'только объекты своей компании');
  assert.deepEqual(Array.from(el.querySelectorAll('[data-testid=co-who-place] option')).map((o: N) => o.textContent), ['Весь объект', 'Корпус 1', '— Секция 1']);
  // первый модуль — План/Факт: только Волков
  assert.deepEqual(cols(el), ['Ввод фактического объёма', 'Просмотр денежных сумм']);
  assert.deepEqual(Array.from(el.querySelectorAll('[data-testid=co-who-table] tbody tr')).map((r: N) => r.getAttribute('data-user')), ['u4']);
  el.querySelector('[data-mod=construction]').dispatchEvent(new win.Event('click', { bubbles: true })); await settle();
  assert.deepEqual(cols(el), ['Видеть замечания', 'Закрыть замечание', 'Видеть приёмки']);
  const rowOf = (u: string) => el.querySelector(`[data-testid=co-who-table] tbody tr[data-user=${u}]`);
  assert.equal(rowOf('u1').querySelector('[data-action="construction.defects.close"] .cw-yes') !== null, true, 'Петров закрывает');
  assert.equal(rowOf('u2').querySelector('[data-action="construction.defects.close"] .cw-no') !== null, true, 'Козлов — нет');
  assert.match(rowOf('u2').textContent, /только Корпус 1 \/ Секция 1/);
  assert.match(rowOf('u3').textContent, /только записи фирмы ООО «Каркас»/);
  assert.equal(el.querySelectorAll('.cw-list .cw-p').length, 3, 'телефон — карточки тех же людей');
});

test('выбор места уходит на сервер', async () => {
  const { api, calls, places } = fake();
  const el = await mount(api, places);
  const sel = el.querySelector('[data-testid=co-who-place]');
  sel.value = 's1'; sel.dispatchEvent(new win.Event('change', { bubbles: true })); await settle(); await settle();
  assert.deepEqual(calls, ['who:p1:-', 'who:p1:s1']);
});

test('P2-0073: роль ведёт в «Роли и права» с этой ролью, человек — в «Сотрудники» с ним; подсказка вверху', async () => {
  const { api, places } = fake();
  const went: string[] = [];
  const el = await mount(api, places, (t, id) => went.push(t + ':' + id));
  const help = el.querySelector('[data-testid=co-who-help]');
  assert.match(help.textContent, /Здесь только смотреть\. Что может роль — «Роли и права»; кому какая роль и где — «Сотрудники»/);
  help.querySelector('[data-testid=co-who-go-roles]').dispatchEvent(new win.Event('click', { bubbles: true }));
  help.querySelector('[data-testid=co-who-go-members]').dispatchEvent(new win.Event('click', { bubbles: true }));
  el.querySelector('[data-mod=construction]').dispatchEvent(new win.Event('click', { bubbles: true })); await settle();
  // таблица (ПК): строка Козлова — его роль и он сам
  const row = el.querySelector('[data-testid=co-who-table] tbody tr[data-user=u2]');
  row.querySelector('[data-testid=co-who-role]').dispatchEvent(new win.Event('click', { bubbles: true }));
  row.querySelector('[data-testid=co-who-person]').dispatchEvent(new win.Event('click', { bubbles: true }));
  // карточка (телефон): Петров
  const card = el.querySelector('.cw-list .cw-p[data-user=u1]');
  assert.equal(card.querySelector('[data-testid=co-who-role]').textContent, 'Инженер СК');
  card.querySelector('[data-testid=co-who-role]').dispatchEvent(new win.Event('click', { bubbles: true }));
  card.querySelector('[data-testid=co-who-person]').dispatchEvent(new win.Event('click', { bubbles: true }));
  assert.deepEqual(went, ['roles:', 'members:', 'roles:r-sk2', 'members:u2', 'roles:r-sk', 'members:u1']);
  assert.match(row.textContent, /Инженер СК \(без закрытия\) · только Корпус 1 \/ Секция 1/, 'где — по-прежнему текстом');
});

test('P2-0073: без перехода (onOpen не задан) — как раньше, только текст', async () => {
  const { api, places } = fake();
  const el = await mount(api, places);
  assert.equal(el.querySelectorAll('[data-testid=co-who-role], [data-testid=co-who-person], .cw-link').length, 0);
  assert.match(el.querySelector('[data-testid=co-who-help]').textContent, /Здесь только смотреть/);
});
