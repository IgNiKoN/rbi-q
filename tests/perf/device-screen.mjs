// P2-0073: «Настройки → Данные на устройстве» на слабом телефоне — когда появляются блоки и цифры, и сколько стоит каждый шаг подсчёта.
// Стенд «без сети» (подставной сервер, боевой не используется) + наполнение как у активного инженера: N осмотров с пунктами и фото-метаданными
// (часть не отправлена, часть отклонена сервером), копия План/Факта M МБ, реестр файлов K записей. Запуск из корня репозитория:
// node tests/perf/device-screen.mjs --cpu 6 [--width 375 | 1440] [--quality 3000] [--copy-mb 20] [--files 5000] [--out папка] [--label до|после] [--shots]
//   [--net slow3g — медленная мобильная связь (CDP: задержка 2 с, 50 КБ/с)] [--sw-delay мс — ответ сайта на sw.js задерживается (канал занят фото и «заранее»)]
//   [--unsent 25 — сколько осмотров не отправлено] [--blocked 5 — сколько отклонено сервером] [--cold — открыть «Данные на устройстве» сразу при запуске приложения (перезагрузка на этом адресе), а не переходом из раздела]
// Порты — P2_OFFLINE_APP_PORT / P2_OFFLINE_API_PORT (по умолчанию 8951 / 8952, чтобы не мешать другим стендам).
import { mkdirSync, writeFileSync } from 'node:fs';

process.env.P2_OFFLINE_APP_PORT ||= '8951';
process.env.P2_OFFLINE_API_PORT ||= '8952';
const { chromium } = await import('playwright-core');
const { start, stop, APP } = await import('../offline/servers.mjs');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const CPU = Number(opt('cpu', 6));
const WIDTH = Number(opt('width', 375));
const QUALITY_N = Number(opt('quality', 3000));
const COPY_MB = Number(opt('copy-mb', 20));
const FILES_N = Number(opt('files', 5000));
const OUT = opt('out', 'perf-out/device');
const LABEL = opt('label', 'замер');
const SHOTS = args.includes('--shots');
const NET = opt('net', '');
const SW_DELAY = Number(opt('sw-delay', 0));
const COLD = args.includes('--cold');
const UNSENT = Number(opt('unsent', 25));
const BLOCKED = Number(opt('blocked', 5));
const TAG = `${LABEL}-cpu${CPU}-w${WIDTH}${UNSENT !== 25 ? '-u' + UNSENT : ''}${BLOCKED !== 5 ? '-b' + BLOCKED : ''}${NET ? '-' + NET : ''}${SW_DELAY ? '-sw' + SW_DELAY : ''}${COLD ? '-cold' : ''}`;
const WAIT_MS = 90000;
mkdirSync(OUT, { recursive: true });

const phone = WIDTH < 768;
const browser = await chromium.launch();
await start();
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: phone ? 812 : 900 }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1, locale: 'ru-RU' });
const page = await ctx.newPage();
await page.route(/rbi-q\.ru/, (r) => r.abort());
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

// вход (стенд: тестовая почта и пароль из tests/offline/lib.mjs), без ограничения процессора
await page.goto(APP + '/'); await page.waitForTimeout(3000);
await page.fill('[data-testid=p2-login-email] input[name=email]', 'test@stand.local');
await page.fill('[data-testid=p2-login-email] input[name=password]', 'x12345678');
await page.click('[data-testid=p2-login-email] button[type=submit]');
await page.waitForTimeout(14000);   // заранее План/Факт и «Компания» скачиваются через 8–10 с после входа

// ---- наполнение устройства (прямо в базы IndexedDB, одной транзакцией на хранилище)
const seeded = await page.evaluate(async ({ N, MB, F, U, B }) => {
  const S = window.RBI.services;
  const done = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  const txDone = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  const open = (name) => done(indexedDB.open(name));
  // образец осмотра — той же функцией, что экран «Осмотр»
  const base = await S.inspections.save({ id: 'perf-base', date: new Date().toISOString(), object: 'Корпус 1', template: 'Армирование', status: 'done', engineer: 'Иванов Иван' });
  const qdb = await open(window.RBI_DB_NAME);
  const sample = await done(qdb.transaction('app_history').objectStore('app_history').get(base.id));
  const objs = ['Корпус 1', 'Корпус 2', 'Паркинг'], tpl = ['Земляные работы', 'Армирование', 'Бетонирование', 'Кладка', 'Штукатурка'];
  let tx = qdb.transaction('app_history', 'readwrite');
  let os = tx.objectStore('app_history');
  const status = { synced: 0, not_synced: 0, blocked: 0 };
  for (let i = 0; i < N; i++) {
    const state = {}, details = {}, photos = {};
    for (let p = 1; p <= 40; p++) {
      state[p] = p % 7 ? 'ok' : 'bad';
      details[p] = { comment: p % 7 ? '' : 'Замечание по пункту ' + p + ' осмотра ' + i + ': отклонение от проекта, требуется исправить до приёмки', checkedAt: new Date(Date.now() - i * 36e5).toISOString() };
      if (p % 7 === 0) photos[p] = [`https://api.rbi-q.ru/storage/v1/object/public/quality-inspection-photos/c/p/${i}-${p}-1.jpg`, `https://api.rbi-q.ru/storage/v1/object/public/quality-inspection-photos/c/p/${i}-${p}-2.jpg`];
    }
    const st = U && i % Math.floor(N / U) === 0 && status.not_synced < U ? 'not_synced' : B && i % Math.floor(N / B) === 7 && status.blocked < B ? 'blocked' : 'synced';
    status[st]++;
    os.put({ ...sample, id: 'perf-' + i, date: new Date(Date.now() - i * 36e5 * 7).toISOString(), object: objs[i % 3], template: tpl[i % 5],
      score: 60 + (i % 40), comment: 'Осмотр ' + i, state, details, photos, syncStatus: st, updatedAt: new Date(Date.now() - i * 6e4).toISOString() });
  }
  await txDone(tx);
  // реестр файлов: фото осмотров и документы Базы знаний
  tx = qdb.transaction('file_registry_cache', 'readwrite'); os = tx.objectStore('file_registry_cache');
  const key = os.keyPath;
  for (let i = 0; i < F; i++) {
    const kind = i % 10 === 0 ? 'twi_pdf' : 'inspection_photo';
    const u = `https://api.rbi-q.ru/storage/v1/object/public/quality-inspection-photos/c/p/reg-${i}.jpg`;
    os.put({ [typeof key === 'string' ? key : 'id']: 'perf-reg-' + i, id: 'perf-reg-' + i, public_url: u, cache_status: i % 3 ? 'cached_cloud' : 'cached_local', size_bytes: 150000 + (i % 50) * 1000, entity_type: kind, entity_id: 'perf-' + (i % N) });
  }
  await txDone(tx);
  qdb.close();
  // копия План/Факта: ответы сервера по 100 КБ (строки позиций), под «компания + пользователь»
  const st2 = window.RBI.platform2.getState();
  const cdb = await open('platform2_offline_copy');
  const have = await done(cdb.transaction('reads').objectStore('reads').getAll());
  const slot = have.length ? have[0].slot : null;
  let copyBytes = 0;
  if (slot) {
    tx = cdb.transaction('reads', 'readwrite'); os = tx.objectStore('reads');
    for (let k = 0; copyBytes < MB * 1048576; k++) {
      const data = [];
      for (let j = 0; j < 400; j++) data.push({ position_id: `p-${k}-${j}`, location_id: `s1f${j % 25}a${j % 12}`, location_path: `Корпус 1 · Секция ${1 + (j % 3)} · эт. ${1 + (j % 25)} · кв. ${j}`, work_type_id: 'wt' + (j % 5), work_name: 'Штукатурка стен', unit_code: 'м2', plan_qty: 60, fact_qty: j % 60 });
      const bytes = JSON.stringify(data).length;
      copyBytes += bytes;
      os.put({ id: `${slot}|planfact|perf-${k}`, slot, module: 'planfact', key: 'perf-' + k, project: 'p-1', at: new Date().toISOString(), bytes, data });
    }
    await txDone(tx);
  }
  cdb.close();
  return { inspections: N, status, files: F, copyMB: +(copyBytes / 1048576).toFixed(1), slot: !!slot, company: st2 && st2.companyId };
}, { N: QUALITY_N, MB: COPY_MB, F: FILES_N, U: UNSENT, B: BLOCKED });
console.log(JSON.stringify({ seeded }));
await page.waitForTimeout(5000);

const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
if (NET === 'slow3g') { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 2000, downloadThroughput: 50 * 1024, uploadThroughput: 25 * 1024 }); }
if (SW_DELAY) await page.route(/\/sw\.js(\?|$)/, async (r) => { if (r.request().resourceType() === 'fetch') await new Promise((res) => setTimeout(res, SW_DELAY)); return r.continue(); });

/** Открыть «Данные на устройстве» из другого раздела и записать, когда появились блоки и цифры. */
const WATCH = (cold) => {
    const t0 = cold ? 0 : performance.now();   // запуск — от начала загрузки страницы
    const at = (window.__p2dev = { t0, marks: {} }).marks;
    const seen = (k, cond) => { if (!(k in at) && cond) at[k] = Math.round(performance.now() - t0); };
    const check = () => {
      const p2 = window.RBI && window.RBI.platform2 && window.RBI.platform2.getState && window.RBI.platform2.getState();
      seen('вход почтой известен', !!p2 && p2.mode === 'email');
      const panel = document.getElementById('settings-panel-my-device');
      seen('панель', !!panel && !panel.hidden && panel.getClientRects().length > 0);
      const send = document.querySelector('#p2-net-status-slot .p2s');
      seen('«Отправка»', !!send);
      seen('«Отправка» с числом', !!send && !/считаем/i.test(send.textContent || ''));
      const mods = document.querySelector('[data-testid=p2-offline-modules]');
      seen('«Офлайн по модулям»', !!mods);
      const sw = document.querySelector('#p2o-keep-quality');
      seen('переключатель работает', !!sw && !sw.disabled);
      const total = document.querySelector('[data-testid=p2o-total]');
      seen('цифры «На телефоне»', !!total && /\d/.test(total.textContent || '') && !/считаем/i.test(total.textContent || ''));
      const pf = document.querySelector('[data-testid=p2o-size-planfact]');
      seen('размер копии План/Факта', !!pf && /Данные\s*[\d,]+\s*(КБ|МБ|ГБ)/.test(pf.textContent || '') && !/Данные\s*0 КБ/.test(pf.textContent || ''));
      if (Object.keys(at).length < 8 && performance.now() - t0 < 90000) requestAnimationFrame(check);
    };
    if (!location.hash.startsWith('#/settings/my/device')) location.hash = '#/settings/my/device';
    requestAnimationFrame(check);
};
async function measure(pass) {
  if (COLD) {
    // запуск приложения прямо на «Данные на устройстве»: отсчёт — от начала загрузки страницы
    await page.evaluate(() => { location.hash = '#/settings/my/device'; });
    if (pass === 'первый') await page.addInitScript(`addEventListener('DOMContentLoaded', () => (${WATCH.toString()})(true), { once: true })`);
    await page.reload({ waitUntil: 'commit' });
  } else {
    await page.evaluate(() => { location.hash = '#/quality'; });
    await page.waitForTimeout(4000);
    await page.evaluate(WATCH, false);
  }
  const t0 = Date.now();
  if (SHOTS) { await page.waitForTimeout(1000);
    await page.evaluate(() => { const s = document.getElementById('p2-offline-modules-slot'); if (s) s.scrollIntoView({ block: 'center' }); }).catch(() => {});
    await page.screenshot({ path: `${OUT}/${TAG}-${pass}-1s.png` }).catch(() => {}); }
  let marks = {};
  while (Date.now() - t0 < WAIT_MS) {
    await page.waitForTimeout(500);
    marks = await page.evaluate(() => (window.__p2dev || { marks: {} }).marks).catch(() => ({}));
    if (Object.keys(marks).length >= 8) break;
  }
  if (SHOTS) await page.evaluate(() => { const s = document.getElementById('p2-offline-modules-slot'); if (s) s.scrollIntoView({ block: 'center' }); }).catch(() => {});
  if (SHOTS) await page.screenshot({ path: `${OUT}/${TAG}-${pass}-end.png` }).catch(() => {});
  const texts = await page.evaluate(() => ({
    send: ((document.querySelector('#p2-net-status-slot .p2s__title') || {}).textContent || '').trim(),
    total: ((document.querySelector('[data-testid=p2o-total]') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    planfact: ((document.querySelector('[data-testid=p2o-size-planfact]') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    chip: ((document.querySelector('[data-testid=p2-net]') || {}).getAttribute?.('aria-label')) || ''
  }));
  const row = { pass, marks, texts };
  console.log(JSON.stringify(row));
  return row;
}

/** Каждый шаг подсчёта отдельно (тот же код, что у экрана: те же базы и то же правило «не отправлено»), при том же процессоре. */
async function steps() {
  return page.evaluate(async () => {
    const out = {};
    const time = async (k, f) => { const t = performance.now(); let r; try { r = await f(); } catch (e) { r = 'ошибка ' + e.message; } out[k] = { ms: Math.round(performance.now() - t), r }; };
    const done = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    const isUnsent = window.RbiSyncMergePolicy.isUnsentLocal;
    const stores = ['app_history', 'rbi_tasks', 'rbi_meetings', 'rbi_interventions', 'rbi_fmea', 'rbi_schedule_stages', 'app_reports', 'rbi_etalon_acts', 'custom_docs', 'construction_defects', 'construction_acceptance', 'construction_units'];
    const scan = async () => {
      const db = await done(indexedDB.open(window.RBI_DB_NAME));
      let n = 0;
      for (const s of stores) {
        if (!db.objectStoreNames.contains(s)) continue;
        await new Promise((res, rej) => { const rq = db.transaction(s).objectStore(s).openCursor();
          rq.onsuccess = () => { const c = rq.result; if (!c) return res(); if (isUnsent(c.value) || String(c.value.syncStatus || '') === 'blocked') n++; c.continue(); }; rq.onerror = () => rej(rq.error); });
      }
      db.close(); return n;
    };
    // порциями по 200 (P2-0073, scanPending) — то же правило
    const batch = async () => {
      const db = await done(indexedDB.open(window.RBI_DB_NAME));
      let n = 0;
      for (const s of stores) {
        if (!db.objectStoreNames.contains(s)) continue;
        let after = null;
        for (;;) {
          const part = await done(db.transaction(s).objectStore(s).getAll(after === null ? null : IDBKeyRange.lowerBound(after, true), 200));
          for (const r of part) if (isUnsent(r) || String(r.syncStatus || '') === 'blocked') n++;
          if (part.length < 200) break;
          after = part[part.length - 1].id;
        }
      }
      db.close(); return n;
    };
    // по очереди дважды: фоновые подсчёты приложения не должны достаться одному способу
    await time('все записи Качества курсором по одной (до P2-0073: listPending, затем countUnsent)', scan);
    await time('все записи Качества порциями по 200 (P2-0073: один общий проход)', batch);
    await time('то же курсором, второй раз', scan);
    await time('то же порциями, второй раз', batch);
    await time('записи устройства (факт План/Факта)', async () => (await window.RBI.deviceSend.pending()).length);
    await time('fetch sw.js (опись версии)', async () => (await (await fetch('./sw.js')).text()).length);
    await time('реестр файлов целиком (dbGetAll)', async () => (await window.dbGetAll(window.STORES.FILE_REGISTRY)).length);
    await time('navigator.storage.estimate', async () => Math.round((await navigator.storage.estimate()).usage / 1048576) + ' МБ');
    await time('размер копии План/Факта (до P2-0073 — читает всю копию)', async () => Math.round(await window.RBI.offlineCopy.size('planfact') / 1048576) + ' МБ');
    await time('размер копии «Компании» (до P2-0073 — тоже всю копию)', async () => Math.round(await window.RBI.offlineCopy.size('company') / 1024) + ' КБ');
    await time('размер копии План/Факта ещё раз', async () => Math.round(await window.RBI.offlineCopy.size('planfact') / 1048576) + ' МБ');
    return out;
  });
}

const rows = [];
for (const pass of ['первый', 'повтор']) rows.push(await measure(pass));
const breakdown = await steps();
console.log(JSON.stringify({ breakdown }));
// сверка на тех же данных: число «не отправлено» прежним правилом (курсор по всем записям, правило движка) = карточка = значок;
// размер копии на экране = сумма bytes копии этого человека
const truth = await page.evaluate(async () => {
  const done = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  const isUnsent = window.RbiSyncMergePolicy.isUnsentLocal;
  const db = await done(indexedDB.open(window.RBI_DB_NAME));
  let unsent = 0;
  for (const s of ['app_history', 'rbi_tasks', 'rbi_meetings', 'rbi_interventions', 'rbi_fmea', 'rbi_schedule_stages', 'app_reports', 'rbi_etalon_acts', 'custom_docs', 'construction_defects', 'construction_acceptance', 'construction_units']) {
    if (!db.objectStoreNames.contains(s)) continue;
    for (const r of await done(db.transaction(s).objectStore(s).getAll())) if (isUnsent(r) && !/^demo[_-]/i.test(String(r.id)) && !String(r.id).startsWith('sys_') && !r.p2_moved_to && r.type !== 'auto') unsent++;
  }
  db.close();
  const cdb = await done(indexedDB.open('platform2_offline_copy'));
  const all = await done(cdb.transaction('reads').objectStore('reads').getAll());
  cdb.close();
  const slot = all.length ? all.find((r) => r.module === 'planfact')?.slot : null;
  const copy = all.filter((r) => r.slot === slot && r.module === 'planfact').reduce((a, r) => a + (r.bytes || 0), 0);
  return { unsent, copy, size: await window.RBI.offlineCopy.size('planfact') };
});
const last = rows[rows.length - 1].texts;
const num = (t) => { const m = String(t || '').match(/не отправлено:\s*(\d+)/); return m ? Number(m[1]) : 0; };
const checks = [
  [num(last.send) === truth.unsent, `«не отправлено» на карточке = прежнее правило по всем записям`, `${num(last.send)} / ${truth.unsent}`],
  [num(last.chip) === num(last.send), `значок в шапке = карточка`, `${last.chip || 'значка нет'} / ${last.send}`],
  [truth.size === truth.copy, `размер копии План/Факта = сумма bytes копии`, `${truth.size} / ${truth.copy}`]
].map(([c, l, x]) => (c ? 'PASS ' : 'FAIL ') + l + ' — ' + x);
checks.forEach((c) => console.log(c));
const result = { label: LABEL, cpu: CPU, width: WIDTH, net: NET || 'стенд', swDelay: SW_DELAY, cold: COLD, seeded, rows, breakdown, checks, errors: [...new Set(errors)].slice(0, 20) };
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(result, null, 1));
await browser.close(); await stop();
process.exit(0);
