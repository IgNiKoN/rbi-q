// Снимки «предлагаю»: тот же экран стенда, область «Объекты и места» заменена макетом (mock.js). node new.mjs <base-url> <out-dir>
import { chromium } from 'playwright-core';
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch();
async function shot(width, height, scheme, state, name, full = true) {
  const phone = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  const page = await ctx.newPage();
  await page.route(/rbi-q\.ru/, (r) => r.abort());   // боевой сервер — никогда (данные даёт stand.js внутри страницы)
  await page.goto(base + '/#/settings/company/objects');
  await page.waitForTimeout(1500);
  await page.locator('text=Репин (Приморское ш. 441) >> visible=true').first().click();
  await page.waitForTimeout(600);
  await page.locator('text=Объекты и места >> visible=true').first().click();
  await page.waitForTimeout(800);
  await page.addScriptTag({ path: new URL('./mock.js', import.meta.url).pathname });
  await page.evaluate(([s, p]) => window.__mock(s, p), [state, phone]);
  await page.waitForTimeout(300);
  if (width < 768 && (typeof full === 'undefined' || full)) await page.addStyleTag({ content: '.bottom-nav{display:none!important}' });   // hideNav: на склейке во всю длину нижнее меню не висит посреди страницы
  await page.screenshot({ path: `${out}/${name}.jpg`, fullPage: full, type: 'jpeg', quality: 82 });
  console.log('ok', name);
  await ctx.close();
}
const only = process.argv[4];
const list = [
  [1440, 900, 'light', 'tree', 'new-tree-1440'], [1440, 900, 'dark', 'tree', 'new-tree-1440-dark'],
  [1440, 900, 'light', 'apt', 'new-apt-1440'], [1440, 900, 'light', 'plushover', 'new-plushover-1440'],
  [1440, 900, 'light', 'plus', 'new-plus-1440'], [1440, 900, 'light', 'rename', 'new-rename-1440'],
  [1440, 900, 'light', 'menu', 'new-menu-1440'], [1440, 900, 'light', 'paste', 'new-paste-1440'],
  [1440, 900, 'light', 'paste2', 'new-paste2-1440'], [1440, 900, 'light', 'cut', 'new-cut-1440'],
  [1440, 900, 'light', 'drag', 'new-drag-1440'], [1440, 900, 'light', 'drag2', 'new-drag2-1440'],
  [1440, 900, 'light', 'chess', 'new-chess-1440'], [1440, 900, 'dark', 'chess', 'new-chess-1440-dark'],
  [375, 812, 'light', 'tree', 'new-tree-375'], [375, 812, 'dark', 'tree', 'new-tree-375-dark'],
  [375, 812, 'light', 'sheet', 'new-sheet-375', false], [375, 812, 'light', 'menu-phone', 'new-menu-375', false],
  [375, 812, 'light', 'plus', 'new-plus-375', false], [375, 812, 'light', 'chess', 'new-chess-375'],
  [768, 1024, 'light', 'tree', 'new-tree-768'], [1920, 1080, 'light', 'tree', 'new-tree-1920']
];
for (const x of list) if (!only || x[4].includes(only)) await shot(...x);
await browser.close();
