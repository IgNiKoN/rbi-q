/// <reference types="node" />
/** P2-0064 этап 2: отправка записей устройства (факт без сети) — по описанию `sync` с rpc; повтор той же записи — тот же id
 *  (сервер вернёт прежний ответ, дубля нет); обрыв — остановка прохода, запись ждёт; отказ сервера — «Сервер отклонил: …» и не уходит
 *  до «Отправить снова»; модуль выключен у компании — «Не отправлено» с причиной, включили — уходит; замок занят — проход не начат;
 *  ушедшие старше 3 дней с телефона убираются; вид без rpc (Качество) в отправку не попадает. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryRecordStore } from '../device-records.ts';
import type { DeviceRecord } from '../device-records.ts';
import { classify, createSender, KEEP_SYNCED_MS, retryDelay, sendKindsFrom } from '../send.ts';
import type { RpcAnswer, SendDeps } from '../send.ts';
import { ModulesManifest } from '../../../../../js/modules/modules.manifest.js';
import { recordStoresFrom } from '../../../auth/offline-rescue.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const SLOT = 'c-1:u';
const kinds = sendKindsFrom(ModulesManifest as N);
const rec = (id: string, over: Partial<DeviceRecord> = {}): DeviceRecord => ({ id, slot: SLOT, module: 'planfact', kind: 'pf_fact', project: 'p-1',
  createdAt: '2026-10-29T10:00:0' + id.slice(-1) + 'Z', authorId: 'u-1', payload: { kind: 'entry', position_id: 'pos-1', qty: 5 }, view: { title: 'Штукатурка' },
  source: 'local', syncStatus: 'not_synced', ...over });

/** Подставной сервер: ответ по id с телефона — как pf_fact_submit (повтор — прежний ответ); script — поведение по очереди вызовов. */
function server(script: ((id: string) => RpcAnswer | 'throw')[] = []) {
  const accepted = new Map<string, unknown>();
  const calls: string[] = [];
  return {
    accepted, calls,
    async call(fn: string, a: Record<string, unknown>): Promise<RpcAnswer> {
      assert.equal(fn, 'pf_fact_submit');
      const id = String(a.p_client_id);
      calls.push(id);
      const step = script.shift();
      const r = step ? step(id) : null;
      if (r === 'throw') throw new TypeError('Failed to fetch');
      if (r) return r;
      if (!accepted.has(id)) accepted.set(id, { id: 'e-' + id, status: 'accepted' });
      return { data: accepted.get(id), error: null, status: 200 };
    }
  };
}
function deps(store: ReturnType<typeof memoryRecordStore>, srv: ReturnType<typeof server>, over: Partial<SendDeps> = {}): SendDeps {
  let t = Date.parse('2026-10-29T12:00:00Z');
  return { store, kinds, slot: () => SLOT, modules: () => ['planfact'], call: srv.call, now: () => (t += 10), journal: () => {}, ...over };
}

test('описание `sync` План/Факта: вид pf_fact уходит функцией pf_fact_submit; в базу Качества (RECORD_STORES) не попадает', () => {
  assert.deepEqual(kinds.pf_fact, { kind: 'pf_fact', module: 'planfact', rpc: 'pf_fact_submit', title: 'Факт', store: 'device_records' });
  assert.equal(Object.values(kinds).filter((k) => k.module !== 'planfact').length, 0, 'виды Качества и СК (без rpc) — не в этой отправке');
  assert.ok(!('device_records' in recordStoresFrom(ModulesManifest as N)));
  assert.ok('app_history' in recordStoresFrom(ModulesManifest as N), 'осмотры Качества — как раньше');
});

test('ответ сервера: принято / нет связи / отказ', () => {
  assert.deepEqual(classify({ data: { id: 'e', status: 'accepted' }, error: null, status: 200 }), { kind: 'ok', value: { id: 'e', status: 'accepted' } });
  assert.equal(classify(null, new TypeError('Failed to fetch')).kind, 'net');
  assert.equal(classify({ error: { message: 'Failed to fetch' }, status: 0 }).kind, 'net');
  assert.equal(classify({ error: { message: 'upstream' }, status: 503 }).kind, 'net');
  assert.equal(classify({ error: { message: 'JWT expired' }, status: 401 }).kind, 'net', 'вход истёк — обновится, это не отказ');
  assert.deepEqual(classify({ error: { message: 'Бригада в архиве — выберите действующую', code: '22023' }, status: 400 }),
    { kind: 'rejected', message: 'Бригада в архиве — выберите действующую' });
  assert.deepEqual(classify({ error: { message: 'permission denied', code: '42501' }, status: 403 }), { kind: 'rejected', message: 'отказ сервера (42501)' });
  assert.deepEqual([1, 2, 3, 4, 9].map(retryDelay), [30000, 60000, 120000, 300000, 300000]);
});

test('без связи → связь появилась: запись уходит 1 раз; повтор прохода её не шлёт', async () => {
  const store = memoryRecordStore(); const srv = server();
  await store.put(rec('r1'));
  const s = createSender(deps(store, srv));
  const r = await s.run();
  assert.deepEqual([r.sent, r.left, r.net], [1, 0, false]);
  const got = (await store.get('r1'))!;
  assert.equal(got.syncStatus, 'synced');
  assert.deepEqual(got.result, { id: 'e-r1', status: 'accepted' });
  await s.run();
  assert.deepEqual(srv.calls, ['r1'], 'ушедшая запись повторно не отправляется');
  assert.equal((await s.pending()).length, 0);
});

test('обрыв в момент отправки (сервер записал, ответ потерян): повтор с тем же id — один факт на сервере', async () => {
  const store = memoryRecordStore();
  // первый вызов: сервер принял запись, ответ до телефона не дошёл
  const srv = server([(id) => { srv.accepted.set(id, { id: 'e-' + id, status: 'accepted' }); return 'throw'; }]);
  await store.put(rec('r1')); await store.put(rec('r2'));
  const s = createSender(deps(store, srv));
  const a = await s.run();
  assert.deepEqual([a.sent, a.net, a.left], [0, true, 2], 'обрыв — проход остановлен, вторая запись ждёт');
  assert.equal((await store.get('r1'))!.syncStatus, 'not_synced');
  const b = await s.run();
  assert.deepEqual([b.sent, b.net], [2, false]);
  assert.deepEqual(srv.calls, ['r1', 'r1', 'r2'], 'повтор — тот же id с телефона');
  assert.equal(srv.accepted.size, 2, 'на сервере — по одной записи');
});

test('по порядку создания; зависший запрос — ограничение времени, запись ждёт', async () => {
  const store = memoryRecordStore();
  await store.put(rec('r3')); await store.put(rec('r1')); await store.put(rec('r2'));
  const srv = server();
  await createSender(deps(store, srv)).run();
  assert.deepEqual(srv.calls, ['r1', 'r2', 'r3']);
  const store2 = memoryRecordStore(); await store2.put(rec('r1'));
  const hang = createSender(deps(store2, server(), { callMs: 20, call: () => new Promise(() => {}) }));
  const r = await hang.run();
  assert.deepEqual([r.net, (await store2.get('r1'))!.syncStatus], [true, 'not_synced']);
});

test('отказ сервера: «Сервер отклонил: причина», сама не уходит; «Отправить снова» — уходит (тот же id)', async () => {
  const store = memoryRecordStore();
  const srv = server([() => ({ error: { message: 'Позиция снята в новой редакции ВОР — вносите факт на действующую позицию', code: '22023' }, status: 400 })]);
  await store.put(rec('r1'));
  const s = createSender(deps(store, srv));
  const a = await s.run();
  assert.equal(a.rejected, 1);
  const got = (await store.get('r1'))!;
  assert.deepEqual([got.syncStatus, got.syncServerRejected, got.syncBlockReason], ['blocked', true,
    'Сервер отклонил: Позиция снята в новой редакции ВОР — вносите факт на действующую позицию']);
  assert.ok(got.syncBlockHint);
  await s.run();
  assert.deepEqual(srv.calls, ['r1'], 'отклонённая сама не уходит');
  assert.equal((await s.pending()).length, 1, 'видна в «Отправка» с причиной');
  assert.equal(await s.resetRejected(), 1);
  const b = await s.run();
  assert.equal(b.sent, 1);
  assert.deepEqual(srv.calls, ['r1', 'r1']);
});

test('модуль выключен у компании: «Не отправлено» с причиной; включили — уходит', async () => {
  const store = memoryRecordStore(); const srv = server();
  let mods = ['quality'];
  await store.put(rec('r1'));
  const s = createSender(deps(store, srv, { modules: () => mods }));
  const a = await s.run();
  assert.equal(a.blocked, 1);
  const got = (await store.get('r1'))!;
  assert.deepEqual([got.syncStatus, got.syncBlockReason], ['blocked', 'Не отправлено: модуль «План/Факт» выключен у компании']);
  assert.equal(srv.calls.length, 0);
  mods = ['quality', 'planfact'];
  assert.equal((await s.run()).sent, 1);
});

test('чужой «компания + пользователь» не уходит; замок занят — проход не начат; ушедшие старше 3 дней убираются', async () => {
  const store = memoryRecordStore(); const srv = server();
  await store.put(rec('r1', { slot: 'c-1:other' }));
  await store.put(rec('r2', { syncStatus: 'synced', sentAt: new Date(Date.parse('2026-10-29T12:00:00Z') - KEEP_SYNCED_MS - 1000).toISOString() }));
  await store.put(rec('r3', { syncStatus: 'synced', sentAt: '2026-10-29T11:00:00Z' }));
  const busy = await createSender(deps(store, srv, { lock: async () => false })).run();
  assert.equal(busy.busy, true);
  await createSender(deps(store, srv)).run();
  assert.deepEqual(srv.calls, []);
  assert.equal(await store.get('r2'), null, 'ушедшая 3+ дня назад — с телефона убрана');
  assert.ok(await store.get('r3'));
  assert.ok(await store.get('r1'), 'запись другого пользователя на телефоне — не трогается');
  const nobody = await createSender(deps(store, srv, { slot: () => null })).run();
  assert.deepEqual([nobody.sent, nobody.left], [0, 0], 'не вошёл — ничего не уходит');
});

test('журнал: начало и конец прохода — без содержимого записей', async () => {
  const store = memoryRecordStore(); const ev: N[] = [];
  await store.put(rec('r1'));
  await createSender(deps(store, server(), { journal: (e) => ev.push(e) })).run('manual');
  assert.deepEqual(ev.map((e) => e.k), ['start', 'end']);
  assert.equal(ev[1].pushed, 1);
  assert.ok(!JSON.stringify(ev).includes('Штукатурка'));
});
