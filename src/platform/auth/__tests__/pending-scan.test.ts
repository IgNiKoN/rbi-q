// P2-0073: «не отправлено» — новый подсчёт (один проход порциями, scanPending) даёт то же, что прежний (курсором по одной записи:
// countUnsent и listPending до P2-0073) на одних и тех же данных: неотправленные, отклонённые сервером, отправленные, демо, системные,
// перенесённые, хранилища не из описи. База — маленькая подделка IndexedDB (getAll с границей и числом, курсор).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countUnsent, isRejected, listPending, pickOrphans, RECORD_STORES, SCAN_BATCH, scanPending } from '../offline-rescue.ts';
import type { IsUnsent, Rec } from '../offline-rescue.ts';

const isUnsentLocal: IsUnsent = (r) => {   // правило движка (js/services/sync/sync-merge.policy.js) — копия для теста
  const st = String(r.syncStatus || r.sync_status || '');
  if (['not_synced', 'pending', 'needs_attention'].includes(st)) return true;
  return r.source === 'local' && st !== 'synced' && st !== 'blocked';
};

/** Подделка IndexedDB: базы → хранилища (ключ — поле id) → записи по порядку ключа. Ответы — асинхронно, как в браузере. */
function fakeIdb(dbs: Record<string, Record<string, Rec[]>>): { idb: IDBFactory; reads: { cursor: number; getAll: number } } {
  const reads = { cursor: 0, getAll: 0 };
  const later = (rq: Record<string, unknown>, f: () => unknown): void => { setTimeout(() => { rq.result = f(); (rq.onsuccess as (() => void) | undefined)?.(); }, 0); };
  const sorted = (rows: Rec[]): Rec[] => [...rows].sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const store = (rows: Rec[]) => ({
    keyPath: 'id',
    getAll(range: { lower: string; open: boolean } | null, count?: number) {
      reads.getAll++;
      const rq: Record<string, unknown> = {};
      later(rq, () => sorted(rows).filter((r) => !range || (range.open ? String(r.id) > range.lower : String(r.id) >= range.lower)).slice(0, count ?? Infinity));
      return rq;
    },
    openCursor() {
      const all = sorted(rows); let i = 0;
      const rq: Record<string, unknown> = {};
      const step = (): void => later(rq, () => (i < all.length ? { value: all[i], continue: () => { i++; reads.cursor++; step(); } } : null));
      step();
      return rq;
    }
  });
  const idb = {
    open(name: string) {
      const rq: Record<string, unknown> = {};
      setTimeout(() => {
        const stores = dbs[name];
        if (!stores) { (rq.onupgradeneeded as () => void)(); (rq.onerror as () => void)(); return; }   // как браузер: создание отменено
        rq.result = { objectStoreNames: Object.keys(stores), close() {}, transaction: (s: string) => ({ objectStore: () => store(stores[s]) }) };
        (rq.onsuccess as () => void)();
      }, 0);
      Object.defineProperty(rq, 'transaction', { value: { abort() {} } });
      return rq;
    }
  } as unknown as IDBFactory;
  return { idb, reads };
}
(globalThis as Record<string, unknown>).IDBKeyRange = { lowerBound: (lower: string, open: boolean) => ({ lower, open }) };

/** Прежний способ (до P2-0073): курсором по каждой записи каждого хранилища из описи; список — до limit, затем хранилища пропускаются. */
function before(dbs: Record<string, Record<string, Rec[]>>, name: string, limit = 200): { unsent: number; rows: { store: string; id: unknown; rejected: boolean }[] } {
  let unsent = 0; const rows: { store: string; id: unknown; rejected: boolean }[] = [];
  const either: IsUnsent = (r) => isUnsentLocal(r) || isRejected(r);
  for (const [store, list] of Object.entries(dbs[name] || {})) {
    if (!(store in RECORD_STORES)) continue;
    for (const r of [...list].sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))) {
      if (pickOrphans(store, [r], isUnsentLocal).length) unsent++;
      if (rows.length < limit && pickOrphans(store, [r], either).length) rows.push({ store, id: r.id, rejected: !isUnsentLocal(r) && isRejected(r) });
    }
  }
  return { unsent, rows };
}

function seed(n: number): Record<string, Rec[]> {
  const app: Rec[] = [];
  for (let i = 0; i < n; i++) {
    const k = String(i).padStart(5, '0');
    const kind = i % 23;
    app.push({ id: 'i' + k, object: 'Корпус ' + (i % 3), date: '2026-10-' + String(1 + (i % 28)).padStart(2, '0'),
      syncStatus: kind === 0 ? 'not_synced' : kind === 1 ? 'blocked' : kind === 2 ? 'needs_attention' : kind === 3 ? 'pending' : kind === 4 ? '' : 'synced',
      source: kind === 4 ? 'local' : 'cloud', ...(kind === 5 ? { id: 'demo_' + k, syncStatus: 'not_synced' } : {}),
      ...(kind === 6 ? { type: 'auto', syncStatus: 'not_synced' } : {}), ...(kind === 7 ? { p2_moved_to: 'c1:u1', syncStatus: 'not_synced' } : {}),
      ...(kind === 8 ? { id: 'sys_' + k, syncStatus: 'not_synced' } : {}) });
  }
  return {
    app_history: app,
    rbi_tasks: [{ id: 't1', syncStatus: 'not_synced' }, { id: 't2', syncStatus: 'blocked' }, { id: 't3', syncStatus: 'synced' }],
    construction_defects: [{ id: 'd1', sync_status: 'pending' }],
    app_settings: [{ id: 's1', syncStatus: 'not_synced' }],   // не запись работы — не считается
    app_photos: [{ id: 'p1', syncStatus: 'not_synced' }]
  };
}

test('P2-0073: новое «не отправлено» = прежнее (число и список с отклонёнными), чтение порциями', async () => {
  const dbs = { Q: seed(3 * SCAN_BATCH + 57) };
  const { idb, reads } = fakeIdb(dbs);
  const old = before(dbs, 'Q');
  const now = await scanPending(idb, 'Q', isUnsentLocal);
  assert.equal(now.unsent, old.unsent, 'число «не отправлено» то же');
  assert.ok(old.unsent > 30 && old.rows.some((r) => r.rejected), 'на данных есть и неотправленные, и отклонённые');
  assert.deepEqual(now.rows.map((r) => ({ store: r.store, id: r.rec.id, rejected: r.rejected })), old.rows, 'список «Отправка» тот же');
  assert.equal(reads.cursor, 0, 'курсор по одной записи не используется');
  assert.ok(reads.getAll >= 4 && reads.getAll <= 8, 'порции по ' + SCAN_BATCH + ': ' + reads.getAll);
  // прежние функции дают то же через общий проход
  assert.equal(await countUnsent(idb, 'Q', isUnsentLocal), old.unsent);
  assert.deepEqual((await listPending(idb, 'Q', isUnsentLocal)).map((r) => r.rec.id), old.rows.map((r) => r.id));
});

test('P2-0073: список ограничен (limit), а число — по всем записям; нет базы — ноль', async () => {
  const dbs = { Q: seed(900) };
  const { idb } = fakeIdb(dbs);
  const old = before(dbs, 'Q', 10);
  const now = await scanPending(idb, 'Q', isUnsentLocal, 10);
  assert.equal(now.rows.length, 10);
  assert.deepEqual(now.rows.map((r) => r.rec.id), old.rows.map((r) => r.id));
  assert.equal(now.unsent, before(dbs, 'Q').unsent);
  assert.deepEqual(await scanPending(idb, 'нет-базы', isUnsentLocal), { unsent: 0, rows: [] });
});
