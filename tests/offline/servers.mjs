// P2-0058: стенд «без сети» — статика приложения из этой папки (config → подставной сервер) + подставной Supabase.
// Боевой сервер не трогается: в браузере rbi-q.ru отрезан (lib.mjs). Основа — reports/P2-0058/baseline/servers.mjs.
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const APP_PORT = Number(process.env.P2_OFFLINE_APP_PORT || 8891);
const API_PORT = Number(process.env.P2_OFFLINE_API_PORT || 8892);
export const APP = 'http://localhost:' + APP_PORT;
export const API = 'http://localhost:' + API_PORT;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.map': 'application/json', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' };

/** Журнал запросов к подставному серверу и записи-метки (…-MARK), дошедшие до него. */
export const log = [];
export const marks = [];
/** Поведение сервера в сценарии: refresh — 'ok' | 'invalid_grant' (вход недействителен). */
export const mode = { refresh: 'ok' };

/** P2-0059: «погода» подставного сервера. mode: 'ok' | 'hang' (принял запрос и молчит); latencyMs + kbps — медленная сеть;
 *  failLeft — столько следующих запросов ответят failCode; drops — [{ re, left }]: запрос «МЕТОД путь» под re принят и выполнен, ответ потерян (обрыв), left раз. */
export const net = { mode: 'ok', latencyMs: 0, kbps: 0, failLeft: 0, failCode: 503, drops: [], reject: null };
/** reject — RegExp: запись осмотра с таким текстом сервер отклоняет (403, нет прав RLS). */
/** Что лежит на сервере: таблица → (id → строка); файлы хранилища «бакет/путь»; отправки rbi_inspections (id → сколько раз пришло). */
export const rows = new Map();
export const files = new Set();
export const sends = new Map();
export const flow = { inflight: 0, maxInflight: 0, hung: 0 };
const held = [];
/** Сбросить погоду и содержимое сервера перед сценарием. */
export function resetNet() {
  Object.assign(net, { mode: 'ok', latencyMs: 0, kbps: 0, failLeft: 0, failCode: 503, drops: [], reject: null });
  rows.clear(); files.clear(); sends.clear(); Object.assign(flow, { inflight: 0, maxInflight: 0, hung: 0 });
}
/** «Зависшие» запросы обрываются (связь пропала окончательно). */
export function releaseHeld() { held.splice(0).forEach((s) => s.destroy()); }
const table = (t) => { if (!rows.has(t)) rows.set(t, new Map()); return rows.get(t); };
/** Запись на сервер: строки по id (повтор — та же строка, как upsert), файлы хранилища. */
function apply(req, u, body) {
  const t = u.pathname.match(/^\/rest\/v1\/([a-z_0-9]+)$/);
  if (t && (req.method === 'POST' || req.method === 'PATCH')) {
    let data = null; try { data = JSON.parse(body || 'null'); } catch { /* не JSON */ }
    for (const r of [].concat(data || [])) if (r && r.id !== undefined) table(t[1]).set(String(r.id), r);
    return;
  }
  const f = u.pathname.match(/^\/storage\/v1\/object\/(?!list\/|sign\/|public\/)(.+)$/);
  if (f && (req.method === 'POST' || req.method === 'PUT')) files.add(decodeURIComponent(f[1]));
}

export const COMPANY = { id: '11111111-2222-3333-4444-555555555555', name: 'Тест-Строй', is_test: true, roles: ['Руководство'], modules: ['quality', 'construction', 'planfact'], can_manage_company: true };
export const USER = { id: 'u-1', email: 'test@stand.local', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
export const USER2 = { ...USER, id: 'u-2', email: 'other@stand.local' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function session(user, ttl = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  return { access_token: b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp }) + '.sig',
    token_type: 'bearer', expires_in: ttl, expires_at: exp, refresh_token: 'rt-' + user.id + '-' + exp, user };
}
/** P2-0060: второму пользователю стенда тоже дать компанию (План/Факт), его Сводка — с ошибкой сервера (копии у него нет). */
export const stand = { user2Planfact: false, quality: null };
const hasPf = (u) => u.id === USER.id || stand.user2Planfact;
/** P2-0060: Сводка План/Факта первого пользователя (один объект) — по ней стенд сверяет цифры с сетью и без сети. */
export const SUMMARY = { project_id: 'p-1', name: 'ЖК Тестовый', code: 'ЖКТ', planned_start: '2026-06-01', planned_finish: '2027-03-31',
  can_money: true, can_manage: true, has_kp: true, plan_money: 1000000, done_money: 425000, issued_money: 300000, gap_money: 125000, pct_money: 42.5,
  pace7: 1.2, pace14: 1.1, need_pace: 1.4, days_left: 153, forecast_finish: '2027-05-10', light: 'yellow', light_reason: 'lag_yellow',
  unpriced_rows: 0, positions: 10, pending: 0, plan_pct_today: 50, lag_pp: 7.5, lag_days: 12, pace_verdict: 'steady', work_days_left: 105,
  light_yellow_pp: 5, light_red_pp: 15, light_overdue_days: 3, can_thresholds: true };
const ATTENTION = { stale_days: 7, counts: { no_kp: false, no_dates: false, gap_rows: 0, gap_money: 0, unpriced_rows: 0, stale_positions: 0, pending_entries: 0 },
  gap: [], unpriced: [], stale: [], completeness: { rows_total: 10, rows_priced: 10, priced_pct: 100, dates_pct: 100, positions_total: 10, positions_placed: 10, placed_pct: 100 } };
/** P2-0060: ВОР, факт и места объекта p-1 (корпус → секция → 3 этажа) — для «заранее» и просмотра без сети. */
const LOC = (id, parent, type, name, depth, kids, path) => ({ id, parent_id: parent, node_type: type, name, sort_order: 1, area: null, depth, path: path || name, child_count: kids });
const LOCATIONS = { '': [LOC('b-1', null, 'building', 'Корпус 1', 0, 1)], 'b-1': [LOC('s-1', 'b-1', 'section', 'Секция 1', 1, 3, 'Корпус 1 · Секция 1')],
  's-1': [1, 2, 3].map((n) => LOC('f-' + n, 's-1', 'floor', 'Этаж ' + n, 2, 0, 'Корпус 1 · Секция 1 · Этаж ' + n)) };
export const POSITIONS = [1, 2, 3].map((n) => ({ position_id: 'pos-' + n, location_id: 'f-' + n, location_path: 'Корпус 1 · Секция 1 · Этаж ' + n, location_type: 'floor',
  work_type_id: 'wt-1', work_name: 'Кладка стен', unit_code: 'м³', plan_qty: 40, fact_qty: n * 7, pending_qty: 0, pending_count: 0, last_rejected_note: null }));
const VOR_POSITIONS = POSITIONS.map((p) => ({ id: p.position_id, location_id: p.location_id, location_path: p.location_path, work_type_id: 'wt-1', work_type: 'Кладка стен',
  unit_code: 'м³', qty: 40, apartments_note: null, import_id: 'imp-1', file_name: 'ВОР корпус 1.xlsx', source_row_no: 3, revision_no: 1 }));
const IMPORTS = [{ id: 'imp-1', file_name: 'ВОР корпус 1.xlsx', sheet_name: 'Лист1', status: 'confirmed', row_count: 12, works: 1, positions: 3,
  created_at: '2026-10-01T10:00:00Z', created_by_email: 'test@stand.local', confirmed_at: '2026-10-01T11:00:00Z', profile_id: null, revision_no: 1,
  previous_import_id: null, root_import_id: 'imp-1', is_current: true, confirmed_by_email: 'test@stand.local' }];
const ACCESS = { actions: ['quality.manage', 'quality.edit', 'quality.view', 'construction.manage', 'construction.view', 'construction.edit'], templates: [], projects: null, contractor: null, objects: null, container: null };
const RPC = {
  pf_my_platform: (u) => ({ is_platform_admin: false, companies: hasPf(u) ? [COMPANY] : [] }),
  pf_my_profile: (u) => ({ full_name: u.id === USER.id ? 'Иванов Иван' : 'Петров Пётр', must_change_password: false, user_id: u.id }),
  pf_company_projects: () => [{ id: 'p-1', name: 'ЖК Тестовый', archived_at: null }],
  pf_my_projects: (u) => (hasPf(u) ? [{ id: 'p-1', name: 'ЖК Тестовый', company_id: COMPANY.id, archived_at: null }] : []),
  pf_my_permissions: (u) => (u.id === USER.id ? ['planfact.fact.view', 'planfact.fact.create', 'planfact.vor.manage'] : []),
  pf_my_area: () => ({ full: true, locations: [], fact_owner: [], can_on_behalf: false }),
  pf_vor_list_imports: () => IMPORTS,
  pf_vor_positions: () => VOR_POSITIONS,
  pf_vor_list_profiles: () => [],
  pf_fact_positions: (u, a) => POSITIONS.filter((p) => !a.p_location || p.location_id === a.p_location),
  pf_fact_pending: () => [],
  pf_summary_positions: () => POSITIONS.map((p) => ({ position_id: p.position_id, location_id: p.location_id, location_path: p.location_path, work_type_id: 'wt-1',
    work_name: 'Кладка стен', unit_code: 'м³', plan_qty: 40, fact_qty: p.fact_qty, pct: (p.fact_qty / 40) * 100, rest_qty: 40 - p.fact_qty, fact7: 0, fact14: 0,
    pending_qty: 0, forecast_finish: null, delta_days: null, plan_pct_today: 50, dev_pp: null })),
  pf_brigade_list: () => [{ id: 'br-1', name: 'Бригада Иванова', leader_name: 'Иванов', phone: null, archived_at: null, can_manage: true }],
  pf_list_locations: (u, a) => LOCATIONS[a.p_parent || ''] || [],
  pf_my_admin_companies: (u) => (u.id === USER.id ? [{ company_id: COMPANY.id, company_name: COMPANY.name }] : []),
  pf_project_catalog: () => [{ id: 'p-1', name: 'ЖК Тестовый', code: 'ЖКТ', archived_at: null, created_at: '2026-06-01T00:00:00Z', can_manage: true,
    division_id: null, division_name: null, address: 'Москва', planned_start: '2026-06-01', planned_finish: '2027-03-31', manager_user_id: null, manager_name: null,
    stage: 'construction', our_role: null, timezone: 'Europe/Moscow', country: 'RU' }],
  my_access: () => stand.quality || ACCESS,   // P2-0060: роль экрана Качества сценария (прораб / руководитель)
  // P2-0060: доступ к компании для План/Факта (подвкладки раздела) — по модулям компании на сервере стенда
  pf_my_company_access: (u) => hasPf(u) && COMPANY.modules.includes('planfact') ? [{ company_id: COMPANY.id, company_name: COMPANY.name,
    can_manage_projects: true, can_manage_units: true, can_manage_roles: true, can_manage_counterparties: true }] : [],
  pf_my_context: (u) => hasPf(u) ? [{ company_name: COMPANY.name, role_name: COMPANY.roles[0], project_id: null }] : [],
  pf_summary_portfolio: (u) => (u.id === USER.id ? [SUMMARY] : { __status: 500 }),
  pf_summary_attention: () => ATTENTION,
  pf_summary_worktypes: () => [{ work_type_id: 'wt-1', work_name: 'Кладка стен', units: [{ unit: 'м³', plan: 120, fact: 51, pct: 42.5, rest: 69, fact7: 6, fact14: 11, pending: 0,
    forecast_finish: '2027-05-10', delta_days: 40, dev_pp: -7.5 }], positions: 10, plan_money: 1000000, done_money: 425000, pct_money: 42.5, unpriced_rows: 0, plan_pct_today: 50 }]
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'content-range, x-total-count');
}
const json = (res, code, body, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...extra }); res.end(JSON.stringify(body)); };
function who(req, body) {
  const tok = String(req.headers.authorization || '').replace(/^Bearer /, '');
  try { const p = JSON.parse(Buffer.from(tok.split('.')[1] || '', 'base64url').toString()); if (p.sub === USER2.id) return USER2; } catch { /* anon */ }
  if (/other@stand\.local|rt-u-2-/.test(body)) return USER2;
  return USER;
}

function api(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const u = new URL(req.url, API);
    log.push(req.method + ' ' + u.pathname + u.search.slice(0, 60));
    if (net.mode === 'hang') { flow.hung++; held.push(req.socket); return; }
    if (net.failLeft > 0) { net.failLeft--; return json(res, net.failCode, { message: 'Service Unavailable', code: String(net.failCode) }); }
    const isInsp = req.method === 'POST' && u.pathname === '/rest/v1/rbi_inspections';
    if (isInsp) { flow.inflight++; flow.maxInflight = Math.max(flow.maxInflight, flow.inflight); res.on('close', () => { flow.inflight--; }); }
    const wait = net.latencyMs + (net.kbps ? Math.round(Buffer.byteLength(body) * 8 / net.kbps) : 0);
    const go = () => respond(req, res, u, body);
    if (wait > 0) setTimeout(go, wait); else go();
  });
}

function respond(req, res, u, body) {
  {
    const mk = body.match(/[A-Z]+-MARK/g); if (mk && req.method !== 'GET') marks.push(req.method + ' ' + u.pathname + ' ' + [...new Set(mk)].join(','));
    if (net.reject && req.method === 'POST' && u.pathname === '/rest/v1/rbi_inspections' && net.reject.test(body)) {
      flow.rejected = (flow.rejected || 0) + 1;
      return json(res, 403, { code: '42501', message: 'new row violates row-level security policy for table "rbi_inspections"' });
    }
    if (req.method === 'POST' && u.pathname === '/rest/v1/rbi_inspections') {
      let data = []; try { data = [].concat(JSON.parse(body || '[]')); } catch { /* не JSON */ }
      for (const r of data) if (r && r.id !== undefined) sends.set(String(r.id), (sends.get(String(r.id)) || 0) + 1);
    }
    apply(req, u, body);
    const drop = net.drops.find((d) => d.left > 0 && d.re.test(req.method + ' ' + u.pathname));
    if (drop) { drop.left--; return req.socket.destroy(); }
    const user = who(req, body);
    if (u.pathname === '/auth/v1/token') {
      if (u.searchParams.get('grant_type') === 'refresh_token' && mode.refresh === 'invalid_grant') {
        return json(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found', error: 'invalid_grant' });
      }
      return json(res, 200, session(user));
    }
    if (u.pathname === '/auth/v1/user') return json(res, 200, user);
    if (u.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
    const m = u.pathname.match(/^\/rest\/v1\/rpc\/([a-z_0-9]+)/);
    if (m) { let a = {}; try { a = JSON.parse(body || '{}') || {}; } catch { /* не JSON */ } const v = RPC[m[1]] ? RPC[m[1]](user, a) : null; return v && v.__status ? json(res, v.__status, { message: 'Internal error' }) : json(res, 200, v); }
    if (u.pathname.startsWith('/rest/v1/')) {
      if (req.method === 'GET' || req.method === 'HEAD') return json(res, 200, [], { 'Content-Range': '*/0' });
      return json(res, 201, []);
    }
    const ls = u.pathname.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
    if (ls) {
      let q = {}; try { q = JSON.parse(body || '{}'); } catch { /* пусто */ }
      const dir = ls[1] + '/' + String(q.prefix || '').replace(/\/$/, '') + '/';
      const found = [...files].filter((f) => f.startsWith(dir) && !f.slice(dir.length).includes('/') && f.slice(dir.length).includes(String(q.search || '')));
      return json(res, 200, found.map((f) => ({ name: f.slice(dir.length), id: f, metadata: { size: 1 } })));
    }
    if (u.pathname.startsWith('/storage/v1/object/') && (req.method === 'POST' || req.method === 'PUT')) return json(res, 200, { Key: u.pathname.slice(19), Id: 'f' });
    // P2-0060: фото по публичной ссылке — маленькая картинка (докачка фото «заранее»; запросы видны в журнале)
    if (req.method === 'GET' && u.pathname.startsWith('/storage/v1/object/public/')) { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(Buffer.alloc(2048, 7)); }
    if (u.pathname.startsWith('/storage/v1/')) return json(res, 200, []);
    json(res, 404, { message: 'not found' });
  }
}

/** P2-0066: «выкладка» на стенде — откуда отдавать файлы приложения. root — папка версии (по умолчанию эта папка);
 *  pick(путь) → папка (выкладка в процессе: часть файлов старая, часть новая); fail — RegExp: такие файлы отвечают 503 (сбой связи);
 *  requests — журнал запросов к файлам приложения. */
export const site = { root: ROOT, pick: null, fail: null, requests: [] };
export function resetSite() { Object.assign(site, { root: ROOT, pick: null, fail: null }); site.requests.length = 0; }

async function app(req, res) {
  const u = new URL(req.url, APP);
  let p = normalize(decodeURIComponent(u.pathname));
  if (p.endsWith('/')) p += 'index.html';
  site.requests.push(p);
  if (site.fail && site.fail.test(p)) { res.writeHead(503); return res.end('unavailable'); }
  if (/\/\./.test(p)) { res.writeHead(404); return res.end('not found'); }   // как боевой nginx: скрытые файлы (.nojekyll, .git) не отдаются
  const base = (site.pick && site.pick(p)) || site.root;
  const f = join(base, p);
  if (!f.startsWith(base)) { res.writeHead(403); return res.end(); }
  try {
    if (!(await stat(f)).isFile()) throw new Error('dir');
    let data = await readFile(f);
    if (p === '/js/services/config.service.js') data = standConfig(data);
    // P2-0066: в описи версии — отпечаток подменённого стендом config.service.js (иначе версия честно не ставится: «файл другой версии»)
    if (p === '/sw.js') {
      const cfg = await readFile(join(base, 'js/services/config.service.js')).catch(() => null);
      if (cfg) data = Buffer.from(data.toString('utf8').replace(/("js\/services\/config\.service\.js": \[")[0-9a-f]{16}(",)\d+/,
        (m, a, b) => a + createHash('sha256').update(standConfig(cfg)).digest('hex').slice(0, 16) + b + standConfig(cfg).length));
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

/** config.service.js стенда: адрес сервера платформы → подставной сервер. */
const standConfig = (buf) => Buffer.from(buf.toString('utf8').replace("P2_SUPABASE_URL: 'https://api.rbi-q.ru'", `P2_SUPABASE_URL: '${API}'`));

let servers = [];
export async function start() {
  servers = [http.createServer(app), http.createServer(api)];
  await Promise.all([new Promise((r) => servers[0].listen(APP_PORT, r)), new Promise((r) => servers[1].listen(API_PORT, r))]);
}
export async function stop() {
  await Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(() => r()); })));
  servers = [];
}
