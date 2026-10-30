/// <reference types="node" />
/** P2-0013 этап 5: «Администрирование платформы» — подставной сервер (без сети); DOM — happy-dom. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { renderAdminScreen } from '../AdminScreen.ts';
import { adminError, createAdminService } from '../admin.service.ts';
import type { AdminApi, AdminCompany } from '../admin.service.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const win = new Window({ url: 'http://localhost/' });
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function company(id: string, name: string, planfact: boolean, isTest = false): AdminCompany {
  return { id, name, is_test: isTest, created_at: '', people: 3, modules: [
    { code: 'planfact', name: 'План/Факт', managed: true, enabled: planfact },
    { code: 'quality', name: 'Качество', managed: true, enabled: true },
    { code: 'construction', name: 'Стройконтроль', managed: true, enabled: true },
    { code: 'knowledge', name: 'База знаний', managed: true, enabled: true },
    { code: 'ai', name: 'ИИ-помощник', managed: true, enabled: false }
  ] };
}

function fakeApi(over: Partial<AdminApi> = {}) {
  const calls: string[] = [];
  let list = [company('a', 'Альфа', true), company('d', 'Демо-компания', false)];
  const api: AdminApi = {
    async companies() { calls.push('companies'); return { ok: true, value: list }; },
    async createCompany(name, t) { calls.push(`create:${name}:${t}`); list = [...list, company('n', name, true)]; return { ok: true, value: 'n' }; },
    async setModule(c, m, e) { calls.push(`module:${c}:${m}:${e}`); return { ok: true, value: undefined }; },
    async setCompanyAdmin(c, e) { calls.push(`admin:${c}:${e}`); return { ok: true, value: undefined }; },
    ...over
  };
  return { api, calls };
}

function mem(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
}
function host(): N { const el = win.document.createElement('div'); win.document.body.appendChild(el); return el; }
function submit(form: N): void { form.dispatchEvent(new win.Event('submit', { cancelable: true })); }

test('список компаний: название, тестовая, людей; 5 выключателей модулей (P2-0031), у Базы знаний и ИИ — пояснение', async () => {
  const el = host();
  // P2-0075: Альфа — тестовая, видна с отмеченной «Показать тестовые»
  renderAdminScreen(el, { api: fakeApi({ async companies() { return { ok: true, value: [company('a', 'Альфа', true, true), company('d', 'Демо-компания', false)] }; } }).api,
    storage: mem({ platform2_show_test_companies: '1' }) });
  await tick();
  const cards = el.querySelectorAll('[data-company]');
  assert.equal(cards.length, 2);
  assert.match(cards[0].textContent, /Альфа.*тестовая.*людей: 3/s);
  assert.doesNotMatch(cards[1].textContent, /тестовая/);
  const pf = cards[0].querySelector('[data-module=planfact] input[type=checkbox]');
  assert.equal(pf.checked, true);
  assert.equal(cards[1].querySelector('[data-module=planfact] input[type=checkbox]').checked, false);
  const names = Array.from(cards[0].querySelectorAll('[data-module]')).map((x: N) => x.getAttribute('data-module'));
  assert.deepEqual(names, ['planfact', 'quality', 'construction', 'knowledge', 'ai']);
  assert.equal(cards[0].querySelectorAll('[data-module] input[type=checkbox]').length, 5);
  assert.equal(cards[0].querySelector('[data-module=ai] input').checked, false);
  assert.match(cards[0].querySelector('[data-module=ai] input').getAttribute('aria-label'), /ИИ-помощник у компании Альфа/);
  assert.match(cards[0].querySelector('[data-module=knowledge]').textContent, /вместе с «Качеством»/);
  assert.match(cards[0].querySelector('[data-module=ai]').textContent, /галочка «ИИ-помощник» в роли/);
  assert.equal(cards[0].querySelector('[data-module=quality] [data-testid=pa-mod-hint]'), null);
  assert.ok(!/старому входу/.test(el.textContent));
});

test('выключатель «ИИ-помощник»: вызов сервера с кодом ai только для этой компании', async () => {
  const { api, calls } = fakeApi();
  const el = host();
  renderAdminScreen(el, { api });
  await tick();
  const box = el.querySelector('[data-company=d] [data-module=ai] input');
  box.checked = true;
  box.dispatchEvent(new win.Event('change'));
  await tick();
  assert.ok(calls.includes('module:d:ai:true'));
  assert.ok(!calls.some((c) => c.startsWith('module:a:')));
  assert.match(el.querySelector('[data-company=d]').textContent, /«ИИ-помощник» включён/);
});

test('выключатель модуля: вызов сервера, сообщение, «кто я» перечитывается; отказ сервера — выключатель возвращается', async () => {
  const { api, calls } = fakeApi();
  let changed = 0;
  const el = host();
  renderAdminScreen(el, { api, onChanged: () => { changed++; } });
  await tick();
  const box = el.querySelector('[data-company=a] [data-module=planfact] input');
  box.checked = false; box.dispatchEvent(new win.Event('change'));
  await tick();
  assert.ok(calls.includes('module:a:planfact:false'));
  assert.match(el.querySelector('[data-company=a] .sui-msg').textContent, /выключен/);
  assert.equal(changed, 1);

  const bad = fakeApi({ async setModule() { return { ok: false, message: 'Только для администратора платформы' }; } });
  const el2 = host();
  renderAdminScreen(el2, { api: bad.api });
  await tick();
  const b2 = el2.querySelector('[data-company=a] [data-module=planfact] input');
  b2.checked = false; b2.dispatchEvent(new win.Event('change'));
  await tick();
  assert.equal(b2.checked, true, 'вернулся как было');
  assert.equal(el2.querySelector('[data-company=a] .sui-msg').getAttribute('data-kind'), 'error');
});

test('создать компанию: пустое название — подсказка без запроса; иначе — создана, список перечитан', async () => {
  const { api, calls } = fakeApi();
  const el = host();
  renderAdminScreen(el, { api });
  await tick();
  const form = el.querySelector('[data-testid=pa-create]');
  submit(form);
  assert.match(form.querySelector('.sui-msg').textContent, /Введите название/);
  assert.ok(!calls.some((c) => c.startsWith('create')));
  form.querySelector('input[name=name]').value = 'Гамма';
  form.querySelector('input[name=is_test]').checked = true;
  submit(form);
  await tick(); await tick();
  assert.ok(calls.includes('create:Гамма:true'));
  assert.equal(el.querySelectorAll('[data-company]').length, 3);
});

test('назначить администратора компании: почта обязательна; ошибка сервера показана как есть', async () => {
  const { api, calls } = fakeApi({ async setCompanyAdmin() { return { ok: false, message: 'Учётка с такой почтой не найдена — сначала её нужно завести' }; } });
  const el = host();
  renderAdminScreen(el, { api });
  await tick();
  const form = el.querySelector('[data-company=d] [data-testid=pa-admin]');
  submit(form);
  assert.match(el.querySelector('[data-company=d] .sui-msg').textContent, /Введите почту/);
  form.querySelector('input').value = 'nobody@x.ru';
  submit(form);
  await tick();
  assert.match(el.querySelector('[data-company=d] .sui-msg').textContent, /не найдена/);
  assert.ok(!calls.some((c) => c.startsWith('admin')), 'подставной setCompanyAdmin заменён');
});

test('назначить администратора компании: успех — сообщение над списком после перерисовки', async () => {
  const { api, calls } = fakeApi();
  const el = host();
  renderAdminScreen(el, { api });
  await tick();
  const form = el.querySelector('[data-company=d] [data-testid=pa-admin]');
  form.querySelector('input').value = 'boss@x.ru';
  submit(form);
  await tick(); await tick();
  assert.ok(calls.includes('admin:d:boss@x.ru'));
  assert.match(el.textContent, /boss@x\.ru — администратор компании «Демо-компания»/);
});

// P2-0075: тестовые компании скрыты, пока не отмечено «Показать тестовые»; выбор запоминается на устройстве
const withTests = (): AdminApi => fakeApi({ async companies() {
  return { ok: true, value: [company('r', 'РБИ', true), company('a', 'Альфа', true, true), company('b', 'Бета', true, true)] }; } }).api;

test('P2-0075: тестовые компании скрыты по умолчанию; «Показать тестовые (2)» показывает и запоминается', async () => {
  const el = host(); const store = mem();
  renderAdminScreen(el, { api: withTests(), storage: store });
  await tick();
  const ids = (): string => [...el.querySelectorAll('[data-company]')].map((c: N) => c.getAttribute('data-company')).join(',');
  assert.equal(ids(), 'r', 'без галочки — только РБИ');
  const box = el.querySelector('[data-testid=pa-show-test]');
  assert.ok(box && !box.checked && !box.parentElement.hidden);
  assert.match(box.parentElement.textContent, /Показать тестовые \(2\)/);
  let fired = 0; win.addEventListener('rbi:platform-show-test', () => { fired++; });
  box.checked = true; box.dispatchEvent(new win.Event('change'));
  assert.equal(ids(), 'r,a,b', 'с галочкой — и тестовые');
  assert.equal(store.m.get('platform2_show_test_companies'), '1');
  assert.equal(fired, 1, 'переключатели компании узнают о галочке');
  // повторное открытие экрана — галочка запомнена
  const el2 = host();
  renderAdminScreen(el2, { api: withTests(), storage: store });
  await tick();
  assert.equal([...el2.querySelectorAll('[data-company]')].length, 3);
  box.checked = false; box.dispatchEvent(new win.Event('change'));
  assert.equal(ids(), 'r');
  assert.equal(store.m.has('platform2_show_test_companies'), false);
});

test('P2-0075: тестовых нет — галочки нет; только тестовые — подсказка вместо пустоты', async () => {
  const el = host();
  renderAdminScreen(el, { api: fakeApi().api, storage: mem() });
  await tick();
  assert.equal(el.querySelector('[data-testid=pa-show-test]').parentElement.hidden, true);
  const el2 = host();
  renderAdminScreen(el2, { api: fakeApi({ async companies() { return { ok: true, value: [company('a', 'Альфа', true, true)] }; } }).api, storage: null });
  await tick();
  assert.equal(el2.querySelectorAll('[data-company]').length, 0);
  assert.match(el2.textContent, /Есть только тестовые компании — отметьте «Показать тестовые»/);
});

test('не администратор: сервер отказал — понятное сообщение вместо списка', async () => {
  const el = host();
  renderAdminScreen(el, { api: createAdminService(async () => ({ data: null, error: { message: 'Только для администратора платформы', code: '42501' } })) });
  await tick();
  assert.equal(el.querySelectorAll('[data-company]').length, 0);
  assert.match(el.textContent, /Только для администратора платформы/);
});

test('сервис: аргументы функций сервера и разбор ответа; сообщения ошибок', async () => {
  const seen: [string, unknown][] = [];
  const svc = createAdminService(async (fn, args) => { seen.push([fn, args]); return { data: fn === 'pf_platform_companies' ? [{ id: 'x', name: 'Икс', is_test: false, people: '2', modules: [{ code: 'planfact', name: 'План/Факт', managed: true, enabled: true }] }] : 'id1', error: null }; });
  const list = await svc.companies();
  assert.ok(list.ok && list.value[0].people === 2 && list.value[0].modules[0].enabled === true);
  await svc.setModule('x', 'planfact', false);
  await svc.setCompanyAdmin('x', 'a@b.c');
  assert.deepEqual(seen.slice(1), [['pf_platform_set_module', { p_company: 'x', p_module: 'planfact', p_enabled: false }], ['pf_platform_set_company_admin', { p_company: 'x', p_email: 'a@b.c' }]]);
  assert.equal(adminError({ message: 'Failed to fetch' }), 'Нет связи с сервером. Попробуйте позже');
  assert.equal(adminError({ message: 'permission denied', code: '42501' }), 'Только для администратора платформы');
  assert.equal(adminError({ message: 'something' }), 'Не удалось выполнить. Попробуйте ещё раз');
});
