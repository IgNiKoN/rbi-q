/// <reference types="node" />
/** P2-0016: конфигурация одна (переключатель «разработка / выпуск» P2-0013 убран); облако старого Quality (PIN) выключено;
 *  локальная база устройства — своя у компании (storage-db.core.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { loadSw } from './sw-harness.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const CONFIG = readFileSync(new URL('../../../../js/services/config.service.js', import.meta.url), 'utf8');
const DB_SRC = readFileSync(new URL('../../../../js/services/storage/storage-db.core.js', import.meta.url), 'utf8');

test('конфигурация без переключателя сборки: облако старого Quality выключено, база PLATFORM2_DB, кэш platform2-', () => {
  assert.doesNotMatch(CONFIG, /APP_BUILD|release/);
  const ctx: N = { self: {} };
  runInNewContext(CONFIG, ctx);
  const c = ctx.self.APP_CONFIG;
  assert.equal(c.SUPABASE_URL, ''); assert.equal(c.SUPABASE_KEY, '');
  assert.equal(c.LOCAL_DB_NAME, 'PLATFORM2_DB'); assert.equal(c.SW_CACHE_PREFIX, 'platform2-');
  assert.ok(c.P2_SUPABASE_URL && c.P2_SUPABASE_ANON_KEY, 'вход Platform 2.0 настроен');
});

function dbName(company: string | null, throwing = false): string {
  const ls = { getItem: (k: string) => { if (throwing) throw new Error('private'); return k === 'platform2_quality_company' ? company : null; } };
  const ctx: N = { window: { APP_CONFIG: { LOCAL_DB_NAME: 'PLATFORM2_DB' } }, localStorage: ls };
  runInNewContext(DB_SRC.split('\n// Повышаем версию')[0] + '\n;window.__n = DB_NAME;', ctx);
  return ctx.window.__n;
}

test('локальная база: без компании — PLATFORM2_DB; у компании — PLATFORM2_DB_<id>; мусор и приватный режим — общая', () => {
  const id = '0f0e0d0c-0b0a-4908-8706-050403020100';
  assert.equal(dbName(null), 'PLATFORM2_DB');
  assert.equal(dbName(id), 'PLATFORM2_DB_' + id);
  assert.equal(dbName('../x'), 'PLATFORM2_DB');
  assert.equal(dbName(id, true), 'PLATFORM2_DB');
});

async function activate(sw: N, names: string[]): Promise<string[]> {
  const left = new Set(names);
  sw.ctx.caches.keys = async () => [...left];
  sw.ctx.caches.delete = async (n: string) => left.delete(n);
  let p: Promise<unknown> = Promise.resolve();
  sw.handlers.activate({ waitUntil: (x: Promise<unknown>) => { p = x; } });
  await p;
  return [...left];
}

test('кэш приложения: старые кэши platform2-* и кэш старого приложения rbi-quality-* (P2-0032) удаляются, прочие не трогаются', async () => {
  const sw = loadSw([]);
  sw.ctx.self.clients.matchAll = async () => [];
  assert.ok(sw.ctx.self.__cacheName.startsWith('platform2-v'));
  assert.deepEqual(await activate(sw, ['rbi-quality-v18.59.59', 'platform2-v1', 'other-app', sw.ctx.self.__cacheName]), ['other-app', sw.ctx.self.__cacheName]);
});
