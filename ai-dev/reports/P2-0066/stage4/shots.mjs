// Снимки этапа 4 (P2-0066): «Помощь и о программе» сейчас (с плашкой «Доступно обновление») и с макетом строки версии (mock.js)
// — приложение этой ветки на стенде tests/offline (подставной сервер, боевой отрезан). node shots.mjs <out-dir>
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start, stop } from '../../../../tests/offline/servers.mjs';
import { freshProfile, launch, signIn, go } from '../../../../tests/offline/lib.mjs';
const [out] = process.argv.slice(2);
const mock = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'mock.js'), 'utf8');
const shots = [];
async function snap(page, name, state) {
  await page.evaluate(([m, s]) => {
    const b = document.getElementById('pwa-update-banner');
    if (s === 'banner') { if (b) b.style.display = 'flex'; return; }
    if (b) b.style.display = 'none';
    if (s) { window.__mockState = s; eval(m); }
  }, [mock, state]).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const f = name + '.jpg';
  await page.screenshot({ path: join(out, f), fullPage: true, type: 'jpeg', quality: 82 });
  shots.push(f);
}
await start();
for (const [width, schemes] of [[375, ['light', 'dark']], [1440, ['light', 'dark']], [768, ['light']]]) {
  const tag = 'mk66-' + width;
  freshProfile(out, tag);
  for (const scheme of schemes) {
    const { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900, scheme });
    if (scheme === schemes[0]) await signIn(page); else { await page.goto('http://localhost:8891/'); await page.waitForTimeout(8000); }
    await go(page, '#/settings/my/help', 4000);
    const s = `${width}${scheme === 'dark' ? '-dark' : ''}`;
    await snap(page, `now-help-${s}`, null);
    await snap(page, `now-banner-${s}`, 'banner');
    for (const st of scheme === 'light' ? ['current', 'downloading', 'ready', 'failed'] : ['current', 'ready']) await snap(page, `new-${st}-${s}`, st);
    await ctx.close();
  }
}
await stop();
console.log(shots.join('\n'));
