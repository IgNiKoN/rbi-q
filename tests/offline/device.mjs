// P2-0060 этап 6: «Данные на устройстве → Офлайн по модулям» на стенде test:offline (подставной сервер, боевой не используется).
// d-device — размеры сходятся с подсчётом (±5 %), «Держать без сети» выкл → заранее не качается, открытое видно, «Очистить скачанное»
// освобождает место, неотправленный осмотр и его фото на месте и уходит 1 раз; d-quality-only — у компании только Качество → в списке
// только Качество; d-screens — 375 / 768 / 1440, светлая и тёмная, без прокрутки вбок (снимки во всю длину).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { start, stop, resetNet, log, sends, COMPANY, API, APP } from './servers.mjs';
import { freshProfile, go, launch, note, ok, signIn } from './lib.mjs';

const SW = fileURLToPath(new URL('../../sw.js', import.meta.url));
/** Код модуля по описи версии — считается здесь из файла sw.js, независимо от экрана. */
const codeOf = (groups) => { let n = 0; for (const m of readFileSync(SW, 'utf8').matchAll(/^\s*"[^"]+": \["[0-9a-f]+",(\d+),"([^"]*)"\]/gm)) if (groups.includes(m[2])) n += Number(m[1]); return n; };
/** «1,7 МБ» / «812 КБ» / «2,1 ГБ» → байты. */
const bytesOf = (t) => { const m = String(t || '').match(/([\d,]+)\s*(КБ|МБ|ГБ)/); return m ? Number(m[1].replace(',', '.')) * { КБ: 1024, МБ: 1048576, ГБ: 1073741824 }[m[2]] : NaN; };
const near = (a, b) => (b === 0 ? a < 2048 : Math.abs(a - b) / b <= 0.05 || Math.abs(a - b) < 2048);
const sizeText = (page, mod, label) => page.evaluate(([m, l]) => { const el = document.querySelector(`[data-testid=p2o-size-${m}]`);
  const span = el ? [...el.querySelectorAll('span')].find((s) => s.textContent.startsWith(l)) : null; return span ? span.textContent : ''; }, [mod, label]);
const openDevice = async (page) => { await go(page, '#/settings/my/device', 5000); await page.waitForSelector('[data-testid=p2-offline-modules]', { timeout: 15000 }).catch(() => {}); };
const confirmYes = async (page) => { await page.locator('[data-testid=p2o-confirm] [data-yes]').click(); await page.waitForTimeout(2500); };

async function device(out) {
  const tag = 'd-device';
  note(`== ${tag}: размеры, «Держать без сети», «Очистить скачанное», неотправленное`);
  freshProfile(out, tag); resetNet();
  await start();
  try {
    let { ctx, page } = await launch(out, tag, { width: 1440, height: 900 });
    await signIn(page);
    // заранее «Компания» — через 10 с после запуска, План/Факт — после первой синхронизации Качества и не раньше 45 с (P2-0078)
    await page.waitForTimeout(14000);
    for (let i = 0; i < 50; i++) {
      const done = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('platform2_offline_prefetch:'));
        return !!(k && JSON.parse(localStorage.getItem(k)).planfact); }).catch(() => false);
      if (done) break;
      await page.waitForTimeout(1500);
    }
    await openDevice(page);
    const mods = await page.evaluate(() => [...document.querySelectorAll('[data-testid^=p2o-mod-]')].map((e) => e.dataset.mod));
    ok(JSON.stringify(mods) === JSON.stringify(['quality', 'planfact', 'company']), `${tag}: мои модули — Качество и СК, План/Факт, Компания`, JSON.stringify(mods));
    // размеры: код — по описи, данные — копия для просмотра, фото — реестр файлов (±5 %)
    const pfCode = bytesOf(await sizeText(page, 'planfact', 'Код')), pfCodeWant = codeOf(['planfact']);
    ok(near(pfCode, pfCodeWant), `${tag}: код План/Факта на экране = опись версии (±5 %)`, `${pfCode} / ${pfCodeWant}`);
    const qCode = bytesOf(await sizeText(page, 'quality', 'Код')), qCodeWant = codeOf(['quality', 'construction', 'construction-v2']);
    ok(near(qCode, qCodeWant), `${tag}: код Качества и СК = опись версии (±5 %)`, `${qCode} / ${qCodeWant}`);
    const pfData = bytesOf(await sizeText(page, 'planfact', 'Данные'));
    const pfDataWant = await page.evaluate(() => window.RBI.offlineCopy.size('planfact'));
    ok(pfDataWant > 0 && near(pfData, pfDataWant), `${tag}: данные План/Факта на экране = копия на устройстве (±5 %)`, `${pfData} / ${pfDataWant}`);
    await page.screenshot({ path: join(out, tag + '-1440.png'), fullPage: true });

    // «Держать без сети» План/Факт — выключить (с подтверждением) → заранее не качается
    await page.locator('#p2o-keep-planfact').evaluate((e) => e.click());
    await page.waitForTimeout(600);
    ok(await page.locator('[data-testid=p2o-confirm]').count() === 1, `${tag}: выключение — с подтверждением`);
    await confirmYes(page);
    const keep = await page.locator('#p2o-keep-planfact').isChecked();
    ok(!keep, `${tag}: «Держать без сети» План/Факта выключено`);
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('platform2_offline_prefetch')) localStorage.removeItem(k); });
    const n0 = log.length;
    const r = await page.evaluate(() => window.RBI.offlinePrefetch.planfact(false));
    await page.waitForTimeout(1500);
    const pfReads = log.slice(n0).filter((x) => /rpc\/pf_(summary|vor|fact)/.test(x)).length;
    ok(r === null && pfReads === 0, `${tag}: выключено — заранее ничего не качается`, `ответ ${JSON.stringify(r)}, запросов ${pfReads}`);
    await ctx.close();
    // без сети: открытое (Сводка, открыта при входе) видна
    ({ ctx, page } = await launch(out, tag, { width: 1440, height: 900, offline: true }));
    await page.goto(APP + '/#/planfact').catch(() => {}); await page.waitForTimeout(8000);
    const sumText = await page.evaluate(() => (document.querySelector('[data-testid=sm-tab]') || {}).innerText || '');
    ok(sumText.includes('ЖК Тестовый'), `${tag}: без сети открытое (Сводка) видно`);
    await ctx.close();

    // «Очистить скачанное» План/Факта и Качества; неотправленное на месте
    ({ ctx, page } = await launch(out, tag, { width: 1440, height: 900 }));
    await page.goto(APP + '/').catch(() => {}); await page.waitForTimeout(8000);
    await ctx.setOffline(true);
    const unsent = await page.evaluate(async () => {
      const S = window.RBI.services; const ref = 'local://p2d-' + Date.now();
      await S.storage.put('app_photos', { id: ref, data: new Uint8Array(8192).buffer, mimeType: 'image/jpeg', sizeBytes: 8192 });
      const r = await S.inspections.save({ id: 'p2d-' + Date.now(), date: new Date().toISOString(), object: 'DEVICE-MARK', template: 'Земляные работы', status: 'done',
        engineer: 'Иванов Иван', state: { '1': 'bad' }, details: { '1': { comment: 'стенд' } }, photos: { '1': [ref] } });
      return { id: r && r.id, ref };
    });
    // скачанное из облака фото (копия есть в облаке) — его очистка удалит
    const cloud = API + '/storage/v1/object/public/quality-inspection-photos/c/p/d-cloud.jpg';
    await page.evaluate(async (u) => {
      await dbPut(STORES.PHOTOS, { id: u, data: new Uint8Array(512 * 1024).buffer, mimeType: 'image/jpeg', sizeBytes: 512 * 1024, entityType: 'inspection_photo' });
      await dbPut(STORES.FILE_REGISTRY, { id: 'reg-' + Date.now(), public_url: u, cache_status: 'cached_cloud', size_bytes: 512 * 1024, entity_type: 'inspection_photo' });
    }, cloud);
    await openDevice(page);
    const qFiles = bytesOf(await sizeText(page, 'quality', 'Фото'));
    ok(qFiles >= 512 * 1024, `${tag}: фото Качества на телефоне — по реестру`, String(qFiles));
    await page.locator('[data-testid=p2o-clear-quality]').click(); await page.waitForTimeout(600);
    const dlg = await page.locator('[data-testid=p2o-confirm]').innerText().catch(() => '');
    ok(/Неотправленные записи и фото останутся/.test(dlg) && /\d/.test(dlg), `${tag}: «Очистить» — подтверждение с размером`, dlg.replace(/\s+/g, ' ').slice(0, 120));
    await confirmYes(page);
    const after = await page.evaluate(async (u) => ({ cloud: !!(await dbGet(STORES.PHOTOS, u.cloud)), local: !!(await dbGet(STORES.PHOTOS, u.ref)) }), { cloud, ref: unsent.ref });
    ok(!after.cloud && after.local, `${tag}: очищено скачанное из облака, неотправленное фото на месте`, JSON.stringify(after));
    await page.locator('[data-testid=p2o-clear-planfact]').click(); await page.waitForTimeout(600);
    await confirmYes(page);
    const pfLeft = await page.evaluate(() => window.RBI.offlineCopy.size('planfact'));
    ok(pfLeft === 0, `${tag}: «Очистить скачанное» План/Факта — копия удалена`, String(pfLeft));
    await ctx.setOffline(false);
    let sent = 0;
    for (let i = 0; i < 15 && !sent; i++) { await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {}); await page.waitForTimeout(4000); sent = sends.get(unsent.id) || 0; }
    ok(sent === 1, `${tag}: неотправленный осмотр после очистки ушёл на сервер ровно 1 раз`, String(sent));
    await ctx.close();
  } finally { await stop().catch(() => {}); }
}

/** У компании только Качество — в списке только Качество (изоляция модулей, MODULES.md раздел 1а). */
async function qualityOnly(out) {
  const tag = 'd-quality-only';
  note(`== ${tag}: у компании только Качество`);
  freshProfile(out, tag); resetNet();
  const mods = COMPANY.modules.slice(), mng = COMPANY.can_manage_company;
  COMPANY.modules = ['quality']; COMPANY.can_manage_company = false;
  try {
    await start();
    const { ctx, page } = await launch(out, tag, { width: 375, height: 812 });
    await signIn(page); await page.waitForTimeout(4000);
    await openDevice(page);
    const list = await page.evaluate(() => [...document.querySelectorAll('[data-testid^=p2o-mod-]')].map((e) => e.dataset.mod));
    ok(JSON.stringify(list) === '["quality"]', `${tag}: в списке только Качество`, JSON.stringify(list));
    await ctx.close();
  } finally { COMPANY.modules = mods; COMPANY.can_manage_company = mng; await stop().catch(() => {}); }
}

async function screens(out) {
  const tag = 'd-screens';
  note(`== ${tag}: 375 / 768 / 1440, светлая и тёмная`);
  freshProfile(out, tag); resetNet();
  try {
    await start();
    for (const [w, scheme] of [[375, 'light'], [375, 'dark'], [768, 'light'], [1440, 'dark']]) {
      const { ctx, page } = await launch(out, tag, { width: w, height: w < 768 ? 812 : 900, scheme });
      if (w === 375 && scheme === 'light') await signIn(page); else { await page.goto(APP + '/').catch(() => {}); await page.waitForTimeout(7000); }
      await openDevice(page);
      const has = await page.locator('[data-testid=p2-offline-modules]').count();
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(has === 1 && wide <= 0, `${tag}: ${w} ${scheme} — блок на месте, без прокрутки вбок`, String(wide));
      await page.screenshot({ path: join(out, `${tag}-${w}-${scheme}.png`), fullPage: true });
      await ctx.close();
    }
  } finally { await stop().catch(() => {}); }
}

export function deviceScenarios(out) {
  return { 'd-device': () => device(out), 'd-quality-only': () => qualityOnly(out), 'd-screens': () => screens(out) };
}
