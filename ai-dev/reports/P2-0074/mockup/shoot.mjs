import { readFileSync } from 'node:fs';
import { start, stop, resetNet } from '/Users/igor/dev/platform-2-core-0074/tests/offline/servers.mjs';
import { freshProfile, launch, signIn, go } from '/Users/igor/dev/platform-2-core-0074/tests/offline/lib.mjs';
const out = process.cwd() + '/out';
const MOCK = readFileSync('welcome-mock.js', 'utf8');
const COMPANY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5"/><path d="M9 10h.01M12 10h.01M15 10h.01"/></svg>';
const ALL = [['Качество', 'КАЧЕСТВО', 'Осмотры на объекте по чек-листам, замечания инженеру, аналитика'],
  ['Стройконтроль', 'СТРОЙКОНТРОЛЬ', 'Замечания подрядчикам, приёмка работ, предписания'],
  ['План/Факт', 'ПЛАН/ФАКТ', 'ВОР, график работ и выполнение по дням'],
  ['Компания', null, 'Сотрудники и роли, объекты и места, справочники']];
const SETS = { A: { tiles: ['Качество'], role: 'Инженер качества' }, B: { tiles: ['Качество', 'Стройконтроль'], role: 'Инженер' },
  C: { tiles: ['Качество', 'Стройконтроль', 'План/Факт', 'Компания'], role: 'Руководство' } };
const only = process.argv[2] || 'all';
async function session(w, scheme, fn) {
  const tag = `s-${w}-${scheme}`; freshProfile(out, tag); resetNet(); await start();
  const { ctx, page } = await launch(out, tag, { width: w, height: w < 768 ? 812 : 900, scheme });
  try { await signIn(page); await page.waitForTimeout(6000); await fn(page, w < 768); } finally { await ctx.close(); await stop(); }
}
async function now(page, phone, w, scheme) {
  await page.screenshot({ path: `${out}/now-quality-${w}-${scheme}.png`, fullPage: true });
  await go(page, '#/planfact', 6000);
  await page.screenshot({ path: `${out}/now-planfact-${w}-${scheme}.png`, fullPage: true });
}
async function mock(page, phone, set, animate) {
  await go(page, '#/quality/audit', 3000);
  await page.addScriptTag({ content: MOCK });
  await page.evaluate(({ phone, set, ALL, COMPANY_ICON, animate }) => {
    const icons = {};
    document.querySelectorAll('#app-sidebar .app-sidebar-item').forEach((b) => { const l = (b.getAttribute('title') || b.textContent || '').trim(); icons[l] = b.querySelector('svg')?.outerHTML; b.classList.remove('active');
      const keep = set.tiles.some((t) => l === t || (t === 'Стройконтроль' && /^Стройконтроль/.test(l) && set.tiles.length > 2)) || /Настройки/.test(l); b.style.display = keep ? '' : 'none'; });
    const tiles = ALL.filter(([t]) => set.tiles.includes(t)).map(([t, lab, d]) => ({ title: t, desc: d, icon: icons[t] || COMPANY_ICON }));
    const el = window.__mockWelcome({ name: 'Иванов Иван', company: 'Тест-Строй', role: set.role, tiles, animate, phone });
    if (!phone) document.body.style.setProperty('--desk-chrome', '88px');
    const nav2 = document.getElementById('app-nav2'); if (nav2) nav2.style.display = 'none';
    for (const id of ['main-bottom-nav', 'header-dashboard', 'header-data-block', 'mini-sync-toast', 'audit-desktop-shell']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    document.querySelectorAll('#main-header .header-top-row > div:last-child').forEach((e) => { e.style.visibility = 'hidden'; });
    const root = phone ? document.getElementById('app-content') : document.getElementById('app-root');
    root.replaceChildren(el);
    if (!phone) { root.style.paddingTop = '72px'; root.classList.remove('max-w-4xl'); }
    else { const h = document.getElementById('main-header').getBoundingClientRect().height; const ar = document.getElementById('app-root');
      ar.style.paddingTop = h + 'px'; ar.style.marginTop = '0'; root.style.marginTop = '0'; root.style.paddingTop = '0'; }
    window.scrollTo(0, 0);
  }, { phone, set, ALL, COMPANY_ICON, animate });
  await page.mouse.move(1, 1); await page.waitForTimeout(300);
}
const W = [[375, 'light'], [1440, 'light'], [375, 'dark'], [1440, 'dark']];
for (const [w, scheme] of W) {
  await session(w, scheme, async (page, phone) => {
    if (only === 'all' || only === 'now') await now(page, phone, w, scheme);
    for (const k of (scheme === 'light' ? ['A', 'B', 'C'] : ['C'])) {
      await mock(page, phone, SETS[k], false);
      await page.screenshot({ path: `${out}/new-${k}-${w}-${scheme}.png`, fullPage: true });
    }
    if (w === 1440 && scheme === 'light') {
      await mock(page, phone, SETS.C, true);
      for (const t of [150, 400, 700, 1200]) {
        await page.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), t);
        await page.screenshot({ path: `${out}/anim-${t}.png`, clip: { x: 88, y: 0, width: 1352, height: 620 } });
      }
    }
  });
}
