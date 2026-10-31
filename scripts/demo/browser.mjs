// P2-0053. Кнопка «Демо» в настоящей оболочке на стенде (PGlite + сервер стенда, боевой не используется): клиент «песочницы»
// входит своей учёткой → «Демо» → каждая из 8 ролей (что видит: раздел, плашка, меню) → попытка записи → «Выйти из демо» —
// своя компания на месте; без сети — «нужна сеть». Снимки — в папку. Нужны P2_PGLITE и Chromium playwright-core.
// node scripts/demo/browser.mjs <папка снимков> [375,1440] [--keep] (--keep — стенд не останавливать: :8891 приложение, :8892 сервер)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
import { standWithNeighbours } from './check.mjs';
import { createApp } from './stand-server.mjs';
import http from 'node:http';

const [out = join(tmpdir(), 'p2-0053-shots'), widthsArg = '375,1440'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const KEEP = process.argv.includes('--keep');
mkdirSync(out, { recursive: true });
export const ROLES = ['management', 'project_manager', 'pto', 'foreman', 'qc_engineer', 'economist', 'customer', 'contractor_rep'];
const CLIENT = 'admin.k0@sandbox.test.invalid';
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const check = (c, l) => log((c ? 'PASS ' : 'FAIL ') + l);

export async function demoStandWithApp({ apiPort = 8892, appPort = 8891 } = {}) {
  const st = await standWithNeighbours(null);
  // сервер стенда standWithNeighbours слушает свой порт; приложению нужен адрес — поднимаем статику на него
  const app = http.createServer(createApp(st.stand.apiUrl));
  await new Promise((r) => app.listen(appPort, r));
  await st.seed();
  // своей компании клиента — модули и объект (как после «Песочницы» по памятке)
  await st.db.exec(`insert into core.company_modules(company_id, module, enabled) select '0c000000-0000-4000-8000-0000000000b1', m, true
      from unnest(array['planfact','quality','construction']) m on conflict (company_id, module) do update set enabled = true;
    select set_config('request.jwt.claim.sub', '0d000000-0000-4000-8000-0000000000b1', false);
    select public.pf_save_project('0c000000-0000-4000-8000-0000000000b1', '0a000000-0000-4000-8000-0000000000b1', '{"name": "Мой объект"}');
    select set_config('request.jwt.claim.sub', '', false);`);
  return { ...st, appUrl: 'http://localhost:' + appPort, stopApp: () => new Promise((r) => { app.closeAllConnections?.(); app.close(() => r()); }) };
}

async function launch(tag, width, scheme = 'light') {
  const dir = join(tmpdir(), 'p2-0053-profiles', tag);
  rmSync(dir, { recursive: true, force: true });
  const phone = width < 768;
  const ctx = await chromium.launchPersistentContext(dir, { viewport: { width, height: phone ? 812 : 900 }, isMobile: phone, hasTouch: phone,
    locale: 'ru-RU', colorScheme: scheme, deviceScaleFactor: phone ? 2 : 1 });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.route(/rbi-q\.ru/, (r) => r.abort());
  page.on('pageerror', (e) => log(`  [ошибка страницы] ${e.message.split('\n')[0]}`));
  return { ctx, page };
}
const wait = (p, ms) => p.waitForTimeout(ms);
const go = async (page, hash, ms = 2500) => { await page.evaluate((h) => { history.pushState(null, '', h); window.dispatchEvent(new HashChangeEvent('hashchange')); window.dispatchEvent(new PopStateEvent('popstate')); }, hash); await wait(page, ms); };
const hscroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const view = (page) => page.evaluate(() => {
  const st = window.RBI && window.RBI.platform2 && window.RBI.platform2.getState();
  const cur = st && st.companies.find((c) => c.id === st.companyId);
  const chip = document.getElementById('p2-demo-chip');
  return { hash: location.hash, company: cur && cur.name, demo: !!(cur && cur.is_demo), roles: cur && cur.roles, modules: cur && cur.modules,
    chip: chip ? chip.innerText.replace(/\s+/g, ' ').trim() : null,
    text: (document.querySelector('.view-section.active') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 160) };
});

export async function signIn(page, appUrl, email) {
  await page.goto(appUrl + '/');
  await wait(page, 2500);
  await page.fill('[data-testid=p2-login-email] input[name=email]', email);
  await page.fill('[data-testid=p2-login-email] input[name=password]', 'x12345678');
  await page.click('[data-testid=p2-login-email] button[type=submit]');
  await wait(page, 6000);
}

/** Войти в демо ролью через экран #/demo (кнопка роли), дождаться перезапуска страницы. */
export async function chooseRole(page, role) {
  await go(page, '#/demo', 2500);
  await page.locator(`[data-testid=p2-demo-role][data-role=${role}]`).click();
  await wait(page, 7000);
}

if (process.argv[1] && process.argv[1].endsWith('browser.mjs')) {
  const t0 = Date.now();
  const st = await demoStandWithApp();
  try {
    for (const width of widthsArg.split(',').map(Number)) {
      const { ctx, page } = await launch('w' + width, width);
      await signIn(page, st.appUrl, CLIENT);
      const own = await view(page);
      check(!own.demo && /Песочница/.test(own.company || ''), `${width}: вошёл в свою компанию «${own.company}»`);
      await page.evaluate(() => localStorage.setItem('p2-own-marker', '1'));
      await go(page, '#/demo', 3000);
      check((await page.locator('[data-testid=p2-demo-role]').count()) === 8, `${width}: экран «Демо» — 8 ролей`);
      check((await hscroll(page)) <= 0, `${width}: экран «Демо» без горизонтальной прокрутки`);
      await page.screenshot({ path: join(out, `demo-roles-${width}.jpg`), fullPage: true, type: 'jpeg', quality: 80 });
      for (const role of ROLES) {
        await chooseRole(page, role);
        const v = await view(page);
        check(v.demo && v.chip && /демо/i.test(v.chip) && v.hash !== '#/demo', `${width} ${role}: в демо, плашка «${v.chip}», раздел ${v.hash}, модули ${JSON.stringify(v.modules)}`);
        check((await hscroll(page)) <= 0, `${width} ${role}: без горизонтальной прокрутки`);
        await page.screenshot({ path: join(out, `demo-${role}-${width}.jpg`), fullPage: false, type: 'jpeg', quality: 78 });
      }
      // запись в демо: факт прорабом — понятный отказ (сервер); выход — своя компания
      const w = await page.evaluate(() => window.RBI.platform2.rpc('pf_demo_roles'));
      check(!w.error, `${width}: роли с сервера в демо читаются`);
      await page.locator('[data-testid=p2-demo-chip-exit]').click();
      await wait(page, 7000);
      const back = await view(page);
      check(!back.demo && /Песочница/.test(back.company || '') && !back.chip, `${width}: «Выйти» — снова своя компания «${back.company}», плашки нет`);
      check(await page.evaluate(() => localStorage.getItem('p2-own-marker') === '1'), `${width}: данные устройства своей компании на месте`);
      await ctx.setOffline(true);
      await go(page, '#/demo', 2500);
      const msg = await page.locator('[data-testid=p2-demo-error]').innerText().catch(() => '');
      check(/интернет/.test(msg), `${width}: без сети — «${msg}»`);
      await page.screenshot({ path: join(out, `demo-offline-${width}.jpg`), fullPage: false, type: 'jpeg', quality: 78 });
      await ctx.setOffline(false);
      await ctx.close();
    }
  } finally {
    writeFileSync(join(out, 'browser.txt'), lines.join('\n') + '\n');
    log(`снимки: ${out} (${((Date.now() - t0) / 1000).toFixed(0)} с)`);
    if (!KEEP) { await st.stopApp(); await st.stand.stop(); process.exit(lines.some((l) => l.startsWith('FAIL')) ? 1 : 0); }
    else log(`стенд работает: ${st.appUrl} (Ctrl+C — стоп)`);
  }
}
