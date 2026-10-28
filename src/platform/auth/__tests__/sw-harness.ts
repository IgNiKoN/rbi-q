/// <reference types="node" />
/** Подставная среда кэша приложения (sw.js) для тестов P2-0013: caches, сообщения, importScripts конфигурации. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const CONFIG = readFileSync(new URL('../../../../js/services/config.service.js', import.meta.url), 'utf8');

export function loadSw(cached: string[], scope = 'https://ignikon.github.io/platform-2-core') {
  const store = new Map(cached.map((u) => [u, true]));
  const handlers: Record<string, (e: N) => void> = {};
  const cache = { keys: async () => [...store.keys()].map((url) => ({ url })), delete: async (r: N) => store.delete(r.url), put: async () => {}, addAll: async () => {},
    match: async () => undefined };
  // P2-0066: одна версия в кэше приложения (её кэш — этот), область — адрес приложения
  const ctx: N = {
    self: { addEventListener: (t: string, fn: (e: N) => void) => { handlers[t] = fn; }, skipWaiting: () => {}, clients: { claim: async () => {}, matchAll: async () => [] },
      registration: { scope: scope + '/', active: null, installing: null, waiting: null, update: async () => {} } },
    caches: { open: async () => cache, keys: async () => [ctx.self.__cacheName], delete: async () => true, match: async () => undefined, has: async () => true },
    console: { log: () => {}, warn: () => {}, error: () => {} }, URL, Promise, Response, crypto: globalThis.crypto, fetch: async () => ({})
  };
  ctx.importScripts = (path: string) => {
    assert.equal(path, './js/services/config.service.js');
    runInNewContext(CONFIG, ctx);
  };
  runInNewContext(readFileSync(new URL('../../../../sw.js', import.meta.url), 'utf8') + '\n;self.__cacheName = CACHE_NAME;', ctx);
  const message = async (data: unknown): Promise<void> => { let p: Promise<unknown> = Promise.resolve(); handlers.message({ data, waitUntil: (x: Promise<unknown>) => { p = x; } }); await p; };
  return { ctx, store, message, handlers };
}

