// P2-0053. «Обучение» в настоящей оболочке на стенде (PGlite + сервер стенда; боевой не используется): клиент «песочницы» →
// «Демо» → каждый тур (План/Факт, Качество, Стройконтроль) от начала до конца: подсветка попадает на элемент, карточка
// целиком на экране, «Назад» работает; шаг без цели пропускается. Снимок каждого шага — в папку.
// node scripts/demo/tours.mjs <папка снимков> [375,1440]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
import { demoStandWithApp, signIn } from './browser.mjs';

const [out = join(tmpdir(), 'p2-0053-tours'), widthsArg = '375,1440'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
mkdirSync(out, { recursive: true });
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const check = (c, l) => log((c ? 'PASS ' : 'FAIL ') + l);
const wait = (p, ms) => p.waitForTimeout(ms);

const st = await demoStandWithApp({ apiPort: 8892, appPort: 8898 });
const t0 = Date.now();
try {
  for (const width of widthsArg.split(',').map(Number)) {
    const dir = join(tmpdir(), 'p2-0053-tours-prof', 'w' + width);
    rmSync(dir, { recursive: true, force: true });
    const phone = width < 768;
    const ctx = await chromium.launchPersistentContext(dir, { viewport: { width, height: phone ? 812 : 900 }, isMobile: phone, hasTouch: phone, locale: 'ru-RU', deviceScaleFactor: phone ? 2 : 1 });
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.route(/rbi-q\.ru/, (r) => r.abort());
    page.on('pageerror', (e) => log(`  [ошибка страницы] ${e.message.split('\n')[0]}`));
    await signIn(page, st.appUrl, 'admin.k0@sandbox.test.invalid');
    // закрытые PDF-планы на боевом берёт кэш приложения (sw.js) со входом; на стенде он не успевает установиться за прогон —
    // план этажа показывает «не удалось скачать» (сервер стенда файл отдаёт: scripts/demo/check.mjs), шаги тура от этого не зависят
    for (const id of ['planfact', 'quality', 'construction']) {
      await page.evaluate(() => { history.pushState(null, '', '#/demo'); dispatchEvent(new HashChangeEvent('hashchange')); dispatchEvent(new PopStateEvent('popstate')); });
      await wait(page, 3000);
      await page.locator(`[data-tour-start=${id}]`).click();
      await page.locator('[data-testid=p2-tour-card]').waitFor({ timeout: 45000 }).catch(() => {});
      await wait(page, 2500);
      let n = 0, total = 0, prev = '', backed = false;
      for (let guard = 0; guard < 60; guard++) {
        const card = page.locator('[data-testid=p2-tour-card]');
        if (!(await card.count())) break;
        const info = await page.evaluate(() => {
          const c = document.querySelector('[data-testid=p2-tour-card]'); const h = document.querySelector('[data-testid=p2-tour-hole]');
          const r = c.getBoundingClientRect(); const hr = h.getBoundingClientRect();
          return { step: c.querySelector('.p2t-step').textContent, title: c.querySelector('.p2t-title').textContent, hole: !h.classList.contains('p2t-none'),
            inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, hx: Math.round(hr.width), hy: Math.round(hr.height),
            final: !!c.querySelector('[data-testid=p2-tour-leave]'), scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        if (info.step === prev) { await wait(page, 1000); continue; }   // шаг без цели пропускается — ждём следующий
        prev = info.step; n++;
        const m = info.step.match(/шаг (\d+) из (\d+)/); total = m ? Number(m[2]) : total;
        check(info.inView && info.scroll <= 0 && (info.hole || info.final), `${width} ${id} ${info.step}: «${info.title}» — подсветка ${info.hole ? info.hx + '×' + info.hy : 'нет (итог)'}, карточка на экране ${info.inView ? 'да' : 'НЕТ'}`);
        await page.screenshot({ path: join(out, `tour-${id}-${String(n).padStart(2, '0')}-${width}.jpg`), type: 'jpeg', quality: 72 });
        if (info.final) { await page.locator('[data-testid=p2-tour-done]').click(); break; }
        if (n === 2 && !backed) {   // «Назад» — один раз
          backed = true;
          const was = info.step;
          await page.locator('[data-testid=p2-tour-back]').click();
          let back = was;
          for (let k = 0; k < 25 && back.toLowerCase() === was.toLowerCase(); k++) { await wait(page, 1000); back = await page.locator('.p2t-step').innerText().catch(() => ''); }
          check(/шаг 1 из/i.test(back), `${width} ${id}: «Назад» — снова шаг 1 (${back})`);
          await page.locator('[data-testid=p2-tour-next]').click(); await wait(page, 3500);
          prev = await page.locator('.p2t-step').innerText().catch(() => '');
          continue;
        }
        await page.locator('[data-testid=p2-tour-next]').click();
        await wait(page, 3500);
      }
      check(n >= 3, `${width} ${id}: тур пройден до конца — показано шагов ${n} из ${total} (пропущены — без цели на экране)`);
      check(!(await page.locator('[data-testid=p2-tour-card]').count()), `${width} ${id}: «Закончить» — карточки нет`);
    }
    await ctx.close();
  }
} finally {
  writeFileSync(join(out, 'tours.txt'), lines.join('\n') + '\n');
  log(`снимки: ${out} (${((Date.now() - t0) / 1000).toFixed(0)} с)`);
  await st.stopApp(); await st.stand.stop();
  process.exit(lines.some((l) => l.startsWith('FAIL')) ? 1 : 0);
}
