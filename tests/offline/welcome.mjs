// P2-0074: первый экран — приветствие при первом входе, потом последний раздел, без него — по работе человека; одно правило
// для входа почтой и для открытия без адреса. w375 (светлая), w1440 (тёмная): анимация один раз, «Уменьшить движение» — без неё,
// плитки = доступные разделы, плитка → раздел и он последний, повторный запуск — сразу раздел, без последнего — по роли
// (у вошедшего стенда «Компания» — руководитель → приветствие без анимации), запуск без сети — по копии прав, ссылка не перехватывается.
import { join } from 'node:path';
import { start, stop, resetNet, APP } from './servers.mjs';
import { freshProfile, launch, note, ok, signIn } from './lib.mjs';

const view = (page) => page.evaluate(() => {
  const w = document.querySelector('[data-testid=p2-welcome]');
  const tile = document.querySelector('[data-testid=p2-welcome-tile]');
  const vis = !!w && !!w.closest('.view-section.active') && w.getBoundingClientRect().height > 0;
  return { hash: location.hash, welcome: vis, animate: w ? w.getAttribute('data-animate') : null,
    tiles: [...document.querySelectorAll('[data-testid=p2-welcome-tile] .p2w-t')].map((e) => e.textContent),
    anim: tile ? getComputedStyle(tile).animationName : '', title: (document.querySelector('.p2w-h') || {}).textContent || '',
    last: localStorage.getItem('rbi_last_module_hash'), wide: document.scrollingElement.scrollWidth - window.innerWidth,
    nav: (() => { const n = document.getElementById('main-bottom-nav'); return !!n && getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().height > 0; })(),
    nav2: (() => { const n = document.getElementById('app-nav2'); return !!n && getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden' && n.getBoundingClientRect().width > 0; })(),
    // верх экрана не под шапкой: подпись / заголовок ниже закреплённой шапки или верхней полосы ПК
    top: (() => { const t = document.querySelector('.p2w-eyebrow') || document.querySelector('.p2w-h'); if (!t) return null;
      const bars = ['main-header', 'app-desk-topbar'].map((id) => document.getElementById(id)).filter((b) => b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height > 0);
      return Math.round(t.getBoundingClientRect().top - Math.max(0, ...bars.map((b) => b.getBoundingClientRect().bottom))); })(),
    topbar: (() => { const b = document.getElementById('app-desk-topbar'); return !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height > 0; })() };
});
const reopenAt = async (out, tag, opts, hash = '') => {
  const r = await launch(out, tag, opts);
  await r.page.goto(APP + '/' + hash).catch((e) => note('goto: ' + e.message.split('\n')[0]));
  await r.page.waitForTimeout(7000);
  return r;
};

async function welcome(out, width, scheme) {
  const tag = 'w' + width;
  const opts = { width, height: width < 768 ? 812 : 900, scheme };
  note(`== ${tag}: первый вход → приветствие; плитка → раздел; повтор → раздел; без последнего → по роли; без сети; ссылка`);
  freshProfile(out, tag); resetNet();
  await start();
  let { ctx, page } = await launch(out, tag, opts);
  try {
    await signIn(page);
    let v = await view(page);
    ok(v.hash === '#/welcome' && v.welcome, `${tag}: первый вход — приветствие`, JSON.stringify({ hash: v.hash, welcome: v.welcome }));
    ok(v.animate === '1' && v.anim === 'p2w-in', `${tag}: первый показ — с анимацией`, v.animate + ' ' + v.anim);
    ok(/^Добро пожаловать, Иванов Иван$/.test(v.title), `${tag}: по имени из профиля`, v.title);
    ok(JSON.stringify(v.tiles) === JSON.stringify(['Качество', 'Стройконтроль', 'План/Факт', 'Компания']), `${tag}: плитки — доступные разделы`, JSON.stringify(v.tiles));
    ok(v.wide <= 0, `${tag}: без прокрутки вбок`, String(v.wide));
    ok(!v.nav && !v.nav2, `${tag}: подвкладок модуля на приветствии нет`, JSON.stringify({ nav: v.nav, nav2: v.nav2 }));
    ok(v.top !== null && v.top >= 8, `${tag}: верх приветствия не под шапкой`, String(v.top));
    if (width >= 1280) {
      ok(v.topbar, `${tag}: на ПК — верхняя полоса с названием и пользователем`);
      const left = await page.evaluate(() => Math.round(document.getElementById('app-desk-topbar').getBoundingClientRect().left));
      ok(left === 88, `${tag}: на ПК полоса и экран — сразу за боковым меню (второго столбца нет)`, String(left));
    }
    await page.screenshot({ path: join(out, `${tag}-welcome.png`), fullPage: true });
    // «Уменьшить движение»: признак снят — приветствие снова «первое», но анимации нет
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.AppRouter.navigate('#/settings')); await page.waitForTimeout(1500);
    ok(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('platform2_welcome_seen_'))), `${tag}: ушли с приветствия — «приветствие было» отмечено`);
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('platform2_welcome_seen_')) localStorage.removeItem(k); });
    await page.evaluate(() => window.AppRouter.navigate('#/welcome')); await page.waitForTimeout(1500);
    v = await view(page);
    const op = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=p2-welcome-tile]')).opacity);
    ok(v.welcome && v.animate === '1' && v.anim === 'none' && op === '1', `${tag}: «Уменьшить движение» — без анимации, всё видно сразу`, v.anim + ' ' + op);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    ok(v.last !== '#/welcome', `${tag}: приветствие последним разделом не запоминается`, String(v.last));
    // плитка «Качество» → Осмотр, он последний
    await page.locator('[data-testid=p2-welcome-tile][data-module=quality]').click();
    await page.waitForTimeout(3000);
    v = await view(page);
    ok(v.hash === '#/quality/audit' && v.last === '#/quality/audit', `${tag}: плитка → Осмотр, запомнен последним`, v.hash + ' / ' + v.last);
    ok(!(await page.evaluate(() => document.body.classList.contains('p2-welcome-on'))), `${tag}: ушли с приветствия — оболочка как в разделе`);
    await page.goBack(); await page.waitForTimeout(2000);
    v = await view(page);
    ok(v.hash === '#/welcome' && v.welcome && v.animate === '0', `${tag}: «Назад» — приветствие, без анимации`, v.hash + ' ' + v.animate);
    await ctx.close();
    // повторный запуск без адреса — сразу последний раздел
    ({ ctx, page } = await reopenAt(out, tag, opts));
    v = await view(page);
    ok(v.hash === '#/quality/audit' && !v.welcome, `${tag}: повторный запуск — последний раздел`, v.hash);
    // последнего нет → по роли: у вошедшего стенда «Компания» (руководитель) → приветствие без анимации
    await page.evaluate(() => localStorage.removeItem('rbi_last_module_hash'));
    await ctx.close();
    ({ ctx, page } = await reopenAt(out, tag, opts));
    v = await view(page);
    ok(v.hash === '#/welcome' && v.welcome && v.animate === '0', `${tag}: без последнего, руководитель — приветствие без анимации`, v.hash + ' ' + v.animate);
    await ctx.close();
    // ссылка на экран — открывается она, приветствие не перехватывает (даже если его ещё не было)
    ({ ctx, page } = await launch(out, tag, opts));
    await page.goto(APP + '/').catch(() => {}); await page.waitForTimeout(3000);
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('platform2_welcome_seen_')) localStorage.removeItem(k); });
    await ctx.close();
    ({ ctx, page } = await reopenAt(out, tag, opts, '#/planfact'));
    v = await view(page);
    ok(/^#\/planfact/.test(v.hash) && !v.welcome, `${tag}: ссылка на План/Факт — открыт он`, v.hash);
    await ctx.close();
    // запуск без сети, без адреса — правило по копии прав на устройстве (приветствие не было → приветствие)
    ({ ctx, page } = await reopenAt(out, tag, { ...opts, offline: true }));
    v = await view(page);
    ok(v.hash === '#/welcome' && v.welcome && v.tiles.length === 4, `${tag}: без сети — приветствие по копии прав`, v.hash + ' ' + JSON.stringify(v.tiles));
    await page.screenshot({ path: join(out, `${tag}-offline.png`) });
  } finally {
    await ctx.close().catch(() => {}); await stop();
  }
}

export function welcomeScenarios(out) {
  return { w375: () => welcome(out, 375, 'light'), w1440: () => welcome(out, 1440, 'dark') };
}
