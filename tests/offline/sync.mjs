// P2-0061: сценарии стенда «Единый механизм синхронизации и прав» (standards/SYNC_AND_ACCESS.md).
// s-rename — смена ФИО при неотправленных осмотрах (новом с id автора и старом без id) → оба уходят ровно 1 раз;
// s-foreign — у вошедшего на телефоне осмотры другого сотрудника (по ФИО и по id) → 0 отправок, «Не отправлено: запись другого сотрудника (ФИО)»;
// s-leader — руководитель отправляет такие осмотры ровно 1 раз. Боевой сервер не используется.
import { start, stop, stand, sends, resetNet, USER, USER2 } from './servers.mjs';
import { freshProfile, launch, note, ok, open, signIn } from './lib.mjs';

const ENGINEER = { actions: ['quality.edit', 'quality.view'], templates: [], projects: null, contractor: null, objects: null, container: null };

/** Неотправленный осмотр: экранной функцией (с id автора) или «старый» — прямо в хранилище, без id автора, с подписью ФИО. */
const putInspection = (page, { id, name, legacy }) => page.evaluate(async ([i, n, old]) => {
  const S = window.RBI.services;
  const rec = { id: i, date: new Date().toISOString(), object: 'SYNC-MARK', template: 'Земляные работы', status: 'done', inspectorName: n,
    projectName: '', project_canonical_key: '' };
  if (old) { await S.storage.put('app_history', { ...rec, source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced', updatedAt: new Date().toISOString() }); return i; }
  const r = await S.inspections.save(rec); return r && r.id;
}, [id, name, !!legacy]);
const getRec = (page, id) => page.evaluate(async (i) => { const r = (await window.RBI.services.storage.getAll('app_history')).find((x) => x.id === i);
  return r ? { st: r.syncStatus || r.sync_status, authorId: r.authorId || '', name: r.inspectorName, reason: r.syncBlockReason || '', hint: r.syncBlockHint || '' } : null; }, id)
  .catch((e) => ({ err: e.message }));
async function pushUntil(page, ids, tries = 8) {
  for (let i = 0; i < tries && !ids.every((x) => sends.get(x)); i++) {
    await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {});
    await page.waitForTimeout(4000);
  }
  await page.waitForTimeout(2500);
}

async function rename(out) {
  const tag = 's-rename';
  note(`== ${tag}: инженер, два неотправленных осмотра (новый — с id автора, старый — без id, подпись ФИО) → ФИО сменили → оба ушли ровно 1 раз`);
  freshProfile(out, tag); resetNet(); stand.quality = ENGINEER; stand.names = {};
  try {
    await start();
    let { ctx, page } = await launch(out, tag);
    await signIn(page);
    await ctx.setOffline(true);
    const a = await putInspection(page, { id: 's-rename-new-' + Date.now(), name: 'Иванов Иван' });
    const b = await putInspection(page, { id: 's-rename-old-' + Date.now(), name: 'Иванов Иван', legacy: true });
    const ra = await getRec(page, a);
    ok(ra && ra.authorId === USER.id, `${tag}: новый осмотр записан с id автора (ФИО — подпись)`, JSON.stringify(ra));
    await ctx.close();
    stand.names[USER.id] = 'Иванов-Сидоров Иван';   // ФИО сменили, пока осмотры лежали на телефоне (приложение закрыто)
    ({ ctx, page } = await launch(out, tag));
    await open(page, 9000);
    const nm = await page.evaluate(() => window.syncConfig && [window.syncConfig.engineerName, window.syncConfig.previousNames]).catch(() => null);
    ok(!!nm && nm[0] === 'Иванов-Сидоров Иван' && (nm[1] || []).includes('Иванов Иван'), `${tag}: новое ФИО, прежнее запомнено`, JSON.stringify(nm));
    await pushUntil(page, [a, b]);
    const [sa, sb] = [sends.get(a) || 0, sends.get(b) || 0];
    const rb = await getRec(page, b);
    ok(sa === 1, `${tag}: новый осмотр ушёл ровно 1 раз`, String(sa));
    ok(sb === 1, `${tag}: старый осмотр (без id, прежнее ФИО) ушёл ровно 1 раз`, String(sb) + ' ' + JSON.stringify(rb));
    ok(rb && rb.authorId === USER.id, `${tag}: старому осмотру дописан id автора`, JSON.stringify(rb));
    await ctx.close();
  } finally { stand.quality = null; stand.names = {}; await stop().catch(() => {}); }
}

async function foreignAndLeader(out, tag) {
  const leader = tag === 's-leader';
  note(`== ${tag}: у ${leader ? 'руководителя' : 'инженера'} Петрова на телефоне неотправленные осмотры Иванова (из старой общей базы / резервной копии) → ${leader ? 'уходят ровно 1 раз' : '0 отправок, причина видна'}`);
  freshProfile(out, tag); resetNet(); stand.user2Planfact = true; stand.names = {};
  stand.quality = leader ? null : ENGINEER;   // руководитель — права стенда по умолчанию (quality.manage)
  try {
    await start();
    const { ctx, page } = await launch(out, tag);
    await signIn(page, USER2.email);
    const me = await page.evaluate(() => window.syncConfig && [window.syncConfig.authUserId, window.syncConfig.engineerName]).catch(() => null);
    note(`вошёл: ${JSON.stringify(me)}`);
    await ctx.setOffline(true);
    const byName = await putInspection(page, { id: tag + '-name-' + Date.now(), name: 'Иванов Иван', legacy: true });
    // id главнее подписи: запись Иванова (id u-1) с подписью «Петров Пётр» — тоже чужая
    const byId = tag + '-id-' + Date.now();
    await page.evaluate(async (i) => { await window.RBI.services.storage.put('app_history', { id: i, date: new Date().toISOString(), object: 'SYNC-MARK', template: 'Земляные работы',
      status: 'done', inspectorName: 'Петров Пётр', authorId: 'u-1', projectName: '', project_canonical_key: '', source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced',
      updatedAt: new Date().toISOString() }); }, byId);
    await ctx.setOffline(false);
    await pushUntil(page, [byName, byId], leader ? 8 : 3);
    const n1 = sends.get(byName) || 0, n2 = sends.get(byId) || 0;
    const r1 = await getRec(page, byName), r2 = await getRec(page, byId);
    if (leader) ok(n1 === 1 && n2 === 1, `${tag}: руководитель отправил чужие осмотры ровно 1 раз`, `${n1}/${n2} ${JSON.stringify([r1, r2])}`);
    else {
      ok(n1 === 0 && n2 === 0, `${tag}: чужие осмотры не ушли`, `${n1}/${n2}`);
      ok(!!r1 && r1.st === 'blocked' && r1.reason === 'Не отправлено: запись другого сотрудника (Иванов Иван)' && /руководитель или автор/.test(r1.hint),
        `${tag}: «Не отправлено: запись другого сотрудника (Иванов Иван)» и что делать`, JSON.stringify(r1));
      ok(!!r2 && r2.st === 'blocked' && /запись другого сотрудника/.test(r2.reason), `${tag}: id автора главнее подписи — запись с чужим id и моим ФИО чужая`, JSON.stringify(r2));
    }
    await ctx.close();
  } finally { stand.quality = null; stand.user2Planfact = false; await stop().catch(() => {}); }
}

export function syncScenarios(out) {
  return { 's-rename': () => rename(out), 's-foreign': () => foreignAndLeader(out, 's-foreign'), 's-leader': () => foreignAndLeader(out, 's-leader') };
}
