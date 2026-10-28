// Снимки этапа 4 (P2-0059): «Данные на устройстве» сейчас и с макетом «предлагаю» (mock.js) — приложение этой ветки
// на стенде tests/offline (подставной сервер, боевой отрезан). node shots.mjs <out-dir>
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start, stop } from '../../../../tests/offline/servers.mjs';
import { freshProfile, launch, open, signIn, saveMark, go } from '../../../../tests/offline/lib.mjs';
const [out] = process.argv.slice(2);
const mock = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'mock.js'), 'utf8');
const shots = [];
async function snap(page, name, state, journal) {
  if (state) await page.evaluate(([m, s, j]) => { window.__mockState = s; window.__mockJournal = j; eval(m); }, [mock, state, journal]).catch(() => {});
  await page.waitForTimeout(500);
  const f = name + '.jpg';
  await page.screenshot({ path: join(out, f), fullPage: true, type: 'jpeg', quality: 82 });
  shots.push(f);
}
for (const [width, schemes] of [[375, ['light', 'dark']], [1440, ['light', 'dark']], [768, ['light']]]) {
  const tag = 'mk59-' + width;
  freshProfile(out, tag);
  await start();
  let { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900 });
  await signIn(page);
  await page.waitForTimeout(3000);
  await ctx.close(); await stop();
  for (const scheme of schemes) {
    const s = `${width}${scheme === 'dark' ? '-dark' : ''}`;
    ({ ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900, offline: true, scheme }));
    await open(page, 9000);
    if (scheme === schemes[0]) for (const m of ['Секция 2, этаж 5', 'Секция 1', 'Секция 3, этаж 2']) await saveMark(page, m);
    await go(page, '#/settings/my/device', 4000);
    await page.waitForTimeout(16000);   // счётчик «не отправлено» пересчитывается раз в 15 с
    await snap(page, `now-device-${s}`);
    await snap(page, `new-device-${s}`, 'unsent', false);
    await snap(page, `new-journal-${s}`, 'unsent', true);
    if (scheme === 'light') await snap(page, `new-retry-${s}`, 'retry', false);
    if (scheme === 'light') await snap(page, `new-ok-${s}`, 'ok', false);
    await ctx.close();
  }
}
console.log(shots.join('\n'));
