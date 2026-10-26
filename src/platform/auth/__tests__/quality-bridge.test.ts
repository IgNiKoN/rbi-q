/// <reference types="node" />
/** P2-0016 этапы 3–4: мост Качества при входе почтой — цель синхронизации всегда раздел quality с компанией,
 *  объект из ядра, роль из прав компании, локальное состояние компаний не смешивается. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyQualityBridge, companyConflict, deviceUserKey, parseAccess, pinAccess, qualityCompanyFor, roleFor, switchDeviceCompany,
  QUALITY_ACCESS_EVENT, QUALITY_COMPANY_KEY, QUALITY_DROP_DB_KEY, QUALITY_LEGACY_OWNER_KEY, QUALITY_USER_KEY } from '../quality-bridge.ts';
import type { PlatformState } from '../platform.service.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
const A = '0f0e0d0c-0b0a-4908-8706-0504030201aa', B = '0f0e0d0c-0b0a-4908-8706-0504030201bb';
const P1 = '11111111-1111-4111-8111-111111111111', P2 = '22222222-2222-4222-8222-222222222222';

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
}
const st = (over: Partial<PlatformState> = {}): PlatformState => ({
  mode: 'email', email: 'tn@alfa.test', isPlatformAdmin: false, companyId: A,
  companies: [{ id: A, name: 'Альфа', is_test: true, roles: [], modules: ['planfact', 'quality'], can_manage_company: false },
              { id: B, name: 'Бета', is_test: true, roles: [], modules: ['planfact'], can_manage_company: false }], ...over
});

test('компания Качества: только вход почтой и модуль quality/construction у текущей компании', () => {
  assert.equal(qualityCompanyFor(st()), A);
  assert.equal(qualityCompanyFor(st({ companyId: B })), null, 'у Беты модуля нет');
  assert.equal(qualityCompanyFor(st({ mode: 'demo' })), null);
  assert.equal(qualityCompanyFor(st({ mode: 'pin' })), null);
  assert.equal(qualityCompanyFor(st({ mode: 'none', companyId: null })), null);
});

test('роль экрана Качества — из прав компании (020): та же область, что у сервера, или шире', () => {
  assert.equal(roleFor(['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.company']), 'manager');
  assert.equal(roleFor(['quality.view', 'quality.edit', 'construction.view', 'construction.edit']), 'engineer');
  assert.equal(roleFor(['quality.view', 'construction.view', 'construction.edit', 'quality.scope.contractor']), 'contractor');
  assert.equal(roleFor(['quality.view', 'construction.view', 'quality.scope.company']), 'director', 'Руководство');
  assert.equal(roleFor(['quality.view', 'construction.view']), 'director', 'РП / Прораб / ПТО / Заказчик — только просмотр');
  assert.equal(roleFor(['quality.view', 'quality.edit', 'quality.manage', 'quality.scope.contractor']), 'manager', 'manage важнее фирмы');
  assert.equal(roleFor([]), 'guest');
});

test('доступ из my_access: объекты (null — вся компания) и фирма подрядчика', () => {
  assert.deepEqual(parseAccess({ actions: ['quality.view'], templates: ['pto'], projects: [P1], contractor: null }),
    { actions: ['quality.view'], templates: ['pto'], projects: [P1], contractor: '', objects: null, container: null });
  assert.deepEqual(parseAccess({ actions: [], projects: null, contractor: { id: 'k', name: 'ООО «Альфа-Строй»', keys: [] } }),
    { actions: [], templates: [], projects: null, contractor: 'ООО «Альфа-Строй»', objects: null, container: null });
  assert.deepEqual(parseAccess(null), { actions: [], templates: [], projects: null, contractor: '', objects: null, container: null });
  assert.deepEqual(parseAccess({ actions: [], objects: [{ id: 'obj_1', key: 'большевиков,22 (гений)', name: 'Большевиков,22 (Гений)' }, { id: 'x' }] }).objects,
    ['большевиков,22 (гений)'], 'P2-0033: ключи закреплённых объектов Качества');
  assert.deepEqual(parseAccess({ actions: [], objects: [] }).objects, [], 'пустой список — не «все»');
});

test('мост: подрядчик — фирма в настройках экрана, объекты экрану не передаются; список объектов — только свои', async () => {
  const { d, win } = deps({ projects: [{ id: P1, name: 'Спутник' }, { id: P2, name: 'Второй' }],
    access: { actions: ['quality.view', 'construction.view', 'construction.edit', 'quality.scope.contractor'], templates: ['contractor_rep'],
      projects: [P2], contractor: { name: 'ООО «Альфа-Строй»' } } });
  win.appSettings.assignedProjects = ['старый'];
  const sync = await applyQualityBridge(st(), d);
  assert.deepEqual(sync!.projects.map((p) => p.id), [P2]);
  assert.equal(sync!.projectId, P2, 'один свой объект — выбран сам');
  assert.equal(win.appSettings.userRole, 'contractor');
  assert.equal(win.appSettings.contractorName, 'ООО «Альфа-Строй»');
  assert.equal(win.appSettings.assignedContractor, 'ООО «Альфа-Строй»');
  assert.deepEqual(win.appSettings.assignedProjects, []);
});

test('P2-0033: инженер с закреплёнными объектами — экран получает их ключи (assignedProjects), роль «Инженер СК»', async () => {
  const { d, win } = deps({ access: { actions: ['quality.view', 'quality.edit', 'construction.view', 'construction.edit'], templates: [],
    objects: [{ id: 'obj_1', key: 'большевиков,22 (гений)', name: 'Большевиков,22 (Гений)' }] } });
  win.appSettings.assignedProjects = ['старый'];
  await applyQualityBridge(st(), d);
  assert.equal(win.appSettings.userRole, 'engineer');
  assert.deepEqual(win.appSettings.assignedProjects, ['большевиков,22 (гений)']);
  assert.deepEqual(win.appSettings.assigned_projects, ['большевиков,22 (гений)']);
  win.appSettings.assignedProjects = ['чужой'];
  assert.deepEqual(win.appSettings.assignedProjects, ['большевиков,22 (гений)'], 'значение держит мост');
});

test('смена компании на устройстве: состояние синхронизации откладывается и возвращается, ключи не смешиваются', () => {
  const s = memStore({ rbi_sync_config: '{"projectCode":"A-obj"}', rbi_sync_last_pull_at: 't-A', rbi_theme_preference: 'dark' });
  s.setItem(QUALITY_COMPANY_KEY, A);
  assert.equal(switchDeviceCompany(s, A), false, 'та же компания — без перезагрузки');
  assert.equal(switchDeviceCompany(s, B), true);
  assert.equal(s.getItem(QUALITY_COMPANY_KEY), B);
  assert.equal(s.getItem('rbi_sync_config'), null, 'у Беты своё (пустое) состояние');
  assert.equal(s.getItem('rbi_theme_preference'), 'dark', 'общие настройки устройства не трогаются');
  s.setItem('rbi_sync_last_pull_at', 't-B');
  assert.equal(switchDeviceCompany(s, null), true, 'выход — без компании');
  assert.equal(s.getItem(QUALITY_COMPANY_KEY), null);
  assert.equal(s.getItem('rbi_sync_last_pull_at'), null);
  switchDeviceCompany(s, A);
  assert.equal(s.getItem('rbi_sync_config'), '{"projectCode":"A-obj"}');
  assert.equal(s.getItem('rbi_sync_last_pull_at'), 't-A');
  switchDeviceCompany(s, B);
  assert.equal(s.getItem('rbi_sync_last_pull_at'), 't-B');
});

function deps(over: N = {}) {
  const created: N[] = [];
  const rpcCalls: N[] = [];
  const platformAuth = { getSession: async () => ({ data: { session: { access_token: 'TOKEN-1' } } }), getUser: async () => ({}) };
  const win: N = { appSettings: {}, syncConfig: { enabled: false }, RBI: {}, initSync: async () => { win.inits = (win.inits || 0) + 1; } };
  const store = memStore({ [QUALITY_COMPANY_KEY]: A, [QUALITY_USER_KEY]: deviceUserKey('tn@alfa.test'), ...(over.store || {}) });
  let reloads = 0;
  const d: N = {
    win, store, reload: () => { reloads++; },
    platformClient: { auth: platformAuth },
    cfg: { url: 'https://srv', anonKey: 'anon' },
    createClient: (url: string, key: string, opts: N) => {
      const c = { url, key, opts, from: (t: string) => ({ table: t, schema: opts.db.schema }),
        rpc: async (fn: string, args: N) => { rpcCalls.push({ fn, args }); return { data: over.access || { actions: ['quality.view', 'quality.edit'], templates: ['qc_engineer'] }, error: null }; } };
      created.push(c); return c;
    },
    listProjects: async () => over.projects || [{ id: P1, name: 'Спутник' }],
    ...over.deps
  };
  return { d, win, store, created, rpcCalls, reloads: () => reloads };
}

test('P2-0035: контейнер компании из my_access — Качество в нём, без выбора объекта; список объектов ядра не нужен', async () => {
  const C = '33333333-3333-4333-8333-333333333333';
  let listed = 0;
  const { d, win } = deps({ access: { actions: ['quality.view'], templates: [], container: C },
    projects: [{ id: P1, name: 'ЖК Север' }, { id: '44444444-4444-4444-8444-444444444444', name: 'ЖК Юг' }],
    deps: { listProjects: async () => { listed++; return [{ id: P1, name: 'ЖК Север' }]; } } });
  const sync = await applyQualityBridge(st(), d);
  assert.equal(sync!.projectId, C);
  assert.equal(win.syncConfig.projectCode, C);
  assert.deepEqual(sync!.projects.map((p) => p.id), [C]);
  assert.equal(listed, 0);
  assert.equal(parseAccess({ container: '' }).container, null);
});

test('мост: клиент синхронизации — раздел quality, заголовок компании, токен платформы; .auth — Auth платформы', async () => {
  const { d, win, created } = deps();
  const sync = await applyQualityBridge(st(), d);
  assert.ok(sync);
  assert.equal(created.length, 1);
  const o = created[0].opts;
  assert.equal(o.db.schema, 'quality');
  assert.deepEqual(o.global.headers, { 'x-company-id': A });
  assert.equal(await o.accessToken(), 'TOKEN-1');
  assert.equal(win.supabaseClient.from('rbi_inspections').schema, 'quality', 'любая таблица — в quality, не в public');
  assert.equal(win.supabaseClient.auth, d.platformClient.auth);
});

test('мост: один объект — выбран сам; код проекта = id объекта ядра, имя инженера = почта, PIN нет; роль из прав', async () => {
  const { d, win, store, rpcCalls } = deps();
  const sync = await applyQualityBridge(st(), d);
  assert.equal(sync!.projectId, P1);
  assert.equal(win.syncConfig.enabled, true);
  assert.equal(win.syncConfig.projectCode, P1);
  assert.equal(win.syncConfig.engineerName, 'tn@alfa.test');
  assert.equal(win.syncConfig.pinHash, null);
  assert.equal(JSON.parse(store.getItem('rbi_sync_config')!).projectCode, P1);
  assert.deepEqual(rpcCalls.map((c) => c.args.p_project), [null, P1], 'сначала область объектов, затем права на выбранном объекте');
  assert.equal(win.appSettings.userRole, 'engineer');
  assert.equal(win.appSettings.cloudStatus, 'approved');
  assert.equal(win.inits, 1);
});

test('мост: несколько объектов — синхронизация ждёт выбора; выбор чужого id игнорируется; выбор своего — через прежнее подключение без PIN', async () => {
  const { d, win } = deps({ projects: [{ id: P1, name: 'Спутник' }, { id: P2, name: 'Второй' }] });
  const calls: N[] = [];
  win.applySyncConnect = async (name: string, code: string, pin: N) => { calls.push([name, code, pin]); };
  const sync = await applyQualityBridge(st(), d);
  assert.equal(sync!.projectId, null);
  assert.equal(win.syncConfig.enabled, false);
  await sync!.selectProject('чужой');
  assert.deepEqual(calls, []);
  await sync!.selectProject(P2);
  assert.deepEqual(calls, [['tn@alfa.test', P2, null]]);
  assert.equal(d.store.getItem('platform2_quality_project_' + A), P2);
});

test('мост: смена компании / выход — перезагрузка (своя база компании); вход без модуля — Качества нет', async () => {
  const x = deps();
  assert.equal(await applyQualityBridge(st({ companyId: B }), x.d), null);
  assert.equal(x.reloads(), 1, 'Бета без модуля: база устройства — общая, перезагрузка');
  const y = deps();
  assert.equal(await applyQualityBridge({ ...st(), mode: 'none', email: null, companies: [], companyId: null }, y.d), null);
  assert.equal(y.reloads(), 1, 'выход: данные компании не остаются открытыми');
  const z = deps();
  z.store.removeItem(QUALITY_COMPANY_KEY);
  assert.equal(await applyQualityBridge({ ...st(), mode: 'demo', email: null, companies: [], companyId: null }, z.d), null);
  assert.equal(z.reloads(), 0, 'демо без прежней компании — без перезагрузки');
  assert.equal(z.created.length, 0, 'клиент хранилища не создаётся');
});

// --- этап 5: файлы компании ---
import { companyStorage, companyPath, companyBucket } from '../quality-bridge.ts';

test('файлы: бакет РБИ → закрытый бакет компании, путь всегда с id компании (без удвоения)', async () => {
  assert.equal(companyBucket('inspection-photos'), 'quality-inspection-photos');
  assert.equal(companyBucket('quality-reports'), 'quality-reports');
  assert.equal(companyPath(A, 'P/inspection/1/a.jpg'), A + '/P/inspection/1/a.jpg');
  assert.equal(companyPath(A, A + '/x.jpg'), A + '/x.jpg');
  assert.equal(companyPath(A, '/x.jpg'), A + '/x.jpg');
  const calls: N[] = [];
  const raw = { from: (b: string) => {
    const api: N = { bucket: b };
    for (const m of ['upload', 'getPublicUrl', 'list', 'remove', 'move', 'download', 'createSignedUrls']) api[m] = function (this: N, ...args: N[]) { calls.push([this.bucket, m, args]); return m; };
    return api;
  } };
  const st = companyStorage(raw as N, A);
  st.from('inspection-photos').upload('P/1.jpg', 'BLOB', { upsert: true });
  st.from('reports').getPublicUrl('r1.pdf');
  st.from('inspection-photos').list('P', { search: 'x' });
  st.from('inspection-photos').remove(['P/1.jpg', A + '/P/2.jpg']);
  st.from('library-docs').move('a', 'b');
  assert.deepEqual(calls, [
    ['quality-inspection-photos', 'upload', [A + '/P/1.jpg', 'BLOB', { upsert: true }]],
    ['quality-reports', 'getPublicUrl', [A + '/r1.pdf']],
    ['quality-inspection-photos', 'list', [A + '/P', { search: 'x' }]],
    ['quality-inspection-photos', 'remove', [[A + '/P/1.jpg', A + '/P/2.jpg']]],
    ['quality-library-docs', 'move', [A + '/a', A + '/b']]
  ]);
});

test('файлы: клиент моста отдаёт обёрнутый Storage; токен — кэшу приложения (сразу и по запросу)', async () => {
  const { d, win } = deps();
  const posted: N[] = [];
  let onMsg: ((e: N) => void) | null = null;
  d.serviceWorker = { controller: { postMessage: (m: N) => posted.push(m) }, addEventListener: (_t: string, cb: N) => { onMsg = cb; } };
  d.platformClient.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } });
  d.createClient = (url: string, key: string, opts: N) => ({ opts, rpc: async () => ({ data: {}, error: null }),
    storage: { from: (b: string) => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `${url}/storage/v1/object/public/${b}/${p}` } }) }) } });
  await applyQualityBridge(st(), d);
  assert.equal(win.supabaseClient.storage.from('inspection-photos').getPublicUrl('P/a.jpg').data.publicUrl,
    `https://srv/storage/v1/object/public/quality-inspection-photos/${A}/P/a.jpg`);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(posted, [{ type: 'P2_STORAGE_TOKEN', token: 'TOKEN-1' }]);
  onMsg!({ data: { type: 'P2_STORAGE_TOKEN_REQUEST' } });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(posted.length, 2);
});

test('ключи по компании (021): цель upsert старого клиента дополняется core_company_id, прочее — без изменений', async () => {
  assert.equal(companyConflict('id'), 'core_company_id,id');
  assert.equal(companyConflict('project_code, raw_name'), 'core_company_id,project_code,raw_name');
  assert.equal(companyConflict('core_company_id,id'), 'core_company_id,id');
  assert.equal(companyConflict(undefined), undefined);
  const { d, win } = deps();
  const calls: N[] = [];
  d.createClient = (_u: string, _k: string, opts: N) => ({ opts, rpc: async () => ({ data: {}, error: null }), storage: { from: () => ({}) },
    from: (t: string) => ({ t, schema: 'quality', upsert: (v: N, o: N) => { calls.push({ t, v, o }); return 'q'; }, select: () => 'sel' }) });
  await applyQualityBridge(st(), d);
  assert.equal(win.supabaseClient.from('rbi_inspections').upsert([{ id: 'x' }], { onConflict: 'id', ignoreDuplicates: false }), 'q');
  win.supabaseClient.from('project_settings').upsert({ project_code: P1 }, { onConflict: 'project_code' });
  win.supabaseClient.from('rbi_tasks').upsert([{ id: 'y' }]);
  assert.deepEqual(calls.map((c) => [c.t, c.o]), [['rbi_inspections', { onConflict: 'core_company_id,id', ignoreDuplicates: false }],
    ['project_settings', { onConflict: 'core_company_id,project_code' }], ['rbi_tasks', undefined]]);
  assert.equal(win.supabaseClient.from('rbi_tasks').select(), 'sel');
});

test('поля доступа экрана — из моста: загрузка старых настроек устройства (Object.assign) их не перетирает', async () => {
  const set: N = { theme: 'x' };
  pinAccess(set, { userRole: 'director', contractorName: '' });
  Object.assign(set, { userRole: 'manager', contractorName: 'Чужая фирма', theme: 'y' });
  assert.equal(set.userRole, 'director');
  assert.equal(set.contractorName, '');
  assert.equal(set.theme, 'y', 'прочие настройки — как обычно');
  assert.equal(JSON.parse(JSON.stringify(set)).userRole, 'director', 'сохраняется значение моста');
  pinAccess(set, { userRole: 'engineer' });
  assert.equal(set.userRole, 'engineer', 'мост обновляет при смене объекта');
  const { d, win } = deps({ access: { actions: ['quality.view'], templates: [] } });
  win.appSettings.userRole = 'manager';
  await applyQualityBridge(st(), d);
  Object.assign(win.appSettings, { userRole: 'manager', assignedProjects: ['старый'] });
  assert.equal(win.appSettings.userRole, 'director');
  assert.deepEqual(win.appSettings.assignedProjects, []);
});

test('режим обмена: Админ и Директор — «Вся команда» (full), инженер — как выбрал (по умолчанию «Только мои»)', async () => {
  const one = async (actions: string[]) => { const { d, win, store } = deps({ access: { actions, templates: [] } }); await applyQualityBridge(st(), d);
    return [win.syncConfig.syncMode, JSON.parse(store.getItem('rbi_sync_config')!).syncMode]; };
  assert.deepEqual(await one(['quality.view']), ['full', 'full']);
  assert.deepEqual(await one(['quality.view', 'quality.manage']), ['full', 'full']);
  assert.deepEqual(await one(['quality.view', 'quality.edit']), ['personal', 'personal']);
});

test('своя локальная база у каждого пользователя компании (P2-0018): ключ без почты, смена пользователя — перезагрузка', () => {
  const ua = deviceUserKey('tn@alfa.test'), ub = deviceUserKey('Other@Alfa.test ');
  assert.match(ua, /^[0-9a-f]{16}$/);
  assert.equal(deviceUserKey(' TN@alfa.test'), ua, 'регистр и пробелы не важны');
  assert.notEqual(ua, ub);
  const s = memStore({ [QUALITY_COMPANY_KEY]: A, [QUALITY_USER_KEY]: ua, rbi_sync_last_pull_at: 'T-a' });
  assert.equal(switchDeviceCompany(s, A, ua), false);
  assert.equal(switchDeviceCompany(s, A, ub), true, 'другой пользователь той же компании');
  assert.equal(s.getItem(QUALITY_USER_KEY), ub);
  assert.equal(s.getItem('rbi_sync_last_pull_at'), null, 'состояние синхронизации прошлого пользователя не переносится');
  switchDeviceCompany(s, A, ua);
  assert.equal(s.getItem('rbi_sync_last_pull_at'), 'T-a', 'своё состояние вернулось');
  assert.equal(switchDeviceCompany(s, null), true);
  assert.equal(s.getItem(QUALITY_USER_KEY), null);
});

test('старая общая база компании: без неотправленного — удаляется после перезагрузки; с неотправленным — остаётся первому, пока не отправит', async () => {
  const ua = deviceUserKey('tn@alfa.test'), ub = deviceUserKey('other@alfa.test');
  const clean = memStore({ [QUALITY_COMPANY_KEY]: A, rbi_sync_last_pull_at: 'T-old' });
  assert.equal(switchDeviceCompany(clean, A, ua), true);
  assert.equal(clean.getItem(QUALITY_DROP_DB_KEY), A);
  assert.equal(clean.getItem('rbi_sync_last_pull_at'), null, 'новая база — полная загрузка');
  // после перезагрузки мост удаляет старую базу
  const { d } = deps({ store: { [QUALITY_DROP_DB_KEY]: A } });
  const dropped: string[] = [];
  d.dropDatabase = (n: string) => dropped.push(n);
  await applyQualityBridge(st(), d);
  assert.deepEqual(dropped, ['PLATFORM2_DB_' + A]);
  assert.equal(d.store.getItem(QUALITY_DROP_DB_KEY), null);

  const dirty = memStore({ [QUALITY_COMPANY_KEY]: A, rbi_cloud_dirty: '1' });
  assert.equal(switchDeviceCompany(dirty, A, ua), false, 'есть неотправленное — работаем в старой базе');
  assert.equal(dirty.getItem(QUALITY_LEGACY_OWNER_KEY), ua);
  assert.equal(switchDeviceCompany(dirty, A, ub), true, 'другой пользователь — в свою базу, старую не трогаем');
  assert.equal(dirty.getItem(QUALITY_DROP_DB_KEY), null);
  const sent = memStore({ [QUALITY_COMPANY_KEY]: A, [QUALITY_LEGACY_OWNER_KEY]: ua });
  assert.equal(switchDeviceCompany(sent, A, ua), true, 'отправил — переходим в свою базу');
  assert.equal(sent.getItem(QUALITY_DROP_DB_KEY), A);
});

test('P2-0028: имя инженера в Качестве — ФИО учётки; ФИО сменили — новые записи подписываются новым ФИО без перезагрузки', async () => {
  const { d, win, store } = deps();
  const sync = await applyQualityBridge({ ...st(), fullName: 'Иванов А.И.' }, d);
  assert.equal(win.syncConfig.engineerName, 'Иванов А.И.');
  assert.equal(win.appSettings.engineerName, 'Иванов А.И.');
  assert.equal(sync!.engineerName, 'Иванов А.И.');
  const again = await applyQualityBridge({ ...st(), fullName: 'Иванов Алексей Игоревич' }, d);
  assert.equal(again, sync, 'тот же мост');
  assert.equal(win.syncConfig.engineerName, 'Иванов Алексей Игоревич');
  assert.equal(JSON.parse(store.getItem('rbi_sync_config')!).engineerName, 'Иванов Алексей Игоревич');
  assert.equal(win.appSettings.engineerName, 'Иванов Алексей Игоревич');
});

test('P2-0037: права компании пришли — событие для Настроек («Админ Качества» без PIN); права — с сервера, как есть', async () => {
  const { d, win } = deps({ access: { actions: ['quality.view', 'quality.edit', 'quality.manage', 'quality.objects.manage'], templates: [] } });
  const events: string[] = [];
  win.dispatchEvent = function (this: N, e: Event) { assert.equal(this, win); events.push(e.type); return true; };
  const sync = await applyQualityBridge(st(), d);
  assert.deepEqual(events, [QUALITY_ACCESS_EVENT]);
  assert.equal(QUALITY_ACCESS_EVENT, 'rbi:quality-access');
  assert.deepEqual(sync!.actions, ['quality.view', 'quality.edit', 'quality.manage', 'quality.objects.manage']);
  // окно без dispatchEvent (тесты, старые окружения) — без ошибки
  const other = deps();
  assert.ok(await applyQualityBridge(st(), other.d));
});

test('P2-0037: уборка облака администратором — файлы удаляются только в папке своей компании (чужой путь не выходит из неё)', () => {
  const calls: N[] = [];
  const raw = { from: (b: string) => ({ bucket: b, remove(this: N, paths: string[]) { calls.push([this.bucket, paths]); return 'remove'; } }) };
  const s = companyStorage(raw as N, A);
  s.from('inspection-photos').remove([B + '/P/x.jpg', 'rbi/P/y.jpg']);
  s.from('custom-assets').remove([A + '/branding/logo.png']);
  assert.deepEqual(calls, [
    ['quality-inspection-photos', [A + '/' + B + '/P/x.jpg', A + '/rbi/P/y.jpg']],
    ['quality-custom-assets', [A + '/branding/logo.png']]
  ]);
  for (const [, paths] of calls) for (const p of paths as string[]) assert.ok(p.startsWith(A + '/'), p);
});
