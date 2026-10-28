// Снимки «сейчас»: «Компания → Проекты и объекты → Репин → Объекты и места» на стенде (подставные данные), во всю длину.
// node now.mjs <base-url> <out-dir>
import { chromium } from 'playwright-core';
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch();
async function shot(width, height, scheme, name, steps) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
  const page = await ctx.newPage();
  await page.route(/rbi-q\.ru/, (r) => r.abort());   // боевой сервер — никогда (данные даёт stand.js внутри страницы)
  await page.goto(base + '/#/settings/company/objects');
  await page.waitForTimeout(1500);
  await page.locator('text=Репин (Приморское ш. 441) >> visible=true').first().click();
  await page.waitForTimeout(600);
  await page.locator('text=Объекты и места >> visible=true').first().click();
  await page.waitForTimeout(800);
  if (steps) await steps(page);
  await page.waitForTimeout(500);
  if (width < 768 && !name.includes('sheet')) await page.addStyleTag({ content: '.bottom-nav{display:none!important}' });   // hideNav: на склейке во всю длину нижнее меню не висит посреди страницы
  await page.screenshot({ path: `${out}/${name}.jpg`, fullPage: !name.includes('sheet'), type: 'jpeg', quality: 80 });
  console.log('ok', name);
  await ctx.close();
}
const expand = async (page) => {
  await page.locator('[data-testid=p2-tree-toggle]').first().click(); await page.waitForTimeout(400);
  await page.locator('[data-testid=p2-tree-toggle]').nth(1).click(); await page.waitForTimeout(400);
};
const selectApt = async (page) => { await expand(page); await page.locator('[data-testid=p2-tree-open]').nth(2).click(); await page.waitForTimeout(400); };
await shot(1440, 900, 'light', 'now-tree-1440', selectApt);
await shot(1440, 900, 'dark', 'now-tree-1440-dark', selectApt);
await shot(375, 812, 'light', 'now-tree-375', expand);
await shot(375, 812, 'light', 'now-card-375', selectApt);
await shot(375, 812, 'dark', 'now-tree-375-dark', expand);
// окна-листы каждого действия
const menuOf = async (page, idx, label) => {
  await expand(page);
  await page.locator('.p2-tree__row').nth(idx).hover().catch(() => {});
  await page.locator('.p2-tree__row').nth(idx).locator('.p2-more__btn').click();
  await page.waitForTimeout(300);
  if (label) { await page.getByRole('menuitem', { name: label }).first().click().catch(async () => page.getByText(label, { exact: true }).first().click()); await page.waitForTimeout(400); }
};
await shot(1440, 900, 'light', 'now-menu-section-1440', (p) => menuOf(p, 0, null));
await shot(1440, 900, 'light', 'now-sheet-add-1440', (p) => menuOf(p, 0, 'Добавить внутрь'));
await shot(1440, 900, 'light', 'now-sheet-copy-1440', (p) => menuOf(p, 0, 'Копировать секцию'));
await shot(1440, 900, 'light', 'now-sheet-edit-1440', (p) => menuOf(p, 0, 'Изменить'));
await shot(1440, 900, 'light', 'now-sheet-remove-1440', (p) => menuOf(p, 0, 'Удалить'));
await shot(1440, 900, 'light', 'now-sheet-floors-1440', (p) => menuOf(p, 0, 'Добавить этажи'));
await shot(1440, 900, 'light', 'now-sheet-object-1440', async (p) => { await p.locator('[data-testid=op-add-object]').click(); await p.waitForTimeout(400); });
await browser.close();
