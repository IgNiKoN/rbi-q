// P2-0060 этап 1: «права и меню сразу из памяти» — стенд test:offline. Покадровая запись запуска (каждые 100 мс с начала
// загрузки страницы): пункты меню, адрес, «Модуль 404» / «не подключён», подвкладки План/Факта, экран загрузки и «Вход».
// m-hang — сервер завис при запуске (погода hang) → ответил, у компании убрали Стройконтроль; m-revoke — сервер убрал План/Факт,
// человек на экране ВОР; m-first — вход есть, копии прав нет, сервер завис; m-other — другой пользователь на том же браузере.
// Боевой сервер не используется (servers.mjs — подставной, lib.mjs отрезает rbi-q.ru). Замер — menu.json в папке --out.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, stop, net, resetNet, releaseHeld, COMPANY, APP } from './servers.mjs';
import { freshProfile, launch, note, ok, signIn } from './lib.mjs';

export const menuMeasures = [];
/** Пункты прежнего меню Качества (заглушки модулей) — при входе почтой их быть не должно ни на одном кадре. */
const OLD = ['Безопасность', 'Гарантия', 'Тендерный отдел', 'Стандарты (тех. решения)', 'Сроки', 'Бюджет'];

/** Запись кадров с первой строки страницы (до скриптов приложения). */
const RECORDER = () => {
  const t0 = performance.now();
  const frames = (window.__p2frames = []);
  const vis = (el) => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const shot = () => {
    const menu = [...new Set([...document.querySelectorAll('#app-sidebar [data-sidebar-module-id], #app-sidebar [data-sidebar-settings], #mobile-module-menu button')]
      .map((e) => (e.textContent || '').replace(/●/g, '').trim().replace(/\s+/g, ' ')).filter(Boolean))].sort();
    const ph = document.getElementById('tab-mode-placeholder');
    const ov = document.getElementById('auth-gate-overlay');
    const pnav = window.RBI && window.RBI.platformNav;
    const st = window.RBI && window.RBI.platform2 && window.RBI.platform2.getState();
    frames.push({ t: Math.round(performance.now() - t0), hash: location.hash, menu,
      e404: vis(ph) && /404/.test(ph.innerText || ''), notConnected: !!document.querySelector('[data-testid=pf-not-connected]'),
      loading: vis(ov) && !ov.querySelector('[data-testid=p2-login]') && /Загрузка/.test(ov.textContent || ''),
      login: vis(ov) && !!ov.querySelector('[data-testid=p2-login]'),
      pnav: pnav ? pnav.items.map((i) => i.label) : null, mode: st ? st.mode : null, offline: st ? !!st.offline : null,
      hint: (document.getElementById('toast-container') || {}).innerText || '' });
  };
  setInterval(shot, 100);
  document.addEventListener('DOMContentLoaded', shot);
};

const framesOf = (page) => page.evaluate(() => window.__p2frames || []).catch(() => []);
const label = (f) => f.menu.filter((m) => m !== 'Настройки').join(', ');
/** Кадры, где в меню есть пункт вне разрешённых (allowed) или из прежнего меню. */
const foreign = (frames, allowed) => frames.filter((f) => f.menu.some((m) => OLD.includes(m) || !allowed.includes(m)));
/** Первый кадр с меню, равным ожидаемому. */
const firstEqual = (frames, want) => frames.find((f) => JSON.stringify(f.menu) === JSON.stringify(want));
const summary = (frames) => {
  const out = []; let prev = '';
  for (const f of frames) {
    const k = [label(f) || '—', f.e404 ? '404' : '', f.notConnected ? 'не подключён' : '', f.loading ? 'загрузка' : '', f.login ? 'вход' : '',
      'подвкладки ' + (f.pnav ? f.pnav.length : '—'), f.mode || '', f.offline ? 'без связи' : ''].filter(Boolean).join(' · ');
    if (k !== prev) out.push(f.t + ' мс: ' + k);
    prev = k;
  }
  return out;
};

/** Вход с сетью: копия прав на устройстве; эталон меню и подвкладок — по ответу сервера. */
async function prepare(out, tag, width) {
  freshProfile(out, tag);
  resetNet();
  await start();
  const { ctx, page } = await launch(out, tag, { width, height: 900 });
  await signIn(page);
  await page.goto(APP + '/#/planfact/vor'); await page.waitForTimeout(7000);
  const ref = await page.evaluate(() => ({
    menu: [...new Set([...document.querySelectorAll('#app-sidebar [data-sidebar-module-id], #app-sidebar [data-sidebar-settings], #mobile-module-menu button')]
      .map((e) => (e.textContent || '').replace(/●/g, '').trim().replace(/\s+/g, ' ')).filter(Boolean))].sort(),
    pnav: (window.RBI.platformNav && window.RBI.platformNav.items.map((i) => i.label)) || null }));
  note('эталон с сетью: меню ' + JSON.stringify(ref.menu) + ', подвкладки ' + JSON.stringify(ref.pnav));
  await ctx.close();
  return ref;
}

async function reopen(out, tag, width, hash = '#/planfact/vor') {
  const { ctx, page } = await launch(out, tag, { width, height: 900 });
  await ctx.addInitScript(RECORDER);
  await page.clock.install();
  await page.goto(APP + '/' + hash).catch((e) => note('goto: ' + e.message.split('\n')[0]));
  return { ctx, page };
}

function record(tag, frames, extra = {}) {
  menuMeasures.push({ tag, ...extra, frames: summary(frames) });
  for (const l of summary(frames).slice(0, 25)) note(l);
}

/** Сервер завис при запуске → меню из копии; сервер ответил (у компании убрали Стройконтроль) → меню обновилось без перезагрузки. */
async function hang(out, width) {
  const tag = 'm-hang' + width;
  note(`== ${tag}: вход с сетью → сервер завис → открыть #/planfact/vor → сервер ответил без Стройконтроля`);
  const ref = await prepare(out, tag, width);
  net.mode = 'hang';
  const { ctx, page } = await reopen(out, tag, width);
  await page.waitForTimeout(12000);
  let frames = await framesOf(page);
  record(tag + ' (завис)', frames);
  await page.screenshot({ path: join(out, tag + '-hang.png') });
  const bad = foreign(frames, ref.menu);
  ok(!bad.length, `${tag}: ни на одном кадре нет старого меню и пунктов вне копии`, bad.length ? bad[0].t + ' мс: ' + label(bad[0]) : frames.length + ' кадров');
  const e404 = frames.find((f) => f.e404 || f.notConnected);
  ok(!e404, `${tag}: ни на одном кадре нет «Модуль 404» / «не подключён»`, e404 ? e404.t + ' мс' : '');
  const good = firstEqual(frames, ref.menu);
  ok(!!good && good.t <= 2000, `${tag}: правильное меню ≤ 2 с`, good ? good.t + ' мс' : 'не появилось');
  const last = frames[frames.length - 1] || {};
  ok(last.hash === '#/planfact/vor', `${tag}: адрес остался #/planfact/vor`, String(last.hash));
  ok(!!last.pnav && last.pnav.length > 0 && last.pnav.includes('ВОР'), `${tag}: подвкладки План/Факта есть (ВОР)`, JSON.stringify(last.pnav));
  // этап 3: без связи ВОР — по копии для просмотра (открывали с сетью при входе) или «Нужен интернет», если копии нет
  const pf = await page.evaluate(() => { const v = document.getElementById('tab-planfact'); return !!v && v.classList.contains('active') && v.getBoundingClientRect().height > 0
    && (!!v.querySelector('[data-testid=pf-need-internet]') || /ВОР/.test(v.innerText)); }).catch(() => false);
  ok(pf, `${tag}: открыт раздел План/Факт (ВОР — по копии или «Нужен интернет»)`);

  // сервер ожил; у компании больше нет Стройконтроля — меню обновляется само (фоновая проверка раз в минуту), без перезагрузки
  const mods = COMPANY.modules.slice();
  COMPANY.modules = mods.filter((m) => m !== 'construction');
  net.mode = 'ok'; releaseHeld();
  await page.evaluate(() => { window.__p2same = 1; });
  await page.clock.fastForward(61000).catch(() => {});
  await page.waitForTimeout(8000);
  frames = await framesOf(page);
  const after = frames[frames.length - 1] || {};
  const same = await page.evaluate(() => window.__p2same === 1).catch(() => false);
  note('после ответа сервера: ' + label(after) + (after.offline ? ' · без связи' : ''));
  ok(same && !after.menu.some((m) => /Стройконтроль/.test(m)) && after.menu.some((m) => /План\/Факт/.test(m)) && !after.offline,
    `${tag}: сервер ответил — Стройконтроль исчез из меню без перезагрузки`, JSON.stringify(after.menu));
  await page.screenshot({ path: join(out, tag + '-ok.png') });
  COMPANY.modules = mods;
  await ctx.close(); await stop();
}

/** Права на сервере изменились: у компании выключили План/Факт, человек открыл ВОР по копии. */
async function revoke(out) {
  const tag = 'm-revoke';
  note(`== ${tag}: копия с План/Фактом → сервер без План/Факта → уход с ВОР с подсказкой`);
  const ref = await prepare(out, tag, 1440);
  const mods = COMPANY.modules.slice();
  COMPANY.modules = mods.filter((m) => m !== 'planfact');
  const { ctx, page } = await reopen(out, tag, 1440);
  await page.waitForTimeout(9000);
  const frames = await framesOf(page);
  record(tag, frames);
  const last = frames[frames.length - 1] || {};
  ok(!last.menu.some((m) => /План\/Факт/.test(m)), `${tag}: пункт План/Факт исчез`, JSON.stringify(last.menu));
  ok(!/^#\/planfact/.test(last.hash), `${tag}: с экрана ВОР — уход`, String(last.hash));
  ok(frames.some((f) => /Доступ к разделу изменился/.test(f.hint)), `${tag}: подсказка «Доступ к разделу изменился»`);
  const bad = foreign(frames, ref.menu);
  ok(!bad.length, `${tag}: пунктов вне копии не было`, bad.length ? label(bad[0]) : '');
  await page.screenshot({ path: join(out, tag + '.png') });
  COMPANY.modules = mods;
  await ctx.close(); await stop();
}

/** Вход сохранён, копии прав нет (входили до P2-0058 / копию стёрли); сервер завис → экран загрузки, не старое меню. */
async function first(out) {
  const tag = 'm-first';
  note(`== ${tag}: вход есть, копии прав нет, сервер завис → экран загрузки`);
  const ref = await prepare(out, tag, 1440);
  net.mode = 'hang';   // сервер молчит — приложение не перезапишет копию, пока её стираем
  let { ctx, page } = await launch(out, tag, { width: 1440, height: 900 });
  await page.goto(APP + '/#/settings').catch(() => {});
  await page.waitForTimeout(1500);
  const left = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('platform2_device_access_')) localStorage.removeItem(k);
    return Object.keys(localStorage).filter((k) => k.startsWith('platform2_device_access_')).length; });
  ok(left === 0, `${tag}: копия прав стёрта`);
  await ctx.close();
  ({ ctx, page } = await reopen(out, tag, 1440));
  await page.waitForTimeout(9000);
  const frames = await framesOf(page);
  record(tag, frames);
  const bad = foreign(frames, ref.menu);
  ok(!bad.length, `${tag}: старого меню нет ни на одном кадре`, bad.length ? bad[0].t + ' мс: ' + label(bad[0]) : '');
  const tail = frames.filter((f) => f.t > 1500);
  ok(tail.length > 0 && tail.every((f) => f.loading), `${tag}: до ответа сервера — экран загрузки`);
  ok(!frames.some((f) => f.e404 || f.notConnected), `${tag}: «Модуль 404» / «не подключён» нет`);
  net.mode = 'ok'; releaseHeld();
  await page.clock.fastForward(61000).catch(() => {});
  await page.waitForTimeout(8000);
  const f2 = await framesOf(page);
  const last = f2[f2.length - 1] || {};
  note('после ответа сервера: ' + label(last) + (last.loading ? ' · загрузка' : ''));
  ok(!last.loading && JSON.stringify(last.menu) === JSON.stringify(ref.menu), `${tag}: сервер ответил — меню по ответу, загрузка скрыта`, JSON.stringify(last.menu));
  await ctx.close(); await stop();
}

/** Другой пользователь на том же браузере: копия первого не применяется ни на кадр. */
async function other(out) {
  const tag = 'm-other';
  note(`== ${tag}: вошёл test@ → вышел → вошёл other@ (у него компаний нет) → сервер завис → перезапуск`);
  await prepare(out, tag, 1440);
  let { ctx, page } = await launch(out, tag, { width: 1440, height: 900 });
  await page.goto(APP + '/#/settings'); await page.waitForTimeout(5000);
  await page.evaluate(async () => { await window.RBI.platform2.signOut(); });
  await page.waitForTimeout(1500);
  await signIn(page, 'other@stand.local');
  await ctx.close();
  net.mode = 'hang';
  ({ ctx, page } = await reopen(out, tag, 1440, '#/settings'));
  await page.waitForTimeout(9000);
  const frames = await framesOf(page);
  record(tag, frames);
  const leak = frames.filter((f) => f.menu.some((m) => /План\/Факт|Качество|Стройконтроль/.test(m) || OLD.includes(m)));
  ok(!leak.length, `${tag}: модулей чужой копии и старого меню нет ни на одном кадре`, leak.length ? leak[0].t + ' мс: ' + label(leak[0]) : '');
  await ctx.close(); await stop();
}

/** После сценария сервер стенда — как был (погода «ok», модули компании), даже если сценарий упал: следующие сценарии его не наследуют. */
const clean = (fn) => async () => {
  const mods = COMPANY.modules.slice();
  try { await fn(); } finally { COMPANY.modules = mods; net.mode = 'ok'; releaseHeld(); }
};

export function menuScenarios(out) {
  return {
    'm-hang': clean(() => hang(out, 1440)), 'm-hang375': clean(() => hang(out, 375)), 'm-revoke': clean(() => revoke(out)), 'm-first': clean(() => first(out)),
    'm-other': clean(() => other(out))
  };
}
export function saveMenuMeasures(out) { if (menuMeasures.length) writeFileSync(join(out, 'menu.json'), JSON.stringify(menuMeasures, null, 2)); }
