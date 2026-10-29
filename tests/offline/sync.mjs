// P2-0061: сценарии стенда «Единый механизм синхронизации и прав» (standards/SYNC_AND_ACCESS.md).
// s-rename — смена ФИО при неотправленных осмотрах (новом с id автора и старом без id) → оба уходят ровно 1 раз;
// s-foreign — у вошедшего на телефоне осмотры другого сотрудника (по ФИО и по id) → 0 отправок, «Не отправлено: запись другого сотрудника (ФИО)»;
// s-leader — руководитель отправляет такие осмотры ровно 1 раз. Боевой сервер не используется.
import { start, stop, stand, sends, sendsAll, resetNet, USER, USER2 } from './servers.mjs';
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
    const canDel = await page.evaluate(async (i) => { const r = (await window.RBI.services.storage.getAll('app_history')).find((x) => x.id === i);
      return window.RBI.services.permissions.canDelete(r, 'inspection'); }, b).catch((e) => 'ошибка ' + e.message);
    ok(canDel === true, `${tag}: свой старый осмотр (прежнее ФИО) после смены ФИО можно удалить`, String(canDel));
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

/** P2-0061 этап 2: по одной своей и одной чужой записи каждого вида Качества и Базы знаний (инженер, правка Качества). */
const KINDS = [['task', 'rbi_tasks', 'rbi_tasks', 'engineerName'], ['meeting', 'rbi_meetings', 'project_meetings', 'author'],
  ['intervention', 'rbi_interventions', 'project_interventions', 'owner'], ['fmea', 'rbi_fmea', 'project_fmea', 'author'],
  ['schedule', 'rbi_schedule_stages', 'project_schedule_stages', 'owner'], ['etalon', 'rbi_etalon_acts', 'shared_etalons', 'owner'],
  ['practice', 'rbi_practices', 'shared_practices', 'author'], ['twi', 'twi_cards', 'shared_twi_cards', 'owner'], ['document', 'custom_docs', 'shared_docs', 'owner']];
async function kinds(out) {
  const tag = 's-kinds';
  note(`== ${tag}: инженер — своя и чужая запись каждого вида → своя уходит 1 раз; чужая — как сервер: «только автор» — причина, «команда объекта» и «библиотека» — уходит; удалить чужую нельзя`);
  freshProfile(out, tag); resetNet(); stand.quality = ENGINEER; stand.names = {};
  try {
    await start();
    const { ctx, page } = await launch(out, tag);
    await signIn(page);
    await ctx.setOffline(true);
    const now = Date.now();
    await page.evaluate(async ([list, t]) => {
      const S = window.RBI.services;
      for (const [kind, store, , field] of list) for (const who of ['own', 'foreign']) {
        await S.storage.put(store, { id: `${kind}-${who}-${t}`, [field]: who === 'own' ? 'Иванов Иван' : 'Петров Пётр', title: 'SYNC-MARK ' + kind, name: 'SYNC-MARK',
          date: new Date().toISOString(), createdAt: new Date().toISOString(), project_canonical_key: '', source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced',
          updatedAt: new Date().toISOString() });
      }
    }, [KINDS, now]);
    // экран «удалить»: по записи (общее правило), чужую — нельзя, свою — можно
    const del = await page.evaluate(async ([list, t]) => {
      const P = window.RBI.services.permissions, S = window.RBI.services, out = {};
      for (const [kind, store] of list) {
        const all = await S.storage.getAll(store);
        const own = all.find((r) => r.id === `${kind}-own-${t}`), foreign = all.find((r) => r.id === `${kind}-foreign-${t}`);
        out[kind] = [P.canDelete(own, kind), P.canDelete(foreign, kind)];
      }
      return out;
    }, [KINDS, now]).catch((e) => ({ err: e.message }));
    ok(!del.err && Object.values(del).every(([a, b]) => a === true && b === false), `${tag}: «удалить» — своё можно, чужое нельзя (все ${KINDS.length} видов)`, JSON.stringify(del));
    await ctx.setOffline(false);
    for (let i = 0; i < 6 && !KINDS.every(([k, , t]) => sendsAll.get(`${t}:${k}-own-${now}`)); i++) {
      await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {});
      await page.waitForTimeout(4000);
    }
    await page.waitForTimeout(2500);
    const res = {};
    for (const [k, store, t] of KINDS) {
      const r = await page.evaluate(async ([s, id]) => { const x = (await window.RBI.services.storage.getAll(s)).find((y) => y.id === id); return x ? [x.syncStatus || x.sync_status, x.syncBlockReason || ''] : null; }, [store, `${k}-foreign-${now}`]);
      res[k] = { own: sendsAll.get(`${t}:${k}-own-${now}`) || 0, foreign: sendsAll.get(`${t}:${k}-foreign-${now}`) || 0, foreignRec: r };
    }
    note(JSON.stringify(res));
    ok(KINDS.every(([k]) => res[k].own === 1), `${tag}: своя запись каждого вида ушла ровно 1 раз`, KINDS.map(([k]) => k + ' ' + res[k].own).join(', '));
    ok(res.task.foreign === 0 && res.task.foreignRec && res.task.foreignRec[0] === 'blocked' && res.task.foreignRec[1] === 'Не отправлено: запись другого сотрудника (Петров Пётр)',
      `${tag}: чужая задача («только автор») — не ушла, причина видна`, JSON.stringify(res.task));
    ok(KINDS.filter(([k]) => k !== 'task').every(([k]) => res[k].foreign === 1), `${tag}: чужие записи «команды объекта» и библиотеки — ушли 1 раз (сервер разрешает)`,
      KINDS.filter(([k]) => k !== 'task').map(([k]) => k + ' ' + res[k].foreign).join(', '));
    await ctx.close();
  } finally { stand.quality = null; await stop().catch(() => {}); }
}

export function syncScenarios(out) {
  return { 's-kinds': () => kinds(out), 's-rename': () => rename(out), 's-foreign': () => foreignAndLeader(out, 's-foreign'), 's-leader': () => foreignAndLeader(out, 's-leader') };
}
