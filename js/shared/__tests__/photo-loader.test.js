/**
 * P2-0023 этап 1: фото на экране — ленивая загрузка, адреса без лимита 80,
 * «ошибка» ≠ «нет файла», откат к облачному адресу.
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHOTO_STATE,
  selectUrlsToRelease,
  decideCloudFallback,
  stateForHttpStatus,
  cloudUrlFor,
  createConcurrencyQueue,
  createPhotoLazyLoader
} from '../../services/storage/storage-photo-loader.js';

// ---------- фейки DOM ----------
class FakeImg {
  constructor(attrs = {}) {
    this.attrs = { ...attrs };
    this.src = attrs.src || '';
    this.isConnected = true;
  }
  getAttribute(n) { return n === 'src' ? this.src : (n in this.attrs ? this.attrs[n] : null); }
  setAttribute(n, v) { if (n === 'src') this.src = String(v); else this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  matches() { return false; }
  closest() { return null; }
}

function makeDoc(imgs) {
  return {
    imgs,
    querySelectorAll(sel) {
      if (sel === 'img[data-local-src]') return imgs.filter(i => i.isConnected && i.getAttribute('data-local-src'));
      const m = /data-photo-state="(\w+)"/.exec(sel);
      if (m) return imgs.filter(i => i.getAttribute('data-photo-state') === m[1]);
      if (sel.includes('blob:')) return imgs.filter(i => i.isConnected && String(i.src).startsWith('blob:'));
      return [];
    }
  };
}

// IntersectionObserver: видимость задаёт тест через visible(img)
function makeIO(visible) {
  const all = [];
  class IO {
    constructor(cb, opts) { this.cb = cb; this.opts = opts; this.targets = new Set(); all.push(this); }
    observe(t) {
      if (this.targets.has(t)) return;
      this.targets.add(t);
      queueMicrotask(() => {
        if (!this.targets.has(t)) return;
        this.cb([{ target: t, isIntersecting: visible(t) }], this);
      });
    }
    unobserve(t) { this.targets.delete(t); }
    disconnect() { this.targets.clear(); }
    fire(t, isIntersecting) { if (this.targets.has(t)) this.cb([{ target: t, isIntersecting }], this); }
  }
  return { IO, all };
}

const flush = () => new Promise(r => setTimeout(r, 5));

// ---------- чистые функции ----------
describe('selectUrlsToRelease', () => {
  it('не трогает адрес, который сейчас на экране', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ key: 'k' + i, url: 'blob:' + i, touchedAt: i }));
    const out = selectUrlsToRelease({ entries, inUse: new Set(['blob:0', 'blob:1']), now: 1e9, graceMs: 0, targetSize: 0 });
    assert.ok(!out.includes('k0') && !out.includes('k1'));
    assert.equal(out.length, 8);
  });
  it('не отзывает выданные недавно (ещё не вставлены в DOM)', () => {
    const entries = [{ key: 'old', url: 'blob:a', touchedAt: 0 }, { key: 'fresh', url: 'blob:b', touchedAt: 990 }];
    assert.deepEqual(selectUrlsToRelease({ entries, inUse: new Set(), now: 1000, graceMs: 100, targetSize: 0 }), ['old']);
  });
  it('ниже лимита — ничего не отзывает; выше — самые давние первыми', () => {
    const entries = [{ key: 'b', url: 'u2', touchedAt: 2 }, { key: 'a', url: 'u1', touchedAt: 1 }, { key: 'c', url: 'u3', touchedAt: 3 }];
    assert.deepEqual(selectUrlsToRelease({ entries, inUse: new Set(), now: 100, graceMs: 0, targetSize: 3 }), []);
    assert.deepEqual(selectUrlsToRelease({ entries, inUse: new Set(), now: 100, graceMs: 0, targetSize: 1 }), ['a', 'b']);
  });
});

describe('decideCloudFallback / stateForHttpStatus / cloudUrlFor', () => {
  it('нет облачного адреса → missing; нет сети → offline; иначе fetch', () => {
    assert.equal(decideCloudFallback({ cloudUrl: '', online: true }), PHOTO_STATE.MISSING);
    assert.equal(decideCloudFallback({ cloudUrl: 'local://x', online: true }), PHOTO_STATE.MISSING);
    assert.equal(decideCloudFallback({ cloudUrl: 'https://s/x.jpg', online: false }), PHOTO_STATE.OFFLINE);
    assert.equal(decideCloudFallback({ cloudUrl: 'https://s/x.jpg', online: true }), 'fetch');
  });
  it('404 — файла нет в облаке; 500/429 — временная ошибка (повторить)', () => {
    assert.equal(stateForHttpStatus(200), PHOTO_STATE.OK);
    assert.equal(stateForHttpStatus(404), PHOTO_STATE.MISSING);
    assert.equal(stateForHttpStatus(400), PHOTO_STATE.MISSING);
    assert.equal(stateForHttpStatus(500), PHOTO_STATE.ERROR);
    assert.equal(stateForHttpStatus(429), PHOTO_STATE.ERROR);
  });
  it('local:// с записью-псевдонимом ведёт на облачный адрес', () => {
    assert.equal(cloudUrlFor('https://a/b.jpg', null), 'https://a/b.jpg');
    assert.equal(cloudUrlFor('local://x', { aliasOf: 'https://a/b.jpg' }), 'https://a/b.jpg');
    assert.equal(cloudUrlFor('local://x', { source_url: 'https://a/c.jpg' }), 'https://a/c.jpg');
    assert.equal(cloudUrlFor('local://x', { sourceUrl: '' }), '');
    assert.equal(cloudUrlFor('local://x', null), '');
  });
});

describe('createConcurrencyQueue', () => {
  it('одновременно не больше max', async () => {
    const q = createConcurrencyQueue(4);
    let active = 0, peak = 0;
    const jobs = Array.from({ length: 20 }, () => q.run(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 2));
      active--;
    }));
    await Promise.all(jobs);
    assert.equal(peak, 4);
  });
  it('ошибка одной задачи не останавливает очередь', async () => {
    const q = createConcurrencyQueue(1);
    const a = q.run(async () => { throw new Error('x'); }).catch(() => 'failed');
    const b = q.run(async () => 'ok');
    assert.deepEqual(await Promise.all([a, b]), ['failed', 'ok']);
  });
});

// ---------- ленивый загрузчик ----------
describe('createPhotoLazyLoader', () => {
  const ph = (st) => 'ph:' + st;

  it('грузит только видимые фото, невидимые ждут прокрутки', async () => {
    const imgs = Array.from({ length: 150 }, (_, i) => new FakeImg({ 'data-local-src': 'local://p' + i, 'data-prefer-thumb': '1' }));
    const visibleSet = new Set(imgs.slice(0, 6));
    const { IO, all } = makeIO(t => visibleSet.has(t));
    const calls = [];
    const loader = createPhotoLazyLoader({
      resolve: async (ref, opts) => { calls.push([ref, opts]); return { state: 'ok', url: 'blob:' + ref }; },
      placeholderFor: ph, IntersectionObserver: IO, document: makeDoc(imgs)
    });
    await loader.hydrate();
    assert.equal(calls.length, 6);
    assert.deepEqual(calls[0][1], { preferThumb: true });
    assert.equal(imgs[0].src, 'blob:local://p0');
    assert.equal(imgs[0].getAttribute('data-local-src'), null);
    assert.equal(imgs[0].getAttribute('data-photo-ref'), 'local://p0');
    // прокрутка: 100-е фото появилось на экране
    all[0].fire(imgs[100], true);
    await flush();
    assert.equal(imgs[100].src, 'blob:local://p100');
    assert.equal(calls.length, 7);
  });

  it('ошибка → «нажмите, чтобы повторить», повтор загружает', async () => {
    const img = new FakeImg({ 'data-local-src': 'https://s/a.jpg' });
    const { IO } = makeIO(() => true);
    let fail = true;
    const loader = createPhotoLazyLoader({
      resolve: async () => (fail ? { state: 'error' } : { state: 'ok', url: 'blob:a' }),
      placeholderFor: ph, IntersectionObserver: IO, document: makeDoc([img])
    });
    await loader.hydrate();
    assert.equal(img.src, 'ph:error');
    assert.equal(img.getAttribute('data-photo-state'), 'error');
    fail = false;
    await loader.retry(img);
    assert.equal(img.src, 'blob:a');
    assert.equal(img.getAttribute('data-photo-state'), null);
  });

  it('исключение в resolve — это ошибка, а не «нет файла»', async () => {
    const img = new FakeImg({ 'data-local-src': 'local://z' });
    const { IO } = makeIO(() => true);
    const loader = createPhotoLazyLoader({
      resolve: async () => { throw new Error('IDB busy'); },
      placeholderFor: ph, IntersectionObserver: IO, document: makeDoc([img])
    });
    await loader.hydrate();
    assert.equal(img.getAttribute('data-photo-state'), 'error');
  });

  it('нет сети → «загрузится при подключении», после online догружается', async () => {
    const img = new FakeImg({ 'data-local-src': 'https://s/b.jpg' });
    const { IO } = makeIO(() => true);
    let online = false;
    const loader = createPhotoLazyLoader({
      resolve: async () => (online ? { state: 'ok', url: 'blob:b' } : { state: 'offline' }),
      placeholderFor: ph, IntersectionObserver: IO, document: makeDoc([img])
    });
    await loader.hydrate();
    assert.equal(img.src, 'ph:offline');
    online = true;
    loader.retryState('offline');
    await flush();
    assert.equal(img.src, 'blob:b');
  });

  it('фото дальше 2500 px отдаёт адрес и догружается при возврате; рядом за краем — нет', async () => {
    const near = new FakeImg({ 'data-local-src': 'local://near' });
    const far = new FakeImg({ 'data-local-src': 'local://far' });
    near.rect = { top: 900, bottom: 1000 };   // чуть ниже края окна — не трогаем
    far.rect = { top: 4000, bottom: 4100 };   // далеко
    [near, far].forEach(i => { i.getBoundingClientRect = () => i.rect; });
    const { IO, all } = makeIO(() => true);
    let n = 0;
    const loader = createPhotoLazyLoader({
      resolve: async (ref) => ({ state: 'ok', url: 'blob:' + ref + '#' + (++n) }),
      placeholderFor: ph, IntersectionObserver: IO, document: makeDoc([near, far]),
      viewportHeight: () => 800
    });
    await loader.hydrate();
    assert.ok(near.src.startsWith('blob:') && far.src.startsWith('blob:'));
    assert.equal(loader.unloadFar(2500), 1);
    assert.ok(near.src.startsWith('blob:'), 'фото рядом с краем не мигает');
    assert.equal(far.getAttribute('data-local-src'), 'local://far');
    assert.ok(!far.src.startsWith('blob:'));
    all[0].fire(far, true); // прокрутили обратно
    await flush();
    assert.ok(far.src.startsWith('blob:local://far'));
  });

  it('пока в очереди фото удалили со страницы — не грузим', async () => {
    const imgs = Array.from({ length: 10 }, (_, i) => new FakeImg({ 'data-local-src': 'local://q' + i }));
    const { IO } = makeIO(() => true);
    let calls = 0;
    const loader = createPhotoLazyLoader({
      resolve: async () => { calls++; await new Promise(r => setTimeout(r, 3)); return { state: 'ok', url: 'blob:q' }; },
      placeholderFor: ph, IntersectionObserver: IO, document: makeDoc(imgs), maxConcurrent: 2
    });
    loader.observeAll();
    await new Promise(r => setTimeout(r, 1));
    imgs.slice(2).forEach(i => { i.isConnected = false; });
    await new Promise(r => setTimeout(r, 30));
    assert.equal(calls, 2);
  });
});

describe('createPhotoLazyLoader: сломанное превью (P2-0032)', () => {
  it('адрес blob: перестал работать (iPhone после перехода между разделами) — превью перезагружается, не больше двух раз подряд', async () => {
    const observed = [];
    const IO = class { constructor(cb) { this.cb = cb; } observe(el) { observed.push(el); } unobserve() {} };
    const attrs = { 'data-photo-ref': 'https://x/p.jpg' };
    const img = { src: 'blob:dead', isConnected: true,
      getAttribute: (n) => (n in attrs ? attrs[n] : null), setAttribute: (n, v) => { attrs[n] = String(v); }, removeAttribute: (n) => { delete attrs[n]; } };
    const forgotten = [];
    const loader = createPhotoLazyLoader({
      resolve: async () => ({ state: 'ok', url: 'blob:new' }), placeholderFor: () => 'ph', IntersectionObserver: IO,
      document: makeDoc([]), forgetUrl: (u) => forgotten.push(u)
    });
    assert.equal(loader.heal(img), true);
    assert.equal(img.src, 'ph');
    assert.equal(attrs['data-local-src'], 'https://x/p.jpg');
    assert.deepEqual(forgotten, ['blob:dead']);
    assert.equal(observed[0], img);
    img.src = 'blob:dead2';
    assert.equal(loader.heal(img), true);
    img.src = 'blob:dead3';
    assert.equal(loader.heal(img), false, 'третья попытка подряд — не зацикливаться');
    const noRef = { src: 'blob:x', getAttribute: () => null, setAttribute() {}, removeAttribute() {} };
    assert.equal(loader.heal(noRef), false);
  });
});

// ---------- PhotoManager (с заглушками IndexedDB/сети) ----------
describe('PhotoManager', () => {
  let PM;
  const db = new Map();
  let fetchImpl;
  let pageImgs = [];

  before(async () => {
    globalThis.window = globalThis;
    globalThis.STORES = { PHOTOS: 'app_photos', STATE: 'app_state' };
    globalThis.dbGet = async (_s, id) => db.get(id) || null;
    globalThis.dbPut = async (_s, rec) => { db.set(rec.id, rec); };
    globalThis.dbDelete = async (_s, id) => { db.delete(id); };
    globalThis.arrayBufferToBlob = (buf, type) => new Blob([buf], { type });
    globalThis.blobToArrayBuffer = (b) => b.arrayBuffer();
    globalThis.rbiFetchCloudFileNoBrowserCache = (u) => fetchImpl(u);
    globalThis.document = { querySelectorAll: () => pageImgs.map(u => ({ getAttribute: (n) => (n === 'src' ? u : null) })) };
    await import('../../services/storage/storage-photo-manager.js');
    PM = globalThis.PhotoManager;
  });

  beforeEach(() => {
    db.clear();
    PM.clearMemory();
    pageImgs = [];
    fetchImpl = async () => { throw new Error('fetch не ожидался'); };
  });

  it('local:// с данными → ok; чтение не пишет в IndexedDB', async () => {
    db.set('local://a', { id: 'local://a', data: new ArrayBuffer(4), mimeType: 'image/jpeg' });
    let writes = 0;
    const put = globalThis.dbPut;
    globalThis.dbPut = async (s, r) => { writes++; return put(s, r); };
    const r = await PM.resolvePhoto('local://a');
    globalThis.dbPut = put;
    assert.equal(r.state, 'ok');
    assert.ok(r.url.startsWith('blob:'));
    assert.equal(writes, 0);
  });

  it('доработка 4: два одновременных запроса одного фото → один адрес, он не отозван', async () => {
    db.set('local://same', { id: 'local://same', data: new ArrayBuffer(4), mimeType: 'image/jpeg' });
    const [a, b] = await Promise.all([PM.resolvePhoto('local://same'), PM.resolvePhoto('local://same')]);
    assert.equal(a.state, 'ok');
    assert.equal(a.url, b.url, 'оба <img> получают один адрес');
    assert.ok(PM.activeUrls.has(a.url), 'адрес первого превью не отозван');
    assert.equal(PM.urlCount(), 1);
    // после завершения — новый запрос берётся из кэша, без нового адреса
    assert.equal((await PM.resolvePhoto('local://same')).url, a.url);
  });

  it('local:// без записи и без облака → missing (не «очищено»)', async () => {
    assert.equal((await PM.resolvePhoto('local://none')).state, 'missing');
  });

  it('local:// без данных, но с облачным адресом → берём из облака', async () => {
    db.set('local://b', { id: 'local://b', aliasOf: 'https://s/b.jpg' });
    fetchImpl = async (u) => {
      assert.equal(u, 'https://s/b.jpg');
      return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), { status: 200 });
    };
    const r = await PM.resolvePhoto('local://b');
    assert.equal(r.state, 'ok');
    assert.ok(db.get('https://s/b.jpg').data, 'облачная копия сохранена на устройство');
  });

  it('облако ответило 500 → error (повторить); сеть упала → error', async () => {
    fetchImpl = async () => new Response('x', { status: 500 });
    assert.equal((await PM.resolvePhoto('https://s/c.jpg')).state, 'error');
    fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
    assert.equal((await PM.resolvePhoto('https://s/c.jpg')).state, 'error');
    fetchImpl = async () => new Response('x', { status: 404 });
    assert.equal((await PM.resolvePhoto('https://s/c.jpg')).state, 'missing');
  });

  it('IndexedDB бросила ошибку → error, а не «нет файла»', async () => {
    const get = globalThis.dbGet;
    globalThis.dbGet = async () => { throw new Error('IDB'); };
    const r = await PM.resolvePhoto('local://x');
    globalThis.dbGet = get;
    assert.equal(r.state, 'error');
  });

  it('linkCloudToLocal оставляет псевдоним local:// → облако', async () => {
    db.set('local://d', { id: 'local://d', data: new ArrayBuffer(4), mimeType: 'image/jpeg' });
    await PM.linkCloudToLocal('local://d', 'https://s/d.jpg');
    assert.equal(db.get('local://d').aliasOf, 'https://s/d.jpg');
    assert.equal(db.get('local://d').data, undefined);
    assert.ok(db.get('https://s/d.jpg').data);
    PM.clearMemory();
    assert.equal((await PM.resolvePhoto('local://d')).state, 'ok');
  });

  it('300 фото: нет лимита 80, видимые адреса не отзываются, живых адресов ≤ лимита', async () => {
    for (let i = 0; i < 300; i++) db.set('local://p' + i, { id: 'local://p' + i, data: new ArrayBuffer(2), mimeType: 'image/jpeg' });
    const urls = [];
    for (let i = 0; i < 300; i++) urls.push((await PM.resolvePhoto('local://p' + i)).url);
    assert.equal(PM.urlCount(), 300, 'LRU-80 больше не отзывает адреса сам');
    // На экране последние 40 (пользователь в конце списка) и первые 10.
    pageImgs = urls.slice(260).concat(urls.slice(0, 10));
    Object.keys(PM._touchedAt).forEach(k => { PM._touchedAt[k] = 0; }); // пауза прошла
    PM.sweepUnusedUrls();
    assert.ok(PM.urlCount() <= PM.SOFT_URL_LIMIT, 'живых адресов ' + PM.urlCount());
    for (const u of pageImgs) assert.ok(PM.activeUrls.has(u), 'видимый адрес отозван: ' + u);
    // уход в фон: остаются только те, что на странице
    PM.sweepUnusedUrls({ force: true });
    assert.equal(PM.urlCount(), pageImgs.length);
  });

  it('этап 2: ссылки фото черновика (память + сохранённая сессия) не считаются мусором', async () => {
    globalThis.AuditState = { photos: { item1: ['local://a1', 'local://a2'], def_9: 'local://d' } };
    db.set('current_session', { id: 'current_session', key: 'current_session', photos: { item2: ['local://s1'], item3: 'https://s/x.jpg' } });
    const refs = await PM.collectDraftPhotoRefs();
    delete globalThis.AuditState;
    for (const r of ['local://a1', 'local://a2', 'local://d', 'local://s1', 'https://s/x.jpg']) assert.ok(refs.has(r), r);
    assert.ok(![...refs].some(r => r.startsWith('data:')));
  });

  it('P2-0032: адрес, который сейчас на странице, при освобождении не отзывается (iPhone рисовал бы «сломанную картинку»); ушёл со страницы — отзывается', async () => {
    const revoked = [];
    const orig = URL.revokeObjectURL;
    URL.revokeObjectURL = (u) => { revoked.push(u); };
    try {
      PM._rememberObjectUrl('k1', 'blob:shown');
      PM._rememberObjectUrl('k2', 'blob:gone');
      pageImgs = ['blob:shown'];
      PM.releaseCachedUrl('k1');
      PM.releaseCachedUrl('k2');
      assert.deepEqual(revoked, ['blob:gone']);
      assert.equal(PM.cache.k1, undefined, 'запись кэша убрана — следующий показ возьмёт фото из базы');
      pageImgs = [];
      PM.sweepUnusedUrls({ force: true });
      assert.deepEqual(revoked, ['blob:gone', 'blob:shown']);
    } finally {
      URL.revokeObjectURL = orig;
    }
  });

  it('P2-0032: forgetUrl убирает все записи кэша с этим адресом', async () => {
    PM._rememberObjectUrl('a', 'blob:z');
    PM._rememberObjectUrl('thumb:a', 'blob:z');
    PM.forgetUrl('blob:z');
    assert.equal(PM.cache.a, undefined);
    assert.equal(PM.cache['thumb:a'], undefined);
  });

  it('демо-режим: адреса не отзываются (база на устройстве отключена, фото только в памяти)', async () => {
    db.set('local://demo', { id: 'local://demo', data: new ArrayBuffer(2), mimeType: 'image/jpeg' });
    await PM.resolvePhoto('local://demo');
    globalThis.isDemoMode = true;
    try {
      assert.equal(PM.sweepUnusedUrls({ force: true }), 0);
      assert.equal(PM.urlCount(), 1);
    } finally {
      globalThis.isDemoMode = false;
    }
  });
});
