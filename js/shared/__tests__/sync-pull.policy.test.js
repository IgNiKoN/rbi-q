/**
 * P2-0023 этап 3: новое устройство — постраничная загрузка, запас по времени, видимость решает сервер.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PULL_OVERLAP_MS,
  pullSinceWithOverlap,
  pullPagedByIds,
  useBulkLocalLookup,
  clientScopeMode,
  PULL_BATCH_SIZE,
  PULL_CONCURRENCY,
  isThrottleError,
  indexLocalHistory,
  keepLocalOverCloud
} from '../../services/sync/sync-pull.policy.js';

// Подставной сервер: строки отсортированы по id, ответ обрезается по лимиту строк (как PostgREST max-rows).
function fakeServer(rows, maxRows = 1000) {
  const calls = [];
  const fetchPage = async (ids, from, to) => {
    calls.push({ ids: ids.length, from, to });
    const set = new Set(ids);
    const matched = rows.filter(r => set.has(r.inspection_id)).sort((a, b) => (a.id < b.id ? -1 : 1));
    const end = Math.min(to + 1, from + maxRows);
    return { data: matched.slice(from, end) };
  };
  return { fetchPage, calls };
}

function makeRows(inspections, perInspection) {
  const rows = [];
  for (let i = 0; i < inspections; i++) {
    for (let k = 0; k < perInspection; k++) {
      rows.push({ id: `insp${String(i).padStart(4, '0')}_${String(k).padStart(3, '0')}`, inspection_id: `insp${i}`.replace(/^insp(\d+)$/, (m, n) => 'insp' + String(n).padStart(4, '0')) });
    }
  }
  return rows;
}

describe('pullPagedByIds', () => {
  it('40 проверок × 60 пунктов = 2400 строк при лимите сервера 1000 — приходят все', async () => {
    const rows = makeRows(40, 60);
    const ids = Array.from(new Set(rows.map(r => r.inspection_id)));
    const srv = fakeServer(rows, 1000);
    const got = await pullPagedByIds(srv.fetchPage, ids, { batchSize: 40, pageSize: 500 });
    assert.equal(got.length, 2400);
    assert.equal(new Set(got.map(r => r.id)).size, 2400, 'без дублей');
  });

  it('раньше (один запрос на пачку) терялся хвост — модель старого поведения', async () => {
    const rows = makeRows(40, 60);
    const ids = Array.from(new Set(rows.map(r => r.inspection_id)));
    const srv = fakeServer(rows, 1000);
    const { data } = await srv.fetchPage(ids, 0, 1e9);
    assert.equal(data.length, 1000);
  });

  it('страница меньше лимита сервера тоже работает; пустой список — без запросов', async () => {
    const rows = makeRows(90, 7); // 630 строк, 3 пачки по 40
    const ids = Array.from(new Set(rows.map(r => r.inspection_id)));
    const srv = fakeServer(rows, 1000);
    const got = await pullPagedByIds(srv.fetchPage, ids, { batchSize: 40, pageSize: 100 });
    assert.equal(got.length, 630);
    const empty = fakeServer([], 1000);
    assert.deepEqual(await pullPagedByIds(empty.fetchPage, [], {}), []);
    assert.equal(empty.calls.length, 0);
  });

  it('ошибка сервера не глотается (иначе запись станет «загруженной» без пунктов)', async () => {
    await assert.rejects(pullPagedByIds(async () => ({ error: new Error('502') }), ['a'], {}), /502/);
  });

  it('повторяющиеся id проверок не дают дублей строк', async () => {
    const rows = makeRows(2, 3);
    const srv = fakeServer(rows, 1000);
    const got = await pullPagedByIds(srv.fetchPage, ['insp0000', 'insp0000', 'insp0001'], {});
    assert.equal(got.length, 6);
  });
});

// P2-0024: подставной сервер с задержкой, общим числом строк (count) и учётом одновременных запросов.
function slowServer(rows, { maxRows = Infinity, delayMs = 0, withCount = true, failAt = null } = {}) {
  const byInsp = new Map();
  for (const r of rows) {
    if (!byInsp.has(r.inspection_id)) byInsp.set(r.inspection_id, []);
    byInsp.get(r.inspection_id).push(r);
  }
  for (const list of byInsp.values()) list.sort((a, b) => (a.id < b.id ? -1 : 1));
  const st = { calls: 0, inFlight: 0, maxInFlight: 0 };
  const fetchPage = async (ids, from, to, first) => {
    st.calls++;
    const n = st.calls;
    st.inFlight++;
    st.maxInFlight = Math.max(st.maxInFlight, st.inFlight);
    try {
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
      if (typeof failAt === 'function') { const e = failAt(n); if (e) return { error: e }; }
      const matched = [];
      for (const id of [...ids].sort()) matched.push(...(byInsp.get(id) || []));
      matched.sort((a, b) => (a.id < b.id ? -1 : 1));
      const end = Math.min(to + 1, from + maxRows);
      return { data: matched.slice(from, end), count: withCount && first ? matched.length : null };
    } finally {
      st.inFlight--;
    }
  };
  return { fetchPage, st };
}

// 3000 проверок / 53 325 пунктов / 3864 фото — как в замерах (specs/2026-10-24-quality-perf-findings.md).
function bigDataset() {
  const ids = Array.from({ length: 3000 }, (_, i) => String(1729000000000 + i * 7));
  const items = [];
  for (let k = 0; k < 53325; k++) {
    const insp = ids[(k * 7919) % 3000];
    items.push({ id: `${insp}_i${String(k).padStart(6, '0')}`, inspection_id: insp });
  }
  const photos = [];
  for (let k = 0; k < 3864; k++) {
    const insp = ids[(k * 104729) % 1200];
    photos.push({ id: `${insp}_p${String(k).padStart(5, '0')}`, inspection_id: insp });
  }
  return { ids, items, photos };
}

describe('pullPagedByIds — P2-0024 параллельно и крупными пачками', () => {
  const OPTS = { batchSize: PULL_BATCH_SIZE, pageSize: 5000, concurrency: PULL_CONCURRENCY };

  it('настройки: пачка 150–200, до 3 одновременно', () => {
    assert.ok(PULL_BATCH_SIZE >= 150 && PULL_BATCH_SIZE <= 200);
    assert.equal(PULL_CONCURRENCY, 3);
  });

  it('3000 / 53 325 / 3864 при 200 мс на запрос: всё дошло, ≤ 40 запросов, ≤ 15 с, не больше 3 одновременно', async () => {
    const { ids, items, photos } = bigDataset();
    const insPages = Math.ceil(3000 / 500) + 1; // проверки: rbiPullAllRows по 500 (+ последняя короткая/пустая)
    const t0 = Date.now();
    const si = slowServer(items, { delayMs: 200 });
    const gotItems = await pullPagedByIds(si.fetchPage, ids, OPTS);
    const sp = slowServer(photos, { delayMs: 200 });
    const gotPhotos = await pullPagedByIds(sp.fetchPage, ids, OPTS);
    const netMs = Date.now() - t0 + insPages * 200; // проверки идут последовательно до пунктов
    assert.equal(gotItems.length, 53325);
    assert.equal(new Set(gotItems.map(r => r.id)).size, 53325, 'без дублей');
    assert.equal(gotPhotos.length, 3864);
    assert.equal(new Set(gotPhotos.map(r => r.id)).size, 3864);
    const requests = insPages + si.st.calls + sp.st.calls;
    assert.ok(requests <= 40, `запросов ${requests}`);
    assert.ok(netMs <= 15000, `время ${netMs} мс`);
    assert.ok(si.st.maxInFlight <= 3 && sp.st.maxInFlight <= 3);
    assert.equal(si.st.maxInFlight, 3, 'действительно параллельно');
    console.log(`  [замер] без лимита сервера: запросов ${requests}, сеть ≈ ${netMs} мс`);
  });

  it('лимит сервера 1000 строк при pageSize 5000 — хвост не теряется (по count)', async () => {
    const { ids, items } = bigDataset();
    const si = slowServer(items, { maxRows: 1000 });
    const got = await pullPagedByIds(si.fetchPage, ids, OPTS);
    assert.equal(got.length, 53325);
    assert.equal(new Set(got.map(r => r.id)).size, 53325);
    console.log(`  [замер] лимит 1000: запросов на пункты ${si.st.calls}`);
  });

  it('сервер без count и с лимитом меньше страницы — догружает до пустой страницы, без потерь', async () => {
    const { ids, items } = bigDataset();
    const si = slowServer(items, { maxRows: 1000, withCount: false });
    const got = await pullPagedByIds(si.fetchPage, ids.slice(0, 400), { ...OPTS, pageSize: 1000 });
    const expected = items.filter(r => ids.slice(0, 400).includes(r.inspection_id)).length;
    assert.equal(got.length, expected);
  });

  it('порядок результата = порядок пачек, как при последовательной загрузке', async () => {
    const { ids, items } = bigDataset();
    const par = await pullPagedByIds(slowServer(items, { delayMs: 3 }).fetchPage, ids, OPTS);
    const seq = await pullPagedByIds(slowServer(items).fetchPage, ids, { ...OPTS, concurrency: 1 });
    assert.deepEqual(par.map(r => r.id), seq.map(r => r.id));
  });

  it('ошибка одной пачки → отказ всей загрузки (без частичного результата)', async () => {
    const { ids, items } = bigDataset();
    const si = slowServer(items, { delayMs: 5, failAt: (n) => (n === 4 ? new Error('connection reset') : null) });
    await assert.rejects(pullPagedByIds(si.fetchPage, ids, OPTS), /connection reset/);
    assert.ok(si.st.calls < 15 + 5, 'после ошибки новые пачки не запрашиваются');
  });

  it('429/502 → одна повторная попытка, дальше по одному запросу; всё дошло', async () => {
    const { ids, items } = bigDataset();
    let throttled = 0;
    const si = slowServer(items, { delayMs: 5, failAt: (n) => (n === 2 ? Object.assign(new Error('Too Many'), { status: 429 }) : null) });
    const got = await pullPagedByIds(si.fetchPage, ids, { ...OPTS, onThrottle: () => throttled++ });
    assert.equal(got.length, 53325);
    assert.equal(throttled, 1);
    assert.ok(isThrottleError({ status: 502 }) && isThrottleError(new Error('HTTP 503')) && !isThrottleError(new Error('boom')));
  });

  it('429 как у supabase-js (код в ответе, не в ошибке) тоже распознаётся', async () => {
    const { ids, items } = bigDataset();
    const srv = slowServer(items);
    let n = 0, throttled = 0;
    const fetchPage = async (...a) => (++n === 3 ? { error: { message: 'stand fail', code: '' }, status: 429 } : srv.fetchPage(...a));
    const got = await pullPagedByIds(fetchPage, ids, { ...OPTS, onThrottle: () => throttled++ });
    assert.equal(got.length, 53325);
    assert.equal(throttled, 1);
  });

  it('доработка 1: 503 сразу на двух одновременных запросах — оба повторяются, всё дошло, сообщение одно', async () => {
    const { ids, items } = bigDataset();
    const srv = slowServer(items, { delayMs: 5 });
    let n = 0, throttled = 0, inAfter = 0, maxAfterParallel = 0;
    const failOn = new Set([2, 3]);
    const fetchPage = async (...a) => {
      const k = ++n;
      if (failOn.has(k)) { await new Promise(r => setTimeout(r, 5)); return { error: { message: 'Service Unavailable' }, status: 503 }; }
      // запросы, начатые ПОСЛЕ сигнала перегрузки (уже отправленный раньше — в пути, его не отозвать)
      if (throttled) { inAfter++; maxAfterParallel = Math.max(maxAfterParallel, inAfter); try { return await srv.fetchPage(...a); } finally { inAfter--; } }
      return srv.fetchPage(...a);
    };
    const got = await pullPagedByIds(fetchPage, ids, { ...OPTS, onThrottle: () => throttled++ });
    assert.equal(got.length, 53325);
    assert.equal(new Set(got.map(r => r.id)).size, 53325);
    assert.equal(throttled, 1);
    assert.ok(maxAfterParallel === 1, 'после перегрузки — по одному: ' + maxAfterParallel);
  });

  it('доработка 1: сервер без count и лимит 1000 при pageSize 5000 — без потерь (до пустой страницы)', async () => {
    const { ids, items } = bigDataset();
    const si = slowServer(items, { maxRows: 1000, withCount: false });
    const got = await pullPagedByIds(si.fetchPage, ids, OPTS);
    assert.equal(got.length, 53325);
    assert.equal(new Set(got.map(r => r.id)).size, 53325);
  });

  it('повторная 429 той же пачки → отказ всей загрузки', async () => {
    const si = slowServer([{ id: 'a1', inspection_id: 'a' }], { failAt: () => ({ status: 429, message: '429' }) });
    await assert.rejects(pullPagedByIds(si.fetchPage, ['a', 'b', 'c'], { batchSize: 1, concurrency: 3 }));
  });

  it('прогресс: onBatchDone от 1 до числа пачек', async () => {
    const { ids, items } = bigDataset();
    const seen = [];
    await pullPagedByIds(slowServer(items).fetchPage, ids, { ...OPTS, onBatchDone: (d, t) => seen.push([d, t]) });
    assert.equal(seen.length, 15);
    assert.deepEqual(seen[seen.length - 1], [15, 15]);
  });
});

describe('indexLocalHistory / keepLocalOverCloud — одна выборка вместо dbGet на каждую', () => {
  it('строковый id главнее, числовой — дубль на удаление, нет — null', () => {
    const look = indexLocalHistory([{ id: '5', v: 's' }, { id: 5, v: 'n' }, { id: 7, v: 'n7' }, null]);
    assert.deepEqual(look('5'), { record: { id: '5', v: 's' }, numericDup: false });
    assert.deepEqual(look(7), { record: { id: 7, v: 'n7' }, numericDup: true });
    assert.equal(look('9'), null);
  });
  it('неотправленная локальная правка (новее облака) не затирается; облако новее — берём облако', () => {
    const local = { id: '1', updatedAt: '2026-10-24T12:00:00Z', syncStatus: 'pending' };
    assert.equal(keepLocalOverCloud(local, { updated_at: '2026-10-24T11:00:00Z' }), true);
    assert.equal(keepLocalOverCloud(local, { updated_at: '2026-10-24T12:00:00Z' }), true);
    assert.equal(keepLocalOverCloud(local, { updated_at: '2026-10-24T13:00:00Z' }), false);
    assert.equal(keepLocalOverCloud({ id: '1', _deletedAt: '2026-10-24T12:00:00Z' }, { updated_at: '2026-10-24T11:00:00Z' }), true);
    assert.equal(keepLocalOverCloud(null, { updated_at: 'x' }), false);
  });
});

describe('pullSinceWithOverlap', () => {
  it('отступает на 15 минут назад', () => {
    assert.equal(PULL_OVERLAP_MS, 15 * 60 * 1000);
    assert.equal(pullSinceWithOverlap('2026-10-24T12:00:00.000Z'), '2026-10-24T11:45:00.000Z');
  });
  it('запись, отправленная во время прошлой синхронизации, попадает в следующую', () => {
    const lastPullAt = '2026-10-24T12:00:00.000Z';      // конец прошлой загрузки
    const lateRowUpdatedAt = '2026-10-24T11:58:30.000Z'; // отправлена, пока шла загрузка / часы отстают
    assert.ok(lateRowUpdatedAt > pullSinceWithOverlap(lastPullAt));
    assert.ok(!(lateRowUpdatedAt > lastPullAt), 'без запаса — терялась');
  });
  it('пусто/мусор → полная загрузка', () => {
    assert.equal(pullSinceWithOverlap(''), '');
    assert.equal(pullSinceWithOverlap('abc'), '');
    assert.equal(pullSinceWithOverlap(null), '');
  });
});

describe('clientScopeMode', () => {
  it('через сервер Platform 2.0 клиент видимость не сужает', () => {
    assert.equal(clientScopeMode({ serverScoped: true, dataScope: 'ownProjectOrOwnRecords', approved: true }), 'none');
    assert.equal(clientScopeMode({ serverScoped: true, dataScope: 'ownContractor', approved: true }), 'none');
  });
  it('гость/неподтверждённый — всегда блок, даже через сервер', () => {
    assert.equal(clientScopeMode({ serverScoped: true, dataScope: 'none', approved: true }), 'block');
    assert.equal(clientScopeMode({ serverScoped: true, dataScope: 'all', approved: false }), 'block');
  });
  it('без сервера Platform 2.0 — старый клиентский фильтр', () => {
    assert.equal(clientScopeMode({ serverScoped: false, dataScope: 'ownProjectOrOwnRecords', approved: true }), 'client');
  });
});

describe('P2-0025 этап 2: число запросов нового телефона при разном лимите строк сервера', () => {
  it('3000 проверок: без потерь при любом лимите; ≤ 40 запросов — при лимите ≥ 4000 (при 1000 — ограничено лимитом)', async () => {
    const { ids, items, photos } = bigDataset();
    const OPTS = { batchSize: PULL_BATCH_SIZE, pageSize: 5000, concurrency: PULL_CONCURRENCY };
    const table = {};
    for (const cap of [1000, 2000, 3000, 4000, 5000]) {
      const si = slowServer(items, { maxRows: cap });
      const sp = slowServer(photos, { maxRows: cap });
      const gi = await pullPagedByIds(si.fetchPage, ids, OPTS);
      const gp = await pullPagedByIds(sp.fetchPage, ids, OPTS);
      assert.equal(new Set(gi.map(r => r.id)).size, 53325, `пункты при лимите ${cap}`);
      assert.equal(new Set(gp.map(r => r.id)).size, 3864, `фото при лимите ${cap}`);
      table[cap] = Math.ceil(3000 / Math.min(500, cap)) + 1 + si.st.calls + sp.st.calls;
    }
    console.log('  [замер] запросов на 3000 проверок по лимиту сервера:', JSON.stringify(table));
    assert.ok(table[1000] > 40, 'при 1000 цель недостижима без серверной выдачи пачкой');
    assert.ok(table[4000] <= 40 && table[5000] <= 40);
    // меньше запросов при лимите 1000 нельзя: одних пунктов 53 325 → не меньше 54 страниц
    assert.ok(table[1000] >= Math.ceil(53325 / 1000));
  });
});

describe('P2-0025 этап 3: выдача пунктов по ключу (id > последнего), ТД №167', () => {
  // подставной сервер: in(inspection_id) + id > afterId + order id + limit, лимит строк сервера; mutate(n) — изменить строки перед n-м запросом
  function keysetServer(rows, { maxRows = Infinity, mutate = null } = {}) {
    const st = { calls: 0 };
    const fetchPage = async (ids, from, to, first, afterId) => {
      st.calls++;
      if (mutate) mutate(st.calls, rows);
      const set = new Set(ids);
      let m = rows.filter(r => set.has(r.inspection_id)).sort((a, b) => (a.id < b.id ? -1 : 1));
      const count = m.length;
      if (afterId != null) m = m.filter(r => r.id > afterId);
      return { data: m.slice(0, Math.min(to - from + 1, maxRows)), count: first ? count : null };
    };
    return { fetchPage, st };
  }
  const ids = Array.from({ length: 10 }, (_, i) => 'i' + i);
  const mkRows = () => { const r = []; for (let k = 0; k < 600; k++) r.push({ id: 'r' + String(k * 10).padStart(5, '0'), inspection_id: ids[k % 10] }); return r; };

  it('вставка строки в начало пачки между страницами — без повторов и без пропусков старых строк', async () => {
    const rows = mkRows();
    const srv = keysetServer(rows, { maxRows: 100, mutate: (n, rs) => { if (n === 2) rs.push({ id: 'r00001', inspection_id: 'i0' }); } });
    const got = await pullPagedByIds(srv.fetchPage, ids, { batchSize: 10, pageSize: 5000, keyset: true });
    const gotIds = got.map(r => r.id);
    assert.equal(new Set(gotIds).size, gotIds.length, 'без повторов');
    for (const r of mkRows()) assert.ok(gotIds.includes(r.id), 'старая строка не пропущена: ' + r.id);
  });

  it('модель смещения (как было): та же вставка даёт повтор строки', async () => {
    const rows = mkRows();
    const srv = keysetServer(rows, { maxRows: 100, mutate: (n, rs) => { if (n === 2) rs.push({ id: 'r00001', inspection_id: 'i0' }); } });
    const offsetFetch = async (ids_, from, to, first) => {
      const all = await srv.fetchPage(ids_, 0, 1e9, first, null);
      return { data: all.data.length ? (await (async () => { const set = new Set(ids_); return rows.filter(r => set.has(r.inspection_id)).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(from, Math.min(to + 1, from + 100)); })()) : [], count: first ? all.count : null };
    };
    const got = await pullPagedByIds(offsetFetch, ids, { batchSize: 10, pageSize: 5000 });
    const gotIds = got.map(r => r.id);
    assert.notEqual(new Set(gotIds).size, gotIds.length, 'по смещению — повтор');
  });

  it('удаление строки между страницами — без пропуска остальных; 53 325 пунктов при лимите 1000 — все', async () => {
    const rows = mkRows();
    const srv = keysetServer(rows, { maxRows: 100, mutate: (n, rs) => { if (n === 3) { const i = rs.findIndex(r => r.id === 'r00000'); if (i >= 0) rs.splice(i, 1); } } });
    const got = await pullPagedByIds(srv.fetchPage, ids, { batchSize: 10, pageSize: 5000, keyset: true });
    assert.equal(new Set(got.map(r => r.id)).size, 600, 'удалённая уже получена до удаления, остальные все');
    const { ids: bigIds, items } = bigDataset();
    const big = keysetServer(items, { maxRows: 1000 });
    const all = await pullPagedByIds(big.fetchPage, bigIds, { batchSize: PULL_BATCH_SIZE, pageSize: 5000, concurrency: PULL_CONCURRENCY, keyset: true });
    assert.equal(new Set(all.map(r => r.id)).size, 53325);
  });

  it('страница не продвинулась (сервер игнорирует ключ) — ошибка, а не бесконечный цикл', async () => {
    const rows = mkRows();
    const bad = async (ids_, from, to, first) => { const set = new Set(ids_); return { data: rows.filter(r => set.has(r.inspection_id)).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, 100) }; };
    await assert.rejects(pullPagedByIds(bad, ids, { batchSize: 10, pageSize: 5000, keyset: true }), /не продвинулась/);
  });
});

describe('P2-0025: одна выборка локальных записей — только при полной загрузке (ТД №166)', () => {
  it('полная загрузка > 50 — одной выборкой; обычная синхронизация (любое число) — по id', () => {
    assert.equal(useBulkLocalLookup(true, 3000), true);
    assert.equal(useBulkLocalLookup(true, 10), false);
    assert.equal(useBulkLocalLookup(false, 60), false);
    assert.equal(useBulkLocalLookup(false, 10000), false);
  });
});
