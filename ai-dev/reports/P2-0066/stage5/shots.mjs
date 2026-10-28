// Снимки этапа 5 (P2-0066): настоящая строка версии в «Настройки → Помощь и о программе» на стенде tests/offline —
// «последняя версия» и «скачана» (выкладка B на стенде), «скачивается» и «не скачалась» (сообщение кэша приложения). node shots.mjs <out-dir>
import { join } from 'node:path';
import { start, stop, site, resetSite } from '../../../../tests/offline/servers.mjs';
import { freshProfile, launch, signIn, go } from '../../../../tests/offline/lib.mjs';
import { makeRelease } from '../../../../tests/offline/release.mjs';
const [out] = process.argv.slice(2);
const A = makeRelease(join(out, 'rel-A'), 'A'), B = makeRelease(join(out, 'rel-B'), 'B');
const shots = [];
const fake = (page, d) => page.evaluate((d) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'P2_APP_UPDATE', version: '2026.11.02-1a2b3c4d', ...d } })), d);
async function snap(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, name + '.jpg'), fullPage: true, type: 'jpeg', quality: 82 }); shots.push(name + '.jpg');
}
const waitUpdate = (page) => page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update().catch(() => {});
  for (let i = 0; i < 120 && !r.waiting; i++) await new Promise((x) => setTimeout(x, 500)); return !!r.waiting; });
for (const [width, scheme] of [[375, 'light'], [375, 'dark'], [1440, 'light'], [1440, 'dark']]) {
  const tag = `sh66-${width}-${scheme}`, s = `${width}${scheme === 'dark' ? '-dark' : ''}`;
  freshProfile(out, tag); resetSite(); site.root = A;
  await start();
  const { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900, scheme });
  await signIn(page);
  await page.reload(); await page.waitForTimeout(6000);
  await go(page, '#/settings/my/help', 4000);
  await snap(page, `row-current-${s}`);
  if (scheme === 'light') {
    await fake(page, { state: 'downloading', done: 120, total: 201 }); await snap(page, `row-downloading-${s}`);
    await fake(page, { state: 'failed', reason: 'network', done: 40, total: 201 }); await snap(page, `row-failed-${s}`);
  }
  await ctx.close(); await stop();
}
// «скачана»: в той же вкладке, без перезапуска
for (const [width, scheme] of [[375, 'light'], [375, 'dark'], [1440, 'light'], [1440, 'dark']]) {
  const tag = `sh66r-${width}-${scheme}`, s = `${width}${scheme === 'dark' ? '-dark' : ''}`;
  freshProfile(out, tag); resetSite(); site.root = A;
  await start();
  const { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900, scheme });
  await signIn(page);
  await page.reload(); await page.waitForTimeout(6000);
  await go(page, '#/settings/my/help', 4000);
  site.root = B;
  await waitUpdate(page);
  await page.waitForTimeout(1500);
  await snap(page, `row-ready-${s}`);
  await ctx.close(); await stop();
}
console.log(shots.join('\n'));
