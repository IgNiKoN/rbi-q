// P2-0077 (ТД 413): автоплан задач Качества и синхронизация. Журнал iPhone владельца 31.10.2026: у руководителя Качества
// каждый проход «отправлено 84», затем «85» — пересчёт плана после прохода сдвигал сроки задач всех инженеров и слал их снова.
// q-admin375, q-admin1440 — руководитель: на устройстве проверки и задачи инженера «Петров Пётр» (план «на всех» по кнопке
//   «Синхронизировать»); три прохода синхронизации подряд → задачи и профиль не уходят, в журнале «отправлено 0», сроки инженера прежние.
// q-eng375, q-eng1440 — инженер: свои новые задачи уходят один раз, повторный проход — 0, закрытая своя задача — ровно 1.
// Сервер — стенд (servers.mjs), боевой не используется.
import { join } from 'node:path';
import { start, stop, stand, sendsAll, resetNet, log as apiLog } from './servers.mjs';
import { freshProfile, go, launch, note, ok, signIn } from './lib.mjs';

const ENGINEER = { actions: ['quality.edit', 'quality.view'], templates: [], projects: null, contractor: null, objects: null, container: null };
const OTHER = 'Петров Пётр';

/** Проверки инженера на устройстве: 3 пары «подрядчик × вид работ» без акта-эталона, по 2 проверки. */
const seedChecks = (page, name) => page.evaluate(async (n) => {
  const S = window.RBI.services;
  const list = [];
  ['Альфа-Q', 'Бета-Q', 'Гамма-Q'].forEach((c, i) => {
    for (let k = 0; k < 2; k++) {
      list.push({ id: `q-${n.length}-${i}-${k}`, date: new Date(Date.now() - (20 + k) * 86400000).toISOString(), inspectorName: n, contractorName: c,
        templateKey: `usr_qt${i}`, templateTitle: `Работа ${i}`, projectName: 'Объект Q', object: 'Объект Q', metrics: { checkedCount: 5 }, state: {},
        status: 'done', source: 'cloud', syncStatus: 'synced', sync_status: 'synced', updatedAt: new Date().toISOString() });
    }
  });
  for (const r of list) { await S.storage.put('app_history', r); window.contractorArray.push(r); }
  return list.length;
}, name);

/** Задачи на устройстве: { все, по инженеру, к отправке }. */
const taskState = (page) => page.evaluate(() => {
  const all = (window.rbi_tasksData || []).filter((t) => t && !t._deleted && !t.is_deleted);
  return { all: all.length, toSend: all.filter((t) => (t.syncStatus || t.sync_status) !== 'synced').length,
    tasks: all.map((t) => ({ id: t.id, eng: t.engineerName, title: t.title, date: t.date, target: t.target, status: t.status })) };
});
const markSynced = (page) => page.evaluate(async () => {
  for (const t of window.rbi_tasksData || []) { t.syncStatus = 'synced'; t.sync_status = 'synced'; await window.RBI.services.storage.put('rbi_tasks', t); }
});
const idle = (page) => page.waitForFunction(() => !window.isSyncing && !window.isPlanGenerating, null, { timeout: 60000 }).catch(() => {});
const profileSends = () => apiLog.filter((l) => l.startsWith('POST /rest/v1/rbi_engineer_profiles')).length;
const taskSends = () => [...sendsAll].filter(([k]) => k.startsWith('rbi_tasks:')).reduce((s, [, v]) => s + v, 0);

/** Один проход синхронизации кнопкой: сколько задач ушло на сервер и что записал журнал («отправлено N»). */
async function pass(page) {
  await idle(page);
  const before = taskSends(), beforeProfile = profileSends();
  await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {});
  await page.waitForTimeout(1500);
  await idle(page);
  await page.waitForTimeout(1000);
  const end = await page.evaluate(() => { const l = (window.RbiSyncJournal && window.RbiSyncJournal.list()) || []; return l.filter((e) => e.k === 'end').pop() || null; });
  return { tasks: taskSends() - before, profile: profileSends() - beforeProfile, pushed: end ? end.pushed : null };
}

async function admin(out, width) {
  const tag = 'q-admin' + width;
  note(`== ${tag}: руководитель Качества — задачи инженера «${OTHER}» не переписываются и не уходят при каждом проходе`);
  freshProfile(out, tag); resetNet();
  await start();
  const { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900 });
  try {
    await signIn(page);
    await idle(page);
    const role = await page.evaluate(() => ({ admin: window.RBI.services.permissions.isAdmin(), me: window.RBI.services.permissions.getCurrentEngineerName() }));
    ok(role.admin, `${tag}: роль экрана Качества — руководитель (isAdmin)`, JSON.stringify(role));
    await seedChecks(page, OTHER);
    // план «на всех» — кнопкой «Синхронизировать» (как задачи инженера пришли бы с его телефона); затем «отправлены»
    await page.evaluate(() => window.gameForceUpdatePlan(true, { allEngineers: true }));
    await markSynced(page);
    const was = await taskState(page);
    const engWas = was.tasks.filter((t) => t.eng === OTHER);
    ok(engWas.some((t) => /Эталон/.test(t.title)), `${tag}: у инженера есть задачи, в т. ч. «Приёмка эталона»`, `${engWas.length} шт.`);
    await page.waitForTimeout(50);
    const p = [await pass(page), await pass(page), await pass(page)];
    note(`${tag}: проходы — ${p.map((x, i) => `${i + 1}: задач ушло ${x.tasks}, журнал «отправлено ${x.pushed}», профиль ${x.profile}`).join('; ')}`);
    ok(p[1].tasks === 0 && p[2].tasks === 0, `${tag}: проходы 2 и 3 — задачи на сервер не уходят`, p.map((x) => x.tasks).join('/'));
    // «отправлено N» журнала = проверки + задачи + профиль; профиль больше не уходит без изменений (ТД 415)
    ok(p[1].pushed === 0 && p[2].pushed === 0, `${tag}: журнал синхронизации — повторный проход без изменений «отправлено 0»`, p.map((x) => x.pushed + (x.profile ? ' (профиль)' : '')).join('/'));
    ok(p[0].tasks === 0, `${tag}: проход 1 — тоже 0 (ничего не меняли)`, String(p[0].tasks));
    const now = await taskState(page);
    const moved = engWas.filter((w) => { const t = now.tasks.find((x) => x.id === w.id); return !t || t.date !== w.date || t.target !== w.target || t.status !== w.status; });
    ok(moved.length === 0, `${tag}: сроки, цель и статус задач инженера прежние`, moved.map((t) => t.title).join(', '));
    ok(now.toSend === 0, `${tag}: к отправке на устройстве — 0`, String(now.toSend));
    await go(page, '#/tasks', 3500);
    const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    ok(wide <= 0, `${tag}: «Задачи» без прокрутки вбок`, String(wide));
    await page.screenshot({ path: join(out, `${tag}-tasks.png`) });
  } finally { await ctx.close(); await stop().catch(() => {}); }
}

async function engineer(out, width) {
  const tag = 'q-eng' + width;
  note(`== ${tag}: инженер — свои новые задачи уходят один раз, закрытая своя — ровно одна`);
  freshProfile(out, tag); resetNet(); stand.quality = ENGINEER;
  await start();
  const { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900 });
  try {
    await signIn(page);
    await idle(page);
    const me = await page.evaluate(() => ({ admin: window.RBI.services.permissions.isAdmin(), me: window.RBI.services.permissions.getCurrentEngineerName() }));
    ok(!me.admin, `${tag}: роль экрана Качества — инженер`, JSON.stringify(me));
    await seedChecks(page, me.me);
    // план составляется в конце прохода (если «Задачи» не открыты) и уходит следующим; дальше — уже нечего
    const p = [];
    for (let i = 0; i < 5; i++) p.push(await pass(page));
    note(`${tag}: проходы — ${p.map((x, i) => `${i + 1}: задач ушло ${x.tasks}, журнал «отправлено ${x.pushed}», профиль ${x.profile}`).join('; ')}`);
    // часть уходит автосинхронизацией между проходами — считаем по id за всё время
    const st0 = await taskState(page);
    const per = st0.tasks.map((t) => sendsAll.get('rbi_tasks:' + t.id) || 0);
    ok(st0.all > 0 && per.every((n) => n === 1), `${tag}: новые свои задачи ушли на сервер, каждая ровно 1 раз`, `${per.join(',')} (${st0.all} шт.)`);
    ok(p[3].tasks === 0 && p[4].tasks === 0, `${tag}: следующие проходы — 0`, p.map((x) => x.tasks).join('/'));
    ok(p[4].pushed === 0, `${tag}: журнал — повторный проход без изменений «отправлено 0»`, p.map((x) => x.pushed).join('/'));
    const mine = st0.tasks.find((t) => /Эталон/.test(t.title) && t.status === 'pending');
    await page.evaluate((id) => window.rbi_markTaskDone(id, true).catch(() => {}), mine && mine.id);
    const c = [await pass(page), await pass(page)];
    ok(c[0].tasks === 1 && c[1].tasks === 0, `${tag}: закрытая своя задача ушла ровно 1 раз`, c.map((x) => x.tasks).join('/'));
    await go(page, '#/tasks', 3500);
    const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    ok(wide <= 0, `${tag}: «Задачи» без прокрутки вбок`, String(wide));
    await page.screenshot({ path: join(out, `${tag}-tasks.png`) });
  } finally { await ctx.close(); await stop().catch(() => {}); stand.quality = null; }
}

export const qtasksScenarios = (out) => ({
  'q-admin375': () => admin(out, 375), 'q-admin1440': () => admin(out, 1440),
  'q-eng375': () => engineer(out, 375), 'q-eng1440': () => engineer(out, 1440)
});
