// P2-0058: общее для сценариев стенда «без сети» — браузер (Chromium, playwright-core), вход, метки-осмотры, база устройства.
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { APP } from './servers.mjs';

export const results = [];
export const ok = (cond, label, extra = '') => { const line = (cond ? 'PASS ' : 'FAIL ') + label + (extra ? ' — ' + extra : ''); results.push(line); console.log(line); return !!cond; };
export const note = (s) => { results.push('  ' + s); console.log('  ' + s); };

/** Браузер с постоянным профилем (как телефон: закрыли и открыли заново — данные устройства на месте). */
export async function launch(out, tag, { width = 375, height = 812, offline = false, scheme = 'light' } = {}) {
  const phone = width < 768;
  const ctx = await chromium.launchPersistentContext(join(out, 'profile-' + tag), { viewport: { width, height }, isMobile: phone, hasTouch: phone,
    offline, locale: 'ru-RU', colorScheme: scheme, deviceScaleFactor: phone ? 2 : 1 });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.route(/rbi-q\.ru/, (r) => r.abort());   // боевой сервер недоступен из стенда
  page.on('pageerror', (e) => note(`[ошибка страницы] ${e.message.split('\n')[0]}`));
  if (process.env.P2_OFFLINE_DEBUG) page.on('console', (m) => { const t = m.text(); if (new RegExp(process.env.P2_OFFLINE_DEBUG).test(t)) note('[консоль] ' + t.slice(0, 300)); });
  return { ctx, page };
}
export function freshProfile(out, tag) { rmSync(join(out, 'profile-' + tag), { recursive: true, force: true }); mkdirSync(out, { recursive: true }); }

export async function open(page, ms = 9000) { await page.goto(APP + '/').catch((e) => note('goto: ' + e.message.split('\n')[0])); await page.waitForTimeout(ms); }

export async function signIn(page, email = 'test@stand.local') {
  await open(page, 3000);
  await page.fill('[data-testid=p2-login-email] input[name=email]', email);
  await page.fill('[data-testid=p2-login-email] input[name=password]', 'x12345678');
  await page.click('[data-testid=p2-login-email] button[type=submit]');
  await page.waitForTimeout(6000);
}

/** Осмотр той же функцией, которой пишет экран «Осмотр». */
export const saveMark = (page, mark) => page.evaluate(async (m) => {
  const r = await window.RBI.services.inspections.save({ id: m + '-' + Date.now(), date: new Date().toISOString(), object: m, template: 'Земляные работы', status: 'done', engineer: 'Иванов Иван' });
  return r && r.id;
}, mark).catch((e) => 'ошибка: ' + e.message);

export const go = async (page, h, ms = 3500) => { await page.evaluate((x) => { location.hash = x; }, h).catch(() => {}); await page.waitForTimeout(ms); };

/** Состояние устройства и экрана. */
export const state = (page) => page.evaluate(async () => {
  const R = window.RBI || {};
  const p2 = R.platform2 && R.platform2.getState();
  let rec = null;
  try { rec = R.services && R.services.inspections ? (await R.services.inspections.getActive()).map((r) => r.object || r.id) : null; } catch (e) { rec = 'err ' + e.message; }
  return { hash: location.hash, db: window.RBI_DB_NAME, qualityCompany: localStorage.getItem('platform2_quality_company'), dirty: localStorage.getItem('rbi_cloud_dirty'),
    platform: p2 ? { mode: p2.mode, companies: p2.companies.length, companyId: p2.companyId, offline: !!p2.offline } : null,
    access: R.platformMenuAccess || null, qualitySync: !!R.qualitySync, records: rec, authKept: !!localStorage.getItem('platform2-auth'),
    login: !!document.querySelector('#auth-gate-overlay:not(.hidden) [data-testid=p2-login]'),
    // пункты меню модулей, которые нарисовала оболочка (на телефоне — под «бургером»), по адресу раздела
    menu: [...new Set([...document.querySelectorAll('#app-sidebar a, #app-sidebar button, #mobile-module-menu a, #mobile-module-menu button')]
      .map((e) => (e.textContent || '').trim().replace(/\s+/g, ' ')).filter(Boolean))].sort(),
    text: (document.querySelector('main, #app-content, #content') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 200) };
}).catch((e) => ({ err: e.message.split('\n')[0] }));

/** Записи хранилища в базе устройства по имени (базу не создаёт). */
export const readStore = (page, dbName, store) => page.evaluate(([n, s]) => new Promise((res) => {
  let created = false;
  const rq = indexedDB.open(n);
  rq.onupgradeneeded = () => { created = true; rq.transaction.abort(); };
  rq.onsuccess = () => { const db = rq.result; if (created) { db.close(); return res(null); }
    try { const t = db.transaction(s).objectStore(s).getAll(); t.onsuccess = () => { db.close(); res(t.result); }; t.onerror = () => res('err'); } catch (e) { db.close(); res([]); } };
  rq.onerror = () => res(null);
}), [dbName, store]);

export const count = (list, mark) => list.filter((m) => m.includes(mark)).length;
