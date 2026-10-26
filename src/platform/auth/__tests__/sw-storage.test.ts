/// <reference types="node" />
/** P2-0016 этап 5: кэш приложения (sw.js) — закрытые файлы компаний берёт с входом вошедшего; остальное не трогает. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSw } from './sw-harness.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const SRV = 'https://api.rbi-q.ru';

function setup() {
  const sw = loadSw([]);
  const fetched: N[] = [];
  sw.ctx.fetch = async (url: string, init: N) => { fetched.push({ url, init }); return { ok: true, status: 200, from: 'net' }; };
  sw.ctx.self.clients.matchAll = async () => [];
  sw.ctx.setTimeout = setTimeout;
  const fire = (url: string): Promise<N> | null => {
    let p: Promise<N> | null = null;
    sw.handlers.fetch({ request: { url, method: 'GET' }, respondWith: (x: Promise<N>) => { p = x; }, waitUntil: () => {} });
    return p;
  };
  return { sw, fetched, fire };
}

test('файл компании: …/public/quality-… → …/authenticated/… с токеном вошедшего', async () => {
  const { sw, fetched, fire } = setup();
  await sw.message({ type: 'P2_STORAGE_TOKEN', token: 'TOK' });
  const res = await fire(`${SRV}/storage/v1/object/public/quality-inspection-photos/c1/P/a.jpg`);
  assert.equal(res.from, 'net');
  assert.equal(fetched[0].url, `${SRV}/storage/v1/object/authenticated/quality-inspection-photos/c1/P/a.jpg`);
  assert.equal(fetched[0].init.headers.Authorization, 'Bearer TOK');
});

test('файлы РБИ (публичные бакеты) и чужие серверы — без вмешательства, токен не уходит', () => {
  const { sw, fetched, fire } = setup();
  void sw.message({ type: 'P2_STORAGE_TOKEN', token: 'TOK' });
  assert.equal(fire(`${SRV}/storage/v1/object/public/inspection-photos/P/a.jpg`), null);
  assert.equal(fire(`https://evil.example/storage/v1/object/public/quality-inspection-photos/c1/a.jpg`), null);
  assert.equal(fetched.filter((f) => f.init && f.init.headers && f.init.headers.Authorization).length, 0);
});

test('выход: токен сброшен — запрос без входа (сервер откажет); нет сети — из офлайн-кэша', async () => {
  const { sw, fetched, fire } = setup();
  await sw.message({ type: 'P2_STORAGE_TOKEN', token: null });
  sw.ctx.caches.match = async () => ({ ok: true, from: 'cache' });
  sw.ctx.fetch = async (url: string, init: N) => { fetched.push({ url, init }); throw new Error('offline'); };
  const res = await fire(`${SRV}/storage/v1/object/public/quality-reports/c1/r.pdf`);
  assert.equal(res.from, 'cache');
  assert.equal(JSON.stringify(fetched[0].init.headers), '{}');
});

// --- P2-0018 (ТД №121) ---
function withCaches(sw: N, entries: string[]) {
  const store = new Map<string, Set<string>>([['app', new Set(entries)], ['p2-storage-slot', new Set()]]);
  const slotVal: { v: string | null } = { v: null };
  sw.ctx.caches.keys = async () => [...store.keys()];
  sw.ctx.caches.open = async (n: string) => ({
    keys: async () => [...(store.get(n) || [])].map((url) => ({ url })),
    delete: async (r: N) => store.get(n)!.delete(r.url),
    match: async () => (n === 'p2-storage-slot' && slotVal.v !== null ? { text: async () => slotVal.v } : undefined),
    put: async (_k: string, res: N) => { if (n === 'p2-storage-slot') slotVal.v = await res.text(); }
  });
  sw.ctx.Response = class { b: string; constructor(b: string) { this.b = b; } async text() { return this.b; } };
  return store;
}
const F1 = `${SRV}/storage/v1/object/public/quality-inspection-photos/c1/P/a.jpg`;
const RBI = `${SRV}/storage/v1/object/public/inspection-photos/P/a.jpg`;
const APP = 'http://localhost/index.html';

test('закрытый файл: 401/403 от сервера — ответ сервера, не из кэша; без сети — из кэша', async () => {
  const { sw, fire } = setup();
  await sw.message({ type: 'P2_STORAGE_TOKEN', token: 'TOK' });
  sw.ctx.caches.match = async () => ({ ok: true, from: 'cache' });
  for (const status of [401, 403]) {
    sw.ctx.fetch = async () => ({ ok: false, status, from: 'net' });
    const res = await fire(F1);
    assert.equal(res.from, 'net', `статус ${status} — не из кэша`);
    assert.equal(res.status, status);
  }
  sw.ctx.fetch = async () => { throw new Error('offline'); };
  assert.equal((await fire(F1)).from, 'cache');
});

test('выход и смена «компания + пользователь» — закрытые файлы удаляются из кэша; РБИ и приложение не трогаются', async () => {
  const { sw } = setup();
  const store = withCaches(sw, [F1, RBI, APP]);
  await sw.message({ type: 'P2_STORAGE_SLOT', slot: 'c1:u1' });   // первый раз — кэш чистится (прошлый вход неизвестен)
  assert.deepEqual([...store.get('app')!], [RBI, APP]);
  store.get('app')!.add(F1);
  await sw.message({ type: 'P2_STORAGE_SLOT', slot: 'c1:u1' });
  assert.ok(store.get('app')!.has(F1), 'тот же вход — файлы остаются (офлайн)');
  await sw.message({ type: 'P2_STORAGE_SLOT', slot: 'c1:u2' });
  assert.ok(!store.get('app')!.has(F1), 'другой пользователь — удалены');
  store.get('app')!.add(F1);
  await sw.message({ type: 'P2_STORAGE_TOKEN', token: 'TOK' });
  await sw.message({ type: 'P2_STORAGE_TOKEN', token: null });
  assert.deepEqual([...store.get('app')!], [RBI, APP], 'выход — удалены');
});

test('выход после перезапуска кэша (токен в памяти неизвестен): закрытые файлы всё равно удаляются по сохранённому входу', async () => {
  const first = setup();
  const store = withCaches(first.sw, [F1, APP]);
  await first.sw.message({ type: 'P2_STORAGE_SLOT', slot: 'c1:u1' });
  store.get('app')!.add(F1);
  // «перезапуск»: новый экземпляр кэша с теми же хранилищами, токен ему ещё не сообщали
  const again = setup();
  again.sw.ctx.caches = first.sw.ctx.caches;
  again.sw.ctx.Response = first.sw.ctx.Response;
  await again.sw.message({ type: 'P2_STORAGE_TOKEN', token: null });
  assert.deepEqual([...store.get('app')!], [APP]);
});
