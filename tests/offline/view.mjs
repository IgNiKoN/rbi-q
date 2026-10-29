// P2-0060 этап 2: копия для просмотра — Сводка План/Факта без сети (стенд test:offline).
// v-summary375 (светлая) / v-summary1440 (тёмная) — с сетью открыть Сводку → закрыть → без сети открыть заново → те же цифры, пометка «Без сети · данные на …»,
// «Даты проекта» неактивна; v-prefetch375/1440 — заранее «мои проекты» → без сети ВОР, Факт, шахматка, «Компания»; v-other — другой пользователь на том же браузере: своей копии нет → «Нужен интернет», цифр первого нет.
// Боевой сервер не используется (servers.mjs — подставной, lib.mjs отрезает rbi-q.ru).
import { join } from 'node:path';
import { start, stop, resetNet, stand, SUMMARY, APP } from './servers.mjs';
import { writeFileSync } from 'node:fs';
import { freshProfile, go, launch, note, ok, signIn } from './lib.mjs';

/** Текст Сводки без пометки и подписи кнопки дат (они и должны отличаться). */
const summaryText = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid=sm-tab]');
  if (!el) return null;
  const c = el.cloneNode(true);
  c.querySelectorAll('[data-testid=sm-dates-btn]').forEach((b) => b.remove());
  return c.innerText.replace(/\s+/g, ' ').trim();
}).catch(() => null);
const markText = (page) => page.locator('[data-testid=p2-offline-mark]').first().innerText().catch(() => '');
const openSummary = async (page) => { await page.goto(APP + '/#/planfact').catch((e) => note('goto: ' + e.message.split('\n')[0])); await page.waitForTimeout(8000); };

async function summary(out, width, scheme = 'light') {
  const tag = 'v-summary' + width;
  note(`== ${tag}: Сводка с сетью → закрыть → без сети открыть заново`);
  freshProfile(out, tag); resetNet();
  await start();
  let { ctx, page } = await launch(out, tag, { width, height: 900, scheme });
  await signIn(page);
  await openSummary(page);
  const on = await summaryText(page);
  ok(!!on && on.includes(SUMMARY.name), `${tag}: с сетью — Сводка объекта`, on ? on.slice(0, 120) : 'нет');
  ok(!(await page.locator('[data-testid=p2-offline-mark]').count()), `${tag}: с сетью пометки нет`);
  await page.screenshot({ path: join(out, tag + '-online.png'), fullPage: true });
  await ctx.close(); await stop();

  ({ ctx, page } = await launch(out, tag, { width, height: 900, offline: true, scheme }));
  await openSummary(page);
  const off = await summaryText(page);
  ok(off === on, `${tag}: без сети после перезапуска — те же цифры`, off === on ? '' : (off || 'нет').slice(0, 160));
  const mark = await markText(page);
  ok(/^Без сети · данные на \d\d:\d\d$/.test(mark), `${tag}: пометка «Без сети · данные на ЧЧ:ММ»`, mark);
  const btn = page.locator('[data-testid=sm-dates-btn]');
  ok(await btn.isDisabled().catch(() => false), `${tag}: «Даты проекта» неактивна`, await btn.innerText().catch(() => ''));
  ok(!(await page.locator('[data-testid=pf-need-internet]').count()), `${tag}: не «Нужен интернет» — данные из копии`);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(wide <= 0, `${tag}: без прокрутки вбок`, String(wide));
  await page.screenshot({ path: join(out, tag + '-offline.png'), fullPage: true });
  await ctx.close();
}

/** Другой пользователь на том же браузере: первый открыл Сводку (копия есть), второй — нет (у него сервер ответил ошибкой). */
async function other(out) {
  const tag = 'v-other';
  note(`== ${tag}: test@ открыл Сводку → вышел → other@ (Сводка не загрузилась) → без сети`);
  freshProfile(out, tag); resetNet();
  stand.user2Planfact = true;
  try {
    await start();
    let { ctx, page } = await launch(out, tag, { width: 1440, height: 900 });
    await signIn(page);
    await openSummary(page);
    ok(((await summaryText(page)) || '').includes(SUMMARY.name), `${tag}: первый пользователь — Сводка с сетью`);
    await page.evaluate(async () => { await window.RBI.platform2.signOut(); });
    await page.waitForTimeout(1500);
    await signIn(page, 'other@stand.local');
    await openSummary(page);
    await ctx.close(); await stop();

    ({ ctx, page } = await launch(out, tag, { width: 1440, height: 900, offline: true }));
    await openSummary(page);
    const body = await page.evaluate(() => (document.getElementById('tab-planfact') || document.body).innerText).catch(() => '');
    ok(!body.includes(SUMMARY.name) && !body.includes('42,5'), `${tag}: цифр первого пользователя нет`);
    ok(/Нужен интернет/.test(body), `${tag}: «Нужен интернет»`, body.replace(/\s+/g, ' ').slice(0, 140));
    const mark = await page.locator('[data-testid=p2-offline-mark]').first().innerText().catch(() => '');
    ok(!/данные на/.test(mark), `${tag}: пометки «данные на …» нет — данных экрана нет`, mark);
    await page.screenshot({ path: join(out, tag + '.png') });
    await ctx.close();
  } finally { stand.user2Planfact = false; }
}

const text = (page) => page.evaluate(() => (document.querySelector('#tab-planfact.active, #tab-planfact') || document.body).innerText.replace(/\s+/g, ' ')).catch(() => '');
const needNet = (page) => page.locator('[data-testid=pf-need-internet], [data-testid=co-need-internet]').count().catch(() => 0);

/** «Держать без сети»: вход с сетью, ВОР и Факт не открывать — заранее скачалось само; без сети ВОР, Факт, шахматка, места видны. */
async function prefetch(out, width) {
  const tag = 'v-prefetch' + width;
  note(`== ${tag}: с сетью — заранее «мои проекты» (ВОР и Факт не открывали) → без сети ВОР, Факт, шахматка, места`);
  freshProfile(out, tag); resetNet();
  await start();
  let { ctx, page } = await launch(out, tag, { width, height: 900 });
  await signIn(page);
  await go(page, '#/settings/company/objects', 6000);   // ядро платформы: «Компания → Проекты» — открыто с сетью (копия того, что открывали)
  const coOnline = await page.evaluate(() => document.body.innerText.includes('ЖК Тестовый'));
  let st = null;
  for (let i = 0; i < 20 && !st; i++) {
    await page.waitForTimeout(1500);
    st = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('platform2_offline_prefetch:'));
      return k ? JSON.parse(localStorage.getItem(k)).planfact || null : null; });
  }
  ok(!!st, `${tag}: заранее скачалось само (без нажатий, после запуска)`, st ? JSON.stringify(st.stats) : 'нет');
  if (st) { measures.push({ tag, ...st.stats }); note('заранее: ' + JSON.stringify(st.stats)); }
  const pp = st && st.stats && st.stats.perProject && st.stats.perProject[0];
  ok(!!pp && pp.bytes < 20 * 1024 * 1024, `${tag}: заранее на проект < 20 МБ`, pp ? (pp.bytes / 1024).toFixed(1) + ' КБ, чтений ' + pp.reads : '');
  await ctx.close(); await stop();

  ({ ctx, page } = await launch(out, tag, { width, height: 900, offline: true }));
  await page.goto(APP + '/#/planfact/vor/positions').catch(() => {}); await page.waitForTimeout(8000);
  let t = await text(page);
  ok(!(await needNet(page)) && t.includes('Кладка стен'), `${tag}: без сети ВОР → Позиции (не открывали) — видны`, t.slice(0, 120));
  ok(/Без сети · данные на/.test(t) && /только просмотр/.test(t), `${tag}: пометка «данные на …» и «только просмотр»`);
  await page.screenshot({ path: join(out, tag + '-vor.png'), fullPage: true });
  await go(page, '#/planfact/fact/chessboard', 5000);
  t = await text(page);
  ok(!(await needNet(page)) && /Этаж|Секция 1|Корпус 1/.test(t), `${tag}: без сети шахматка — места видны`, t.slice(0, 120));
  await page.screenshot({ path: join(out, tag + '-chess.png'), fullPage: true });
  await go(page, '#/planfact/fact', 5000);
  t = await text(page);
  ok(!(await needNet(page)) && /Корпус 1/.test(t), `${tag}: без сети Факт → Ввод — места видны`, t.slice(0, 120));
  const enter = page.locator('[data-testid=ft-enter], [data-testid=cb-enter]');
  ok(!(await enter.count()) || await enter.first().isDisabled(), `${tag}: «Внести» без сети неактивна (если есть)`);
  await go(page, '#/settings/company/objects', 5000);
  const co = await page.evaluate(() => document.body.innerText).catch(() => '');
  ok(!coOnline || (co.includes('ЖК Тестовый') && !(await needNet(page))), `${tag}: ядро платформы («Компания → Проекты», открывали с сетью) — без сети видно`);
  const add = page.locator('[data-testid=pj-add]');
  ok(!(await add.count()) || await add.first().isDisabled(), `${tag}: «+ Проект» без сети неактивна`);
  ok(/только просмотр/.test(co), `${tag}: в «Компании» — «только просмотр»`);
  await page.screenshot({ path: join(out, tag + '-company.png'), fullPage: true });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(wide <= 0, `${tag}: без прокрутки вбок`, String(wide));
  await ctx.close();
}

export const measures = [];
export function saveViewMeasures(out) { if (measures.length) writeFileSync(join(out, 'prefetch.json'), JSON.stringify(measures, null, 2)); }

export function viewScenarios(out) {
  return { 'v-summary375': () => summary(out, 375), 'v-summary1440': () => summary(out, 1440, 'dark'), 'v-other': () => other(out),
    'v-prefetch375': () => prefetch(out, 375), 'v-prefetch1440': () => prefetch(out, 1440) };
}
