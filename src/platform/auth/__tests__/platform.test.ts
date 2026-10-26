/// <reference types="node" />
/** P2-0013: один вход платформы — состояние (почта / PIN / демо), доступные модули по ответу сервера, экран «Вход». Без сети; DOM — happy-dom. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createPlatform, accessFor, parsePlatform, homePathFor, ENTRY_KEY, COMPANY_KEY } from '../platform.service.ts';
import type { PlatformDeps } from '../platform.service.ts';
import type { AuthApi } from '../auth.service.ts';
import { renderLoginScreen } from '../login-screen.ts';

const ALFA = { id: 'a', name: 'Альфа', is_test: true, roles: ['Прораб / мастер'], modules: ['planfact'], can_manage_company: false };
const BETA = { id: 'b', name: 'Бета', is_test: true, roles: ['Администратор компании'], modules: [], can_manage_company: true };

function memStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
}

function fakeAuth(opts: { password?: string; signedIn?: boolean } = {}): AuthApi & { calls: string[] } {
  let signed = !!opts.signedIn;
  const calls: string[] = [];
  return {
    calls,
    async signIn(_e, p) { calls.push('signIn'); if (p === (opts.password || 'ok')) { signed = true; return { ok: true }; } return { ok: false, message: 'Неверная почта или пароль' }; },
    async signOut() { calls.push('signOut'); signed = false; },
    async getEmail() { return signed ? 'pto@test.invalid' : null; },
    async getAccess() { return []; }
  };
}

function deps(over: Partial<PlatformDeps> & { data?: unknown } = {}): PlatformDeps & { rpcCalls: string[] } {
  const rpcCalls: string[] = [];
  return {
    auth: over.auth === undefined ? fakeAuth() : over.auth,
    rpc: over.rpc || (async (fn) => { rpcCalls.push(fn); return { data: over.data ?? { is_platform_admin: false, companies: [ALFA, BETA] }, error: null }; }),
    storage: over.storage === undefined ? memStorage() : over.storage,
    pinActive: over.pinActive || (() => false),
    rpcCalls
  };
}

test('никто не вошёл → режим none (экран «Вход»), сервер не спрашивается', async () => {
  const d = deps();
  const p = createPlatform(d);
  const st = await p.boot();
  assert.equal(st.mode, 'none');
  assert.deepEqual(d.rpcCalls, []);
  assert.deepEqual(p.access(), { company: false, platformAdmin: false });
});

test('сессия есть (F5) → сразу вошёл почтой, модули выбранной компании из pf_my_platform', async () => {
  const d = deps({ auth: fakeAuth({ signedIn: true }) });
  const p = createPlatform(d);
  const st = await p.boot();
  assert.equal(st.mode, 'email');
  assert.equal(st.email, 'pto@test.invalid');
  assert.deepEqual(d.rpcCalls, ['pf_my_platform', 'pf_my_profile']);
  assert.equal(st.companyId, 'a', 'по умолчанию — первая компания с модулями');
  assert.deepEqual(p.access(), { company: true, platformAdmin: false, planfact: true });
});

test('неверный пароль — понятное сообщение, остаёмся на экране входа; пустые поля — подсказка без запроса', async () => {
  const auth = fakeAuth();
  const p = createPlatform(deps({ auth }));
  await p.boot();
  assert.deepEqual(await p.signIn('a@b.c', 'bad'), { ok: false, message: 'Неверная почта или пароль' });
  assert.equal(p.getState().mode, 'none');
  assert.deepEqual(await p.signIn('  ', ''), { ok: false, message: 'Введите почту и пароль' });
  assert.deepEqual(auth.calls, ['signIn']);
});

test('верный пароль → вошёл; выход — экран «Вход», выбор компании и демо забыты', async () => {
  const storage = memStorage({ [ENTRY_KEY]: 'demo' });
  const p = createPlatform(deps({ storage }));
  assert.equal((await p.boot()).mode, 'demo');
  const seen: string[] = [];
  p.subscribe((st) => seen.push(st.mode));
  assert.deepEqual(await p.signIn('pto@test.invalid', 'ok'), { ok: true });
  assert.equal(p.getState().mode, 'email');
  assert.equal(storage.getItem(ENTRY_KEY), null, 'после входа почтой демо не запоминается');
  p.setCompany('b');
  assert.equal(storage.getItem(COMPANY_KEY), 'b');
  await p.signOut();
  assert.equal(p.getState().mode, 'none');
  assert.equal(storage.getItem(COMPANY_KEY), null);
  assert.deepEqual(seen, ['email', 'email', 'none']);
});

test('переключатель компании: модули — по выбранной; выбор запоминается на устройстве; чужой id не принимается', async () => {
  const storage = memStorage({ [COMPANY_KEY]: 'b' });
  const p = createPlatform(deps({ auth: fakeAuth({ signedIn: true }), storage }));
  await p.boot();
  assert.equal(p.getState().companyId, 'b');
  assert.equal(p.access().planfact, undefined, 'у Беты модуль выключен — пункта нет');
  p.setCompany('a');
  assert.equal(p.access().planfact, true);
  p.setCompany('zzz');
  assert.equal(p.getState().companyId, 'a');
});

test('демо: выбор запоминается; PIN (облако Quality подключено) — режим pin, без модулей Platform 2.0', async () => {
  const storage = memStorage();
  const p = createPlatform(deps({ storage }));
  await p.boot();
  p.chooseDemo();
  assert.equal(storage.getItem(ENTRY_KEY), 'demo');
  assert.equal((await createPlatform(deps({ storage })).boot()).mode, 'demo');
  const pin = createPlatform(deps({ pinActive: () => true }));
  assert.equal((await pin.boot()).mode, 'pin');
  assert.deepEqual(pin.access(), { company: false, platformAdmin: false });
});

test('ответ сервера разбирается безопасно; админ платформы — флаг для «Администрирования платформы»', () => {
  assert.deepEqual(parsePlatform(null), { isPlatformAdmin: false, companies: [] });
  const parsed = parsePlatform({ is_platform_admin: true, companies: [{ id: 'x', name: 'Икс', modules: ['planfact'], roles: [], can_manage_company: true }] });
  assert.equal(parsed.isPlatformAdmin, true);
  const a = accessFor({ mode: 'email', email: 'o@x', isPlatformAdmin: true, companies: parsed.companies, companyId: 'x' });
  assert.deepEqual(a, { company: true, platformAdmin: true, planfact: true });
  assert.deepEqual(accessFor({ mode: 'pin', email: null, isPlatformAdmin: true, companies: parsed.companies, companyId: 'x' }), { company: false, platformAdmin: false });
});

test('сервер не настроен — вход недоступен, понятное сообщение; хранилище недоступно — без падения', async () => {
  const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
  const p = createPlatform(deps({ auth: null, rpc: null, storage: bad }));
  assert.equal((await p.boot()).mode, 'none');
  assert.deepEqual(await p.signIn('a@b.c', 'x'), { ok: false, message: 'Сервер не настроен — вход недоступен' });
  p.chooseDemo();
  assert.equal(p.getState().mode, 'demo');
});

// --- Экран «Вход» ---
const win = new Window({ url: 'http://localhost/' });
function host() { const el = win.document.createElement('div'); win.document.body.appendChild(el); return el as unknown as HTMLElement; }
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

test('экран «Вход»: по умолчанию «Почта и пароль»; ошибка пароля видна; пустые поля — подсказка', async () => {
  const el = host();
  const calls: string[] = [];
  renderLoginScreen(el, { signIn: async (e) => { calls.push(e); return { ok: false, message: 'Неверная почта или пароль' }; }, onDemo: () => {} });
  const form = el.querySelector('[data-testid=p2-login-email]') as HTMLFormElement;
  const err = el.querySelector('[role=alert]') as HTMLElement;
  form.dispatchEvent(new win.Event('submit', { cancelable: true }) as unknown as Event);
  assert.equal(err.hidden, false);
  assert.equal(err.textContent, 'Введите почту и пароль');
  assert.deepEqual(calls, []);
  (form.querySelector('input[name=email]') as HTMLInputElement).value = 'a@b.c';
  (form.querySelector('input[name=password]') as HTMLInputElement).value = 'bad';
  form.dispatchEvent(new win.Event('submit', { cancelable: true }) as unknown as Event);
  await tick();
  assert.deepEqual(calls, ['a@b.c']);
  assert.equal(err.textContent, 'Неверная почта или пароль');
  assert.equal((form.querySelector('button[type=submit]') as HTMLButtonElement).disabled, false);
});

test('экран «Вход» (P2-0016): только «Почта и пароль» и демо — вкладок и формы PIN нет', () => {
  const el = host();
  renderLoginScreen(el, { signIn: async () => ({ ok: true }), onDemo: () => {} });
  assert.equal(el.querySelectorAll('[role=tab]').length, 0);
  assert.equal(el.querySelector('[data-testid=p2-login-pin]'), null);
  for (const id of ['gate-sync-name', 'gate-sync-code', 'gate-sync-pin']) assert.equal(el.querySelector('#' + id), null, id);
  assert.equal(el.querySelector('[data-shell-action=submitAuthGateConnect]'), null);
  assert.ok(el.querySelector('[data-testid=p2-login-email]'));
  assert.doesNotMatch(el.textContent || '', /PIN/);
});

test('экран «Вход»: «Посмотреть без входа (демо)»', () => {
  const el = host();
  let demo = 0;
  renderLoginScreen(el, { signIn: async () => ({ ok: true }), onDemo: () => { demo++; } });
  (el.querySelector('[data-testid=p2-login-demo]') as HTMLElement).click();
  assert.equal(demo, 1);
});

test('P2-0030: после входа почтой — последний открытый модуль, если он доступен; иначе как раньше', () => {
  const both = { planfact: true, quality: true };
  assert.equal(homePathFor(both, '#/quality/analytics/contractors'), '#/quality/analytics/contractors');
  assert.equal(homePathFor(both, '#/planfact/fact'), '#/planfact/fact');
  assert.equal(homePathFor({ quality: true, construction: true }, '#/construction-v2'), '#/construction-v2');
  // модуль отключён у компании (или чужое устройство) — первый доступный
  assert.equal(homePathFor({ planfact: true }, '#/quality/audit'), '#/planfact');
  assert.equal(homePathFor({ quality: true }, '#/planfact'), '#/settings');
  // первый вход / мусор в ключе — как раньше
  assert.equal(homePathFor(both, null), '#/planfact');
  assert.equal(homePathFor(both, '#/qualityx'), '#/planfact');
  assert.equal(homePathFor({}, '#/planfact'), '#/settings');
});
