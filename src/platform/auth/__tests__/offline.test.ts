/// <reference types="node" />
/** P2-0058: запуск без сети — «нет ответа сервера» не равно «компании нет»; мост не меняет базу без ответа сервера;
 *  «ничьи» записи общей базы PLATFORM2_DB — что предлагается к переносу и как переносится. IndexedDB — на стенде tests/offline/. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlatform } from '../platform.service.ts';
import type { PlatformState } from '../platform.service.ts';
import { applyQualityBridge, deviceUserKey, QUALITY_COMPANY_KEY, QUALITY_USER_KEY } from '../quality-bridge.ts';
import { describe, forCompany, isAttachmentOf, isDemoRecord, markMoved, pickOrphans, MOVED_FIELD } from '../offline-rescue.ts';
// @ts-expect-error — правило движка синхронизации на JS без типов
import { isUnsentLocal } from '../../../../js/services/sync/sync-merge.policy.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const A = '0f0e0d0c-0b0a-4908-8706-0504030201aa';
const ALFA = { id: A, name: 'Альфа', is_test: true, roles: [], modules: ['quality'], can_manage_company: false };

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
}
const auth = { async signIn() { return { ok: true as const }; }, async signOut() {}, async getEmail() { return 'tn@alfa.test'; }, async getAccess() { return []; } };

test('нет связи с сервером → состояние offline, компаний нет; ответ сервера → offline нет', async () => {
  const fail = createPlatform({ auth, storage: memStore(), pinActive: () => false,
    rpc: async () => ({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }) });
  const s1 = await fail.boot();
  assert.equal(s1.mode, 'email');
  assert.equal(s1.offline, true);
  assert.deepEqual(s1.companies, []);
  const thrown = createPlatform({ auth, storage: memStore(), pinActive: () => false, rpc: async () => { throw new Error('Load failed'); } });
  assert.equal((await thrown.boot()).offline, true, 'исключение запроса — тоже «нет ответа»');
  const ok = createPlatform({ auth, storage: memStore(), pinActive: () => false,
    rpc: async (fn) => ({ data: fn === 'pf_my_platform' ? { companies: [] } : {}, error: null }) });
  const s2 = await ok.boot();
  assert.equal(s2.offline, undefined, 'сервер ответил «компаний нет» — это ответ');
  assert.deepEqual(s2.companies, []);
});

function bridgeDeps(store = memStore()) {
  let reloads = 0;
  const win: N = { RBI: {} };
  return { store, win, reloads: () => reloads,
    d: { win, store, reload: () => { reloads++; }, platformClient: null, cfg: null, createClient: (() => { throw new Error('клиент не нужен'); }) as N,
      listProjects: async () => [] } };
}
const user = deviceUserKey('tn@alfa.test');
const st = (over: Partial<PlatformState> = {}): PlatformState => ({ mode: 'email', email: 'tn@alfa.test', isPlatformAdmin: false, companies: [ALFA], companyId: A, ...over });

test('мост: сервер не ответил — база компании остаётся, без перезагрузки; прежний мост страницы не сбрасывается', async () => {
  const x = bridgeDeps(memStore({ [QUALITY_COMPANY_KEY]: A, [QUALITY_USER_KEY]: user, rbi_cloud_dirty: '1' }));
  const prev = { active: true, companyId: A };
  x.win.RBI.qualitySync = prev;
  const r = await applyQualityBridge(st({ companies: [], companyId: null, offline: true }), x.d as N);
  assert.equal(x.reloads(), 0);
  assert.equal(r, prev);
  assert.equal(x.store.getItem(QUALITY_COMPANY_KEY), A, 'база компании на месте');
  assert.equal(x.store.getItem('rbi_cloud_dirty'), '1', 'признак «есть неотправленное» не отложен');
  assert.equal(x.store.getItem('platform2_quality_state_' + A + ':' + user), null, 'состояние компании не убрано в слот');
});

test('мост: сервер ответил — компании у человека больше нет → переключение и перезагрузка (как раньше)', async () => {
  const x = bridgeDeps(memStore({ [QUALITY_COMPANY_KEY]: A, [QUALITY_USER_KEY]: user }));
  assert.equal(await applyQualityBridge(st({ companies: [], companyId: null }), x.d as N), null);
  assert.equal(x.reloads(), 1);
  assert.equal(x.store.getItem(QUALITY_COMPANY_KEY), null);
});

test('мост: без связи и без прежней базы — общая база не трогается (переключения нет)', async () => {
  const x = bridgeDeps();
  assert.equal(await applyQualityBridge(st({ offline: true }), x.d as N), null);
  assert.equal(x.reloads(), 0);
  assert.equal(x.store.getItem(QUALITY_COMPANY_KEY), null);
});

test('«ничьи» записи: только неотправленные записи работы; демо, системные, отправленные и уже перенесённые — нет', () => {
  const rows = [
    { id: 'i-1', object: 'ЖК Тест', date: '2026-10-27T09:00:00Z', syncStatus: 'not_synced' },
    { id: 'i-2', object: 'ЖК Тест', syncStatus: 'synced' },
    { id: 'demo_task_1', syncStatus: 'not_synced' },
    { id: 'i-3', isDemo: true, syncStatus: 'not_synced' },
    { id: 'sys_tpl', syncStatus: 'not_synced' },
    { id: 'i-4', syncStatus: 'pending', [MOVED_FIELD]: A + ':' + user },
    { id: 'i-5', syncStatus: 'blocked' }
  ];
  assert.deepEqual(pickOrphans('app_history', rows, isUnsentLocal).map((r) => r.id), ['i-1']);
  assert.deepEqual(pickOrphans('app_settings', rows, isUnsentLocal), [], 'настройки и служебное не переносятся');
  assert.equal(isDemoRecord({ id: 'demo-1' }), true);
  assert.deepEqual(pickOrphans('rbi_tasks', [{ id: 't_1', type: 'auto', source: 'ai', contractor: 'Системная', syncStatus: 'pending' }], isUnsentLocal), [],
    'задачи, созданные системой, — не записи человека');
  assert.deepEqual(describe('app_history', rows[0]), { store: 'app_history', id: 'i-1', type: 'Осмотр', date: '2026-10-27T09:00:00Z', object: 'ЖК Тест' });
  assert.equal(describe('construction_defects_v2', { id: 'd', data: { title: 'Трещина' } }).object, 'Трещина');
});

test('перенос: id тот же, объект синхронизации — объект компании вместо LOCAL; в общей базе — пометка, не удаление', () => {
  const r = { id: 'i-1', project_code: 'LOCAL', syncStatus: 'not_synced' };
  assert.deepEqual(forCompany(r, 'p-1'), { id: 'i-1', project_code: 'p-1', syncStatus: 'not_synced' });
  assert.equal(forCompany({ id: 'i-2', project_code: 'p-9' }, 'p-1').project_code, 'p-9', 'свой объект записи не меняется');
  const a = forCompany({ id: 'i-3', inspectorName: 'Инженер', owner: '', created_by: 'Петров' }, 'p-1', 'Иванов Иван');
  assert.equal(a.inspectorName, 'Иванов Иван', 'подпись по умолчанию → вошедший (подтвердил, что записи его)');
  assert.equal(a.owner, 'Иванов Иван');
  assert.equal(a.created_by, 'Петров', 'чужая подпись не меняется');
  const m = markMoved(r, A + ':' + user, '2026-10-28T10:00:00Z');
  assert.equal(m.id, 'i-1');
  assert.equal(m[MOVED_FIELD], A + ':' + user);
  assert.equal(r.project_code, 'LOCAL', 'исходная запись не изменена');
  const ids = new Set(['i-1']);
  const text = JSON.stringify([{ id: 'i-1', photos: ['local://ph-77'] }]);
  assert.equal(isAttachmentOf({ id: 'ph-77' }, ids, text), true, 'фото упомянуто в записи');
  assert.equal(isAttachmentOf({ id: 'ph-1', entityId: 'i-1' }, ids, text), true, 'фото привязано к записи');
  assert.equal(isAttachmentOf({ id: 'ph-2', entityId: 'x' }, ids, text), false);
  assert.equal(isAttachmentOf({ id: 'ph-77', [MOVED_FIELD]: 'x' }, ids, text), false, 'уже перенесённое — нет');
});
