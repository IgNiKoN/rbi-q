// Проверка редактора на стенде 8860 (код ветки) + подставной сервер мест p55.js. node stage.mjs <out-dir> [only]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const out = process.argv[2], only = process.argv[3];
const p55 = readFileSync(new URL('./p55.js', import.meta.url), 'utf8');
const browser = await chromium.launch();
export const T = { timeout: 5000 };
const log = [];
const ok = (c, l) => { log.push((c ? 'PASS ' : 'FAIL ') + l); };
async function open(width, height, scheme) {
  const phone = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, isMobile: phone, hasTouch: phone });
  const page = await ctx.newPage();
  await page.route(/rbi-q\.ru/, (r) => r.abort());
  await page.addInitScript({ content: `document.addEventListener('DOMContentLoaded', function () { ${p55} });` });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8860/#/settings/company/objects');
  await page.waitForTimeout(1500);
  await page.locator('text=Репин (Приморское ш. 441) >> visible=true').first().click();
  await page.waitForTimeout(500);
  await page.locator('text=Объекты и места >> visible=true').first().click();
  await page.waitForTimeout(800);
  return { ctx, page, errs };
}
const row = (page, name) => page.locator('.p2-tree__row', { has: page.locator(`.p2-tree__name b:text-is("${name}")`) }).first();
const shot = (page, name, full = true) => page.screenshot({ path: `${out}/${name}.jpg`, fullPage: full, type: 'jpeg', quality: 80 });
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function stage3(width, height, scheme, tag) {
  const { ctx, page, errs } = await open(width, height, scheme);
  const wide = width >= 900;
  // 1. «+» у секции — без окна, новое место выбрано, плашка «Отменить»
  await row(page, 'Секция 1').locator('[data-testid=p2-tree-toggle]').click(); await page.waitForTimeout(300);
  const before = await page.locator('.p2-tree__name b').allTextContents();
  await row(page, 'Секция 1').locator('[data-testid=op-row-plus]').click(); await page.waitForTimeout(600);
  const after = await page.locator('.p2-tree__name b').allTextContents();
  const added = after.filter((x) => !before.includes(x));
  ok(added.length === 1 && /6/.test(added[0]) && await page.locator('[data-testid=op-add]').count() === 0, `${tag}: «+» у секции → «${added.join(',')}» без окна`);
  ok(await page.locator('[data-testid=op-toast]').isVisible() && /Добавлено/.test(await page.locator('[data-testid=op-toast]').textContent()), `${tag}: плашка «Добавлено … Отменить»`);
  ok(wide ? await page.locator('aside [data-testid=op-place]').isVisible() : await page.locator('[data-testid=op-place-sheet]').isVisible(), `${tag}: карточка нового места (${wide ? 'справа' : 'лист снизу'})`);
  await shot(page, `s3-plus-${tag}`, wide);
  if (!wide) { await page.locator('[data-testid=op-place-sheet] button:has-text("Закрыть")').first().click().catch(() => {}); await page.waitForTimeout(200); }
  await page.locator('[data-testid=op-undo]').click(); await page.waitForTimeout(600);
  ok(!(await page.locator('.p2-tree__name b').allTextContents()).includes(added[0]), `${tag}: «Отменить» убрало «${added[0]}»`);
  ok(await noHScroll(page), `${tag}: нет прокрутки страницы вбок`);
  if (wide) {
    // 2. правка названия в строке: занятое название → ошибка под полем, ввод сохранён; Esc
    await row(page, '2 этаж').locator('[data-testid=p2-tree-open]').dblclick(); await page.waitForTimeout(200);
    await page.locator('[data-testid=op-rename]').fill('1 этаж'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    ok(/уже есть/.test(await page.locator('[data-testid=op-rename-error]').textContent()) && await page.locator('[data-testid=op-rename]').inputValue() === '1 этаж', `${tag}: занятое название — ошибка под полем, ввод не потерян`);
    await shot(page, `s3-rename-${tag}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await row(page, '2 этаж').locator('[data-testid=p2-tree-open]').dblclick(); await page.waitForTimeout(200);
    await page.locator('[data-testid=op-rename]').fill('2 этаж (А)'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    ok(await row(page, '2 этаж (А)').count() === 1, `${tag}: переименование Enter`);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z').catch(() => {});
    await row(page, '2 этаж (А)').locator('[data-testid=p2-tree-open]').click(); await page.keyboard.press('Control+z'); await page.waitForTimeout(500);
    ok(await row(page, '2 этаж').count() === 1, `${tag}: Ctrl+Z вернул название`);
    // 3. удалить этаж → «Отменить» → ветка вернулась (с квартирами)
    await row(page, '1 этаж').locator('[data-testid=p2-tree-toggle]').click(); await page.waitForTimeout(300);
    await row(page, '1 этаж').locator('[data-testid=p2-tree-more]').click(); await page.locator('[data-testid=p2-tree-more-menu] [data-item=remove]').click(); await page.waitForTimeout(500);
    ok(await row(page, '1 этаж').count() === 0, `${tag}: этаж удалён без окна`);
    await shot(page, `s3-removed-${tag}`);
    await page.locator('[data-testid=op-undo]').click(); await page.waitForTimeout(600);
    if (await row(page, '1 этаж').locator('[data-testid=p2-tree-toggle]').getAttribute('aria-expanded') !== 'true') { await row(page, '1 этаж').locator('[data-testid=p2-tree-toggle]').click(); await page.waitForTimeout(300); }
    ok(await row(page, '1 этаж').count() === 1 && await row(page, 'Кв. 1').count() === 1, `${tag}: «Отменить» — этаж и квартиры вернулись`);
    // 4. «Ниже» в карточке
    await row(page, '1 этаж').locator('[data-testid=p2-tree-open]').click(); await page.waitForTimeout(200);
    await page.locator('[data-testid=op-c-down]').click(); await page.waitForTimeout(500);
    const floors = (await page.locator('.p2-tree__name b').allTextContents()).filter((x) => /этаж$/.test(x));
    ok(floors[0] === '2 этаж' && floors[1] === '1 этаж', `${tag}: «Ниже» — ${floors.slice(0, 3).join(', ')}`);
    await shot(page, `s3-card-${tag}`);
  }
  ok(errs.length === 0, `${tag}: ошибок страницы нет ${errs.join(' | ')}`);
  await ctx.close();
}
for (const [w, hh, sc, tag] of [[1440, 900, 'light', '1440'], [1440, 900, 'dark', '1440-dark'], [1920, 1080, 'light', '1920'], [1024, 768, 'light', '1024'], [768, 1024, 'light', '768'], [375, 812, 'light', '375'], [375, 812, 'dark', '375-dark']])
  if (!only || only === 's3') { try { await stage3(w, hh, sc, tag); } catch (e) { ok(false, tag + ': ' + e.message.split('\n')[0]); } }
console.log(log.join('\n'));
await browser.close();
