/// <reference types="node" />
/** Подставная среда кэша приложения (sw.js) для тестов P2-0013: caches, сообщения, importScripts конфигурации. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const CONFIG = readFileSync(new URL('../../../../js/services/config.service.js', import.meta.url), 'utf8');

export function loadSw(cached: string[]) {
  const store = new Map(cached.map((u) => [u, true]));
  const handlers: Record<string, (e: N) => void> = {};
  const cache = { keys: async () => [...store.keys()].map((url) => ({ url })), delete: async (r: N) => store.delete(r.url), put: async () => {}, addAll: async () => {} };
  const ctx: N = {
    self: { addEventListener: (t: string, fn: (e: N) => void) => { handlers[t] = fn; }, skipWaiting: () => {}, clients: { claim: async () => {} } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => undefined },
    console: { log: () => {}, warn: () => {}, error: () => {} }, URL, Promise, fetch: async () => ({})
  };
  ctx.importScripts = (path: string) => {
    assert.equal(path, './js/services/config.service.js');
    runInNewContext(CONFIG, ctx);
  };
  runInNewContext(readFileSync(new URL('../../../../sw.js', import.meta.url), 'utf8') + '\n;self.__cacheName = CACHE_NAME;', ctx);
  const message = async (data: unknown): Promise<void> => { let p: Promise<unknown> = Promise.resolve(); handlers.message({ data, waitUntil: (x: Promise<unknown>) => { p = x; } }); await p; };
  return { ctx, store, message, handlers };
}

