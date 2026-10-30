// P2-0075 этап 3: тестовые компании у администратора платформы скрыты, пока не отмечено «Показать тестовые» — в «Администрировании
// платформы» и в переключателе компании («Настройки → Моё → Профиль» и шапка «План/Факта»); галочка одна на устройство.
// t375 (светлая), t1440 (тёмная). Ответы сервера — подставные (page.route), боевой сервер не используется.
import { join } from 'node:path';
import { start, stop, resetNet, API, COMPANY } from './servers.mjs';
import { freshProfile, go, launch, note, ok, signIn } from './lib.mjs';

const MODS = [{ code: 'planfact', name: 'План/Факт', managed: true, enabled: true }];
const ALFA = { id: 'aaaaaaaa-0000-0000-0000-000000000001', name: 'Альфа', is_test: true, roles: [], modules: ['planfact'], can_manage_company: false };
const BETA = { id: 'bbbbbbbb-0000-0000-0000-000000000002', name: 'Бета', is_test: true, roles: [], modules: ['planfact'], can_manage_company: false };
const RBI = { ...COMPANY, is_test: false };
const RPC = {
  pf_my_platform: { is_platform_admin: true, companies: [ALFA, RBI, BETA] },
  pf_platform_companies: [ALFA, RBI, BETA].map((c) => ({ id: c.id, name: c.name, is_test: c.is_test, created_at: '2026-10-01', people: 3, modules: MODS }))
};

async function testco(out, width, scheme) {
  const tag = 't' + width;
  note(`== ${tag}: администратор платформы — тестовые «Альфа», «Бета» скрыты; «Показать тестовые» — видны`);
  freshProfile(out, tag); resetNet();
  await start();
  const { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900, scheme });
  await page.route(API + '/rest/v1/rpc/**', (r) => {
    const fn = new URL(r.request().url()).pathname.split('/').pop();
    return fn in RPC ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn]) }) : r.fallback();
  });
  const wide = () => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
  const cards = () => page.evaluate(() => [...document.querySelectorAll('[data-testid=pa-list] [data-company]')].map((c) => c.querySelector('.sui-title').textContent));
  const switchOpts = () => page.evaluate(() => [...document.querySelectorAll('[data-testid=p2-company-switch] option')].map((o) => o.textContent));
  try {
    await signIn(page);
    const cur = await page.evaluate(() => window.RBI.platform2.getState().companyId);
    ok(cur === RBI.id, `${tag}: по умолчанию выбрана нетестовая компания`, cur);
    // «Администрирование платформы»
    await go(page, '#/settings/platform/companies', 4000);
    await page.waitForSelector('[data-testid=pa-list] [data-company]', { timeout: 15000 }).catch(() => {});
    let c = await cards();
    ok(c.join(',') === RBI.name, `${tag}: «Администрирование» — без тестовых`, c.join(','));
    const lbl = await page.locator('[data-testid=pa-show-test]').evaluate((b) => ({ on: b.checked, text: b.parentElement.textContent, h: b.parentElement.getBoundingClientRect().height }));
    ok(!lbl.on && /Показать тестовые \(2\)/.test(lbl.text) && lbl.h >= 44, `${tag}: галочка «Показать тестовые (2)», снята, высота ≥ 44`, JSON.stringify(lbl));
    ok(await wide() <= 0, `${tag}: без прокрутки вбок`);
    await page.screenshot({ path: join(out, `${tag}-admin-hidden.png`), fullPage: true });
    await page.locator('[data-testid=pa-show-test]').click();
    await page.waitForTimeout(500);
    c = await cards();
    ok(c.length === 3 && c.includes('Альфа') && c.includes('Бета'), `${tag}: отметили — видны и тестовые (с пометкой)`, c.join(','));
    const badges = await page.locator('[data-testid=pa-list] .sui-badge').count();
    ok(badges === 2, `${tag}: у тестовых пометка «тестовая»`, String(badges));
    await page.screenshot({ path: join(out, `${tag}-admin-shown.png`), fullPage: true });
    // переключатель компании — галочка та же (запомнена на устройстве)
    await go(page, '#/settings/my/profile', 3000);
    let o = await switchOpts();
    ok(o.length === 3, `${tag}: переключатель — 3 компании при отмеченной галочке`, o.join(' | '));
    await page.screenshot({ path: join(out, `${tag}-switch-shown.png`) });
    await page.locator('[data-testid=p2-show-test]').click();
    await page.waitForTimeout(500);
    o = await switchOpts();
    const h = await page.locator('label.p2-show-test').evaluate((e) => e.getBoundingClientRect().height);
    ok(o.length === 0 && h >= 44, `${tag}: сняли — тестовых нет (одна компания — переключателя нет), галочка остаётся`, `${o.join(' | ')} / ${h}`);
    ok(await wide() <= 0, `${tag}: профиль без прокрутки вбок`);
    await page.screenshot({ path: join(out, `${tag}-switch-hidden.png`) });
    // снова в «Администрировании» — галочка снята
    await go(page, '#/settings/platform/companies', 3000);
    await page.waitForSelector('[data-testid=pa-list] [data-company]', { timeout: 15000 }).catch(() => {});
    c = await cards();
    ok(c.join(',') === RBI.name && !(await page.locator('[data-testid=pa-show-test]').isChecked()), `${tag}: выбор общий — в «Администрировании» снова без тестовых`, c.join(','));
    // перезапуск — выбор помнится
    await page.reload(); await page.waitForTimeout(5000);
    await go(page, '#/settings/platform/companies', 3000);
    await page.waitForSelector('[data-testid=pa-list] [data-company]', { timeout: 15000 }).catch(() => {});
    c = await cards();
    ok(c.join(',') === RBI.name, `${tag}: после перезапуска — без тестовых`, c.join(','));
  } finally {
    await ctx.close(); await stop();
  }
}

export function testcoScenarios(out) {
  return { t375: () => testco(out, 375, 'light'), t1440: () => testco(out, 1440, 'dark') };
}
