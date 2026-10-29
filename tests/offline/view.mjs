// P2-0060 этап 2: копия для просмотра — Сводка План/Факта без сети (стенд test:offline).
// v-summary375 (светлая) / v-summary1440 (тёмная) — с сетью открыть Сводку → закрыть → без сети открыть заново → те же цифры, пометка «Без сети · данные на …»,
// «Даты проекта» неактивна; v-other — другой пользователь на том же браузере: своей копии нет → «Нужен интернет», цифр первого нет.
// Боевой сервер не используется (servers.mjs — подставной, lib.mjs отрезает rbi-q.ru).
import { join } from 'node:path';
import { start, stop, resetNet, stand, SUMMARY, APP } from './servers.mjs';
import { freshProfile, launch, note, ok, signIn } from './lib.mjs';

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
    ok(!(await page.locator('[data-testid=p2-offline-mark]').count()), `${tag}: пометки «данные на …» нет — данных экрана нет`);
    await page.screenshot({ path: join(out, tag + '.png') });
    await ctx.close();
  } finally { stand.user2Planfact = false; }
}

export function viewScenarios(out) {
  return { 'v-summary375': () => summary(out, 375), 'v-summary1440': () => summary(out, 1440, 'dark'), 'v-other': () => other(out) };
}
