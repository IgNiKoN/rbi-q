// Снимки этапа 5 (P2-0060): «Данные на устройстве» сейчас и с макетом «Офлайн по модулям» (mock.js) — приложение этой ветки
// на стенде tests/offline (подставной сервер, боевой отрезан). Во всю длину, «Хранилище и резервные копии» раскрыто. node shots.mjs <out-dir>
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start, stop, APP } from '../../../../tests/offline/servers.mjs';
import { freshProfile, launch, signIn, go } from '../../../../tests/offline/lib.mjs';
const [out] = process.argv.slice(2);
const mock = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'mock.js'), 'utf8');
const shots = [];
async function openStorage(page) {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('#tab-settings button, #tab-settings summary, #tab-settings [data-i18n="settings.accordion.storage"]')]
      .find((e) => /Хранилище и Резервные копии/i.test(e.textContent || ''));
    const btn = el && (el.closest('button, summary, [data-settings-action]') || el);
    if (btn) btn.click();
  }).catch(() => {});
  await page.waitForTimeout(800);
}
async function snap(page, name, state) {
  await page.evaluate(([m, s]) => { document.getElementById('p2o-mock')?.remove(); document.getElementById('p2o-dlg')?.remove();
    if (s) { window.__mockState = s; eval(m); } }, [mock, state]).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const f = name + '.jpg';
  await page.screenshot({ path: join(out, f), fullPage: !(state || '').startsWith('confirm'), type: 'jpeg', quality: 82 });
  shots.push(f);
}
await start();
for (const [width, schemes] of [[375, ['light', 'dark']], [1440, ['light', 'dark']], [768, ['light']]]) {
  const tag = 'mk60-' + width;
  freshProfile(out, tag);
  for (const scheme of schemes) {
    const { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900, scheme });
    if (scheme === schemes[0]) await signIn(page); else { await page.goto(APP + '/'); await page.waitForTimeout(8000); }
    await go(page, '#/settings/my/device', 4000);
    await openStorage(page);
    const s = `${width}${scheme === 'dark' ? '-dark' : ''}`;
    await snap(page, `now-${s}`, null);
    const states = scheme === 'light' && width !== 768 ? ['field', 'manager', 'confirm-clear', 'confirm-off'] : ['field'];
    for (const st of states) await snap(page, `new-${st}-${s}`, st);
    await ctx.close();
  }
}
await stop();
console.log(shots.join('\n'));
