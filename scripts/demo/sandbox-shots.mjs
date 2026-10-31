// P2-0053. Снимки пути «доступ клиенту» для памятки (стенд PGlite, боевой не используется): администратор платформы —
// «Администрирование платформы» с песочницей; клиент — «Сотрудники» своей компании (9 учёток, у трёх участок не назначен),
// «Проекты» после загрузки мест из образца Excel, «Настройки → Платформа» со ссылкой «Демо и обучение».
// node scripts/demo/sandbox-shots.mjs <папка> [375,1440]
import http from 'node:http';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { runSandbox } from './sandbox.mjs';
import { createApp, standDb, startStand } from './stand-server.mjs';
import { standClient } from './checks.mjs';
import { signIn } from './browser.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const [out = join(tmpdir(), 'p2-0053-sandbox-shots'), widthsArg = '375,1440'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const db = await standDb();
const OWNER = '0d000000-0000-4000-8000-00000000000a';
await db.exec(`insert into auth.users(id, email, email_confirmed_at) values ('${OWNER}', 'owner@stand.test.invalid', now());
  insert into core.platform_admins(user_id) values ('${OWNER}');`);
const stand = await startStand({ db, apiPort: 18895, appPort: 0 });
const app = http.createServer(createApp(stand.apiUrl));
await new Promise((r) => app.listen(8899, r));
const r = await runSandbox({ url: stand.apiUrl, anonKey: 'stand', admin: { email: 'owner@stand.test.invalid', password: 'x' }, name: 'Песочница — Клиент 0',
  key: 'k0', domain: 'sandbox.test.invalid', log: () => {} });
// клиент: объект и места из образца
const adm = standClient(stand.apiUrl); await adm.auth.signInWithPassword({ email: 'admin.k0@sandbox.test.invalid', password: 'x' });
const pid = randomUUID();
await adm.rpc('pf_save_project', { p_company: r.company, p_id: pid, p_card: { name: 'Мой первый объект', timezone: 'Europe/Moscow', country: 'RU' } });
const { readWorkbook } = await import('../../src/platform/services/excel/xlsx-reader.ts');
const { findPlaceHeader, sheetRows } = await import('../../src/platform/company/places-import.ts');
const pw = await readWorkbook(readFileSync(join(ROOT, 'docs/demo-files/Образец — список квартир.xlsx')));
await adm.rpc('pf_import_places', { p_project: pid, p_batch: randomUUID(), p_rows: sheetRows(pw.sheets[0], findPlaceHeader(pw.sheets[0].rows), null), p_dry_run: false });
await db.exec(`update core.user_profiles set must_change_password = false where user_id in (select id from auth.users where email in ('admin.k0@sandbox.test.invalid', 'owner@stand.test.invalid'))`);

const go = async (page, h) => { await page.evaluate((x) => { history.pushState(null, '', x); dispatchEvent(new HashChangeEvent('hashchange')); dispatchEvent(new PopStateEvent('popstate')); }, h); await page.waitForTimeout(3500); };
for (const width of widthsArg.split(',').map(Number)) {
  for (const [who, email, shots] of [
    ['owner', 'owner@stand.test.invalid', [['#/settings/platform-admin', 'platform-admin']]],
    ['client', 'admin.k0@sandbox.test.invalid', [['#/settings/company/members', 'members'], ['#/settings/company/objects', 'objects'], ['#/settings/platform', 'settings-demo']]]
  ]) {
    const dir = join(tmpdir(), 'p2-0053-sb-prof', who + width);
    rmSync(dir, { recursive: true, force: true });
    const phone = width < 768;
    const ctx = await chromium.launchPersistentContext(dir, { viewport: { width, height: phone ? 812 : 900 }, isMobile: phone, hasTouch: phone, locale: 'ru-RU', deviceScaleFactor: phone ? 2 : 1 });
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.route(/rbi-q\.ru/, (x) => x.abort());
    await signIn(page, 'http://localhost:8899', email);
    if (who === 'owner') await page.evaluate(() => localStorage.setItem('platform2_show_test', '1'));
    for (const [h, name] of shots) {
      await go(page, h);
      await page.screenshot({ path: join(out, `sandbox-${name}-${width}.jpg`), fullPage: !phone, type: 'jpeg', quality: 75 });
      console.log(`${width} ${name}: ` + await page.evaluate(() => (document.querySelector('.view-section.active') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 140)));
    }
    await ctx.close();
  }
}
await new Promise((x) => { app.closeAllConnections?.(); app.close(() => x()); });
await stand.stop();
process.exit(0);
