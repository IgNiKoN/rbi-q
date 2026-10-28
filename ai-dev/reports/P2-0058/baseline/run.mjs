// Офлайн «с нуля»: 1) с сетью — вход, разделы, один осмотр; 2) браузер закрыт, серверы выключены, без сети открыть заново;
// 3) сеть вернулась. node run.mjs <out-dir> <width> <height> <tag> [expire]
// expire — перед офлайн-запуском токен «устарел» (expires_at в прошлом), как после ночи без приложения.
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, stop, APP, log as apiLog, marks } from './servers.mjs';

const [out, W = '375', H = '812', tag = '375', expire] = process.argv.slice(2);
const width = +W, height = +H, phone = width < 768;
const prof = join(out, 'profile-' + tag);
rmSync(prof, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const report = [];
const note = (s) => { report.push(s); console.log(s); };

async function launch(offline) {
  const ctx = await chromium.launchPersistentContext(prof, { viewport: { width, height }, isMobile: phone, hasTouch: phone, offline, locale: 'ru-RU',
    deviceScaleFactor: phone ? 2 : 1 });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.route(/rbi-q\.ru/, (r) => r.abort());
  page.on('pageerror', (e) => note(`  [ошибка страницы] ${e.message.split('\n')[0]}`));
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: join(out, `${name}-${tag}.png`) });
async function state(page, label) {
  const s = await page.evaluate(async () => {
    const R = window.RBI || {};
    const p2 = R.platform2 && R.platform2.getState();
    let auth = null; try { const a = JSON.parse(localStorage.getItem('platform2-auth') || 'null'); auth = a ? { email: a.user && a.user.email, expiresIn: a.expires_at - Math.floor(Date.now() / 1000) } : null; } catch { /* */ }
    let rec = null;
    try { rec = R.services && R.services.inspections ? (await R.services.inspections.getActive()).map((r) => r.object || r.id) : null; } catch (e) { rec = 'err ' + e.message; }
    const visible = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null).map((e) => (e.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean);
    return { hash: location.hash, sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller), db: window.RBI_DB_NAME,
      qualityCompany: localStorage.getItem('platform2_quality_company'), dirty: localStorage.getItem('rbi_cloud_dirty'),
      stash: Object.keys(localStorage).filter((k) => k.startsWith('platform2_quality_state_')), auth,
      platform: p2 ? { mode: p2.mode, companies: p2.companies.length, companyId: p2.companyId } : null,
      access: R.platformMenuAccess, qualitySync: !!R.qualitySync, records: rec,
      login: !!document.querySelector('#auth-gate-overlay:not(.hidden) [data-testid=p2-login]'),
      menu: visible('.sidebar-rail a, .sidebar-rail button, #sidebar a, .rail a, aside nav a').slice(0, 12),
      text: (document.querySelector('main, #app-content, #content') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 220) };
  });
  note(`--- ${label}: ${JSON.stringify(s)}`);
  return s;
}
const go = async (page, h, ms = 3500) => { await page.evaluate((x) => { location.hash = x; }, h).catch(() => {}); await page.waitForTimeout(ms); };
const saveMark = (page, mark) => page.evaluate(async (m) => {
  const r = await window.RBI.services.inspections.save({ id: m + '-' + Date.now(), date: new Date().toISOString(), object: m, template: 'Земляные работы', status: 'done', engineer: 'Иванов Иван' });
  return r.id;
}, mark).catch((e) => 'ошибка: ' + e.message);

await start();
// 1. С сетью
let { ctx, page } = await launch(false);
await page.goto(APP + '/'); await page.waitForTimeout(3000);
await page.fill('[data-testid=p2-login-email] input[name=email]', 'test@stand.local');
await page.fill('[data-testid=p2-login-email] input[name=password]', 'x12345678');
await page.click('[data-testid=p2-login-email] button[type=submit]');
await page.waitForTimeout(6000);
await state(page, 'онлайн: после входа');
note('  осмотр с сетью: ' + await saveMark(page, 'ONLINE-MARK'));
await page.waitForTimeout(3000);
for (const h of ['#/construction-v2', '#/settings/company/objects', '#/planfact', '#/quality/engineer']) { await go(page, h); await shot(page, 'online-' + h.replace(/[#/]+/g, '_').replace(/^_/, '')); }
await page.reload(); await page.waitForTimeout(6000);   // второй заход с сетью — кэш приложения уже наполнен
await state(page, 'онлайн: повторный заход');
await shot(page, 'online-final');
if (expire) await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('platform2-auth')); a.expires_at = Math.floor(Date.now() / 1000) - 3600; localStorage.setItem('platform2-auth', JSON.stringify(a)); });
await ctx.close();
await stop();
note(`=== серверы выключены, браузер закрыт. Запросов к серверу: ${apiLog.length}; дошло до сервера: ${JSON.stringify(marks)}`);

// 2. Без сети «с нуля» (последний экран — Журнал Качества)
({ ctx, page } = await launch(true));
await page.goto(APP + '/').catch((e) => note('  goto: ' + e.message.split('\n')[0]));
await page.waitForTimeout(9000);
await state(page, 'ОФЛАЙН: холодный запуск');
await shot(page, 'offline-start');
for (const h of ['#/quality/audit', '#/construction-v2', '#/settings/company/objects', '#/planfact']) {
  await go(page, h, 4000);
  await state(page, 'ОФЛАЙН: открыт ' + h);
  await shot(page, 'offline-' + h.replace(/[#/]+/g, '_').replace(/^_/, ''));
}
if (phone) { await go(page, '#/settings', 2500); await shot(page, 'offline-settings'); }
note('  осмотр без сети: ' + await saveMark(page, 'OFFLINE-MARK'));
await page.waitForTimeout(1500);
await state(page, 'ОФЛАЙН: после записи осмотра');
await ctx.close();

// 3. Сеть вернулась
await start();
({ ctx, page } = await launch(false));
await page.goto(APP + '/'); await page.waitForTimeout(10000);
await state(page, 'СЕТЬ ВЕРНУЛАСЬ');
await shot(page, 'back-online');
await go(page, '#/quality/engineer', 3000);
await page.waitForTimeout(5000);
const left = await page.evaluate(() => new Promise((res) => {   // что лежит в «безымянной» базе PLATFORM2_DB
  const rq = indexedDB.open('PLATFORM2_DB');
  rq.onsuccess = () => { const db = rq.result; try { const t = db.transaction('app_history').objectStore('app_history').getAll(); t.onsuccess = () => res(t.result.map((r) => r.object)); t.onerror = () => res('err'); } catch (e) { res('нет хранилища: ' + e.message); } };
  rq.onerror = () => res('err');
}));
note(`  в общей базе PLATFORM2_DB лежит: ${JSON.stringify(left)}; дошло до сервера всего: ${JSON.stringify(marks)}`);
await state(page, 'СЕТЬ ВЕРНУЛАСЬ: через 8 с');
await ctx.close();
await stop();
writeFileSync(join(out, `report-${tag}.txt`), report.join('\n'));
