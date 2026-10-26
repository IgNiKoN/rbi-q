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

/** Браузер: несколько кэшей по именам (в порядке создания, как caches.match), окна, сеть. */
function loadSw(initial: Record<string, Record<string, string>>, net: Record<string, string> = {}) {
  const stores = new Map<string, Map<string, string>>();
  for (const [name, files] of Object.entries(initial)) stores.set(name, new Map(Object.entries(files)));
  const key = (r: N) => new URL(typeof r === 'string' ? r : r.url, 'https://app.rbi-q.ru/').pathname;
  const res = (body: string) => ({ status: 200, ok: true, body, clone() { return res(body); }, text: async () => body });
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      match: async (r: N) => (m.has(key(r)) ? res(m.get(key(r))!) : undefined),
      put: async (r: N, v: N) => { m.set(key(r), v.body); },
      keys: async () => [...m.keys()].map((p) => ({ url: 'https://app.rbi-q.ru' + p })),
      delete: async (r: N) => m.delete(key(r))
    };
  };
  const handlers: Record<string, (e: N) => void> = {};
  const calls = { skipWaiting: 0, navigated: [] as string[], fetches: [] as { url: string; cache?: string }[] };
  const ctx: N = {
    self: {
      addEventListener: (t: string, fn: (e: N) => void) => { handlers[t] = fn; },
      skipWaiting: async () => { calls.skipWaiting++; },
      registration: { active: { state: 'activated' } },
      clients: {
        claim: async () => {},
        matchAll: async () => [{ url: 'https://app.rbi-q.ru/#/quality/audit', navigate: async (u: string) => { calls.navigated.push(u); } }]
      }
    },
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (n: string) => stores.delete(n),
      match: async (r: N) => { for (const m of stores.values()) if (m.has(key(r))) return res(m.get(key(r))!); return undefined; }
    },
    console: { log: () => {}, warn: () => {}, error: () => {} }, URL, Promise, setTimeout,
    fetch: async (r: N, init?: N) => { calls.fetches.push({ url: key(r), cache: init && init.cache }); return key(r) in net ? res(net[key(r)]) : Promise.reject(new Error('offline')); }
  };
  ctx.importScripts = () => { runInNewContext(CONFIG, ctx); };
  runInNewContext(SW + '\n;self.__cacheName = CACHE_NAME;', ctx);
  const fire = async (type: string, extra: N = {}): Promise<N> => {
    let wait: Promise<unknown> = Promise.resolve(); let resp: Promise<unknown> | null = null;
    handlers[type]({ ...extra, waitUntil: (p: Promise<unknown>) => { wait = Promise.all([wait, p]); }, respondWith: (p: Promise<unknown>) => { resp = p; } });
    await wait;
    return resp ? await resp : undefined;
  };
  return { ctx, stores, calls, fire, cacheName: ctx.self.__cacheName as string };
}

const OLD = 'rbi-quality-v18.59.59';

test('файл ядра отдаётся из своего кэша, а не из кэша старого приложения', async () => {
  const sw = loadSw({ [OLD]: { '/js/core/bootstrap.js': 'OLD' } });
  sw.stores.set(sw.cacheName, new Map([['/js/core/bootstrap.js', 'NEW']]));
  const r = await sw.fire('fetch', { request: { url: 'https://app.rbi-q.ru/js/core/bootstrap.js', method: 'GET' } });
  assert.equal(await r.text(), 'NEW');
});

test('нет файла в своём кэше — сеть, а не старый кэш', async () => {
  const sw = loadSw({ [OLD]: { '/index.html': 'OLD' } }, { '/index.html': 'NET' });
  const r = await sw.fire('fetch', { request: { url: 'https://app.rbi-q.ru/index.html', method: 'GET' } });
  assert.equal(await r.text(), 'NET');
});

test('установка поверх старого приложения: включается сразу; активация удаляет его кэш и перезагружает окна', async () => {
  const sw = loadSw({ [OLD]: { '/index.html': 'OLD' } }, { '/index.html': 'NEW' });
  await sw.fire('install');
  assert.equal(sw.calls.skipWaiting, 1, 'без кнопки «Обновить»: страница старого приложения ей не доверяется');
  await sw.fire('activate');
  assert.equal(sw.stores.has(OLD), false);
  assert.deepEqual(sw.calls.navigated, ['https://app.rbi-q.ru/#/quality/audit']);
});

test('кэш старого приложения пропал во время скачивания (страница уже открылась) — всё равно включается сразу', async () => {
  const sw = loadSw({ [OLD]: { '/index.html': 'OLD' } }, { '/index.html': 'NEW' });
  const realOpen = sw.ctx.caches.open;
  sw.ctx.caches.open = async (n: string) => { sw.stores.delete(OLD); return realOpen(n); };
  await sw.fire('install');
  assert.equal(sw.calls.skipWaiting, 1);
});

test('обычное обновление (старого кэша нет): ждёт кнопку, окна не перезагружает', async () => {
  const sw = loadSw({ 'platform2-v18.85.0': { '/index.html': 'PREV' } }, { '/index.html': 'NEW' });
  await sw.fire('install');
  assert.equal(sw.calls.skipWaiting, 0);
  await sw.fire('activate');
  assert.equal(sw.stores.has('platform2-v18.85.0'), false);
  assert.deepEqual(sw.calls.navigated, []);
});

test('файл приложения из сети — с перепроверкой (cache: no-cache), а не из кэша браузера: иначе старый файл прежнего приложения встречается с новым', async () => {
  const sw = loadSw({}, { '/js/modules/quality/features/history/history.state.js': 'NEW' });
  const r = await sw.fire('fetch', { request: { url: 'https://app.rbi-q.ru/js/modules/quality/features/history/history.state.js', method: 'GET', mode: 'cors' } });
  assert.equal(await r.text(), 'NEW');
  assert.deepEqual(sw.calls.fetches[sw.calls.fetches.length - 1], { url: '/js/modules/quality/features/history/history.state.js', cache: 'no-cache' });
});

test('страница (navigate) — как есть, без замены режима', async () => {
  const sw = loadSw({}, { '/index.html': 'NEW' });
  await sw.fire('fetch', { request: { url: 'https://app.rbi-q.ru/index.html', method: 'GET', mode: 'navigate' } });
  assert.equal(sw.calls.fetches[sw.calls.fetches.length - 1]?.cache, undefined);
});
