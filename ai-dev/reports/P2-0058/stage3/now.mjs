// Снимки «сейчас» (этап 3): приложение этой ветки без сети на стенде tests/offline (подставной сервер, боевой отрезан).
// node now.mjs <out-dir> [mock.js] — с mock.js те же экраны с макетом «предлагаю» (window.__mock).
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { start, stop } from '../../../../tests/offline/servers.mjs';
import { freshProfile, launch, open, signIn, saveMark, go } from '../../../../tests/offline/lib.mjs';
const [out, mockPath] = process.argv.slice(2);
const mock = mockPath ? readFileSync(mockPath, 'utf8') : '';
const pre = mock ? 'new' : 'now';
const shots = [];
async function prepare(tag, width) {
  freshProfile(out, tag);
  await start();
  const { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900 });
  await signIn(page);
  await saveMark(page, 'Секция 1, этаж 3');
  await page.waitForTimeout(2000);
  for (const h of ['#/planfact', '#/settings/company/objects', '#/quality/engineer']) await go(page, h, 3000);
  await ctx.close(); await stop();
}
async function visit(page, h, ms) {
  await go(page, h, ms);
  if (mock) { await page.reload(); await page.waitForTimeout(ms + 2500); }   // макет не должен остаться от прошлого экрана
}
async function snap(page, name, full) {
  if (mock) await page.evaluate((m) => { eval(m); }, mock).catch(() => {});
  await page.waitForTimeout(400);
  const f = `${pre}-${name}.jpg`;
  await page.screenshot({ path: join(out, f), fullPage: full, type: 'jpeg', quality: 82 });
  shots.push(f);
}
for (const [width, schemes] of [[375, ['light', 'dark']], [1440, ['light', 'dark']], [768, ['light']]]) {
  const tag = 'mk' + width;
  await prepare(tag, width);
  for (const scheme of schemes) {
    const s = `${width}${scheme === 'dark' ? '-dark' : ''}`;
    const { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900, offline: true, scheme });
    await open(page, 9000);
    await page.evaluate(() => { window.__mockState = 'start'; });
    await snap(page, `start-${s}`, false);
    await saveMark(page, 'Секция 2, этаж 5'); await page.waitForTimeout(1200);
    await visit(page, '#/quality/engineer', 2500);
    await page.evaluate(() => { window.__mockState = 'unsent'; });
    await snap(page, `unsent-${s}`, false);
    await visit(page, '#/settings/company/objects', 3500);
    await page.evaluate(() => { window.__mockState = 'company'; });
    await snap(page, `company-${s}`, true);
    await visit(page, '#/planfact', 3500);
    await page.evaluate(() => { window.__mockState = 'planfact'; });
    await snap(page, `planfact-${s}`, true);
    await visit(page, '#/settings/my/device', 3000);
    await page.evaluate(() => { window.__mockState = 'device'; });
    await snap(page, `device-${s}`, true);
    await ctx.close();
  }
}
// лист «Найдено N записей»: записи в общей базе (как до P2-0058) → вход с сетью
for (const [width, scheme] of [[375, 'light'], [375, 'dark'], [1440, 'light'], [1440, 'dark']]) {
  const tag = 'mkr' + width + scheme;
  freshProfile(out, tag);
  await start();
  const { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900, scheme });
  await open(page, 6000);
  for (const m of ['Секция 1, этаж 3', 'Секция 2, этаж 5', 'Секция 3, этаж 1']) await saveMark(page, m);
  await signIn(page);
  await page.reload(); await page.waitForTimeout(8000);
  await page.evaluate(() => { window.__mockState = 'rescue'; });
  await snap(page, `rescue-${width}${scheme === 'dark' ? '-dark' : ''}`, false);
  await ctx.close(); await stop();
}
console.log(shots.join('\n'));
