/// <reference types="node" />
/** P2-0032 этап 1: разовый переход устройства со старого приложения РБИ — чистка базы один раз, повтор после сбоя,
 *  новая база не затрагивается, старые ключи синхронизации не мешают полной загрузке. Кэши страница не трогает:
 *  кэш старого приложения удаляет кэш приложения (sw.js, тест sw-legacy.test.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupLegacyDevice, deleteIndexedDb, LEGACY_CLEANUP_KEY, LEGACY_DB_NAME } from '../legacy-device.ts';
import { QUALITY_COMPANY_KEY } from '../quality-bridge.ts';

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
}

/** Устройство: базы браузера в памяти. */
function device(dbs: string[], opts: { blockDb?: boolean } = {}) {
  const db = new Set(dbs);
  let dbCalls = 0;
  return {
    db, dbCalls: () => dbCalls,
    deleteDatabase: async (n: string) => { dbCalls++; if (opts.blockDb) throw new Error('blocked'); db.delete(n); }
  };
}

const NEW_DB = 'PLATFORM2_DB_0f0e0d0c-0b0a-4908-8706-0504030201aa_0123456789abcdef';

test('старое устройство: старая база удалена, новая не тронута, отметка поставлена', async () => {
  const store = memStore({ rbi_sync_last_pull_at: '2026-10-20T10:00:00Z', rbi_cloud_dirty: '1', rbi_theme_preference: 'dark' });
  const d = device([LEGACY_DB_NAME, NEW_DB]);
  assert.equal(await cleanupLegacyDevice({ store, ...d, now: () => 'T' }), 'done');
  assert.deepEqual([...d.db], [NEW_DB]);
  assert.equal(store.getItem(LEGACY_CLEANUP_KEY), 'T');
  assert.equal(store.getItem('rbi_sync_last_pull_at'), null, 'метка загрузки старого приложения не мешает полной загрузке новой базы');
  assert.equal(store.getItem('rbi_cloud_dirty'), null, 'старая очередь не отправляется');
  assert.equal(store.getItem('rbi_theme_preference'), 'dark', 'тема — не состояние синхронизации, остаётся');
});

test('три открытия подряд: чистка только в первом', async () => {
  const store = memStore();
  const d = device([LEGACY_DB_NAME]);
  assert.equal(await cleanupLegacyDevice({ store, ...d }), 'done');
  d.db.add(LEGACY_DB_NAME);   // даже если база снова появилась бы — второе и третье открытие её не трогают
  assert.equal(await cleanupLegacyDevice({ store, ...d }), 'skipped');
  assert.equal(await cleanupLegacyDevice({ store, ...d }), 'skipped');
  assert.equal(d.dbCalls(), 1);
});

test('сбой (база занята другой вкладкой) — отметки нет, при следующем открытии повтор и успех', async () => {
  const store = memStore();
  const bad = device([LEGACY_DB_NAME], { blockDb: true });
  assert.equal(await cleanupLegacyDevice({ store, ...bad }), 'retry');
  assert.equal(store.getItem(LEGACY_CLEANUP_KEY), null);
  const ok = device([LEGACY_DB_NAME]);
  assert.equal(await cleanupLegacyDevice({ store, ...ok }), 'done');
  assert.equal(ok.db.size, 0);
});

test('устройство уже входило почтой: состояние синхронизации новой базы не трогается', async () => {
  const store = memStore({ [QUALITY_COMPANY_KEY]: '0f0e0d0c-0b0a-4908-8706-0504030201aa', rbi_sync_last_pull_at: '2026-10-25T09:00:00Z' });
  const d = device([NEW_DB]);
  assert.equal(await cleanupLegacyDevice({ store, ...d }), 'done');
  assert.equal(store.getItem('rbi_sync_last_pull_at'), '2026-10-25T09:00:00Z');
  assert.deepEqual([...d.db], [NEW_DB]);
});

test('нет хранилища или браузер без баз — без падений', async () => {
  assert.equal(await cleanupLegacyDevice({ store: null, deleteDatabase: null }), 'retry');
  const store = memStore();
  assert.equal(await cleanupLegacyDevice({ store, deleteDatabase: null }), 'done');
});

test('deleteIndexedDb: успех, ошибка, «занята» дольше срока', async () => {
  const fake = (mode: 'ok' | 'err' | 'hang') => ({
    deleteDatabase: () => {
      const req: Record<string, unknown> = { error: null };
      setTimeout(() => { if (mode === 'ok') (req.onsuccess as () => void)(); if (mode === 'err') (req.onerror as () => void)(); }, 1);
      return req;
    }
  }) as unknown as IDBFactory;
  await deleteIndexedDb(fake('ok'), 'X');
  await assert.rejects(deleteIndexedDb(fake('err'), 'X'));
  await assert.rejects(deleteIndexedDb(fake('hang'), 'X', 20), /blocked/);
});
