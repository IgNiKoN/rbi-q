// P2-0058: стенд «без сети» — статика приложения из этой папки (config → подставной сервер) + подставной Supabase.
// Боевой сервер не трогается: в браузере rbi-q.ru отрезан (lib.mjs). Основа — reports/P2-0058/baseline/servers.mjs.
import http from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
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
const ACCESS = { actions: ['quality.manage', 'quality.edit', 'quality.view', 'construction.manage', 'construction.view', 'construction.edit'], templates: [], projects: null, contractor: null, objects: null, container: null };
const RPC = {
  pf_my_platform: (u) => ({ is_platform_admin: false, companies: u.id === USER.id ? [COMPANY] : [] }),
  pf_my_profile: (u) => ({ full_name: u.id === USER.id ? 'Иванов Иван' : 'Петров Пётр', must_change_password: false, user_id: u.id }),
  pf_company_projects: () => [{ id: 'p-1', name: 'ЖК Тестовый', archived_at: null }],
  pf_my_projects: () => [{ id: 'p-1', name: 'ЖК Тестовый', company_id: COMPANY.id }],
  my_access: () => ACCESS
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
    if (m) return json(res, 200, RPC[m[1]] ? RPC[m[1]](user) : null);
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
    if (u.pathname.startsWith('/storage/v1/')) return json(res, 200, []);
    json(res, 404, { message: 'not found' });
  }
}

/** P2-0066: «выкладка» на стенде — откуда отдавать файлы приложения. root — папка версии (по умолчанию эта папка);
 *  pick(путь) → папка (выкладка в процессе: часть файлов старая, часть новая); fail — RegExp: такие файлы отвечают 503 (сбой связи);
 *  requests — журнал запросов к файлам приложения. */
export const site = { root: ROOT, pick: null, fail: null, requests: [], gzip: !!process.env.P2_OFFLINE_GZIP, gzipped: 0 };
/** P2-0067a: режим «как nginx с gzip» (site.gzip, флаг --gzip) — те же типы и порог, что в блоке app.rbi-q.ru (reports/P2-0067a/release-plan.md). */
const GZIP_TYPES = new Set(['text/html', 'text/css', 'application/javascript', 'text/javascript', 'application/json', 'application/manifest+json', 'image/svg+xml', 'text/plain']);
const GZIP_MIN = 1024;
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
    const type = MIME[extname(f)] || 'application/octet-stream';
    const head = { 'Content-Type': type, 'Cache-Control': 'no-cache' };
    if (site.gzip && GZIP_TYPES.has(type.split(';')[0])) {
      head.Vary = 'Accept-Encoding';
      if (data.length >= GZIP_MIN && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
        data = gzipSync(data, { level: 5 }); head['Content-Encoding'] = 'gzip'; site.gzipped++;
      }
    }
    res.writeHead(200, head);
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
