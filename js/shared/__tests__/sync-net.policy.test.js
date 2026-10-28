/**
 * P2-0059: отправка при плохой связи — проверка связи, ограничение времени, порции, паузы, замок.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  requestTimeoutMs, REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MAX_MS, makeTimedFetch, TIMEOUT_CODE, bodyBytes,
  probeVerdict, shouldStartSync, autoSyncDecision, chunks, ownFirst, leaseFree, passIdleTooLong, retryKindOf
} from '../../services/sync/sync-net.policy.js';

describe('requestTimeoutMs (С2)', () => {
  it('обычный запрос — 25 с', () => {
    assert.equal(requestTimeoutMs({ url: 'https://x/rest/v1/rbi_inspections', method: 'POST', bytes: 2000 }), REQUEST_TIMEOUT_MS);
    assert.equal(requestTimeoutMs({ url: 'https://x/auth/v1/user' }), REQUEST_TIMEOUT_MS);
  });
  it('файл — по размеру: 300 КБ даёт 25 + 75 с', () => {
    assert.equal(requestTimeoutMs({ url: 'https://x/storage/v1/object/inspection-photos/a.jpg', method: 'POST', bytes: 300000 }), 100000);
  });
  it('огромный файл — не больше 10 мин', () => {
    assert.equal(requestTimeoutMs({ url: 'https://x/storage/v1/object/b/a.pdf', method: 'POST', bytes: 50e6 }), REQUEST_TIMEOUT_MAX_MS);
  });
  it('большая пачка записей тоже получает время по размеру', () => {
    assert.ok(requestTimeoutMs({ url: 'https://x/rest/v1/t', method: 'POST', bytes: 400000 }) > REQUEST_TIMEOUT_MS);
  });
  it('bodyBytes: строка, буфер, Blob', () => {
    assert.equal(bodyBytes('абв'), 6);
    assert.equal(bodyBytes(new ArrayBuffer(10)), 10);
    assert.equal(bodyBytes(new Blob(['12345'])), 5);
    assert.equal(bodyBytes(null), 0);
  });
});

describe('makeTimedFetch (С2)', () => {
  const timers = () => {
    const list = [];
    return { list, setTimer: (f, ms) => { list.push({ f, ms }); return list.length - 1; }, clearTimer: (i) => { if (list[i]) list[i].f = null; } };
  };
  it('зависший запрос прерывается по времени — ошибка «нет ответа», счётчик активности обнулён', async () => {
    const t = timers();
    const activity = { inflight: 0, lastSettledAt: 0 };
    const hang = (_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    const f = makeTimedFetch(hang, { activity, now: () => 777, ...t });
    const p = f('https://x/rest/v1/a', { method: 'POST', body: '[]' });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(activity.inflight, 1);
    assert.equal(t.list[0].ms, REQUEST_TIMEOUT_MS);
    t.list[0].f();
    await assert.rejects(p, (e) => e.code === TIMEOUT_CODE);
    assert.equal(activity.inflight, 0);
    assert.equal(activity.lastSettledAt, 777);
  });
  it('ответ вовремя — таймер снят, ответ прошёл', async () => {
    const t = timers();
    const f = makeTimedFetch(async () => ({ status: 201 }), t);
    const r = await f('https://x/rest/v1/a', {});
    assert.equal(r.status, 201);
    assert.equal(t.list[0].f, null);
  });
  it('отмена прохода прерывает запрос (не по времени — исходная ошибка)', async () => {
    const t = timers();
    const pass = new AbortController();
    const hang = (_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    const f = makeTimedFetch(hang, { passSignal: () => pass.signal, ...t });
    const p = f('https://x/rest/v1/a', {});
    await Promise.resolve();
    pass.abort();
    await assert.rejects(p, (e) => e.message === 'aborted' && e.code !== TIMEOUT_CODE);
  });
});

describe('проверка связи (С1)', () => {
  it('ответил — связь есть (даже 404); 5xx — сервер болеет; нет ответа — нет связи', () => {
    assert.equal(probeVerdict({ status: 200 }), 'online');
    assert.equal(probeVerdict({ status: 404 }), 'online');
    assert.equal(probeVerdict({ status: 503 }), 'server');
    assert.equal(probeVerdict({ timedOut: true }), 'offline');
    assert.equal(probeVerdict({ error: new Error('Failed to fetch') }), 'offline');
    assert.equal(probeVerdict(null), 'offline');
  });
  it('запускать ли проход', () => {
    assert.deepEqual(shouldStartSync({ onLine: false, probe: 'online' }), { start: false, reason: 'no_network' });
    assert.deepEqual(shouldStartSync({ onLine: true, probe: 'offline' }), { start: false, reason: 'no_answer' });
    assert.deepEqual(shouldStartSync({ onLine: true, probe: 'server' }), { start: false, reason: 'server_error' });
    assert.deepEqual(shouldStartSync({ onLine: true, probe: 'online' }), { start: true, reason: '' });
  });
});

describe('умные паузы (С6)', () => {
  it('паузы нет — запуск', () => assert.equal(autoSyncDecision({ now: 10, retryAfter: 0 }), 'run'));
  it('пауза кончилась — запуск', () => assert.equal(autoSyncDecision({ now: 10, retryAfter: 5, retryKind: 'server' }), 'run'));
  it('пауза после сбоя связи — проверить связь сейчас, не ждать', () => assert.equal(autoSyncDecision({ now: 10, retryAfter: 600010, retryKind: 'net' }), 'probe'));
  it('пауза после ошибки сервера — ждать', () => assert.equal(autoSyncDecision({ now: 10, retryAfter: 600010, retryKind: 'server' }), 'wait'));
  it('вид сбоя: нет ответа / 5xx', () => {
    assert.equal(retryKindOf({ code: TIMEOUT_CODE }), 'net');
    assert.equal(retryKindOf(new TypeError('Failed to fetch')), 'net');
    assert.equal(retryKindOf({ status: 503 }), 'server');
    assert.equal(retryKindOf({ status: 429 }), 'server');
  });
});

describe('порции и порядок (С4, С5)', () => {
  it('chunks', () => {
    assert.deepEqual(chunks([1, 2, 3, 4, 5, 6, 7], 3), [[1, 2, 3], [4, 5, 6], [7]]);
    assert.deepEqual(chunks([], 5), []);
    assert.deepEqual(chunks(null), []);
  });
  it('своё неотправленное — первым, порядок внутри групп сохраняется', () => {
    const r = ownFirst([{ id: 1 }, { id: 2, u: 1 }, { id: 3 }, { id: 4, u: 1 }], (x) => !!x.u);
    assert.deepEqual(r.map((x) => x.id), [2, 4, 1, 3]);
  });
});

describe('замок и «стоп» прохода (С3)', () => {
  it('аренда: нет / своя / истекла — свободна; чужая живая — занята', () => {
    assert.equal(leaseFree(null, 100, 'a'), true);
    assert.equal(leaseFree({ owner: 'a', until: 200 }, 100, 'a'), true);
    assert.equal(leaseFree({ owner: 'b', until: 99 }, 100, 'a'), true);
    assert.equal(leaseFree({ owner: 'b', until: 200 }, 100, 'a'), false);
  });
  it('стоп — только когда ничего не происходит 90 с; запрос в пути — не стоп', () => {
    assert.equal(passIdleTooLong({ inflight: 1, lastSettledAt: 0 }, 1e6, 0), false);
    assert.equal(passIdleTooLong({ inflight: 0, lastSettledAt: 50000 }, 100000, 0), false);
    assert.equal(passIdleTooLong({ inflight: 0, lastSettledAt: 5000 }, 100000, 0), true);
    assert.equal(passIdleTooLong({ inflight: 0, lastSettledAt: 0 }, 100000, 60000), false);
  });
});
