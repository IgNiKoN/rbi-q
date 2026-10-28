// Что лежит в кэше приложения по модулям: после входа с сетью, после 1-го и 2-го холодного запуска без сети.
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, stop, APP } from './servers.mjs';

const out = 'out', tag = 'cache', prof = join(out, 'profile-' + tag);
rmSync(prof, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const rep = []; const note = (s) => { rep.push(s); console.log(s); };
const launch = async (offline) => {
  const ctx = await chromium.launchPersistentContext(prof, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, offline, deviceScaleFactor: 2 });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.route(/rbi-q\.ru/, (r) => r.abort());
  return { ctx, page };
};
const census = (page, label) => page.evaluate(async () => {
  const groups = { 'Качество (код)': /\/js\/modules\/quality\//, 'Стройконтроль (код)': /\/js\/modules\/construction\/|rbi-construction-/, 'СК 2.0 (код)': /construction-v2/,
    'План/Факт (код)': /\/js\/dist\/planfact\//, 'Компания (код)': /\/js\/dist\/company\//, 'Вход платформы': /\/js\/dist\/platform\//, 'Библиотеки libs/': /\/libs\//, 'Шрифты': /\/fonts\//, 'Стили': /\.css/ };
  const res = {}; let total = 0, other = 0;
  for (const name of await caches.keys()) {
    const c = await caches.open(name);
    for (const req of await c.keys()) {
      const r = await c.match(req); const n = r ? (await r.clone().arrayBuffer()).byteLength : 0; total += n;
      const g = Object.keys(groups).find((k) => groups[k].test(req.url));
      if (g) { res[g] = res[g] || { files: 0, kb: 0 }; res[g].files++; res[g].kb += Math.round(n / 1024); } else other += n;
    }
  }
  const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : {};
  return { cacheMB: +(total / 1048576).toFixed(1), otherKB: Math.round(other / 1024), groups: res, usageMB: est.usage ? +(est.usage / 1048576).toFixed(1) : null,
    idb: est.usageDetails ? +((est.usageDetails.indexedDB || 0) / 1048576).toFixed(1) : null };
}).then((s) => note(`--- ${label}: ${JSON.stringify(s)}`));
const openCheck = async (page, h) => {
  await page.evaluate((x) => { location.hash = x; }, h).catch(() => {}); await page.waitForTimeout(3500);
  return page.evaluate(() => (document.querySelector('main, #app-content, #content') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 90));
};

await start();
let { ctx, page } = await launch(false);
await page.goto(APP + '/'); await page.waitForTimeout(3000);
await page.fill('[data-testid=p2-login-email] input[name=email]', 'test@stand.local');
await page.fill('[data-testid=p2-login-email] input[name=password]', 'x12345678');
await page.click('[data-testid=p2-login-email] button[type=submit]');
await page.waitForTimeout(6000);
for (const h of ['#/quality/engineer', '#/quality/analytics', '#/construction/defects', '#/construction-v2', '#/settings/company/objects', '#/planfact', '#/quality/audit']) await openCheck(page, h);
await page.reload(); await page.waitForTimeout(6000);
await census(page, 'С СЕТЬЮ: после входа и обхода разделов');
await ctx.close(); await stop();

for (const n of [1, 2]) {
  ({ ctx, page } = await launch(true));
  await page.goto(APP + '/').catch(() => {}); await page.waitForTimeout(9000);
  await census(page, `БЕЗ СЕТИ: запуск №${n} (до открытия разделов)`);
  for (const h of ['#/quality/engineer', '#/construction/defects', '#/construction-v2', '#/planfact']) note(`  ${h}: ${await openCheck(page, h)}`);
  const errs = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.responseStatus >= 400 || e.transferSize === 0 && e.decodedBodySize === 0 && /\.js$/.test(e.name)).length).catch(() => '?');
  note(`  ресурсов без ответа: ${errs}`);
  await page.screenshot({ path: join(out, `offline-run${n}-cache.png`) });
  await ctx.close();
}
writeFileSync(join(out, 'report-cache.txt'), rep.join('\n'));
