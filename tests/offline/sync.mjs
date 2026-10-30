// P2-0061: сценарии стенда «Единый механизм синхронизации и прав» (standards/SYNC_AND_ACCESS.md).
// s-rename — смена ФИО при неотправленных осмотрах (новом с id автора и старом без id) → оба уходят ровно 1 раз;
// s-foreign — у вошедшего на телефоне осмотры другого сотрудника (по ФИО и по id) → 0 отправок, «Не отправлено: запись другого сотрудника (ФИО)»;
// s-leader — руководитель отправляет такие осмотры ровно 1 раз. Боевой сервер не используется.
import { start, stop, stand, sends, sendsAll, rows, resetNet, net, flow, log as apiLog, USER, USER2, COMPANY, constructionAccess } from './servers.mjs';
import { stableId, isUuid } from '../../js/services/record-id.service.js';
import { freshProfile, launch, note, ok, open, signIn } from './lib.mjs';
import { pullScopeScenario } from './pull-scope.mjs';

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
  note(`== ${tag}: инженер — своя и чужая запись каждого вида → своя уходит 1 раз; чужая — как сервер: задача — причина, «команда объекта» и «библиотека» — уходит; удалить чужую — по праву группы`);
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
    // P2-0071: чужое — по праву группы, как сервер: совещания, мероприятия, FMEA, этапы — «Редактирование» (у инженера есть);
    // задачи — «Редактирование чужих» (нет); библиотека — только своё (ТД 238)
    const FOREIGN_OK = ['meeting', 'intervention', 'fmea', 'schedule'];
    ok(!del.err && Object.entries(del).every(([k, [a, b]]) => a === true && b === FOREIGN_OK.includes(k)),
      `${tag}: «удалить» — своё можно, чужое — по праву группы (все ${KINDS.length} видов)`, JSON.stringify(del));
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

/** P2-0061 этап 3: Стройконтроль 2.0 — подрядчик отправляет замечания и приёмки своей фирмы (по id контрагента), чужой фирмы — нет (причина). */
const CP_OWN = '7a7a7a7a-1111-4111-8111-111111111111', CP_OTHER = '7b7b7b7b-2222-4222-8222-222222222222';
async function contractor(out) {
  const tag = 's-contractor';
  note(`== ${tag}: подрядчик «Фирма 1» — замечание и приёмка своей фирмы уходят 1 раз, чужой фирмы — нет, причина «запись другой фирмы»; инженер — свои уходят`);
  freshProfile(out, tag); resetNet(); stand.names = {};
  // P2-0070: роль-подрядчик после 052 — видеть, в работу, устранено, записаться; участие — вся компания, своя фирма
  const ctrActs = ['construction.view', 'construction.edit', 'construction.defects.view', 'construction.defects.start', 'construction.defects.fix',
    'construction.acceptance.view', 'construction.acceptance.book'];
  stand.quality = { actions: [...ctrActs, 'quality.view', 'quality.scope.contractor'], templates: [], projects: null,
    contractor: { id: CP_OWN, name: 'Фирма 1', keys: [] }, objects: null, container: null,
    construction: constructionAccess([...ctrActs, 'quality.scope.contractor'], CP_OWN) };
  try {
    await start();
    let { ctx, page } = await launch(out, tag);
    await signIn(page);
    const cp = await page.evaluate(() => window.appSettings && window.appSettings.assignedCounterpartyId).catch(() => null);
    ok(cp === CP_OWN, `${tag}: фирма подрядчика — id контрагента из ответа сервера`, String(cp));
    // карточка справочника подрядчиков «Фирма 1» на телефоне (id карточки ≠ id контрагента)
    await page.evaluate(async () => {
      await window.RBI.services.storage.put(STORES.CONTRACTOR_DIRECTORY, { id: 'card-firm-1', canonical_key: 'фирма 1', display_name: 'Фирма 1', source: 'cloud', syncStatus: 'synced' });
      const C = window.RBI.services.contractors; if (C && typeof C.init === 'function') await C.init();
    });
    await ctx.setOffline(true);
    const t = Date.now();
    const put = (store, id, firm) => page.evaluate(async ([st, i, f]) => window.RBI.services.storage.put(st, { id: i, title: 'SYNC-MARK', owner: 'Иванов Иван', locationId: 'loc-1',
      core_counterparty_id: f, status: 'issued', source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced', updatedAt: new Date().toISOString() }), [store, id, firm]);
    const ids = { dOwn: 'd-own-' + t, dOther: 'd-other-' + t, aOwn: 'a-own-' + t, aOther: 'a-other-' + t, aNew: 'a-new-' + t };
    await put('construction_defects_v2', ids.dOwn, CP_OWN); await put('construction_defects_v2', ids.dOther, CP_OTHER);
    await put('construction_acceptance_v2', ids.aOwn, CP_OWN); await put('construction_acceptance_v2', ids.aOther, CP_OTHER);
    // Б1: новая заявка подрядчика, как пишет форма: id фирмы ещё нет (его ставит сервер), только карточка справочника
    await page.evaluate(async (i) => window.RBI.services.storage.put('construction_acceptance_v2', { id: i, title: 'SYNC-MARK', owner: 'Иванов Иван', locationId: 'loc-1',
      contractorId: 'card-firm-1', status: 'submitted', source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced', updatedAt: new Date().toISOString() }), ids.aNew);
    await ctx.setOffline(false);
    const n = (tb, id) => sendsAll.get(tb + ':' + id) || 0;
    for (let i = 0; i < 6 && !(n('construction_defects_v2', ids.dOwn) && n('construction_acceptance_v2', ids.aOwn) && n('construction_acceptance_v2', ids.aNew)); i++) {
      await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {}); await page.waitForTimeout(4000);
    }
    await page.waitForTimeout(2500);
    const rec = (st, id) => page.evaluate(async ([s2, i]) => { const x = (await window.RBI.services.storage.getAll(s2)).find((y) => y.id === i); return x ? [x.syncStatus || x.sync_status, x.syncBlockReason || ''] : null; }, [st, id]);
    const r = { dOwn: n('construction_defects_v2', ids.dOwn), dOther: n('construction_defects_v2', ids.dOther), aOwn: n('construction_acceptance_v2', ids.aOwn),
      aOther: n('construction_acceptance_v2', ids.aOther), dOtherRec: await rec('construction_defects_v2', ids.dOther), aOtherRec: await rec('construction_acceptance_v2', ids.aOther) };
    note(JSON.stringify(r));
    note('новая заявка: ' + JSON.stringify(await rec('construction_acceptance_v2', ids.aNew)) + ' карточки: ' + JSON.stringify(await page.evaluate(() => {
      const SA = window.RbiSyncAccess, me = SA && SA.deviceMe(); return me ? me.contractorCards : null; })));
    // подрядчик отправляет только замечания («В работу» / «Устранено»; P2-0044), приёмки — нет
    ok(r.dOwn === 1, `${tag}: замечание своей фирмы ушло ровно 1 раз`, String(r.dOwn));
    ok(r.dOther === 0 && r.dOtherRec && r.dOtherRec[0] === 'blocked' && r.dOtherRec[1] === 'Не отправлено: запись другой фирмы',
      `${tag}: замечание чужой фирмы — не ушло, причина «запись другой фирмы»`, JSON.stringify(r.dOtherRec));
    // приёмки: правка по серверу (row_visible_id) — своей фирмы можно, чужой — нет
    ok(r.aOwn === 1 && r.aOther === 0 && r.aOtherRec && r.aOtherRec[0] === 'blocked', `${tag}: приёмка своей фирмы ушла 1 раз, чужой — нет (причина)`, `${r.aOwn}/${r.aOther} ${JSON.stringify(r.aOtherRec)}`);
    ok(n('construction_acceptance_v2', ids.aNew) === 1, `${tag}: новая заявка подрядчика (только карточка справочника, без id фирмы) ушла 1 раз`, String(n('construction_acceptance_v2', ids.aNew)));
    await ctx.close();
    // инженер только Стройконтроля (без прав Качества): свои замечания уходят — раньше не уходило ничего (роль экрана «Директор»)
    stand.quality = { actions: ['construction.view', 'construction.edit', 'quality.view'], templates: [], projects: null, contractor: null, objects: null, container: null };
    freshProfile(out, tag + '-eng');
    ({ ctx, page } = await launch(out, tag + '-eng'));
    await signIn(page);
    const e1 = 'd-eng-' + Date.now();
    await page.evaluate(async (i) => window.RBI.services.storage.put('construction_defects_v2', { id: i, title: 'SYNC-MARK', owner: 'Иванов Иван', locationId: 'loc-1', status: 'issued',
      source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced', updatedAt: new Date().toISOString() }), e1);
    for (let i = 0; i < 5 && !n('construction_defects_v2', e1); i++) { await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {}); await page.waitForTimeout(4000); }
    ok(n('construction_defects_v2', e1) === 1, `${tag}: инженер — своё замечание ушло ровно 1 раз`, String(n('construction_defects_v2', e1)));
    await ctx.close();
  } finally { stand.quality = null; await stop().catch(() => {}); }
}

/** P2-0061 этап 4 (ТД 313): отклонённое сервером уходит само, когда дали права, и по «Отправить снова» — по 1 разу, без дублей. */
async function rejectRetry(out, width = 375, scheme = 'light') {
  const tag = 's-reject-retry' + (width > 700 ? '-' + width : '') + (scheme === 'dark' ? '-dark' : '');
  note(`== ${tag}: сервер отклонил осмотр → права дали → ушёл сам 1 раз; второй — по «Отправить снова» 1 раз; снимки «Отправка» и Истории`);
  freshProfile(out, tag); resetNet(); stand.quality = ENGINEER; stand.names = {};
  net.reject = /REJECT-MARK/;
  try {
    await start();
    let { ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900, scheme });
    await signIn(page);
    const t = Date.now(), a = 'rej-a-' + t, b = 'rej-b-' + t, good = 'rej-good-' + t;
    // З6: хороший осмотр в той же порции — не замораживается отказом соседей
    await page.evaluate(async (i) => window.RBI.services.inspections.save({ id: i, date: new Date().toISOString(), object: 'ЖК Тестовый', template: 'Фасад',
      templateTitle: 'Фасад', status: 'done', inspectorName: 'Иванов Иван' }), good);
    for (const id of [a, b]) await page.evaluate(async (i) => window.RBI.services.inspections.save({ id: i, date: new Date().toISOString(), object: 'ЖК Тестовый',
      location: 'REJECT-MARK', template: 'Фасад', templateTitle: 'Фасад', status: 'done', inspectorName: 'Иванов Иван' }), id);
    // чужая запись на телефоне — для снимка: «Не отправлено: запись другого сотрудника»
    await page.evaluate(async (i) => window.RBI.services.storage.put('app_history', { id: i, date: new Date().toISOString(), object: 'ЖК Тестовый', template: 'Кладка',
      templateTitle: 'Кладка', status: 'done', inspectorName: 'Петров Пётр', authorId: 'u-2', source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced',
      updatedAt: new Date().toISOString() }), 'foreign-' + t);
    for (let i = 0; i < 3; i++) { await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {}); await page.waitForTimeout(4000); }
    const rej0 = flow.rejected || 0;
    ok((sends.get(good) || 0) === 1, `${tag}: хороший осмотр из той же порции ушёл 1 раз (отказ соседей его не держит)`, String(sends.get(good) || 0));
    const ra = await getRec(page, a);
    ok(rej0 >= 1 && ra && ra.st === 'blocked' && ra.reason === 'Сервер отклонил: нет прав на эту запись', `${tag}: сервер отклонил — запись на телефоне с причиной`, JSON.stringify(ra) + ' отказов ' + rej0);
    // ещё проходы при том же доступе — запись не уходит снова (не бьётся в сервер каждый раз)
    for (let i = 0; i < 2; i++) { await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {}); await page.waitForTimeout(4000); }
    ok((flow.rejected || 0) === rej0, `${tag}: при том же доступе отклонённое не отправляется снова`, `${rej0} → ${flow.rejected}`);
    // снимки: «Данные на устройстве → Отправка» и История
    await page.evaluate(() => { location.hash = '#/settings/my/device'; }); await page.waitForTimeout(5000);
    const head = await page.locator('[data-testid=p2-net-device]').innerText().catch(() => '');
    ok(/^Не ушло: 3/.test(head) && /Не ушло, нужно действие: 3/i.test(head) && /Сервер отклонил: нет прав на эту запись/.test(head) && /Не отправлено: запись другого сотрудника \(Петров Пётр\)/.test(head)
      && /Отправит руководитель или автор/.test(head) && /Отправить снова/.test(head), `${tag}: «Отправка» — обе причины с подсказками и «Отправить снова»`, head.replace(/\s+/g, ' ').slice(0, 300));
    await page.locator('[data-testid=p2-net-device]').screenshot({ path: `${out}/${tag}-device.png` }).catch(() => {});
    await page.evaluate(() => { location.hash = '#/quality/analytics/history'; }); await page.waitForTimeout(6000);
    await page.getByText('Без объекта').first().click().catch(() => {}); await page.waitForTimeout(1200);
    await page.getByText('Не указан').first().click().catch(() => {}); await page.waitForTimeout(1200);
    for (const g of ['Кладка', 'Фасад']) { await page.getByText(g, { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(1000); }
    await page.screenshot({ path: `${out}/${tag}-history.png` }).catch(() => {});
    // значок «запрещено» у записи — нажатие показывает причину и что делать
    await page.locator('button', { hasText: /Заблок/i }).first().click().catch(() => {}); await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${tag}-history-reason.png` }).catch(() => {});
    // права дали (руководитель), сервер принимает — первая запись уходит сама, без кнопки
    net.reject = /REJECT-MARK-B-ONLY/;   // сервер больше не отклоняет
    stand.quality = null;
    await ctx.close();
    ({ ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900, scheme }));
    await open(page, 9000);
    for (let i = 0; i < 6 && !(sends.get(a) && sends.get(b)); i++) { await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {}); await page.waitForTimeout(4000); }
    ok((sends.get(a) || 0) === 1 && (sends.get(b) || 0) === 1, `${tag}: права дали — отклонённые ушли сами, ровно 1 раз каждая`, `${sends.get(a) || 0}/${sends.get(b) || 0}`);
    await ctx.close();
    // «Отправить снова»: сервер отклонил при тех же правах, затем принимает — по кнопке уходит 1 раз
    stand.quality = ENGINEER; net.reject = /REJECT-MARK/;
    ({ ctx, page } = await launch(out, tag, { width, height: width < 768 ? 812 : 900, scheme }));
    await open(page, 9000);
    const c = 'rej-c-' + Date.now();
    await page.evaluate(async (i) => window.RBI.services.inspections.save({ id: i, date: new Date().toISOString(), object: 'ЖК Тестовый', location: 'REJECT-MARK',
      template: 'Фасад', status: 'done', inspectorName: 'Иванов Иван' }), c);
    for (let i = 0; i < 3; i++) { await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {}); await page.waitForTimeout(4000); }
    net.reject = /REJECT-MARK-B-ONLY/;
    await page.evaluate(() => { location.hash = '#/settings/my/device'; }); await page.waitForTimeout(5000);
    await page.locator('[data-testid=p2-sync-retry]').click().catch((e) => note('кнопка: ' + e.message.split('\n')[0]));
    for (let i = 0; i < 6 && !sends.get(c); i++) await page.waitForTimeout(3000);
    ok((sends.get(c) || 0) === 1, `${tag}: «Отправить снова» — ушла ровно 1 раз`, String(sends.get(c) || 0));
    await ctx.close();
  } finally { stand.quality = null; net.reject = null; await stop().catch(() => {}); }
}

/** P2-0061 этап 4 (ТД 315): задача и замечание Стройконтроля 2.0 уходят до скачивания чужого («своё первым»). */
async function ownFirst(out) {
  const tag = 's-own-first';
  note(`== ${tag}: задача и замечание — отправлены раньше, чем начато скачивание осмотров`);
  freshProfile(out, tag); resetNet(); stand.names = {};
  stand.quality = { actions: ['quality.view', 'quality.edit', 'construction.view', 'construction.edit'], templates: [], projects: null, contractor: null, objects: null, container: null };
  try {
    await start();
    const { ctx, page } = await launch(out, tag);
    await signIn(page);
    await page.waitForTimeout(3000);
    const t = Date.now(), task = 'task-' + t, def = 'def-' + t, known = 'task-known-' + t;
    await page.evaluate(async ([ti, di, ki]) => {
      const S = window.RBI.services;
      await S.storage.put('rbi_tasks', { id: ti, title: 'SYNC-MARK', engineerName: 'Иванов Иван', status: 'pending', date: new Date().toISOString(), source: 'local',
        syncStatus: 'not_synced', sync_status: 'not_synced', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
      await S.storage.put('construction_defects_v2', { id: di, title: 'SYNC-MARK', owner: 'Иванов Иван', locationId: 'loc-1', status: 'issued', source: 'local',
        syncStatus: 'not_synced', sync_status: 'not_synced', updatedAt: new Date().toISOString() });
      // правка задачи, которую сервер уже знает (скачана раньше), — уходит после скачивания, чтобы не отменить удаление с сервера
      await S.storage.put('rbi_tasks', { id: ki, title: 'SYNC-MARK', engineerName: 'Иванов Иван', status: 'done', date: new Date().toISOString(), source: 'local', cloudKnown: true,
        syncStatus: 'not_synced', sync_status: 'not_synced', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
    }, [task, def, known]);
    const n0 = apiLog.length;
    await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {});
    for (let i = 0; i < 10 && !(sendsAll.get('rbi_tasks:' + task) && sendsAll.get('construction_defects_v2:' + def)); i++) await page.waitForTimeout(2000);
    const L = apiLog.slice(n0);
    const at = (re) => L.findIndex((x) => re.test(x));
    const iTask = at(/^POST \/rest\/v1\/rbi_tasks/), iDef = at(/^POST \/rest\/v1\/construction_defects_v2/), iPull = at(/^GET \/rest\/v1\/rbi_inspections/);
    const taskPosts = L.map((x, k) => (/^POST \/rest\/v1\/rbi_tasks/.test(x) ? k : -1)).filter((k) => k >= 0);
    const iKnown = taskPosts.find((k) => k > iPull) ?? -1;   // второй запрос задач — после скачивания
    note(`порядок: задача ${iTask}, замечание ${iDef}, скачивание осмотров ${iPull}, правка известной задачи ${iKnown}`);
    ok(iPull >= 0 && iKnown > iPull && (sendsAll.get('rbi_tasks:' + known) || 0) === 1, `${tag}: правка задачи, которую сервер уже знает, — после скачивания, 1 раз`,
      `${iKnown} > ${iPull}, ${sendsAll.get('rbi_tasks:' + known) || 0}`);
    ok(iTask >= 0 && iDef >= 0 && (iPull < 0 || (iTask < iPull && iDef < iPull)), `${tag}: задача и замечание ушли до скачивания чужого`, `${iTask}/${iDef}/${iPull}`);
    ok((sendsAll.get('rbi_tasks:' + task) || 0) === 1 && (sendsAll.get('construction_defects_v2:' + def) || 0) === 1, `${tag}: каждая — ровно 1 раз за проход`,
      `${sendsAll.get('rbi_tasks:' + task) || 0}/${sendsAll.get('construction_defects_v2:' + def) || 0}`);
    await ctx.close();
  } finally { stand.quality = null; await stop().catch(() => {}); }
}

/** P2-0061 этап 5: модуль выключен у компании — его записи на телефоне не теряются и не уходят, причина «модуль … выключен»; другие уходят. */
async function moduleOff(out) {
  const tag = 's-module-off';
  note(`== ${tag}: у компании выключен Стройконтроль — замечание остаётся на телефоне с причиной, осмотр Качества уходит`);
  freshProfile(out, tag); resetNet(); stand.names = {};
  const was = COMPANY.modules.slice();
  COMPANY.modules = ['quality', 'planfact'];
  stand.quality = { actions: ['quality.view', 'quality.edit', 'construction.view', 'construction.edit'], templates: [], projects: null, contractor: null, objects: null, container: null };
  try {
    await start();
    const { ctx, page } = await launch(out, tag);
    await signIn(page);
    const t = Date.now(), d = 'mod-d-' + t, i = 'mod-i-' + t;
    await page.evaluate(async ([di, ii]) => {
      const S = window.RBI.services;
      await S.storage.put('construction_defects_v2', { id: di, title: 'SYNC-MARK', owner: 'Иванов Иван', locationId: 'loc-1', status: 'issued', source: 'local',
        syncStatus: 'not_synced', sync_status: 'not_synced', updatedAt: new Date().toISOString() });
      await S.inspections.save({ id: ii, date: new Date().toISOString(), object: 'SYNC-MARK', template: 'Кладка', status: 'done', inspectorName: 'Иванов Иван' });
    }, [d, i]);
    for (let k = 0; k < 5 && !sends.get(i); k++) { await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {}); await page.waitForTimeout(4000); }
    const r = await page.evaluate(async (x) => { const y = (await window.RBI.services.storage.getAll('construction_defects_v2')).find((z) => z.id === x);
      return y ? [y.syncStatus || y.sync_status, y.syncBlockReason || ''] : null; }, d);
    ok((sends.get(i) || 0) === 1, `${tag}: осмотр Качества ушёл 1 раз`, String(sends.get(i) || 0));
    ok((sendsAll.get('construction_defects_v2:' + d) || 0) === 0 && !!r && r[0] === 'blocked' && r[1] === 'Не отправлено: модуль «Стройконтроль» выключен у компании',
      `${tag}: замечание выключенного модуля — на телефоне, не ушло, причина видна`, JSON.stringify(r));
    await ctx.close();
  } finally { COMPANY.modules = was; stand.quality = null; await stop().catch(() => {}); }
}

/** P2-0061 этап 5 (п. 3а карточки): новый вид записи — одна строка описания; движок, правило и «Отправка» подхватывают его без правки кода.
 *  На стенде описание добавляется в работающее приложение (как строка в манифесте) — для «узлов» библиотеки (custom_nodes), у которых описания нет. */
async function newKind(out) {
  const tag = 's-new-kind';
  note(`== ${tag}: строка описания «узлы» (режим «только автор») → своя запись ушла 1 раз, чужая — «Не отправлено: запись другого сотрудника»`);
  freshProfile(out, tag); resetNet(); stand.quality = ENGINEER; stand.names = {};
  try {
    await start();
    const { ctx, page } = await launch(out, tag);
    await signIn(page);
    const t = Date.now(), own = 'node-own-' + t, other = 'node-other-' + t;
    await page.evaluate(async ([a, b]) => {
      // одна строка описания (так же, как в поле sync манифеста модуля)
      window.RbiSyncAccess.KINDS.stand_node = { module: 'knowledge', kind: 'stand_node', store: 'custom_nodes', table: 'shared_nodes', title: 'Узел',
        objectType: 'custom_node', memory: 'customNodes', author: { id: 'authorId', name: ['owner'] }, mode: 'author', view: ['quality.view'], edit: ['quality.edit'] };
      const S = window.RBI.services;
      for (const [id, who] of [[a, 'Иванов Иван'], [b, 'Петров Пётр']]) await S.storage.put('custom_nodes', { id, owner: who, title: 'SYNC-MARK', source: 'local',
        syncStatus: 'not_synced', sync_status: 'not_synced', updatedAt: new Date().toISOString() });
    }, [own, other]);
    for (let k = 0; k < 5 && !sendsAll.get('shared_nodes:' + own); k++) { await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {}); await page.waitForTimeout(4000); }
    const r = await page.evaluate(async (x) => { const y = (await window.RBI.services.storage.getAll('custom_nodes')).find((z) => z.id === x);
      return y ? [y.syncStatus || y.sync_status, y.syncBlockReason || ''] : null; }, other);
    ok((sendsAll.get('shared_nodes:' + own) || 0) === 1, `${tag}: своя запись нового вида ушла ровно 1 раз`, String(sendsAll.get('shared_nodes:' + own) || 0));
    ok((sendsAll.get('shared_nodes:' + other) || 0) === 0 && !!r && r[0] === 'blocked' && r[1] === 'Не отправлено: запись другого сотрудника (Петров Пётр)',
      `${tag}: чужая — по правилу, с причиной (движок не правился)`, JSON.stringify(r));
    await ctx.close();
  } finally { stand.quality = null; await stop().catch(() => {}); }
}

/** P2-0072 этап 1: номера проверки на телефоне. Новая проверка (номер — uuid) с фото без сети → сеть: на сервере одна проверка,
 *  пункты и фото с uuid v5 от проверки; повторная отправка и обрыв ответа → дублей 0. Проверка старой версии в очереди (номер —
 *  число-время) уходит со старыми составными номерами пунктов и фото. Черновик — uuid v5 от инженера. */
async function qualityIds(out) {
  const tag = 'q-ids';
  note(`== ${tag}: проверка с фото без сети (новый номер) + проверка старой версии в очереди → сеть → повтор и обрыв → дублей 0`);
  freshProfile(out, tag); resetNet(); stand.quality = null; stand.names = {};
  const cnt = (t) => (rows.get(t) ? rows.get(t).size : 0);
  const ids = (t) => [...(rows.get(t) || new Map()).keys()];
  try {
    await start();
    const { ctx, page } = await launch(out, tag);
    await signIn(page);
    await ctx.setOffline(true);
    const made = await page.evaluate(async () => {
      const S = window.RBI.services, t = Date.now();
      const ph = async (n) => { const ref = 'local://q-ids-' + n + '-' + t; await S.storage.put('app_photos', { id: ref, data: new Uint8Array(2048).buffer, mimeType: 'image/jpeg', sizeBytes: 2048 }); return ref; };
      const base = { date: new Date().toISOString(), object: 'IDS-MARK', template: 'Земляные работы', status: 'done', inspectorName: 'Иванов Иван', projectName: '', project_canonical_key: '' };
      // как экран «Проверка» (audit.actions.js): номер — из сервиса номеров платформы
      const fresh = await S.inspections.save({ ...base, id: window.RbiIds.newId(), state: { '1': 'ok', '2': 'bad', '3': 'ok' }, details: { '2': { comment: 'стенд' } },
        photos: { '1': [await ph(1), await ph(2)], '2': [await ph(3)] } });
      // старая версия приложения: номер — число-время, запись уже лежала в очереди без сети
      const legacyId = String(1730000000000 + (t % 100000));
      await S.storage.put('app_history', { ...base, id: legacyId, state: { '1': 'ok', '2': 'bad' }, details: {}, photos: { '2': [await ph(4)] },
        source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced', updatedAt: new Date().toISOString() });
      // незавершённая проверка (черновик) — уходит отдельной строкой rbi_draft_sessions
      await S.storage.put('app_state', { key: 'current_session', timestamp: Date.now(), templateKey: 'Земляные работы', templateTitle: 'Земляные работы', state: { '1': 'ok' }, details: {}, photos: {} });
      return { fresh: fresh && fresh.id, legacy: legacyId };
    }).catch((e) => ({ err: e.message }));
    ok(!made.err && isUuid(made.fresh), `${tag}: новая проверка на телефоне получила номер-uuid`, JSON.stringify(made));
    await ctx.setOffline(false);
    // обрыв: сервер записал пункты, ответ потерян — телефон отправит их ещё раз
    net.drops.push({ re: /^POST \/rest\/v1\/rbi_inspection_items$/, left: 1 });
    await pushUntil(page, [made.fresh, made.legacy], 10);
    const wantItems = [...['1', '2', '3'].map((k) => stableId(made.fresh, 'item', k)), `${made.legacy}_1`, `${made.legacy}_2`].sort();
    const wantPhotos = [stableId(made.fresh, 'photo', '1', 0), stableId(made.fresh, 'photo', '1', 1), stableId(made.fresh, 'photo', '2', 0), `${made.legacy}_2_0`].sort();
    const s1 = { insp: cnt('rbi_inspections'), items: ids('rbi_inspection_items').sort(), photos: ids('rbi_inspection_photos').sort() };
    ok(s1.insp === 2 && (sends.get(made.fresh) || 0) >= 1 && (sends.get(made.legacy) || 0) >= 1, `${tag}: обе проверки на сервере, по одной строке`, `проверок ${s1.insp}`);
    ok(JSON.stringify(s1.items) === JSON.stringify(wantItems), `${tag}: пункты — 5 строк: новой проверки uuid v5 от (проверка, пункт), старой — прежние «номер_пункт»`, JSON.stringify(s1.items));
    ok(JSON.stringify(s1.photos) === JSON.stringify(wantPhotos), `${tag}: фото — 4 строки: новой проверки uuid v5 от (проверка, пункт, номер фото), старой — «номер_пункт_фото»`, JSON.stringify(s1.photos));
    const itemSends = [...sendsAll.entries()].filter(([k]) => k.startsWith('rbi_inspection_items:')).reduce((a, [, v]) => a + v, 0);
    note(`отправок строк пунктов: ${itemSends} (с обрывом ответа)`);
    // повторная отправка обеих проверок (правка после отправки / восстановление после сбоя)
    await page.evaluate(async (list) => {
      const S = window.RBI.services;
      for (const id of list) { const r = (await S.storage.getAll('app_history')).find((x) => String(x.id) === id);
        await S.storage.put('app_history', { ...r, source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced', updatedAt: new Date().toISOString() }); }
    }, [made.fresh, made.legacy]);
    const before = sends.get(made.fresh) || 0;
    for (let i = 0; i < 8 && (sends.get(made.fresh) || 0) === before; i++) {
      await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {});
      await page.waitForTimeout(4000);
    }
    await page.waitForTimeout(2500);
    const s2 = { insp: cnt('rbi_inspections'), items: ids('rbi_inspection_items').sort(), photos: ids('rbi_inspection_photos').sort(), resent: (sends.get(made.fresh) || 0) - before };
    ok(s2.resent >= 1, `${tag}: повторная отправка состоялась`, String(s2.resent));
    ok(s2.insp === 2 && JSON.stringify(s2.items) === JSON.stringify(wantItems) && JSON.stringify(s2.photos) === JSON.stringify(wantPhotos),
      `${tag}: после повтора и обрыва дублей 0 (проверок 2, пунктов 5, фото 4 — те же номера)`, `${s2.insp}/${s2.items.length}/${s2.photos.length}`);
    // черновик текущей проверки — uuid v5 от инженера (повтор — та же строка)
    note(`черновиков на сервере: ${cnt('rbi_draft_sessions')} ${ids('rbi_draft_sessions').join(', ')}`);
    const drafts = ids('rbi_draft_sessions'), draftSends = [...sendsAll.entries()].filter(([k]) => k.startsWith('rbi_draft_sessions:')).reduce((a, [, v]) => a + v, 0);
    ok(drafts.length === 1 && isUuid(drafts[0]) && draftSends >= 2, `${tag}: черновик — одна строка с номером-uuid v5 от инженера, повтор — та же строка`, `${drafts.join(', ')}; отправок ${draftSends}`);
    await ctx.close();
  } finally { stand.quality = null; await stop().catch(() => {}); }
}

/** P2-0072 этап 3: остальные номера на телефоне. Загруженная задача хранит core_id сервера; новая задача (экран «Поручение»),
 *  замечание, помещение и приёмка Стройконтроля 2.0 — с номером-uuid; правка старой записи и новые записи уходят без core_id
 *  (номер ставит сервер — не затирается), core_id на телефоне после отправки на месте. */
async function qualityIdsOther(out) {
  const tag = 'q-ids-other';
  note(`== ${tag}: загрузка задачи с core_id → без сети: поручение, замечание / помещение / приёмка СК 2.0, правка старой задачи → сеть`);
  freshProfile(out, tag); resetNet(); stand.quality = null; stand.names = {};
  const C = '72000000-0000-4000-8000-0000000000c1', OLD = 'task_man_old72';
  const at = new Date(Date.now() - 3600e3).toISOString();
  stand.serve = { rbi_tasks: [{ id: OLD, core_id: C, status: 'pending', project_code: '', project_canonical_key: '', updated_at: at, created_at: at,
    core_created_by: USER.id, is_deleted: false, task_data: { id: OLD, type: 'manual', title: 'IDS-MARK старая', engineerName: 'Иванов Иван',
      inspectorName: 'Иванов Иван', createdBy: 'Иванов Иван', status: 'pending', date: at } }] };
  const task = (page, id) => page.evaluate(async (i) => { const r = (await window.RBI.services.storage.getAll('rbi_tasks')).find((x) => String(x.id) === i);
    return r ? { core_id: r.core_id || '', title: r.title, st: r.syncStatus || r.sync_status } : null; }, id).catch((e) => ({ err: e.message }));
  try {
    await start();
    const { ctx, page } = await launch(out, tag);
    await signIn(page);
    for (let i = 0; i < 6; i++) { const t = await task(page, OLD); if (t && t.core_id) break;
      await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {}); await page.waitForTimeout(4000); }
    const t0 = await task(page, OLD);
    ok(t0 && t0.core_id === C, `${tag}: загруженная задача хранит core_id сервера`, JSON.stringify(t0));
    await ctx.setOffline(true);
    // поручение — функцией экрана «Задачи»
    await page.evaluate(() => { location.hash = '#/tasks'; }).catch(() => {});
    await page.waitForTimeout(2500);
    const made = await page.evaluate(async () => {
      const out = {};
      try {
        window.rbi_openTaskModal();
        document.getElementById('manual-task-title').value = 'IDS-MARK поручение';
        await window.rbi_saveManualTask();
        const r = (await window.RBI.services.storage.getAll('rbi_tasks')).find((x) => x.title === 'IDS-MARK поручение');
        out.task = r ? r.id : 'нет';
      } catch (e) { out.task = 'ошибка ' + e.message; }
      for (const [svc, file, input] of [['constructionDefects', 'rbi-construction-defects', { locationId: 'loc-ids', description: 'IDS-MARK замечание' }],
        ['constructionUnits', 'rbi-construction-units', { locationId: 'loc-ids', name: 'IDS-MARK кв. 1' }],
        ['constructionAcceptance', 'rbi-construction-acceptance', { locationId: 'loc-ids', work_type: 'IDS-MARK', template_key: 'x', zone: { x: 0, y: 0, w: 100, h: 100 } }]]) {
        try {
          if (!window.RBI.services[svc]) await import('/js/dist/' + file + '.js');
          const S = window.RBI.services[svc];
          if (S.init) await S.init();
          out[svc] = (await S.create(input)).id;
        } catch (e) { out[svc] = 'ошибка ' + e.message; }
      }
      // правка старой задачи (с core_id) без сети
      const S = window.RBI.services.storage;
      const old = (await S.getAll('rbi_tasks')).find((x) => String(x.id) === 'task_man_old72');
      if (old) await S.put('rbi_tasks', { ...old, title: 'IDS-MARK старая (правка)', source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced', cloudKnown: false,
        updatedAt: new Date().toISOString() });
      return out;
    }).catch((e) => ({ err: e.message }));
    note('создано: ' + JSON.stringify(made));
    ok(isUuid(made.task), `${tag}: поручение с экрана — номер-uuid`, String(made.task));
    ok(isUuid(made.constructionDefects) && isUuid(made.constructionUnits) && isUuid(made.constructionAcceptance),
      `${tag}: замечание, помещение и приёмка СК 2.0 — номера-uuid`, JSON.stringify(made));
    await ctx.setOffline(false);
    const want = [['rbi_tasks', OLD], ['rbi_tasks', made.task], ['construction_defects_v2', made.constructionDefects],
      ['construction_units_v2', made.constructionUnits], ['construction_acceptance_v2', made.constructionAcceptance]];
    for (let i = 0; i < 10 && !want.every(([t, id]) => sendsAll.get(`${t}:${id}`)); i++) {
      await page.evaluate(() => window.triggerSync && window.triggerSync('manual')).catch(() => {});
      await page.waitForTimeout(4000);
    }
    await page.waitForTimeout(2000);
    const sent = want.map(([t, id]) => [t, sendsAll.get(`${t}:${id}`) || 0, rows.get(t) && rows.get(t).get(String(id))]);
    note('отправлено: ' + JSON.stringify(sent.map(([t, n]) => [t, n])));
    ok(sent.every(([, n]) => n >= 1), `${tag}: правка старой задачи и новые записи ушли`, JSON.stringify(sent.map(([t, n]) => t + ':' + n)));
    ok(sent.every(([, , r]) => r && !('core_id' in r)), `${tag}: строки ушли без core_id (номер ставит сервер — не затирается)`,
      JSON.stringify(sent.map(([t, , r]) => t + ':' + (r ? ('core_id' in r ? 'с core_id' : 'без') : 'нет'))));
    ok(sent[0][2] && sent[0][2].task_data && /правка/.test(JSON.stringify(sent[0][2])), `${tag}: правка старой задачи дошла`);
    const t1 = await task(page, OLD);
    ok(t1 && t1.core_id === C, `${tag}: после отправки core_id на телефоне на месте`, JSON.stringify(t1));
    await ctx.close();
  } finally { stand.quality = null; stand.serve = null; await stop().catch(() => {}); }
}

export function syncScenarios(out) {
  return { 's-module-off': () => moduleOff(out), 's-new-kind': () => newKind(out), 's-pull-scope': pullScopeScenario(out), 's-reject-retry': () => rejectRetry(out), 's-reject-retry-1440-dark': () => rejectRetry(out, 1440, 'dark'), 's-own-first': () => ownFirst(out),
    's-contractor': () => contractor(out), 's-kinds': () => kinds(out), 's-rename': () => rename(out), 's-foreign': () => foreignAndLeader(out, 's-foreign'), 's-leader': () => foreignAndLeader(out, 's-leader'),
    'q-ids': () => qualityIds(out), 'q-ids-other': () => qualityIdsOther(out) };
}
