// P2-0058: стенд «без сети» (npm run test:offline). node tests/offline/run.mjs [сценарий …] [--out <папка>]
// Сценарии: cold375, cold1440 — холодный запуск без сети (меню, база компании) и запись без сети; rescue — «ничьи» записи общей
// базы PLATFORM2_DB; expired — устаревший вход без сети (120 с) и тихое обновление; stale14 — без связи больше 14 дней;
// invalid — сервер отозвал вход; cache — код План/Факта и «Компании» без сети не удаляется; otheruser — чужие права на устройстве;
// screen375, screen768, screen1440 — значок «Нет связи · не отправлено: N» 0 → 1 → 0, плашка, «Нужен интернет», «Данные на устройстве».
// P2-0059: w-offline, w-slow, w-hang, w-flap, w-drop, w-5xx, w-tabs — «погоды» плохой связи (weather.mjs), замер в weather.json.
// P2-0060: m-hang, m-hang375, m-revoke, m-first, m-other — права и меню сразу из памяти при зависшем сервере (menu.mjs), кадры в menu.json.
// P2-0060: v-summary375, v-summary1440, v-other, v-prefetch375, v-prefetch1440 — копия для просмотра: Сводка План/Факта без сети, чужой копии нет (view.mjs).
// P2-0060: f-field, f-manager — «Фото и PDF заранее» по роли: 300 осмотров по 3 объектам за 90 дней (files.mjs), замер в files.json.
// P2-0060: d-device, d-quality-only, d-screens — «Данные на устройстве → Офлайн по модулям» (device.mjs).
// P2-0066: r-deploy, r-middeploy, r-partial, r-tabs, r-chunk, r-requests, r-delta, r-allow, r-launch, r-return, r-queue, r-transition, r-size — «выкладка во время работы» (release.mjs), замер в release.json.
// P2-0067a: --gzip (или P2_OFFLINE_GZIP=1) — стенд отдаёт файлы приложения сжатыми, как nginx app.rbi-q.ru (servers.mjs, site.gzip).
// Нужен Chromium playwright-core (npx playwright-core install chromium). Боевой сервер не используется.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start, stop, log as apiLog, marks, mode, site, COMPANY } from './servers.mjs';
import { weatherScenarios } from './weather.mjs';
import { releaseMeasures, releaseScenarios } from './release.mjs';
import { menuScenarios, saveMenuMeasures } from './menu.mjs';
import { saveViewMeasures, viewScenarios } from './view.mjs';
import { filesScenarios, saveFilesMeasures } from './files.mjs';
import { deviceScenarios } from './device.mjs';
import { count, freshProfile, go, launch, note, ok, open, readStore, results, saveMark, signIn, state } from './lib.mjs';

const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const out = oi >= 0 ? args[oi + 1] : join(tmpdir(), 'p2-offline');
const pick = args.filter((a, i) => !a.startsWith('--') && (oi < 0 || i !== oi + 1));
if (args.includes('--gzip')) site.gzip = true;
const BASE = 'PLATFORM2_DB';
const companyDb = (db) => typeof db === 'string' && db.startsWith(BASE + '_' + COMPANY.id + '_');

/** Холодный запуск без сети: база компании, прежние осмотры; запись без сети уходит на сервер ровно 1 раз после возврата сети. */
async function cold(width, height) {
  const tag = 'cold' + width;
  note(`== ${tag}: вход с сетью → закрыть → без сети открыть заново → записать осмотр → сеть → открыть`);
  freshProfile(out, tag);
  marks.length = 0;
  await start();
  let { ctx, page } = await launch(out, tag, { width, height });
  await signIn(page);
  await saveMark(page, 'ONLINE-MARK');
  await page.waitForTimeout(3000);
  await page.reload(); await page.waitForTimeout(6000);
  const on = await state(page);
  ok(companyDb(on.db), `${tag}: с сетью база компании`, on.db);
  note('меню с сетью: ' + JSON.stringify(on.menu));
  await page.screenshot({ path: join(out, `${tag}-online.png`) });
  await ctx.close(); await stop();

  ({ ctx, page } = await launch(out, tag, { width, height, offline: true }));
  await open(page);
  const s1 = await state(page);
  note('без сети: ' + JSON.stringify({ db: s1.db, platform: s1.platform, records: s1.records, login: s1.login }));
  ok(companyDb(s1.db), `${tag}: без сети база = база компании`, s1.db);
  ok(Array.isArray(s1.records) && s1.records.includes('ONLINE-MARK'), `${tag}: без сети прежние осмотры на месте`, JSON.stringify(s1.records));
  ok(!s1.login, `${tag}: без сети нет экрана «Вход»`);
  note('меню без сети: ' + JSON.stringify(s1.menu));
  await page.screenshot({ path: join(out, `${tag}-offline.png`) });
  ok(!!s1.access && s1.access.quality === true && s1.access.construction === true && s1.access.planfact === true, `${tag}: без сети права меню — по копии (Качество, Стройконтроль, План/Факт)`, JSON.stringify(s1.access));
  ok(s1.menu.length > 1 && JSON.stringify(s1.menu) === JSON.stringify(on.menu), `${tag}: без сети меню то же, что с сетью`);
  ok(!!s1.platform && s1.platform.offline && s1.platform.companyId === COMPANY.id, `${tag}: состояние «без связи», компания из копии`);
  const id = await saveMark(page, 'OFFLINE-MARK');
  await page.waitForTimeout(1500);
  const s2 = await state(page);
  ok(companyDb(s2.db) && Array.isArray(s2.records) && s2.records.includes('OFFLINE-MARK'), `${tag}: осмотр без сети записан в базу компании`, String(id));
  const shared = await readStore(page, BASE, 'app_history');
  ok(!(shared || []).some((r) => r.object === 'OFFLINE-MARK'), `${tag}: в общей базе PLATFORM2_DB нового нет`);
  await ctx.close();

  await start();
  ({ ctx, page } = await launch(out, tag, { width, height }));
  await open(page, 15000);
  const s3 = await state(page);
  note('сеть вернулась: ' + JSON.stringify({ db: s3.db, platform: s3.platform, dirty: s3.dirty }) + ' дошло: ' + JSON.stringify(marks));
  ok(count(marks, 'OFFLINE-MARK') === 1, `${tag}: осмотр без сети дошёл до сервера ровно 1 раз`, String(count(marks, 'OFFLINE-MARK')));
  await ctx.close(); await stop();
}

/** «Ничьи» записи: засев в PLATFORM2_DB (как до P2-0058) → лист → «Перенести» → дошла 1 раз; демо — нет; повтор — без листа. */
async function rescue() {
  const tag = 'rescue';
  note(`== ${tag}: записи без связи в общей базе → лист → «Перенести и отправить»`);
  freshProfile(out, tag);
  marks.length = 0;
  await start();
  const { ctx, page } = await launch(out, tag, { width: 375, height: 812 });
  // как до P2-0058: устройство без компании (общая база PLATFORM2_DB) — приложение само пишет туда осмотры
  await open(page, 6000);
  const before = await state(page);
  ok(before.db === BASE, `${tag}: до входа открыта общая база`, before.db);
  note('записано без компании: ' + JSON.stringify([await saveMark(page, 'RESCUE-MARK'),
    await page.evaluate(() => window.RBI.services.inspections.save({ id: 'demo_rescue', date: new Date().toISOString(), object: 'DEMO-MARK', template: 'Земляные работы', status: 'done' }).then((r) => r && r.id)).catch((e) => e.message)]));
  await page.waitForTimeout(1500);
  await signIn(page);
  await page.waitForTimeout(2000);
  await page.reload(); await page.waitForTimeout(8000);
  const sheet = page.locator('[data-testid=p2-rescue]');
  ok(await sheet.isVisible().catch(() => false), `${tag}: лист «Найдено … записей» показан`);
  const items = await page.locator('[data-testid=p2-rescue-list] li').allInnerTexts().catch(() => []);
  note('в листе: ' + JSON.stringify(items));
  ok(items.length === 1 && /RESCUE-MARK/.test(items[0]) && /Осмотр/.test(items[0]), `${tag}: в списке только запись человека (демо и задачи, созданные системой, — нет)`);
  await page.click('[data-testid=p2-rescue-move]');
  await page.waitForTimeout(15000);
  const s = await state(page);
  note('после переноса: ' + JSON.stringify({ db: s.db, records: s.records, dirty: s.dirty }) + ' дошло: ' + JSON.stringify(marks));
  ok(Array.isArray(s.records) && s.records.includes('RESCUE-MARK'), `${tag}: запись видна в базе компании`);
  ok(count(marks, 'RESCUE-MARK') === 1, `${tag}: перенесённая запись дошла до сервера ровно 1 раз`, String(count(marks, 'RESCUE-MARK')));
  ok(count(marks, 'DEMO-MARK') === 0, `${tag}: демо-запись не отправлена`);
  const shared = (await readStore(page, BASE, 'app_history')) || [];
  const r1 = shared.find((r) => r.object === 'RESCUE-MARK');
  ok(!!r1 && typeof r1.p2_moved_to === 'string' && r1.p2_moved_to.startsWith(COMPANY.id), `${tag}: в PLATFORM2_DB запись осталась с пометкой «перенесена»`, r1 && r1.p2_moved_to);
  ok(shared.some((r) => r.id === 'demo_rescue' && !r.p2_moved_to), `${tag}: демо-запись осталась в PLATFORM2_DB без изменений`);
  await page.reload(); await page.waitForTimeout(8000);
  ok(!(await sheet.isVisible().catch(() => false)), `${tag}: повторное открытие — листа нет (повтор не создаёт дубль)`);
  ok(count(marks, 'RESCUE-MARK') === 1, `${tag}: после повторного открытия на сервере всё ещё 1`);
  await ctx.close(); await stop();
}


/** Вход, осмотр с сетью, второй заход; затем правка сохранённого входа (как «прошло время») и выход из браузера. */
async function prepare(tag, width, edit) {
  freshProfile(out, tag);
  marks.length = 0;
  await start();
  const { ctx, page } = await launch(out, tag, { width, height: 812 });
  await signIn(page);
  await saveMark(page, 'ONLINE-MARK');
  await page.waitForTimeout(2000);
  await page.reload(); await page.waitForTimeout(6000);
  if (edit) await page.evaluate(edit);
  await ctx.close(); await stop();
}
const expireAuth = () => { const a = JSON.parse(localStorage.getItem('platform2-auth')); a.expires_at = Math.floor(Date.now() / 1000) - 3600; localStorage.setItem('platform2-auth', JSON.stringify(a)); };

/** Устаревший вход без сети: 120 с работы без экрана «Вход»; сеть вернулась — вход обновлён без пароля. */
async function expired() {
  const tag = 'expired';
  note(`== ${tag}: вход устарел (час без приложения) → без сети открыть → 120 с → сеть`);
  await prepare(tag, 375, expireAuth);
  const { ctx, page } = await launch(out, tag, { width: 375, height: 812, offline: true });
  await open(page, 5000);
  let bad = 0, reloads = 0;
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) reloads++; });
  for (let t = 0; t < 4; t++) {
    await page.waitForTimeout(30000);
    const s = await state(page);
    note(`[${(t + 1) * 30} с] ` + JSON.stringify({ db: s.db, mode: s.platform && s.platform.mode, offline: s.platform && s.platform.offline, login: s.login, records: s.records }));
    if (s.login || !companyDb(s.db) || !s.platform || s.platform.mode !== 'email') bad++;
  }
  ok(bad === 0, `${tag}: 120 с без сети — вошёл, база компании, экрана «Вход» нет`);
  ok(reloads === 0, `${tag}: страница сама не перезагружалась`, String(reloads));
  const s0 = await state(page);
  ok(Array.isArray(s0.records) && s0.records.includes('ONLINE-MARK'), `${tag}: прежние осмотры видны`);
  note('осмотр без сети: ' + await saveMark(page, 'EXPIRED-MARK'));
  await start();
  await ctx.setOffline(false);
  const t0 = Date.now();
  let s = null, exp = 0;
  for (let i = 0; i < 18; i++) {   // до 90 с: событие «сеть есть» или повтор раз в минуту
    await page.waitForTimeout(5000);
    s = await state(page);
    exp = await page.evaluate(() => JSON.parse(localStorage.getItem('platform2-auth') || '{"expires_at":0}').expires_at - Math.floor(Date.now() / 1000));
    if (exp > 600 && s.platform && !s.platform.offline) break;
  }
  note(`сеть вернулась, через ${Math.round((Date.now() - t0) / 1000)} с: ` + JSON.stringify({ mode: s.platform && s.platform.mode, offline: s.platform && s.platform.offline, expiresIn: exp, login: s.login }));
  ok(exp > 600 && s.platform && s.platform.mode === 'email' && !s.platform.offline && !s.login, `${tag}: сеть вернулась — вход обновлён без пароля, права с сервера`);
  for (let i = 0; i < 12 && !count(marks, 'EXPIRED-MARK'); i++) await page.waitForTimeout(5000);
  note('дошло: ' + JSON.stringify(marks));
  ok(count(marks, 'EXPIRED-MARK') === 1, `${tag}: осмотр без сети ушёл на сервер ровно 1 раз в той же открытой странице`, String(count(marks, 'EXPIRED-MARK')));
  await ctx.close(); await stop();
}

/** Без связи больше 14 дней — экран «Вход» с понятным текстом; данные на устройстве целы. */
async function stale14() {
  const tag = 'stale14';
  note(`== ${tag}: последнее подтверждение сервером 15 дней назад → без сети открыть`);
  await prepare(tag, 375, () => {
    const day = 24 * 3600;
    const a = JSON.parse(localStorage.getItem('platform2-auth')); a.expires_at = Math.floor(Date.now() / 1000) - 15 * day; a.expires_in = 3600;
    localStorage.setItem('platform2-auth', JSON.stringify(a));
    for (const k of Object.keys(localStorage)) if (k.startsWith('platform2_device_access_')) {
      const c = JSON.parse(localStorage.getItem(k)); c.at = new Date(Date.now() - 15 * day * 1000).toISOString(); localStorage.setItem(k, JSON.stringify(c));
    }
  });
  const { ctx, page } = await launch(out, tag, { width: 375, height: 812, offline: true });
  await open(page, 10000);
  const s = await state(page);
  const notice = await page.locator('[data-testid=p2-login-notice]').innerText().catch(() => '');
  note('без сети: ' + JSON.stringify({ login: s.login, notice, db: s.db, qualityCompany: s.qualityCompany }));
  ok(s.login && /больше 14 дней/.test(notice) && /Данные на телефоне сохранены/.test(notice), `${tag}: экран «Вход» с текстом «Нет связи больше 14 дней…»`);
  const kept = (await readStore(page, s.db && companyDb(s.db) ? s.db : `${BASE}_${COMPANY.id}_${(s.db || '').split('_').pop()}`, 'app_history')) || [];
  ok(s.qualityCompany === COMPANY.id && companyDb(s.db), `${tag}: база компании не переключена`, s.db);
  ok(kept.some((r) => r.object === 'ONLINE-MARK'), `${tag}: осмотры на устройстве целы`);
  ok(s.authKept, `${tag}: сохранённый вход не стёрт (с сетью — без пароля, если сервер примет)`);
  await page.screenshot({ path: join(out, 'stale14-375.png') });
  await ctx.close();
}

/** Сервер отозвал вход (invalid_grant) — экран «Вход», как раньше. */
async function invalid() {
  const tag = 'invalid';
  note(`== ${tag}: вход устарел, сервер отвечает «вход недействителен»`);
  await prepare(tag, 375, expireAuth);
  mode.refresh = 'invalid_grant';
  await start();
  const { ctx, page } = await launch(out, tag, { width: 375, height: 812 });
  await open(page, 15000);
  const s = await state(page);
  note(JSON.stringify({ login: s.login, mode: s.platform && s.platform.mode, authKept: s.authKept }));
  ok(s.login && s.platform && s.platform.mode === 'none', `${tag}: экран «Вход»`);
  const notice = await page.locator('[data-testid=p2-login-notice]').count();
  ok(notice === 0, `${tag}: без текста про 14 дней (обычный вход)`);
  mode.refresh = 'ok';
  await ctx.close(); await stop();
}

/** Кэш приложения: без сети код План/Факта и «Компании» не удаляется (два запуска подряд). */
async function cache() {
  const tag = 'cache';
  note(`== ${tag}: с сетью открыть План/Факт и «Компанию» → два запуска без сети`);
  freshProfile(out, tag);
  await start();
  let { ctx, page } = await launch(out, tag, { width: 375, height: 812 });
  await signIn(page);
  for (const h of ['#/planfact', '#/settings/company/objects', '#/quality/engineer']) await go(page, h, 4000);
  await page.reload(); await page.waitForTimeout(6000);
  const census = () => page.evaluate(async () => {
    const r = { planfact: 0, company: 0 };
    for (const n of await caches.keys()) for (const q of await (await caches.open(n)).keys()) {
      if (/\/js\/dist\/planfact\//.test(q.url)) r.planfact++;
      if (/\/js\/dist\/company\//.test(q.url)) r.company++;
    }
    return r;
  }).catch(() => ({ planfact: -1, company: -1 }));
  const c0 = await census();
  note('с сетью в кэше: ' + JSON.stringify(c0));
  ok(c0.planfact > 0 && c0.company > 0, `${tag}: с сетью код План/Факта и «Компании» в кэше`);
  await ctx.close(); await stop();
  for (const n of [1, 2]) {
    ({ ctx, page } = await launch(out, tag, { width: 375, height: 812, offline: true }));
    await open(page, 10000);
    const c = await census();
    note(`без сети, запуск ${n}: ` + JSON.stringify(c));
    ok(c.planfact === c0.planfact && c.company === c0.company, `${tag}: без сети (запуск ${n}) код План/Факта и «Компании» на месте`);
    await ctx.close();
  }
}

/** Другой человек на том же устройстве: прежний вышел — его копия прав стёрта; у нового без сети — только своё. */
async function otheruser() {
  const tag = 'otheruser';
  note(`== ${tag}: вошёл А → вышел → вошёл Б (без компаний) → без сети`);
  freshProfile(out, tag);
  await start();
  let { ctx, page } = await launch(out, tag, { width: 1440, height: 900 });
  await signIn(page);
  const keysA = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('platform2_device_access_')));
  await page.evaluate(() => window.RBI.platform2.signOut());
  await page.waitForTimeout(6000);
  const after = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('platform2_device_access_')));
  ok(keysA.length === 1 && after.length === 0, `${tag}: «Выйти» стирает копию прав`, JSON.stringify({ keysA, after }));
  await signIn(page, 'other@stand.local');
  const b = await state(page);
  ok(b.platform && b.platform.mode === 'email' && b.platform.companies === 0, `${tag}: Б вошёл, компаний нет`);
  await ctx.close(); await stop();
  ({ ctx, page } = await launch(out, tag, { width: 1440, height: 900, offline: true }));
  await open(page);
  const s = await state(page);
  note('Б без сети: ' + JSON.stringify({ platform: s.platform, access: s.access, db: s.db }));
  ok(!!s.platform && s.platform.companies === 0 && !(s.access && (s.access.quality || s.access.construction)), `${tag}: Б без сети не видит прав А`);
  ok(!companyDb(s.db), `${tag}: Б без сети не открывает базу А`, s.db);
  await ctx.close();
}

/** «Нужен интернет» на экране (React-раздел или точка входа, когда код раздела не скачан). */
const needInternet = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid=co-need-internet], [data-testid=pf-need-internet], [data-testid=p2-need-internet]')]
  .some((e) => e.getClientRects().length > 0 && /Нужен интернет/.test(e.textContent)));

/** Экран без связи (макет этапа 3): плашка, значок 0 → 1 → 0 в той же странице, «Нужен интернет», строка в «Данные на устройстве». */
async function screen(width, scheme) {
  const tag = 'screen' + width + (scheme === 'dark' ? 'd' : '');
  const height = width < 768 ? 812 : width < 1280 ? 1024 : 900;
  note(`== ${tag}: без сети — значок и экраны по макету (${scheme})`);
  freshProfile(out, tag);
  marks.length = 0;
  await start();
  let { ctx, page } = await launch(out, tag, { width, height, scheme });
  await signIn(page);
  await go(page, '#/quality/engineer', 3000);
  await page.reload(); await page.waitForTimeout(6000);
  const chipOn = await page.locator('[data-testid=p2-net]').count();
  ok(chipOn === 0, `${tag}: с сетью и без неотправленного значка нет (облачко как раньше)`);
  await ctx.close(); await stop();

  ({ ctx, page } = await launch(out, tag, { width, height, offline: true, scheme }));
  await open(page, 4000);
  const banner = await page.locator('[data-testid=p2-net-banner]').innerText().catch(() => '');
  ok(/Нет связи — данные сохраняются на телефоне/.test(banner), `${tag}: плашка при запуске без связи`);
  await page.screenshot({ path: join(out, `${tag}-start.png`) });
  await page.waitForTimeout(7000);
  ok(!(await page.locator('[data-testid=p2-net-banner]').count()), `${tag}: плашка скрылась сама`);
  const chip = () => page.locator('[data-testid=p2-net]').getAttribute('aria-label').catch(() => null);
  ok((await chip()) === 'Нет связи, не отправлено: 0', `${tag}: значок «Нет связи, не отправлено: 0»`, String(await chip()));
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(wide <= 0, `${tag}: без прокрутки вбок`, String(wide));
  await saveMark(page, 'SCREEN-MARK');
  let c1 = null;
  for (let i = 0; i < 6 && c1 !== 'Нет связи, не отправлено: 1'; i++) { await page.waitForTimeout(4000); c1 = await chip(); }
  ok(c1 === 'Нет связи, не отправлено: 1', `${tag}: записал осмотр — «не отправлено: 1»`, String(c1));
  await page.screenshot({ path: join(out, `${tag}-unsent.png`) });
  await go(page, '#/settings/company/objects', 4000);
  // P2-0060: «Компанию» с интернетом не открывали — «Нужен интернет»: экраном или пометкой экрана (права раздела уже в копии)
  const coMark = await page.locator('[data-testid=p2-offline-mark]').first().innerText().catch(() => '');
  ok((await needInternet(page).catch(() => false)) || /Нужен интернет/.test(coMark), `${tag}: «Компания» — «Нужен интернет»`, coMark);
  await page.screenshot({ path: join(out, `${tag}-company.png`), fullPage: true });
  await go(page, '#/planfact', 4000);
  ok(await needInternet(page).catch(() => false), `${tag}: План/Факт — «Нужен интернет»`);
  await page.screenshot({ path: join(out, `${tag}-planfact.png`), fullPage: true });
  await page.locator('[data-testid=p2-net]').click();
  await page.waitForTimeout(3000);
  const dev = await page.locator('[data-testid=p2-net-device]').innerText().catch(() => '');
  ok(/#\/settings\/my\/device/.test(await page.evaluate(() => location.hash)) && /не отправлено: 1/.test(dev), `${tag}: нажатие на значок — «Данные на устройстве», строка «не отправлено: 1»`);
  await page.screenshot({ path: join(out, `${tag}-device.png`), fullPage: true });
  await go(page, '#/quality/engineer', 2000);
  await start();
  await ctx.setOffline(false);
  let c2 = 'x';
  for (let i = 0; i < 24 && c2 !== null; i++) { await page.waitForTimeout(5000); c2 = await page.locator('[data-testid=p2-net]').count() ? await chip() : null; }
  note('после возврата сети значок: ' + c2 + '; дошло: ' + JSON.stringify(marks));
  ok(c2 === null, `${tag}: сеть вернулась — значок исчез (не отправлено: 0)`);
  ok(count(marks, 'SCREEN-MARK') === 1, `${tag}: осмотр дошёл до сервера ровно 1 раз`, String(count(marks, 'SCREEN-MARK')));
  await ctx.close(); await stop();
}

const SCENARIOS = { cold375: () => cold(375, 812), cold1440: () => cold(1440, 900), rescue, expired, stale14, invalid, cache, otheruser,
  screen375: () => screen(375, 'light'), screen768: () => screen(768, 'light'), screen1440: () => screen(1440, 'dark'), ...weatherScenarios(out), ...releaseScenarios(out), ...menuScenarios(out), ...viewScenarios(out), ...filesScenarios(out), ...deviceScenarios(out) };
const list = pick.length ? pick : Object.keys(SCENARIOS);
for (const n of list) {
  if (!SCENARIOS[n]) { ok(false, 'нет сценария ' + n); continue; }
  try { await SCENARIOS[n](); } catch (e) { ok(false, n + ': сценарий упал', e.message.split('\n')[0]); await stop().catch(() => {}); }
}
if (site.gzip) ok(site.gzipped > 0, 'стенд со сжатием: файлы приложения отданы с content-encoding: gzip', String(site.gzipped));
const fail = results.filter((r) => r.startsWith('FAIL')).length;
const pass = results.filter((r) => r.startsWith('PASS')).length;
console.log(`\nИтог: PASS ${pass}, FAIL ${fail}. Запросов к подставному серверу: ${apiLog.length}. Журнал: ${join(out, 'report.txt')}`);
writeFileSync(join(out, 'report.txt'), results.join('\n') + `\nИтог: PASS ${pass}, FAIL ${fail}\n`);
if (releaseMeasures.length) writeFileSync(join(out, 'release.json'), JSON.stringify(releaseMeasures, null, 2));
saveMenuMeasures(out);
saveViewMeasures(out);
saveFilesMeasures(out);
process.exit(fail ? 1 : 0);
