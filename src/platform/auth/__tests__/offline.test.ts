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
  const s5xx = createPlatform({ auth, storage: memStore(), pinActive: () => false, rpc: async () => ({ data: null, error: { message: 'Bad gateway' }, status: 502 }) });
  assert.equal((await s5xx.boot()).offline, true, 'сервер недоступен (5xx) — тоже «нет ответа»');
  const s4xx = createPlatform({ auth, storage: memStore(), pinActive: () => false,
    rpc: async (fn) => (fn === 'pf_my_profile' ? { data: null, error: { message: 'not found', code: 'PGRST202' }, status: 404 } : { data: { companies: [ALFA] }, error: null, status: 200 }) });
  const s4 = await s4xx.boot();
  assert.equal(s4.offline, undefined, 'сервер ответил ошибкой (4xx) — это ответ, как раньше');
  assert.equal(s4.companies.length, 1);
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

// --- этап 2: права на устройстве, «вошёл без связи» до 14 дней ---
import { resolveSession, readStoredSession } from '../auth.service.ts';
import type { AuthApi, SessionState } from '../auth.service.ts';
import { DEVICE_ACCESS_PREFIX, lastConfirmed, offlineExpired } from '../platform.service.ts';
import { QUALITY_ACCESS_COPY_PREFIX } from '../quality-bridge.ts';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const sec = (ms: number): number => Math.floor(ms / 1000);

test('сохранённый вход: свежий — без сети; устарел и сети нет — «без связи» сразу; сервер отозвал — нет входа', async () => {
  const fresh = { email: 'a@x', expiresAt: sec(NOW) + 1800, issuedAt: sec(NOW) - 1800 };
  assert.deepEqual(await resolveSession({ stored: fresh, online: false, nowSec: sec(NOW), getSession: async () => 'a@x', stillStored: () => true }),
    { email: 'a@x', offline: false, issuedAt: fresh.issuedAt });
  const old = { email: 'a@x', expiresAt: sec(NOW) - 3600, issuedAt: sec(NOW) - 7200 };
  let asked = 0;
  assert.deepEqual(await resolveSession({ stored: old, online: false, nowSec: sec(NOW), getSession: async () => { asked++; return null; }, stillStored: () => true }),
    { email: 'a@x', offline: true, issuedAt: old.issuedAt });
  assert.equal(asked, 0, 'без сети обновление входа не ждём');
  assert.deepEqual(await resolveSession({ stored: old, online: true, nowSec: sec(NOW), getSession: async () => 'a@x', stillStored: () => true }),
    { email: 'a@x', offline: false, issuedAt: old.issuedAt }, 'сеть есть — вход обновлён');
  assert.deepEqual(await resolveSession({ stored: old, online: true, nowSec: sec(NOW), getSession: async () => null, stillStored: () => true }),
    { email: 'a@x', offline: true, issuedAt: old.issuedAt }, 'сервер не ответил, вход не стёрт — без связи');
  assert.deepEqual(await resolveSession({ stored: old, online: true, nowSec: sec(NOW), getSession: async () => null, stillStored: () => false }),
    { email: null, offline: false, issuedAt: null }, 'invalid_grant: supabase-js стёр вход — экран «Вход»');
  const slow = await resolveSession({ stored: old, online: true, nowSec: sec(NOW), waitMs: 20, getSession: () => new Promise(() => {}), stillStored: () => true });
  assert.equal(slow.offline, true, 'обновление не дождались — работа без связи, не «Вход»');
  assert.deepEqual(readStoredSession({ getItem: () => JSON.stringify({ expires_at: 100, expires_in: 3600, user: { email: 'a@x' } }) }), { email: 'a@x', expiresAt: 100, issuedAt: -3500 });
  assert.equal(readStoredSession({ getItem: () => null }), null);
});

function sessionAuth(ses: SessionState): AuthApi {
  return { async signIn() { return { ok: true }; }, async signOut() {}, async getEmail() { return ses.email; }, async getAccess() { return []; }, async getSessionState() { return ses; } };
}

test('права на устройстве: ответ сервера сохраняется у вошедшего; без связи — меню по копии; «Выйти» стирает', async () => {
  const store = memStore();
  const online = createPlatform({ auth: sessionAuth({ email: 'tn@alfa.test', offline: false, issuedAt: sec(NOW) }), storage: store, pinActive: () => false, now: () => NOW,
    rpc: async (fn) => ({ data: fn === 'pf_my_platform' ? { companies: [ALFA] } : { full_name: 'Иванов', user_id: 'u-1' }, error: null }) });
  const s1 = await online.boot();
  assert.equal(s1.confirmedAt, new Date(NOW).toISOString());
  assert.ok(store.getItem(DEVICE_ACCESS_PREFIX + user), 'копия под ключом пользователя (без почты)');
  const net = { calls: 0 };
  const off = createPlatform({ auth: sessionAuth({ email: 'tn@alfa.test', offline: true, issuedAt: sec(NOW) }), storage: store, pinActive: () => false,
    now: () => NOW + 3 * 24 * 3600 * 1000, rpc: async () => { net.calls++; return { data: null, error: { message: 'Failed to fetch' } }; } });
  const s2 = await off.boot();
  assert.equal(net.calls, 0, 'вход не подтверждён — сервер не спрашиваем (без долгих ожиданий)');
  assert.equal(s2.mode, 'email');
  assert.equal(s2.offline, true);
  assert.equal(s2.companyId, A);
  assert.equal(s2.fullName, 'Иванов');
  assert.equal(off.access().quality, true, 'меню без сети — по копии');
  const other = createPlatform({ auth: sessionAuth({ email: 'other@alfa.test', offline: true, issuedAt: sec(NOW) }), storage: store, pinActive: () => false,
    now: () => NOW, rpc: async () => ({ data: null, error: { message: 'Failed to fetch' } }) });
  const s3 = await other.boot();
  assert.deepEqual(s3.companies, [], 'другой вошедший на устройстве чужих прав не видит');
  await online.signOut();
  assert.equal(store.getItem(DEVICE_ACCESS_PREFIX + user), null, '«Выйти» стирает копию');
});

test('«вошёл без связи» до 14 дней: дольше — экран «Вход» с причиной, база не трогается; подтверждение — копия или выдача входа', async () => {
  const store = memStore({ [DEVICE_ACCESS_PREFIX + user]: JSON.stringify({ at: new Date(NOW - 15 * 24 * 3600 * 1000).toISOString(), platform: { companies: [ALFA] }, profile: {} }),
    [QUALITY_COMPANY_KEY]: A, [QUALITY_USER_KEY]: user });
  const p = createPlatform({ auth: sessionAuth({ email: 'tn@alfa.test', offline: true, issuedAt: sec(NOW - 16 * 24 * 3600 * 1000) }), storage: store, pinActive: () => false,
    now: () => NOW, rpc: async () => ({ data: null, error: { message: 'Failed to fetch' } }) });
  const s = await p.boot();
  assert.equal(s.mode, 'none');
  assert.equal(s.loginReason, 'stale');
  assert.equal(s.offline, true);
  const x = bridgeDeps(store);
  await applyQualityBridge(s, x.d as N);
  assert.equal(x.reloads(), 0, 'экран «Вход» без связи — база компании и записи на месте');
  assert.equal(store.getItem(QUALITY_COMPANY_KEY), A);
  const day13 = createPlatform({ auth: sessionAuth({ email: 'tn@alfa.test', offline: true, issuedAt: sec(NOW - 13 * 24 * 3600 * 1000) }), storage: store, pinActive: () => false,
    now: () => NOW, rpc: async () => ({ data: null, error: { message: 'x' } }) });
  assert.equal((await day13.boot()).mode, 'email', 'выдача входа 13 дней назад (копия старше) — ещё работает');
  assert.equal(offlineExpired(null, NOW), true, 'ни копии, ни времени входа — только вход');
  assert.equal(lastConfirmed(null, sec(NOW)), sec(NOW) * 1000);
});

test('мост без связи: права Качества и объекты — из копии последнего ответа; синхронизация не выключается', async () => {
  const store = memStore({ [QUALITY_COMPANY_KEY]: A, [QUALITY_USER_KEY]: user });
  const mk = (online: boolean) => {
    const win: N = { RBI: {} };
    return { win, d: { win, store, reload: () => { throw new Error('без перезагрузки'); }, cfg: { url: 'http://x', anonKey: 'k' },
      platformClient: { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({}) } } as N,
      createClient: (() => ({ rpc: async () => (online ? { data: { actions: ['quality.edit'], projects: null }, error: null } : { data: null, error: { message: 'Failed to fetch' } }), storage: { from: () => ({}) } })) as N,
      listProjects: async () => { if (!online) throw new Error('нет связи'); return [{ id: 'p-1', name: 'ЖК' }]; } } };
  };
  const on = mk(true);
  const s1 = await applyQualityBridge(st(), on.d as N);
  assert.equal(s1!.projectId, 'p-1');
  assert.ok(store.getItem(QUALITY_ACCESS_COPY_PREFIX + A + ':' + user));
  const off = mk(false);
  const s2 = await applyQualityBridge(st({ offline: true }), off.d as N);
  assert.equal(s2!.projectId, 'p-1', 'объект — из копии');
  assert.equal(s2!.role, 'engineer', 'роль — из копии прав, не «гость»');
  assert.equal(JSON.parse(store.getItem('rbi_sync_config')!).enabled, true, 'синхронизация не выключена (запишется и уйдёт позже)');
});

// --- этап 4: значок «Нет связи · не отправлено: N», строка «Данные на устройстве» ---
import { chipView, deviceLine } from '../net-status.ts';
import { renderRescueSheet } from '../offline-rescue.ts';
import { Window } from 'happy-dom';

test('значок: без связи — «Нет связи · не отправлено: N» (телефон — число); со связью — только когда есть неотправленное', () => {
  const off = chipView({ offline: true, unsent: 0 }, false);
  assert.equal(off.show, true);
  assert.match(off.html, /Нет связи/);
  assert.match(off.html, /не отправлено: <b>0<\/b>/);
  assert.equal(off.label, 'Нет связи, не отправлено: 0');
  const phone = chipView({ offline: true, unsent: 3 }, true);
  assert.doesNotMatch(phone.html, /Нет связи/);
  assert.match(phone.html, /<b>3<\/b>/);
  assert.equal(chipView({ offline: false, unsent: 0 }, false).show, false, 'связь есть, всё отправлено — значка нет (облачко как раньше)');
  const pend = chipView({ offline: false, unsent: 2 }, false);
  assert.equal(pend.show, true);
  assert.doesNotMatch(pend.html, /Нет связи/);
  assert.equal(deviceLine({ offline: false, unsent: 0 }), null);
  assert.equal(deviceLine({ offline: true, unsent: 1 })!.title, 'Нет связи · не отправлено: 1');
});

test('окно «Найдено N записей»: список, «Позже» закрывает, «Перенести» — ошибка видна, повтор возможен', async () => {
  const doc = new Window().document as unknown as Document;
  let later = 0, tries = 0;
  const el = renderRescueSheet(doc, { companyName: 'Тест-Строй', onLater: () => { later++; },
    orphans: [{ store: 'app_history', id: '1', type: 'Осмотр', date: '2026-10-27T09:14:00', object: 'Секция 1' }, { store: 'app_history', id: '2', type: 'Осмотр', date: '', object: '' }],
    onMove: async () => (++tries === 1 ? 'Не удалось перенести. Попробуйте ещё раз' : null) });
  doc.body.appendChild(el);
  assert.match(el.textContent || '', /Найдено 2 записи, сделанные без связи/);
  assert.match(el.textContent || '', /«Тест-Строй»/);
  assert.equal(el.querySelectorAll('li').length, 2);
  assert.match(el.querySelectorAll('li')[1].textContent || '', /без даты.*без объекта/);
  (el.querySelector('[data-testid=p2-rescue-move]') as HTMLButtonElement).click();
  await new Promise((r) => setTimeout(r, 5));
  assert.match(el.textContent || '', /Не удалось перенести/);
  assert.equal(doc.body.contains(el), true, 'ошибка — окно остаётся');
  (el.querySelector('[data-testid=p2-rescue-move]') as HTMLButtonElement).click();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(doc.body.contains(el), false);
  const one = renderRescueSheet(doc, { companyName: 'А', orphans: [{ store: 's', id: '1', type: 'Осмотр', date: '', object: '' }], onMove: async () => null, onLater: () => { later++; } });
  assert.match(one.textContent || '', /Найдено 1 запись, сделанная без связи/);
  doc.body.appendChild(one);
  (one.querySelector('[data-testid=p2-rescue-later]') as HTMLButtonElement).click();
  assert.equal(later, 1);
});
