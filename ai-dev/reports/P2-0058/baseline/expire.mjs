// Устаревший токен + нет сети: что происходит по секундам после холодного запуска. node expire.mjs <out> <w> <h> <tag>
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, stop, APP } from './servers.mjs';

const [out, W = '375', H = '812', tag = 'exp375'] = process.argv.slice(2);
const width = +W, height = +H, phone = width < 768;
const prof = join(out, 'profile-' + tag);
rmSync(prof, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const rep = []; const note = (s) => { rep.push(s); console.log(s); };
const launch = async (offline) => {
  const ctx = await chromium.launchPersistentContext(prof, { viewport: { width, height }, isMobile: phone, hasTouch: phone, offline, locale: 'ru-RU', deviceScaleFactor: phone ? 2 : 1 });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.route(/rbi-q\.ru/, (r) => r.abort());
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) note(`  [${((Date.now() - t0) / 1000).toFixed(0)} с] страница загружается заново`); });
  return { ctx, page };
};
let t0 = Date.now();
await start();
let { ctx, page } = await launch(false);
await page.goto(APP + '/'); await page.waitForTimeout(3000);
await page.fill('[data-testid=p2-login-email] input[name=email]', 'test@stand.local');
await page.fill('[data-testid=p2-login-email] input[name=password]', 'x12345678');
await page.click('[data-testid=p2-login-email] button[type=submit]');
await page.waitForTimeout(6000);
await page.evaluate(() => window.RBI.services.inspections.save({ id: 'ONLINE-MARK-1', date: new Date().toISOString(), object: 'ONLINE-MARK', template: 'Земляные работы', status: 'done' }));
await page.evaluate(() => { location.hash = '#/quality/engineer'; }); await page.waitForTimeout(3000);
await page.reload(); await page.waitForTimeout(6000);
await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('platform2-auth')); a.expires_at = Math.floor(Date.now() / 1000) - 3600; localStorage.setItem('platform2-auth', JSON.stringify(a)); });
await ctx.close(); await stop();

({ ctx, page } = await launch(true));
t0 = Date.now();
await page.goto(APP + '/').catch(() => {});
let shots = 0;
for (let i = 0; i < 26; i++) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(async () => {
    const R = window.RBI || {}; const p2 = R.platform2 && R.platform2.getState();
    let rec = null; try { rec = (await R.services.inspections.getActive()).map((r) => r.object); } catch { rec = '?'; }
    return { db: (window.RBI_DB_NAME || '').replace(/_1111.*/, '_<компания>'), mode: p2 ? p2.mode : 'ещё грузится',
      login: !!document.querySelector('#auth-gate-overlay:not(.hidden) [data-testid=p2-login]'), records: rec,
      authKept: !!localStorage.getItem('platform2-auth') };
  }).catch((e) => ({ err: e.message.split('\n')[0] }));
  note(`  [${((Date.now() - t0) / 1000).toFixed(0)} с] ${JSON.stringify(s)}`);
  if ((i === 0 || s.login) && shots < 2) { await page.screenshot({ path: join(out, `offline-expired-${shots ? 'later' : 'first'}-${tag}.png`) }); shots++; }
}
await page.screenshot({ path: join(out, `offline-expired-end-${tag}.png`) });
await ctx.close();
writeFileSync(join(out, `report-${tag}.txt`), rep.join('\n'));
