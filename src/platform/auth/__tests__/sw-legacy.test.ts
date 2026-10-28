/// <reference types="node" />
/** P2-0032: переход со старого приложения РБИ (тот же адрес) — кэш приложения берёт файлы только из своего кэша,
 *  кэш старого приложения (rbi-quality-*) удаляется, при нём новая версия включается сразу и перезагружает окна. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const CONFIG = readFileSync(new URL('../../../../js/services/config.service.js', import.meta.url), 'utf8');
const SW = readFileSync(new URL('../../../../sw.js', import.meta.url), 'utf8');

/** Браузер: несколько кэшей по именам (в порядке создания, как caches.match), окна, сеть. Сеть по умолчанию отдаёт файлы
 *  приложения с диска (как сервер после выкладки этой версии); net — подмена отдельных файлов. P2-0066: настоящие Response и crypto. */
function loadSw(initial: Record<string, Record<string, string>>, net: Record<string, string> = {}) {
  type Entry = { body: N; headers: Record<string, string> };   // текст или Buffer
  const stores = new Map<string, Map<string, Entry>>();
  for (const [name, files] of Object.entries(initial)) stores.set(name, new Map(Object.entries(files).map(([k, v]) => [k, { body: v, headers: {} }])));
  const key = (r: N) => decodeURIComponent(new URL(typeof r === 'string' ? r : r.url, 'https://app.rbi-q.ru/').pathname);
  const res = (e: Entry) => new Response(e.body, { status: 200, headers: e.headers });
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      match: async (r: N) => (m.has(key(r)) ? res(m.get(key(r))!) : undefined),
      put: async (r: N, v: N) => { m.set(key(r), { body: Buffer.from(await v.clone().arrayBuffer()), headers: Object.fromEntries(v.headers.entries()) }); },
      keys: async () => [...m.keys()].map((p) => ({ url: 'https://app.rbi-q.ru' + p })),
      delete: async (r: N) => m.delete(key(r))
    };
  };
  const disk = (path: string): Buffer | null => { try { return readFileSync(new URL('../../../../' + encodeURI(path.slice(1)), import.meta.url)); } catch { return null; } };
  const handlers: Record<string, (e: N) => void> = {};
  const calls = { skipWaiting: 0, navigated: [] as string[], fetches: [] as { url: string; cache?: string }[], updates: 0 };
  const ctx: N = {
    self: {
      addEventListener: (t: string, fn: (e: N) => void) => { handlers[t] = fn; },
      skipWaiting: async () => { calls.skipWaiting++; },
      registration: { scope: 'https://app.rbi-q.ru/', active: { state: 'activated' }, installing: null, waiting: null, update: async () => { calls.updates++; } },
      clients: {
        claim: async () => {},
        matchAll: async () => [{ id: 'w1', url: 'https://app.rbi-q.ru/#/quality/audit', navigate: async (u: string) => { calls.navigated.push(u); }, postMessage: () => {} }]
      }
    },
    caches: {
      open,
      keys: async () => [...stores.keys()],
      has: async (n: string) => stores.has(n),
      delete: async (n: string) => stores.delete(n),
      match: async (r: N) => { for (const m of stores.values()) if (m.has(key(r))) return res(m.get(key(r))!); return undefined; }
    },
    console: { log: () => {}, warn: () => {}, error: () => {} }, URL, Promise, setTimeout, Response, crypto: globalThis.crypto,
    fetch: async (r: N, init?: N) => {
      const p = key(r);
      calls.fetches.push({ url: p, cache: init && init.cache });
      const body: N = p in net ? net[p] : disk(p);
      return body === null ? Promise.reject(new Error('offline')) : new Response(body, { status: 200 });
    }
  };
  ctx.importScripts = () => { runInNewContext(CONFIG, ctx); };
  runInNewContext(SW + '\n;self.__cacheName = CACHE_NAME; self.__release = APP_RELEASE;', ctx);
  const fire = async (type: string, extra: N = {}): Promise<N> => {
    let wait: Promise<unknown> = Promise.resolve(); let resp: Promise<unknown> | null = null;
    handlers[type]({ ...extra, waitUntil: (p: Promise<unknown>) => { wait = Promise.all([wait, p]); }, respondWith: (p: Promise<unknown>) => { resp = p; } });
    await wait;
    return resp ? await resp : undefined;
  };
  return { ctx, stores, calls, fire, cacheName: ctx.self.__cacheName as string, release: ctx.self.__release as N };
}

const OLD = 'rbi-quality-v18.59.59';

test('файл ядра отдаётся из своего кэша, а не из кэша старого приложения', async () => {
  const sw = loadSw({ [OLD]: { '/js/core/bootstrap.js': 'OLD' } });
  sw.stores.set(sw.cacheName, new Map([['/js/core/bootstrap.js', { body: 'NEW', headers: {} }]]));
  const r = await sw.fire('fetch', { request: { url: 'https://app.rbi-q.ru/js/core/bootstrap.js', method: 'GET' } });
  assert.equal(await r.text(), 'NEW');
});

test('нет файла в своём кэше — сеть, а не старый кэш', async () => {
  const sw = loadSw({ [OLD]: { '/index.html': 'OLD' } }, { '/index.html': 'NET' });
  const r = await sw.fire('fetch', { request: { url: 'https://app.rbi-q.ru/index.html', method: 'GET' } });
  assert.equal(await r.text(), 'NET');
});

test('установка поверх старого приложения: включается сразу; активация удаляет его кэш и перезагружает окна', async () => {
  const sw = loadSw({ [OLD]: { '/index.html': 'OLD' } });
  await sw.fire('install');
  assert.equal(sw.calls.skipWaiting, 1, 'без кнопки «Обновить»: страница старого приложения ей не доверяется');
  await sw.fire('activate');
  assert.equal(sw.stores.has(OLD), false);
  assert.deepEqual(sw.calls.navigated, ['https://app.rbi-q.ru/#/quality/audit']);
});

test('кэш старого приложения пропал во время скачивания (страница уже открылась) — всё равно включается сразу', async () => {
  const sw = loadSw({ [OLD]: { '/index.html': 'OLD' } });
  const realOpen = sw.ctx.caches.open;
  sw.ctx.caches.open = async (n: string) => { sw.stores.delete(OLD); return realOpen(n); };
  await sw.fire('install');
  assert.equal(sw.calls.skipWaiting, 1);
});

test('обычное обновление (старого кэша нет): ждёт кнопку, окна не перезагружает', async () => {
  const sw = loadSw({ 'platform2-v18.85.0': { '/index.html': 'PREV' } });
  await sw.fire('install');
  assert.equal(sw.calls.skipWaiting, 0);
  await sw.fire('activate');
  assert.equal(sw.stores.has('platform2-v18.85.0'), false);
  assert.deepEqual(sw.calls.navigated, []);
});

test('P2-0066: установка скачивает файлы в обход кэша браузера и сверяет с отпечатком; файл другой версии — версия не ставится', async () => {
  const ok = loadSw({});
  await ok.fire('install');
  const n = Object.keys(ok.release.files).length;
  assert.equal(ok.stores.get(ok.cacheName)!.size, n - Object.values(ok.release.files).filter((v: N) => v[2]).length, 'оболочка целиком (модули — после допуска)');
  assert.ok(ok.calls.fetches.every((f) => f.cache === 'reload'));
  const bad = loadSw({}, { '/js/core/bootstrap.js': 'ДРУГАЯ ВЕРСИЯ' });
  await assert.rejects(bad.fire('install'));
  assert.equal(bad.calls.skipWaiting, 0);
});

test('P2-0066: неизменённый файл берётся из прежней версии без сети (по отпечатку)', async () => {
  const prev = loadSw({});
  await prev.fire('install');
  const old = prev.stores.get(prev.cacheName)!;
  const sw = loadSw({ 'platform2-v2000.01.01-00000000': Object.fromEntries([...old].map(([k, e]) => [k, e.body])) });
  for (const [k, e] of old) sw.stores.get('platform2-v2000.01.01-00000000')!.set(k, e);
  await sw.fire('install');
  assert.deepEqual(sw.calls.fetches, [], 'ничего не скачано');
  assert.equal(sw.stores.get(sw.cacheName)!.size, old.size);
});

test('P2-0066: вкладка = версия — открытая на прежней версии вкладка получает файлы своей версии; закрыта — версия удаляется', async () => {
  const OLDV = 'platform2-v2000.01.01-00000000';
  const sw = loadSw({ [OLDV]: { '/js/core/bootstrap.js': 'OLDV' } });
  sw.stores.set(sw.cacheName, new Map([['/js/core/bootstrap.js', { body: 'NEW', headers: {} }]]));
  sw.stores.set('p2-app-meta', new Map([['/__clients', { body: JSON.stringify({ w1: [OLDV, 0] }), headers: {} }]]));
  const r = await sw.fire('fetch', { clientId: 'w1', request: { url: 'https://app.rbi-q.ru/js/core/bootstrap.js', method: 'GET' } });
  assert.equal(await r.text(), 'OLDV');
  const r2 = await sw.fire('fetch', { clientId: 'w2', request: { url: 'https://app.rbi-q.ru/js/core/bootstrap.js', method: 'GET' } });
  assert.equal(await r2.text(), 'NEW', 'новая вкладка — текущая версия');
  await sw.fire('activate');
  assert.equal(sw.stores.has(OLDV), true, 'вкладка w1 открыта — прежняя версия на месте');
  sw.ctx.self.clients.matchAll = async () => [];
  await sw.fire('activate');
  assert.equal(sw.stores.has(OLDV), false, 'вкладка закрыта — прежняя версия удалена');
});

test('P2-0066: открытие вкладки запоминает её версию; файлы приложения без фоновой перепроверки у сервера', async () => {
  const sw = loadSw({});
  sw.stores.set(sw.cacheName, new Map([['/index.html', { body: 'NEW', headers: {} }]]));
  const r = await sw.fire('fetch', { resultingClientId: 'w9', request: { url: 'https://app.rbi-q.ru/', method: 'GET', mode: 'navigate' } });
  assert.equal(await r.text(), 'NEW');
  assert.deepEqual(sw.calls.fetches, [], 'из кэша — без запроса к серверу');
  assert.equal(JSON.parse(sw.stores.get('p2-app-meta')!.get('/__clients')!.body).w9[0], sw.cacheName);
});

test('страница (navigate) — как есть, без замены режима', async () => {
  const sw = loadSw({}, { '/index.html': 'NEW' });
  await sw.fire('fetch', { request: { url: 'https://app.rbi-q.ru/index.html', method: 'GET', mode: 'navigate' } });
  assert.equal(sw.calls.fetches[sw.calls.fetches.length - 1]?.cache, undefined);
});
