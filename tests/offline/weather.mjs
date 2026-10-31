// P2-0059: «погоды» плохой связи для стенда test:offline. Каждая погода: вход с сетью → без сети записать 5 осмотров
// с фото → включить погоду → ждать без нажатий (время телефона проматывается по минуте) → замер: дошло ли всё ровно один
// раз, за сколько минут, сколько нажатий, были ли две отправки сразу. Таблица — weather.json в папке --out.
// Боевой сервер не используется (servers.mjs — подставной, lib.mjs отрезает rbi-q.ru).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { start, stop, net, rows, files, sends, flow, resetNet, releaseHeld, marks, log } from './servers.mjs';
import { count, freshProfile, launch, note, ok, open, signIn } from './lib.mjs';

const N = 5;               // осмотров с фото в каждой погоде
const PHOTO_BYTES = 60000; // размер фото (≈ сжатое фото пункта)
const MINUTES = 15;        // сколько минут телефона ждём «не отправлено: 0»
export const measures = [];
const BEFORE_FILE = fileURLToPath(new URL('../../ai-dev/reports/P2-0059/measure-before.json', import.meta.url));
const BEFORE = existsSync(BEFORE_FILE) ? JSON.parse(readFileSync(BEFORE_FILE, 'utf8')) : [];

/** Осмотр с одним фото пункта — как пишет экран «Осмотр» (фото в app_photos, ссылка local://). */
const savePhotoMark = (page, tag, i) => page.evaluate(async ([tag, i, size]) => {
  const S = window.RBI.services;
  const ref = 'local://p2w-' + tag + '-' + i + '-' + Date.now();
  const buf = new Uint8Array(size); for (let k = 0; k < size; k += 4096) crypto.getRandomValues(buf.subarray(k, Math.min(size, k + 4096)));
  await S.storage.put('app_photos', { id: ref, data: buf.buffer, mimeType: 'image/jpeg', sizeBytes: size });
  const r = await S.inspections.save({ id: 'p2w-' + tag + '-' + i + '-' + Date.now(), date: new Date().toISOString(), object: 'WEATHER-MARK',
    template: 'Земляные работы', status: 'done', engineer: 'Иванов Иван', state: { '1': 'bad' }, details: { '1': { comment: 'стенд' } }, photos: { '1': [ref] } });
  return r && r.id;
}, [tag, i, PHOTO_BYTES]);

/** Счётчик проходов синхронизации: проход сам рассылает «sync_started» / «sync_done» (window.syncChannel) — считаем, сколько
 *  начато и сколько шло одновременно (одинаково для кода до и после P2-0059); и сколько дольше всего горит «идёт синхронизация». */
const watchPasses = (page) => page.evaluate(() => {
  if (window.__p2w || !window.syncChannel) return;
  const w = window.__p2w = { passes: 0, active: 0, max: 0, syncingSince: 0, longest: 0 };
  const ch = window.syncChannel;
  const post = ch.postMessage.bind(ch);
  ch.postMessage = (m) => {
    if (m === 'sync_started') { w.passes++; w.active++; w.max = Math.max(w.max, w.active); }
    if (m === 'sync_done') w.active = Math.max(0, w.active - 1);
    return post(m);
  };
  setInterval(() => {
    if (window.isSyncing) { if (!w.syncingSince) w.syncingSince = Date.now(); w.longest = Math.max(w.longest, Date.now() - w.syncingSince); } else w.syncingSince = 0;
  }, 1000);
});

/** Минута телефона: пока идёт синхронизация или запрос в пути, время идёт по-настоящему (прыжок сработал бы как ограничение
 *  времени запроса, которого на настоящем телефоне не было бы); остаток минуты, когда всё стихло, — проматываем. */
const minute = async (p) => {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const busy = await p.evaluate(() => !!window.isSyncing || ((window.RbiSyncNet && window.RbiSyncNet.activity.inflight) || 0) > 0).catch(() => false);
    if (!busy) break;
    await p.waitForTimeout(1000);
  }
  const left = 60000 - (Date.now() - t0);
  if (left > 0) await p.clock.fastForward(left).catch(() => {});
};

const unsentOf = (page, ids) => page.evaluate(async (ids) => {
  const all = await window.RBI.services.inspections.getActive();
  return all.filter((r) => ids.includes(r.id) && (r.syncStatus || r.sync_status) !== 'synced').map((r) => (r.syncStatus || r.sync_status) + (r.syncBlockReason ? ':' + r.syncBlockReason : ''));
}, ids).catch((e) => ['err ' + e.message.split('\n')[0]]);

const pageNow = (page) => page.evaluate(() => Date.now()).catch(() => 0);
const passInfo = (page) => page.evaluate(() => ({ ...(window.__p2w || {}), syncing: !!window.isSyncing })).catch(() => ({}));

/** Один прогон погоды. w.apply(minute, ctx) — включает погоду на эту минуту; w.real — секунд реального времени на минуту. */
async function weather(tag, w) {
  note(`== ${tag}: ${w.title}`);
  freshProfile(out(), tag);
  resetNet();
  await start();
  const { ctx, page } = await launch(out(), tag, { width: 375, height: 812 });
  await page.clock.install();
  await signIn(page);
  await open(page, 6000);
  const pages = [page];
  if (w.tabs === 2) { const p2 = await ctx.newPage(); await p2.route(/rbi-q\.ru/, (r) => r.abort()); await open(p2, 6000); pages.push(p2); }
  for (const p of pages) await watchPasses(p);
  // первая загрузка закончилась
  for (let k = 0; k < 20 && (await passInfo(page)).syncing; k++) await page.waitForTimeout(1000);

  await ctx.setOffline(true);
  const ids = [];
  for (let i = 0; i < N; i++) ids.push(await savePhotoMark(page, tag, i).catch((e) => 'ошибка: ' + e.message));
  await page.waitForTimeout(1500);
  const u0 = await unsentOf(page, ids);
  ok(u0.length === N, `${tag}: без сети записано ${N} осмотров с фото, не отправлено: ${N}`, JSON.stringify(u0));
  for (const p of pages) await p.evaluate(() => { const w = window.__p2w; Object.assign(w, { passes: 0, max: w.active }); }).catch(() => {});

  const t0 = await pageNow(page);
  const lists0 = log.filter((l) => l.includes('/storage/v1/object/list/')).length;
  let doneAt = null; let left = u0;
  for (let m = 0; m < MINUTES; m++) {
    await w.apply(m, ctx, page);
    for (const p of pages) await minute(p);
    await page.waitForTimeout((w.real || 6) * 1000);
    left = await unsentOf(page, ids);
    const onServer = ids.filter((id) => rows.get('rbi_inspections')?.has(id)).length;
    if (!left.length && onServer === N && doneAt === null) { doneAt = (await pageNow(page)) - t0; break; }
  }
  if (w.after) await w.after(ctx, page);
  const insp = rows.get('rbi_inspections') || new Map();
  const ph = rows.get('rbi_inspection_photos') || new Map();
  const info = await Promise.all(pages.map(passInfo));
  const syncedLocal = await page.evaluate(async (ids) => (await window.RBI.services.inspections.getActive())
    .filter((r) => ids.includes(r.id) && (r.syncStatus || r.sync_status) === 'synced').map((r) => r.id), ids).catch(() => []);
  const r = {
    weather: tag, title: w.title,
    delivered: ids.filter((id) => insp.has(id)).length,
    lost: syncedLocal.filter((id) => !insp.has(id) || ![...ph.values()].some((x) => x.inspection_id === id)).length,
    photoRows: ids.filter((id) => [...ph.values()].some((x) => x.inspection_id === id)).length,
    files: [...files].filter((f) => ids.some((id) => f.includes(id))).length,
    // P2-0078: списков папки Storage (storage.search на сервере) при отправке фото — должно быть 0
    storageLists: log.filter((l) => l.includes('/storage/v1/object/list/')).length - lists0,
    minutesToZero: doneAt === null ? null : Math.round(doneAt / 6000) / 10,
    unsentLeft: left.length, unsentWhy: [...new Set(left)].slice(0, 3),
    taps: 0,
    maxSendsPerRecord: Math.max(0, ...ids.map((id) => sends.get(id) || 0)),
    passes: info.reduce((a, x) => a + (x.passes || 0), 0),
    concurrentPasses: Math.max(0, ...info.map((x) => x.max || 0)),
    concurrentInspectionPosts: flow.maxInflight,
    longestSyncingSec: Math.round(Math.max(0, ...info.map((x) => x.longest || 0)) / 1000),
    hungRequests: flow.hung
  };
  measures.push(r);
  note('замер: ' + JSON.stringify(r));
  ok(true, `${tag}: погода прошла до конца`);
  // P2-0059 этап 2: всё дошло, без потерь, двух отправок одновременно нет
  ok(r.delivered === N && r.photoRows === N && r.lost === 0, `${tag}: на сервере все ${N} осмотров с фото, потерь нет`, `${r.delivered}/${r.photoRows}/${r.lost}`);
  ok(r.concurrentPasses <= 1 && r.concurrentInspectionPosts <= 1, `${tag}: двух отправок одновременно нет`, `проходов ${r.concurrentPasses}, запросов ${r.concurrentInspectionPosts}`);
  ok(r.storageLists === 0, `${tag}: фото — без списка папки Storage (проверка одного файла)`, `списков ${r.storageLists}`);
  if (w.check) w.check(r);
  // P2-0059 этап 3: ни одна погода не хуже замера «до» (reports/P2-0059/measure-before.json)
  const was = BEFORE.find((x) => x.weather === tag);
  if (was) {
    const inf = (v) => (v === null ? Infinity : v);
    ok(inf(r.minutesToZero) <= inf(was.minutesToZero) + 0.5 && r.maxSendsPerRecord <= was.maxSendsPerRecord, `${tag}: не хуже, чем до исправлений`,
      `минут ${r.minutesToZero} (было ${was.minutesToZero}), отправок записи ${r.maxSendsPerRecord} (было ${was.maxSendsPerRecord})`);
  }
  releaseHeld();
  await ctx.close(); await stop();
  writeFileSync(join(out(), 'weather.json'), JSON.stringify(measures, null, 2));
  writeFileSync(join(out(), 'weather.md'), weatherTable(measures));
  return r;
}

/** Таблица замеров для reports/P2-0059/measure-*.md. */
export function weatherTable(list) {
  const yes = (b) => (b ? 'да' : 'нет');
  const head = '| Погода | Дошло (осмотр / фото) | Потеряно | Минут до «0» без нажатий | Не ушло (почему) | Нажатий | Отправок одной записи, макс. | Две отправки сразу | Дольше всего «Синхронизация…», с | Зависших запросов |\n|---|---|---|---|---|---|---|---|---|---|\n';
  return head + list.map((r) => `| ${r.title} | ${r.delivered}/${N} · ${r.photoRows}/${N} | ${r.lost} | ${r.minutesToZero === null ? '> ' + MINUTES : r.minutesToZero} | ${r.unsentLeft}${r.unsentWhy.length ? ' (' + r.unsentWhy.join('; ') + ')' : ''} | ${r.taps} | ${r.maxSendsPerRecord} | ${yes(r.concurrentPasses > 1 || r.concurrentInspectionPosts > 1)} (проходов ${r.concurrentPasses}, запросов ${r.concurrentInspectionPosts}) | ${r.longestSyncingSec} | ${r.hungRequests} |`).join('\n') + '\n';
}

/** P2-0059 этап 5: «Данные на устройстве» — что не ушло и почему (нет связи, нет фото, отклонено), журнал, «Скопировать отчёт»,
 *  свой журнал у другого пользователя на том же телефоне. */
async function reasons(width, scheme) {
  const tag = 'reasons' + width + (scheme === 'dark' ? '-dark' : '');
  note(`== ${tag}: что не ушло и почему, журнал`);
  freshProfile(out(), tag);
  resetNet();
  net.reject = /REJECT-MARK/;
  await start();
  const { ctx, page } = await launch(out(), tag, { width, height: width < 768 ? 812 : 900, scheme });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await signIn(page);
  await open(page, 6000);
  // с сетью: осмотр без файла фото (→ «нужно внимание») и осмотр, который сервер отклонит (→ «отклонено»)
  await page.evaluate(async () => {
    const S = window.RBI.services;
    await S.inspections.save({ id: 'att-' + Date.now(), date: new Date().toISOString(), object: 'ЖК Тестовый', template: 'Монолит', templateTitle: 'Монолит', status: 'done',
      engineer: 'Иванов Иван', state: { '1': 'bad' }, details: { '1': { name: 'Армирование' } }, photos: { '1': ['local://нет-такого-фото'] } });
    await S.inspections.save({ id: 'rej-' + Date.now(), date: new Date().toISOString(), object: 'ЖК Тестовый', location: 'REJECT-MARK', template: 'Фасад', templateTitle: 'Фасад', status: 'done', engineer: 'Иванов Иван' });
  });
  await page.evaluate(() => window.triggerSync('manual')).catch(() => {});
  for (let k = 0; k < 30; k++) { await page.waitForTimeout(1000); if (!(await page.evaluate(() => !!window.isSyncing))) break; }
  await ctx.setOffline(true);
  for (const m of ['Секция 2, этаж 5', 'Секция 1']) await page.evaluate((m) => window.RBI.services.inspections.save({ id: 'net-' + Math.random().toString(36).slice(2), date: new Date().toISOString(),
    object: 'ЖК Тестовый', section: m, template: 'Кладка', templateTitle: 'Кладка', status: 'done', engineer: 'Иванов Иван' }), m);
  await page.evaluate(() => { location.hash = '#/settings/my/device'; });
  await page.waitForTimeout(5000);
  const chips = await page.locator('[data-testid=p2-sync-item]').evaluateAll((els) => els.map((e) => e.dataset.chip));
  const head = await page.locator('[data-testid=p2-net-device]').innerText().catch(() => '');
  note('причины: ' + JSON.stringify(chips) + ' записи: ' + JSON.stringify(await page.evaluate(async () => (await window.RBI.services.inspections.getActive())
    .map((r) => [String(r.id).slice(0, 4), r.syncStatus, r.source, r.syncBlockReason || '']))) + ' 403: ' + flow.rejected);
  ok(/Нет связи · не отправлено: 3/.test(head), `${tag}: «Нет связи · не отправлено: 3»`, head.split('\n')[0]);
  ok(chips.filter((c) => c === 'net').length === 2 && chips.includes('photo') && chips.includes('bad'), `${tag}: причины — «нет связи» ×2, «нет фото», «отклонено»`, JSON.stringify(chips));
  ok(/Нет фото пункта «Армирование»/.test(head) && /Отправить без этого фото/.test(head), `${tag}: «Нет фото пункта «Армирование»» и «Отправить без этого фото»`);
  // P2-0061: «Не ушло, нужно действие» — одной группой с причинами и кнопкой «Отправить снова»
  ok(/Не ушло, нужно действие: 1/i.test(head) && /Сервер отклонил: нет прав/i.test(head) && /Отправить снова/.test(head), `${tag}: «Не ушло, нужно действие: 1 — Сервер отклонил: нет прав», «Отправить снова»`);
  const chipLabel = await page.locator('[data-testid=p2-net]').getAttribute('aria-label').catch(() => '');
  ok(chipLabel === 'Нет связи, не отправлено: 3', `${tag}: значок в шапке — то же число, что в карточке`, String(chipLabel));
  const jEnd = await page.evaluate(() => window.RbiSyncJournal.list().filter((e) => e.k === 'end').pop() || null);
  ok(!!jEnd && jEnd.attention === 1, `${tag}: «нужно внимание» за проход посчитано один раз`, JSON.stringify(jEnd));
  const jRej = await page.evaluate(() => window.RbiSyncJournal.list().some((e) => e.k === 'error' && e.rejected === 1 && /нет прав/.test(e.err || '')));
  ok(jRej, `${tag}: в журнале — «ошибка · нет прав · отклонено 1»`);
  ok(/Последняя успешная отправка: (сегодня \d\d:\d\d|ещё не было)/.test(head), `${tag}: строка «Последняя успешная отправка»`);
  await page.locator('[data-testid=p2-sync-journal] summary').click();
  await page.waitForTimeout(500);
  const jl = await page.locator('[data-testid=p2-sync-journal-list] li').count();
  ok(jl > 0, `${tag}: журнал показывает события`, String(jl));
  const journal = await page.evaluate(() => JSON.stringify(window.RbiSyncJournal.list()));
  ok(JSON.parse(journal).length <= 500 && !/Иванов|REJECT-MARK|ЖК Тестовый|Армирование|Кладка/.test(journal), `${tag}: в журнале нет текста записей и ФИО`);
  await page.locator('[data-testid=p2-sync-copy]').click();
  await page.waitForTimeout(800);
  const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const btn = await page.locator('[data-testid=p2-sync-copy]').innerText().catch(() => '');
  ok(/Журнал синхронизации RBI-Q/.test(copied) || /Отчёт скопирован/.test(btn), `${tag}: «Скопировать отчёт» даёт текст отчёта`, copied ? copied.split('\n')[0] : btn);
  ok(!/Иванов|REJECT-MARK|Армирование/.test(copied), `${tag}: в отчёте нет данных записей и ФИО`);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(wide <= 0, `${tag}: без прокрутки вбок`, String(wide));
  await page.screenshot({ path: join(out(), tag + '.jpg'), fullPage: true, type: 'jpeg', quality: 80 });
  // другой пользователь на том же телефоне — свой журнал
  await ctx.setOffline(false);
  const mine = await page.evaluate(() => window.RbiSyncJournal.list().length);
  await page.evaluate(() => window.RBI.platform2.signOut()).catch(() => {});
  await page.waitForTimeout(5000);
  await signIn(page, 'other@stand.local');
  const theirs = await page.evaluate(() => window.RbiSyncJournal.list().length).catch(() => -1);
  ok(mine > 0 && theirs >= 0 && theirs < mine, `${tag}: другой пользователь на том же телефоне не видит чужой журнал`, `свой ${mine}, у другого ${theirs}`);
  await ctx.close(); await stop();
}

/** P2-0059 доработка (З1): правка осмотра во время прохода уходит в том же проходе. */
async function editMid() {
  const tag = 'edit-mid';
  note(`== ${tag}: правка осмотра, пока идёт загрузка, уходит в том же проходе`);
  freshProfile(out(), tag);
  resetNet();
  await start();
  const { ctx, page } = await launch(out(), tag, { width: 375, height: 812 });
  await signIn(page);
  await open(page, 6000);
  for (let k = 0; k < 30 && await page.evaluate(() => !!window.isSyncing || !!window._rbiSyncEntering); k++) await page.waitForTimeout(1000);
  await watchPasses(page);
  const id = await page.evaluate(() => window.RBI.services.inspections.save({ id: 'edit-' + Date.now(), date: new Date().toISOString(), object: 'ЖК Тестовый',
    location: 'FIRST-MARK', template: 'Кладка', status: 'done', engineer: 'Иванов Иван' }).then((r) => r.id));
  net.latencyMs = 1200;   // загрузка чужого идёт долго — есть время поправить
  await page.evaluate(() => { window.__p2w.passes = 0; window.triggerSync('manual'); });
  let edited = false;
  for (let k = 0; k < 120 && !edited; k++) {
    await page.waitForTimeout(300);
    const st = await page.evaluate(async (id) => { const r = (await window.RBI.services.inspections.getActive()).find((x) => x.id === id); return { syncing: !!window.isSyncing, status: r && (r.syncStatus || r.sync_status) }; }, id);
    if (st.syncing && st.status === 'synced') {
      await page.evaluate(async (id) => { const r = (await window.RBI.services.inspections.getActive()).find((x) => x.id === id); await window.RBI.services.inspections.save({ ...r, location: 'EDIT-MARK' }); }, id);
      edited = true;
    }
  }
  ok(edited, `${tag}: осмотр ушёл в начале прохода, правка сделана, пока проход шёл`);
  for (let k = 0; k < 120 && await page.evaluate(() => !!window.isSyncing); k++) await page.waitForTimeout(500);
  const row = rows.get('rbi_inspections')?.get(id);
  const passes = await page.evaluate(() => window.__p2w.passes);
  ok(!!row && row.location === 'EDIT-MARK' && passes === 1, `${tag}: правка на сервере после того же прохода`, `на сервере «${row && row.location}», проходов ${passes}`);
  await ctx.close(); await stop();
}

/** P2-0059 доработка (З2): три запуска подряд в одной вкладке — один проход за раз, без «идёт в другой вкладке»; без Web Locks — тоже. */
async function doubleStart(locks) {
  const tag = 'double-start' + (locks ? '' : '-nolocks');
  note(`== ${tag}: три запуска подряд в одной вкладке${locks ? '' : ' (браузер без Web Locks)'}`);
  freshProfile(out(), tag);
  resetNet();
  await start();
  const { ctx, page } = await launch(out(), tag, { width: 375, height: 812 });
  await signIn(page);
  await open(page, 6000);
  for (let k = 0; k < 30 && await page.evaluate(() => !!window.isSyncing || !!window._rbiSyncEntering); k++) await page.waitForTimeout(1000);
  if (!locks) await page.evaluate(() => Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true }));
  await watchPasses(page);
  await page.evaluate(() => window.RBI.services.inspections.save({ id: 'dbl-' + Date.now(), date: new Date().toISOString(), object: 'ЖК Тестовый', location: 'DOUBLE-MARK',
    template: 'Кладка', status: 'done', engineer: 'Иванов Иван' }));
  net.latencyMs = 300;
  await page.evaluate(() => { const w = window.__p2w; w.passes = 0; w.max = 0; window.triggerSync('silent'); window.triggerSync('manual'); window.triggerSync('silent'); });
  // ждём тишины 3 с подряд (между проходом и отложенным повтором — пауза 0,3 с)
  for (let k = 0, quiet = 0; k < 240 && quiet < 6; k++) {
    await page.waitForTimeout(500);
    quiet = (await page.evaluate(() => !!window.isSyncing || !!window._rbiSyncEntering || !!window._rbiPendingSyncRetryMode)) ? 0 : quiet + 1;
  }
  const r = await page.evaluate(() => ({ max: window.__p2w.max, passes: window.__p2w.passes, busy: window.RbiSyncJournal.list().filter((e) => e.why === 'busy').length,
    lease: localStorage.getItem('rbi_sync_lease'), pass: !!(window.RbiSyncNet && window.RbiSyncNet.pass), syncing: !!window.isSyncing }));
  note('итог: ' + JSON.stringify(r));
  ok(r.max === 1 && r.passes >= 1, `${tag}: проходы — по одному (одновременно ${r.max}, всего ${r.passes})`);
  ok(r.busy === 0, `${tag}: нет ложного «идёт в другой вкладке»`);
  ok(!r.syncing && !r.pass && !r.lease, `${tag}: после прохода — «идёт синхронизация», отмена прохода и аренда сняты`, JSON.stringify({ syncing: r.syncing, pass: r.pass, lease: r.lease }));
  ok(count(marks, 'DOUBLE-MARK') >= 1 && (sends.size === 0 || Math.max(...sends.values()) === 1), `${tag}: запись ушла один раз`, String(Math.max(0, ...sends.values())));
  await ctx.close(); await stop();
}

let OUT = null;
const out = () => OUT;
const set = (o) => (ctx) => Object.assign(net, o);
const offline = (v) => (ctx) => ctx.setOffline(v);

export function weatherScenarios(outDir) {
  OUT = outDir;
  return {
    // нет сети 3 минуты, потом сеть хорошая
    'w-offline': () => weather('w-offline', { title: 'нет сети 3 мин → сеть есть', apply: (m, ctx) => offline(m < 3)(ctx) }),
    // задержка 2 с, 100 кбит/с всё время
    'w-slow': () => weather('w-slow', { title: 'медленная: задержка 2 с, 100 кбит/с', real: 14,
      apply: async (m, ctx) => { await offline(false)(ctx); set({ latencyMs: 2000, kbps: 100 })(); } }),
    // «Wi-Fi без интернета»: сеть «есть», сервер принимает и молчит 5 минут, потом отвечает
    'w-hang': () => weather('w-hang', { title: 'сеть есть, ничего не грузится 5 мин → сервер ответил',
      check: (r) => ok(r.longestSyncingSec <= 100, 'w-hang: «лже-сеть» не вешает «Синхронизация…» дольше ограничения', r.longestSyncingSec + ' с'),
      apply: async (m, ctx) => { await offline(false)(ctx); net.mode = m < 5 ? 'hang' : 'ok'; } }),
    // мигание: в каждой минуте 10 с есть / 20 с нет (реальное окно связи — 3 с из 9)
    'w-flap': () => weather('w-flap', { title: 'мигание: 10 с есть / 20 с нет', real: 1,
      check: (r) => ok(r.minutesToZero !== null && r.minutesToZero <= 10, 'w-flap: мигание — «не отправлено: 0» за ≤ 10 мин без нажатий', String(r.minutesToZero)),
      apply: async (m, ctx, page) => { await offline(false)(ctx); await page.waitForTimeout(3000); await offline(true)(ctx); await page.waitForTimeout(5000); },
      after: offline(false) }),
    // обрыв: сервер принял фото и пачку осмотров, а ответ потерялся (по одному разу)
    'w-drop': () => weather('w-drop', { title: 'обрыв посреди фото и посреди пачки (сервер принял, ответ потерян)',
      apply: async (m, ctx) => { await offline(false)(ctx); if (m === 0) net.drops = [{ re: /^POST \/storage\/v1\/object\/(?!list)/, left: 1 }, { re: /^POST \/rest\/v1\/rbi_inspections$/, left: 1 }]; } }),
    // сервер болеет: 500/503 на всё 3 минуты
    'w-5xx': () => weather('w-5xx', { title: 'ответы 503 три минуты → сервер здоров',
      apply: async (m, ctx) => { await offline(false)(ctx); net.failLeft = m < 3 ? 100000 : 0; } }),
    // две вкладки одного устройства
    'edit-mid': editMid,
    'double-start': () => doubleStart(true),
    'double-start-nolocks': () => doubleStart(false),
    'reasons375': () => reasons(375, 'light'),
    'reasons1440-dark': () => reasons(1440, 'dark'),
    'w-tabs': () => weather('w-tabs', { title: 'две вкладки, сеть есть', tabs: 2, apply: (m, ctx) => offline(false)(ctx),
      check: (r) => ok(r.maxSendsPerRecord === 1, 'w-tabs: две вкладки — запись ушла один раз', String(r.maxSendsPerRecord)) })
  };
}
