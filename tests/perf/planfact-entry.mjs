// P2-0078 этап 5: вход нового устройства и открытие План/Факта у сотрудника с 20 объектами — стенд «без сети» (подставной сервер,
// боевой не используется), ответ сервера с задержкой (--latency, мс). Замер: запросов к серверу за первые --window с после входа
// (всего, прав pf_my_permissions*, «заранее» План/Факта), «План/Факт открылся» — от перехода до списка объектов, сколько всего ушло
// на «заранее» и когда оно началось. Тот же файл запускается на прежнем коде (сравнение «до / после»).
// node tests/perf/planfact-entry.mjs [--projects 20] [--latency 100] [--window 30] [--width 375] [--out папка] [--label до|после]
// Порты — P2_OFFLINE_APP_PORT / P2_OFFLINE_API_PORT (по умолчанию 8981 / 8982).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.P2_OFFLINE_APP_PORT ||= '8981';
process.env.P2_OFFLINE_API_PORT ||= '8982';
const { start, stop, stand, net, log, resetNet, COMPANY } = await import('../offline/servers.mjs');
const { freshProfile, launch, signIn } = await import('../offline/lib.mjs');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt('projects', 20)), LAT = Number(opt('latency', 100)), WIN = Number(opt('window', 30)), WIDTH = Number(opt('width', 375));
const OUT = opt('out', 'perf-out/planfact-entry'), LABEL = opt('label', 'замер');
mkdirSync(OUT, { recursive: true });

const projects = Array.from({ length: N }, (_, i) => ({ id: `pe-${String(i + 1).padStart(2, '0')}`, name: `ЖК Замер ${String(i + 1).padStart(2, '0')}`,
  company_id: COMPANY.id, archived_at: null }));
const PERMS = ['planfact.fact.view', 'planfact.fact.create', 'planfact.vor.view'];

resetNet();
stand.rpc = { pf_my_projects: () => projects, pf_my_permissions: () => PERMS };
net.latencyMs = LAT;
await start();
const tag = `${LABEL}-w${WIDTH}`;
freshProfile(OUT, tag);
const { ctx, page } = await launch(OUT, tag, { width: WIDTH, height: WIDTH < 768 ? 812 : 900 });
const stamp = [];   // [мс от входа, запрос]
let t0 = 0;
page.on('request', (r) => { if (t0 && r.url().includes(':' + process.env.P2_OFFLINE_API_PORT)) stamp.push([Date.now() - t0, r.method() + ' ' + new URL(r.url()).pathname]); });
t0 = Date.now();
await signIn(page);   // вход (6 с ожидания после кнопки — как у человека)
// открыть План/Факт (Сводка: портфель объектов — строка объекта стенда «ЖК Тестовый»)
const tOpen = Date.now();
await page.evaluate(() => { location.hash = '#/planfact'; }).catch(() => {});
let openMs = null;
for (let k = 0; k < 200; k++) {
  const seen = await page.evaluate(() => { const v = document.querySelector('.view-section.active'); return !!v && /ЖК Тестовый/.test(v.innerText); }).catch(() => false);
  if (seen) { openMs = Date.now() - tOpen; break; }
  await page.waitForTimeout(100);
}
// дождаться конца окна и «заранее» (до 3 минут)
const until = Math.max(WIN * 1000, 180000);
while (Date.now() - t0 < until) {
  await page.waitForTimeout(2000);
  const last = stamp.length ? stamp[stamp.length - 1][0] : 0;
  // «заранее» начинается не раньше 45 с после запуска (P2-0078) — ждём минимум 75 с, затем 15 с тишины — закончилось
  if (Date.now() - t0 > Math.max(WIN * 1000, 75000) && Date.now() - t0 - last > 15000) break;
}
await ctx.close(); await stop();

const inWin = stamp.filter(([t]) => t <= WIN * 1000);
const isPerm = (p) => /\/rpc\/pf_my_permissions/.test(p);
const PF = /\/rpc\/pf_(vor_|fact_|summary_|ks2_|list_locations|my_area|my_inbox|estimate)/;
const pfAt = stamp.filter(([, p]) => PF.test(p)).map(([t]) => t);
const pfReads = stamp.filter(([, p]) => PF.test(p) && !/pf_my_inbox|pf_summary_portfolio/.test(p));
const r = {
  label: LABEL, width: WIDTH, projects: N, latencyMs: LAT, windowSec: WIN,
  openPlanfactMs: openMs,
  requestsInWindow: inWin.length,
  permissionCallsInWindow: inWin.filter(([, p]) => isPerm(p)).length,
  planfactReadsInWindow: inWin.filter(([, p]) => PF.test(p)).length,
  permissionCallsTotal: stamp.filter(([, p]) => isPerm(p)).length,
  planfactReadsTotal: pfAt.length,
  requestsTotal: stamp.length,
  firstPlanfactReadSec: pfAt.length ? Math.round(pfAt[0] / 100) / 10 : null,
  // «заранее» по объектам (без Входящих и портфеля Сводки — их читает и первый экран)
  prefetchStartSec: pfReads.length ? Math.round(pfReads[0][0] / 100) / 10 : null,
  prefetchEndSec: pfReads.length ? Math.round(pfReads[pfReads.length - 1][0] / 100) / 10 : null
};
console.log(JSON.stringify(r));
writeFileSync(join(OUT, `planfact-entry-${tag}.json`), JSON.stringify({ ...r, requests: stamp }, null, 1));
process.exit(0);
