/// <reference types="node" />
/** P2-0060 этап 1: права и меню сразу из памяти — при запуске копия прав на устройстве, сервер в фоне с ограничением ожидания;
 *  ответ отличается — обновить; модуль открытого экрана отозван — уйти; копии нет — ждать сервер. Стенд — tests/offline/menu.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlatform, DEVICE_ACCESS_PREFIX, moduleOfHash, revokedHere, startFromCopy } from '../platform.service.ts';
import type { PlatformState } from '../platform.service.ts';
import type { AuthApi, SessionState } from '../auth.service.ts';
import { applyQualityBridge, deviceUserKey, QUALITY_ACCESS_COPY_PREFIX, QUALITY_COMPANY_KEY, QUALITY_USER_KEY } from '../quality-bridge.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
type Answer = { data: unknown; error: unknown; status?: number };
const A = '0f0e0d0c-0b0a-4908-8706-0504030201aa';
const ALFA = { id: A, name: 'Альфа', is_test: false, roles: ['Прораб'], modules: ['quality', 'planfact'], can_manage_company: false };
const NOW = Date.parse('2026-10-29T08:11:00Z');
const sec = (ms: number): number => Math.floor(ms / 1000);
const EMAIL = 'tn@alfa.test';
const user = deviceUserKey(EMAIL);

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
}
function sessionAuth(ses: SessionState): AuthApi {
  return { async signIn() { return { ok: true }; }, async signOut() {}, async getEmail() { return ses.email; }, async getAccess() { return []; }, async getSessionState() { return ses; } };
}
const copyOf = (at: number, companies: unknown[] = [ALFA]) => JSON.stringify({ at: new Date(at).toISOString(), platform: { companies }, profile: { full_name: 'Иванов', user_id: 'u-1' } });
/** Сервер, который принял запрос и молчит, пока его не «отпустят». */
function hangingRpc() {
  const held: Array<(a: Answer) => void> = [];
  return { held, rpc: (_fn: string) => new Promise<Answer>((r) => { held.push(r); }), answer: (fn: (i: number) => Answer) => held.splice(0).forEach((r, i) => r(fn(i))) };
}
const platformAnswer = (companies: unknown[]) => (i: number): Answer => ({ data: i === 0 ? { companies } : { full_name: 'Иванов', user_id: 'u-1' }, error: null, status: 200 });

test('запуск с копией прав: меню по копии сразу (сервер ещё не ответил), сервер молчит дольше ожидания — «без связи» по той же копии', async () => {
  const store = memStore({ [DEVICE_ACCESS_PREFIX + user]: copyOf(NOW - 3600e3) });
  const srv = hangingRpc();
  const p = createPlatform({ auth: sessionAuth({ email: EMAIL, offline: false, issuedAt: sec(NOW) }), storage: store, pinActive: () => false, now: () => NOW,
    rpc: srv.rpc, storedSession: () => ({ email: EMAIL, issuedAt: sec(NOW) }), serverWaitMs: 20 });
  const seen: PlatformState[] = [];
  p.subscribe((s) => seen.push(s));
  const done = p.boot();
  assert.equal(seen.length, 1, 'первое состояние — сразу, до ответа сервера');
  assert.equal(seen[0].mode, 'email');
  assert.equal(seen[0].checking, true);
  assert.equal(!!seen[0].offline, false, 'не «без связи»: сервер ещё проверяется');
  assert.equal(p.access().planfact, true, 'меню План/Факта — по копии');
  const s = await done;
  assert.equal(s.offline, true, 'сервер не ответил за ограничение — работа по копии, повтор раз в минуту');
  assert.equal(s.companyId, A);
  assert.equal(srv.held.length, 2, 'спрашивали pf_my_platform и pf_my_profile');
});

test('сервер ответил: совпало — то же меню; отличается (модуль выключили) — новое состояние без перезагрузки', async () => {
  const cases: Array<[string, typeof ALFA[], boolean]> = [['совпало', [ALFA], false], ['убрали План/Факт', [{ ...ALFA, modules: ['quality'] }], true]];
  for (const [label, companies, changed] of cases) {
    const store = memStore({ [DEVICE_ACCESS_PREFIX + user]: copyOf(NOW - 3600e3) });
    const srv = hangingRpc();
    const p = createPlatform({ auth: sessionAuth({ email: EMAIL, offline: false, issuedAt: sec(NOW) }), storage: store, pinActive: () => false, now: () => NOW,
      rpc: srv.rpc, storedSession: () => ({ email: EMAIL, issuedAt: sec(NOW) }), serverWaitMs: 5000 });
    const seen: PlatformState[] = [];
    p.subscribe((s) => seen.push(s));
    const done = p.boot();
    await new Promise((r) => setTimeout(r, 5));
    srv.answer(platformAnswer(companies));
    const s = await done;
    assert.equal(seen.length, 2, label + ': копия → ответ сервера');
    assert.equal(s.checking, undefined, label + ': сервер подтвердил');
    assert.equal(s.offline, undefined);
    assert.equal(JSON.stringify(seen[0].companies) !== JSON.stringify(seen[1].companies), changed, label + ': разница с копией');
    assert.equal(p.access().planfact === true, !changed, label + ': права меню — по ответу сервера');
    assert.equal(JSON.parse(store.getItem(DEVICE_ACCESS_PREFIX + user)!).platform.companies[0].modules.length, companies[0].modules.length, label + ': копия обновлена');
  }
});

test('копии нет (первый вход на устройстве): до ответа сервера — ничего (экран загрузки), ограничение ожидания не действует', async () => {
  const srv = hangingRpc();
  const p = createPlatform({ auth: sessionAuth({ email: EMAIL, offline: false, issuedAt: sec(NOW) }), storage: memStore(), pinActive: () => false, now: () => NOW,
    rpc: srv.rpc, storedSession: () => ({ email: EMAIL, issuedAt: sec(NOW) }), serverWaitMs: 5 });
  const seen: PlatformState[] = [];
  p.subscribe((s) => seen.push(s));
  const done = p.boot();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(seen.length, 0, 'ни меню из ничего, ни «без связи» по ограничению');
  srv.answer(platformAnswer([ALFA]));
  const s = await done;
  assert.equal(s.mode, 'email');
  assert.equal(s.offline, undefined);
  assert.equal(p.access().planfact, true);
});

test('копия старше 14 дней, чужая копия, сервер отклонил вход — меню по копии не строится / снимается', async () => {
  assert.equal(startFromCopy(null, sec(NOW), NOW), false);
  assert.equal(startFromCopy({ at: new Date(NOW - 15 * 864e5).toISOString(), platform: {}, profile: {} }, sec(NOW - 16 * 864e5), NOW), false, 'старше 14 дней — нет');
  assert.equal(startFromCopy({ at: new Date(NOW - 13 * 864e5).toISOString(), platform: {}, profile: {} }, null, NOW), true);
  // другой пользователь на том же устройстве: копия первого лежит, но у второго своей нет — первое состояние не по чужой копии
  const store = memStore({ [DEVICE_ACCESS_PREFIX + user]: copyOf(NOW - 3600e3) });
  const srv = hangingRpc();
  const other = createPlatform({ auth: sessionAuth({ email: 'other@alfa.test', offline: false, issuedAt: sec(NOW) }), storage: store, pinActive: () => false, now: () => NOW,
    rpc: srv.rpc, storedSession: () => ({ email: 'other@alfa.test', issuedAt: sec(NOW) }), serverWaitMs: 5 });
  const seen: PlatformState[] = [];
  other.subscribe((s) => seen.push(s));
  const done = other.boot();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(seen.length, 0, 'чужая копия не применяется ни на миг');
  srv.answer(platformAnswer([]));
  assert.deepEqual((await done).companies, []);
  // сервер отклонил вход (сохранённый вход стёрт при обновлении): после меню по копии — экран «Вход»
  const p = createPlatform({ auth: sessionAuth({ email: null, offline: false, issuedAt: null }), storage: memStore({ [DEVICE_ACCESS_PREFIX + user]: copyOf(NOW - 3600e3) }),
    pinActive: () => false, now: () => NOW, rpc: hangingRpc().rpc, storedSession: () => ({ email: EMAIL, issuedAt: sec(NOW) }) });
  const all: PlatformState[] = [];
  p.subscribe((s) => all.push(s));
  const last = await p.boot();
  assert.deepEqual(all.map((s) => s.mode), ['email', 'none']);
  assert.equal(last.mode, 'none');
});

test('раздел отозван: модуль экрана по адресу; уход — только если по прежним правам был, а по новым нет', () => {
  assert.equal(moduleOfHash('#/planfact/vor'), 'planfact');
  assert.equal(moduleOfHash('#/planfact'), 'planfact');
  assert.equal(moduleOfHash('#/quality/audit'), 'quality');
  assert.equal(moduleOfHash('#/quality/settings/x'), null, 'Настройки Качества — не модуль');
  assert.equal(moduleOfHash('#/construction-v2/cabinet'), 'construction');
  assert.equal(moduleOfHash('#/settings/my/device'), null);
  assert.equal(revokedHere({ planfact: true }, { planfact: false }, '#/planfact/vor'), true);
  assert.equal(revokedHere({ planfact: true }, { planfact: true }, '#/planfact/vor'), false);
  assert.equal(revokedHere(null, {}, '#/planfact/vor'), false, 'первое состояние — не «отозван»');
  assert.equal(revokedHere({ planfact: true }, {}, '#/settings'), false, 'не на экране модуля — не уводим');
});

test('мост при запуске по копии: роль сразу из копии (зависший сервер не держит), поздний ответ сервера меняет роль на месте', async () => {
  const store = memStore({ [QUALITY_COMPANY_KEY]: A, [QUALITY_USER_KEY]: user,
    [QUALITY_ACCESS_COPY_PREFIX + A + ':' + user]: JSON.stringify({ access: { '*': { actions: ['quality.edit'], projects: null }, 'p-1': { actions: ['quality.edit'], projects: null } },
      projects: [{ id: 'p-1', name: 'ЖК' }] }) });
  const held: Array<(a: Answer) => void> = [];
  const win: N = { RBI: {} };
  const d = { win, store, reload: () => { throw new Error('без перезагрузки'); }, cfg: { url: 'http://x', anonKey: 'k' },
    platformClient: { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({}) } } as N,
    createClient: (() => ({ rpc: () => new Promise<Answer>((r) => { held.push(r); }), storage: { from: () => ({}) } })) as N,
    listProjects: () => new Promise<never>(() => { /* сервер молчит */ }) };
  const st: PlatformState = { mode: 'email', email: EMAIL, isPlatformAdmin: false, companies: [ALFA], companyId: A, checking: true };
  const sync = await applyQualityBridge(st, d as N);
  assert.ok(sync, 'мост подключён без ответа сервера');
  assert.equal(sync!.projectId, 'p-1', 'объект — из копии');
  assert.equal(sync!.role, 'engineer', 'роль — из копии');
  assert.equal(win.RBI.qualitySync, sync, 'Качество в меню (мост есть)');
  held.splice(0).forEach((r) => r({ data: { actions: ['quality.view'], projects: null }, error: null }));
  await new Promise((r) => setTimeout(r, 5));
  assert.notEqual(sync!.role, 'engineer', 'сервер ответил другими правами — роль обновлена без перезапуска');
});

test('мост по копии: объекты не спрашиваются до подтверждения сервером (пустой ответ при сбое не затирает копию); подтвердил — список ядра', async () => {
  const key = QUALITY_ACCESS_COPY_PREFIX + A + ':' + user;
  const store = memStore({ [QUALITY_COMPANY_KEY]: A, [QUALITY_USER_KEY]: user,
    [key]: JSON.stringify({ access: { '*': { actions: ['quality.edit'], projects: null }, 'p-1': { actions: ['quality.edit'], projects: null } }, projects: [{ id: 'p-1', name: 'ЖК' }] }) });
  let listed = 0;
  let serverList: { id: string; name: string }[] = [];   // без связи сервис ядра отдаёт пустой список, а не ошибку
  const win: N = { RBI: {} };
  const d = { win, store, reload: () => { throw new Error('без перезагрузки'); }, cfg: { url: 'http://x', anonKey: 'k' },
    platformClient: { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({}) } } as N,
    createClient: (() => ({ rpc: async () => ({ data: null, error: { message: 'Failed to fetch' } }), storage: { from: () => ({}) } })) as N,
    listProjects: async () => { listed++; return serverList; } };
  const st: PlatformState = { mode: 'email', email: EMAIL, isPlatformAdmin: false, companies: [ALFA], companyId: A, checking: true };
  const sync = await applyQualityBridge(st, d as N);
  assert.equal(listed, 0, 'до подтверждения список ядра не спрашивается');
  assert.equal(sync!.projectId, 'p-1');
  assert.equal(JSON.parse(store.getItem('rbi_sync_config')!).enabled, true, 'синхронизация включена — неотправленное уйдёт');
  await applyQualityBridge({ ...st, checking: undefined, offline: true }, d as N);
  assert.equal(listed, 0, 'сервер так и не ответил («без связи») — тоже не спрашиваем');
  assert.deepEqual(JSON.parse(store.getItem(key)!).projects, [{ id: 'p-1', name: 'ЖК' }], 'копия объектов цела');
  serverList = [{ id: 'p-1', name: 'ЖК' }, { id: 'p-2', name: 'ЖК-2' }];
  await applyQualityBridge({ ...st, checking: undefined }, d as N);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(listed, 1, 'сервер подтвердил — список ядра один раз');
  assert.deepEqual(sync!.projects.map((p) => p.id), ['p-1', 'p-2'], 'объекты — по ответу сервера');
});

test('сервер молчит: повторная проверка (раз в минуту, «связь вернулась») не шлёт новых запросов, пока висит прежний', async () => {
  const store = memStore({ [DEVICE_ACCESS_PREFIX + user]: copyOf(NOW - 3600e3) });
  const srv = hangingRpc();
  const p = createPlatform({ auth: sessionAuth({ email: EMAIL, offline: false, issuedAt: sec(NOW) }), storage: store, pinActive: () => false, now: () => NOW,
    rpc: srv.rpc, storedSession: () => ({ email: EMAIL, issuedAt: sec(NOW) }), serverWaitMs: 5 });
  assert.equal((await p.boot()).offline, true);
  assert.equal((await p.refresh()).offline, true);
  assert.equal((await p.refresh()).offline, true);
  assert.equal(srv.held.length, 2, 'висят только первые pf_my_platform и pf_my_profile — соединения не копятся');
  srv.answer(platformAnswer([ALFA]));
  await new Promise((r) => setTimeout(r, 5));
  const next = p.refresh();
  await new Promise((r) => setTimeout(r, 1));
  assert.equal(srv.held.length, 2, 'прежний ответил — следующая проверка спрашивает заново');
  srv.answer(platformAnswer([ALFA]));
  assert.equal((await next).offline, undefined, 'ответ пришёл вовремя — меню по ответу сервера');
});

test('разделам перечитать данные: при запуске, при смене прав, когда сервер снова ответил; не когда связь только пропала', async () => {
  const { shouldNotifyAccess } = await import('../platform.service.ts');
  const base: PlatformState = { mode: 'email', email: EMAIL, isPlatformAdmin: false, companies: [ALFA], companyId: A };
  assert.equal(shouldNotifyAccess(null, { ...base, checking: true }), true, 'первое состояние (копия)');
  assert.equal(shouldNotifyAccess({ ...base, checking: true }, base), false, 'сервер подтвердил то же — ничего не меняется');
  assert.equal(shouldNotifyAccess({ ...base, checking: true }, { ...base, offline: true }), false, 'сервер молчит — без перезапросов');
  assert.equal(shouldNotifyAccess({ ...base, offline: true }, base), true, 'сервер снова ответил — перечитать');
  assert.equal(shouldNotifyAccess(base, { ...base, companies: [{ ...ALFA, modules: ['quality'] }] }), true, 'права изменились');
  assert.equal(shouldNotifyAccess(base, { ...base, mode: 'none', email: null, companies: [], companyId: null }), true, 'выход');
});

test('доработка З1: запрос прав А завис, А вышел, вошёл Б — Б спрашивает сервер заново; поздний ответ про А не попадает ни в копию Б, ни в меню', async () => {
  const B = 'b@beta.test';
  const ses: SessionState = { email: EMAIL, offline: false, issuedAt: sec(NOW) };
  const store = memStore();
  const srv = hangingRpc();
  const p = createPlatform({ auth: { ...sessionAuth(ses), async getSessionState() { return ses; } }, storage: store, pinActive: () => false, now: () => NOW, rpc: srv.rpc });
  void p.boot();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(srv.held.length, 2, 'запрос А висит');
  const heldA = srv.held.splice(0);
  await p.signOut();
  ses.email = B;
  const signing = p.signIn(B, 'x');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(srv.held.length, 2, 'для Б — новый запрос, а не висящий запрос А');
  heldA.forEach((r, i) => r(platformAnswer([ALFA])(i)));   // поздний ответ про А
  srv.answer(platformAnswer([{ ...ALFA, id: 'beta', name: 'Бета', modules: ['quality'] }]));
  await signing;
  assert.equal(p.getState().email, B);
  assert.equal(p.getState().companyId, 'beta');
  assert.equal(store.getItem(DEVICE_ACCESS_PREFIX + user), null, 'копии прав А нет');
  assert.match(String(store.getItem(DEVICE_ACCESS_PREFIX + deviceUserKey(B))), /Бета/);
});

test('доработка З2: запрос прав «умер» (нет ответа дольше предела) — отменяется, следующий повтор шлёт новый и применяет ответ', async () => {
  const store = memStore({ [DEVICE_ACCESS_PREFIX + user]: copyOf(NOW - 3600e3) });
  const srv = hangingRpc();
  const signals: Array<AbortSignal | undefined> = [];
  const p = createPlatform({ auth: sessionAuth({ email: EMAIL, offline: false, issuedAt: sec(NOW) }), storage: store, pinActive: () => false, now: () => NOW,
    rpc: (fn: string, _a?: Record<string, unknown>, signal?: AbortSignal) => { signals.push(signal); return srv.rpc(fn); },
    storedSession: () => ({ email: EMAIL, issuedAt: sec(NOW) }), serverWaitMs: 10, askLimitMs: 30 });
  const s1 = await p.boot();
  assert.equal(s1.offline, true, 'сервер молчит — по копии');
  srv.held.splice(0);   // этот запрос так и не ответит
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(signals.length === 2 && signals.every((x) => x && x.aborted), 'висящий запрос отменён (соединение свободно)');
  const again = p.refresh();
  await new Promise((r) => setTimeout(r, 2));
  assert.equal(srv.held.length, 2, 'повтор — новым запросом, а не ожиданием мёртвого');
  srv.answer(platformAnswer([{ ...ALFA, modules: ['quality'] }]));
  const s2 = await again;
  assert.equal(!!s2.offline, false, 'сервер ответил — «без связи» снято');
  assert.equal(!!p.access().planfact, false, 'и меню — по ответу сервера');
});

test('доработка З3: запуск по копии, «Выйти» до ответа сервера — поздний ответ не возвращает ни меню, ни копию вышедшего', async () => {
  const store = memStore({ [DEVICE_ACCESS_PREFIX + user]: copyOf(NOW - 3600e3) });
  const srv = hangingRpc();
  const ses: SessionState = { email: EMAIL, offline: false, issuedAt: sec(NOW) };
  const p = createPlatform({ auth: { ...sessionAuth(ses), async signOut() { ses.email = null; } }, storage: store, pinActive: () => false, now: () => NOW,
    rpc: srv.rpc, storedSession: () => ({ email: EMAIL, issuedAt: sec(NOW) }) });
  const booting = p.boot();
  assert.equal(p.getState().checking, true);
  await new Promise((r) => setTimeout(r, 2));
  const held = srv.held.splice(0);
  await p.signOut();
  assert.equal(p.getState().email, null);
  held.forEach((r, i) => r(platformAnswer([ALFA])(i)));
  await booting;
  await new Promise((r) => setTimeout(r, 2));
  assert.equal(p.getState().email, null, 'после выхода — не вошёл');
  assert.equal(p.getState().companyId, null);
  assert.equal(store.getItem(DEVICE_ACCESS_PREFIX + user), null, 'копия прав вышедшего не записана заново');
});
