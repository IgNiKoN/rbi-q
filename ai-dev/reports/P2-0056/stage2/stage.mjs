// Проверка загрузки списка помещений на стенде 8860 (код ветки) + подставной сервер p55.js → p56.js. node stage.mjs <out-dir> <files-dir>
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [out, files] = process.argv.slice(2);
const p55 = readFileSync(new URL('./p55.js', import.meta.url), 'utf8'), p56 = readFileSync(new URL('./p56.js', import.meta.url), 'utf8');
const KV = readFileSync(`${files}/kvartirografiya.xlsx`), BAD = readFileSync(`${files}/s-oshibkami.xlsx`);
const browser = await chromium.launch();
const log = [];
const ok = (c, l) => { log.push((c ? 'PASS ' : 'FAIL ') + l); };
async function open(width, height, scheme) {
  const phone = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, isMobile: phone, hasTouch: phone, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.route(/rbi-q\.ru/, (r) => r.abort());
  await page.addInitScript({ content: `document.addEventListener('DOMContentLoaded', function () { ${p55}\n${p56} });` });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/rbi-q\.ru|ERR_FAILED|Failed to load resource|404\) was received when fetching the script/.test(m.text())) errs.push(m.text()); });   // стенд отдаёт 404 на sw.js
  await page.goto('http://localhost:8860/#/settings/company/objects');
  await page.waitForTimeout(1500);
  await page.locator('text=Репин (Приморское ш. 441) >> visible=true').first().click();
  await page.waitForTimeout(500);
  await page.locator('text=Объекты и места >> visible=true').first().click();
  await page.waitForTimeout(800);
  return { ctx, page, errs };
}
const shot = (page, name, full = true) => page.screenshot({ path: `${out}/${name}.jpg`, fullPage: full, type: 'jpeg', quality: 80 });
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const row = (page, name) => page.locator('.p2-tree__row', { has: page.locator(`.p2-tree__name b:text-is("${name}")`) }).first();
/** Перетащить файл с компьютера на элемент (dragenter/over → drop с DataTransfer). */
async function dropFile(page, selector, name, bytes, type, release = true) {
  await page.evaluate(async ({ selector, name, b64, type, release }) => {
    const el = document.querySelector(selector);
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bin], name, { type }));
    for (const ev of ['dragenter', 'dragover']) el.dispatchEvent(new DragEvent(ev, { bubbles: true, cancelable: true, dataTransfer: dt }));
    if (release) el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, { selector, name, b64: Buffer.from(bytes).toString('base64'), type, release });
  await page.waitForTimeout(release ? 1500 : 300);
}
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function viaMenu(page, bytes, name) {
  await page.locator('[data-testid=op-head-more]').first().click(); await page.waitForTimeout(200);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.p2-more__item:has-text("Загрузить из Excel")').click()]);
  await fc.setFiles({ name, mimeType: XLSX, buffer: bytes });
  await page.waitForTimeout(1500);
}
const sum = async (page) => (await page.locator('[data-testid=op-imp-sum]').textContent()) || '';

async function desktop(width, height, scheme, tag, full) {
  const { ctx, page, errs } = await open(width, height, scheme);
  const menuItems = async () => { await page.locator('[data-testid=op-head-more]').first().click(); await page.waitForTimeout(200);
    const t = await page.locator('.p2-more__item').allTextContents(); await page.keyboard.press('Escape'); return t.join(' | '); };
  ok(/Загрузить из Excel/.test(await menuItems()) && /Скачать шаблон/.test(await menuItems()), `${tag}: «⋯» — «Загрузить из Excel», «Скачать шаблон»`);
  // подсветка при перетаскивании файла
  await dropFile(page, '[data-testid=op-root]', 'kvartirografiya.xlsx', KV, XLSX, false);
  ok(await page.locator('[data-testid=op-drop]').isVisible(), `${tag}: файл над экраном — подсветка «Отпустите — загрузим…»`);
  if (full) await shot(page, `s2-drop-${tag}`, false);
  await page.evaluate(() => document.querySelector('[data-testid=op-root]').dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: null })));
  await page.waitForTimeout(200);
  // бросить файл — лист предпросмотра
  await dropFile(page, '[data-testid=op-root]', 'kvartirografiya.xlsx', KV, XLSX);
  ok(await page.locator('[data-testid=op-import]').isVisible(), `${tag}: брошенный .xlsx открыл лист загрузки`);
  const roles = await page.locator('[data-testid=op-imp-role]').evaluateAll((l) => l.map((s) => s.value));
  ok(roles.join(',') === 'ignore,object,section,floor,name,area,ignore,rooms,ignore', `${tag}: столбцы узнаны (${roles.join(',')})`);
  const s1 = await sum(page);
  ok(/Будет создано: 1 корпус, 2 секции, 8 этажей, 20 помещений/.test(s1) && /уже есть 19/.test(s1) && /иначе 1/.test(s1), `${tag}: итог предпросмотра (${s1})`);
  ok(/Создать 31 место/.test(await page.locator('[data-testid=op-imp-go]').textContent()), `${tag}: кнопка «Создать 31 место»`);
  const st = await page.locator('[data-testid=op-imp-rows] tbody tr').evaluateAll((l) => l.map((r) => r.dataset.status));
  ok(st.filter((x) => x === 'new').length === 20 && st.filter((x) => x === 'differs').length === 1 && st.filter((x) => x === 'exists').length === 19, `${tag}: строки «светофором» (${st.length})`);
  ok(await noHScroll(page), `${tag}: лист — без прокрутки страницы вбок`);
  if (full) await shot(page, `s2-preview-${tag}`, false);
  // поправить столбец: «Площадь жилая» → площадь (общая снимается), вернуть
  const sel = page.locator('[data-testid=op-imp-role]');
  await sel.nth(6).selectOption('area'); await page.waitForTimeout(700);
  ok((await sel.nth(5).inputValue()) === 'ignore' && !/иначе 1/.test(await sum(page)), `${tag}: столбец можно поправить — пересчёт`);
  await sel.nth(5).selectOption('area'); await page.waitForTimeout(700);
  ok(/иначе 1/.test(await sum(page)), `${tag}: вернул столбец — как было`);
  // создать
  await page.locator('[data-testid=op-imp-go]').click(); await page.waitForTimeout(1500);
  ok(await page.locator('[data-testid=op-import]').count() === 0 && /Создано 31/.test(await page.locator('[data-testid=op-toast]').textContent()), `${tag}: «Создать» → плашка «Создано 31 … Отменить»`);
  ok(await page.locator('.op-obj b:text-is("Корпус 3")').count() === 1, `${tag}: новый «Корпус 3» в списке объектов`);
  await row(page, 'Секция 1').locator('[data-testid=p2-tree-toggle]').click(); await page.waitForTimeout(400);
  const fl = await page.locator('.p2-tree__name b').allTextContents();
  ok(fl.includes('6 этаж') && fl.includes('7 этаж') && !fl.includes('эт. 1'), `${tag}: в Секции 1 появились «6 этаж», «7 этаж» — по образцу соседей (существующие не задвоились)`);
  await row(page, '6 этаж').locator('[data-testid=p2-tree-toggle]').click(); await page.waitForTimeout(400);
  const metaKv = await row(page, 'Кв. 21').textContent();
  ok(/38,4 м²/.test(metaKv) && /1к/.test(metaKv), `${tag}: в строке Кв. 21 — площадь и комнаты (${metaKv.replace(/\s+/g, ' ').slice(0, 80)})`);
  await row(page, 'Кв. 23').locator('[data-testid=p2-tree-open]').click(); await page.waitForTimeout(400);
  ok((await page.locator('[data-testid=op-c-area]').inputValue()) === '44,9' && (await page.locator('[data-testid=op-c-rooms]').inputValue()) === '0', `${tag}: карточка Кв. 23 — площадь 44,9, студия`);
  if (full) await shot(page, `s2-card-${tag}`, false);
  await page.locator('[data-testid=op-c-area]').fill('45,1'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  ok(/45,1 м²/.test(await row(page, 'Кв. 23').textContent()), `${tag}: площадь правится в карточке`);
  // шахматка Корпуса 3
  await page.locator('.op-obj:has(b:text-is("Корпус 3"))').click(); await page.waitForTimeout(500);
  await page.locator('[data-testid=op-view-chess]').click(); await page.waitForTimeout(800);
  ok(await page.locator('.op-chess__cell[data-place-id]').count() === 12 && /51 м²/.test(await page.locator('.op-chess__cell[data-place-id]').first().getAttribute('title') || ''), `${tag}: шахматка Корпуса 3 — 12 кв., подсказка с площадью`);
  if (full) await shot(page, `s2-chess-${tag}`, false);
  await page.locator('[data-testid=op-view-tree]').click(); await page.waitForTimeout(300);
  // «Отменить» загрузку — через стек (Ctrl+Z на экране)
  await page.locator('.op-obj:has(b:text-is("Корпус 1"))').click(); await page.waitForTimeout(400);
  await page.locator('[data-testid=op-root]').focus().catch(() => {});
  const undoBtn = page.locator('[data-testid=op-undo]');
  if (await undoBtn.count()) await undoBtn.click(); else { await page.locator('.p2-tree__row').first().click(); await page.keyboard.press('Control+z'); }
  await page.waitForTimeout(900);
  // первая отмена — правка площади; вторая — загрузка
  await page.locator('.p2-tree__row').first().click(); await page.keyboard.press('Control+z'); await page.waitForTimeout(900);
  ok(await page.locator('.op-obj b:text-is("Корпус 3")').count() === 0 && !(await page.locator('.p2-tree__name b').allTextContents()).includes('6 этаж'), `${tag}: «Отменить» сняло загрузку (Корпус 3 и «6 этаж» ушли)`);
  // тот же файл через меню дважды: второй раз — «нечего создавать»
  await viaMenu(page, KV, 'kvartirografiya.xlsx');
  await page.locator('[data-testid=op-imp-go]').click(); await page.waitForTimeout(1500);
  await viaMenu(page, KV, 'kvartirografiya.xlsx');
  ok(/Всё из файла уже есть/.test(await sum(page)) && await page.locator('[data-testid=op-imp-go]').isDisabled(), `${tag}: тот же файл ещё раз — «Всё из файла уже есть», «Создать» недоступна`);
  await page.locator('[data-testid=op-import-close]').click(); await page.waitForTimeout(300);
  // файл с ошибками
  await dropFile(page, '[data-testid=op-root]', 's-oshibkami.xlsx', BAD, XLSX);
  const sb = await sum(page);
  ok(/Создать пока нельзя/.test(sb) && /ошибок 5/.test(sb) && await page.locator('[data-testid=op-imp-go]').isDisabled(), `${tag}: ошибки — «Создать» недоступна (${sb.replace(/\s+/g, ' ')})`);
  const notes = await page.locator('[data-testid=op-imp-rows] tr.is-error td.op-imp__st small').allTextContents();
  ok(notes.some((n) => /не указан этаж/.test(n)) && notes.some((n) => /Площадь/.test(n)) && notes.some((n) => /Комнат/.test(n)) && notes.some((n) => /Повтор/.test(n)), `${tag}: причины по строкам`);
  if (full) await shot(page, `s2-errors-${tag}`, false);
  await page.locator('[data-testid=op-import-close]').click(); await page.waitForTimeout(300);
  // PDF и не-Excel
  await dropFile(page, '[data-testid=op-root]', 'plan.pdf', Buffer.from('%PDF-1.4'), 'application/pdf');
  ok(/PDF-планы/.test(await page.locator('[data-testid=op-notice]').textContent().catch(() => '')) && await page.locator('[data-testid=op-import]').count() === 0, `${tag}: PDF — подсказка «в следующем обновлении»`);
  await dropFile(page, '[data-testid=op-root]', 'spisok.docx', Buffer.from('PK'), 'application/msword');
  ok(/Нужен файл Excel/.test(await page.locator('.pf-error').first().textContent().catch(() => '')), `${tag}: .docx — «Нужен файл Excel (.xlsx)»`);
  // шаблон
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
    (async () => { await page.locator('[data-testid=op-head-more]').first().click(); await page.waitForTimeout(200); await page.locator('.p2-more__item:has-text("Скачать шаблон")').click(); })()]);
  ok(!!dl && /список помещений\.xlsx$/.test(dl.suggestedFilename()), `${tag}: «Скачать шаблон» → ${dl ? dl.suggestedFilename() : 'нет файла'}`);
  ok(await noHScroll(page), `${tag}: нет прокрутки страницы вбок`);
  ok(errs.length === 0, `${tag}: ошибок в консоли нет${errs.length ? ' — ' + errs.slice(0, 3).join(' / ') : ''}`);
  await ctx.close();
}
async function phone(width, height, scheme, tag) {
  const { ctx, page, errs } = await open(width, height, scheme);
  await viaMenu(page, KV, 'kvartirografiya.xlsx');
  ok(await page.locator('[data-testid=op-import]').isVisible() && /Будет создано/.test(await sum(page)), `${tag}: «⋯ → Загрузить из Excel» — лист предпросмотра`);
  ok(await noHScroll(page), `${tag}: таблица листается внутри блока, страница — нет`);
  await shot(page, `s2-preview-${tag}`, false);
  await page.locator('[data-testid=op-imp-go]').click(); await page.waitForTimeout(1500);
  ok(/Создано 31/.test(await page.locator('[data-testid=op-toast]').textContent()), `${tag}: создано, плашка «Отменить»`);
  ok(errs.length === 0, `${tag}: ошибок в консоли нет${errs.length ? ' — ' + errs.slice(0, 3).join(' / ') : ''}`);
  await ctx.close();
}
await desktop(1440, 900, 'light', '1440', true);
await desktop(1440, 900, 'dark', '1440-dark', true);
await desktop(1024, 768, 'light', '1024', false);
await desktop(1920, 1080, 'light', '1920', false);
await phone(768, 1024, 'light', '768');
await phone(375, 812, 'light', '375');
await phone(375, 812, 'dark', '375-dark');
await browser.close();
console.log(log.join('\n'));
console.log(`ИТОГО: PASS ${log.filter((l) => l.startsWith('PASS')).length}, FAIL ${log.filter((l) => l.startsWith('FAIL')).length}`);
