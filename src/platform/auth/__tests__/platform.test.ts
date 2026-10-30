/// <reference types="node" />
/** P2-0013: один вход платформы — состояние (почта / PIN / демо), доступные модули по ответу сервера, экран «Вход». Без сети; DOM — happy-dom. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createPlatform, accessFor, parsePlatform, homePathFor, readWorkActions, welcomeSeen, markWelcomeSeen, WELCOME_PATH, ENTRY_KEY, COMPANY_KEY } from '../platform.service.ts';
import type { HomeInput, PlatformDeps } from '../platform.service.ts';
import { deviceUserKey } from '../quality-bridge.ts';
import type { AuthApi } from '../auth.service.ts';
import { renderLoginScreen } from '../login-screen.ts';
import { readShowTest, SHOW_TEST_KEY, visibleCompanies, writeShowTest } from '../test-companies.ts';

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

test('P2-0074: одно правило первого экрана — приветствие, последний раздел, раздел по работе', () => {
  const email = (o: Partial<HomeInput>): HomeInput => ({ mode: 'email', access: {}, lastHash: null, welcomeSeen: true, actions: null, ...o });
  const all = { planfact: true, quality: true, construction: true };
  const insp = { quality: ['quality.inspections.view', 'quality.inspections.create'] };
  const rows: Array<[string, HomeInput, string | null]> = [
    ['первый вход учётки на устройстве — приветствие', email({ access: all, lastHash: '#/planfact/vor', welcomeSeen: false }), WELCOME_PATH],
    ['первый вход, разделов нет — всё равно приветствие', email({ welcomeSeen: false }), WELCOME_PATH],
    ['последний раздел доступен (P2-0030)', email({ access: all, lastHash: '#/quality/analytics/contractors' }), '#/quality/analytics/contractors'],
    ['последний — План/Факт', email({ access: all, lastHash: '#/planfact/fact' }), '#/planfact/fact'],
    ['последний — Стройконтроль 2.0', email({ access: { quality: true, construction: true }, lastHash: '#/construction-v2' }), '#/construction-v2'],
    ['последний отозван, остался один раздел — он', email({ access: { planfact: true }, lastHash: '#/quality/audit' }), '#/planfact'],
    ['последний отозван, инженер качества (проводит проверки)', email({ access: { quality: true, planfact: true }, lastHash: '#/construction/defects', actions: insp }), '#/quality/audit'],
    ['мусор в ключе — как без последнего', email({ access: { quality: true }, lastHash: '#/qualityx' }), '#/quality/audit'],
    ['Настройки последним не бывают', email({ access: { quality: true }, lastHash: '#/settings/my' }), '#/quality/audit'],
    ['роль Качества: проверки → Осмотр', email({ access: all, actions: { ...insp, construction: ['construction.defects.view'] } }), '#/quality/audit'],
    ['роль СК: работает в Стройконтроле → Стройконтроль', email({ access: all, actions: { quality: ['quality.inspections.view'], construction: ['construction.defects.view', 'construction.defects.create'] } }), '#/construction/defects'],
    ['только СК', email({ access: { construction: true } }), '#/construction/defects'],
    ['ПТО: только План/Факт', email({ access: { planfact: true } }), '#/planfact'],
    ['ПТО: в Качестве и СК только смотрит → План/Факт', email({ access: all, actions: { quality: ['quality.inspections.view'], construction: ['construction.defects.view'] } }), '#/planfact'],
    ['руководитель (администратор компании) — приветствие', email({ access: { ...all, company: true }, actions: insp }), WELCOME_PATH],
    ['администратор платформы — приветствие', email({ access: { ...all, platformAdmin: true } }), WELCOME_PATH],
    ['несколько разделов, только смотрит, План/Факта нет — приветствие', email({ access: { quality: true, construction: true }, actions: { quality: ['quality.inspections.view'] } }), WELCOME_PATH],
    ['без сети, копии действий нет, несколько разделов — приветствие', email({ access: { quality: true, construction: true } }), WELCOME_PATH],
    ['без модулей — Настройки', email({ access: { company: true } }), '#/settings'],
    ['без модулей и прав — Настройки', email({}), '#/settings'],
    ['никто не вошёл — вести некуда (экран «Вход»)', { mode: 'none', access: {}, lastHash: '#/planfact', welcomeSeen: false }, null],
    ['демо — последний экран', { mode: 'demo', access: {}, lastHash: '#/planfact/vor', welcomeSeen: false }, '#/planfact/vor'],
    ['демо без последнего — Осмотр (как раньше)', { mode: 'demo', access: {}, lastHash: null, welcomeSeen: false }, '#/quality/audit']
  ];
  for (const [label, input, want] of rows) assert.equal(homePathFor(input), want, label);
});

test('P2-0074: действия для правила — из копии quality.my_access на устройстве; «приветствие было» — по учётке', () => {
  const st = memStorage({ ['platform2_quality_access_c1:' + deviceUserKey('a@b.ru')]: JSON.stringify({ access: {
    '*': { quality: { grants: [{ actions: ['quality.inspections.view'] }] }, construction: { grants: [] } },
    p1: { quality: { grants: [{ actions: ['quality.inspections.create'] }] }, construction: { grants: [{ actions: ['construction.defects.create'] }] } } } }) });
  const acts = readWorkActions(st, 'c1', 'a@b.ru');
  assert.deepEqual(acts.quality.sort(), ['quality.inspections.create', 'quality.inspections.view']);
  assert.deepEqual(acts.construction, ['construction.defects.create']);
  assert.deepEqual(readWorkActions(st, 'c2', 'a@b.ru'), { quality: [], construction: [] }, 'чужая компания — своей копии нет');
  assert.deepEqual(readWorkActions(memStorage({ ['platform2_quality_access_c1:' + deviceUserKey('a@b.ru')]: '{битая' }), 'c1', 'a@b.ru'), { quality: [], construction: [] });
  assert.equal(welcomeSeen(st, 'a@b.ru'), false);
  markWelcomeSeen(st, 'A@B.ru ');
  assert.equal(welcomeSeen(st, 'a@b.ru'), true, 'та же учётка (почта без регистра)');
  assert.equal(welcomeSeen(st, 'c@d.ru'), false, 'другая учётка на том же устройстве — своё приветствие');
  assert.equal(welcomeSeen(st, null), false);
  assert.ok(![...st.m.keys()].some((k) => k.includes('@')), 'почта в ключах устройства не хранится');
});

// --- P2-0075: тестовые компании у администратора платформы — скрыты, пока не отмечено «Показать тестовые» ---
test('P2-0075: правило показа — скрыта только тестовая без роли у администратора платформы при снятой галочке (выбранная — видна)', () => {
  const list = [{ id: 'r', is_test: false, roles: [] }, { id: 'a', is_test: true, roles: [] }, { id: 'b', is_test: true, roles: ['Прораб / мастер'] }];
  const ids = (o: Parameters<typeof visibleCompanies>[1]): string => visibleCompanies(list, o).map((c) => c.id).join(',');
  assert.equal(ids({ isPlatformAdmin: true, showTest: false }), 'r,b', 'Альфа без роли скрыта, Бета с ролью видна');
  assert.equal(ids({ isPlatformAdmin: true, showTest: true }), 'r,a,b', 'галочка — видны все');
  assert.equal(ids({ isPlatformAdmin: false, showTest: false }), 'r,a,b', 'не администратор платформы — без изменений');
  assert.equal(ids({ isPlatformAdmin: true, showTest: false, keepId: 'a' }), 'r,a,b', 'выбранная сейчас не пропадает');
  const s = memStorage();
  assert.equal(readShowTest(s), false);
  writeShowTest(s, true); assert.equal(s.m.get(SHOW_TEST_KEY), '1'); assert.equal(readShowTest(s), true);
  writeShowTest(s, false); assert.equal(s.m.has(SHOW_TEST_KEY), false);
  assert.equal(readShowTest(null), false);
});

test('P2-0075: администратор платформы — по умолчанию нетестовая компания, сохранённая скрытая тестовая не выбирается; с галочкой — выбирается', async () => {
  const RBI = { id: 'r', name: 'РБИ', is_test: false, roles: ['Директор'], modules: ['planfact'], can_manage_company: true };
  const ALFA0 = { ...ALFA, roles: [] };
  const data = { is_platform_admin: true, companies: [ALFA0, RBI] };
  const st1 = await createPlatform(deps({ auth: fakeAuth({ signedIn: true }), data, storage: memStorage({ [COMPANY_KEY]: 'a' }) })).boot();
  assert.equal(st1.companyId, 'r', 'сохранённая Альфа скрыта — выбрана РБИ');
  assert.equal(st1.companies.length, 2, 'состояние входа хранит все компании (скрытие — только в списках)');
  const st2 = await createPlatform(deps({ auth: fakeAuth({ signedIn: true }), data, storage: memStorage({ [COMPANY_KEY]: 'a', [SHOW_TEST_KEY]: '1' }) })).boot();
  assert.equal(st2.companyId, 'a', 'с галочкой — сохранённый выбор');
  const st3 = await createPlatform(deps({ auth: fakeAuth({ signedIn: true }), data: { is_platform_admin: false, companies: [ALFA, RBI] }, storage: memStorage({ [COMPANY_KEY]: 'a' }) })).boot();
  assert.equal(st3.companyId, 'a', 'сотрудник тестовой компании — как раньше');
});
