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

async function stage4(width, height, scheme, tag) {
  const { ctx, page, errs } = await open(width, height, scheme);
  const wide = width >= 900;
  const names = () => page.locator('[data-testid=op-tree] .p2-tree__name b').allTextContents();
  await row(page, 'Секция 1').locator('[data-testid=p2-tree-toggle]').click(); await page.waitForTimeout(300);
  // 1. копировать секцию → Корпус 2 → «Вставить сюда»
  await row(page, 'Секция 1').locator('[data-testid=p2-tree-more]').click(); await page.locator('[data-testid=p2-tree-more-menu] [data-item=copy]').click(); await page.waitForTimeout(200);
  ok(/Скопировано: Секция 1/.test(await page.locator('[data-testid=op-clip]').textContent()), `${tag}: буфер «Скопировано: Секция 1 — …»`);
  await page.locator('[data-testid=op-objects] button:has-text("Корпус 2")').click();
  await page.waitForSelector('[data-testid=op-object][data-object-id] [data-testid=op-tree]'); await page.waitForTimeout(400);
  await page.locator('[data-testid=op-obj-paste]').click(); await page.waitForSelector('[data-testid=op-toast]'); await page.waitForTimeout(500);
  const n2 = await names();
  ok(n2.includes('Секция 2') && /Вставлено в «Корпус 2»/.test(await page.locator('[data-testid=op-toast]').textContent()), `${tag}: копия в Корпус 2 — «Секция 2» (${n2.slice(0, 3).join(', ')})`);
  ok(/квартир 40/.test(await page.locator('[data-testid=op-objects] button:has-text("Корпус 2")').textContent()), `${tag}: в Корпусе 2 стало 40 квартир`);
  await shot(page, `s4-paste-${tag}`, wide);
  if (!wide) { await page.locator('[data-testid=op-place-sheet] button:has-text("Закрыть")').first().click().catch(() => {}); await page.waitForTimeout(200); }
  await page.locator('[data-testid=op-undo]').click(); await page.waitForTimeout(600);
  ok(!(await names()).includes('Секция 2'), `${tag}: «Отменить» — копии нет`);
  await page.locator('[data-testid=op-clip-clear]').click();
  await page.locator('[data-testid=op-objects] button:has-text("Корпус 1")').click(); await page.waitForTimeout(400);
  await page.waitForSelector('[data-testid=op-tree]'); await page.waitForTimeout(300);
  if (await row(page, 'Секция 1').locator('[data-testid=p2-tree-toggle]').getAttribute('aria-expanded') !== 'true') { await row(page, 'Секция 1').locator('[data-testid=p2-tree-toggle]').click(); await page.waitForTimeout(300); }
  if (!wide) {
    ok(await page.locator('[draggable=true]').count() === 0, `${tag}: на телефоне перетаскивания нет`);
    await row(page, '1 этаж').locator('[data-testid=p2-tree-more]').click(); await page.waitForTimeout(200);
    const items = await page.locator('[data-testid=p2-tree-more-menu] [data-item]').evaluateAll((l) => l.map((x) => x.dataset.item));
    ok(['copy', 'cut', 'paste', 'up', 'down'].every((x) => items.includes(x)), `${tag}: меню — ${items.join(',')}`);
    await shot(page, `s4-menu-${tag}`, false);
  } else {
    // 2. клавиши: Кв. 2 — Ctrl+X, «2 этаж» — Ctrl+V, Ctrl+Z
    await row(page, '1 этаж').locator('[data-testid=p2-tree-toggle]').click(); await page.waitForTimeout(300);
    await row(page, 'Кв. 2').locator('[data-testid=p2-tree-open]').click(); await page.keyboard.press('Control+x'); await page.waitForTimeout(200);
    ok(/Вырезано: Кв. 2/.test(await page.locator('[data-testid=op-clip]').textContent()), `${tag}: Ctrl+X — «Вырезано: Кв. 2»`);
    await row(page, '2 этаж').locator('[data-testid=p2-tree-open]').click(); await page.keyboard.press('Control+v'); await page.waitForTimeout(700);
    if (await row(page, '2 этаж').locator('[data-testid=p2-tree-toggle]').getAttribute('aria-expanded') !== 'true') { await row(page, '2 этаж').locator('[data-testid=p2-tree-toggle]').click(); await page.waitForTimeout(300); }
    const kv2 = await page.locator('li[data-node-id]', { has: page.locator('.p2-tree__name b:text-is("2 этаж")') }).first().locator('li .p2-tree__name b').allTextContents();
    ok(kv2.includes('Кв. 2'), `${tag}: Ctrl+V — Кв. 2 на 2 этаже (${kv2.join(',')})`);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(700);
    const kv1 = await page.locator('li[data-node-id]', { has: page.locator('.p2-tree__name b:text-is("1 этаж")') }).first().locator('li .p2-tree__name b').allTextContents();
    ok(kv1.includes('Кв. 2'), `${tag}: Ctrl+Z — Кв. 2 снова на 1 этаже (${kv1.join(',')})`);
    // 3. перетаскивание: подсветка «внутрь» над этажом, «нельзя» над Корпусом 2 (события в странице), затем бросок настоящей мышью
    const syn = (where) => page.evaluate(async ([srcName, dstName, w]) => {
      const rowOf = (n) => [...document.querySelectorAll('.p2-tree__row')].find((r) => r.querySelector('.p2-tree__name b')?.textContent === n);
      const wait = () => new Promise((r) => setTimeout(r, 120));
      const dt = new DataTransfer();
      rowOf(srcName).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); await wait();
      if (w === 'obj') {
        const card = [...document.querySelectorAll('[data-testid=op-objects] button')].find((b) => b.textContent.includes('Корпус 2'));
        const ev = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }); card.dispatchEvent(ev); await wait();
        return { shown: !!document.querySelector('[data-testid=op-obj-no]'), allowed: ev.defaultPrevented };
      }
      const d = rowOf(dstName), r = d.getBoundingClientRect();
      const ev = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: w === 'before' ? r.top + 2 : r.top + r.height / 2 }); d.dispatchEvent(ev); await wait();
      return { cls: rowOf(dstName).className, allowed: ev.defaultPrevented };
    }, ['Кв. 3', '2 этаж', where]);
    const o1 = await syn('obj');
    ok(o1.shown && !o1.allowed, `${tag}: над Корпусом 2 — «нельзя» и подсказка, бросить нельзя`);
    await shot(page, `s4-drag-no-${tag}`);
    await page.evaluate(() => document.querySelector('.p2-tree__row[draggable=true]').dispatchEvent(new DragEvent('dragend', { bubbles: true })));
    const o2 = await syn('inside');
    ok(/is-drop-inside/.test(o2.cls) && !/is-drop-no/.test(o2.cls) && o2.allowed, `${tag}: над «2 этаж» — подсветка «внутрь» (${o2.cls})`);
    await shot(page, `s4-drag-${tag}`);
    const o3 = await page.evaluate(async () => {
      const rowOf = (n) => [...document.querySelectorAll('.p2-tree__row')].find((r) => r.querySelector('.p2-tree__name b')?.textContent === n);
      const d = rowOf('Секция 1'), r = d.getBoundingClientRect(), dt = new DataTransfer();
      const ev = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: r.top + 2 }); d.dispatchEvent(ev);
      await new Promise((x) => setTimeout(x, 120));
      return { cls: rowOf('Секция 1').className, allowed: ev.defaultPrevented, tip: document.querySelector('.p2-tree__drop-no')?.textContent || '' };
    });
    ok(/is-drop-no/.test(o3.cls) && !o3.allowed && /в этаж или секцию/.test(o3.tip), `${tag}: квартира на уровень объекта — нельзя: «${o3.tip}»`);
    await page.evaluate(() => document.querySelector('.p2-tree__row[draggable=true]').dispatchEvent(new DragEvent('dragend', { bubbles: true })));
    const src = row(page, 'Кв. 3'), dst = row(page, '2 этаж');
    const sb = await src.boundingBox(), db = await dst.boundingBox();
    await page.mouse.move(sb.x + 30, sb.y + sb.height / 2); await page.mouse.down();
    await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2, { steps: 8 }); await page.waitForTimeout(200);
    await page.mouse.up(); await page.waitForTimeout(800);
    const kv2b = await page.locator('li[data-node-id]', { has: page.locator('.p2-tree__name b:text-is("2 этаж")') }).first().locator('li .p2-tree__name b').allTextContents();
    ok(kv2b.includes('Кв. 3'), `${tag}: мышью — Кв. 3 на 2 этаже (${kv2b.join(',')})`);
    await page.locator('[data-testid=op-undo]').click(); await page.waitForTimeout(700);
    ok(await row(page, 'Кв. 3').count() === 1, `${tag}: «Отменить» после перетаскивания`);
  }
  ok(await noHScroll(page), `${tag}: нет прокрутки страницы вбок`);
  ok(errs.length === 0, `${tag}: ошибок страницы нет ${errs.join(' | ')}`);
  await ctx.close();
}

async function stage5(width, height, scheme, tag) {
  const { ctx, page, errs } = await open(width, height, scheme);
  const wide = width >= 900;
  // вторая секция — копией (сценарий владельца), затем «+ эт.» в Секции 1 — секции разной высоты
  await row(page, 'Секция 1').locator('[data-testid=p2-tree-more]').click(); await page.locator('[data-testid=p2-tree-more-menu] [data-item=dup]').click();
  await page.waitForSelector('[data-testid=op-toast]'); await page.waitForTimeout(400);
  if (!wide) { await page.locator('[data-testid=op-place-sheet] button:has-text("Закрыть")').first().click().catch(() => {}); await page.waitForTimeout(200); }
  await page.locator('[data-testid=op-view-chess]').click(); await page.waitForSelector('[data-testid=op-chess]'); await page.waitForTimeout(600);
  const secs = await page.locator('.op-chess__sec').allTextContents();
  const cells = await page.locator('[data-testid=op-chess] [data-place-id]').count();
  const card = await page.locator('[data-testid=op-objects] button:has-text("Корпус 1")').textContent();
  ok(secs.join(',') === 'Секция 1,Секция 2' && `квартир ${cells}` === (card.match(/квартир \d+/) || [''])[0], `${tag}: шахматка = дерево: ${secs.join(', ')}; клеток ${cells}, у корпуса «${(card.match(/квартир \d+/) || [''])[0]}»`);
  const rows = await page.locator('.op-chess__floor').allTextContents();
  ok(rows[0] === '5 этаж' && rows[rows.length - 1] === '1 этаж', `${tag}: этажи сверху вниз: ${rows.join(', ')}`);
  await page.locator('[data-testid=op-chess-plus-floor]').first().click(); await page.waitForTimeout(800);
  const rows2 = await page.locator('.op-chess__floor').allTextContents();
  ok(rows2[0] === '6 этаж' && await page.locator('.op-chess__none').count() === 1 && await page.locator('.op-chess__empty').count() === 1, `${tag}: «+ эт.» — «6 этаж» только в Секции 1 (пустой этаж, у Секции 2 клетки нет)`);
  if (!wide) { await page.locator('[data-testid=op-place-sheet] button:has-text("Закрыть")').first().click().catch(() => {}); await page.waitForTimeout(200); }
  await page.locator('[data-testid=op-chess] [data-place-id]').nth(5).click(); await page.waitForTimeout(300);
  const cardName = wide ? await page.locator('aside [data-testid=op-place] .op-card__head b').textContent() : await page.locator('[data-testid=op-place-sheet]').locator('h2, h3, b').first().textContent();
  ok(/кв\./i.test(cardName), `${tag}: клетка → карточка «${cardName}»`);
  await shot(page, `s5-chess-${tag}`, wide);
  ok(await noHScroll(page), `${tag}: страница не прокручивается вбок (шахматка — внутри блока)`);
  if (!wide) {
    const sc = await page.locator('[data-testid=op-chess] .op-chess__scroll').evaluate((x) => x.scrollWidth > x.clientWidth);
    ok(sc, `${tag}: шахматка листается вбок внутри блока`);
  }
  ok(errs.length === 0, `${tag}: ошибок страницы нет ${errs.join(' | ')}`);
  await ctx.close();
}
for (const [w, hh, sc, tag] of (process.env.ONE ? [[1440, 900, 'light', '1440']] : [[1440, 900, 'light', '1440'], [1440, 900, 'dark', '1440-dark'], [1920, 1080, 'light', '1920'], [1024, 768, 'light', '1024'], [768, 1024, 'light', '768'], [375, 812, 'light', '375'], [375, 812, 'dark', '375-dark']]))
  for (const [k, fn] of [['s3', stage3], ['s4', stage4], ['s5', stage5]]) if (!only || only === k) { try { await fn(w, hh, sc, tag); } catch (e) { ok(false, k + ' ' + tag + ': ' + e.message.split('\n')[0]); } }
console.log(log.join('\n'));
await browser.close();
