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

export async function demoStandWithApp({ apiPort = 18893, appPort = 8891 } = {}) {
  const st = await standWithNeighbours(null, apiPort);
  // сервер стенда standWithNeighbours слушает свой порт; приложению нужен адрес — поднимаем статику на него
  const app = http.createServer(createApp(st.stand.apiUrl));
  await new Promise((r) => app.listen(appPort, r));
  await st.seed();
  // своей компании клиента — модули и объект (как после «Песочницы» по памятке)
  await st.db.exec(`insert into core.company_modules(company_id, module, enabled) select '0c000000-0000-4000-8000-0000000000b1', m, true
      from unnest(array['planfact','quality','construction']) m on conflict (company_id, module) do update set enabled = true;
    select set_config('request.jwt.claim.sub', '0d000000-0000-4000-8000-0000000000b1', false);
    select public.pf_save_project('0c000000-0000-4000-8000-0000000000b1', '0a000000-0000-4000-8000-0000000000b1', '{"name": "Мой объект"}');
    select set_config('request.jwt.claim.sub', '', false);
    insert into auth.users(id, email, email_confirmed_at) values ('0d000000-0000-4000-8000-00000000000a', 'owner@stand.test.invalid', now());
    insert into core.platform_admins(user_id) values ('0d000000-0000-4000-8000-00000000000a');`);
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
      // ТД 403: у клиента свой объект — в демо «Сводка» его не показывает, в своей компании — показывает
      const ownProject = await page.evaluate(async () => {
        const P = window.RBI.platform2, st = P.getState();
        const has = ((await P.rpc('pf_summary_portfolio')).data || []).some((x) => x.name === 'Свой объект клиента');
        if (!has) await P.rpc('pf_create_project', { p_company: st.companyId, p_name: 'Свой объект клиента', p_code: null });
        return ((await P.rpc('pf_summary_portfolio')).data || []).map((x) => x.name);
      });
      check(ownProject.includes('Свой объект клиента'), `${width}: своя компания — «Сводка» со своим объектом: ${JSON.stringify(ownProject)}`);
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
        if (role === 'management' || role === 'project_manager') {
          await go(page, '#/planfact', 4000);
          const opts = await page.locator('[data-testid=sm-project] option').allInnerTexts();
          check(opts.length >= 2 && opts.some((o) => /ЖК Демо/.test(o)) && !opts.some((o) => /Свой объект клиента/.test(o)),
            `${width} ${role}: «Сводка» в демо — только объекты демо: ${JSON.stringify(opts)}`);
          await page.screenshot({ path: join(out, `demo-summary-${role}-${width}.jpg`), fullPage: false, type: 'jpeg', quality: 78 });
        }
        if (role === 'qc_engineer' || role === 'contractor_rep' || role === 'customer') {
          // ТД 406: план этажа — кнопки создания есть в разметке, но скрыты; замечание открыто — кнопок действий нет
          const visibleCreate = () => page.evaluate(() => [...document.querySelectorAll('button')]
            .filter((b) => b.offsetParent !== null && /\+ Замечание|Управление иерархией|^Зона$|Записаться/.test(b.textContent.trim()))
            .map((b) => location.hash + ' ' + b.textContent.trim()));
          const pickFloor = async () => {   // этаж с PDF-планом; на телефоне дерево — в выезжающей панели «Изменить»
            const open = page.locator('[data-c2-plan-picker-open]:visible').first();
            if (await open.count()) { await open.click(); await wait(page, 1200); }
            const floor = page.locator('button:visible', { hasText: '📄 эт.' }).first();
            if (await floor.count()) { await floor.click(); await wait(page, 2500); }
          };
          const seen = []; let inDom = 0;
          if (role !== 'contractor_rep') {   // у подрядчика СК 2.0 — «Кабинет», плана этажа нет
            await go(page, '#/construction-v2', 3500);
            await pickFloor();
            inDom = await page.locator('[data-c2-add-mode],[data-c2-zone-mode]').count();
            seen.push(...await visibleCreate());
            await page.screenshot({ path: join(out, `demo-sk-${role}-${width}.jpg`), fullPage: false, type: 'jpeg', quality: 78 });
          }
          for (const hash of ['#/construction-v2/defects', '#/construction-v2/acceptance']) { await go(page, hash, 3500); seen.push(...await visibleCreate()); }
          check(!seen.length && (role === 'contractor_rep' || inDom > 0),
            `${width} ${role}: СК 2.0 в демо — кнопок создания не видно${role === 'contractor_rep' ? '' : ` (на плане этажа в разметке ${inDom}, скрыты)`}${seen.length ? ': ' + JSON.stringify(seen) : ''}`);
          await go(page, '#/construction-v2/defects', 3500);
          let row = page.locator('[data-c2-def-row]:visible').first();
          if (!(await row.count())) { await pickFloor(); row = page.locator('[data-c2-def-row]:visible').first(); }
          if (!(await row.count())) {   // подрядчик: замечания — в «Кабинете»
            await go(page, '#/construction-v2/cabinet', 3500);
            row = page.locator('[data-c2-cab-def]:visible, [data-c2-cab-desk-def]:visible').first();
          }
          const rows = await row.count();
          if (rows) { await row.click(); await wait(page, 2000); }
          const form = await page.evaluate(() => ({
            open: [...document.querySelectorAll('[data-c2-defect-close]')].some((b) => b.offsetParent !== null),
            acts: [...document.querySelectorAll('[data-c2-status],[data-c2-defect-save]')].filter((b) => b.offsetParent !== null).map((b) => b.textContent.trim()) }));
          check(rows > 0 && form.open && !form.acts.length, `${width} ${role}: замечание в демо открыто — кнопок действий нет${form.acts.length ? ': ' + JSON.stringify(form.acts) : ''} (форма ${form.open ? 'открыта' : 'не открылась'})`);
          await page.screenshot({ path: join(out, `demo-sk-defect-${role}-${width}.jpg`), fullPage: false, type: 'jpeg', quality: 78 });
          await page.keyboard.press('Escape').catch(() => {});
          const close = page.locator('[data-c2-defect-close]:visible').first();
          if (await close.count()) await close.click().catch(() => {});
      }
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
    // администратор платформы (владелец): в демо — глазами роли, второе «устройство» (запрос без демо) — администратор
    {
      const { ctx, page } = await launch('owner', 1440);
      await signIn(page, st.appUrl, 'owner@stand.test.invalid');
      check(await page.evaluate(() => window.RBI.platform2.getState().isPlatformAdmin), 'админ платформы: до демо — администратор');
      await chooseRole(page, 'foreman');
      const inDemo = await page.evaluate(async () => {
        const st = window.RBI.platform2.getState();
        const proj = (await window.RBI.platform2.rpc('pf_my_projects')).data || [];
        const demo = st.companies.find((c) => c.is_demo);
        const p = proj.find((x) => x.company_id === demo.id);
        const pos = (await window.RBI.platform2.rpc('pf_vor_positions', { p_project: p.id, p_location: null })).data || [];
        return { admin: st.isPlatformAdmin, demo: st.companyId === demo.id, pos: pos.length, own: pos.every((x) => /Корпус 2.*Секция 1/.test(x.location_path)) };
      });
      check(inDemo.demo && !inDemo.admin && inDemo.pos > 0 && inDemo.own, `админ платформы в демо — глазами прораба: позиций ${inDemo.pos}, только Корпус 2 секция 1, «администратор» скрыт`);
      const other = await fetch(st.stand.apiUrl + '/rest/v1/rpc/pf_platform_companies', { method: 'POST', headers: { 'content-type': 'application/json',
        authorization: 'Bearer ' + await page.evaluate(() => JSON.parse(localStorage.getItem('platform2-auth')).access_token) }, body: '{}' });
      check(other.status === 200, `админ платформы в демо, запрос с другого устройства (без компании демо) — администрирование работает (${other.status})`);
      await page.screenshot({ path: join(out, 'demo-owner-foreman-1440.jpg'), type: 'jpeg', quality: 75 });
      await page.locator('[data-testid=p2-demo-chip-exit]').click();
      await wait(page, 7000);
      check(await page.evaluate(() => window.RBI.platform2.getState().isPlatformAdmin), 'админ платформы: после «Выйти» — снова администратор');
      await ctx.close();
    }
  } finally {
    writeFileSync(join(out, 'browser.txt'), lines.join('\n') + '\n');
    log(`снимки: ${out} (${((Date.now() - t0) / 1000).toFixed(0)} с)`);
    if (!KEEP) { await st.stopApp(); await st.stand.stop(); process.exit(lines.some((l) => l.startsWith('FAIL')) ? 1 : 0); }
    else log(`стенд работает: ${st.appUrl} (Ctrl+C — стоп)`);
  }
}
